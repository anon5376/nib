// Nib in a plain browser, with an in-memory folder and a fake Python that answers a few known
// programs, so the interface can be checked and screenshotted without the app. The real runner and
// files are tested in Rust. ?welcome starts on the welcome screen; ?code=… replaces hello.py.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import type { Backend, Entry, RunEvent } from "../src/backend";

const ROOT = "/Users/you/Documents/Nib";
const params = new URLSearchParams(location.search);
const files = new Map<string, string>([
  [`${ROOT}/hello.py`, params.get("code") ?? 'name = input("What\'s your name? ")\nprint("Hello,", name)\n'],
  [`${ROOT}/guess.py`, "import random\n\nsecret = random.randint(1, 10)\nguess = int(input(\"Guess a number: \"))\nprint(\"Right!\" if guess == secret else \"Not this time.\")\n"],
  [`${ROOT}/lessons/week1/loops.py`, "for n in range(3):\n    print(n)\n"],
  [`${ROOT}/lessons/week1/totals.py`, "total = 1\nprint(totl)\n"],
  [`${ROOT}/lessons/week2/lists.py`, "names = [\"Ada\", \"Grace\"]\nprint(names[0])\n"],
  [`${ROOT}/lessons/notes.txt`, "Remember the colon after if.\n"],
]);
const folders = new Set([`${ROOT}/lessons`, `${ROOT}/lessons/week1`, `${ROOT}/lessons/week2`]);

function tree(dir: string): Entry[] {
  const kids = new Map<string, Entry>();
  for (const path of [...folders, ...files.keys()]) {
    if (!path.startsWith(dir + "/") || path.slice(dir.length + 1).includes("/")) continue;
    const folder = folders.has(path);
    kids.set(path, { name: path.slice(dir.length + 1), path, folder, children: folder ? tree(path) : [] });
  }
  return [...kids.values()].sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

let emit: ((e: RunEvent) => void) | undefined;
let waiting: ((answer: string) => void) | undefined;
const later = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fake: Backend = {
  async run(_root, path, code, onEvent) {
    files.set(path, code);
    emit = onEvent;
    const started = performance.now();
    const exit = (code: number) => onEvent({ type: "exit", code, millis: Math.round(performance.now() - started) + 40, stopped: false });
    await later(30);
    const name = code.match(/input\((['"])(.*?)\1\)/);
    if (name) {
      onEvent({ type: "input", prompt: name[2] });
      const answer = await new Promise<string>((r) => (waiting = r));
      onEvent({ type: "out", text: `Hello, ${answer}\n` });
      return exit(0);
    }
    const typo = code.match(/print\((totl)\)/);
    if (typo) {
      const line = code.slice(0, typo.index).split("\n").length;
      onEvent({ type: "error", kind: "NameError", message: "name 'totl' is not defined", line, text: "NameError: name 'totl' is not defined. Did you mean: 'total'?" });
      return exit(1);
    }
    if (code.includes("while True")) return;
    for (const m of code.matchAll(/print\((['"])(.*?)\1\)/g)) onEvent({ type: "out", text: m[2] + "\n" });
    exit(0);
  },
  async send(text) {
    waiting?.(text);
  },
  async stop() {
    emit?.({ type: "exit", code: null, millis: 1200, stopped: true });
  },
  version: async () => "Python 3.14.7",
  defaultFolder: async () => ROOT,
  pickFolder: async () => ROOT,
  list: async () => tree(ROOT),
  read: async (_root, path) => files.get(path) ?? "",
  async write(_root, path, text) {
    files.set(path, text);
  },
  async create(_root, dir, name, folder) {
    const path = `${dir}/${folder || name.includes(".") ? name : name + ".py"}`;
    if (files.has(path) || folders.has(path)) throw new Error(`There's already something called ${name} here.`);
    if (folder) folders.add(path);
    else files.set(path, "");
    return path;
  },
  async rename(_root, path, name) {
    const to = path.replace(/[^/]+$/, name);
    for (const [p, text] of [...files]) if (p === path || p.startsWith(path + "/")) (files.delete(p), files.set(to + p.slice(path.length), text));
    for (const p of [...folders]) if (p === path || p.startsWith(path + "/")) (folders.delete(p), folders.add(to + p.slice(path.length)));
    return to;
  },
  async remove(_root, path) {
    for (const p of [...files.keys()]) if (p === path || p.startsWith(path + "/")) files.delete(p);
    for (const p of [...folders]) if (p === path || p.startsWith(path + "/")) folders.delete(p);
  },
};

localStorage.clear();
if (!params.has("welcome")) localStorage.setItem("nib.folder", ROOT);
if (params.get("open")) localStorage.setItem(`nib.open:${ROOT}`, `${ROOT}/${params.get("open")}`);
createRoot(document.getElementById("root")!).render(<App backend={fake} />);
