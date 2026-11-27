'use strict';
// Export: PNG 시퀀스(알파) · MP4(H.264, WebCodecs) · 단일 프레임

RL.crc32 = (function () {
  const T = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  return (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = T[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
})();

// store-only zip writer (fallback when folder picker is unavailable)
RL.ZipWriter = class {
  constructor() { this.files = []; this.parts = []; this.offset = 0; }
  add(name, u8) {
    const nm = new TextEncoder().encode(name), crc = RL.crc32(u8);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, u8.length, true); h.setUint32(22, u8.length, true); h.setUint16(26, nm.length, true);
    this.parts.push(new Uint8Array(h.buffer), nm, u8);
    this.files.push({ nm, crc, size: u8.length, off: this.offset });
    this.offset += 30 + nm.length + u8.length;
  }
  blob() {
    const cd = []; let cdSize = 0;
    for (const f of this.files) {
      const h = new DataView(new ArrayBuffer(46));
      h.setUint32(0, 0x02014b50, true); h.setUint16(4, 20, true); h.setUint16(6, 20, true); h.setUint16(8, 0x0800, true);
      h.setUint32(16, f.crc, true); h.setUint32(20, f.size, true); h.setUint32(24, f.size, true); h.setUint16(28, f.nm.length, true);
      h.setUint32(42, f.off, true);
      cd.push(new Uint8Array(h.buffer), f.nm); cdSize += 46 + f.nm.length;
    }
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, this.files.length, true); e.setUint16(10, this.files.length, true);
    e.setUint32(12, cdSize, true); e.setUint32(16, this.offset, true);
    return new Blob([...this.parts, ...cd, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }
};

RL.download = function (blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};

RL.encodePNG = async function (px, w, h) {
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.putImageData(new ImageData(px, w, h), 0, 0);
  const b = await c.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await b.arrayBuffer());
};

RL.safeName = s => String(s || 'untitled').replace(/[\\/:*?"<>|\s]+/g, '_');

RL.Exporter = class {
  constructor(app) { this.app = app; this.cancel = false; }

  async withFullRes(fn) {
    const E = this.app.engine, prevScale = E.scale, prevView = Object.assign({}, E.view);
    E.scale = 1; E.view.grayscale = false; E.view.glowOff = false;
    E.rebuild();
    await E.assetsReady();
    try { return await fn(E); }
    finally { E.scale = prevScale; Object.assign(E.view, prevView); E.rebuild(); this.app.afterRebuild(); }
  }

  frameRange(opt) {
    const P = this.app.project, fps = P.fps;
    const a = Math.max(0, Math.round((opt.from || 0) * fps));
    const b = Math.max(a + 1, Math.round(Math.min(opt.to ?? P.duration, P.duration) * fps));
    return [a, b];
  }

  async pngSequence(opt, progress) {
    const P = this.app.project;
    let dir = null, zip = null, ndir = null;
    const N = window.rlabNative;
    if (N) { ndir = await N.chooseFolder('PNG 시퀀스 저장 폴더'); if (!ndir) return 'cancelled'; }
    else if (window.showDirectoryPicker && !opt.forceZip) {
      try { dir = await window.showDirectoryPicker({ mode: 'readwrite', id: 'rlab-export' }); }
      catch (e) { if (e.name === 'AbortError') return 'cancelled'; dir = null; }
    }
    if (!dir && !ndir) zip = new RL.ZipWriter();
    const base = `${RL.safeName(P.name)}_${opt.pass || 'rgba'}_${P.width}x${P.height}_${P.fps}_s${P.seed}`;
    const [a, b] = this.frameRange(opt);
    this.cancel = false;
    return this.withFullRes(async (E) => {
      E.reset();
      for (let f = 0; f < b; f++) {
        if (this.cancel) return 'cancelled';
        E.stepFrame();
        if (f < a) { if (f % 15 === 0) { progress((f + 1) / b, `건너뛰는 중 ${f + 1}/${a}`); await new Promise(r => setTimeout(r)); } continue; }
        E.render();
        const px = E.readFrame();
        const png = await RL.encodePNG(px, E.rw, E.rh);
        const name = `${base}_${String(f - a).padStart(5, '0')}.png`;
        if (ndir) await N.writeFile(ndir, name, png);
        else if (dir) { const fh = await dir.getFileHandle(name, { create: true }); const w = await fh.createWritable(); await w.write(png); await w.close(); }
        else zip.add(name, png);
        progress((f + 1) / b, `프레임 ${f - a + 1} / ${b - a}`);
        if (f % 2 === 0) { E.present(); await new Promise(r => setTimeout(r)); }
      }
      const json = new TextEncoder().encode(JSON.stringify(P, null, 2));
      if (ndir) { await N.writeFile(ndir, base + '_project.rlab.json', json); return { status: 'done', path: ndir }; }
      if (dir) { const fh = await dir.getFileHandle(base + '_project.rlab.json', { create: true }); const w = await fh.createWritable(); await w.write(json); await w.close(); }
      else { zip.add(base + '_project.rlab.json', json); RL.download(zip.blob(), base + '.zip'); }
      return 'done';
    });
  }

  async mp4(opt, progress) {
    const N = window.rlabNative;
    let nfile = null;
    if (N) {
      const P0 = this.app.project;
      const cfgOk = window.VideoEncoder && await VideoEncoder.isConfigSupported({ codec: 'avc1.640034', width: P0.width, height: P0.height, bitrate: 2e7, framerate: P0.fps }).then(s => s.supported).catch(() => false);
      if (!cfgOk) return this.ffmpegVideo(opt, progress, 'h264');
      nfile = await N.saveDialog(`${RL.safeName(P0.name)}_${P0.width}x${P0.height}_${P0.fps}_s${P0.seed}.mp4`, 'mp4');
      if (!nfile) return 'cancelled';
    }
    if (!window.VideoEncoder || !window.Mp4Muxer) throw new Error('이 브라우저는 WebCodecs(H.264 인코딩)를 지원하지 않습니다. Chrome/Edge 최신 버전을 사용하세요.');
    const P = this.app.project;
    const [a, b] = this.frameRange(opt);
    this.cancel = false;
    return this.withFullRes(async (E) => {
      const w = E.rw - (E.rw % 2), h = E.rh - (E.rh % 2);
      const codecs = ['avc1.640034', 'avc1.640033', 'avc1.640032', 'avc1.64002A'];
      let config = null;
      for (const c of codecs) {
        const cfg = { codec: c, width: w, height: h, bitrate: Math.round(Math.max(8e6, w * h * P.fps * 0.18)), framerate: P.fps, latencyMode: 'quality' };
        try { const s = await VideoEncoder.isConfigSupported(cfg); if (s.supported) { config = cfg; break; } } catch (e) { }
      }
      if (!config) throw new Error(`이 해상도(${w}×${h})의 H.264 인코딩을 지원하지 않습니다. PNG 시퀀스를 사용하세요.`);
      const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: w, height: h, frameRate: P.fps }, fastStart: 'in-memory' });
      let err = null;
      const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: e => { err = e; } });
      enc.configure(config);
      const view = new OffscreenCanvas(w, h), vctx = view.getContext('2d');
      E.reset();
      const prevChecker = E.view.checker; E.view.checker = false;
      try {
        for (let f = 0; f < b; f++) {
          if (this.cancel) { enc.close(); return 'cancelled'; }
          if (err) throw err;
          E.stepFrame();
          if (f < a) continue;
          E.render(); E.present();
          vctx.drawImage(E.canvas, 0, 0, w, h, 0, 0, w, h);
          const vf = new VideoFrame(view, { timestamp: Math.round((f - a) * 1e6 / P.fps), duration: Math.round(1e6 / P.fps) });
          enc.encode(vf, { keyFrame: (f - a) % (P.fps * 2) === 0 });
          vf.close();
          while (enc.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 5));
          progress((f + 1) / b, `프레임 ${f - a + 1} / ${b - a}`);
          if (f % 3 === 0) await new Promise(r => setTimeout(r));
        }
        await enc.flush();
        muxer.finalize();
        if (nfile) { await window.rlabNative.writePath(nfile, new Uint8Array(muxer.target.buffer)); return { status: 'done', path: nfile }; }
        RL.download(new Blob([muxer.target.buffer], { type: 'video/mp4' }), `${RL.safeName(P.name)}_${P.width}x${P.height}_${P.fps}_s${P.seed}.mp4`);
        return 'done';
      } finally { E.view.checker = prevChecker; }
    });
  }

  async stillFrame(frame) {
    const P = this.app.project;
    return this.withFullRes(async (E) => {
      E.reset();
      for (let f = 0; f <= frame; f++) E.stepFrame();
      E.render();
      const png = await RL.encodePNG(E.readFrame(), E.rw, E.rh);
      const name = `${RL.safeName(P.name)}_f${String(frame).padStart(5, '0')}.png`;
      if (window.rlabNative) { const f = await window.rlabNative.saveDialog(name, 'png'); if (!f) return 'cancelled'; await window.rlabNative.writePath(f, png); return { status: 'done', path: f }; }
      RL.download(new Blob([png], { type: 'image/png' }), name);
      return 'done';
    });
  }
  // Desktop only: ProRes 4444 (alpha) / ProRes 422 HQ / H.264 via bundled FFmpeg
  async ffmpegVideo(opt, progress, codec) {
    const N = window.rlabNative;
    if (!N) throw new Error('ProRes 출력은 데스크톱 버전에서만 사용할 수 있습니다.');
    const P = this.app.project;
    const ext = codec === 'h264' ? 'mp4' : 'mov';
    const tag = codec === 'prores4444' ? 'PR4444' : codec === 'prores422hq' ? 'PR422HQ' : 'H264';
    const file = await N.saveDialog(`${RL.safeName(P.name)}_${tag}_${P.width}x${P.height}_${P.fps}_s${P.seed}.${ext}`, ext);
    if (!file) return 'cancelled';
    const [a, b] = this.frameRange(opt);
    this.cancel = false;
    return this.withFullRes(async (E) => {
      const id = await N.encBegin({ file, width: E.rw, height: E.rh, fps: P.fps, codec });
      const opaque = codec !== 'prores4444';
      try {
        E.reset();
        for (let f = 0; f < b; f++) {
          if (this.cancel) { await N.encCancel(id); return 'cancelled'; }
          E.stepFrame();
          if (f < a) continue;
          E.render();
          await N.encFrame(id, E.readFrame(opaque));
          progress((f + 1) / b, `프레임 ${f - a + 1} / ${b - a}`);
          if (f % 3 === 0) { E.present(); await new Promise(r => setTimeout(r)); }
        }
        progress(1, 'FFmpeg 마무리 중…');
        const out = await N.encFinish(id);
        const json = new TextEncoder().encode(JSON.stringify(P, null, 2));
        try { await N.writeFile(out.replace(/[\\/][^\\/]*$/, ''), out.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '') + '_project.rlab.json', json); } catch (e) { }
        return { status: 'done', path: out };
      } catch (e) { try { await N.encCancel(id); } catch (_) { } throw e; }
    });
  }
};
