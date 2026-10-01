// TRY · Omni-bodied — "Break the robot": the post's experiments as playable scenarios. Cut a calf off (slash it),
// lock a knee, jam the wheels under a payload, put it on stilts, or let it learn from its own failed trials.
// Post facts used: one brain trained on 100,000 simulated robots (a millennium of simulated time); every test robot was
// excluded from training (zero-shot); limb loss ~7-8 s to adapt, locked knees ~2-3 s; jammed wheels → it walks like a
// legged biped, and rolls again when they free up; stilts → new step timing and foot placement; a failed trial prepended
// as a prompt lets it succeed on the third attempt (in-context learning); a single-robot specialist flips over.
// 3D: a stand-in quadruped in Skild livery (MuJoCo Menagerie model) on its joints. The stand's adaptation logic (gait search, support
// polygon, sag) drives a kinematic gait through a 2-link leg IK; sets follow the official clips (office carpet tiles, grass
// and leaves, brick patio, café, red carpet + curtains). Optional "Real physics" toggle: composed Go2 in MuJoCo with the
// stand-in controller (not the Skild Brain).
import * as THREE from '../../vendor/three.module.js';
import {kit, B, lerp, clamp} from './kit.js';
import * as MJ from '../mj.js';
import {SETS, groundPlane, mat, wheel, cardboardBox, boot, chainsaw, disposeTree} from '../props/loco-props.js';

const PRESETS = {
  quad: {name: 'Skild quadruped', rows: 2, len: .8, w: .3, reach: 1},
  wheel: {name: 'Skild quadruped + wheels', rows: 2, len: .8, w: .3, reach: 1, wheels: true},
};
// adaptation times: the post gives 7-8 s (lost limb) and 2-3 s (locked knees); "within seconds" for stilts
const ADAPT = {cut: 7.5, lock: 2.5, wheels: 2, stilts: 3, body: 2.5, other: 1.4};
const SCEN = {
  limb: {name: 'Lose a limb', short: 'Limb', clip: 'loss of limbs', goal: 'slash across a leg to cut off its calf. It must walk on', need: s => s.cut >= 1},
  knee: {name: 'Lock a knee', short: 'Knee', clip: 'failed leg motors', goal: 'click a leg to lock its knee motor. It must walk on', need: s => s.lock >= 1},
  wheels: {name: 'Locked wheels + payload', short: 'Wheels', clip: 'Locked wheels', goal: 'it carries a payload. Jam its wheels and see what it does', need: s => s.wheelJam && s.payload > 0},
  stilts: {name: 'Stilts', short: 'Stilts', clip: 'stilts', goal: 'drag Leg length to ×1.6+ (stilts). It must re-time its steps', need: s => s.lenMul >= 1.6},
  trials: {name: 'Learn from failures', short: 'Trials', clip: 'Learning from failures', goal: 'it fails at first. Retry with its failed trials as context', need: s => s.ctxN >= 2},
  free: {name: 'Free play', short: 'Free', clip: 'loss of limbs', goal: 'break any 2 legs on either body, then let it walk 1.5 m', need: s => s.cut + s.lock >= 2},
};
const SET_OF = {limb: 'officeCarpet', knee: 'leaves', wheels: 'patio', stilts: 'cafe', trials: 'stage', free: 'officeCarpet'};
const SIDS = Object.keys(SCEN);
const WALK_GOAL = 1.5;                                     // metres walked after adapting to clear a scenario
const WRAP = 18;                                           // sets repeat every 18 m in x; the group follows the robot
const ease = s => s * s * (3 - 2 * s);
const segDist = (p, a, b) => { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy || 1e-9, t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l, 0, 1); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); };
const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
function hullDist(pts) {                                  // 0 if the body centre is inside the support polygon, else distance to it
  const P = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const p of P) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  const H = lo.slice(0, -1).concat(up.slice(0, -1)), c = {x: 0, y: 0};
  if (H.length < 3) return H.length === 2 ? segDist(c, H[0], H[1]) : 1;
  let inside = true, d = 1e9;
  for (let i = 0; i < H.length; i++) { const a = H[i], b = H[(i + 1) % H.length]; if (cr(a, b, c) < 0) inside = false; d = Math.min(d, segDist(c, a, b)); }
  return inside ? 0 : d;
}
function chips(k, list, x, y, maxX) {                   // pill buttons drawn in the canvas; returns hit rects
  const {ctx} = k, rects = []; let cx = x, cy = y;
  ctx.font = '500 12px Geist, system-ui, sans-serif';
  for (const c of list) {
    const w = ctx.measureText(c.label).width + 24;
    if (cx + w > maxX && cx > x) { cx = x; cy += 32; }
    ctx.fillStyle = c.on ? B.orange : B.white; ctx.strokeStyle = c.on ? B.orange : B.warm3; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cx, cy, w, 26, 13); ctx.fill(); ctx.stroke();
    k.text(c.label, cx + 12, cy + 17, {size: 12, color: c.dim ? B.cool1 : B.black, weight: c.on ? 600 : 500});
    rects.push({id: c.id, x: cx, y: cy, w, h: 26}); cx += w + 8;
  }
  return rects;
}
function drawLog(k, lines, x, y, w, maxH) {              // word-wrapped log, newest line in black
  const rows = []; k.ctx.font = '500 12px Geist, system-ui, sans-serif';
  lines.forEach((l, li) => { let cur = ''; for (const wd of l.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (k.ctx.measureText(t).width > w && cur) { rows.push([cur, li]); cur = wd; } else cur = t; } rows.push([cur, li]); });
  rows.slice(-Math.max(1, Math.floor(maxH / 17))).forEach(([t, li], i) => k.text(t, x, y + i * 17, {size: 12, color: li === lines.length - 1 ? B.black : B.cool2}));
}

// ---- Go2 geometry (from go2.xml) and small math ----
const A1 = .213, HX = .1934, HYT = .142, WR = .07;      // thigh/calf length, hip x, thigh-joint y, wheel radius
const LEGMAP = {L1: 'FL', R1: 'FR', L2: 'RL', R2: 'RR'};
const TH_LIM = {F: [-1.5708, 3.4907], R: [-.5236, 4.5379]}, CALF_LIM = [-2.7227, -.83776];
const rotYX = (p, r, v) => { const cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p), ay = cr * v[1] - sr * v[2], az = sr * v[1] + cr * v[2]; return [cp * v[0] + sp * az, ay, -sp * v[0] + cp * az]; };
const rotYXT = (p, r, v) => { const cr = Math.cos(r), sr = Math.sin(r), cp = Math.cos(p), sp = Math.sin(p), ax = cp * v[0] - sp * v[2], az = sp * v[0] + cp * v[2]; return [ax, cr * v[1] + sr * az, -sr * v[1] + cr * az]; };
const qmul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2], a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
function ik(dx, h, a1, a2) {                              // sagittal 2-link leg: foot (dx forward, h below the thigh joint) → thigh, calf angles
  const d = clamp(Math.hypot(dx, h), Math.abs(a1 - a2) + .03, a1 + a2 - .004), psi = Math.atan2(dx, h);
  const al = Math.acos(clamp((a1 * a1 + d * d - a2 * a2) / (2 * a1 * d), -1, 1)), be = Math.acos(clamp((a2 * a2 + d * d - a1 * a1) / (2 * a2 * d), -1, 1));
  return [al - psi, -(al + be)];
}

