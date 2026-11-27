#!/usr/bin/env bash
# Windows 포터블 exe + 폴더형 앱 빌드 (Linux·macOS·Windows Git Bash). Node 18+ 필요.
#   bash tools/build_portable.sh          공개판
#   bash tools/build_portable.sh --work   작업판 (local/scene_titles.json 필요)
# 준비: desktop/ffmpeg/ffmpeg.exe (https://ffmpeg.org/download.html) — 없으면 ProRes 출력만 빠진 채로 빌드됨
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="$(cat "$ROOT/VERSION")"
MODE="${1:-}"
cd "$ROOT"
[ -d node_modules/vite ] || npm install --no-audit --no-fund --silent
if [ "$MODE" = "--work" ]; then node build.mjs --work; HTML="dist/RESONANCE_LAB_work.html"; OUT="$ROOT/dist/work"; else node build.mjs; HTML="app/RESONANCE_LAB.html"; OUT="$ROOT/dist/public"; fi
B="$ROOT/build/desktop"
rm -rf "$B" && mkdir -p "$B/app" "$B/ffmpeg"
cp desktop/main.cjs desktop/preload.cjs desktop/eb.json "$B/" && cp -r desktop/lib "$B/lib"
cp "$HTML" "$B/app/RESONANCE_LAB.html"
if [ -f desktop/ffmpeg/ffmpeg.exe ]; then cp desktop/ffmpeg/ffmpeg.exe "$B/ffmpeg/"; else echo "(ffmpeg.exe 없음 — ProRes 출력 제외)"; fi
node -e '
const fs=require("fs"),[,root,ver,b,out]=process.argv,p=JSON.parse(fs.readFileSync(root+"/desktop/package.json"));
p.version=ver; p.devDependencies={"electron-builder":"^24.13.3"}; fs.writeFileSync(b+"/package.json",JSON.stringify(p,null,2));
const e=JSON.parse(fs.readFileSync(b+"/eb.json")); e.directories={output:out}; fs.writeFileSync(b+"/eb.json",JSON.stringify(e,null,2));' "$ROOT" "$VER" "$B" "$OUT"
sed -i.bak "s/version: '[0-9.]*'/version: '$VER'/" "$B/preload.cjs" && rm -f "$B/preload.cjs.bak"
cd "$B" && npm install --no-audit --no-fund --silent && npx electron-builder --win portable --x64 --config eb.json
echo "→ $OUT/RESONANCE_LAB_v${VER}_portable.exe  (폴더형 앱: $OUT/win-unpacked)"
