//! The folder of programs Nib shows in its sidebar, and reading and writing the files in it.
//! Every path the window sends is checked to be inside the open folder.

use serde::Serialize;
use std::io;
use std::path::{Path, PathBuf};

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub name: String,
    pub path: String,
    pub folder: bool,
    pub children: Vec<Entry>,
}

/// Folders a beginner never needs to see.
const SKIP: &[&str] = &["__pycache__", "node_modules", "venv", "env"];
const MAX_ENTRIES: usize = 2000;
const MAX_FILE_BYTES: u64 = 2_000_000;
const STARTER: &str = "print(\"Hello from Nib!\")\n";

/// `Documents/Nib`, or NIB_FOLDER for test runs so the owner's own programs are never touched.
pub fn default_folder() -> io::Result<PathBuf> {
    let folder = match std::env::var_os("NIB_FOLDER") {
        Some(path) => PathBuf::from(path),
        None => Path::new(&std::env::var_os("HOME").ok_or_else(|| io::Error::other("no home folder"))?).join("Documents/Nib"),
    };
    if !folder.exists() {
        std::fs::create_dir_all(&folder)?;
        std::fs::write(folder.join("hello.py"), STARTER)?;
    }
    Ok(folder)
}

pub fn list(root: &Path) -> io::Result<Vec<Entry>> {
    let mut count = 0;
    read_dir(root, &mut count)
}

fn read_dir(dir: &Path, count: &mut usize) -> io::Result<Vec<Entry>> {
    let mut entries = Vec::new();
    for item in std::fs::read_dir(dir)?.flatten() {
        let name = item.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') || SKIP.contains(&name.as_str()) || *count >= MAX_ENTRIES {
            continue;
        }
        *count += 1;
        let path = item.path();
        let folder = item.file_type().map(|t| t.is_dir()).unwrap_or(false);
        let children = if folder { read_dir(&path, count).unwrap_or_default() } else { Vec::new() };
        entries.push(Entry { name, path: path.to_string_lossy().into_owned(), folder, children });
    }
    entries.sort_by(|a, b| b.folder.cmp(&a.folder).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    Ok(entries)
}

/// A path inside the root, including files that don't exist yet.
/// Check symlink targets, but keep the link's path so rename and Trash move the link itself.
fn inside(root: &Path, path: &Path) -> io::Result<PathBuf> {
    let root = root.canonicalize()?;
    let parent = path.parent().ok_or_else(|| io::Error::other("not a file in this folder"))?;
    let resolved = parent.canonicalize()?.join(path.file_name().ok_or_else(|| io::Error::other("no file name"))?);
    let target = match resolved.symlink_metadata() {
        Ok(metadata) if metadata.is_symlink() => resolved.canonicalize()?,
        Ok(_) => resolved.clone(),
        Err(e) if e.kind() == io::ErrorKind::NotFound => resolved.clone(),
        Err(e) => return Err(e),
    };
    if resolved.starts_with(&root) && resolved != root && target.starts_with(&root) {
        Ok(resolved)
    } else {
        Err(io::Error::other("that file isn't in the open folder"))
    }
}

pub fn read(root: &Path, path: &Path) -> io::Result<String> {
    let path = inside(root, path)?;
    if std::fs::metadata(&path)?.len() > MAX_FILE_BYTES {
        return Err(io::Error::other("This file is too big to open in Nib."));
    }
    String::from_utf8(std::fs::read(path)?).map_err(|_| io::Error::other("Nib can only open text files."))
}

pub fn write(root: &Path, path: &Path, text: &str) -> io::Result<()> {
    std::fs::write(inside(root, path)?, text)
}

fn valid_name(name: &str) -> io::Result<&str> {
    let name = name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\', ':']) {
        return Err(io::Error::other("A name can't be empty or contain / \\ or :"));
    }
    Ok(name)
}

/// Makes a new file (adding .py when the name has no ending) or folder, and returns its path.
pub fn create(root: &Path, dir: &Path, name: &str, folder: bool) -> io::Result<PathBuf> {
    let name = valid_name(name)?;
    let name = if folder || name.contains('.') { name.to_string() } else { format!("{name}.py") };
    let dir = if dir == root { root.canonicalize()? } else { inside(root, dir)? };
    let path = inside(root, &dir.join(&name))?;
    if path.exists() {
        return Err(io::Error::other(format!("There's already something called {name} here.")));
    }
    if folder { std::fs::create_dir(&path)? } else { std::fs::write(&path, "")? }
    Ok(path)
}

pub fn rename(root: &Path, path: &Path, name: &str) -> io::Result<PathBuf> {
    let from = inside(root, path)?;
    let to = inside(root, &from.with_file_name(valid_name(name)?))?;
    if to.exists() && to != from {
        return Err(io::Error::other(format!("There's already something called {name} here.")));
    }
    std::fs::rename(&from, &to)?;
    Ok(to)
}

/// Moves it to the Trash, so a mistake can be undone from Finder.
pub fn delete(root: &Path, path: &Path) -> io::Result<()> {
    trash::delete(inside(root, path)?).map_err(io::Error::other)
}

mod commands {
    use super::*;
    use tauri_plugin_dialog::DialogExt;

    type Result<T> = std::result::Result<T, String>;
    fn text(e: io::Error) -> String {
        e.to_string()
    }

    #[tauri::command]
    pub fn folder_default() -> Result<String> {
        default_folder().map(|p| p.to_string_lossy().into_owned()).map_err(text)
    }

    #[tauri::command]
    pub async fn folder_pick(app: tauri::AppHandle) -> Option<String> {
        app.dialog().file().set_title("Choose the folder for your programs").blocking_pick_folder().map(|p| p.to_string())
    }