export default function mount(root, api) {
  const k = kit(root);
  const {ctx} = k;
  const clip = m => api.clip?.(m), record = (kind, d) => api.record?.(kind, d);
  let pid = 'quad', lenMul = 1, payload = 0, omni = true, tool = 'cut', legs = [], gait = null, mode = 'walk', modeT = 0, adaptDur = 1.4, cands = [];
  let R = {x: 0, y: 0, a: 0, v: 0, phi: 0, sag: 0}, fwd = 0, completed = false, hover = -1, hist = [], histT = 0, events = [];
  let trail = [], log = ['Pick a scenario below, or slash a leg.'], chipRects = [];
  let sid = null, wheelJam = false, walkDist = 0, sinceDamage = 0, lastCause = 'other', slash = null, sawClip = false, flash = 0;
  let trial = 0, ctxN = 0, failed = 0, forced = 0, cleared = null, clearT = 0;
  const best = {};                                        // scenario → best recovery time (s)
  const say = s => { log.push(s); if (log.length > 30) log.shift(); };
  const P = () => PRESETS[pid];
  const count = st => legs.filter(l => l.state === st).length;
  const damaged = () => legs.filter(l => l.state !== 'ok').length;
  const isDefault = () => pid === 'quad' && Math.abs(lenMul - 1) < .01 && payload === 0 && !damaged();
  const rolling = () => P().wheels && !wheelJam;
  const snap = () => ({cut: count('cut'), lock: count('locked'), wheelJam, payload, lenMul, ctxN});
  let dead = false;

  function build() {
    const p = P(); legs = [];
    for (let r = 0; r < p.rows; r++) for (const side of [-1, 1]) {
      const along = p.rows === 1 ? 0 : lerp(p.len / 2 - .08, -p.len / 2 + .08, r / (p.rows - 1));
      legs.push({id: (side < 0 ? 'L' : 'R') + (r + 1), row: r, side, along, state: 'ok', g: 1, jam: 0, foot: {x: along, y: 0}, stance: true, visCut: false});
    }
  }
  const reach = () => .38 * P().reach * lenMul;
  const stride = () => .34 * reach();
  const lat = l => l.side * (P().w / 2 + .7 * reach());
  const freq = () => omni ? 2 / Math.sqrt(P().reach * lenMul) : 2;       // omni re-times its steps to the leg length

  // the specialist only knows one body: the default quadruped's trot (or, on the wheel robot, rolling)
  function specialistGait() { return {name: P().wheels ? 'roll (fixed)' : 'trot (fixed)', duty: .55, roll: !!P().wheels, off: legs.map(l => l.row < 2 ? ((l.row + (l.side > 0 ? 1 : 0)) % 2) * .5 : null), belly: false}; }

  function footAt(l, g, phi) {                              // body-frame foot position for a leg at phase phi
    if (g.roll || (l.state === 'ok' && rolling() && omni)) return {x: l.along, y: lat(l), stance: true, passive: false, roll: true};
    if (l.state === 'locked' || g.off[legs.indexOf(l)] == null) return {x: l.along + (l.state === 'locked' ? l.jam : -stride() / 2), y: lat(l), stance: true, passive: true};
    const p = (phi + g.off[legs.indexOf(l)]) % 1, st = p < g.duty, s = stride();
    const x = st ? l.along + s / 2 - s * (p / g.duty) : l.along - s / 2 + s * ease((p - g.duty) / (1 - g.duty));
    return {x, y: lat(l), stance: st, passive: false};
  }
  function state(g, phi) {                                  // support + thrust at one instant
    if (g.roll || (rolling() && omni)) { const ok = legs.every(l => l.state === 'ok'); return {ok, v: wheelJam ? 0 : .62, yaw: 0, n: 2}; }
    const pts = [], tol = omni ? .08 : .02; let thrust = 0, nT = 0, yaw = 0;
    legs.forEach(l => {
      if (l.state === 'cut') return;
      const f = footAt(l, g, phi); if (!f.stance) return; pts.push(f);
      if (!f.passive) { thrust += l.g * stride(); nT++; yaw += -l.side * l.g * stride() * 3; } else yaw += l.side * 1.4;
    });
    let ok;
    if (g.belly) ok = true;
    else if (pts.length === 0) ok = false;
    else if (pts.length === 1) ok = false;
    else if (pts.length === 2) ok = payload <= 8 ? pts[0].y * pts[1].y < 0 && segDist({x: 0, y: 0}, pts[0], pts[1]) <= .05 + tol : false;
    else ok = hullDist(pts) <= tol + .03;
    const v = nT ? (thrust / nT) * freq() / g.duty * 1.3 : 0;
    return {ok, v: g.belly ? v * .45 : v, yaw: yaw * (g.belly ? .45 : 1) / Math.max(2, legs.length), n: pts.length};
  }
  function evalGait(g) {                                 // roll the gait forward 3 cycles in its head: does the body sag to the floor?
    let st = 0, v = 0, sag = 0, worst = 0; const dt = 1 / (48 * freq());
    for (let i = 0; i < 144; i++) { const s = state(g, (i % 48) / 48); sag = Math.max(0, sag + dt * (s.ok ? -.9 : 1.7 * (1 + payload / 15))); worst = Math.max(worst, sag); if (i < 48) { st += s.ok; v += s.v; } }
    return {stable: st / 48, v: v / 48, safe: worst < .45};
  }
  function omniPlan() {                                      // try a family of gaits on the body as it is now, keep the best stable one
    const W = legs.filter(l => l.state === 'ok'); if (!W.length) return {cands: [], best: null};
    if (rolling()) { const g = {name: 'roll on wheels', duty: 1, off: legs.map(() => 0), roll: true, gain: [1, 1]}; return {cands: [{g, safe: true, v: .62}], best: {g}}; }
    const rank = l => W.indexOf(l), n = W.length, mk = (name, duty, fn) => ({name, duty, off: legs.map(l => l.state === 'ok' ? fn(l) : null), belly: false});
    const list = [
      mk('trot', .55, l => ((l.row + (l.side > 0 ? 1 : 0)) % 2) * .5),
      mk('pace', .6, l => l.side > 0 ? .5 : 0), mk('bound', .55, l => (l.row % 2) * .5),
      mk(n === 3 ? 'limp · 3-beat' : `wave · ${n}-beat`, .72, l => rank(l) / n), mk(n === 3 ? 'slow limp · 3-beat' : `slow wave · ${n}-beat`, .84, l => rank(l) / n),
      mk('hop', .6, () => 0),
    ];
    const out = list.map(g => {                              // balance thrust left vs right so it walks straight
      legs.forEach(l => l.g = 1);
      let L = 0, Rr = 0; for (let i = 0; i < 24; i++) legs.forEach(l => { if (l.state !== 'ok') return; const f = footAt(l, g, i / 24); if (f.stance) l.side < 0 ? L++ : Rr++; });
      g.gain = L && Rr ? [Math.min(1, Rr / L), Math.min(1, L / Rr)] : [1, 1];
      legs.forEach(l => l.g = l.side < 0 ? g.gain[0] : g.gain[1]);
      return {g, ...evalGait(g)};
    });
    const stable = out.filter(c => c.safe).sort((a, b) => b.v - a.v);
    let best = stable[0];
    if (!best) { const g = mk(`belly crawl · ${n} leg${n > 1 ? 's' : ''}`, .6, l => rank(l) / n); g.belly = true; g.gain = [1, 1]; best = {g, stable: 1, safe: true, v: evalGait(g).v}; out.push(best); }
    return {cands: out, best, list: out};
  }

  function changed(why, cause = 'other') {
    say(why); events.push(hist.length); walkDist = 0; cleared = null;
    if (cause !== 'other' || damaged()) { sinceDamage = 0; lastCause = cause; }
    if (sid === 'trials' && trial) return;               // the trial runner owns the gait
    if (omni) { mode = 'adapt'; modeT = 0; adaptDur = ADAPT[cause] || ADAPT.other; const pl = omniPlan(); cands = pl.cands; gait = pl.best ? pl.best.g : null; legs.forEach(l => l.g = 1); api.status('Adapting…'); }
    else { gait = specialistGait(); legs.forEach(l => l.g = 1); if (mode !== 'collapsed') mode = 'walk'; api.status(isDefault() ? 'Specialist · its own body' : 'Specialist · unknown body'); }
  }
  function applyGait() { if (gait && gait.gain) legs.forEach(l => l.g = l.side < 0 ? gait.gain[0] : gait.gain[1]); }
  const legState = () => Object.fromEntries(legs.map(l => [l.id, l.state]));
  const rec = result => record('body_trial', {scenario: sid || 'none', body: pid, brain: omni ? 'omni' : 'specialist', legs: legState(), leg_len: +lenMul.toFixed(2), payload, wheels_jammed: wheelJam,
    gait: gait ? gait.name : null, adapt_s: omni ? adaptDur : 0, recover_s: +sinceDamage.toFixed(1), speed: +Math.max(0, fwd).toFixed(2), result, trial: sid === 'trials' ? trial : undefined, context_trials: sid === 'trials' ? ctxN : undefined});

  function resetPose() { R = {x: 0, y: 0, a: 0, v: 0, phi: 0, sag: 0}; trail = []; trailDirty = true; V.roll = 0; V.up = 0; V.col = 0; }
  function setSlider(i, v) { const s = sliders[i]; if (!s) return; s.value = v; s.oninput(); }
  function pickScenario(id) {
    sid = id; const S = SCEN[id]; trial = 0; ctxN = 0; failed = 0; cleared = null; wheelJam = false; slash = null; sawDone = false; sawJob = null;
    scenBtns.forEach(b => b.classList.toggle('on', b.dataset.id === id));
    pid = id === 'wheels' ? 'wheel' : id === 'free' ? pid : 'quad'; build(); bodyBtn.textContent = 'Body: ' + P().name; refreshRig();
    lenMul = 1; payload = 0; sliders[0].value = 1; sliders[0].nextSibling && (sliders[0].nextSibling.textContent = '1'); sliders[1].value = 0; sliders[1].nextSibling && (sliders[1].nextSibling.textContent = '0');
    resetPose();
    if (id === 'wheels') { setSlider(1, 12); }
    if (id === 'limb' || id === 'free') setTool('cut'); if (id === 'knee') setTool('lock');
    if (id === 'trials') {
      legs.find(l => l.id === 'L1').state = 'locked'; legs.find(l => l.id === 'R1').state = 'cut'; legs.find(l => l.id === 'R1').visCut = true; refreshHidden();
      say('Trial 1 · a quadruped that must stand up on its hind legs, with a passive leg. No context yet.');
      startTrial();
    } else changed(`Scenario: ${S.name}`, 'body');
    clip(S.clip); api.status(S.short);
  }
  function startTrial() {                                   // trials: context = earlier failed trials prepended as a prompt
    trial++; resetPose(); walkDist = 0; sinceDamage = 0; forced = 0;
    const eff = omni ? ctxN : 0, pl = omniPlan(); cands = pl.cands;
    gait = eff >= 2 ? pl.best.g : (pl.list[eff === 1 ? 1 : 0] || pl.best).g; applyGait();
    mode = 'walk'; modeT = 0;
    api.status(`Trial ${trial} · ${eff} in context`);
  }
  function retry(withCtx) {
    if (sid !== 'trials' || mode !== 'await') return;
    ctxN = withCtx ? Math.min(2, failed) : 0;
    say(withCtx ? `Trial ${trial + 1} · ${ctxN} failed trial${ctxN > 1 ? 's' : ''} prepended as the prompt` : `Trial ${trial + 1} · no context: same as the first try`);
    startTrial();
  }

  function clearScenario() {
    const t = +sinceDamage.toFixed(1); cleared = {t}; clearT = 0; flash = 1;
    if (!best[sid] || t < best[sid]) best[sid] = t;
    say(`${SCEN[sid].short} cleared · walked ${WALK_GOAL} m, ${t} s after the damage. No retraining.`);
    rec('cleared'); api.status(`${SCEN[sid].short} cleared`);
    if (!completed) { completed = true; api.complete('Omni-bodied · adapted to damage'); }
  }

  // ---- simulation step (the stand's own adaptation logic; unchanged) ----
  function simStep(dt, t) {
    modeT += dt; sinceDamage += dt; clearT += dt; flash = Math.max(0, flash - dt * 1.5);
    if (slash) { slash.age += dt; if (!slash.live && slash.age > .6) slash = null; }
    if (mode === 'adapt' && modeT > adaptDur) {
      if (!gait) { mode = 'stuck'; say('No working legs left · repair one'); api.status('No working legs'); }
      else { mode = 'walk'; walkDist = 0; applyGait(); say(`New gait after ${adaptDur} s: ${gait.name}${gait.belly || gait.roll ? '' : ` · ${count('ok')} legs`}`); api.status('Walking · new gait'); }
    }
    if (mode === 'collapsed' && modeT > 2.2) {
      if (sid === 'trials' && trial) { mode = 'await'; api.status('Trial failed · retry'); }
      else { mode = 'walk'; R.sag = .45; say('Gets up · same policy, tries again'); }
    }
    const g = gait || specialistGait(), mul = mode === 'adapt' ? .25 : mode === 'walk' ? 1 : 0;
    R.phi = (R.phi + dt * freq() * (mode === 'adapt' ? .4 : mode === 'walk' ? 1 : 0)) % 1;
    const s = state(g, R.phi);
    const mismatch = omni ? 0 : Math.max(0, Math.abs(P().reach * lenMul - 1) - .25) * 1.2;
    if (sid === 'trials' && trial && mode === 'walk') { const eff = omni ? ctxN : 0; forced = modeT > .8 ? (eff === 0 ? 1.1 : eff === 1 ? .42 : 0) : 0; } else forced = 0;
    if (mode === 'walk') {
      R.sag = clamp(R.sag + dt * (s.ok ? -.9 : 1.7 * (1 + payload / 15)) + dt * (mismatch + forced), 0, 1);
      if (R.sag >= 1) {
        mode = 'collapsed'; modeT = 0; flash = .6;
        say(sid === 'trials' ? `Trial ${trial} fell` : omni ? 'Lost balance' : 'Flipped over · this is not the body it trained on');
        api.status(omni ? 'Fell' : 'Specialist flipped'); rec('collapsed');
        if (sid === 'trials') failed++;
        walkDist = 0;
      }
    }
    const jamDrag = legs.filter(l => l.state === 'locked' || (!omni && l.row >= 2)).length * .07;
    const vT = Math.max(0, s.v * (1 - payload / 50) * (1 - .6 * R.sag) - jamDrag) * mul;
    R.v = lerp(R.v, vT, 1 - Math.exp(-dt * 5));
    const kh = omni ? 2.6 : .5, maxC = omni ? 1.6 : isDefault() ? .3 : .08;
    const om = s.yaw * mul * (mode === 'walk' ? 1 : 0) + clamp(-kh * Math.atan2(Math.sin(R.a), Math.cos(R.a)), -maxC, maxC) * (R.v > .02 ? 1 : 0);
    R.a += om * dt; R.x += Math.cos(R.a) * R.v * dt; R.y += Math.sin(R.a) * R.v * dt;
    fwd = lerp(fwd, R.v * Math.cos(R.a), 1 - Math.exp(-dt * 1.2));
    if (mode === 'walk') walkDist += R.v * dt;
    legs.forEach(l => { const f = footAt(l, g, R.phi); if (mode === 'adapt' && l.state === 'ok') f.x += Math.sin(t * 17 + l.along * 9) * .03;
      l.stance = f.stance; l.foot.x = lerp(l.foot.x, f.x, 1 - Math.exp(-dt * 25)); l.foot.y = lerp(l.foot.y, f.y, 1 - Math.exp(-dt * 25)); });
    histT += dt; if (histT > .1) { histT = 0; hist.push(fwd); if (hist.length > 220) { hist.shift(); events = events.map(e => e - 1).filter(e => e >= 0); } trail.push({x: R.x, y: R.y}); if (trail.length > 400) trail.shift(); trailDirty = true; }
    if (sid && !cleared && omni && mode === 'walk' && SCEN[sid].need(snap()) && walkDist >= WALK_GOAL) clearScenario();
  }

  // =====================================================================================================
  // 3D: WebGL view under the kit's 2D overlay (panel, goal, log, gait strips stay 2D)
  // =====================================================================================================
  const PW = 260;
  const V = {roll: 0, up: 0, col: 0, wheel: 0, bz: .3, pitch: 0, sway: 0};    // visual (smoothed) state of the 3D robot
  const wrap = root.querySelector('.try-canvas');
  const gl = document.createElement('canvas'); gl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  wrap.prepend?.(gl); k.canvas.style.position = 'relative'; k.canvas.style.zIndex = 1;
  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({canvas: gl, antialias: true}); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace; }
  catch (e) { renderer = null; console.warn('omni-bodied: WebGL unavailable', e); }
  const scene3 = new THREE.Scene(), cam = new THREE.PerspectiveCamera(36, 1.5, .05, 90);
  const hemi = new THREE.HemisphereLight('#ffffff', '#8e8177', 1.2), sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, {left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: .5, far: 20});
  scene3.add(hemi, sun, sun.target);
  const setG = new THREE.Group(); scene3.add(setG);
  let curSet = '';
  function buildSet(id) {
    disposeTree(setG); setG.clear(); curSet = id;
    const S = SETS[id]; scene3.background = new THREE.Color(S.bg); scene3.fog = new THREE.Fog(S.bg, 12, 34);
    hemi.color.set(S.hemi[0]); hemi.groundColor.set(S.hemi[1]); hemi.intensity = S.hemi[2]; sun.intensity = S.sun;
    setG.add(groundPlane(S, 80)); S.build(setG, {span: [-30, 30], terrainAt: () => 0, rail: () => []});
  }
  const wantSet = () => !sid ? 'officeCarpet' : sid === 'free' && P().wheels ? 'patio' : SET_OF[sid];
  // path trail on the floor: the specialist's circles read at a glance
  const TR = 400, trPos = new Float32Array(TR * 3), trGeo = new THREE.BufferGeometry(); trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3)); trGeo.setDrawRange(0, 0);
  const trMat = new THREE.LineBasicMaterial({color: '#FF7E00', transparent: true, opacity: .8}), trLine = new THREE.Line(trGeo, trMat); trLine.frustumCulled = false; scene3.add(trLine);
  let trailDirty = true;
  // sparks + debris for the chainsaw cut
  const NS = 48, spPos = new Float32Array(NS * 3), spVel = new Float32Array(NS * 3), spLife = new Float32Array(NS), spGeo = new THREE.BufferGeometry(); spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
  const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({color: '#ffb347', size: .016, transparent: true, opacity: .95, depthWrite: false})); sparks.frustumCulled = false; scene3.add(sparks);
  spPos.fill(-100);
  let spNext = 0;
  const emit = (v, n, speed = 1.2) => { for (let i = 0; i < n; i++) { const j = spNext++ % NS; spPos.set([v.x, v.y, v.z], j * 3); spVel.set([(Math.random() - .5) * speed, Math.random() * speed * .9, (Math.random() - .5) * speed], j * 3); spLife[j] = .35 + Math.random() * .3; } };
  const debris = [];
  const sawG = new THREE.Group(), sawProp = chainsaw(), bootProp = boot(); sawG.add(sawProp); scene3.add(sawG, bootProp); sawG.visible = bootProp.visible = false;
  let sawJob = null, sawDone = false;
  const tmpM = new THREE.Matrix4(), zupQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  // robot
  let bot = null, inner = null, bodyIdx = {}, calfMeshes = {}, holders = [], rig = {}, hiddenKey = '', loadErr = '';
  MJ.spawn('go2').then(b => {
    if (dead) { b.dispose(); return; }
    bot = b; inner = b.group.children[0]; scene3.add(b.group);
    for (let i = 0; i < b.model.nbody; i++) bodyIdx[b.bodyName(i)] = i;
    const grey = {ffffff: '#8d9297', d6d9e4: '#a2a8b0', f3f9f9: '#b3b9bd'};        // the video quadruped is grey with a boxy head
    for (const m of b.meshes) { const hex = m.material.color.getHexString(); if (grey[hex]) m.material.color.set(grey[hex]); m.material.metalness = .2; m.material.roughness = .5; const nm = b.bodyName(m.userData.body); if (/_calf$/.test(nm)) (calfMeshes[nm.slice(0, 2)] ||= []).push(m); }
    buildRig(); refreshRig(); say('Stand-in quadruped loaded · MuJoCo model, kinematic gait on its joints');
  }).catch(e => { loadErr = String(e.message || e); console.warn('omni-bodied: Go2 load failed', e); say('Could not load the quadruped model'); });

  // things attached to a MuJoCo body (thigh, calf, base): wheels, stilts, knee lock, cut face, payload
  function holder(bodyName) { const h = new THREE.Group(); h.matrixAutoUpdate = false; h.userData.b = bodyIdx[bodyName]; inner.add(h); holders.push(h); return h; }
  function buildRig() {
    const metal = mat('#23272b', {metal: .7, rough: .35}), lockM = mat('#111111', {metal: .5, rough: .4}), shackM = mat('#c9ced2', {metal: .9, rough: .25}), cutM = new THREE.MeshBasicMaterial({color: '#FF7E00'});
    for (const l of legs) {
      const pf = LEGMAP[l.id], out = l.side < 0 ? 1 : -1, r = rig[l.id] = {};
      const hc = holder(`${pf}_calf`), ht = holder(`${pf}_thigh`);
      const st = new THREE.Group(); const rod = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, 1, 10), metal); rod.rotation.x = Math.PI / 2; rod.castShadow = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.017, 10, 8), lockM); st.add(rod, cap); hc.add(st); r.stilt = st; r.rod = rod; r.cap = cap;
      const wh = wheel(WR, .045); wh.position.set(0, out * .006, -A1); hc.add(wh); r.wheel = wh; r.hub = wh.children[1];
      const lk = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(.034, .016, .04), lockM); const sh = new THREE.Mesh(new THREE.TorusGeometry(.013, .004, 6, 14, Math.PI), shackM);
      sh.rotation.x = Math.PI / 2; sh.position.set(0, 0, .02); lk.add(body, sh); lk.position.set(.006, out * .045, 0); hc.add(lk); r.lock = lk;
      const cut = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .006, 16), cutM); cut.rotation.x = Math.PI / 2; cut.position.set(0, 0, -A1 - .003); ht.add(cut); r.cut = cut;
    }
    const hb = holder('base'), zw = new THREE.Group(); zw.rotation.x = Math.PI / 2; hb.add(zw);
    const box = cardboardBox(1, 1, 1); zw.add(box); rig.box = box; rig.boxHolder = hb;
  }
  function refreshRig() {
    if (!bot) return;
    const kill = []; legs.forEach(l => { if (l.state === 'cut' && l.visCut) kill.push(l.id); });
    const key = kill.join(',') + '|' + P().wheels; if (key === hiddenKey) return; hiddenKey = key;
    for (const m of bot.meshes) m.visible = true;
    const cutBodies = new Set(kill.map(id => bodyIdx[`${LEGMAP[id]}_calf`]));
    bot.hideBody(b => cutBodies.has(b));
  }
  const refreshHidden = () => { hiddenKey = ''; refreshRig(); };
  const bp = (name, off = [0, 0, 0], out = new THREE.Vector3()) => {   // MuJoCo body point → three.js (Y-up)
    const b = bodyIdx[name]; if (b === undefined || !bot) return null; const p = bot.data.xpos, m = bot.data.xmat, o = b * 3, r = b * 9;
    return out.set(p[o] + m[r] * off[0] + m[r + 1] * off[1] + m[r + 2] * off[2], p[o + 2] + m[r + 6] * off[0] + m[r + 7] * off[1] + m[r + 8] * off[2], -(p[o + 1] + m[r + 3] * off[0] + m[r + 4] * off[1] + m[r + 5] * off[2]));
  };
  function syncHolders() {
    const xp = bot.data.xpos, xm = bot.data.xmat;
    for (const h of holders) { const b = h.userData.b, p = b * 3, q = b * 9; h.matrix.set(xm[q], xm[q + 1], xm[q + 2], xp[p], xm[q + 3], xm[q + 4], xm[q + 5], xp[p + 1], xm[q + 6], xm[q + 7], xm[q + 8], xp[p + 2], 0, 0, 0, 1); h.matrixWorldNeedsUpdate = true; }
  }

  // ---- Go2 pose from the sim's gait state: 2-link IK per leg (foot offsets and phases come from footAt) ----
  const ang = {};                                            // last thigh/calf angle per leg id (for wheels + debris)
  function legLift(l, g, i, ext) {
    if (l.state !== 'ok' || g.roll || (rolling() && omni)) return 0; const off = g.off[i]; if (off == null) return 0;
    const p = (R.phi + off) % 1; if (p < g.duty) return 0; return Math.sin(Math.PI * (p - g.duty) / (1 - g.duty)) * (.05 + .05 * ext / .43) * (g.belly ? .5 : 1);
  }
  function poseGo2(dt, t, g) {
    const q = bot.data.qpos; bot.reset();
    const ext = Math.max(0, .426 * (lenMul - 1)), a2 = A1 + ext, crouch = Math.min(1, lenMul), wheeled = !!P().wheels;
    const fc = wheeled ? WR : ext > .02 ? .014 : .025;
    const eff = omni ? ctxN : 0, colT = mode === 'collapsed' || mode === 'await' ? 1 : 0;
    const trialsOn = sid === 'trials' && trial > 0 && (mode === 'walk' || mode === 'adapt' || mode === 'stuck');
    const upT = trialsOn ? (eff >= 2 ? 1 : eff === 1 ? .55 : .3) : 0;
    V.up += (upT - V.up) * (1 - Math.exp(-dt * 2.4)); V.col += (colT - V.col) * (1 - Math.exp(-dt * 6));
    const rollT = colT ? (omni ? 1.45 : Math.PI) : 0; V.roll += (rollT - V.roll) * (1 - Math.exp(-dt * (colT ? 5 : 4)));
    const cutF = legs.filter(l => l.state === 'cut' && l.row === 0).length, cutR = legs.filter(l => l.state === 'cut' && l.row === 1).length, cutL = legs.filter(l => l.state === 'cut' && l.side < 0).length, cutRt = legs.filter(l => l.state === 'cut' && l.side > 0).length;
    const dmgS = 1 - V.col, up = V.up;
    const pitch = -1.2 * up + .05 * (cutF - cutR) * dmgS * (1 - up), roll = V.roll - .045 * (cutL - cutRt) * dmgS * (1 - up);
    const walking = mode === 'walk' || mode === 'adapt';
    const hf = clamp(1 - .5 * R.sag - (g.belly && mode === 'walk' ? .4 : 0), .25, 1);
    const hipRotZ = HX * Math.sin(pitch);                          // rear hips drop when the nose lifts
    const hh = .62 * (A1 + a2) * crouch * hf * (1 - .1 * up);
    let bz = hh + fc - hipRotZ + (walking ? Math.sin(R.phi * Math.PI * 4) * .005 * (mode === 'walk' ? 1 : 0) : 0);
    bz = lerp(bz, .12, clamp(Math.abs(V.roll) / 1.2, 0, 1));
    const hg = [];
    legs.forEach((l, i) => {
      const pf = LEGMAP[l.id], front = l.row === 0, hx = front ? HX : -HX, hy = l.side < 0 ? HYT : -HYT, lim = TH_LIM[front ? 'F' : 'R'];
      let th, ca;
      if (colT || V.col > .05) { const fl = Math.exp(-modeT * 1.1) * V.col; th = .9 + Math.sin(t * 7 + i * 1.7) * .55 * fl; ca = -1.6 + Math.sin(t * 8.5 + i * 2.3) * .5 * fl; }
      else if (l.state === 'cut') { const amp = walking ? (mode === 'adapt' ? .5 : .85) : .1; th = .55 + Math.sin(R.phi * Math.PI * 2 + i * 1.6) * amp; ca = -1.5; }
      else if (l.state === 'locked') { const dxl = l.foot.x - l.along; th = .9 - dxl / (A1 * 1.24); ca = -1.8; }
      else {
        const dx = l.foot.x - l.along, lift = legLift(l, g, i, ext), hipH = rotYX(pitch, roll, [hx, hy, 0]);
        const vb = rotYXT(pitch, roll, [hipH[0] + dx, hipH[1], fc + lift - bz]);
        [th, ca] = ik(vb[0] - hx, -vb[2], A1, a2);
      }
      if (front && up > .02) { const tk = ease(clamp(up * 1.25, 0, 1)); th = lerp(th, 1.75 + Math.sin(t * 3 + l.side) * .12, tk); ca = lerp(ca, -2.45, tk); }
      th = clamp(th, lim[0], lim[1]); ca = clamp(ca, CALF_LIM[0], CALF_LIM[1]);
      bot.set(`${pf}_thigh_joint`, th); bot.set(`${pf}_calf_joint`, ca); ang[l.id] = th + ca;
      if (V.col > .05) bot.set(`${pf}_hip_joint`, l.side * Math.sin(t * 5 + i) * .25 * V.col);
      hg.push(l);
    });
    const yaw = -R.a, qq = qmul([Math.cos(yaw / 2), 0, 0, Math.sin(yaw / 2)], qmul([Math.cos(pitch / 2), 0, Math.sin(pitch / 2), 0], [Math.cos(roll / 2), Math.sin(roll / 2), 0, 0]));
    q[0] = R.x; q[1] = -R.y; q[2] = bz; q[3] = qq[0]; q[4] = qq[1]; q[5] = qq[2]; q[6] = qq[3];
    bot.kinematics(); V.bz = bz; V.pitch = pitch;
    return {ext, wheeled, fc};
  }

  const legScr = [];                                         // per leg: [[hip x,y],[foot x,y]] in canvas px (last frame)
  const toScr = v => { const p = v.clone().project(cam); return [PW + (p.x + 1) / 2 * (k.w - PW), (1 - p.y) / 2 * k.h]; };
  const projCam = new THREE.Vector3();
  let phys = null, physOn = false, physBusy = false, physMsg = '', physT = 0, physFell = false, physTilt = 0, physH = 0, physTok = 0;
  const camS = {x: 0, y: .3, z: 0};
  function detachCalf(l) {                                   // the cut calf falls off and bounces on the floor
    const pf = LEGMAP[l.id], ms = calfMeshes[pf], c0 = bp(`${pf}_calf`); if (!ms || !c0 || !bot) return;
    const b = bodyIdx[`${pf}_calf`], pm = [bot.data.xpos[b * 3], bot.data.xpos[b * 3 + 1], bot.data.xpos[b * 3 + 2]];
    const g = new THREE.Group(), in2 = new THREE.Group(); in2.quaternion.copy(zupQ); g.add(in2);
    const off = new THREE.Matrix4().makeTranslation(-pm[0], -pm[1], -pm[2]);
    for (const m of ms) { const c = new THREE.Mesh(m.geometry, m.material); c.matrixAutoUpdate = false; c.matrix.copy(m.matrix).premultiply(off); c.castShadow = true; in2.add(c); }
    g.position.copy(c0); scene3.add(g);
    const out = l.side < 0 ? -1 : 1;
    debris.push({g, v: new THREE.Vector3(-.15 * R.v, 1.3, out * .9), w: new THREE.Vector3((Math.random() - .5) * 8, (Math.random() - .5) * 4, (Math.random() - .5) * 8), t: 0});
    emit(c0, 26, 1.8);
  }
  function startCut(l) {                                     // the first cut is done with a chainsaw (as in the clip); later ones just snap
    if (!sawDone && bot) { sawDone = true; sawJob = {leg: l, t: 0, cut: false}; }
    else { l.visCut = true; refreshHidden(); detachCalf(l); }
  }
  function updateSaw(dt) {
    const s = sawJob; sawG.visible = bootProp.visible = !!s;
    if (!s) return;
    s.t += dt; const l = s.leg, pf = LEGMAP[l.id], kn = bp(`${pf}_calf`); if (!kn) return;
    const out = l.side < 0 ? -1 : 1, u = s.t, dur = 1.5;
    const offs = u < .5 ? .46 + .45 * (1 - ease(u / .5)) : u < .95 ? .46 - .1 * ease((u - .5) / .45) : .36 + .6 * ease(clamp((u - .95) / .55, 0, 1));
    const jit = u > .45 && u < .95 ? (Math.random() - .5) * .012 : 0;
    sawG.position.set(kn.x + jit, kn.y - .06 - .05 * clamp((u - .4) / .5, 0, 1), kn.z + out * offs); sawG.rotation.set(0, out * Math.PI / 2, 0);
    bootProp.position.set(kn.x - .32, 0, kn.z + out * (offs + .55)); bootProp.rotation.set(0, out * Math.PI / 2, 0);
    if (u > .45 && u < .95) emit(new THREE.Vector3(kn.x, kn.y - .06, kn.z), 1, 1.2);
    if (!s.cut && u > .55) { s.cut = true; l.visCut = l.state === 'cut'; refreshHidden(); if (l.visCut) detachCalf(l); flash = .4; }
    if (u > dur) sawJob = null;
  }
  function updateFx(dt) {
    for (let i = 0; i < NS; i++) { if (spLife[i] <= 0) { spPos[i * 3 + 1] = -100; continue; } spLife[i] -= dt; spVel[i * 3 + 1] -= 6 * dt; for (let a = 0; a < 3; a++) spPos[i * 3 + a] += spVel[i * 3 + a] * dt; if (spPos[i * 3 + 1] < .005) { spPos[i * 3 + 1] = .005; spVel[i * 3 + 1] *= -.2; } }
    spGeo.attributes.position.needsUpdate = true;
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i]; d.t += dt; d.v.y -= 7 * dt; d.g.position.addScaledVector(d.v, dt);
      if (d.g.position.y < .05) { d.g.position.y = .05; d.v.y *= -.3; d.v.x *= .6; d.v.z *= .6; d.w.multiplyScalar(.6); }
      d.g.rotation.x += d.w.x * dt; d.g.rotation.y += d.w.y * dt; d.g.rotation.z += d.w.z * dt;
      if (d.t > 3.5) { scene3.remove(d.g); debris.splice(i, 1); }
    }
  }

  function updateRig(dt, t, info) {
    syncHolders();
    const {ext, wheeled} = info, out2 = legs.map(l => l.id), rollingNow = wheeled && (rolling() && omni || (gait?.roll ?? false));
    V.wheel += (rollingNow && mode !== 'collapsed' ? R.v / WR : 0) * dt;
    for (const l of legs) {
      const r = rig[l.id], gone = l.state === 'cut' && l.visCut;
      r.stilt.visible = ext > .02 && !gone; if (r.stilt.visible) { r.rod.scale.y = ext + .03; r.rod.position.z = -A1 - ext / 2 + .015; r.cap.position.z = -A1 - ext - .004; }
      r.wheel.visible = wheeled && !gone; if (r.wheel.visible) { r.wheel.rotation.y = wheelJam ? 0 : V.wheel - (ang[l.id] || 0); r.hub.material.color.set(wheelJam ? '#FF7E00' : '#9aa0a6'); }
      r.lock.visible = l.state === 'locked'; r.cut.visible = l.state === 'cut' && l.visCut;
    }
    void out2;
    const bx = rig.box; rig.boxHolder.visible = payload > 0;
    if (payload > 0) { const sx = .15 + payload * .0062, sy = .1 + payload * .0045, sz = .16 + payload * .004; bx.scale.set(sx, sz, sy); bx.position.set(0, 0, .09 + sy / 2); bx.rotation.set(0, 0, 0); }
    void dt; void t;
  }

  // ---- render + camera ----
  function update3d(dt, t) {
    const want = wantSet(); if (want !== curSet) buildSet(want);
    let px = 0, pz = 0, py = .25, dist = 2.35, info = null;
    const g = gait || specialistGait();
    if (physOn && phys) {
      phys.update(Math.min(dt, 1 / 30), {vx: .3, yaw: 0}); const q = phys.data.qpos; px = q[0]; pz = -q[1]; py = Math.max(.2, q[2] * .8);
      physT += dt; const tilt = Math.acos(Math.min(1, Math.abs(1 - 2 * (q[4] * q[4] + q[5] * q[5])))) * 180 / Math.PI; physTilt = tilt; physH = q[2];
      if (!physFell && (q[2] < .16 || tilt > 55)) { physFell = true; say('Real physics: it fell. The stand-in controller is not a learned policy.'); api.status('Physics · fell'); }
    } else if (bot) {
      info = poseGo2(dt, t, g); px = R.x; pz = R.y; py = V.bz * .75 + .05; dist = 2.35 * Math.sqrt(Math.max(1, lenMul)) * (1 + .12 * V.up);
      updateRig(dt, t, info); updateSaw(dt);
    }
    bot && (bot.group.visible = !(physOn && phys));
    if (phys) phys.group.visible = physOn;
    updateFx(dt);
    // scroll the set with the robot (it repeats every WRAP metres in x)
    setG.position.set(Math.round(px / WRAP) * WRAP, 0, 0);
    // path trail
    if (trailDirty) { const n = Math.min(TR, trail.length); for (let i = 0; i < n; i++) trPos.set([trail[i].x, .006, trail[i].y], i * 3); trGeo.setDrawRange(0, physOn ? 0 : n); trGeo.attributes.position.needsUpdate = true; trailDirty = false; }
    trMat.color.set(omni ? '#FF7E00' : '#5C6670'); trLine.visible = !physOn;
    // camera: side-follow, robot in the upper-left of the scene (the bottom-right corner belongs to the video)
    const vw = Math.max(10, k.w - PW), vh = Math.max(10, k.h); cam.aspect = vw / vh;
    const a = 1 - Math.exp(-dt * 4); camS.x = lerp(camS.x, px, a); camS.y = lerp(camS.y, py, a); camS.z = lerp(camS.z, pz, a);
    const hH = dist * Math.tan(cam.fov * Math.PI / 360), hW = hH * cam.aspect;
    const tx = camS.x + .2 * hW, ty = camS.y - .1 * hH, tz = camS.z;
    cam.position.set(tx - .7, ty + .16 * dist + .12, tz + dist); cam.lookAt(tx, ty, tz); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    sun.position.set(camS.x - 2, 6, camS.z + 3.5); sun.target.position.set(camS.x, 0, camS.z); sun.target.updateMatrixWorld();
    if (renderer) {
      const pr = renderer.getPixelRatio(); if (gl.width !== Math.round(k.w * pr) || gl.height !== Math.round(k.h * pr)) renderer.setSize(k.w, k.h, false);
      renderer.setScissorTest(true); renderer.setViewport(PW, 0, vw, vh); renderer.setScissor(PW, 0, vw, vh); renderer.render(scene3, cam);
    }
    // screen-space leg segments for picking / hover
    if (bot && !physOn) {
      legs.forEach((l, i) => { const pf = LEGMAP[l.id], h = bp(`${pf}_thigh`), f = l.state === 'cut' ? bp(`${pf}_calf`) : bp(`${pf}_calf`, [0, 0, -(A1 + (info ? info.ext : 0))]); if (h && f) legScr[i] = [toScr(h), toScr(f)]; });
      const top = new THREE.Vector3(R.x, V.bz + .3, R.y); projCam.copy(top); labelPos = toScr(projCam);
    }
    void t;
  }
  let labelPos = null;
  const legSeg = l => legScr[legs.indexOf(l)] || [[-99, -99], [-99, -99]];
  const pick = p => { let bi = -1, bd = 18; legs.forEach((l, i) => { const [a, b] = legSeg(l); const d = segDist(p, {x: a[0], y: a[1]}, {x: b[0], y: b[1]}); if (d < bd) { bd = d; bi = i; } }); return bi; };

  function damage(l, how, bySlash) {
    if (P().wheels && how !== 'cut') { toggleWheels(); return; }
    if (how === 'cut') { l.state = 'cut'; l.visCut = false; flash = .5; if (bySlash && !sawClip) { sawClip = true; clip('Chainsaw'); } changed(`Cut ${l.id} at the thigh · calf gone`, 'cut'); startCut(l); }
    else { l.state = 'locked'; l.jam = clamp(l.foot.x - l.along, -stride() / 2, stride() / 2); changed(`Locked ${l.id} knee motor`, 'lock'); }
  }
  function toggleWheels() {
    if (!P().wheels) { say('This body has no wheels · pick “Wheels + payload”'); return; }
    wheelJam = !wheelJam; changed(wheelJam ? 'Wheels jammed without warning' : 'Wheels free again', 'wheels');
  }
  function setTool(t) { tool = t; toolBtn.textContent = tool === 'cut' ? 'Tool: cut calf ✂' : 'Tool: lock knee'; }

  k.onMove(p => {
    if (physOn) return;
    hover = slash ? -1 : pick(p);
    if (slash && slash.live) {
      const last = slash.pts[slash.pts.length - 1], cur = [p.x, p.y]; slash.pts.push(cur); if (slash.pts.length > 40) slash.pts.shift();
      legs.forEach(l => { if (l.state === 'cut') return; const [a, b] = legSeg(l); if (cross(last, cur, a, b)) damage(l, 'cut', true); });
    }
  });
  k.onDown(p => {
    const c = chipRects.find(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    if (c) { ({ctx: () => retry(true), noctx: () => retry(false), wheels: toggleWheels, repair: repairAll, physreset: () => { phys?.reset(); physFell = false; physT = 0; say('Real physics reset'); }})[c.id]?.(); return; }
    if (physOn || p.x < PW) return;
    const i = pick(p);
    if (i < 0) { slash = {pts: [[p.x, p.y]], live: true, age: 0}; return; }
    const l = legs[i];
    if (l.state !== 'ok') { l.state = 'ok'; l.visCut = false; refreshHidden(); changed(`Repaired ${l.id}`); return; }
    damage(l, tool);
  });
  k.onUp(() => { if (slash) { slash.live = false; slash.age = 0; } });
  function repairAll() { legs.forEach(l => { l.state = 'ok'; l.visCut = false; }); wheelJam = false; sawDone = false; sawJob = null; refreshHidden(); if (sid === 'trials') { trial = 0; } changed('All legs repaired'); }

  // ---- real physics (optional): composed Go2 in MuJoCo with the stand-in controller ----
  async function setPhysics(on) {
    const tok = ++physTok; physOn = on; physBtn.textContent = 'Real physics (MuJoCo)' + (on ? ' · ON' : ' · OFF'); physBtn.classList.toggle('on', on);
    if (!on) { if (phys) { scene3.remove(phys.group); phys.dispose(); phys = null; } physMsg = ''; api.status('Kinematic quadruped'); say('Back to the kinematic quadruped (stand-in physics off)'); return; }
    physMsg = 'Loading MuJoCo · composing the quadruped…'; physFell = false; physT = 0; api.status('Real physics · loading');
    try {
      const {spawnComposed} = await import('../parts/loader.js');
      const nb = await spawnComposed({torso: 'go2_base', legs: {part: 'go2_leg', layout: 'quad'}}, {THREE});
      if (dead || tok !== physTok || !physOn) { nb.dispose(); return; }
      phys = nb; scene3.add(phys.group); physMsg = ''; say('Real physics: Go2 in MuJoCo, stand-in controller (not the Skild Brain)'); api.status('Real physics · stand-in controller'); record('real_physics', {body: 'go2', controller: 'stand-in'});
    } catch (e) { physMsg = 'Could not load real physics: ' + (e.message || e); console.warn(e); physOn = false; physBtn.textContent = 'Real physics (MuJoCo) · OFF'; physBtn.classList.toggle('on', false); }
  }

  k.frame((dt, t) => {
    if (!physOn) simStep(dt, t);
    update3d(dt, t);
    draw(t, gait || specialistGait());
  });

  const pill = (x, y, w, h, fill = B.white, a = .9) => { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(12, h / 2)); ctx.fill(); ctx.restore(); };
  const tw = (s, size = 13, weight = 500, mono = false) => { ctx.font = `${weight} ${size}px ${mono ? '"Geist Mono", ui-monospace, monospace' : 'Geist, system-ui, sans-serif'}`; return ctx.measureText(s).width; };

  function draw(t, g) {
    ctx.clearRect(0, 0, k.w, k.h);
    const x0 = PW + 16, S = sid ? SCEN[sid] : null, avail = k.w - x0 - 12;
    if (!renderer) { ctx.fillStyle = B.warm1; ctx.fillRect(PW, 0, k.w - PW, k.h); k.text('3D view unavailable (WebGL is off in this browser)', x0, 100, {size: 13, color: B.cool2}); }
    const goal = S ? `Goal: ${S.goal}.` : 'Goal: pick a scenario below and break the robot. It must walk on.';
    const subs = [`3D · simulated · stand-in quadruped in Skild livery, on its MuJoCo joints · drag across a leg to cut it · click a leg to ${tool === 'cut' ? 'cut' : 'lock'} it, again to repair`, `3D · simulated · drag across a leg to cut it · click a leg to ${tool === 'cut' ? 'cut' : 'lock'} it`, '3D · simulated · stand-in quadruped in Skild livery'];
    const sub = subs.find(s => tw(s.toUpperCase(), 10, 500, true) < avail - 24) || subs[2];
    pill(x0 - 10, 8, Math.min(avail + 10, Math.max(tw(goal, 15, 600), tw(sub.toUpperCase(), 10, 500, true)) + 24), 46);
    k.text(goal, x0, 28, {size: 15, weight: 600}); k.label(sub, x0, 46);
    const list = [];
    if (physOn) list.push({id: 'physreset', label: '↻ Reset physics'});
    else {
      if (sid === 'trials' && mode === 'await') list.push({id: 'ctx', label: `↻ Retry · prepend ${Math.min(2, failed)} failed trial${Math.min(2, failed) > 1 ? 's' : ''}`, on: true}, {id: 'noctx', label: '↻ Retry · no context'});
      if (P().wheels) list.push({id: 'wheels', label: wheelJam ? '⚙ Free the wheels' : '⚙ Jam the wheels', on: sid === 'wheels' && !wheelJam});
      if (damaged()) list.push({id: 'repair', label: '✚ Repair all'});
    }
    chipRects = chips(k, list, x0, 62, k.w - 20);
    let sy = Math.max(62, ...chipRects.map(r => r.y + 26)) + 14;
    if (!bot && !loadErr) { pill(x0 - 8, sy - 14, 250, 24); k.text('Loading Skild quadruped · MuJoCo Menagerie…', x0, sy + 2, {size: 12, mono: true, color: B.cool2}); sy += 34; }
    if (loadErr) { pill(x0 - 8, sy - 14, 320, 24); k.text('Could not load the quadruped model', x0, sy + 2, {size: 12, mono: true, color: B.black}); sy += 34; }
    if (physOn || physMsg) {
      const lab = physMsg || `Real physics · MuJoCo · stand-in controller, not the Skild Brain`, w2 = tw(lab, 12, 600, true) + 24;
      pill(x0 - 8, sy - 16, w2, 34, B.white, .92); k.text(lab, x0 + 4, sy + 1, {size: 12, mono: true, weight: 600, color: physMsg ? B.cool2 : B.orange});
      if (phys) k.text(`${physT.toFixed(0)} s · height ${physH.toFixed(2)} m · tilt ${physTilt.toFixed(0)}°${physFell ? ' · fell' : ''}`, x0 + 4, sy + 14, {size: 10, mono: true, color: B.cool2});
      sy += 46;
    } else {
      // Trial N overlay (the clip shows it on screen)
      if (sid === 'trials' && trial > 0) {
        const lab = `Trial ${trial}`, w2 = tw(lab, 34, 600, true) + 36, eff = omni ? ctxN : 0, sub2 = mode === 'await' ? 'failed' : `${eff} failed trial${eff === 1 ? '' : 's'} in context`;
        pill(x0 - 8, sy - 10, Math.max(w2, tw(sub2, 12, 500, true) + 30), 66, B.white, .92);
        k.text(lab, x0 + 6, sy + 28, {size: 34, mono: true, weight: 600, color: mode === 'await' ? B.black : B.orange}); k.text(sub2, x0 + 6, sy + 48, {size: 12, mono: true, color: B.cool2});
        sy += 78;
      }
      const big = mode === 'adapt' ? 'Adapting…' : mode === 'collapsed' ? (omni ? 'Fell' : 'Flipped over') : mode === 'await' ? '' : mode === 'stuck' ? 'No working legs' : !omni && P().wheels && wheelJam ? 'Wheels spinning · stuck' : '';
      if (big) {
        const sub2 = mode === 'adapt' ? `${Math.min(modeT, adaptDur).toFixed(1)} / ${adaptDur} s · ${lastCause === 'cut' ? 'the post: ~7–8 s for a lost limb' : lastCause === 'lock' ? 'the post: ~2–3 s for locked knees' : 'in-context: no retraining, no weight updates'}` : '';
        const w2 = Math.max(tw(big, 26, 600), tw(sub2, 11, 500, true)) + 32, dots = mode === 'adapt' ? '' : '';
        pill(x0 - 8, sy - 10, w2, sub2 ? 62 : 42, B.white, .92);
        k.text(big + dots, x0 + 8, sy + 20, {size: 26, weight: 600, color: mode === 'adapt' ? B.orange : B.black}); if (sub2) k.text(sub2, x0 + 8, sy + 40, {size: 11, mono: true, color: B.cool2});
        if (mode === 'adapt') { ctx.fillStyle = B.warm2; ctx.fillRect(x0 + 8, sy + 47, w2 - 32, 4); ctx.fillStyle = B.orange; ctx.fillRect(x0 + 8, sy + 47, (w2 - 32) * clamp(modeT / adaptDur, 0, 1), 4); }
        sy += sub2 ? 74 : 54;
      }
      if (sid && omni && mode === 'walk' && !cleared && SCEN[sid].need(snap())) { pill(x0 - 8, sy - 22, 214, 44, B.white, .92); k.meter(x0 + 4, sy + 6, 190, walkDist / WALK_GOAL, `Walk on · ${Math.min(walkDist, WALK_GOAL).toFixed(1)} / ${WALK_GOAL} m`); sy += 50; }
      if (cleared && clearT < 5) {
        const cw = Math.min(360, avail - 20); ctx.fillStyle = B.orange; ctx.beginPath(); ctx.roundRect(x0 - 8, sy - 10, cw, 54, 12); ctx.fill();
        k.text(`${S.short} cleared · recovered in ${cleared.t} s`, x0 + 8, sy + 13, {size: 14, weight: 600, color: B.black});
        k.text('Same brain, never trained on this body. Try another.', x0 + 8, sy + 32, {size: 12, color: B.black});
      }
    }
    if (!physOn && bot) {
      if (hover >= 0 && !slash && legScr[hover]) { const l = legs[hover], [h, f] = legSeg(l); ctx.strokeStyle = 'rgba(255,126,0,.5)'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(...h); ctx.lineTo(...f); ctx.stroke();
        const lab = l.state === 'ok' ? (P().wheels ? 'Jam wheels' : `${tool === 'cut' ? 'Cut' : 'Lock'} ${l.id}`) : `Repair ${l.id}`; pill(f[0] + 6, f[1] - 26, tw(lab, 12, 600) + 16, 22); k.text(lab, f[0] + 14, f[1] - 10, {size: 12, weight: 600, color: B.orange}); }
      if (slash && slash.pts.length > 1) { ctx.strokeStyle = `rgba(255,126,0,${slash.live ? .9 : .9 * (1 - slash.age / .6)})`; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); slash.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); }
      if (labelPos && labelPos[0] > PW + 40 && labelPos[0] < k.w - 40) { const lab = omni ? 'Omni-bodied brain' : 'Specialist brain', w2 = tw(lab, 11, 600, true) + 18; pill(labelPos[0] - w2 / 2, labelPos[1] - 34, w2, 20, omni ? B.orange : B.white, .92); k.text(lab, labelPos[0], labelPos[1] - 20, {align: 'center', size: 11, mono: true, weight: 600, color: B.black}); }
    }
    if (flash > 0) { ctx.fillStyle = `rgba(255,126,0,${flash * .1})`; ctx.fillRect(PW, 0, k.w - PW, k.h); }

    // ---- left panel ----
    const x = 18, iw = PW - 36;
    ctx.fillStyle = B.white; ctx.fillRect(0, 0, PW, k.h); ctx.fillStyle = B.warm2; ctx.fillRect(PW, 0, 1, k.h);
    k.label('Brain', x, 26); k.text(omni ? 'Omni-bodied' : 'Specialist', x, 48, {size: 17, weight: 600, color: omni ? B.orange : B.black});
    k.label('Bodies in training', x, 70); k.text(omni ? '100,000' : '1', x + iw, 70, {align: 'right', size: 12, mono: true, weight: 600});
    k.label('This body in training', x, 88); k.text(omni ? 'never · zero-shot' : isDefault() ? 'its only one' : 'never', x + iw, 88, {align: 'right', size: 12, mono: true, weight: 600, color: omni || !isDefault() ? B.orange : B.black});
    k.label('Forward speed', x, 114); k.text(`${Math.max(0, fwd).toFixed(2)} m/s`, x + iw, 114, {align: 'right', size: 13, mono: true, weight: 600});
    k.meter(x, 122, iw, fwd / .7);
    const sy2 = 136, sh = 38; ctx.fillStyle = B.warm1; ctx.beginPath(); ctx.roundRect(x, sy2, iw, sh, 6); ctx.fill();
    ctx.fillStyle = B.warm3; events.forEach(e => ctx.fillRect(x + e / 220 * iw, sy2, 1, sh));
    ctx.strokeStyle = B.orange; ctx.lineWidth = 1.5; ctx.beginPath(); hist.forEach((v, i) => { const X = x + i / 220 * iw, Y = sy2 + sh - 4 - clamp(v / .7, 0, 1) * (sh - 8); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
    k.label(`Gait · ${mode === 'adapt' ? 'searching' : g.roll ? 'rolling' : g.name}`, x, 196);
    const gy = 204, rh = Math.min(12, Math.max(6, (k.h - 470) / Math.max(1, legs.length))), cw = iw - 28;
    legs.forEach((l, i) => {
      const y = gy + i * (rh + 3); k.text(l.id, x, y + rh - 2, {size: 10, mono: true, color: B.cool2});
      if (l.state === 'cut') { ctx.strokeStyle = B.cool1; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x + 28, y + rh / 2); ctx.lineTo(x + 28 + cw, y + rh / 2); ctx.stroke(); ctx.setLineDash([]); return; }
      for (let j = 0; j < 32; j++) { const f = footAt(l, g, j / 32); ctx.fillStyle = f.passive ? B.cool1 : f.stance ? (mode === 'adapt' ? B.warm3 : B.orange) : B.warm1; ctx.fillRect(x + 28 + j * cw / 32, y, cw / 32 - .5, rh); }
    });
    ctx.fillStyle = B.black; ctx.fillRect(x + 28 + R.phi * cw, gy - 3, 1.5, legs.length * (rh + 3) + 3);
    let ly = gy + legs.length * (rh + 3) + 20;
    if (sid === 'trials') {                                  // context strip: earlier trials prepended as the prompt
      k.label('Context · earlier trials', x, ly);
      for (let i = 0; i < 2; i++) { const on = i < ctxN && omni; ctx.fillStyle = on ? B.orange : B.warm2; ctx.beginPath(); ctx.roundRect(x + i * 58, ly + 8, 52, 20, 6); ctx.fill(); k.text(`trial ${i + 1}`, x + i * 58 + 26, ly + 22, {size: 10, mono: true, align: 'center', color: on ? B.black : B.cool2}); }
      k.text(`→ trial ${Math.max(1, trial)}`, x + 124, ly + 22, {size: 11, mono: true, weight: 600});
      ly += 44;
    }
    k.label('Scenarios cleared · best recovery', x, ly);
    SIDS.forEach((id, i) => {
      const col = i % 2, row = Math.floor(i / 2), bx = x + col * (iw / 2), by = ly + 16 + row * 20, b = best[id];
      ctx.fillStyle = b !== undefined ? B.orange : id === sid ? B.black : B.warm2; ctx.beginPath(); ctx.arc(bx + 5, by - 4, 5, 0, 7); ctx.fill();
      k.text(`${SCEN[id].short}${b !== undefined ? ' ' + b + ' s' : ''}`, bx + 15, by, {size: 11, mono: true, color: b !== undefined || id === sid ? B.black : B.cool2});
    });
    ly += 16 + 3 * 20 + 8;
    if (mode === 'adapt' && cands.length && ly < k.h - 60 && !physOn) {
      k.label('Trying gaits (simulated)', x, ly); const shown = Math.min(cands.length, Math.floor(modeT / (adaptDur / cands.length)) + 1);
      cands.slice(0, shown).forEach((cd, i) => k.text(`${cd.g.name.padEnd(19)} ${cd.safe ? 'ok ' + (cd.v || 0).toFixed(2) + ' m/s' : 'falls'}`, x, ly + 18 + i * 15, {size: 11, mono: true, color: cd.g === gait && shown === cands.length ? B.orange : B.cool2}));
    } else {
      k.label('Log', x, ly);
      drawLog(k, log.slice(-6), x, ly + 18, iw, k.h - ly - 24);
    }
  }

  const scenBtns = SIDS.map(id => { const b = k.button(SCEN[id].name, () => pickScenario(id)); b.dataset.id = id; return b; });
  const bodyBtn = k.button('Body: Skild quadruped', () => {
    const ids = Object.keys(PRESETS); pid = ids[(ids.indexOf(pid) + 1) % ids.length]; build(); wheelJam = false; trial = 0; refreshRig();
    bodyBtn.textContent = 'Body: ' + P().name; resetPose(); changed(`New body: ${P().name.toLowerCase()} · never seen in training`, 'body');
  });
  const sliders = [
    k.slider('Leg length', .6, 2.2, 1, v => { if (v !== lenMul) { const was = lenMul; lenMul = v; changed(`Leg length ×${v.toFixed(2)}${v >= 1.6 && was < 1.6 ? ' · stilts' : ''}`, v >= 1.6 ? 'stilts' : 'other'); if (v >= 1.6 && was < 1.6 && sid !== 'stilts') clip('stilts'); } }, .05),
    k.slider('Payload (kg · illustrative)', 0, 20, 0, v => { if (v !== payload) { payload = v; changed(`Payload ${v} kg`); } }, 1),
  ];
  const toolBtn = k.button('Tool: cut calf ✂', () => setTool(tool === 'cut' ? 'lock' : 'cut'));
  const brainBtn = k.button('Brain: omni-bodied', () => {
    omni = !omni; brainBtn.textContent = omni ? 'Brain: omni-bodied' : 'Brain: specialist'; brainBtn.classList.toggle('on', omni); R.sag = 0;
    if (mode === 'collapsed' || mode === 'stuck' || mode === 'await') mode = 'walk'; trail = []; trailDirty = true;
    if (sid === 'trials' && trial) startTrial();
    changed(omni ? 'Switched to the omni-bodied brain' : 'Switched to a specialist (trained on 1 robot)');
  }, {primary: true});
  brainBtn.classList.add('on');
  const physBtn = k.button('Real physics (MuJoCo) · OFF', () => setPhysics(!physOn));
  build(); gait = omniPlan().best.g; applyGait(); api.status('Pick a scenario');
  return () => {
    dead = true; physTok++;
    if (phys) { scene3.remove(phys.group); phys.dispose(); phys = null; }
    if (bot) { scene3.remove(bot.group); disposeTree(bot.group); bot.dispose(); bot = null; }
    disposeTree(scene3);
    if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); }
    k.destroy();
  };
}
