'use strict';
import { RL } from './core/rl.js';
import * as eng from './engine.js';
// Scene presets — 1110 연출 체크리스트 기준. 장면은 연출안에서 출발, 색은 씬 고유 팔레트

RL.presets = {};
(function () {
  const L = (type, o, params, react, keys) => {
    const l = eng.newLayer(type, o);
    Object.assign(l.params, params || {});
    Object.assign(l.react, react || {});
    if (keys) l.keys = keys;
    return l;
  };
  const K = (...pairs) => pairs.map(([t, v, e]) => ({ t, v, e: e || 'quintOut' }));
  const marks = (...ts) => ts.map(t => ({ t, s: 1 }));
  const grid = (bpm, from, to, s) => { const out = []; for (let t = from; t < to; t += 60 / bpm) out.push({ t: +t.toFixed(4), s: s || 1 }); return out; };
  const base = (o) => Object.assign(eng.defaultProject(), o);

  RL.presets['empty'] = { label: '빈 프로젝트', make: () => base({ name: '새 프로젝트' }) };

  RL.presets['s0_1'] = { label: '씬 0_1', make: () => base({
    name: 'S0-1', duration: 20, bg: { mode: 'solid', color: '#06080b', chroma: '#00b140' },
    post: { glow: 0.2, glowThreshold: 0.6, glowRadius: 0.6, halation: 0, grain: 0.07, chroma: 0, exposure: 1, contrast: 1.05, saturation: 0.2 },
    layers: [
      L('line', { name: '수평 결(원경)', depth: 0.55, blur: 0.15, opacity: 0.8 }, { count: 22, baseY: 0.36, spacing: 0.022, amp: 0.012, faceCounts: '2,3,2,3,2,3', oscSpeed: 0.12, phaseStep: 0.35, noise: 0.6, core: 1.2, halo: 3, white: 0.1, colors: ['#8d9aa8', '#5d6b7a'], intensity: 0.55 }, { enabled: false }),
      L('fluid', { name: '흐름' }, { flow: 'drift', emitters: 7, emitBand: 0.3, emitSize: 0.05, force: 0.5, flowSpeed: 0.5, curl: 10, fade: 0.12, colors: ['#dfe6ee', '#9aabbd', '#4b5b6d', '#20262e'], relief: 0.65, sheen: 0.4, dyeAmount: 0.8 }, { enabled: false }),
    ],
  }) };

  RL.presets['s1_1'] = { label: '씬 1_1', make: () => base({
    name: 'S1-1', duration: 12, bg: { mode: 'solid', color: '#020409', chroma: '#00b140' },
    post: { glow: 0.3, glowThreshold: 0.6, glowRadius: 0.7, halation: 0.06, grain: 0.03, chroma: 0, exposure: 1, contrast: 1, saturation: 1 },
    layers: [
      L('particle', { name: '부유 먼지(원경)', depth: 0.6, blend: 'add' }, { emitter: 'area', rate: 80, max: 1500, life: 10, speed: 0.01, buoyancy: 0.01, turbulence: 0.15, size: 3, colors: ['#cfe0ff', '#ffffff'], intensity: 0.5, depthRange: 1, twinkle: 0.4 }, { enabled: false }),
      L('beam', { name: '선광 A·C·E' }, { sources: 'A,C,E', width: 0.01, spread: 0.06, fog: 0.7, fogScale: 3, falloff: 0.8, colors: ['#ffffff', '#c9dcff'], intensity: 1.2 }, { faces: 'list', list: 'A,C,E' },
        { length: K([0, 0.0], [5, 1.3, 'inOut']), fill: K([5.5, 0], [11, 0.32, 'inOut']), spread: K([5.5, 0.06], [11, 0.2, 'inOut']), intensity: K([0, 0.8], [5, 1.3, 'inOut']) }),
    ],
  }) };

  RL.presets['s1_2'] = { label: '씬 1_2', make: () => base({
    name: 'S1-2', duration: 12, bg: { mode: 'solid', color: '#03060d', chroma: '#00b140' },
    post: { glow: 0.4, glowThreshold: 0.45, glowRadius: 0.55, halation: 0.05, grain: 0.03, chroma: 0.15, exposure: 1, contrast: 1, saturation: 1 },
    markers: [{ t: 0.4, s: 1 }, { t: 2.2, s: 1.2 }, { t: 6.0, s: 1 }, { t: 6.9, s: 0.5 }, { t: 7.3, s: 0.5 }, { t: 7.7, s: 0.6 }, { t: 8.5, s: 0.5 }, { t: 8.9, s: 0.5 }, { t: 9.3, s: 0.6 }],
    impact: { enabled: true, frames: 3, mode: 'flash', amount: 0.35 },
    layers: [
      L('wave', { name: '징 파장 (A·C·E 동심원)', blend: 'add' }, { mode: 'glow', waveSpeed: 1.5, bands: 2.6, softness: 0.45, spread: 1.3, sustain: 0.4, swirl: 0.4, sparkle: 0.3, core: 0.55, gain: 10, colorA: '#a7e6ff', colorB: '#2350ff', coreColor: '#eafcff', eventY: 0.5, orbFaces: 'A,C,E' }, { faces: 'list', list: 'A,C,E' }),
      L('wave', { name: '잔향 음영(원경)', depth: 0.5, blur: 0.25, opacity: 0.45, blend: 'add' }, { shape: 'point', radius: 0.06, amp: 0.8, waveSpeed: 1.0, damping: 0.05, faceTrans: 0.7, edgeReflect: 0.8, mode: 'relief', gain: 6, threshold: 0.05, colorA: '#5d86c7', colorB: '#0b1530', intensity: 0.7 }, { faces: 'list', list: 'A,C,E' }),
      L('particle', { name: '타악 포인트', blend: 'add' }, { emitter: 'faces', rate: 0, max: 4000, burst: 60, burstSpeed: 0.35, life: 1.6, drag: 2.2, size: 4, colors: ['#ffffff', '#ffe6b0'], glow: 0.5, depthRange: 0.5, turbulence: 0.1, buoyancy: 0 }, { faces: 'random', jitter: 0.8 }),
    ],
  }) };

  RL.presets['s1_3'] = { label: '씬 1_3', make: () => base({
    name: 'S1-3', duration: 12, bg: { mode: 'solid', color: '#040810', chroma: '#00b140' },
    post: { glow: 0.3, glowThreshold: 0.55, glowRadius: 0.5, halation: 0, grain: 0.03, chroma: 0, exposure: 1, contrast: 1, saturation: 1 },
    markers: grid(120, 1, 12, 1),
    layers: [
      L('wave', { name: '이전 씬 블루 링(원경)', depth: 0.6, opacity: 0.5, blend: 'add' }, { autoEvery: 2.5, radius: 0.04, waveSpeed: 1.0, damping: 0.08, mode: 'contour', bands: 1.6, gain: 10, colorA: '#4a78ff', colorB: '#1b2d6b', intensity: 0.6 }, { enabled: false }),
      L('dot', { name: '웜톤 도트' }, { rows: 22, dotSize: 11, heightScale: 0.3, noiseAmp: 0.3, coupling: 80, hit: 1.4, restAlpha: 0.35, colorLow: '#6a2d10', colorHigh: '#ffc879' }, { faces: 'random', jitter: 1 },
        { heightScale: K([0, 0.12], [6, 0.45, 'inOut'], [11, 0.2]), noiseAmp: K([0, 0.15], [6, 0.45]) }),
    ],
  }) };

  RL.presets['s1_4'] = { label: '씬 1_4', make: () => base({
    name: 'S1-4', duration: 12, bg: { mode: 'solid', color: '#05060c', chroma: '#00b140' },
    post: { glow: 0.25, glowThreshold: 0.6, glowRadius: 0.5, halation: 0.05, grain: 0.03, chroma: 0.1, exposure: 1, contrast: 1, saturation: 1 },
    markers: grid(96, 0.5, 12, 1),
    layers: [
      L('wave', { name: '저음 파장 B·D·F(원경)', depth: 0.55, blur: 0.2, opacity: 0.6, blend: 'add' }, { oscAmp: 0.6, oscFreq: 1.6, oscFaces: 'B,D,F', damping: 0.25, mode: 'crest', gain: 8, colorA: '#ff9a5c', colorB: '#3a1440', intensity: 0.7 }, { enabled: false }),
      L('line', { name: '리듬선 (면별 5·3·1)' }, { count: 3, spacing: 0.06, amp: 0.13, faceCounts: '5,3,1,5,3,1', oscSpeed: 0.8, bpm: 96, waves: 3, noise: 0.08, core: 2.2, halo: 5, white: 0.35, intensity: 0.85, pulseAmp: 0.1, colors: ['#ff6b4a', '#ffd166', '#4ad6c4'] }, { faces: 'propagate', origin: 'C', delay: 90 }),
    ],
  }) };

  RL.presets['s1_5'] = { label: '씬 1_5', make: () => base({
    name: 'S1-5', duration: 14, bg: { mode: 'solid', color: '#05060d', chroma: '#00b140' },
    post: { glow: 0.25, glowThreshold: 0.7, glowRadius: 0.6, halation: 0.04, grain: 0.03, chroma: 0.05, exposure: 1, contrast: 1, saturation: 1 },
    markers: grid(100, 6, 14, 0.6),
    layers: [
      L('surface', { name: '그라데이션 흐름(뒤)', depth: 0.25 }, { mode: 'flow', colors: ['#1b1446', '#4b2bd6', '#ff6fb5', '#ffcf70', '#2fc4c0'], angle: 15, scale: 0.8, flowSpeed: 0.3, warp: 0.9, warpScale: 0.9, opacity2: 0.95, intensity: 0.8 }, { enabled: false },
        { warp: K([0, 0.6], [12, 1.4, 'inOut']), flowSpeed: K([0, 0.2], [9, 0.6, 'inOut']) }),
      L('surface', { name: '직면 컬러 흐름(뒤)', depth: 0.3 }, { mode: 'strips', count: 30, width: 0.92, dance: 0, colors: ['#1b1446', '#4b2bd6', '#ff6fb5', '#ffcf70', '#2fc4c0'], opacity2: 0.55, intensity: 0.7, rim: 0.25, sheen: 0.2, depthVar: 0.3, bpm: 100, colorFlow: 0.1, colorBeat: 0.8, stripColors: '1', colorHold: 0.75 }, { faces: 'all' }),
      L('surface', { name: '세로 그라데이션 면(앞)' }, { mode: 'strips', bpm: 100, stripColors: '2', count: 22, width: 0.55, colors: ['#ffffff', '#ffd6f0', '#b9a8ff', '#7fe7ff'], opacity2: 0.5, rim: 0.9, sheen: 0.6, twist: 0.8, freq: 1.1, danceSpeed: 0.9, phaseStep: 0.32, wobble: 0.3, depthVar: 0.45, kick: 0.25 }, { faces: 'all' },
        { dance: K([0, 0], [3, 0], [6.5, 0.35, 'inOut'], [9.3, 1.0, 'inOut'], [13.5, 1.3]), amp: K([0, 0.06], [9.3, 0.2, 'inOut'], [13.5, 0.34, 'expoIn']) }),
    ],
  }) };

  RL.presets['s1_6'] = { label: '씬 1_6', make: () => base({
    name: 'S1-6', duration: 16, bg: { mode: 'solid', color: '#040408', chroma: '#00b140' },
    post: { glow: 0.35, glowThreshold: 0.55, glowRadius: 0.55, halation: 0.06, grain: 0.035, chroma: 0.12, exposure: 1, contrast: 1.05, saturation: 1.05 },
    markers: grid(128, 0.5, 16, 1),
    impact: { enabled: true, frames: 2, mode: 'flash', amount: 0.25 },
    layers: [
      L('beam', { name: '가상 조명 부채꼴', depth: 0.3 }, { sources: 'A,B,C,D,E,F', perSource: 3, fan: 60, sweep: 16, sweepSpeed: 0.4, width: 0.006, spread: 0.05, fog: 0.6, colors: ['#ffffff', '#ffe2a8', '#a8d8ff'], flash: 1.5, flashDecay: 0.18, hotspot: 1 }, { faces: 'all' },
        { intensity: K([0, 0.2], [3, 1, 'inOut'], [7.9, 1], [8.0, 0, 'linear'], [11.0, 0], [11.3, 1.2, 'expoOut']) }),
      L('line', { name: '거친 라인아트(충돌)' }, { mode: 'eq', count: 2, baseY: 0.32, spacing: 0.07, amp: 0.1, noise: 0.9, noiseSpeed: 2.2, oscSpeed: 1.2, faceCounts: '2,3,1,2,3,1', core: 4, halo: 8, white: 0.4, colors: ['#ffd166', '#ff6b4a'], intensity: 0.9 }, { faces: 'propagate', origin: 'C', delay: 60 },
        { intensity: K([7.9, 0.9], [8.0, 0, 'linear'], [11.0, 0], [11.3, 0.9, 'expoOut']) }),
      L('line', { name: '휘몰아치는 네온(가로지르기)' }, { mode: 'streak', from: '랜덤', to: '랜덤', streakSpeed: 1.6, streakLen: 0.25, arc: 0.15, wave: 0.03, core: 2.5, halo: 9, colors: ['#ff4fd8', '#5cf0ff', '#ffd23f', '#7dffb2'], streakBurst: 1 }, { faces: 'random' },
        { streakRate: K([0, 0.5], [7.95, 0.5], [8.05, 14, 'linear'], [11, 14], [11.3, 4, 'expoOut']) }),
      L('shapes', { name: '네 악기 도형(물리)' }, { spawn: 'rain', rate: 4, shapeList: '원,삼각,사각,고리', colors: ['#ff5d5d', '#ffc542', '#3fd2a0', '#5aa9ff'], gravity: 1.1, bounce: 0.6, size: 40, style: 'mix', burst: 3, kickAll: 0.8, lineKick: 1.2, max: 220 }, { faces: 'random', jitter: 0.6 }),
    ],
  }) };

  RL.presets['fx_hit'] = { label: '씬 2_2', make: () => base({
    name: 'S2-2', duration: 8, bg: { mode: 'transparent', color: '#05070c', chroma: '#00b140' },
    post: { glow: 0.4, glowThreshold: 0.5, glowRadius: 0.5, halation: 0, grain: 0, chroma: 0, exposure: 1, contrast: 1, saturation: 1 },
    markers: grid(120, 0.5, 8, 1),
    layers: [
      L('wave', { name: '히트 링', blend: 'add' }, { shape: 'ring', radius: 0.03, amp: 1.2, waveSpeed: 2.2, damping: 0.35, edgeReflect: 0, mode: 'contour', bands: 1.5, gain: 10, threshold: 0.2, colorA: '#ffffff', colorB: '#ffcf5a' }, { faces: 'random', jitter: 0.5 }),
      L('shapes', { name: '히트 파편 도형' }, { spawn: 'burst', burst: 14, burstSpeed: 1.8, gravity: 0.7, floor: 'open', sides: 'open', life: 1.4, collideShapes: false, lineCollide: false, size: 34, style: 'mix', outline: 0.18, glow: 0.35, shapeList: '삼각,마름모,고리,십자', colors: ['#ffffff', '#ffcf5a', '#ff6b8a', '#6fe3ff'], kickAll: 0 }, { faces: 'random', jitter: 0.5 }),
    ],
  }) };

  RL.presets['s4_2'] = { label: '씬 4_2', make: () => base({
    name: 'S4-2', duration: 15, bg: { mode: 'solid', color: '#0a0507', chroma: '#00b140' },
    post: { glow: 0.35, glowThreshold: 0.55, glowRadius: 0.5, halation: 0.12, grain: 0.04, chroma: 0.1, exposure: 1, contrast: 1.05, saturation: 1.05 },
    speed: 1, speedKeys: K([0, 0.45], [8, 1.3, 'inOut'], [14, 2.4, 'expoIn']),
    layers: [
      L('fluid', { name: '회오리 물감' }, { flow: 'vortex', vortexFaces: 'B,E', vortex: 1.1, flowSpeed: 0.8, emitters: 12, emitSize: 0.035, force: 1.1, curl: 24, fade: 0.15, dyeAmount: 1.3, colors: ['#ff5a36', '#ffb000', '#f4efe6', '#5a1a3e'], relief: 0.45, sheen: 0.3 }, { enabled: false }),
      L('particle', { name: '회오리 파편(근경)', blend: 'add' }, { emitter: 'area', rate: 900, max: 9000, life: 4, speed: 0.05, swirl: 1.2, swirlFaces: 'B,E', turbulence: 0.25, size: 6, drag: 0.4, colors: ['#ffe2b0', '#ff7a3d'], depthRange: 0.9, glow: 0.3 }, { enabled: false }),
    ],
  }) };

  RL.presets['s5_2'] = { label: '씬 5_2', make: () => base({
    name: 'S5-2', duration: 14, bg: { mode: 'solid', color: '#03040a', chroma: '#00b140' },
    post: { glow: 0.45, glowThreshold: 0.45, glowRadius: 0.6, halation: 0.06, grain: 0.03, chroma: 0, exposure: 1, contrast: 1, saturation: 1 },
    layers: [
      L('particle', { name: '객석 빛 입자', blend: 'add' }, { emitter: 'grid', band: 0.62, gridRows: 11, gridCols: 30, size: 16, softness: 0.55, colors: ['#ff5d8f', '#ffd166', '#6ee7b7', '#7cc4ff', '#c4a7ff'], colorBy: 'random', twinkle: 0.5, glow: 0.5, faceLag: 0.18 }, { enabled: false },
        { reveal: K([0, 0], [7, 1.15, 'inOut']), intensity: K([9, 1], [11, 0.2, 'inOut']) }),
      L('particle', { name: '상승 입자 띠', blend: 'add', depth: 0.2 }, { emitter: 'bottom', max: 12000, life: 9, speed: 0.08, buoyancy: 0.25, turbulence: 0.35, size: 6, glow: 0.5, colors: ['#ffffff', '#cfe0ff', '#ffe9c2'], depthRange: 1, twinkle: 0.5 }, { enabled: false },
        { rate: K([8, 0], [11, 1400, 'expoOut']) }),
    ],
  }) };

  RL.presets['rg_bass'] = { label: '리듬게임 인게임 — 베이스 심벌', make: () => base({
    name: 'RG_베이스_리듬게임', duration: 16, wrap: true, bg: { mode: 'solid', color: '#04030a', chroma: '#00b140' },
    post: { glow: 0.55, glowThreshold: 0.45, glowRadius: 0.55, halation: 0.08, grain: 0.03, chroma: 0.12, exposure: 1, contrast: 1.05, saturation: 1.1 },
    markers: grid(112, 2.0, 15.5),
    layers: [
      L('line', { name: '쏟아지는 네온선(원경)', depth: 0.45, blur: 0.12, blend: 'add', opacity: 0.8 }, { mode: 'rain', rainRate: 45, rainLen: 0.55, rainSpeed: 1.2, rainAngle: 0, rainBurst: 4, core: 1.6, halo: 7, white: 0.35, colors: ['#3ff0ff', '#ff4fd8', '#9b6bff', '#ffb547'], intensity: 0.7, collider: false }, { faces: 'all', jitter: 0.8 }),
      L('line', { name: '쏟아지는 네온선(근경)', blend: 'add' }, { mode: 'rain', rainRate: 14, rainLen: 0.9, rainSpeed: 2.1, rainBurst: 2, core: 3, halo: 14, white: 0.6, colors: ['#3ff0ff', '#ff4fd8', '#9b6bff', '#ffb547'], intensity: 0.9, collider: false }, { faces: 'all', jitter: 1 }),
      L('rhythm', { name: '베이스 심벌 · 노트 · 이펙트' }, { symbolY: 0.4, symbolSize: 560, fallTime: 1.1, lanes: 3, laneSpread: 0.2, converge: 0.8, noteSize: 50, energyGain: 0.04, energyDecay: 0.005 }, { faces: 'all' }),
      L('particle', { name: '타격 잔광 입자', blend: 'add' }, { emitOn: false, burstOn: true, intensity: 0.5 }, { faces: 'origin', origin: 'D', gain: 0.5 }),
    ],
  }) };

  RL.presets['fl_rise'] = { label: '오브젝트 유영 — 악기 상승·팡', make: () => base({
    name: 'FL_악기유영', duration: 16, wrap: true, bg: { mode: 'solid', color: '#050812', chroma: '#00b140' },
    post: { glow: 0.45, glowThreshold: 0.5, glowRadius: 0.5, halation: 0.05, grain: 0.03, chroma: 0.06, exposure: 1, contrast: 1, saturation: 1.05 },
    markers: grid(96, 3.0, 15.5),
    layers: [
      L('surface', { name: '배경 그라데이션 흐름', depth: 0.5, opacity: 0.5 }, { mode: 'flow', colors: ['#0b1440', '#23207a', '#3a1f6e', '#0d2a55'] }, { enabled: false }),
      L('floaters', { name: '악기 유영(원경)', depth: 0.5, blur: 0.25 }, { size: 90, rate: 3.5, maxCount: 50, depthVar: 0.3, glow: 0.4, popRatio: 0.2, intensity: 0.7, prefill: true }, { faces: 'all' }),
      L('floaters', { name: '악기 유영(근경)' }, { size: 190, rate: 3, maxCount: 34, buoyancy: 0.8, popRatio: 0.45, popSize: 3, prefill: true }, { faces: 'all' }),
    ],
  }) };

  RL.presets['s3_3'] = { label: '씬 3_3', make: () => base({
    name: 'S3-3', duration: 40, wrap: true, bg: { mode: 'solid', color: '#030308', chroma: '#00b140' },
    post: { glow: 0.32, glowThreshold: 0.62, glowRadius: 0.5, halation: 0.03, grain: 0.025, chroma: 0.04, exposure: 0.95, contrast: 1.05, saturation: 1.1 },
    markers: grid(128, 0, 39.9).filter((m, i) => i % 4 === 0),
    layers: [
      // 스모그·조명 흐름 (4막에서 짙어짐)
      L('beam', { name: '스모그 조명 F→A', depth: 0.3 }, { sources: 'A,B,C,D,E,F', perSource: 1, sourceY: 1.05, width: 0.03, spread: 0.32, fog: 0.85, fogScale: 3, fogSpeed: 0.3, colors: ['#ff2fb3', '#7a3cff', '#22d8ff', '#2f6bff', '#ffe03a', '#2dff9b'], fillColor: '#6a2cff', sweep: 18, sweepSpeed: 0.18, intensity: 0.35, flash: 0.5 }, { faces: 'propagate', origin: 'F', delay: 90 },
        { intensity: K([0, 0.2], [10, 0.35, 'inOut'], [30, 0.4], [32, 0.7, 'inOut']), fill: K([0, 0.02], [30, 0.04], [33, 0.16, 'inOut']) }),
      // 2막: 디지털 기하 패턴 + 4막: 네온 입방체
      L('neongeo', { name: '디지털 기하 패턴', depth: 0.35 }, { shape: 'mixPattern', count: 12, layout: 'even', posY: 0.6, jitterY: 0.2, size: 0.32, mode: 'all', core: 1.4, halo: 4, axis: 'x', rotSpeed: 60, colorMode: 'flow', colors: ['#22d8ff', '#7a3cff', '#ff2fb3'], intensity: 0.8 }, { faces: 'all' },
        { reveal: K([10, 0], [13, 1, 'inOut'], [19, 1], [20.5, 0, 'inOut']) }),
      L('neongeo', { name: '네온 입방체 (스모그·군무 결합)' }, { shape: 'mixSolid', count: 6, layout: 'faces', posY: 0.66, size: 0.42, mode: 'faces', faceAlpha: 0.12, core: 3.2, halo: 8, axis: 'xy', rotSpeed: 45, inner: 0.5, colorMode: 'perShape', colors: ['#ff3fd0', '#5a7dff', '#ffe23a', '#2ff0ff', '#ff4a6e', '#2dff9b'], intensity: 1.2, pop: 0.3 }, { faces: 'all' },
        { reveal: K([30, 0], [33, 1, 'inOut']) }),
      // 1막: 세 포인트 레이저 입체 연출
      L('laser', { name: '레이저 · 세 포인트 부채꼴' }, { pattern: 'fan', sources: 'A,C,E', sourceY: 0.0, angle: 180, fan: 80, beams: 7, bpm: 128, sweep: 20, sweepBeats: 4, phaseStep: 0.33, colorMode: 'perSource', colors: ['#ff2fb3', '#22d8ff', '#ffe03a'], intensity: 1.0, white: 0.5 }, { faces: 'all' },
        { length: K([0, 0], [2, 1.4, 'expoOut']), intensity: K([0, 1.0], [9.5, 1.0], [10.5, 0, 'inOut'], [30, 0], [31, 0.9, 'inOut']) }),
      // 2막: 위에서 내리꽂는 레이저
      L('laser', { name: '레이저 · 위에서 내리꽂기' }, { pattern: 'rain', sources: 'A,B,C,D,E,F', sourceY: 1.02, beams: 5, bpm: 128, sweep: 30, sweepBeats: 8, colorMode: 'flow', flowSpeed: -0.4, colors: ['#ff2fb3', '#7a3cff', '#22d8ff', '#ffe03a'], intensity: 1.1 }, { faces: 'all' },
        { intensity: K([0, 0], [10, 0], [11, 1.1, 'inOut'], [19.5, 1.1], [20.5, 0, 'inOut'], [30, 0], [31.5, 0.8, 'inOut']) }),
      // 3막: 공간 전체로 확산되는 레이저 파장
      L('laser', { name: '레이저 · 가로 확산 파장' }, { pattern: 'horizon', sources: 'C,D', sourceY: 0.45, beams: 10, fan: 60, bpm: 128, sweep: 10, colorMode: 'perBeam', colors: ['#ff2a6d', '#21e6ff', '#ffffff', '#b44dff', '#ffe14a'], halo: 7, white: 0.35, burst: 0.6, intensity: 0.9 }, { faces: 'all' },
        { length: K([20, 0], [24, 2, 'expoOut']), intensity: K([0, 0], [19.8, 0], [20.2, 0.9], [29.5, 0.9], [30.5, 0.3, 'inOut']) }),
      // 로봇팔 군무 (EDM 리듬)
      L('robot', { name: '로봇팔 군무 ×12' }, { count: 12, layout: 'zigzag', depthSpread: 0.45, spanStart: 0.02, spanEnd: 0.93, posY: 0.04, scale: 0.85, style: 'edm', bpm: 128, material: 'neon', rim: 0.9, bodyDark: 0.28, edge: 0.5, edgeHalo: 1.8, intensity: 0.85, beatFlash: 0.2, colorMode: 'flow', flowSpeed: 0.35, colors: ['#ff2fb3', '#7a3cff', '#22d8ff', '#2f6bff', '#ffe03a', '#2dff9b'], phaseFlow: 0.2 }, { faces: 'all', gain: 0.8 },
        { diversity: K([0, 0.1], [10, 0.1], [12, 0.35, 'inOut'], [20, 0.35], [22, 0.6, 'inOut'], [30, 0.6], [32, 0.15, 'inOut']),
          tempo: K([0, 0.5], [3, 1, 'inOut'], [30, 1], [32, 1.25, 'inOut']),
          phaseFlow: K([0, 0.6], [6, 0.2, 'inOut'], [20, 0.2], [22, 0.5, 'inOut'], [30, 0.5], [32, 0.05, 'inOut']),
          amount: K([0, 0.6], [4, 1, 'inOut'], [30, 1], [33, 1.35, 'inOut']) }),
    ],
  }) };
})();