    #[tauri::command]
    pub fn folder_list(root: String) -> Result<Vec<Entry>> {
        list(Path::new(&root)).map_err(text)
    }

    #[tauri::command]
    pub fn file_read(root: String, path: String) -> Result<String> {
        read(Path::new(&root), Path::new(&path)).map_err(text)
    }

    #[tauri::command]
    pub fn file_write(root: String, path: String, text: String) -> Result<()> {
        write(Path::new(&root), Path::new(&path), &text).map_err(|e| e.to_string())
    }

    #[tauri::command]
    pub fn entry_create(root: String, dir: String, name: String, folder: bool) -> Result<String> {
        create(Path::new(&root), Path::new(&dir), &name, folder).map(|p| p.to_string_lossy().into_owned()).map_err(text)
    }

    #[tauri::command]
    pub fn entry_rename(root: String, path: String, name: String) -> Result<String> {
        rename(Path::new(&root), Path::new(&path), &name).map(|p| p.to_string_lossy().into_owned()).map_err(text)
    }

    #[tauri::command]
    pub fn entry_delete(root: String, path: String) -> Result<()> {
        delete(Path::new(&root), Path::new(&path)).map_err(text)
    }
}
pub use commands::*;

#[cfg(test)]
mod tests {
    use super::*;

    fn folder() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("nib-files-test-{}-{}", std::process::id(), rand_suffix()));
        std::fs::create_dir_all(dir.join("lessons/__pycache__")).unwrap();
        std::fs::write(dir.join("b.py"), "").unwrap();
        std::fs::write(dir.join("A.py"), "").unwrap();
        std::fs::write(dir.join(".secret"), "").unwrap();
        std::fs::write(dir.join("lessons/one.py"), "print(1)\n").unwrap();
        dir.canonicalize().unwrap()
    }

    fn rand_suffix() -> u128 {
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
    }

    #[test]
    fn lists_folders_first_and_hides_clutter() {
        let root = folder();
        let names: Vec<_> = list(&root).unwrap().into_iter().map(|e| (e.name, e.children.len())).collect();
        assert_eq!(names, vec![("lessons".into(), 1), ("A.py".into(), 0), ("b.py".into(), 0)]);
    }

    #[test]
    fn new_files_get_py_and_names_cannot_clash() {
        let root = folder();
        let made = create(&root, &root.join("lessons"), "two", false).unwrap();
        assert_eq!(made, root.join("lessons/two.py"));
        assert!(create(&root, &root, "b.py", false).is_err());
        assert!(create(&root, &root, "../escape", false).is_err());
        assert_eq!(create(&root, &root, "data.txt", false).unwrap(), root.join("data.txt"));
    }

    #[test]
    fn nothing_outside_the_folder_is_touched() {
        let root = folder();
        let outside = root.parent().unwrap().join("nib-outside.py");
        assert!(write(&root, &outside, "x").is_err());
        assert!(write(&root, &root.join("lessons/../../nib-outside.py"), "x").is_err());
        assert!(!outside.exists());
        assert!(read(&root, &root.join("lessons/one.py")).is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn symlinks_cannot_read_or_write_outside_the_folder() {
        let root = folder();
        let outside = folder().join("private.txt");
        std::fs::write(&outside, "keep this text").unwrap();
        let link = root.join("alias.py");
        std::os::unix::fs::symlink(&outside, &link).unwrap();

        let opened = read(&root, &link);
        let saved = write(&root, &link, "overwritten");
        assert_eq!(std::fs::read_to_string(&outside).unwrap(), "keep this text");
        assert!(opened.is_err(), "opening a link must not read outside the folder");
        assert!(saved.is_err(), "saving a link must not write outside the folder");
    }

    #[cfg(unix)]
    #[test]
    fn dangling_symlinks_do_not_create_outside_targets() {
        let root = folder();
        let outside = folder();
        let save_target = outside.join("saved.py");
        let create_target = outside.join("created.py");
        std::os::unix::fs::symlink(&save_target, root.join("saved.py")).unwrap();
        std::os::unix::fs::symlink(&create_target, root.join("created.py")).unwrap();

        let saved = write(&root, &root.join("saved.py"), "new text");
        let created = create(&root, &root, "created.py", false);
        assert!(!save_target.exists(), "saving followed a dangling link outside the folder");
        assert!(!create_target.exists(), "creating followed a dangling link outside the folder");
        assert!(saved.is_err());
        assert!(created.is_err());
    }

    #[cfg(unix)]
    #[test]
    fn in_folder_symlinks_can_be_edited_and_renamed_without_moving_the_target() {
        let root = folder();
        let target = root.join("lessons/one.py");
        let link = root.join("alias.py");
        std::os::unix::fs::symlink("lessons/one.py", &link).unwrap();

        assert_eq!(read(&root, &link).unwrap(), "print(1)\n");
        write(&root, &link, "saved text\n").unwrap();
        let renamed = rename(&root, &link, "renamed.py").unwrap();
        assert_eq!(renamed, root.join("renamed.py"));
        assert_eq!(std::fs::read_link(&renamed).unwrap(), Path::new("lessons/one.py"));
        assert_eq!(read(&root, &target).unwrap(), "saved text\n");
        assert!(!link.exists());
    }

    #[test]
    fn rename_keeps_the_text() {
        let root = folder();
        let renamed = rename(&root, &root.join("lessons/one.py"), "first.py").unwrap();
        assert_eq!(read(&root, &renamed).unwrap(), "print(1)\n");
        assert!(rename(&root, &renamed, "../../gone.py").is_err());
    }
}
