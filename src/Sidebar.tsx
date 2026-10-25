import { useState } from "react";
import type { Entry } from "./backend";
import { FileTree } from "./components/rareui/file-tree";
import { nameOf } from "./tree";

export function Sidebar({
  root,
  entries,
  selected,
  expanded,
  renaming,
  notice,
  onSelect,
  onRename,
  onStartRename,
  onDelete,
  onNewFile,
  onNewFolder,
  onOpenFolder,
}: {
  root: string;
  entries: Entry[];
  selected: string | null;
  expanded: Set<string>;
  renaming: string | null;
  notice: string | null;
  onSelect: (entry: Entry) => void;
  onRename: (entry: Entry, name: string | null) => void;
  onStartRename: (entry: Entry) => void;
  onDelete: (entry: Entry) => void;
  onNewFile: () => void;
  onNewFolder: () => void;
  onOpenFolder: () => void;
}) {
  const [menu, setMenu] = useState<{ entry: Entry; x: number; y: number } | null>(null);

  return (
    <aside className="sidebar">
      <div className="sidebar-top" data-tauri-drag-region />
      <div className="sidebar-head">
        <h2 title={root}>{nameOf(root)}</h2>
        <button className="ghost" onClick={onOpenFolder} title="Open a different folder">
          Open…
        </button>
      </div>
      <div className="sidebar-files">
        {entries.length ? (
          <FileTree
            entries={entries}
            selected={selected}
            expanded={expanded}
            renaming={renaming}
            onSelect={onSelect}
            onRename={onRename}
            onMenu={(entry, at) => setMenu({ entry, x: at.right, y: at.bottom + 4 })}
          />
        ) : (
          <p className="sidebar-empty">This folder is empty. Make your first file below.</p>
        )}
      </div>
      {notice && (
        <p className="sidebar-notice" role="status">
          {notice}
        </p>
      )}
      <div className="sidebar-foot">
        <button className="secondary" onClick={onNewFile}>
          New file
        </button>
        <button className="ghost" onClick={onNewFolder}>
          New folder
        </button>
      </div>

      {menu && (
        <div className="menu-layer" onClick={() => setMenu(null)}>
          <div className="menu" role="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            <button
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onStartRename(menu.entry);
              }}
            >
              Rename
            </button>
            <button
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onDelete(menu.entry);
              }}
            >
              Move to Trash
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
