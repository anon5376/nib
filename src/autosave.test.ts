import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosave, type Save } from "./autosave";

const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

describe("autosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("keeps a failed edit for retry and reports that navigation must wait", async () => {
    let writable = false;
    let stored = "original";
    let status: Save = "saved";
    const save = new Autosave(async (_path, text) => {
      if (!writable) throw new Error("Disk full");
      stored = text;
    }, (next) => { status = next; });

    save.edit("/n/notes.py", "my unsaved work");
    expect(await save.flush()).toBe(false);
    expect(stored).toBe("original");
    expect(status).toEqual({ error: "Error: Disk full" });
    writable = true;
    expect(await save.flush()).toBe(true);
    expect(stored).toBe("my unsaved work");
    expect(status).toBe("saved");
  });

  it("waits for an active save before navigation and writes newer edits last", async () => {
    const first = deferred();
    let started = 0;
    let stored = "original";
    let status: Save = "saved";
    const save = new Autosave(async (_path, text) => {
      if (++started === 1) await first.promise;
      stored = text;
    }, (next) => { status = next; });

    save.edit("/n/notes.py", "older edit");
    await vi.advanceTimersByTimeAsync(400);
    let left = false;
    const navigation = save.flush().then((ok) => { left = ok; });
    await Promise.resolve();
    expect(left).toBe(false);
    save.edit("/n/notes.py", "latest edit");
    await vi.advanceTimersByTimeAsync(400);
    expect(started).toBe(1);
    expect(status).toBe("saving");
    first.resolve();
    await navigation;
    expect(left).toBe(true);
    expect(stored).toBe("latest edit");
    expect(status).toBe("saved");
  });

  it("retries the newest edit when an older write fails", async () => {
    const first = deferred();
    let started = 0;
    let stored = "original";
    const save = new Autosave(async (_path, text) => {
      if (++started === 1) await first.promise;
      stored = text;
    }, () => {});

    save.edit("/n/notes.py", "older edit");
    const saving = save.flush();
    save.edit("/n/notes.py", "latest edit");
    first.reject(new Error("Disk full"));
    expect(await saving).toBe(false);
    expect(await save.flush()).toBe(true);
    expect(stored).toBe("latest edit");
  });

  it("debounces typing and saves to the edited file before another file is edited", async () => {
    const files = new Map<string, string>();
    const save = new Autosave(async (path, text) => { files.set(path, text); }, () => {});
    save.edit("/n/first.py", "first draft");
    await vi.advanceTimersByTimeAsync(300);
    save.edit("/n/first.py", "finished draft");
    await vi.advanceTimersByTimeAsync(300);
    expect(files.size).toBe(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(files.get("/n/first.py")).toBe("finished draft");
    save.edit("/n/first.py", "last change before switching");
    expect(await save.flush()).toBe(true);
    save.edit("/n/second.py", "different file");
    await vi.advanceTimersByTimeAsync(400);
    expect([...files]).toEqual([
      ["/n/first.py", "last change before switching"],
      ["/n/second.py", "different file"],
    ]);
  });
});
