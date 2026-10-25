import { Channel, invoke } from "@tauri-apps/api/core";
import type { PyError } from "./explain";

export type RunEvent =
  | { type: "out"; text: string }
  | { type: "err"; text: string }
  | { type: "input"; prompt: string }
  | ({ type: "error" } & PyError)
  | { type: "exit"; code: number | null; millis: number; stopped: boolean };

/** What the editor needs from whatever runs the code: the app's Rust side, or a fake in the preview. */
export interface Backend {
  run(code: string, onEvent: (event: RunEvent) => void): Promise<void>;
  send(text: string): Promise<void>;
  stop(): Promise<void>;
  version(): Promise<string>;
}

export const tauriBackend: Backend = {
  run(code, onEvent) {
    const channel = new Channel<RunEvent>();
    channel.onmessage = onEvent;
    return invoke("run_code", { code, onEvent: channel });
  },
  send: (text) => invoke("send_input", { text }),
  stop: () => invoke("stop_run"),
  version: () => invoke("python_version"),
};
