'use strict';
// FFmpeg 출력 작업 — 화면이 보내는 RGBA 프레임을 FFmpeg 표준입력으로 흘려 ProRes/H.264 파일을 만든다.
const crypto = require('node:crypto');

function encoderArgs(o, platform = process.platform) {
  const color = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709'];
  const input = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${o.width}x${o.height}`, '-r', String(o.fps), '-i', 'pipe:0'];
  const vf = ['-vf', 'scale=out_color_matrix=bt709:out_range=tv'];
  if (o.codec === 'prores4444') return [...input, ...vf, '-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0', ...color, '-movflags', '+write_colr', o.file];
  if (o.codec === 'prores422hq') return [...input, ...vf, '-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0', ...color, '-movflags', '+write_colr', o.file];
  if (o.codec === 'h264') return [...input, ...vf, '-c:v', platform === 'win32' ? 'h264_mf' : 'libx264', '-b:v', String(Math.round(Math.max(8e6, o.width * o.height * o.fps * 0.18))), '-pix_fmt', 'yuv420p', ...color, '-movflags', '+faststart', o.file];
  throw new Error('알 수 없는 코덱: ' + o.codec);
}

function checkSize(width, height, fps) {
  const w = width | 0, h = height | 0, f = +fps;
  if (w < 16 || h < 16 || w > 8192 || h > 8192 || w % 2 || h % 2) throw new Error('해상도는 16~8192의 짝수여야 합니다.');
  if (!(f > 0 && f <= 240)) throw new Error('프레임레이트는 0~240 사이여야 합니다.');
  return { w, h, fps: f };
}

// deps: { spawn, exists, ffmpegPath(), unlink(file), log }
function createEncoder(deps) {
  const jobs = new Map();
  const get = (id) => { const j = jobs.get(id); if (!j) throw new Error('인코딩 작업이 없습니다.'); return j; };
  return {
    get size() { return jobs.size; },
    begin(o, file) {
      const { w, h, fps } = checkSize(o.width, o.height, o.fps);
      const exe = deps.ffmpegPath();
      if (!deps.exists(exe)) throw new Error('FFmpeg를 찾을 수 없습니다: ' + exe);
      const args = encoderArgs({ ...o, width: w, height: h, fps, file });
      const child = deps.spawn(exe, args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
      const id = crypto.randomUUID();
      const job = { child, file, codec: o.codec, frames: 0, log: '', frameBytes: w * h * 4, exited: null, t0: Date.now() };
      child.stderr.on('data', (d) => { job.log = (job.log + d.toString()).slice(-4000); });
      job.done = new Promise((res) => child.on('close', (code) => { job.exited = code; res(code); }));
      child.on('error', (err) => { job.log += String(err); });
      child.stdin.on('error', (err) => { job.log += ' stdin: ' + String(err); });
      jobs.set(id, job);
      deps.log.info('출력 시작', { codec: o.codec, size: `${w}x${h}`, fps, file });
      return id;
    },
    async frame(id, bytes) {
      const j = get(id);
      if (j.exited !== null) throw new Error('FFmpeg가 중단되었습니다: ' + j.log);
      const buf = Buffer.from(bytes);
      if (buf.length !== j.frameBytes) throw new Error('프레임 크기가 맞지 않습니다.');
      j.frames++;
      if (!j.child.stdin.write(buf)) await new Promise((r) => j.child.stdin.once('drain', r));
      return true;
    },
    async finish(id) {
      const j = get(id);
      j.child.stdin.end();
      const code = await j.done;
      jobs.delete(id);
      if (code !== 0) { deps.log.error('출력 실패', { code, file: j.file, frames: j.frames, ffmpeg: j.log }); throw new Error('FFmpeg 오류(' + code + '): ' + j.log); }
      deps.log.info('출력 완료', { file: j.file, frames: j.frames, sec: Math.round((Date.now() - j.t0) / 1000) });
      return j.file;
    },
    async cancel(id) {
      const j = jobs.get(id); if (!j) return false;
      try { j.child.stdin.destroy(); j.child.kill(); } catch { /* 이미 종료 */ }
      await j.done; jobs.delete(id);
      await deps.unlink(j.file);
      deps.log.info('출력 취소', { file: j.file, frames: j.frames });
      return true;
    },
    // 창을 닫을 때 — 남은 작업을 모두 멈추고 덜 만든 파일을 지운다
    async cancelAll() { for (const id of [...jobs.keys()]) await this.cancel(id); },
  };
}
module.exports = { encoderArgs, checkSize, createEncoder };
