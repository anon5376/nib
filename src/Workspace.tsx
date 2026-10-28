import { useCallback, useEffect, useRef, useState } from "react";
import { Autosave, type Save } from "./autosave";
import type { Backend, Entry } from "./backend";
import { Editor, type Cursor, type EditorHandle } from "./Editor";
import { mod, useShortcuts } from "./keys";
import { Output } from "./Output";
import { Sidebar } from "./Sidebar";
import { crumbs, find, firstFile, parentOf, trail, uniqueName } from "./tree";
import { useRun, type Status } from "./useRun";

const STATUS_TEXT: Record<Status["kind"], string> = {
  idle: "Not run yet",
  running: "Running",
  asking: "Waiting for your answer",
  done: "Finished",
  failed: "Error",
  stopped: "Stopped",
};

const remember = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not fatal: Nib just won't reopen the same file next time.
  }
};
const recall = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** An open folder: its files in the sidebar, the open file in the editor, and the program's output. */
export function Workspace({ backend, root, onOpenFolder }: { backend: Backend; root: string; onOpenFolder: () => void }) {
  const editor = useRef<EditorHandle | null>(null);
  const runner = useRun(backend, editor);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [save, setSave] = useState<Save>("saved");
  const [autosave] = useState(() => new Autosave((path, text) => backend.write(root, path, text), setSave));
  const [cursor, setCursor] = useState<Cursor>({ line: 1, column: 1 });
  const [version, setVersion] = useState("");
  const openRef = useRef<string | null>(null);
  const openKey = `nib.open:${root}`;

  const say = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice((current) => (current === text ? null : current)), 5000);
  };

  const refresh = useCallback(async () => {
    const list = await backend.list(root);
    setEntries(list);
    return list;
  }, [backend, root]);

  const reveal = (list: Entry[], path: string) => setExpanded((now) => new Set([...now, ...trail(list, path)]));

  const openFile = async (path: string | null, list = entries) => {
    if (!(await autosave.flush())) return;
    if (!path) {
      openRef.current = null;
      setOpen(null);
      editor.current?.load("");
      remember(openKey, null);
      return;
    }
    try {
      const text = await backend.read(root, path);
      openRef.current = path;
      setOpen(path);
      setSelected(path);
      setSave("saved");
      editor.current?.load(text);
      reveal(list, path);
      remember(openKey, path);
    } catch (e) {
      say(String(e));
    }
  };

  useEffect(() => {
    backend.version().then(setVersion, () => setVersion(""));
    refresh().then((list) => {
      const last = recall(openKey);
      const start = last && find(list, last) ? last : (firstFile(list)?.path ?? null);
      openFile(start, list);
    });
    // Runs once per folder; Workspace is keyed by root.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edited = (text: string) => {
    const path = openRef.current;
    if (!path) return;
    autosave.edit(path, text);
  };

  const select = (entry: Entry) => {
    if (!entry.folder) return void openFile(entry.path);
    setSelected(entry.path);
    setExpanded((now) => {
      const next = new Set(now);
      if (next.has(entry.path)) next.delete(entry.path);
      else next.add(entry.path);
      return next;
    });
  };

  /** New things go in the selected folder, or beside the selected file. */
  const target = () => {
    const entry = selected ? find(entries, selected) : undefined;
    if (!entry) return root;
    return entry.folder ? entry.path : parentOf(entry.path);
  };

  const make = async (folder: boolean) => {
    if (!(await autosave.flush())) return;
    const dir = target();
    const siblings = dir === root ? entries : (find(entries, dir)?.children ?? []);
    const name = folder ? uniqueName(siblings.map((e) => e.name), "New folder") : uniqueName(siblings.map((e) => e.name), "untitled", ".py");
    try {
      const path = await backend.create(root, dir, name, folder);
      const list = await refresh();
      setExpanded((now) => new Set([...now, ...trail(list, path), ...(dir === root ? [] : [dir])]));
      if (folder) setSelected(path);
      else await openFile(path, list);
      setRenaming(path);
    } catch (e) {
      say(String(e));
    }
  };

  const rename = async (entry: Entry, name: string | null) => {
    setRenaming(null);
    if (!name || name.trim() === entry.name) return;
    if (!(await autosave.flush())) return;
    try {
      const path = await backend.rename(root, entry.path, name);
      const list = await refresh();
      const moved = (p: string | null) => (p && (p === entry.path || p.startsWith(entry.path + "/")) ? path + p.slice(entry.path.length) : p);
      const nowOpen = moved(openRef.current);
      openRef.current = nowOpen;
      setOpen(nowOpen);
      setSelected(moved(selected));
      setExpanded((now) => new Set([...now].map((p) => moved(p)!)));
      remember(openKey, nowOpen);
      reveal(list, path);
    } catch (e) {
      say(String(e));
    }
  };

  const remove = async (entry: Entry) => {
    const holdsOpen = open && (open === entry.path || open.startsWith(entry.path + "/"));
    if (holdsOpen && !(await autosave.flush())) return;
    try {
      await backend.remove(root, entry.path);
      const list = await refresh();
      if (holdsOpen) await openFile(null, list);
      if (selected === entry.path) setSelected(null);
      say(`Moved ${entry.name} to the Trash.`);
    } catch (e) {
      say(String(e));
    }
  };

  const run = async () => {
    if (!open) return;
    if (!(await autosave.flush())) return;
    runner.run(root, open, editor.current?.text() ?? "");
  };

  const openFolder = async () => {
    if (await autosave.flush()) onOpenFolder();
  };

  useShortcuts({ run, stop: runner.stop, newFile: () => make(false) });

  const { status } = runner;
  const where = open ? crumbs(root, open) : null;
  const saveText = typeof save === "object" ? `Couldn't save: ${save.error}` : save === "saving" ? "Saving…" : "Saved";

  return (
    <div className="workspace">
      <Sidebar
        root={root}
        entries={entries}
        selected={selected}
        expanded={expanded}
        renaming={renaming}
        notice={notice}
        onSelect={select}
        onRename={rename}
        onStartRename={(entry) => setRenaming(entry.path)}
        onDelete={remove}
        onNewFile={() => make(false)}
        onNewFolder={() => make(true)}
        onOpenFolder={openFolder}
      />

      <div className="main">
        <header className="bar" data-tauri-drag-region>
          <div className="title" data-tauri-drag-region>
            {where ? (
              <h1>
                {where.folders.map((f, i) => (
                  <span className="crumb" key={i}>
                    {f}
                    <span className="crumb-sep">/</span>
                  </span>
                ))}
                {where.name}
              </h1>
            ) : (
              <h1 className="no-file">No file open</h1>
            )}
            {open && (
              <span className={`status status-${status.kind}`} aria-live="polite">
                {status.kind === "failed" && status.line ? `Error on line ${status.line}` : STATUS_TEXT[status.kind]}
              </span>
            )}
          </div>
          <div className="actions">
            {runner.running && (
              <button className="secondary" onClick={runner.stop} title={`Stop (${mod}.)`}>
                Stop
              </button>
            )}
            <button className="primary" onClick={run} disabled={!open} title={`Run (${mod}R)`}>
              Run <kbd>{mod}R</kbd>
            </button>
          </div>
        </header>

        <main className="panels">
          <section className="panel code-panel" aria-label="Code">
            <div className="code-area">
              <Editor onChange={edited} onCursor={setCursor} handle={editor} />
              {!open && (
                <div className="no-file-cover">
                  <p>Pick a file on the left, or make a new one.</p>
                  <button className="secondary" onClick={() => make(false)}>
                    New file
                  </button>
                </div>
              )}
            </div>
            <footer className="code-foot">
              <span>{open ? `Line ${cursor.line}, column ${cursor.column}` : ""}</span>
              <span className="foot-right">
                {open && <span className={typeof save === "object" ? "save-error" : ""} title={saveText}>{saveText}</span>}
                {open && typeof save === "object" && <button className="ghost retry-save" onClick={() => void autosave.flush()}>Retry save</button>}
                {version && <span>{version}</span>}
              </span>
            </footer>
          </section>

          <Output
            items={runner.items}
            status={status}
            running={runner.running}
            onAnswer={runner.answer}
            onClear={runner.clear}
            onLine={(n) => editor.current?.focusLine(n)}
          />
        </main>
      </div>
    </div>
  );
}
