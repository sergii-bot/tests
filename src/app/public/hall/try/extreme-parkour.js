// TRY · Parkour, two bodies. Skild AI's showcase "Parkour compilation" is a humanoid video; the research line behind it,
// Extreme Parkour with Legged Robots (Cheng*, Shi*, Agarwal, Pathak · CMU · ICRA 2024), uses a quadruped. Build one shared
// course, pick a body, and let a stand-in depth-driven controller run it. Side view, stylized, simulated.
// Robot dog facts (project page + arXiv abstract): a small low-cost robot with imprecise actuation; a single front-facing
// depth camera that is low-frequency, jittery and prone to artifacts; a single neural net policy operating directly from
// the camera image, trained in simulation with large-scale RL; high jump on obstacles 2x its height; long jump across
// gaps 2x its length; handstand; run across tilted ramps. The page gives no angle for the ramps and no length for the
// handstand, so those sizes are ours. Everything past 2x is outside what the paper reports: here the run fails.
// Humanoid: limited to what Skild's own material shows or names. Skild's 6 Aug 2025 post ("One Model, Any Scenario") describes
// climbing stairs, obstacle courses with pallets, gaps and uneven steps, from online vision and proprioception; the parkour
// clip posters show box jumps between plyo boxes / crates and fire-escape stairs. No Skild source confirms a vault, a
// handstand, a flip or a ramp for the humanoid, so those pieces are dog-only (ramp, handstand: Extreme Parkour, CMU) or gone
// (vault). No numbers are published for the humanoid's jumps, so every limit here is the stand's own (box 0.6x height, gap
// 1x height). The controller is a stand-in: Skild's real policy is not public.
import {kit, B, lerp, clamp, rand} from './kit.js';

