// Lab sound, fully synthesized with WebAudio (no audio files): ambient hum, footsteps, UI blips, success chime.
let ctx = null, master = null, hum = null, muted = false;
try { muted = localStorage.getItem('skild-hall:muted') === '1'; } catch {}

export function start() {
  if (ctx) { ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : .55; master.connect(ctx.destination);
  // ambient: filtered noise (air handling) + two low sines (servers/robots)
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0; for (let i = 0; i < len; i++) { last = (last + (Math.random() * 2 - 1) * .02) * .995; d[i] = last; }
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  const ng = ctx.createGain(); ng.gain.value = .9; noise.connect(lp).connect(ng).connect(master); noise.start();
  hum = ctx.createGain(); hum.gain.value = .035; hum.connect(master);
  for (const f of [55, 110.4]) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(hum); o.start(); }
}
export function isMuted() { return muted; }
export function toggleMute() {
  muted = !muted; try { localStorage.setItem('skild-hall:muted', muted ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(muted ? 0 : .55, ctx.currentTime, .05);
  return muted;
}
function tone(freq, dur = .12, {type = 'sine', gain = .12, when = 0, glide = 0} = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + .02);
}
export const sfx = {
  step() { if (!ctx || muted) return; const t = ctx.currentTime, b = ctx.createBufferSource(), n = ctx.sampleRate * .05, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 3; b.buffer = buf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900 + Math.random() * 300; const g = ctx.createGain(); g.gain.value = .22; b.connect(f).connect(g).connect(master); b.start(t); },
  near() { tone(880, .08, {gain: .05}); },
  open() { tone(520, .16, {gain: .08, glide: 1.5}); tone(780, .2, {gain: .05, when: .05}); },
  close() { tone(620, .12, {gain: .05, glide: .7}); },
  unlock() { tone(660, .12, {gain: .07}); tone(990, .18, {gain: .06, when: .09}); },
  complete() { [523, 659, 784, 1046].forEach((f, i) => tone(f, .35, {gain: .07, when: i * .08, type: 'triangle'})); },
  whoosh() { tone(180, .5, {gain: .06, glide: 3, type: 'sawtooth'}); },
};
