// Renders design/icon.svg to a 1024px transparent PNG with headless Chrome, for `tauri icon`.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const profile = mkdtempSync(join(tmpdir(), "nib-icon-"));
const out = resolve(process.argv[2] ?? "design/icon.png");
const result = spawnSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, "--hide-scrollbars",
  "--default-background-color=00000000", "--window-size=1024,1024", `--screenshot=${out}`,
  `file://${resolve("design/icon.svg")}`,
], { stdio: "inherit" });
rmSync(profile, { recursive: true, force: true });
process.exit(result.status ?? 1);
