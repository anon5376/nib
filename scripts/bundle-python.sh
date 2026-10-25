#!/bin/sh
# Copies uv's python-build-standalone 3.14 into src-tauri/resources/python, where a release finds it
# (run.rs find_python), and trims what Nib never uses. Tk stays so turtle works.
# Usage: scripts/bundle-python.sh   (after `uv python install 3.14`)
set -eu
cd "$(dirname "$0")/.."
src=$(ls -d "$HOME"/.local/share/uv/python/cpython-3.14.*-macos-aarch64-none | sort -V | tail -1)
out=src-tauri/resources/python
rm -rf "$out"
mkdir -p "$out/bin"
cp -R "$src/lib" "$out/lib"
# One real executable instead of the symlinks, so the bundler copies it once.
cp "$src/bin/python3.14" "$out/bin/python3"
lib="$out/lib/python3.14"
rm -rf "$out/lib/libpython3.14.dylib" "$out/lib/pkgconfig" \
  "$lib/site-packages/pip" "$lib/site-packages"/pip-*.dist-info \
  "$lib/ensurepip" "$lib/idlelib" "$lib/turtledemo" "$lib"/config-3.14-*
# Hash-checked bytecode never looks at file times, which copying changes, so Python never tries
# to rewrite it inside the signed app.
"$out/bin/python3" -E -m compileall -q -j 0 --invalidation-mode unchecked-hash "$out/lib/python3.14"
"$out/bin/python3" -c 'import sys, tkinter, sqlite3, ssl; print(sys.version.split()[0], sys.prefix)'
du -sh "$out"
