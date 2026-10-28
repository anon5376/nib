// Renders design/poster.html to docs/poster.png (3200×1800) with headless Chrome. Run
// `node scripts/ui-check.mjs` first so the screenshots it shows are current.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const profile = mkdtempSync(join(tmpdir(), "nib-poster-"));
const out = resolve(process.argv[2] ?? "docs/poster.png");
const result = spawnSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--disable-gpu", `--user-data-dir=${profile}`, "--hide-scrollbars",
  "--allow-file-access-from-files", "--force-device-scale-factor=2", "--window-size=1600,900",
  `--screenshot=${out}`, `file://${resolve("design/poster.html")}`,
], { stdio: "inherit" });
rmSync(profile, { recursive: true, force: true });
process.exit(result.status ?? 1);
