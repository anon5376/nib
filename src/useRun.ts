import { useRef, useState } from "react";
import type { Backend, RunEvent } from "./backend";
import type { EditorHandle } from "./Editor";
import type { PyError } from "./explain";

export type Item = { kind: "out" | "err" | "echo"; text: string } | { kind: "error"; error: PyError } | { kind: "note"; text: string };
export type Status =
  | { kind: "idle" }
  | { kind: "running" }
  | { kind: "asking" }
  | { kind: "done"; millis: number }
  | { kind: "failed"; line: number | null }
  | { kind: "stopped" };

const seconds = (ms: number) => (ms < 10_000 ? (ms / 1000).toFixed(2) : Math.round(ms / 1000).toString()) + " s";

/** One program run at a time: its output, whether it's waiting for an answer, and how it ended. */
export function useRun(backend: Backend, editor: React.RefObject<EditorHandle | null>) {
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const runId = useRef(0);

  const append = (item: Item) =>
    setItems((list) => {
      const last = list[list.length - 1];
      if ((item.kind === "out" || item.kind === "err" || item.kind === "echo") && last?.kind === item.kind) {
        return [...list.slice(0, -1), { ...last, text: last.text + item.text }];
      }
      return [...list, item];
    });

  const run = (root: string, path: string, code: string) => {
    const id = ++runId.current;
    let failedOn: number | null | undefined;
    let asked = false;
    setItems([]);
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
    backend.run(root, path, code, onEvent).catch((e) => {
      append({ kind: "err", text: String(e) });
      setStatus({ kind: "failed", line: null });
    });
  };

  const answer = (text: string) => {
    append({ kind: "echo", text: text + "\n" });
    setStatus({ kind: "running" });
    backend.send(text);
  };

  return {
    items,
    status,
    running: status.kind === "running" || status.kind === "asking",
    run,
    stop: () => backend.stop(),
    answer,
    clear: () => setItems([]),
  };
}
