#!/usr/bin/env bash
# Build Glyph Arena's sidecar, arena-engine, from glyph-engine (where all of Arena's
# logic lives: src/arena) and put it where Tauri expects the externalBin.
#   ENGINE_DIR=/path/to/glyph-engine  use a local checkout
#   ENGINE_REF=v1.10.9               otherwise clone fru-dev3/glyph-engine at this ref (default main)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
TRIPLE="$(rustc -Vv | sed -n 's/host: //p')"
if [ -n "${ENGINE_DIR:-}" ]; then
  SRC="$(cd "$ENGINE_DIR" && pwd)"
else
  SRC="$HERE/.engine"
  if [ ! -d "$SRC/.git" ]; then
    git clone --depth 1 --branch "${ENGINE_REF:-main}" https://github.com/fru-dev3/glyph-engine.git "$SRC"
  else
    git -C "$SRC" fetch --depth 1 origin "${ENGINE_REF:-main}" && git -C "$SRC" checkout -q FETCH_HEAD
  fi
fi
[ -f "$SRC/src/arena/main.ts" ] || { echo "prepare-sidecar: $SRC has no src/arena (needs glyph-engine with Arena)" >&2; exit 1; }
( cd "$SRC" && { [ -d node_modules ] || bun install --frozen-lockfile >/dev/null; } && bun build --compile --external chromium-bidi --outfile=dist/arena-engine src/arena/main.ts )
mkdir -p "$HERE/src-tauri/binaries"
# Remove first: copying over a binary macOS has already run replaces the bytes under
# a cached code signature, and the next run is killed on the spot (exit 137, no output).
rm -f "$HERE/src-tauri/binaries/arena-engine-$TRIPLE"
cp "$SRC/dist/arena-engine" "$HERE/src-tauri/binaries/arena-engine-$TRIPLE"
echo "prepare-sidecar: src-tauri/binaries/arena-engine-$TRIPLE ($(du -h "$HERE/src-tauri/binaries/arena-engine-$TRIPLE" | cut -f1)) from $(git -C "$SRC" rev-parse --short HEAD)"
