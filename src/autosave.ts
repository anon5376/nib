export type Save = "saved" | "saving" | { error: string };

/** The open file's pending edit and the write that must finish before leaving it. */
export class Autosave {
  private pending: { path: string; text: string } | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private saving: Promise<boolean> | null = null;

  constructor(
    private write: (path: string, text: string) => Promise<void>,
    private changed: (save: Save) => void,
  ) {}

  edit(path: string, text: string) {
    this.pending = { path, text };
    this.changed("saving");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), 400);
  }

  flush(): Promise<boolean> {
    clearTimeout(this.timer);
    if (this.saving) return this.saving;
    if (!this.pending) return Promise.resolve(true);
    this.changed("saving");
    const writePending = async () => {
      while (this.pending) {
        const job = this.pending;
        try {
          await this.write(job.path, job.text);
        } catch (error) {
          this.changed({ error: String(error) });
          return false;
        }
        // Typing during the write replaces this job; save that newer text next.
        if (this.pending === job) this.pending = null;
      }
      this.changed("saved");
      return true;
    };
    this.saving = writePending().finally(() => { this.saving = null; });
    return this.saving;
  }
}