const BL = 1, BH = .55, CY = .46, L1 = .23, L2 = .23, SPEED = 1.7, MAXJ = 2, RUNWAY = 2.1, RANGE = 3.2, NR = 20, HIST = 48;
const FH = [.28, -.06], HH = [-.38, -.06], HAND_P = -1.25, RAMP_H = .3, BOX_TOP = 1.4, MAXP = 8;
// humanoid (world units): body height, leg length, standing pelvis height, segments
const HUM = 1, LEG = .5, HIPY = .47, T1 = .255, T2 = .255, TOR = .3, UA = .17, FA = .17, HSPEED = 1.5;
const HLIM = {box: .6, gap: 1};                           // the stand's own humanoid limits, × body height (not Skild numbers)
const TREAD = .2, RISE = .075;                            // humanoid stair flight: tread depth and step rise, world units (stylized)
const TYPES = {
  box: {name: 'High jump', unit: '× height', short: 'H', min: .5, max: 2.5, def: 1.4, paper: true},
  gap: {name: 'Long jump', unit: '× length', short: 'L', min: .5, max: 2.5, def: 1.4, paper: true},
  ramp: {name: 'Tilted ramp', unit: '× length (ours)', short: 'L', min: 1.5, max: 3, def: 2, paper: false},
  hand: {name: 'Handstand', unit: '× length (ours)', short: 'L', min: 1, max: 3, def: 1.5, paper: false},
  stairs: {name: 'Stair flight', unit: '× height (ours)', short: 'H', min: .15, max: .6, def: .3, no: true},
};
const HTYPES = {
  box: {name: 'Box jump', unit: '× height (limit 0.6)', short: 'H', min: .2, max: .9, def: .4},
  gap: {name: 'Gap', unit: '× height (limit 1)', short: 'H', min: .3, max: 1.4, def: .6},
  ramp: {name: 'Tilted ramp', unit: '× height', short: 'H', min: 1.5, max: 3, def: 2, no: true},
  hand: {name: 'Handstand', unit: '× height', short: 'H', min: 1, max: 3, def: 1.5, no: true},
  stairs: {name: 'Stair flight', unit: '× height (ours)', short: 'H', min: .15, max: .6, def: .3},
};
const PRESETS = {
  'Warm-up': [['box', 1], ['gap', 1], ['ramp', 2]],
  'Paper max': [['box', 2], ['gap', 2], ['ramp', 2], ['hand', 1.5]],
  'Beyond 2×': [['box', 2.3], ['gap', 2.3]],
};
const HPRESETS = {
  'Warm-up': [['box', .4], ['gap', .6], ['stairs', .3]],
  'Stand max': [['box', .55], ['gap', .9], ['stairs', .45]],
  'Beyond limits': [['box', .75], ['gap', 1.2]],
};
const ease = s => s * s * (3 - 2 * s);
const rot = (p, a, b) => [a * Math.cos(p) - b * Math.sin(p), a * Math.sin(p) + b * Math.cos(p)];
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hex(a), C = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (C[i] - v) * t)).join(',')})`; };
const rgba = (h, a) => `rgba(${hex(h).join(',')},${a})`;
const fmt = v => (Math.round(v * 10) / 10).toFixed(1);
const fmt2 = v => (Math.round(v * 100) / 100).toFixed(2);
const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];
const STY = 'inspired by Skild AI’s parkour showcase and stair posts';

function drawLog(k, lines, x, y, w, maxH) {
  const rows = []; k.ctx.font = '500 12px Geist, system-ui, sans-serif';
  lines.forEach((l, li) => { let cur = ''; for (const wd of l.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (k.ctx.measureText(t).width > w && cur) { rows.push([cur, li]); cur = wd; } else cur = t; } rows.push([cur, li]); });
  rows.slice(-Math.max(1, Math.floor(maxH / 17))).forEach(([t, li], i) => k.text(t, x, y + i * 17, {size: 12, color: li === lines.length - 1 ? B.black : B.cool2}));
}

export default function mount(root, api) {
  const k = kit(root);
  const {ctx} = k;
  const clip = m => api.clip?.(m), record = (kind, d) => api.record?.(kind, d);
  let hum = true;                                         // body: humanoid (default) or robot dog
  let course = HPRESETS['Warm-up'].map(([type, v]) => ({type, v})), sel = 0, lay = [], finishX = 0;
  let blind = false, runDepth = true, running = false, R, runT = 0, cleared = 0, fails = 0, skipped = 0, maxH = 0, maxL = 0;
  let camX = -.3, drag = null, chipRects = [], completed = false, flash = 0, depthT = 0, hist = [], rays = [];
  let log = [`Humanoid · ${STY}.`, 'Build a course with the buttons below, then press Run.'];
  const board = [];
  const say = s => { log.push(s); if (log.length > 30) log.shift(); };
  const TY = t => (hum ? HTYPES : TYPES)[t];
  const sc = t => t === 'stairs' || hum ? HUM : (t === 'box' ? BH : BL);      // world size of 1× for this piece
  const lim = t => hum ? HLIM[t] : (TYPES[t].paper ? MAXJ : undefined);
  const over = p => { const m = lim(p.type); return m !== undefined && p.v > m + 1e-6; };
  const F = v => hum ? fmt2(v) : fmt(v);
  const legx = v => fmt2(v * HUM / LEG);
  const base = () => hum ? HIPY : CY;

  // ---- course layout (world units: 1 = dog body length = humanoid height) ----
  function build() {
    let x = 2.8; lay = course.map((p, i) => {
      const w = p.v * sc(p.type), L = {i, type: p.type, v: p.v, x0: x, stage: 0, status: 'pending', seen: false, no: !!TY(p.type).no};
      if (p.type === 'box') { L.H = w; L.x1 = x + BOX_TOP; L.end = L.x1 + .8; }
      if (p.type === 'gap') { L.x1 = x + w; L.end = L.x1 + .8; }
      if (p.type === 'ramp' || p.type === 'hand') { L.x1 = x + w; L.end = L.x1; }
      if (p.type === 'stairs') { L.H = w; L.n = Math.max(2, Math.round(w / RISE)); L.x1 = x + 2 * L.n * TREAD; L.end = L.x1; }
      x = L.x1 + RUNWAY; return L;
    });
    finishX = x;
  }
  function g(x) {                                         // ground height, null over a gap; skipped pieces are flat
    for (const L of lay) {
      if (x < L.x0 || x > L.x1 || L.no) continue;
      if (L.type === 'box') return L.H;
      if (L.type === 'stairs') { const u = x - L.x0, r = L.H / L.n, k2 = Math.floor(u / TREAD); return k2 < L.n ? (k2 + 1) * r : Math.max(0, L.H - (k2 - L.n) * r); }
      if (L.type === 'gap') return null;
      if (L.type === 'ramp') return RAMP_H * (1 - Math.abs(2 * (x - L.x0) / (L.x1 - L.x0) - 1));
    }
    return 0;
  }
  const gs = x => g(x) ?? -.45;                           // solid surface for rays (pit floor)
  const g0 = x => g(x) ?? 0;

  function reset() {
    R = {x: 1, y: base(), pitch: 0, mode: 'idle', ph: 0, pi: 0, t: 0, jump: null, vx: 0, vy: 0, fk: '', hs: '', he: 0, lean: 0, cr: 0, next: null, vt: null};
  }
  function stopRun(msg) { if (running) { running = false; say(msg); api.status('Course edited'); } build(); reset(); }
  function start() {
    if (!course.length) { say('The course is empty · add a piece first'); return; }
    build(); reset(); running = true; R.mode = 'run'; runT = 0; cleared = 0; fails = 0; skipped = 0; maxH = 0; maxL = 0; runDepth = !blind;
    clip(hum ? 'Parkour compilation' : 'Extreme Parkour'); api.status(blind ? 'Running · blind' : 'Running · depth policy');
    say(`Run · ${hum ? 'humanoid' : 'robot dog'}: ${course.length} piece${course.length > 1 ? 's' : ''} · ${blind ? 'blind, no depth' : 'depth policy'}`);
  }

  function jump(x1, y1, peak, dur, done, kind = '') { R.mode = 'jump'; R.jump = {x0: R.x, y0: R.y, x1, y1, c: 2 * peak - (R.y + y1) / 2, u: 0, dur, done, kind}; }
  function leap(kind, x1, y1, peak, dur, done) { R.mode = 'prep'; R.t = 0; R.cr = 0; R.next = () => jump(x1, y1, peak, dur, done, kind); }  // humanoid: crouch, arms back, then jump
  function clearPiece(L) {
    L.status = 'ok'; cleared++; R.pi++;
    if (L.type === 'box') maxH = Math.max(maxH, L.v); if (L.type === 'gap') maxL = Math.max(maxL, L.v);
    say(`${TY(L.type).name} ${F(L.v)}${TY(L.type).short} · cleared`);
  }
  function fail(L, msg, kind) {
    L.status = 'fail'; fails++; R.mode = 'fall'; R.t = 0; R.fk = kind; flash = 1; say(msg);
    R.vx = kind === 'hit' ? -.9 : .4; R.vy = kind === 'hit' ? 1.2 : 0;
  }
  function skipMsg(L) {
    return L.type === 'stairs' ? 'Stair flight is a humanoid piece (Skild’s stair posts) · not a skill of this body · skipped'
      : L.type === 'ramp' && hum ? 'Tilted ramp is from the Extreme Parkour paper (robot dog) · no Skild source shows it for the humanoid · skipped'
      : 'Handstand is a robot dog skill from the Extreme Parkour paper · not a skill of this body · skipped';
  }

  // humanoid obstacle logic (box jump, gap, stairs; limits are the stand's own, not Skild numbers)
  function humPiece(L, front) {
    const v = L.v, m = HLIM[L.type], ok = m === undefined || v <= m + 1e-6;
    if (L.type === 'box') {
      if (L.stage === 0) {
        if (blind && front >= L.x0) fail(L, 'Blind · ran into a box it could not see', 'hit');
        else if (!blind && front >= L.x0 - .42) {
          if (ok) { say(`Box jump · two feet, ${F(v)}× height`); leap('up', L.x0 + .35, L.H + HIPY, L.H + HIPY + .22, .45 + .35 * v, () => { L.stage = 1; R.mode = 'run'; }); }
          else { say(`${F(v)}× height is past the stand’s ${F(m)}× limit · tries anyway`); leap('up', L.x0 - .16, m * HUM + HIPY - .28, m * HUM + HIPY - .1, .55, () => fail(L, 'Toes caught the edge · fell back', 'hit')); }
        }
      } else if (L.stage === 1 && front >= L.x1) { L.stage = 2; say('Steps down off the box'); jump(L.x1 + .55, HIPY, L.H + HIPY + .06, .42, () => { R.mode = 'run'; clearPiece(L); }, 'down'); }
    } else if (L.type === 'gap') {
      if (blind && R.x - .05 > L.x0) fail(L, 'Blind · ran off an edge it could not see', 'pit');
      else if (!blind && front >= L.x0 - .08) {
        const w = L.x1 - L.x0;
        if (ok) { say(`Gap · leaps across, ${F(v)}× height`); leap('long', L.x1 + .35, HIPY, HIPY + .18 + .2 * w, .42 + .3 * w, () => { R.mode = 'run'; clearPiece(L); }); }
        else { say(`${F(v)}× height is past the stand’s ${F(m)}× limit · tries anyway`); leap('long', L.x0 + m * HUM + .02, HIPY - .08, HIPY + .36, .45 + .3 * m, () => fail(L, 'Came up short of the far edge · fell in', 'pit')); }
      }
    } else if (L.type === 'stairs') {
      if (blind && front >= L.x0) fail(L, 'Blind · no depth, tripped on the first step', 'hit');
      else if (!blind) {
        if (!L.stage && R.x > L.x0 - .1) { L.stage = 1; say('Stair flight · up and over from online vision and body sense, no map'); }
        if (R.x - .2 > L.x1) clearPiece(L);
      }
    }
  }

  function update(dt) {
    if (!running) { R.ph += dt * 2; return; }
    if (R.mode !== 'done') runT += dt;
    const L = lay[R.pi];
    if (R.mode === 'run') {
      if (hum) {
        const onRamp = L && L.type === 'stairs' && R.x > L.x0 - .3;
        R.x += HSPEED * (onRamp ? .75 : 1) * dt; R.ph += dt * Math.PI * 2 * 2.1;
        const ga = g0(R.x - .12), gb = g0(R.x + .12);
        R.y = lerp(R.y, (ga + gb) / 2 + HIPY - .02 * Math.abs(Math.sin(R.ph)), 1 - Math.exp(-dt * 16));
        R.lean = lerp(R.lean, .14 + clamp((gb - ga) / .24, -1, 1) * .35, 1 - Math.exp(-dt * 10)); R.pitch = 0;
      } else {
        const onRamp = L && L.type === 'ramp' && R.x > L.x0 - .5;
        R.x += SPEED * (onRamp ? .8 : 1) * dt; R.ph += dt * Math.PI * 2 * 2.4;
        const gf = g0(R.x + FH[0]), gh = g0(R.x + HH[0]);
        R.y = lerp(R.y, (gf + gh) / 2 + CY, 1 - Math.exp(-dt * 16)); R.pitch = lerp(R.pitch, Math.atan2(gf - gh, FH[0] - HH[0]), 1 - Math.exp(-dt * 14));
      }
      if (!L) { if (R.x >= finishX) finish(); return; }
      if (!L.seen && !L.no && L.x0 - R.x < 2.6) { L.seen = true; if (!blind) say(`Depth sees: ${TY(L.type).name.toLowerCase()} ahead`); }
      const front = R.x + (hum ? .15 : .5);
      if (L.no) {                                         // not a skill of this body: walk past it, gently
        if (!L.stage && front >= L.x0 - .3) { L.stage = 1; L.status = 'skip'; skipped++; say(skipMsg(L)); }
        if (R.x - .4 > L.x1) R.pi++;
      } else if (hum) humPiece(L, front);
      else if (L.type === 'box') {
        if (L.stage === 0) {
          if (blind && front >= L.x0) fail(L, 'Blind · ran into a box it could not see', 'hit');
          else if (!blind && front >= L.x0 - .35) {
            if (L.v <= MAXJ + 1e-6) { say(`High jump · ${fmt(L.v)}× its height`); jump(L.x0 + .62, L.H + CY, L.H + CY + .22, .5 + .1 * L.v, () => { L.stage = 1; R.mode = 'run'; }); }
            else { say(`${fmt(L.v)}× height is beyond the 2× reported · tries anyway`); jump(L.x0 - .45, MAXJ * BH + CY - .32, MAXJ * BH + CY - .2, .7, () => fail(L, 'Front feet caught the lip · fell', 'hit')); }
          }
        } else if (L.stage === 1 && front >= L.x1) jump(L.x1 + .8, CY, L.H + CY + .1, .5, () => { R.mode = 'run'; clearPiece(L); });
      } else if (L.type === 'gap') {
        if (blind && R.x - .1 > L.x0) fail(L, 'Blind · walked off an edge it could not see', 'pit');
        else if (!blind && front >= L.x0 - .05) {
          if (L.v <= MAXJ + 1e-6) { say(`Long jump · ${fmt(L.v)}× its length`); jump(L.x1 + .55, CY, CY + .3 + .08 * L.v, .45 + .12 * L.v, () => { R.mode = 'run'; clearPiece(L); }); }
          else { say(`${fmt(L.v)}× length is beyond the 2× reported · tries anyway`); jump(L.x0 + MAXJ * BL + .1, CY - .05, CY + .46, .7, () => fail(L, 'Hind legs missed the far edge · fell in', 'pit')); }
        }
      } else if (L.type === 'ramp') {
        if (!L.stage && R.x > L.x0) { L.stage = 1; say('Tilted ramp · keeps its footing'); }
        if (R.x + HH[0] > L.x1) { R.mode = 'run'; clearPiece(L); }
      } else if (L.type === 'hand' && R.x + FH[0] >= L.x0) { R.mode = 'hand'; R.hs = 'up'; R.t = 0; say('Handstand · up on the front legs'); }
    } else if (R.mode === 'prep') {
      R.t += dt; R.cr = ease(clamp(R.t / .16, 0, 1)); R.x += .35 * dt;
      R.y = lerp(R.y, g0(R.x) + HIPY - .1 * R.cr, 1 - Math.exp(-dt * 20)); R.lean = lerp(R.lean, .35, 1 - Math.exp(-dt * 14));
      if (R.t >= .16) { R.cr = 0; R.next(); }
    } else if (R.mode === 'jump') {
      const j = R.jump; j.u = Math.min(1, j.u + dt / j.dur); const u = j.u;
      R.x = lerp(j.x0, j.x1, u); R.y = (1 - u) * (1 - u) * j.y0 + 2 * u * (1 - u) * j.c + u * u * j.y1;
      if (hum) { R.pitch = 0; R.lean = lerp(.35, .1, u); } else R.pitch = .35 * Math.cos(Math.PI * u) * (1 - u * .4);
      R.ph += dt * 3;
      if (u >= 1) j.done();
    } else if (R.mode === 'hand') {
      R.t += dt; R.ph += dt * Math.PI * 2 * 1.4;
      if (R.hs === 'up') { R.he = ease(clamp(R.t / .7, 0, 1)); if (R.t > .7) { R.hs = 'walk'; R.t = 0; } }
      else if (R.hs === 'walk') { R.x += .7 * dt; if (R.x + FH[0] >= L.x1) { R.hs = 'down'; R.t = 0; } }
      else { R.he = 1 - ease(clamp(R.t / .7, 0, 1)); if (R.t > .7) { R.he = 0; R.mode = 'run'; clearPiece(L); } }
    } else if (R.mode === 'fall') {
      R.t += dt; R.vy -= 7 * dt; R.x += R.vx * dt; R.y += R.vy * dt; R.pitch -= dt * (R.fk === 'hit' ? -2.4 : 2.8);
      if (hum) R.pitch = clamp(R.pitch, -1.5, 1.5);
      if (R.fk === 'hit') R.y = Math.max(R.y, hum ? .16 : .18);
      if (R.t > 1.5) { R.x = L.end + .7; R.y = base(); R.pitch = 0; R.lean = 0; R.mode = 'run'; R.pi++; say('Reset past the obstacle'); }
    } else if (R.mode === 'done') { R.t += dt; R.ph += dt * 2; }
  }

  function finish() {
    R.mode = 'done'; R.t = 0; running = false; const t = +runT.toFixed(1), total = lay.filter(L => !L.no).length;
    const cs = course.map(p => TY(p.type).name[0] + F(p.v)).join(' ');
    const unit = t2 => hum || t2 === 'box' || t2 === 'stairs' ? 'x_height' : 'x_length';
    const rec = {body: hum ? 'humanoid' : 'robot_dog', course: course.map(p => ({type: p.type, size: +p.v.toFixed(2), unit: unit(p.type), ...(TY(p.type).no ? {skipped: true} : {})})), depth: runDepth, cleared, fails, skipped, time_s: t};
    if (hum) Object.assign(rec, {max_box_x_height: maxH, max_gap_x_height: maxL, limits_x_height: {...HLIM}, limits_source: 'stand', style: 'inspired by Skild AI parkour showcase; stand-in controller, not a Skild policy'});
    else Object.assign(rec, {max_height_x: maxH, max_length_x: maxL});
    record('parkour_run', rec);
    const score = +lay.filter(L => L.status === 'ok').reduce((s, L) => s + (L.type === 'box' || L.type === 'gap' ? (hum ? L.v / HLIM[L.type] * 2 : L.v) : .5), 0).toFixed(1);
    const key = (hum ? 'H:' : 'D:') + cs + (runDepth ? '' : ' · blind'), prev = board.find(b => b.key === key);
    if (!prev || score > prev.score || (score === prev.score && t < prev.t)) { if (prev) board.splice(board.indexOf(prev), 1); board.push({key, cs: (hum ? 'Hum ' : 'Dog ') + cs, score, t, cleared, total, depth: runDepth}); }
    board.sort((a, b) => b.score - a.score || a.t - b.t); board.length = Math.min(board.length, 5);
    say(`Finish · ${cleared}/${total} cleared, ${fails} fail${fails === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}, ${t} s`);
    api.status(`${cleared}/${total} cleared · ${t} s`);
    const clean = runDepth && !fails && cleared === total;
    if (hum) {
      const hi = course.some(p => p.type === 'box' && p.v >= .8 * HLIM.box - 1e-6), lo = course.some(p => p.type === 'gap' && p.v >= .8 * HLIM.gap - 1e-6);
      R.q = clean && hi && lo;
      if (R.q) {
        flash = .5; say('Box jump and gap near the stand’s own limits, from depth alone (stand-in controller).');
        if (!completed) { completed = true; api.complete('Parkour · humanoid box jump and gap near the stand’s limits, from depth'); }
      } else if (clean) say(`To finish: a box jump of at least ${fmt2(.8 * HLIM.box)}× height and a gap of at least ${fmt2(.8 * HLIM.gap)}× height (80% of the stand’s limits).`);
      return;
    }
    const hi = course.some(p => p.type === 'box' && p.v >= .8 * MAXJ - 1e-6), lo = course.some(p => p.type === 'gap' && p.v >= .8 * MAXJ - 1e-6);
    R.q = clean && hi && lo;
    if (R.q) {
      flash = .5; say('High jump and long jump near the paper max, from depth alone.');
      if (!completed) { completed = true; api.complete('Extreme parkour · near-2× jumps from depth'); }
    } else if (clean) say(`To finish: a high jump and a long jump of at least ${fmt(.8 * MAXJ)}× (80% of 2×).`);
  }

  // ---- robot pose (world) ----
  function pose() {
    if (hum) { const J = humJoints(); return {c: J.pel, p: R.pitch, J, head: J.eye, a0: -.22 + R.pitch, span: 1.0}; }
    let c = [R.x, R.y], p = R.pitch;
    if (R.mode === 'hand' || R.he > 0) {
      const e = R.he, fx = R.x + FH[0], o = rot(HAND_P, FH[0], FH[1]), hc = [fx - o[0], .44 - o[1]];
      c = [lerp(R.x, hc[0], e), lerp(CY, hc[1], e)]; p = lerp(0, HAND_P, e);
    }
    const W = (a, b) => { const o = rot(p, a, b); return [c[0] + o[0], c[1] + o[1]]; };
    return {c, p, W, head: W(.44, .03), a0: p - .08, span: .9};
  }
  function feet(po) {
    const {p, W} = po, fh = W(...FH), hh = W(...HH), air = R.mode === 'jump' || R.mode === 'fall' || !running && R.mode !== 'idle' && R.mode !== 'done';
    const step = (hip, off, amp) => { const s = R.ph + off, fx = hip[0] + amp * Math.sin(s), gy = g(fx); return [fx, (gy ?? hip[1] - .46) + .07 * Math.max(0, Math.cos(s)) * (running ? 1 : 0)]; };
    if (air) { const t = (hip, dx) => { const o = rot(p, dx, -.3); return [hip[0] + o[0], hip[1] + o[1]]; }; return [[t(fh, .04), t(fh, -.02)], [t(hh, .06), t(hh, 0)]]; }
    const amp = running ? .1 : 0;
    if (R.he > 0) {
      const e = R.he, fr = [step(fh, 0, .05), step(fh, Math.PI, .05)], up = [hh[0] - .12, hh[1] + .22], gnd = [step(hh, Math.PI, amp), step(hh, 0, amp)];
      return [fr, gnd.map(q => [lerp(q[0], up[0], e), lerp(q[1], up[1], e)])];
    }
    return [[step(fh, 0, amp), step(fh, Math.PI, amp)], [step(hh, Math.PI, amp), step(hh, 0, amp)]];
  }

  // ---- humanoid joints (world). Body frame = pelvis origin, x forward, y up; R.pitch tumbles the whole body ----
  function humJoints() {
    const pel = [R.x, R.y], tp = R.pitch || 0, ln = R.lean || 0, m = R.mode, runG = running && m === 'run';
    const O = (dx, dy) => { const o = rot(tp, dx, dy); return [pel[0] + o[0], pel[1] + o[1]]; };
    const inv = w => rot(-tp, w[0] - pel[0], w[1] - pel[1]);
    const up = d => [Math.sin(ln) * d, Math.cos(ln) * d], shO = up(TOR), hdO = up(TOR + .13);
    let fo, th = [.1, .1], bend = [.3, .3];
    if (m === 'jump') {
      const u = R.jump.u, kd = R.jump.kind, take = [[-.08, -.45], [-.02, -.46]], mid = [[.12, -.25], [.06, -.29]];
      const land = kd === 'long' ? [[.22, -.4], [.16, -.42]] : [[.05, -.45], [-.04, -.46]];
      fo = [0, 1].map(i => u < .5 ? lerp2(take[i], mid[i], ease(u / .5)) : lerp2(mid[i], land[i], ease((u - .5) / .5)));
      const a = kd === 'down' ? 1.1 + .3 * Math.sin(Math.PI * u) : u < .35 ? lerp(-1.1, 2.7, ease(u / .35)) : lerp(2.7, 1.0, ease((u - .35) / .65));
      th = [a, a - .15]; bend = [.35, .35];
    } else if (m === 'fall') {
      fo = [[.16, -.4], [-.08, -.4]]; const f = 2.2 + .5 * Math.sin(R.t * 9); th = [f, f - .6]; bend = [.5, .5];
    } else {
      const prep = m === 'prep', amp = runG ? .2 : 0;
      fo = [0, 1].map(i => {
        const s = R.ph + i * Math.PI, fx = R.x + (prep || !runG ? [.07, -.05][i] : .03) + amp * Math.sin(s), gy = g(fx);
        return inv([fx, (gy ?? R.y - .46) + (runG ? .12 * Math.max(0, Math.cos(s)) : 0)]);
      });
      if (runG) th = [0, 1].map(i => -.75 * Math.sin(R.ph + i * Math.PI)), bend = [1.2, 1.2];
      if (prep) th = [lerp(.1, -1.1, R.cr), lerp(.1, -1.2, R.cr)], bend = [.4, .4];
      if (m === 'done') th = [.15, .1];
    }
    const legs = fo.map(f => {
      const d = clamp(Math.hypot(f[0], f[1]), .05, T1 + T2 - .002), a = Math.atan2(f[1], f[0]);
      const ka = a + Math.acos(clamp((T1 * T1 + d * d - T2 * T2) / (2 * T1 * d), -1, 1));
      const kn = [Math.cos(ka) * T1, Math.sin(ka) * T1], an = [Math.cos(a) * d, Math.sin(a) * d];
      return {hip: O(0, 0), kn: O(...kn), an: O(...an), toe: O(an[0] + .08, an[1] - .005)};
    });
    const arms = [0, 1].map(i => {
      const t = th[i], b = bend[i], el = [shO[0] + UA * Math.sin(t), shO[1] - UA * Math.cos(t)], hd = [el[0] + FA * Math.sin(t + b), el[1] - FA * Math.cos(t + b)];
      return {sh: O(...shO), el: O(...el), hd: O(...hd)};
    });
    return {pel, sh: O(...shO), neck: O(...up(TOR + .05)), hd: O(...hdO), eye: O(hdO[0] + .055, hdO[1] - .005), legs, arms};
  }

  // ---- depth camera: rays in the vertical plane, sampled at a low rate with noise and dropouts (stylized) ----
  function castRays(po) {
    const head = po.head; rays = [];
    for (let r = 0; r < NR; r++) {
      const a = po.a0 - r * (po.span / (NR - 1)), dx = Math.cos(a), dy = Math.sin(a); let d = RANGE, hit = null;
      for (let s = .05; s <= RANGE; s += .025) { const x = head[0] + dx * s, y = head[1] + dy * s; if (y <= gs(x)) { d = s; hit = [x, y]; break; } }
      rays.push({d, hit, end: hit || [head[0] + dx * RANGE, head[1] + dy * RANGE]});
    }
    return head;
  }

  // ---- layout ----
  const PW = 250;
  const scene = () => { const x0 = PW + 20, y0 = 60, w = k.w - PW - 40, h = Math.max(170, k.h - y0 - 250); const s = h / 2.45; return {x0, y0, w, h, s, by: y0 + h}; };
  const P = (x, y) => { const c = scene(); return [c.x0 + (x - camX) * c.s, c.by - (y + .5) * c.s]; };
  const Wd = px => { const c = scene(); return [(px.x - c.x0) / c.s + camX, (c.by - px.y) / c.s - .5]; };

  function setV(i, v, quiet) {
    const p = course[i]; if (!p) return; const T = TY(p.type);
    p.v = Math.round(clamp(v, T.min, T.max) * 20) / 20; stopRun('Course edited · robot back to start'); syncSlider();
    if (!quiet && over(p)) say(hum ? `${F(p.v)}× height is past the stand’s ${F(lim(p.type))}× limit · expect a fail` : `${fmt(p.v)}${T.short} is past the paper's 2× · expect a fail`);
  }
  k.onDown(p => {
    for (const r of chipRects) if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + 24) {
      if (p.x > r.x + r.w - 22) { course.splice(r.i, 1); sel = clamp(sel, 0, course.length - 1); stopRun('Piece removed'); build(); syncSlider(); }
      else { sel = r.i; syncSlider(); }
      return;
    }
    const c = scene(); if (p.x < c.x0 || p.x > c.x0 + c.w || p.y < c.y0 || p.y > c.by) return;
    const [wx] = Wd(p), L = lay.find(L => wx >= L.x0 - .3 && wx <= L.x1 + .3);
    if (L) { sel = L.i; syncSlider(); drag = {i: L.i, x: p.x, y: p.y, v: course[L.i].v}; }
  });
  k.onMove(p => {
    if (!drag || !course[drag.i]) return; const s = scene().s, T = course[drag.i].type, u = s * sc(T);
    setV(drag.i, drag.v + (T === 'box' || T === 'stairs' ? (drag.y - p.y) / u : (p.x - drag.x) / u), true);
  });
  k.onUp(() => { if (drag) { const p = course[drag.i]; if (p && p.v !== drag.v) say(`${TY(p.type).name} set to ${F(p.v)}${TY(p.type).short}${over(p) ? (hum ? ' · past the stand’s limit' : ' · past 2×') : ''}`); drag = null; } });
  k.onKey(e => {
    if (e.target && /INPUT|TEXTAREA|BUTTON|SELECT/.test(e.target.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); start(); }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowRight') && course[sel]) { e.preventDefault(); setV(sel, course[sel].v + .1); }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowLeft') && course[sel]) { e.preventDefault(); setV(sel, course[sel].v - .1); }
    if (e.key === "Delete" && course[sel]) { course.splice(sel, 1); sel = clamp(sel, 0, course.length - 1); stopRun('Piece removed'); syncSlider(); }
  });

  k.frame((dt, t) => {
    flash = Math.max(0, flash - dt * 1.5); update(dt);
    const c = scene(), vw = c.w / c.s, sp = lay[sel];
    const tx = running || R.mode === 'done' ? R.x - vw * .3 : sp ? (sp.x0 + sp.x1) / 2 - vw / 2 : -.3;
    camX = lerp(camX, clamp(tx, -.3, Math.max(-.3, finishX + 1 - vw)), 1 - Math.exp(-dt * 5));
    const po = pose(); castRays(po);
    depthT += dt; if (depthT > .1) { depthT = 0; hist.push(blind ? null : rays.map(r => Math.random() < .04 ? -1 : clamp(r.d / RANGE + rand(-.03, .03), 0, 1))); if (hist.length > HIST) hist.shift(); }
    draw(t, po);
  });

  function dimH(x, y0, y1, lab, step = BH) {              // vertical dimension line with 1× ticks
    const [px, a] = P(x, y0), [, b] = P(x, y1); ctx.strokeStyle = B.cool2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, a); ctx.lineTo(px, b); ctx.stroke();
    for (let v = 0; v <= (y1 - y0) / step + 1e-6; v++) { const [, ty] = P(x, y0 + v * step); ctx.beginPath(); ctx.moveTo(px - 4, ty); ctx.lineTo(px + 4, ty); ctx.stroke(); }
    if (lab) k.label(lab, px, b - 10, {align: "center", color: B.cool2});
  }
  function ghost(L, x0, x1, gy, top) {                    // a piece this body can't do: dashed, labelled, walked past
    const T = TY(L.type); ctx.setLineDash([4, 4]); ctx.strokeStyle = B.cool1; ctx.lineWidth = 1.2; ctx.strokeRect(x0, top, x1 - x0, gy - top); ctx.setLineDash([]);
    const cx = (x0 + x1) / 2, ty = Math.min(top, P(0, .95)[1]);
    k.text(`${T.name} · not a skill of this body`, cx, ty - 12, {align: 'center', size: 12, weight: 600, color: B.cool2});
    k.label(L.type === 'stairs' ? 'humanoid piece · skipped here' : 'robot dog skill · skipped here', cx, gy + 18, {align: 'center'});
  }
  function drawCourse(c) {
    const s = c.s, [gx0, gy] = P(camX - 1, 0), gw = c.w + 2 * s, bottom = c.by;
    ctx.fillStyle = B.warm2; ctx.fillRect(gx0, gy, gw, bottom - gy); ctx.fillStyle = B.cool3; ctx.fillRect(gx0, gy, gw, 2);
    for (const L of lay) {
      const on = L.i === sel, [x0, top] = P(L.x0, L.type === 'box' ? L.H : 0), [x1] = P(L.x1, 0), ov = over(L);
      const accent = L.status === 'ok' ? B.orange : on ? B.black : B.cool3;
      if (L.no) ghost(L, x0, x1, gy, gy - 6);
      else if (L.type === 'box') {
        ctx.fillStyle = on ? mix(B.warm2, B.warm3, .6) : B.warm3; ctx.strokeStyle = accent; ctx.lineWidth = on ? 2 : 1.2;
        ctx.beginPath(); ctx.roundRect(x0, top, x1 - x0, gy - top + 1, [6, 6, 0, 0]); ctx.fill(); ctx.stroke();
        const [, m2] = P(0, (hum ? HLIM.box * HUM : MAXJ * BH)); ctx.setLineDash([4, 4]); ctx.strokeStyle = B.orange; ctx.beginPath(); ctx.moveTo(x0 - 14, m2); ctx.lineTo(x1 + 14, m2); ctx.stroke(); ctx.setLineDash([]);
        k.label(hum ? `stand’s limit ${fmt(HLIM.box)}×` : 'paper 2×', x1 + 16, m2 + 3, {color: B.orange});
        if (hum) { dimH(L.x0 - .18, 0, L.H, '', LEG); k.text(`Box jump · ${F(L.v)}× height · ${legx(L.v)}× leg`, (x0 + x1) / 2, Math.min(top, m2) - 12, {align: 'center', size: 12, weight: 600, color: ov ? B.cool2 : B.black}); }
        else { dimH(L.x0 - .18, 0, L.H); k.text(`High jump · ${fmt(L.v)}× height`, (x0 + x1) / 2, Math.min(top, m2) - 12, {align: 'center', size: 12, weight: 600, color: ov ? B.cool2 : B.black}); }
        if (ov) k.label(hum ? 'past the stand’s limit' : 'beyond reported range', (x0 + x1) / 2, Math.min(top, m2) - 28, {align: 'center'});
      } else if (L.type === 'gap') {
        ctx.fillStyle = B.warm1; ctx.fillRect(x0, gy - 1, x1 - x0, bottom - gy + 2);
        ctx.fillStyle = rgba(B.cool3, .12); ctx.fillRect(x0, P(0, -.45)[1], x1 - x0, bottom - P(0, -.45)[1]);
        ctx.strokeStyle = accent; ctx.lineWidth = on ? 2 : 1.2; ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0, bottom); ctx.moveTo(x1, gy); ctx.lineTo(x1, bottom); ctx.stroke();
        const dy = gy + 18, st = hum ? LEG : BL, w = L.x1 - L.x0; ctx.strokeStyle = B.cool2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, dy); ctx.lineTo(x1, dy); ctx.stroke();
        for (let v = 0; v <= w / st + 1e-6; v++) { const [tx] = P(L.x0 + v * st, 0); ctx.beginPath(); ctx.moveTo(tx, dy - 4); ctx.lineTo(tx, dy + 4); ctx.stroke(); }
        const [m2] = P(L.x0 + (hum ? HLIM.gap * HUM : MAXJ * BL), 0); ctx.setLineDash([4, 4]); ctx.strokeStyle = B.orange; ctx.beginPath(); ctx.moveTo(m2, gy - 30); ctx.lineTo(m2, dy + 10); ctx.stroke(); ctx.setLineDash([]);
        k.label(hum ? `stand’s limit ${fmt(HLIM.gap)}×` : 'paper 2×', m2 + 4, gy - 20, {color: B.orange});
        k.text(hum ? `Gap · ${F(L.v)}× height · ${legx(L.v)}× leg` : `Long jump · ${fmt(L.v)}× length`, (x0 + x1) / 2, dy + 20, {align: 'center', size: 12, weight: 600, color: ov ? B.cool2 : B.black});
        if (ov) k.label(hum ? 'past the stand’s limit' : 'beyond reported range', (x0 + x1) / 2, dy + 36, {align: 'center'});
      } else if (L.type === 'ramp') {
        const [xm, ym] = P((L.x0 + L.x1) / 2, RAMP_H), d = s * .12;
        ctx.fillStyle = rgba(B.cool3, .18); ctx.beginPath(); ctx.moveTo(x0 + d, gy - d); ctx.lineTo(xm + d, ym - d); ctx.lineTo(x1 + d, gy - d); ctx.lineTo(x1, gy); ctx.lineTo(xm, ym); ctx.lineTo(x0, gy); ctx.fill();
        ctx.fillStyle = B.warm3; ctx.strokeStyle = accent; ctx.lineWidth = on ? 2 : 1.2; ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(xm, ym); ctx.lineTo(x1, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
        k.text(`Tilted ramp · ${F(L.v)}× ${hum ? 'height' : 'length'}`, xm, ym - d - 14, {align: 'center', size: 12, weight: 600});
        k.label('tilt not stated on the page', xm, gy + 18, {align: 'center'});
      } else if (L.type === 'stairs') {
        ctx.fillStyle = on ? mix(B.warm2, B.warm3, .6) : B.warm3; ctx.strokeStyle = accent; ctx.lineWidth = on ? 2 : 1.2;
        ctx.beginPath(); ctx.moveTo(x0, gy);
        for (let n = 0; n < 2 * L.n; n++) { const h = n < L.n ? (n + 1) * L.H / L.n : L.H - (n - L.n) * L.H / L.n, xa = P(L.x0 + n * TREAD, 0)[0], xb = P(L.x0 + (n + 1) * TREAD, 0)[0], y = P(0, h)[1]; ctx.lineTo(xa, y); ctx.lineTo(xb, y); }
        ctx.lineTo(x1, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
        const [, ty] = P(0, L.H);
        k.text(`Stair flight · ${F(L.v)}× height · ${L.n} steps each way`, (x0 + x1) / 2, ty - 14, {align: 'center', size: 12, weight: 600});
        k.label('stairs: Skild’s 6 Aug 2025 post · height and steps are ours', (x0 + x1) / 2, gy + 18, {align: 'center'});
      } else {
        ctx.fillStyle = rgba(B.orange, .12); ctx.fillRect(x0, gy - 3, x1 - x0, 6); ctx.strokeStyle = accent; ctx.lineWidth = on ? 2 : 1.2; ctx.strokeRect(x0, gy - 3, x1 - x0, 6);
        k.text(`Handstand · ${fmt(L.v)}× length`, (x0 + x1) / 2, P(0, 1.35)[1], {align: 'center', size: 12, weight: 600});
      }
      if (L.status === 'fail') k.text('✕ fail', (x0 + x1) / 2, gy + (L.type === 'gap' ? 70 : 36), {align: 'center', size: 12, mono: true, weight: 600, color: B.cool2});
      if (L.status === 'skip') k.text('skipped', (x0 + x1) / 2, gy + 36, {align: 'center', size: 12, mono: true, weight: 600, color: B.cool1});
    }
    const [fx, fy] = P(finishX, 0); ctx.strokeStyle = B.black; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - s * 1.1); ctx.stroke();
    ctx.fillStyle = R.mode === 'done' && !fails ? B.orange : B.black; ctx.beginPath(); ctx.moveTo(fx, fy - s * 1.1); ctx.lineTo(fx + 20, fy - s * 1.1 + 8); ctx.lineTo(fx, fy - s * 1.1 + 16); ctx.fill();
  }

  function drawCone(head) {
    ctx.beginPath(); ctx.moveTo(...P(...head)); rays.forEach(r => ctx.lineTo(...P(...r.end))); ctx.closePath();
    if (!blind) { ctx.fillStyle = rgba(B.orange, .1); ctx.fill(); ctx.strokeStyle = rgba(B.orange, .4); ctx.lineWidth = 1; ctx.stroke(); rays.forEach(r => { if (r.hit) { ctx.fillStyle = B.orange; ctx.fillRect(P(...r.hit)[0] - 1.5, P(...r.hit)[1] - 1.5, 3, 3); } }); }
    else { ctx.setLineDash([4, 5]); ctx.strokeStyle = B.cool1; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]); }
  }
  function drawHum(po) {
    const s = scene().s, J = po.J;
    drawCone(po.head);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const seg = (a, b, w, col) => { ctx.strokeStyle = col; ctx.lineWidth = s * w; ctx.beginPath(); ctx.moveTo(...P(...a)); ctx.lineTo(...P(...b)); ctx.stroke(); };
    const dot = (a, r, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(...P(...a), s * r, 0, 7); ctx.fill(); };
    const leg = (i, back) => {
      const {hip, kn, an, toe} = J.legs[i]; seg(hip, kn, .07, back ? B.cool1 : B.cool4); seg(kn, an, .055, back ? B.cool1 : B.cool3); seg(an, toe, .04, back ? B.warm3 : B.black);
      if (!back) { dot(kn, .022, B.orange); dot(an, .014, B.white); }
    };
    const arm = (i, back) => { const {sh, el, hd} = J.arms[i]; seg(sh, el, .045, back ? B.cool1 : B.cool3); seg(el, hd, .04, back ? B.cool1 : B.cool3); dot(hd, .024, back ? B.warm3 : B.black); if (!back) dot(el, .016, B.orange); };
    arm(1, true); leg(1, true);
    seg(J.pel, J.sh, .12, B.black); seg(lerp2(J.pel, J.sh, .3), lerp2(J.pel, J.sh, .75), .022, B.orange);
    seg(J.sh, J.neck, .045, B.black);
    leg(0, false); dot(J.pel, .026, B.orange); arm(0, false);
    dot(J.hd, .075, B.black); dot(J.eye, .024, blind ? B.cool2 : B.orange);
    if (!running && R.mode === 'idle') {                  // size reference: what "×height" and "×leg" mean
      dimH(R.x - .32, 0, HUM, '1× height', HUM); dimH(R.x + .3, 0, LEG, '1× leg', LEG);
    }
  }

  function drawBot(po, head) {
    if (hum) { drawHum(po); return; }
    const {c, p, W} = po, s = scene().s, [fr, hi] = feet(po), fh = W(...FH), hh = W(...HH);
    drawCone(head);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const leg = (hip, f, back) => {
      const dx = f[0] - hip[0], dy = f[1] - hip[1], d = clamp(Math.hypot(dx, dy), .05, L1 + L2 - .002), a = Math.atan2(dy, dx);
      const ka = a - Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), kn = [hip[0] + Math.cos(ka) * L1, hip[1] + Math.sin(ka) * L1], fe = [hip[0] + Math.cos(a) * d, hip[1] + Math.sin(a) * d];
      ctx.strokeStyle = back ? B.cool1 : B.cool4; ctx.lineWidth = s * .065; ctx.beginPath(); ctx.moveTo(...P(...hip)); ctx.lineTo(...P(...kn)); ctx.stroke();
      ctx.strokeStyle = back ? B.cool1 : B.cool3; ctx.lineWidth = s * .045; ctx.beginPath(); ctx.moveTo(...P(...kn)); ctx.lineTo(...P(...fe)); ctx.stroke();
      ctx.fillStyle = back ? B.warm3 : B.black; ctx.beginPath(); ctx.arc(...P(...fe), s * .03, 0, 7); ctx.fill();
      if (!back) { ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(...P(...kn), s * .022, 0, 7); ctx.fill(); }
    };
    leg(fh, fr[1], true); leg(hh, hi[1], true);
    ctx.save(); ctx.translate(...P(...c)); ctx.rotate(-p);
    ctx.fillStyle = B.black; ctx.beginPath(); ctx.roundRect(-.5 * s, -.09 * s, .88 * s, .18 * s, s * .05); ctx.fill();
    ctx.fillStyle = B.cool3; ctx.beginPath(); ctx.roundRect(.38 * s, -.08 * s, .12 * s, .17 * s, s * .03); ctx.fill();
    ctx.fillStyle = blind ? B.cool2 : B.orange; ctx.beginPath(); ctx.arc(.47 * s, -.03 * s, s * .025, 0, 7); ctx.fill();
    ctx.fillStyle = B.orange; ctx.fillRect(-.3 * s, -.015 * s, .4 * s, .03 * s);
    ctx.restore();
    leg(fh, fr[0], false); leg(hh, hi[0], false);
    if (!running && R.mode === 'idle') {                  // size reference: what "×height" and "×length" mean
      dimH(c[0] - .62, 0, BH, '1× height');
      const [a, y] = P(c[0] - .5, -.12), [b] = P(c[0] + .5, 0); ctx.strokeStyle = B.cool2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo(b, y); ctx.moveTo(a, y - 4); ctx.lineTo(a, y + 4); ctx.moveTo(b, y - 4); ctx.lineTo(b, y + 4); ctx.stroke();
      k.label('1× length', (a + b) / 2, y + 16, {align: 'center'});
    }
  }

  function draw(t, po) {
    k.clear(B.warm1);
    const c = scene();
    if (hum) k.text(`Goal: a box jump of ${fmt2(.8 * HLIM.box)}× height and a gap of ${fmt2(.8 * HLIM.gap)}× height or more (80% of the stand’s limits), depth on.`, c.x0, 28, {size: 15, weight: 600});
    else k.text(`Goal: clear a course with a high jump and a long jump of at least ${fmt(.8 * MAXJ)}× (80% of the paper's 2×), depth on.`, c.x0, 28, {size: 15, weight: 600});
    k.label(hum ? `Side view · simulated · humanoid ${STY} · limits are the stand’s own, not Skild numbers · drag to resize · space = run` : 'Side view · simulated · click a piece to select · drag a box up or a gap sideways to resize · space = run', c.x0, 48);
    ctx.fillStyle = B.white; ctx.strokeStyle = B.warm2; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(c.x0, c.y0, c.w, c.h, 12); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.roundRect(c.x0, c.y0, c.w, c.h, 12); ctx.clip();
    ctx.strokeStyle = rgba(B.black, .05); ctx.lineWidth = 1; ctx.beginPath();
    for (let x = Math.floor(camX); x < camX + c.w / c.s + 1; x += .5) { const [px] = P(x, 0); ctx.moveTo(px + .5, c.y0); ctx.lineTo(px + .5, c.by); }
    for (let y = -.5; y < 2; y += .5) { const [, py] = P(0, y); ctx.moveTo(c.x0, py + .5); ctx.lineTo(c.x0 + c.w, py + .5); } ctx.stroke();
    drawCourse(c);
    drawBot(po, po.head);
    if (flash > 0) { ctx.fillStyle = rgba(B.cool3, flash * .1); ctx.fillRect(c.x0, c.y0, c.w, c.h); }
    k.text(`${runT.toFixed(1)} s`, c.x0 + c.w - 14, c.y0 + 24, {align: 'right', size: 13, mono: true, weight: 600});
    k.label(blind ? 'Blind · no depth' : 'Depth policy', c.x0 + 14, c.y0 + 22, {color: blind ? B.cool2 : B.orange});
    k.label(hum ? `Humanoid · ${STY}` : 'Robot dog · Extreme Parkour, CMU (ICRA 2024)', c.x0 + 14, c.y0 + 38);
    if (R.mode === 'done') {
      const ok = !fails && cleared === lay.filter(L => !L.no).length;
      const msg = ok ? (R.q ? (hum ? 'Course cleared · near the stand’s limits, depth only' : 'Course cleared · near-2× jumps, depth only') : 'Course cleared')
        : `${fails} fail${fails === 1 ? '' : 's'} · ${!runDepth ? 'no depth, no jumps' : hum ? 'past the stand’s limits' : 'past what the paper reports'}`;
      k.text(msg, c.x0 + c.w / 2, c.y0 + 64, {align: 'center', size: 18, weight: 600, color: ok ? B.orange : B.black});
    }
    ctx.restore();

    // ---- course strip (below the scene, left of the video corner) ----
    const my = c.by + 24, mw = Math.max(220, k.w - 360 - c.x0);
    k.label(`Course · ${course.length}/${MAXP} pieces · × = remove`, c.x0, my);
    let cx = c.x0, cy = my + 10; chipRects = []; ctx.font = '500 12px Geist, system-ui, sans-serif';
    if (!course.length) k.text('Empty. Add pieces from the bar below.', c.x0, cy + 16, {size: 12, color: B.cool2});
    course.forEach((p, i) => {
      const T = TY(p.type), L = lay[i], lab = `${i + 1} ${T.name} ${F(p.v)}${T.short}${T.no ? ' · skip' : ''}`, w = ctx.measureText(lab).width + 52;
      if (cx + w > c.x0 + mw && cx > c.x0) { cx = c.x0; cy += 30; }
      const on = i === sel; ctx.fillStyle = on ? B.black : B.white; ctx.strokeStyle = on ? B.black : B.warm3; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cx, cy, w, 24, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = L && L.status === 'ok' ? B.orange : L && L.status === 'fail' ? B.cool2 : B.warm2; ctx.beginPath(); ctx.arc(cx + 13, cy + 12, 4, 0, 7); ctx.fill();
      k.text(lab, cx + 23, cy + 16, {size: 12, color: on ? B.white : T.no ? B.cool1 : over(p) ? B.cool2 : B.black});
      k.text('×', cx + w - 13, cy + 16, {size: 13, align: 'center', color: on ? B.warm3 : B.cool2});
      chipRects.push({i, x: cx, y: cy, w}); cx += w + 6;
    });

    // ---- left panel ----
    const x = 18, iw = PW - 36;
    ctx.fillStyle = B.white; ctx.fillRect(0, 0, PW, k.h); ctx.fillStyle = B.warm2; ctx.fillRect(PW, 0, 1, k.h);
    k.label(hum ? 'Humanoid · stand-in controller, simulated' : 'One net · raw depth → joint commands', x, 28);
    k.text(blind ? 'Blind · no depth' : 'Depth policy', x, 52, {size: 16, weight: 600, color: blind ? B.black : B.orange});
    k.label('Depth image · low-rate, jittery', x, 78);
    const dh = 64, dy = 86, bw = (iw - 16) / HIST, rh = dh / NR;
    ctx.fillStyle = B.warm1; ctx.beginPath(); ctx.roundRect(x, dy, iw, dh, 8); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.roundRect(x, dy, iw, dh, 8); ctx.clip();
    hist.forEach((col, ci) => {
      const cx2 = x + (HIST - hist.length + ci) * bw;
      if (!col) { ctx.fillStyle = B.warm2; ctx.fillRect(cx2, dy, bw + .3, dh); return; }
      col.forEach((d, r) => { ctx.fillStyle = d < 0 ? B.cool1 : mix(B.warm1, B.orange, clamp(1 - d, 0, 1) ** 1.3); ctx.fillRect(cx2, dy + r * rh, bw + .3, rh + .3); });
    });
    const last = hist[hist.length - 1];
    if (last) last.forEach((d, r) => { ctx.fillStyle = d < 0 ? B.cool1 : mix(B.warm1, B.orange, clamp(1 - d, 0, 1) ** 1.3); ctx.fillRect(x + iw - 12, dy + r * rh, 12, rh + .3); });
    ctx.restore();
    if (blind) k.text('no depth input', x + iw / 2, dy + dh / 2 + 4, {align: 'center', size: 12, mono: true, color: B.cool2});
    k.label('past ← time → now · near = bright', x, dy + dh + 14, {color: B.warm4});
    const row = (lab, val, y, hot) => { k.label(lab, x, y); k.text(String(val), x + iw, y, {align: 'right', size: 14, weight: 600, mono: true, color: hot ? B.orange : B.black}); };
    const total = lay.length ? lay.filter(L => !L.no).length : course.length;
    row('Cleared', `${cleared}/${total}`, 186, cleared && cleared === total); row('Fails', fails, 206);
    if (hum) {
      row('Max box cleared', maxH ? `${fmt2(maxH)}× H` : '—', 226, maxH >= .8 * HLIM.box - 1e-6); row('Max gap cleared', maxL ? `${fmt2(maxL)}× H` : '—', 246, maxL >= .8 * HLIM.gap - 1e-6);
      row('Time', `${runT.toFixed(1)} s`, 266);
      const v = Math.min(maxH / HLIM.box, maxL / HLIM.gap);
      k.meter(x, 290, iw, clamp(v, 0, 1), `Toward the stand’s limits · ${Math.round(clamp(v, 0, 9) * 100)}%`);
    } else {
      row('Max height cleared', maxH ? `${fmt(maxH)}× H` : '—', 226, maxH >= 1.6); row('Max length cleared', maxL ? `${fmt(maxL)}× L` : '—', 246, maxL >= 1.6);
      row('Time', `${runT.toFixed(1)} s`, 266);
      k.meter(x, 290, iw, clamp(Math.min(maxH, maxL) / MAXJ, 0, 1), `Toward the paper's 2× · ${fmt(Math.min(maxH, maxL))}×`);
    }
    let ly = 318;
    k.label('Best courses', x, ly);
    if (!board.length) k.text('No finished runs yet', x, ly + 18, {size: 12, color: B.cool2});
    board.forEach((b, i) => {
      const y = ly + 18 + i * 17; k.text(`${i + 1}. ${b.cs}`.slice(0, 26), x, y, {size: 11, mono: true, color: b.depth ? B.black : B.cool2});
      k.text(`${b.cleared}/${b.total} · ${b.t}s`, x + iw, y, {size: 11, mono: true, align: 'right', color: b.depth && b.cleared === b.total ? B.orange : B.cool2});
    });
    ly += 26 + Math.max(1, board.length) * 17;
    k.label('Log', x, ly);
    drawLog(k, log.slice(-8), x, ly + 20, iw, k.h - ly - 26);
  }

  // ---- control bar ----
  const bodyLabel = () => hum ? 'Body: Humanoid (Skild showcase, stairs)' : 'Body: Robot dog (Extreme Parkour, CMU)';
  const bodyBtn = k.button(bodyLabel(), () => {
    const next = !hum;
    course.forEach(p => { const w = p.v * sc(p.type); hum = next; const T = TY(p.type); p.v = Math.round(clamp(w / sc(p.type), T.min, T.max) * 20) / 20; hum = !next; });
    hum = next; bodyBtn.textContent = bodyLabel(); relabel(); hist = [];
    stopRun('Body switched · back to start'); build(); syncSlider();
    clip(hum ? 'Parkour compilation' : 'Extreme Parkour');
    say(hum ? `Humanoid · ${STY} · limits are the stand’s own` : 'Robot dog · Extreme Parkour (CMU, ICRA 2024) · sizes from the paper');
    const n = course.filter(p => TY(p.type).no).length; if (n) say(`${n} piece${n > 1 ? 's are' : ' is'} not a skill of this body · will be skipped`);
  });
  bodyBtn.classList.add('on');
  const add = type => () => {
    if (course.length >= MAXP) { say(`Course is full · ${MAXP} pieces max`); return; }
    const T = TY(type), at = course.length ? sel + 1 : 0; course.splice(at, 0, {type, v: T.def}); sel = at;
    stopRun('Piece added'); build(); syncSlider(); say(`Added ${T.name.toLowerCase()} · ${F(T.def)}${T.short}`);
    if (T.no) say(`${T.name} is not a skill of this body · it will be skipped`);
    else if (type === 'stairs') clip('Fire');
  };
  const addBtns = Object.keys(TYPES).map(type => [type, k.button('+ ' + TYPES[type].name, add(type))]);
  const presetBtns = [0, 1, 2].map(i => k.button('', () => {
    const [n, list] = Object.entries(hum ? HPRESETS : PRESETS)[i];
    course = list.map(([type, v]) => ({type, v})); sel = 0; stopRun(`Preset: ${n}`); build(); syncSlider(); say(`Preset: ${n}`);
  }));
  function relabel() {
    addBtns.forEach(([type, b]) => { const T = TY(type); b.textContent = '+ ' + T.name + (T.no ? (hum ? ' (dog only)' : ' (humanoid only)') : ''); });
    const names = Object.keys(hum ? HPRESETS : PRESETS); presetBtns.forEach((b, i) => { b.textContent = names[i]; });
  }
  const si = k.slider('Size ×', .5, 2.5, 1, v => { if (course[sel] && Math.abs(course[sel].v - v) > 1e-6) setV(sel, v); }, .05);
  function syncSlider() {
    const p = course[sel], span = si.previousSibling, out = si.nextSibling;
    if (!p) { si.disabled = true; span.textContent = 'Size ×'; out.textContent = '—'; return; }
    const T = TY(p.type); si.disabled = false; si.min = T.min; si.max = T.max; si.value = p.v;
    span.textContent = `${T.name} ${T.unit}`; out.textContent = F(p.v);
  }
  const pol = k.button('Policy: Depth', () => {
    blind = !blind; pol.textContent = blind ? 'Policy: Blind (no depth)' : 'Policy: Depth'; pol.classList.toggle('on', !blind);
    if (blind && running) runDepth = false; hist = [];
    say(blind ? 'Blind · the policy gets no depth image' : 'Depth on · the policy acts from the camera image');
  });
  pol.classList.add('on');
  k.button('Run', start, {primary: true});
  relabel(); build(); reset(); syncSlider(); api.status('Build a course');
  return () => k.destroy();
}
