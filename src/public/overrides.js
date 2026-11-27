// 공개판 설정 — 프리셋 이름은 씬 번호만 표시하고, 라이센스 표기를 Unlicense로 맞춘다.
// 프리셋 정의 뒤, 앱 초기화 전에 실행된다.
(function () {
  const RL = window.RL;
  if (!RL || !RL.presets) return;

  // 프리셋 id → [메뉴 표시 이름, 프로젝트 이름]
  const SCENES = {
    s0_1: ['씬 0_1', 'S0-1'],
    s1_1: ['씬 1_1', 'S1-1'],
    s1_2: ['씬 1_2', 'S1-2'],
    s1_3: ['씬 1_3', 'S1-3'],
    s1_4: ['씬 1_4', 'S1-4'],
    s1_5: ['씬 1_5', 'S1-5'],
    s1_6: ['씬 1_6', 'S1-6'],
    fx_hit: ['씬 2_2', 'S2-2'],
    s3_3: ['씬 3_3', 'S3-3'],
    s4_2: ['씬 4_2', 'S4-2'],
    s5_2: ['씬 5_2', 'S5-2'],
  };
  for (const id in SCENES) {
    const P = RL.presets[id];
    if (!P) continue;
    const [label, name] = SCENES[id];
    P.label = label;
    const make = P.make;
    P.make = function () { const p = make.apply(this, arguments); p.name = name; return p; };
  }

  // 화면에 그려지는 문구 정리 (정보 창 등)
  const VERSION = 'v0.5.6';
  const LICENSE_TEXT = '라이센스: Unlicense — 퍼블릭 도메인. 누구나 조건 없이 사용·수정·배포할 수 있습니다.';
  const fix = (node) => {
    const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = w.nextNode())) {
      let v = t.nodeValue, o = v;
      if (v.indexOf('라이센스: Solpy') >= 0) v = LICENSE_TEXT;
      else if (/소유권자 Solpy|All rights reserved|무단 복제/.test(v)) v = '';
      v = v.replace(/RESONANCE LAB v0\.5\.[0-5]\b/g, 'RESONANCE LAB ' + VERSION);
      if (v !== o) t.nodeValue = v;
    }
  };
  const start = () => {
    fix(document.body);
    new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) fix(n.nodeType === 3 ? n.parentNode || document.body : n); })
      .observe(document.body, { childList: true, subtree: true });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
