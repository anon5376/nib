//! Runs a beginner's program with the app's own Python and streams what happens back to the window.

use serde::{Deserialize, Serialize};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri::ipc::Channel;

const RUNNER: &str = include_str!("runner.py");
const MARK: u8 = 0x1e;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct PyError {
    pub kind: String,
    pub message: String,
    pub line: Option<u32>,
    pub text: String,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RunEvent {
    Out { text: String },
    Err { text: String },
    Input { prompt: String },
    Error(PyError),
    Exit { code: Option<i32>, millis: u64, stopped: bool },
}

/// The app's own Python, never the one on PATH, so every beginner gets the same version.
/// A release bundles python-build-standalone under resources/python; the spike borrows uv's copy
/// of the same build.
pub fn find_python(resources: Option<&Path>) -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("EDITOR_PYTHON") {
        return Some(PathBuf::from(path));
    }
    if let Some(dir) = resources {
        let bundled = dir.join("python/bin/python3");
        if bundled.exists() {
            return Some(bundled);
        }
    }
    let uv = Path::new(&std::env::var_os("HOME")?).join(".local/share/uv/python");
    let mut builds: Vec<PathBuf> = std::fs::read_dir(uv)
        .ok()?
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            let name = path.file_name().unwrap_or_default().to_string_lossy();
            name.starts_with("cpython-3.14.") && path.join("bin/python3").exists()
        })
        .collect();
    builds.sort();
    builds.pop().map(|dir| dir.join("bin/python3"))
}

pub struct Session {
    child: Arc<Mutex<Child>>,
    stdin: Mutex<Option<ChildStdin>>,
    stopped: Arc<AtomicBool>,
}

impl Session {
    pub fn send(&self, line: &str) -> io::Result<()> {
        let mut stdin = self.stdin.lock().unwrap();
        let pipe = stdin.as_mut().ok_or_else(|| io::Error::other("the program has finished"))?;
        pipe.write_all(format!("{line}\n").as_bytes())?;
        pipe.flush()
    }

    pub fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        let _ = self.child.lock().unwrap().kill();
    }
}

static RUN_COUNT: AtomicU32 = AtomicU32::new(0);

pub fn start(python: &Path, code: &str, emit: impl Fn(RunEvent) + Send + Sync + 'static) -> io::Result<Session> {
    let n = RUN_COUNT.fetch_add(1, Ordering::SeqCst);
    let dir = std::env::temp_dir().join(format!("editor-spike-{}-{n}", std::process::id()));
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join("runner.py"), RUNNER)?;
    std::fs::write(dir.join("main.py"), code)?;

    let started = Instant::now();
    let mut child = Command::new(python)
        .args(["-u", "-X", "utf8", "runner.py", "main.py"])
        .current_dir(&dir)
        .env_remove("PYTHONPATH")
        .env_remove("PYTHONHOME")
        .env_remove("PYTHONSTARTUP")
        .env("PYTHONIOENCODING", "utf-8")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let emit = Arc::new(emit);
    let stdin = child.stdin.take();
    let mut stdout = child.stdout.take().expect("piped stdout");
    let mut stderr = child.stderr.take().expect("piped stderr");
    let child = Arc::new(Mutex::new(child));
    let stopped = Arc::new(AtomicBool::new(false));

    let out = {
        let emit = emit.clone();
        std::thread::spawn(move || {
            let mut stream = Stream::default();
            let mut chunk = [0u8; 8192];
            while let Ok(n) = stdout.read(&mut chunk) {
                if n == 0 {
                    break;
                }
                stream.push(&chunk[..n]).into_iter().for_each(|event| emit(event));
            }
        })
    };
    let err = {
        let emit = emit.clone();
        std::thread::spawn(move || {
            let mut chunk = [0u8; 8192];
            while let Ok(n) = stderr.read(&mut chunk) {
                if n == 0 {
                    break;
                }
                emit(RunEvent::Err { text: String::from_utf8_lossy(&chunk[..n]).into_owned() });
            }
        })
    };
    {
        let child = child.clone();
        let stopped = stopped.clone();
        std::thread::spawn(move || {
            let _ = out.join();
            let _ = err.join();
            let code = loop {
                if let Ok(Some(status)) = child.lock().unwrap().try_wait() {
                    break status.code();
                }
                std::thread::sleep(Duration::from_millis(10));
            };
            let _ = std::fs::remove_dir_all(&dir);
            emit(RunEvent::Exit {
                code,
                millis: started.elapsed().as_millis() as u64,
                stopped: stopped.load(Ordering::SeqCst),
            });
        });
    }

    Ok(Session { child, stdin: Mutex::new(stdin), stopped })
}

