import { Fragment, useEffect, useRef, useState } from "react";
import type { Backend, RunEvent } from "./backend";
import { Editor, type EditorHandle } from "./Editor";
import { explain, type PyError } from "./explain";
import "./App.css";

type Item = { kind: "out" | "err" | "echo"; text: string } | { kind: "error"; error: PyError } | { kind: "note"; text: string };
type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "asking" }
  | { kind: "done"; millis: number }
  | { kind: "failed"; line: number | null }
  | { kind: "stopped" };

const STATUS_TEXT: Record<Status["kind"], string> = {
  idle: "Not run yet",
  running: "Running",
  asking: "Waiting for your answer",
  done: "Finished",
  failed: "Error",
  stopped: "Stopped",
};

const KEY = "spike.code";
const isMac = navigator.platform.startsWith("Mac");
const mod = isMac ? "⌘" : "Ctrl+";
const seconds = (ms: number) => (ms < 10_000 ? (ms / 1000).toFixed(2) : Math.round(ms / 1000).toString()) + " s";

function loadCode() {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export default function App({ backend }: { backend: Backend }) {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [version, setVersion] = useState("");
  const [answer, setAnswer] = useState("");
  const code = useRef(loadCode());
  const editor = useRef<EditorHandle | null>(null);
  const output = useRef<HTMLDivElement>(null);
  const answerField = useRef<HTMLInputElement>(null);
  const runId = useRef(0);
  const running = status.kind === "running" || status.kind === "asking";

  useEffect(() => {
    backend.version().then(setVersion, () => setVersion(""));
  }, [backend]);

  const append = (item: Item) =>
    setItems((list) => {
      const last = list[list.length - 1];
      if (item.kind !== "error" && last?.kind === item.kind && item.kind !== "note") {
        return [...list.slice(0, -1), { ...last, text: last.text + item.text }];
      }
      return [...list, item];
    });

  const run = () => {
    const id = ++runId.current;
    let failedOn: number | null | undefined;
    let asked = false;
    setItems([]);
    setAnswer("");
    setStatus({ kind: "running" });
    editor.current?.showError(null);
    const onEvent = (event: RunEvent) => {
      if (id !== runId.current) return;
      switch (event.type) {
        case "out":
        case "err":
          return append({ kind: event.type, text: event.text });
        case "input":
          asked = true;
          if (event.prompt) append({ kind: "out", text: event.prompt });
          return setStatus({ kind: "asking" });
        case "error": {
          const { type: _, ...error } = event;
          failedOn = error.line;
          editor.current?.showError(error.line);
          return append({ kind: "error", error });
        }
        case "exit":
          if (event.stopped) {
            append({ kind: "note", text: "Stopped" });
            return setStatus({ kind: "stopped" });
          }
          if (failedOn !== undefined || event.code !== 0) return setStatus({ kind: "failed", line: failedOn ?? null });
          // Time spent waiting for answers isn't the program's speed, so it's only shown without them.
          append({ kind: "note", text: asked ? "Finished" : `Finished in ${seconds(event.millis)}` });
          return setStatus({ kind: "done", millis: event.millis });
      }
    };
    backend.run(code.current, onEvent).catch((e) => {
      append({ kind: "err", text: String(e) });
      setStatus({ kind: "failed", line: null });
    });
  };

  const stop = () => backend.stop();

  const submit = () => {
    append({ kind: "echo", text: answer + "\n" });
    setAnswer("");
    setStatus({ kind: "running" });
    backend.send(answer);
  };

  const keys = useRef({ run, stop });
  keys.current = { run, stop };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === "F5" || (cmd && (e.key === "r" || e.key === "Enter"))) {
        e.preventDefault();
        keys.current.run();
      } else if (cmd && e.key === ".") {
        e.preventDefault();
        keys.current.stop();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  useEffect(() => {
    output.current?.scrollTo({ top: output.current.scrollHeight });
  }, [items, status.kind]);

  // The Mac web view ignores focus() during the same frame the field appears, so wait one.
  useEffect(() => {
    if (status.kind !== "asking") return;
    const frame = requestAnimationFrame(() => answerField.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [status.kind]);

  const save = (text: string) => {
    code.current = text;
    try {
      localStorage.setItem(KEY, text);
    } catch {
      // Not fatal: the code just won't be there next time.
    }
  };

  // Text runs are grouped into one block each so the answer field can sit on the prompt's line.
  const groups: (Item[] | Item)[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (item.kind === "error" || item.kind === "note") groups.push(item);
    else if (Array.isArray(last)) last.push(item);
    else groups.push([item]);
  }
  if (status.kind === "asking" && !Array.isArray(groups[groups.length - 1])) groups.push([]);

  return (
    <div className="app">
      <header className="bar" data-tauri-drag-region>
        <div className="title" data-tauri-drag-region>
          <h1>untitled.py</h1>
          <span className={`status status-${status.kind}`} aria-live="polite">
            {status.kind === "failed" && status.line ? `Error on line ${status.line}` : STATUS_TEXT[status.kind]}
          </span>
        </div>
        <div className="actions">
          {version && <span className="version">{version}</span>}
          {running && (
            <button className="secondary" onClick={stop} title={`Stop (${mod}.)`}>
              Stop
            </button>
          )}
          <button className="primary" onClick={run} title={`Run (${mod}R)`}>
            Run <kbd>{mod}R</kbd>
          </button>
        </div>
      </header>

      <main className="panels">
        <section className="panel code-panel" aria-label="Code">
          <Editor initial={code.current} onChange={save} handle={editor} />
        </section>

        <section className="panel output-panel" aria-label="Output">
          <div className="panel-head">
            <h2>Output</h2>
            <button className="ghost" onClick={() => setItems([])} disabled={!items.length}>
              Clear
            </button>
          </div>
          <div className="output" ref={output}>
            {!items.length && !running && (
              <p className="empty">
                Press Run or {mod}R. Whatever your program prints shows up here.
              </p>
            )}
            {groups.map((group, i) =>
              Array.isArray(group) ? (
                <pre className="stream" key={i}>
                  {group.map((item, j) => (
                    <span key={j} className={item.kind}>
                      {"text" in item ? item.text : ""}
                    </span>
                  ))}
                  {status.kind === "asking" && i === groups.length - 1 && (
                    <input
                      className="answer"
                      ref={answerField}
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && submit()}
                      aria-label="Your answer"
                      spellCheck={false}
                      autoComplete="off"
                    />
                  )}
                </pre>
              ) : group.kind === "error" ? (
                <ErrorCard key={i} error={group.error} onLine={(n) => editor.current?.focusLine(n)} />
              ) : group.kind === "note" ? (
                <p className="note" key={i}>
                  {group.text}
                </p>
              ) : (
                <Fragment key={i} />
              ),
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function ErrorCard({ error, onLine }: { error: PyError; onLine: (line: number) => void }) {
  const { title, detail } = explain(error);
  return (
    <div className="error-card" role="alert">
      <p className="error-title">{title}</p>
      <p className="error-detail">{detail}</p>
      <div className="error-foot">
        {error.line && (
          <button className="line-button" onClick={() => onLine(error.line!)}>
            Go to line {error.line}
          </button>
        )}
        <details>
          <summary>Python's message</summary>
          <pre>{error.text}</pre>
        </details>
      </div>
    </div>
  );
}
