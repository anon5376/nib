#!/usr/bin/env node
// Drives Nib's preview (dev/preview.html: a fake folder and a fake Python) in headless Chrome like a
// user: opens files in the tree, makes, renames and trashes one, runs programs, answers input(),
// reads the error card, presses the keys, and hovers every button. Then runs the taste inspector and saves screenshots to .taste-skill/shots.
// Starts its own Vite server. Usage: node scripts/ui-check.mjs   (exits 1 on any failure)

import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const INSPECT = join(homedir(), ".claude/skills/design-taste-frontend/scripts/inspect.mjs");
const VITE_PORT = 1530;
const BASE = `http://localhost:${VITE_PORT}/dev/preview.html`;
const PORT = 9334;
const SHOTS = ".taste-skill/shots";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const vite = spawn("npx", ["vite", "--port", String(VITE_PORT), "--strictPort"], { stdio: "ignore" });
const profile = mkdtempSync(join(tmpdir(), "editor-ui-check-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let failures = 0;
const check = (ok, label) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures++;
};

try {
  for (let i = 0; i < 100 && !(await fetch(BASE).then((r) => r.ok).catch(() => false)); i++) await sleep(100);
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(100);
    targets = await fetch(`http://127.0.0.1:${PORT}/json`).then((r) => r.json()).catch(() => undefined);
  }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    waiting.get(d.id)?.(d);
  };
  const send = (method, params = {}) =>
    new Promise((r) => {
      waiting.set(++id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const ev = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result.result?.value;
  const viewport = (width, height) => send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: false });
  const open = async (code, extra = "open=hello.py") => {
    await send("Page.navigate", { url: `${BASE}?code=${encodeURIComponent(code)}&${extra}` });
    await sleep(900);
  };
  const light = () => send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  const dark = () => send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] });
  const rows = () => ev(`[...document.querySelectorAll(".ui-tree-row")].map((r) => r.innerText.replace("⋯", "").trim()).join(",")`);
  const row = (name) => `.ui-tree-row:nth-child(${0}) .ui-tree-open`.replace("0", name);
  const rowFor = async (name) => {
    const i = await ev(`[...document.querySelectorAll(".ui-tree")[0].children].findIndex((r) => r.matches(".ui-tree-row") && r.innerText.replace("⋯", "").trim() === ${JSON.stringify(name)})`);
    return i < 0 ? null : row(i + 1);
  };
  const centre = (selector) =>
    ev(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
  const move = (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  const click = async (selector) => {
    const at = await centre(selector);
    if (!at) return check(false, `click: ${selector} not found`);
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: at[0], y: at[1], button: "left", clickCount: 1 });
    await sleep(250);
  };
  const key = async (k, code, modifiers = 0) => {
    for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key: k, code, modifiers, windowsVirtualKeyCode: k === "Enter" ? 13 : k.toUpperCase().charCodeAt(0) });
    await sleep(250);
  };
  const text = (selector) => ev(`document.querySelector(${JSON.stringify(selector)})?.innerText ?? ""`);
  const hovers = async (selector, label) => {
    const at = await centre(selector);
    if (!at) return check(false, `${label}: not found (${selector})`);
    const look = `(() => { const s = getComputedStyle(document.querySelector(${JSON.stringify(selector)})); return [s.backgroundColor, s.backgroundImage, s.opacity, s.color].join("|"); })()`;
    await move(1, 1);
    await sleep(160);
    const away = await ev(look);
    await move(at[0], at[1]);
    await sleep(200);
    check(away !== (await ev(look)), `${label} reacts to the pointer`);
  };
  const shot = async (name) => {
    const { result } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(result.data, "base64"));
  };
  mkdirSync(SHOTS, { recursive: true });
  await viewport(1180, 760);
  await light();

  // The welcome screen: the folder fans out on hover and opens the default folder on a click.
  await open("", "welcome");
  check((await text("h1")) === "Pick a home for your programs", "first run asks where programs live");
  const sheet = `getComputedStyle(document.querySelector(".ui-folder-sheet-1")).transform`;
  const resting = await ev(sheet);
  const folderAt = await centre(".ui-folder");
  await move(folderAt[0], folderAt[1]);
  await sleep(700);
  check(resting !== (await ev(sheet)), "the folder's sheets fan out on hover");
  await shot("welcome-light");
  await hovers(".welcome .secondary", "Choose a folder button");
  await hovers(".welcome .primary", "Start button");
  await click(".welcome .primary");
  await sleep(800);
  check((await text(".sidebar-head h2")) === "Nib", "starting opens the Nib folder");

  // The tree: folders first, open and close, open a file inside.
  await open("print('hello')\n");
  check((await rows()) === "lessons,guess.py,hello.py", `tree lists folders first: ${await rows()}`);
  check((await text("h1")) === "hello.py", "the remembered file opens");
  await click(await rowFor("lessons"));
  await click(await rowFor("week1"));
  check((await rows()).startsWith("lessons,week1,loops.py,totals.py,week2,notes.txt"), `folders open in place: ${await rows()}`);
  await hovers(".ui-tree-row:not([data-active=true])", "tree row");
  await click(await rowFor("totals.py"));
  check((await text("h1")) === "lessons/week1/totals.py", `the title shows where the file is: ${await text("h1")}`);
  check((await text(".cm-content")).includes("print(totl)"), "the editor shows the opened file");
  check(await ev(`!!document.querySelector(".ui-tree-track")`), "the selection marks the open file");
  await shot("tree-light");
  await click(await rowFor("week1"));
  check(!(await rows()).includes("loops.py"), "a folder closes again");

  // New file, named in place; then trashed from its menu.
  await hovers(".sidebar-foot .secondary", "New file button");
  await hovers(".sidebar-foot .ghost", "New folder button");
  await hovers(".sidebar-head .ghost", "Open folder button");
  await click(".sidebar-foot .secondary");
  check((await ev(`document.activeElement?.className`)) === "ui-tree-rename", "a new file asks for its name");
  check((await ev(`document.getSelection().toString() || document.activeElement.value.slice(document.activeElement.selectionStart, document.activeElement.selectionEnd)`)) === "untitled", "the name is selected without .py");
  await send("Input.insertText", { text: "game" });
  await key("Enter", "Enter");
  await sleep(300);
  check((await rows()).includes("game.py") && (await text("h1")).endsWith("game.py"), `the new file is named and open: ${await text("h1")}`);
  await hovers(".ui-tree-row[data-active=true] .ui-tree-more", "file menu button");
  await click(".ui-tree-row[data-active=true] .ui-tree-more");
  await hovers(".menu button", "menu item");
  await click(".menu button:last-child");
  await sleep(300);
  check(!(await rows()).includes("game.py") && (await text(".sidebar-notice")).includes("Trash"), "Move to Trash removes it and says so");
  check((await text("h1")) === "No file open", "closing the trashed file empties the editor");

  // A program that prints.
  await open("print('hello')\nprint('second line')\n");
  check((await text(".output")).includes("Press Run"), "empty output says what to do");
  await hovers(".primary", "Run button");
  await click(".primary");
  const printed = await text(".output");
  check(printed.includes("hello\nsecond line") && printed.includes("Finished in"), "Run shows the output and a finish line");
  check((await text(".status")) === "Finished", "status says Finished");
  await hovers(".output-panel .ghost", "Clear button");
  await click(".output-panel .ghost");
  check((await text(".output")).includes("Press Run"), "Clear empties the output");

  // The Run shortcut.
  await ev(`document.querySelector(".cm-content").focus()`);
  await key("r", "KeyR", 4);
  check((await text(".output")).includes("hello"), "Cmd+R runs from inside the editor");

  // A typo: the error card names the line and Python's suggestion.
  await open("total = 1\nprint(totl)\n");
  await click(".primary");
  const card = await text(".error-card");
  check(card.includes(`There's no "totl". Did you mean "total"?`), "error card explains the typo");
  check(card.includes("Go to line 2") && (await text(".status")) === "Error on line 2", "error card and status name line 2");
  check(await ev(`!!document.querySelector(".cm-error-line")`), "the editor tints the error line");
  await hovers(".line-button", "Go to line button");
  await shot("error-light");

  // A program that asks for a name.
  await open("name = input('Your name? ')\nprint('Hello,', name)\n");
  await ev(`document.querySelector(".cm-content").focus()`);
  await key("r", "KeyR", 4);
  check((await ev(`document.activeElement?.className`)) === "answer", "the answer field takes the keyboard when Cmd+R starts a program that asks");
  check(!(await text(".cm-content")).includes("Ada"), "nothing typed lands in the code");
  await click(".primary");
  check((await ev(`document.activeElement?.className`)) === "answer", "the answer field takes the keyboard when Run is clicked");
  check((await text(".status")) === "Waiting for your answer", "status says it's waiting");
  await hovers(".actions .secondary", "Stop button");
  await shot("asking-light");
  await send("Input.insertText", { text: "Ada" });
  await key("Enter", "Enter");
  await sleep(200);
  check((await text(".stream")).includes("Your name? Ada\nHello, Ada\n"), "the answer is echoed and the program carries on");

  // Stop ends a stuck program.
  await open("while True:\n    pass\n");
  await click(".primary");
  await click(".actions .secondary");
  check((await text(".status")) === "Stopped", "Stop stops it");

  // Dark mode and a narrow window, for the screenshots.
  await dark();
  await open("total = 1\nprint(totl)\n");
  await click(".primary");
  await shot("error-dark");
  await open("", "welcome");
  await shot("welcome-dark");
  await light();
  await open("");
  await shot("empty-output-light");
  await viewport(760, 700);
  await open("total = 1\nprint(totl)\n");
  await click(".primary");
  await shot("error-narrow");
  ws.close();
} finally {
  chrome.kill();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}

// The taste skill's app-screen inspector, on the same preview.
const inspect = spawn("node", [INSPECT, "--app", `${BASE}?code=${encodeURIComponent("total = 1\nprint(totl)\n")}`], { stdio: "inherit" });
const inspected = await new Promise((r) => inspect.on("exit", r));
check(inspected === 0, "taste inspector reports no FAIL");
vite.kill();

console.log(failures ? `\n${failures} check(s) failed` : "\nui-check passed");
process.exit(failures ? 1 : 0);
