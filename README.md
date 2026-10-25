# Nib (spike)

A tiny Python editor for beginners: pick a folder, type, press Run, answer `input()` in the output,
and read errors in plain English that point at the line. Throwaway spike, built with AI.

Development: `npm install`, `npm run tauri dev`, `npm test`, `cd src-tauri && cargo test`,
`node scripts/ui-check.mjs` (drives the preview in headless Chrome). Set `NIB_FOLDER=<temp folder>`
for test runs so your own programs are never touched.

## Credits

The file tree and the welcome folder are adapted from [Rare UI](https://rareui.com) (Bounce
Sidebar and Folder component), rewritten in CSS, under Rare UI's MIT + Commons Clause +
Attribution licence in `src/components/rareui/LICENSE`. Code editing uses
[CodeMirror](https://codemirror.net) (MIT).
