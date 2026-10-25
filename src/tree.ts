import type { Entry } from "./backend";

/** The folder a path is in. Works with / and \ so Windows paths read the same. */
export const parentOf = (path: string) => path.replace(/[\\/][^\\/]*$/, "");
export const nameOf = (path: string) => path.slice(parentOf(path).length + 1);

export function find(entries: Entry[], path: string): Entry | undefined {
  for (const entry of entries) {
    if (entry.path === path) return entry;
    const inner = entry.folder ? find(entry.children, path) : undefined;
    if (inner) return inner;
  }
}

/** The folders that hold a path, outermost first, so they can be opened to show it. */
export function trail(entries: Entry[], path: string): string[] {
  for (const entry of entries) {
    if (!entry.folder) continue;
    if (path.startsWith(entry.path + "/") || path.startsWith(entry.path + "\\")) return [entry.path, ...trail(entry.children, path)];
  }
  return [];
}

/** The first Python file, looking at the top of the folder before going into folders. */
export function firstFile(entries: Entry[]): Entry | undefined {
  return entries.find((e) => !e.folder && e.name.endsWith(".py")) ?? entries.filter((e) => e.folder).map((e) => firstFile(e.children)).find(Boolean);
}

/** "untitled.py", or "untitled 2.py" and on when that's taken. */
export function uniqueName(taken: string[], stem: string, ending = ""): string {
  const names = new Set(taken.map((n) => n.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = `${stem}${n === 1 ? "" : ` ${n}`}${ending}`;
    if (!names.has(name.toLowerCase())) return name;
  }
}

/** Where the path sits under the open folder, as the folders above it and its own name. */
export function crumbs(root: string, path: string): { folders: string[]; name: string } {
  const parts = path.slice(root.length + 1).split(/[\\/]/);
  return { folders: parts.slice(0, -1), name: parts[parts.length - 1] };
}