/// Splits the runner's stdout into the program's text and the runner's messages, holding back
/// half a message or half a UTF-8 character until the rest arrives.
#[derive(Default)]
struct Stream {
    pending: Vec<u8>,
}

impl Stream {
    fn push(&mut self, chunk: &[u8]) -> Vec<RunEvent> {
        self.pending.extend_from_slice(chunk);
        let mut events = Vec::new();
        loop {
            match self.pending.iter().position(|&b| b == MARK) {
                Some(0) => {
                    let Some(end) = self.pending.iter().position(|&b| b == b'\n') else { break };
                    let line: Vec<u8> = self.pending.drain(..=end).collect();
                    events.extend(message(&String::from_utf8_lossy(&line[1..line.len() - 1])));
                }
                Some(at) => {
                    let text: Vec<u8> = self.pending.drain(..at).collect();
                    events.push(RunEvent::Out { text: String::from_utf8_lossy(&text).into_owned() });
                }
                None => {
                    let valid = match std::str::from_utf8(&self.pending) {
                        Ok(_) => self.pending.len(),
                        Err(e) if e.error_len().is_none() => e.valid_up_to(),
                        Err(_) => self.pending.len(),
                    };
                    if valid > 0 {
                        let text: Vec<u8> = self.pending.drain(..valid).collect();
                        events.push(RunEvent::Out { text: String::from_utf8_lossy(&text).into_owned() });
                    }
                    break;
                }
            }
        }
        events
    }
}

fn message(line: &str) -> Option<RunEvent> {
    let (kind, payload) = line.split_once(':')?;
    match kind {
        "input" => Some(RunEvent::Input { prompt: serde_json::from_str(payload).ok()? }),
        "error" => Some(RunEvent::Error(serde_json::from_str(payload).ok()?)),
        _ => None,
    }
}

#[derive(Default)]
pub struct Runs(Mutex<Option<Session>>);

fn python(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    find_python(app.path().resource_dir().ok().as_deref())
        .ok_or_else(|| "The app's Python is missing. Reinstalling the app puts it back.".into())
}

#[tauri::command]
pub fn run_code(app: tauri::AppHandle, runs: tauri::State<Runs>, code: String, on_event: Channel<RunEvent>) -> Result<(), String> {
    let python = python(&app)?;
    let mut current = runs.0.lock().unwrap();
    if let Some(previous) = current.take() {
        previous.stop();
    }
    let session = start(&python, &code, move |event| {
        let _ = on_event.send(event);
    })
    .map_err(|e| e.to_string())?;
    *current = Some(session);
    Ok(())
}

