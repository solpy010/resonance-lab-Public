'use strict';
// BEAM — 가상 조명 빔 + 볼류메트릭 안개 산란 (빔 하강·부채꼴 확산·점멸)

RL.modules.beam = {
  label: '빛·빔', icon: '⟟', blend: 'add',
  schema: [
    { id: 'sources', label: '광원 면 (예: A,C,E)', type: 'text', default: 'A,C,E', group: '형태' },
    { id: 'perSource', label: '광원당 빔 수', type: 'range', min: 1, max: 8, step: 1, default: 1, group: '형태' },
    { id: 'sourceY', label: '광원 높이', type: 'range', min: -0.2, max: 1.3, step: 0.01, default: 1.02, group: '형태' },
    { id: 'angle', label: '방향(도, 0=아래)', type: 'range', min: -180, max: 180, step: 1, default: 0, group: '형태', key: true },
    { id: 'fan', label: '부채꼴 각도', type: 'range', min: 0, max: 170, step: 1, default: 0, group: '형태', key: true },
    { id: 'sweep', label: '흔들림 각도', type: 'range', min: 0, max: 90, step: 0.5, default: 0, group: '움직임', key: true },
    { id: 'sweepSpeed', label: '흔들림 속도', type: 'range', min: 0, max: 3, step: 0.01, default: 0.3, group: '움직임' },
    { id: 'length', label: '빔 길이(하강 진행)', type: 'range', min: 0, max: 1.6, step: 0.01, default: 1.2, group: '움직임', key: true },
    { id: 'width', label: '시작 폭', type: 'range', min: 0.001, max: 0.2, step: 0.001, default: 0.012, group: '형태', key: true },
    { id: 'spread', label: '퍼짐(원뿔)', type: 'range', min: 0, max: 0.6, step: 0.005, default: 0.08, group: '형태', key: true },
    { id: 'softness', label: '가장자리 부드러움', type: 'range', min: 0.01, max: 1, step: 0.01, default: 0.6, group: '물성' },
    { id: 'falloff', label: '거리 감쇠', type: 'range', min: 0, max: 4, step: 0.01, default: 1.1, group: '물성' },
    { id: 'fog', label: '안개 산란', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55, group: '물성', key: true },
    { id: 'fogScale', label: '안개 결 크기', type: 'range', min: 0.5, max: 20, step: 0.1, default: 4, group: '물성' },
    { id: 'fogSpeed', label: '안개 흐름', type: 'range', min: 0, max: 2, step: 0.01, default: 0.15, group: '물성' },
    { id: 'hotspot', label: '광원 점 밝기', type: 'range', min: 0, max: 3, step: 0.01, default: 0.8, group: '물성' },
    { id: 'fill', label: '공간 채움(확산)', type: 'range', min: 0, max: 1, step: 0.01, default: 0, group: '움직임', key: true, hint: '빛이 공간 전체로 번지는 정도 (1_1 마무리)' },
    { id: 'fillColor', label: '채움 색', type: 'color', default: '#cfe3ff', group: '색상' },
    { id: 'colors', label: '빔 팔레트', type: 'colors', default: ['#ffffff', '#bcd6ff'], group: '색상' },
    { id: 'intensity', label: '밝기', type: 'range', min: 0, max: 4, step: 0.01, default: 1, group: '색상', key: true },
    { id: 'flash', label: '이벤트 점멸 세기', type: 'range', min: 0, max: 4, step: 0.01, default: 1.2, group: '반응' },
    { id: 'flashDecay', label: '점멸 잔광(초)', type: 'range', min: 0.02, max: 3, step: 0.01, default: 0.35, group: '반응' },
  ],
  create(engine, L) {
    const gl = engine.gl;
    const prog = RL.program(gl, RL.GLSL_NOISE + `
      uniform vec4 bm[32]; uniform vec4 bc[32]; uniform float nb, aspect, width, spread, soft, falloff, lenL, fog, fogScale, T, hot, fill, wrap;
      uniform vec3 fillC;
      void main(){
        vec2 p = vec2(uv.x*aspect, uv.y);
        float per = max(1.0, floor(aspect*fogScale + 0.5));
        float fn = wrap > 0.5 ? fbmP(vec2(uv.x*per + T*0.6*per/(aspect*fogScale), uv.y*fogScale - T*0.9), per) : fbm(p*fogScale + vec2(T*0.6, -T*0.9));
        float fg = mix(1.0, 0.35 + 1.1*fn, fog);
        vec3 col = vec3(0.0);
        for (int i = 0; i < 32; i++) { if (float(i) >= nb) break;
          vec4 b = bm[i]; vec2 s = vec2(b.x*aspect, b.y); vec2 dir = vec2(sin(b.z), -cos(b.z));
          vec2 d0 = p - s; if (wrap > 0.5) d0.x -= aspect * floor(d0.x/aspect + 0.5);
          float hr = length(d0);
          col += bc[i].rgb * b.w * hot * exp(-hr*hr/(width*width*8.0+1e-5));
          for (int k = -1; k <= 1; k++) {
            if (wrap < 0.5 && k != 0) continue;
            vec2 d = d0 + vec2(float(k)*aspect, 0.0); float along = dot(d, dir); if (along < -0.05) continue;
            float perp = abs(d.x*dir.y - d.y*dir.x);
            float w = width + max(along,0.0) * spread;
            float edge = 1.0 - smoothstep(w*(1.0-soft), w, perp);
            float core = exp(-perp*perp/(w*w*0.08+1e-6)) * 0.6;
            float lenM = 1.0 - smoothstep(lenL * 0.6, lenL, along);
            float fall = exp(-max(along,0.0)*falloff);
            col += bc[i].rgb * b.w * (edge*0.55 + core) * lenM * fall * fg * smoothstep(-0.05, 0.0, along);
          }
        }
        col += fillC * fill * (0.15 + 0.85*pow(uv.y, 1.6)) * mix(1.0, fg, 0.35);
        float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
        frag = vec4(col, a); }`);
    const inst = {
      reset(rng, P) { this.rng = rng; this.time = 0; this.flash = []; },
      step(dt, t, evs, P) {
        this.time += dt;
        for (const e of evs) this.flash.push({ face: e.face, s: e.s, age: 0 });
        for (const f of this.flash) f.age += dt;
        this.flash = this.flash.filter(f => f.age < P.flashDecay * 5);
      },
      render(target, P) {
        RL.clear(gl, target);
        const n = engine.project.faces, faces = RL.parseFaces(P.sources, n);
        const bm = new Float32Array(128), bc = new Float32Array(128), cols = (P.colors || ['#ffffff']).map(RL.hexToRgb);
        let k = 0; const T = this.time;
        const per = Math.round(P.perSource);
        faces.forEach((f, si) => {
          let fl = 0;
          for (const e of this.flash) if (e.face === f || e.face === undefined) fl += e.s * Math.exp(-e.age / P.flashDecay);
          for (let j = 0; j < per && k < 32; j++) {
            const fanA = per > 1 ? (j / (per - 1) - 0.5) * P.fan : 0;
            const sw = Math.sin(T * Math.PI * 2 * P.sweepSpeed + si * 1.7 + j * 0.9) * P.sweep;
            const ang = (P.angle + fanA + sw) * Math.PI / 180;
            const inten = P.intensity * (1 + fl * P.flash);
            bm.set([(f + 0.5) / n, P.sourceY, ang, inten], k * 4);
            const c = cols[(si + j) % cols.length]; bc.set([c[0], c[1], c[2], 1], k * 4);
            k++;
          }
        });
        RL.draw(gl, prog, target, {
          bm, bc, nb: k, aspect: engine.aspect, width: P.width, spread: P.spread, soft: P.softness, falloff: P.falloff,
          lenL: P.length, fog: P.fog, fogScale: P.fogScale, T: T * P.fogSpeed, hot: P.hotspot, fill: P.fill, fillC: RL.hexToRgb(P.fillColor), wrap: engine.project.wrap ? 1 : 0,
        });
      },
      dispose() {},
    };
    return inst;
  },
};
