# Gates: editor spike

OWNS: **

Scope: a throwaway Tauri app where a beginner types Python, presses Run, answers input() prompts, stops a stuck program and reads errors in plain English pointing at the line, judged against the owner's standards before any roadmap is written.

- [x] G1: the backend runs real Python with its own interpreter: print output streams, input() round-trips, an error comes back as kind, line and message, a stuck loop stops, and the interpreter is not the one on PATH
  CHECK: cd src-tauri && cargo test --quiet 2>&1 && echo BACKEND-GATE-OK
  EXPECT: BACKEND-GATE-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=fa6c1fa4115db96aa4c639cf42b4d8d20f048616201d4d1556cb4fa37dfdc6a1; exit=0; EXPECT=matched; output-sha256=896233024e0ed4c086cb68683b0d7add7b197ade7a7a4bf0f76bd8e6016bf648; output-bytes=362; shell=/bin/sh; cwd=/Users/anon5376/Projects/editor-spike; path=8c3bf703bdd7/28 entries

- [x] G2: every error kind a beginner meets first gets a plain-English explanation, and unknown kinds fall back to Python's own message
  CHECK: npx vitest run 2>&1 && echo EXPLAIN-GATE-OK
  EXPECT: EXPLAIN-GATE-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=37f294507d43f6b17479671d1a4769cba4df818e552b3f6d19e0b027de1e57c3; exit=0; EXPECT=matched; output-sha256=14edb624a64c21273d3da438f5793da40fa54c5fe34e8bd16de65d8562343b14; output-bytes=216; shell=/bin/sh; cwd=/Users/anon5376/Projects/editor-spike; path=8c3bf703bdd7/28 entries

- [x] G3: the frontend type-checks and builds
  CHECK: npm run build 2>&1 && echo BUILD-GATE-OK
  EXPECT: BUILD-GATE-OK
  EVIDENCE: automatic-evidence=v1; definition-sha256=0c00bfdf8f691b6e81175a00c6e9c3be1e94b8e29e0d817b12f0185d3db8999d; exit=0; EXPECT=matched; output-sha256=3453d3af3f7420d33af2e32d6e2070b631c73227d8c1fb6c493b5f6a79d258b9; output-bytes=774; shell=/bin/sh; cwd=/Users/anon5376/Projects/editor-spike; path=8c3bf703bdd7/28 entries

- [x] G4: in a real browser every button reacts to the pointer, Run shows output, an error card names the line, and the taste inspector reports no FAIL
  CHECK: node scripts/ui-check.mjs
  EXPECT: ui-check passed
  EVIDENCE: automatic-evidence=v1; definition-sha256=eec91788dd5999e21e0242ca7b16cf6f0c310ce096bc12bd0552be2250252edf; exit=0; EXPECT=matched; output-sha256=fa32a23af3a85fcaabff93872f9b4bf0e13b22dc9512ee03be716745bb9b08ed; output-bytes=2829; shell=/bin/sh; cwd=/Users/anon5376/Projects/editor-spike; path=8c3bf703bdd7/28 entries

- [x] G5: in the real Mac window, typing a program that asks for a name and prints a greeting works end to end, a typo shows the error card, and Stop ends a while True loop
  EVIDENCE: typed with real keystrokes into the debug build on 2026-10-25. Name program started with Cmd+R: the answer box took the keys; output was "What's your name? Ada", "Hello, Ada", "Finished". "total = 10" then "print(totl)": card "Python doesn't know totl yet", status "Error on line 2", line 2 tinted. The missing "Did you mean total" was fixed in runner.py and is now asserted by cargo test. "while True" loop: Cmd+. showed "Stopped". Fixed along the way: the answer box missed focus in the Mac web view, and the finish time counted typing time.

- [x] G6: the spike is judged against the owner's standards (clean macOS, uncrowded, no blue, no sidebar icons, small, fast, no slop) with each verdict written down
  EVIDENCE: session report of 2026-10-25.
  - Clean macOS: yes.
  - Uncrowded: yes (two panels, one main button).
  - No blue: yes.
  - No sidebar icons: yes (there is no sidebar).
  - Small: 4.1 MB release app without Python; about 75 MB once Python is bundled.
  - Fast: Python starts in about 0.01–0.03 s; a run takes about 0.04 s.
  - Slop: the taste inspector gave 0 FAIL and 2 WARN. The WARNs are defended: empty editor panes are workspace, not voids.
