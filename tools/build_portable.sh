#!/usr/bin/env bash
# Windows 포터블 exe 빌드 (Linux·macOS·Windows Git Bash 어디서나). Node 18+ 필요.
# 준비: desktop/ffmpeg/ffmpeg.exe (https://ffmpeg.org/download.html) — 없으면 ProRes 출력만 빠진 채로 빌드됨
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="$(cat "$ROOT/VERSION")"
python3 "$ROOT/tools/build.py"
B="$ROOT/build/desktop"
rm -rf "$B" && mkdir -p "$B/app" "$B/ffmpeg"
cp "$ROOT/desktop/main.cjs" "$ROOT/desktop/preload.cjs" "$ROOT/desktop/eb.json" "$B/"
cp "$ROOT/app/RESONANCE_LAB.html" "$B/app/"
[ -f "$ROOT/desktop/ffmpeg/ffmpeg.exe" ] && cp "$ROOT/desktop/ffmpeg/ffmpeg.exe" "$B/ffmpeg/" || echo "(ffmpeg.exe 없음 — ProRes 출력 제외)"
# package.json: 버전 동기화 + 빌드 도구
node -e '
const fs=require("fs"),p=JSON.parse(fs.readFileSync(process.argv[1]+"/desktop/package.json"));
p.version=process.argv[2]; p.devDependencies={"electron-builder":"^24.13.3"};
fs.writeFileSync(process.argv[3]+"/package.json",JSON.stringify(p,null,2));' "$ROOT" "$VER" "$B"
sed -i.bak "s/version: '[0-9.]*'/version: '$VER'/" "$B/preload.cjs" && rm -f "$B/preload.cjs.bak"
cd "$B" && npm install --no-audit --no-fund --silent && npx electron-builder --win portable --x64 --config eb.json
ls -la "$ROOT/dist"
