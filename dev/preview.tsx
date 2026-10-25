// The editor in a plain browser, with a fake Python that answers a few known programs, so the
// interface can be checked and screenshotted without the app. The real runner is tested in Rust.
import { createRoot } from "react-dom/client";
import App from "../src/App";
import type { Backend, RunEvent } from "../src/backend";

let emit: ((e: RunEvent) => void) | undefined;
let waiting: ((answer: string) => void) | undefined;
const later = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fake: Backend = {
  async run(code, onEvent) {
    emit = onEvent;
    const started = performance.now();
    const exit = (code: number) => onEvent({ type: "exit", code, millis: Math.round(performance.now() - started) + 40, stopped: false });
    await later(30);
    const name = code.match(/input\((['"])(.*?)\1\)/);
    if (name) {
      onEvent({ type: "input", prompt: name[2] });
      const answer = await new Promise<string>((r) => (waiting = r));
      onEvent({ type: "out", text: `Hello, ${answer}!\n` });
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
};

const seed = new URLSearchParams(location.search).get("code");
if (seed !== null) localStorage.setItem("spike.code", seed);
createRoot(document.getElementById("root")!).render(<App backend={fake} />);