#[tauri::command]
pub fn send_input(runs: tauri::State<Runs>, text: String) -> Result<(), String> {
    let current = runs.0.lock().unwrap();
    current.as_ref().ok_or("Nothing is running.")?.send(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn stop_run(runs: tauri::State<Runs>) {
    if let Some(session) = runs.0.lock().unwrap().as_ref() {
        session.stop();
    }
}

#[tauri::command]
pub fn python_version(app: tauri::AppHandle) -> Result<String, String> {
    let output = Command::new(python(&app)?).arg("--version").output().map_err(|e| e.to_string())?;
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc::{Receiver, channel};

    fn launch(code: &str) -> (Session, Receiver<RunEvent>) {
        let (tx, rx) = channel();
        let tx = Mutex::new(tx);
        let python = find_python(None).expect("a Python 3.14 build");
        let session = start(&python, code, move |event| {
            let _ = tx.lock().unwrap().send(event);
        })
        .unwrap();
        (session, rx)
    }

    fn until_exit(rx: &Receiver<RunEvent>) -> Vec<RunEvent> {
        let mut events = Vec::new();
        loop {
            let event = rx.recv_timeout(Duration::from_secs(10)).expect("the run finishes");
            let done = matches!(event, RunEvent::Exit { .. });
            events.push(event);
            if done {
                return events;
            }
        }
    }

    fn output(events: &[RunEvent]) -> String {
        events.iter().filter_map(|e| if let RunEvent::Out { text } = e { Some(text.as_str()) } else { None }).collect()
    }

    fn exit_code(events: &[RunEvent]) -> Option<i32> {
        events.iter().find_map(|e| if let RunEvent::Exit { code, .. } = e { *code } else { None })
    }

    #[test]
    fn prints_come_back_as_output() {
        let (_session, rx) = launch("print('hello')\nprint(2 + 3)\n");
        let events = until_exit(&rx);
        assert_eq!(output(&events), "hello\n5\n");
        assert_eq!(exit_code(&events), Some(0));
    }

    #[test]
    fn input_asks_and_gets_the_answer() {
        let (session, rx) = launch("name = input('Your name? ')\nprint('Hi', name)\n");
        let prompt = rx.recv_timeout(Duration::from_secs(10)).unwrap();
        assert_eq!(prompt, RunEvent::Input { prompt: "Your name? ".into() });
        session.send("Ada").unwrap();
        assert_eq!(output(&until_exit(&rx)), "Hi Ada\n");
    }

    #[test]
    fn a_runtime_error_names_its_line() {
        let (_session, rx) = launch("total = 1\nprint(totl)\n");
        let events = until_exit(&rx);
        let error = events.iter().find_map(|e| if let RunEvent::Error(err) = e { Some(err.clone()) } else { None }).unwrap();
        assert_eq!((error.kind.as_str(), error.line), ("NameError", Some(2)));
        assert!(error.text.contains("Did you mean: 'total'?"), "Python's suggestion is kept: {}", error.text);
        assert_eq!(exit_code(&events), Some(1));
    }

    #[test]
    fn a_syntax_error_names_its_line() {
        let (_session, rx) = launch("print('ok')\nprint('hi'\n");
        let events = until_exit(&rx);
        let error = events.iter().find_map(|e| if let RunEvent::Error(err) = e { Some(err.clone()) } else { None }).unwrap();
        assert_eq!((error.kind.as_str(), error.line), ("SyntaxError", Some(2)));
        assert_eq!(output(&events), "", "nothing runs when the file can't be read");
    }

    #[test]
    fn stop_ends_a_stuck_loop() {
        let (session, rx) = launch("while True:\n    pass\n");
        std::thread::sleep(Duration::from_millis(300));
        session.stop();
        let events = until_exit(&rx);
        assert!(matches!(events.last(), Some(RunEvent::Exit { stopped: true, .. })));
    }

    #[test]
    fn uses_its_own_python_not_the_one_on_path() {
        let (_session, rx) = launch("import sys\nprint(sys.executable)\n");
        let used = PathBuf::from(output(&until_exit(&rx)).trim()).canonicalize().unwrap();
        assert_eq!(used, find_python(None).unwrap().canonicalize().unwrap());
        for dir in std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()) {
            if let Ok(on_path) = dir.join("python3").canonicalize() {
                assert_ne!(used, on_path, "ran the PATH python in {}", dir.display());
            }
        }
    }

    #[test]
    fn stream_holds_back_split_messages_and_characters() {
        let mut stream = Stream::default();
        assert_eq!(stream.push(b"caf\xc3"), vec![RunEvent::Out { text: "caf".into() }]);
        assert_eq!(stream.push(b"\xa9 \x1einput:\"Na"), vec![RunEvent::Out { text: "é ".into() }]);
        assert_eq!(stream.push(b"me? \"\nok"), vec![RunEvent::Input { prompt: "Name? ".into() }, RunEvent::Out { text: "ok".into() }]);
    }
}
