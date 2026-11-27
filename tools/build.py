#!/usr/bin/env python3
"""app/RESONANCE_LAB.html 안의 리듬게임 모듈 구간과 공개판 설정 구간을 src/ 의 소스로 다시 채운다.

    python3 tools/build.py            # 빌드
    python3 tools/build.py --check    # 빌드 결과와 소스가 일치하는지만 검사 (CI용)
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
HTML = ROOT / 'app' / 'RESONANCE_LAB.html'
VERSION = (ROOT / 'VERSION').read_text().strip()

R_BEGIN = '/* ===== RESONANCE LAB — 리듬게임(Rhythm) 모듈 ====='
R_END = '/* ===== 리듬게임 모듈 끝 / end rhythm module ===== */'
P_BEGIN = '/* ===== 공개판 설정 시작 / public overrides ===== */'
P_END = '/* ===== 공개판 설정 끝 ===== */'

HEADER = f"""<script>/*!
 * RESONANCE LAB v{VERSION}
 * 라이센스: Unlicense (퍼블릭 도메인) — https://unlicense.org
 * 누구나 조건 없이 사용·수정·배포할 수 있습니다. This is free and unencumbered software
 * released into the public domain.
 * WebGL visual simulator for live-performance media art.
 */
"""

BANNER = """/* ===== RESONANCE LAB — 리듬게임(Rhythm) 모듈 =====
 * 소스: src/rhythm/fx_glsl.js + src/rhythm/mod_rhythm.js (tools/build.py 가 이 구간을 채움)
 * 전역 RL 네임스페이스로만 다른 코드와 연결됩니다. 이 모듈이 쓰는 코어 API:
 *   RL.modules, RL.rng, RL.hashSeed, RL.hexToRgb, RL.parseFaces, RL.evalKeys,
 *   RL.clear, RL.drawBurst, RL.drawImageBurst, RL.atlasUV, RL.FX_TYPES, RL.program, RL.draw
 */"""


def build(s):
    # 0) <head> 주석
    s = re.sub(r'<!-- RESONANCE LAB v[^\n]*?-->', f'<!-- RESONANCE LAB v{VERSION} — Unlicense (public domain). https://unlicense.org -->', s, count=1)
    # 1) 머리 주석
    a = s.index('<script>/*!\n * RESONANCE LAB')
    b = s.index('*/\n', a) + 3
    s = s[:a] + HEADER + s[b:]
    # 2) 리듬게임 모듈
    a = s.index(R_BEGIN)
    b = s.index(R_END) + len(R_END)
    body = (ROOT / 'src/rhythm/fx_glsl.js').read_text() + '\n' + (ROOT / 'src/rhythm/mod_rhythm.js').read_text()
    s = s[:a] + BANNER + "\n\n(function(){ const RL = window.RL;\n'use strict';\n" + body + '\n})();\n' + R_END + s[b:]
    # 3) 공개판 설정 (스크립트 맨 끝 = 프리셋 정의 뒤, 앱 초기화 전)
    pub = P_BEGIN + '\n' + (ROOT / 'src/public/overrides.js').read_text() + P_END + '\n'
    if P_BEGIN in s:
        a = s.index(P_BEGIN); b = s.index(P_END) + len(P_END) + 1
        s = s[:a] + pub + s[b:]
    else:
        k = s.rindex('</script>\n</body>')
        s = s[:k] + '\n' + pub + s[k:]
    return s


if __name__ == '__main__':
    cur = HTML.read_text(encoding='utf-8')
    new = build(cur)
    if '--check' in sys.argv:
        ok = new == cur
        print('OK — up to date' if ok else 'OUT OF DATE — run python3 tools/build.py')
        sys.exit(0 if ok else 1)
    HTML.write_text(new, encoding='utf-8')
    print('built', HTML.relative_to(ROOT), len(new.encode()), 'bytes')
