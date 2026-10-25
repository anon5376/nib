// Built on Rare UI's Bounce Sidebar (https://rareui.com/components/bouncesidebar).
// Copyright (c) 2026 Swami Malode. Used under the MIT + Commons Clause + Attribution licence in ./LICENSE.
// Rewritten for Nib, as in Readbox, with a CSS transition instead of Motion: the selection slides
// straight to the chosen row. Rows nest by folder and folders open and close. Styles are in rareui.css.

import { useLayoutEffect, useRef, useState } from "react";
import type { Entry } from "../../backend";

interface Row {
  entry: Entry;
  depth: number;
}

function visible(entries: Entry[], expanded: Set<string>, depth = 0, rows: Row[] = []): Row[] {
  for (const entry of entries) {
    rows.push({ entry, depth });
    if (entry.folder && expanded.has(entry.path)) visible(entry.children, expanded, depth + 1, rows);
  }
  return rows;
}

const split = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
};

export function FileTree({
  entries,
  selected,
  expanded,
  renaming,
  onSelect,
  onRename,
  onMenu,
}: {
  entries: Entry[];
  selected: string | null;
  expanded: Set<string>;
  renaming: string | null;
  onSelect: (entry: Entry) => void;
  onRename: (entry: Entry, name: string | null) => void;
  onMenu: (entry: Entry, at: DOMRect) => void;
}) {
  const refs = useRef(new Map<string, HTMLDivElement>());
  const [mark, setMark] = useState<{ y: number; height: number; moved: boolean } | null>(null);
  const rows = visible(entries, expanded);

  useLayoutEffect(() => {
    const el = selected ? refs.current.get(selected) : undefined;
    if (!el) return setMark(null);
    const y = el.offsetTop;
    const height = el.offsetHeight;
    setMark((prev) => (prev && prev.y === y && prev.height === height ? prev : { y, height, moved: !!prev }));
  }, [selected, rows.length]);

  return (
    <div className="ui-tree" role="tree" aria-label="Files">
      {mark && (
        <span
          className={`ui-tree-track ${mark.moved ? "moved" : ""}`}
          style={{ height: mark.height, transform: `translateY(${mark.y}px)` }}
          aria-hidden="true"
        />
      )}
      {rows.map(({ entry, depth }) => {
        const [stem, ending] = split(entry.name);
        const open = entry.folder && expanded.has(entry.path);
        return (
          <div
            key={entry.path}
            ref={(el) => {
              if (el) refs.current.set(entry.path, el);
              else refs.current.delete(entry.path);
            }}
            className="ui-tree-row"
            role="treeitem"
            aria-selected={entry.path === selected}
            aria-expanded={entry.folder ? open : undefined}
            data-active={entry.path === selected}
          >
            {renaming === entry.path ? (
              <RenameField entry={entry} depth={depth} onDone={(name) => onRename(entry, name)} />
            ) : (
              <button type="button" className="ui-tree-open" style={{ paddingLeft: 10 + depth * 14 }} onClick={() => onSelect(entry)} title={entry.name}>
                {entry.folder ? <span className={`ui-tree-chevron ${open ? "open" : ""}`} aria-hidden="true" /> : <span className="ui-tree-gap" aria-hidden="true" />}
                <span className="ui-tree-name">
                  {stem}
                  {ending && <span className="ui-tree-ending">{ending}</span>}
                </span>
              </button>
            )}
            <button
              type="button"
              className="ui-tree-more"
              aria-label={`More for ${entry.name}`}
              onClick={(e) => onMenu(entry, e.currentTarget.getBoundingClientRect())}
            >
              ⋯
            </button>
          </div>
        );
      })}
    </div>
  );
}

function RenameField({ entry, depth, onDone }: { entry: Entry; depth: number; onDone: (name: string | null) => void }) {
  const field = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  useLayoutEffect(() => {
    const el = field.current!;
    el.focus();
    // Select the name without its ending, the way Finder does.
    const dot = entry.folder ? -1 : entry.name.lastIndexOf(".");
    el.setSelectionRange(0, dot > 0 ? dot : entry.name.length);
  }, [entry]);
  return (
    <input
      ref={field}
      className="ui-tree-rename"
      style={{ marginLeft: 10 + depth * 14 + 14 }}
      defaultValue={entry.name}
      aria-label="New name"
      spellCheck={false}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(e.currentTarget.value);
        if (e.key === "Escape") finish(null);
      }}
      onBlur={(e) => finish(e.currentTarget.value)}
    />
  );
}
