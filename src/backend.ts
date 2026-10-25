import { Channel, invoke } from "@tauri-apps/api/core";
import type { PyError } from "./explain";

export type RunEvent =
  | { type: "out"; text: string }
  | { type: "err"; text: string }
  | { type: "input"; prompt: string }
  | ({ type: "error" } & PyError)
  | { type: "exit"; code: number | null; millis: number; stopped: boolean };

/** A file or folder in the open folder, folders first. */
export interface Entry {
  name: string;
  path: string;
  folder: boolean;
  children: Entry[];
}

/** What Nib needs from whatever runs code and keeps files: the app's Rust side, or a fake in the preview. */
export interface Backend {
  run(root: string, path: string, code: string, onEvent: (event: RunEvent) => void): Promise<void>;
  send(text: string): Promise<void>;
  stop(): Promise<void>;
  version(): Promise<string>;
  defaultFolder(): Promise<string>;
  pickFolder(): Promise<string | null>;
  list(root: string): Promise<Entry[]>;
  read(root: string, path: string): Promise<string>;
  write(root: string, path: string, text: string): Promise<void>;
  create(root: string, dir: string, name: string, folder: boolean): Promise<string>;
  rename(root: string, path: string, name: string): Promise<string>;
  remove(root: string, path: string): Promise<void>;
}

export const tauriBackend: Backend = {
  run(root, path, code, onEvent) {
    const channel = new Channel<RunEvent>();
    channel.onmessage = onEvent;
    return invoke("run_code", { root, path, code, onEvent: channel });
  },
  send: (text) => invoke("send_input", { text }),
  stop: () => invoke("stop_run"),
  version: () => invoke("python_version"),
  defaultFolder: () => invoke("folder_default"),
  pickFolder: () => invoke("folder_pick"),
  list: (root) => invoke("folder_list", { root }),
  read: (root, path) => invoke("file_read", { root, path }),
  write: (root, path, text) => invoke("file_write", { root, path, text }),
  create: (root, dir, name, folder) => invoke("entry_create", { root, dir, name, folder }),
  rename: (root, path, name) => invoke("entry_rename", { root, path, name }),
  remove: (root, path) => invoke("entry_delete", { root, path }),
};
