// TRY · Skild Brain — "Two brains in one": the visitor is the slow high-level policy (where to go, what to grab); the
// fast low-level policy turns that into joint or wheel commands on whichever body is plugged in.
// Post facts used: hierarchy of a low-frequency high-level manipulation + navigation policy and a high-frequency low-level
// policy that outputs joint angles and motor torques; one brain for quadrupeds, humanoids, table-top arms and mobile
// manipulators; trained on large-scale simulation + internet (human) video, with targeted real-world data for post-training,
// not "a VLM in disguise" that sprinkles in <1% robot data. The post gives no rates: the Hz values here are illustrative.
import {kit, B, lerp, clamp, rand} from './kit.js';

const RW = 8, RH = 5, CELL = .2;                       // room in meters, planner grid
const OBST = [{x: 2.1, y: 0, w: 1.7, h: 1.05, label: 'Sofa'}, {x: 4.5, y: 2.1, w: 1.25, h: 1.2, label: 'Table'},
  {x: 1.1, y: 3.3, w: .95, h: .95, label: 'Crate'}, {x: 6.7, y: .5, w: .6, h: 1.5, label: 'Shelf'}];
const ITEMS = [{x: 5.3, y: .9, label: 'Ball'}, {x: 7.3, y: 3.9, label: 'Toolbox'}, {x: 3.2, y: 4.35, label: 'Bottle'}];
const BODIES = {
  quad: {name: 'Quadruped', freq: 2.3, speed: .85, reach: .6,
    legs: [['FL', .34, -.15, 0], ['FR', .34, .15, .5], ['RL', -.34, -.15, .5], ['RR', -.34, .15, 0]].map(([id, hx, hy, o]) => ({id, hx, hy, fy: hy + Math.sign(hy) * .1, o}))},
  human: {name: 'Humanoid', freq: 1.9, speed: .75, reach: .55,
    legs: [['L', 0, -.11, 0], ['R', 0, .11, .5]].map(([id, hx, hy, o]) => ({id, hx, hy, fy: hy, o}))},
  mobile: {name: 'Mobile manipulator', freq: 0, speed: .9, reach: 0, wheels: true, legs: []},
};
const BIDS = Object.keys(BODIES);
const HL_HZ = 2, WIN = 4;                                // high-level rate (illustrative), scope window (s)
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const ease = s => s * s * (3 - 2 * s);
const r2 = v => Math.round(v * 100) / 100;

function drawLog(k, lines, x, y, w, maxH) {              // word-wrapped log, newest line in black
  const rows = []; k.ctx.font = '500 12px Geist, system-ui, sans-serif';
  lines.forEach((l, li) => { let cur = ''; for (const wd of l.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (k.ctx.measureText(t).width > w && cur) { rows.push([cur, li]); cur = wd; } else cur = t; } rows.push([cur, li]); });
  rows.slice(-Math.max(1, Math.floor(maxH / 17))).forEach(([t, li], i) => k.text(t, x, y + i * 17, {size: 12, color: li === lines.length - 1 ? B.black : B.cool2}));
}

export default function mount(root, api) {
  const k = kit(root);
  const {ctx} = k;
  const clip = m => api.clip?.(m), record = (kind, d) => api.record?.(kind, d);
  let bodyId = 'quad', rate = 50, grounded = true, goal = null, goalsDone = 0, stumbles = 0, completed = false, log = ['You are the high-level policy. Click an item to start a fetch run.'];
  let hlAcc = 0, llAcc = 0, cmdHead = 0, cmdSpeed = 0, path = [], hlTicks = [], llTicks = [], samples = [], flash = 0, wpInfo = '—', nHL = 0, nLL = 0;
  let items = ITEMS.map(i => ({...i, gone: 0, got: false}));
  let run = null, lastRun = null, runPath = [], pathT = 0, goalT = 0, goalStart = null;
  const best = {};                                        // body → best fetch-run time (s)
  const R = {x: .8, y: 1.6, a: 0, vx: 0, vy: 0, om: 0, wob: 0, wobV: 0, u: 0, gp: 0, stumble: 0, reach: 0, reachT: null, legs: [], wq: [0, 0], vCmd: 0};
  const B_ = () => BODIES[bodyId];

  function resetBody() {
    R.legs = B_().legs.map(l => { const p = toWorld(l.hx, l.fy); return {...l, stance: true, planted: p, lift: p, cmd: p, foot: {...p}, h: 0, hs: 0, q: [0, 0]}; });
    R.wob = R.wobV = R.u = 0; R.wq = [0, 0];
  }
  function toWorld(bx, by) { const c = Math.cos(R.a), s = Math.sin(R.a); return {x: R.x + c * bx - s * by, y: R.y + s * bx + c * by}; }
  function toBody(p) { const c = Math.cos(R.a), s = Math.sin(R.a), dx = p.x - R.x, dy = p.y - R.y; return {x: c * dx + s * dy, y: -s * dx + c * dy}; }
  const say = s => { log.push(s); if (log.length > 30) log.shift(); };

  // ---- high-level planner (grid A*) ----
  const GW = Math.round(RW / CELL), GH = Math.round(RH / CELL);
  const blockedAt = (x, y, pad = .36) => x < pad * .8 || y < pad * .8 || x > RW - pad * .8 || y > RH - pad * .8 || OBST.some(o => x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad);
  const grid = []; for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) grid.push(blockedAt((i + .5) * CELL, (j + .5) * CELL));
  const clear = (a, b) => { const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / .08); for (let i = 1; i < n; i++) if (blockedAt(lerp(a.x, b.x, i / n), lerp(a.y, b.y, i / n), .3)) return false; return true; };
  function plan(from, to) {
    const ci = p => clamp(Math.floor(p.x / CELL), 0, GW - 1) + clamp(Math.floor(p.y / CELL), 0, GH - 1) * GW;
    const s = ci(from), g = ci(to), cost = new Float32Array(GW * GH).fill(1e9), prev = new Int32Array(GW * GH).fill(-1), shut = new Uint8Array(GW * GH);
    const open = [s]; cost[s] = 0;
    const hEst = i => Math.hypot(i % GW - g % GW, ((i / GW) | 0) - ((g / GW) | 0));
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (cost[open[i]] + hEst(open[i]) < cost[open[bi]] + hEst(open[bi])) bi = i;
      const c = open.splice(bi, 1)[0]; if (c === g) break; if (shut[c]) continue; shut[c] = 1;
      const cx = c % GW, cy = (c / GW) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy; if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = nx + ny * GW; if (grid[n] && n !== g) continue;
        const nc = cost[c] + Math.hypot(dx, dy); if (nc < cost[n]) { cost[n] = nc; prev[n] = c; open.push(n); }
      }
    }
    if (prev[g] < 0 && g !== s) return null;
    const pts = [to]; for (let c = prev[g]; c >= 0 && c !== s; c = prev[c]) pts.unshift({x: (c % GW + .5) * CELL, y: (((c / GW) | 0) + .5) * CELL});
    pts.unshift({x: from.x, y: from.y});
    const out = [pts[0]]; let i = 0;                      // line-of-sight pruning
    while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !clear(pts[i], pts[j])) j--; out.push(pts[j]); i = j; }
    return out;
  }

  function hlTick(t) {                                    // slow: where to go / what to grab
    let tag = 'idle'; nHL++;
    if (goal && R.reachT === null) {
      const p = plan(R, goal);
      if (!p) { say(`No route to ${goal.label || 'that spot'} · goal dropped`); goal = null; path = []; }
      else {
        path = p; const wp = p[1] || goal, d = Math.hypot(goal.x - R.x, goal.y - R.y);
        cmdHead = Math.atan2(wp.y - R.y, wp.x - R.x); cmdSpeed = clamp(d / .8, .35, 1);
        wpInfo = `${goal.item ? 'grab ' + goal.label : 'go'} · heading ${Math.round((cmdHead * 180 / Math.PI + 360) % 360)}° · ${d.toFixed(1)} m`; tag = 'go';
      }
    }
    if (!goal) { cmdSpeed = 0; wpInfo = 'waiting for you'; }
    hlTicks.push({t, a: cmdHead, go: tag === 'go'});
  }

  function llTick(T) {                                    // fast: joint (or wheel) targets, balance, heading servo
    const b = B_(), gk = grounded ? 1 : .45; nLL++;
    const err = wrap(cmdHead - R.a) + (grounded ? 0 : (Math.random() - .5) * .9);
    R.om = goal && R.reachT === null ? clamp(7 * gk * err, -3.2, 3.2) : 0;
    R.vCmd = cmdSpeed * b.speed * Math.max(0, Math.cos(err));
    R.u = (-85 * R.wob - 20 * R.wobV) * gk;
    if (b.wheels) { const tw = .22; R.wq = [clamp((R.vCmd - R.om * tw) / b.speed, -1.5, 1.5), clamp((R.vCmd + R.om * tw) / b.speed, -1.5, 1.5)]; llTicks.push(k.t); return; }
    const sp = Math.hypot(R.vx, R.vy);
    const unsettled = R.legs.some(l => { const n = toWorld(l.hx, l.fy); return !l.stance || Math.hypot(n.x - l.planted.x, n.y - l.planted.y) > .07; });
    const moving = sp > .05 || R.vCmd > .05 || Math.abs(R.om) > .3 || unsettled;
    if (moving) R.gp = (R.gp + T * b.freq) % 1;
    for (const l of R.legs) {
      const p = (R.gp + l.o) % 1, st = !moving || p < .5;
      const nom = toWorld(l.hx + (R.vCmd * .5 / b.freq) * .5, l.fy);
      if (!l.stance && st) l.planted = {...l.cmd};
      if (l.stance && !st) l.lift = {...l.planted};
      l.stance = st;
      if (st) { l.cmd = l.planted; l.h = 0; }
      else { const s = ease((p - .5) / .5); l.cmd = {x: lerp(l.lift.x, nom.x, s), y: lerp(l.lift.y, nom.y, s)}; l.h = Math.sin(Math.PI * (p - .5) / .5); }
      const bf = toBody(l.cmd);
      l.q = [clamp((bf.x - l.hx) / .3, -1.2, 1.2), l.h];
    }
    llTicks.push(k.t);
  }

  function stumble(why) {
    R.stumble = 1.1; stumbles++; flash = 1; R.vx = R.vy = 0; R.om = 0; if (run) run.stumbles++;
    say(`Stumbled · ${why} at ${rate} Hz${grounded ? '' : ' · ungrounded motor control'}`); api.status('Stumble');
  }

  function startRun() {
    run = {t: 0, got: 0, stumbles: 0, body: bodyId}; runPath = []; pathT = 0;
    items.forEach(i => Object.assign(i, {got: false, gone: 0}));
    say(`Fetch run · ${B_().name.toLowerCase()} · grab all 3 items`); clip(0);
  }
  function arrive(label, item) {
    goalsDone++;
    const d = goalStart ? Math.hypot(R.x - goalStart.x, R.y - goalStart.y) : 0;
    record('brain_goal', {body: bodyId, brain: grounded ? 'skild' : 'vlm_stylized', ll_hz: rate, hl_hz: HL_HZ, kind: item ? 'grab' : 'go', item: item ? item.label.toLowerCase() : null, dist_m: r2(d), time_s: r2(goalT), stumbles});
    say(`Goal ${goalsDone} · ${label || 'reached'} · ${goalT.toFixed(1)} s`);
    if (item && run) {
      run.got++;
      if (run.got >= 3) {
        const t = r2(run.t), prev = best[bodyId], nb = prev === undefined || t < prev; if (nb) best[bodyId] = t;
        lastRun = {t, body: bodyId, stumbles: run.stumbles, nb: nb && prev !== undefined}; flash = .6;
        record('brain_run', {body: bodyId, brain: grounded ? 'skild' : 'vlm_stylized', ll_hz: rate, time_s: t, stumbles: run.stumbles, path: runPath});
        say(`Fetch run done in ${t} s${lastRun.nb ? ' · new best' : ''}. You chose where; it placed every ${B_().wheels ? 'wheel turn' : 'step'}.`);
        api.status(`Run · ${t} s`); run = null;
        if (!completed) { completed = true; api.complete('Skild Brain · you planned, it moved'); }
      } else api.status(`Fetch · ${run.got}/3`);
    } else api.status(run ? `Fetch · ${run.got}/3` : 'Goal reached');
  }

  k.frame((dt, t) => {
    const b = B_();
    flash = Math.max(0, flash - dt * 1.5);
    if (run) { run.t += dt; pathT += dt; if (pathT > .5 && runPath.length < 120) { pathT = 0; runPath.push([r2(R.x), r2(R.y)]); } }
    if (goal) goalT += dt;
    hlAcc += dt; if (hlAcc >= 1 / HL_HZ) { hlAcc %= 1 / HL_HZ; hlTick(t); }
    llAcc += dt; let n = 0; while (llAcc >= 1 / rate && n++ < 6) { llAcc -= 1 / rate; llTick(1 / rate); }
    if (R.stumble > 0) {
      R.stumble -= dt; R.wob *= Math.pow(.02, dt); R.wobV = 0; R.u = 0;
      if (R.stumble <= 0) { resetBody(); api.status(goal ? 'Moving' : 'Standing'); }
    } else {
      const tv = R.vCmd || 0;                               // body dynamics (continuous), commands held between low-level ticks
      R.vx = lerp(R.vx, Math.cos(R.a) * tv, 1 - Math.exp(-dt * 6)); R.vy = lerp(R.vy, Math.sin(R.a) * tv, 1 - Math.exp(-dt * 6));
      R.a = wrap(R.a + R.om * dt); R.x += R.vx * dt; R.y += R.vy * dt;
      const noise = (Math.random() - .5) * 2 * (2.5 + 5 * Math.hypot(R.vx, R.vy) + Math.abs(R.om) * 1.5) * (b.wheels ? .55 : 1);
      R.wobV += (14 * R.wob + R.u + noise) * dt; R.wob += R.wobV * dt;
      if (Math.abs(R.wob) > 1) stumble(b.wheels ? 'tipped the base' : 'lost balance');
      else for (const l of R.legs) if (l.stance) { const h = toWorld(l.hx, l.hy); if (Math.hypot(l.foot.x - h.x, l.foot.y - h.y) > b.reach) { stumble(`${l.id} foot left behind`); break; } }
    }
    for (const o of OBST) {                               // collide with furniture and walls
      const r = .3, cx = clamp(R.x, o.x, o.x + o.w), cy = clamp(R.y, o.y, o.y + o.h), d = Math.hypot(R.x - cx, R.y - cy);
      if (d < r && d > 0) { R.x = cx + (R.x - cx) / d * r; R.y = cy + (R.y - cy) / d * r; }
    }
    R.x = clamp(R.x, .3, RW - .3); R.y = clamp(R.y, .3, RH - .3);
    for (const l of R.legs) { const f = 1 - Math.exp(-dt * 30); l.foot.x = lerp(l.foot.x, l.cmd.x, f); l.foot.y = lerp(l.foot.y, l.cmd.y, f); l.hs = lerp(l.hs || 0, l.h, f); }
    if (b.wheels) R.gp = (R.gp + dt * Math.hypot(R.vx, R.vy) * 3) % 1;
    // goal / reach logic
    if (goal && R.reachT === null && R.stumble <= 0) {
      const d = Math.hypot(goal.x - R.x, goal.y - R.y);
      if (goal.item && d < .62) { R.reachT = 0; cmdSpeed = 0; R.vCmd = 0; say(`Low-level: reach for the ${goal.item.label.toLowerCase()}`); }
      else if (!goal.item && d < .22) { arrive(); goal = null; path = []; cmdSpeed = 0; }
    }
    if (R.reachT !== null) {
      R.reachT += dt; R.reach = R.reachT < .6 ? ease(R.reachT / .6) : R.reachT < 1.1 ? 1 : Math.max(0, 1 - (R.reachT - 1.1) / .5);
      if (R.reachT >= .6 && !goal.item.got && !goal.slip) {
        if (!grounded && Math.random() < .5) { goal.slip = true; say('Grasp slipped · no grounded sense of contact (stylized)'); }
        else goal.item.got = true;
      }
      if (R.reachT >= 1.6) {
        const it = goal.item;
        if (it.got) { it.gone = run ? 1e9 : 4; arrive(it.label.toLowerCase() + ' grabbed', it); goal = null; path = []; }
        else goal.slip = false;                            // try again: the high level keeps the same goal
        R.reachT = null; R.reach = 0;
      }
    }
    for (const it of items) if (it.got && it.gone > 0 && it.gone < 1e8) { it.gone -= dt; if (it.gone <= 0) respawn(it); }
    if (!run && items.every(i => i.got)) items.forEach(i => { if (i.gone > 1e8) respawn(i); });
    const q = b.wheels ? [[R.wq[0], 0], [R.wq[1], 0]] : R.legs.map(l => l.q.slice());
    samples.push({t, q});
    while (samples.length && samples[0].t < t - WIN) samples.shift();
    while (hlTicks.length && hlTicks[0].t < t - WIN) hlTicks.shift();
    while (llTicks.length && llTicks[0] < t - WIN) llTicks.shift();
    draw(t);
  });

  function respawn(it) {
    for (let i = 0; i < 40; i++) { const x = rand(.6, RW - .6), y = rand(.6, RH - .6); if (!blockedAt(x, y, .45) && Math.hypot(x - R.x, y - R.y) > 1.5) { Object.assign(it, {x, y, got: false, gone: 0}); return; } }
    Object.assign(it, {got: false, gone: 0});
  }

  // ---- layout: panel left (full height); room top right; lanes below it, left of the video corner ----
  const PW = 250;
  const room = () => { const x0 = PW + 20, y0 = 58, w = k.w - PW - 40, h = Math.max(150, k.h - 58 - 250); const s = Math.min(w / RW, h / RH); return {s, x: x0 + (w - RW * s) / 2, y: y0 + (h - RH * s) / 2}; };
  const S = p => { const r = room(); return [r.x + p.x * r.s, r.y + p.y * r.s]; };

  k.onDown(p => {
    const r = room(), w = {x: (p.x - r.x) / r.s, y: (p.y - r.y) / r.s};
    if (w.x < 0 || w.y < 0 || w.x > RW || w.y > RH) return;
    if (R.reachT !== null) return;
    const it = items.find(i => !i.got && Math.hypot(i.x - w.x, i.y - w.y) < .42);
    if (it) {
      if (!run) startRun();
      const a = Math.atan2(R.y - it.y, R.x - it.x); let g = {x: it.x + Math.cos(a) * .5, y: it.y + Math.sin(a) * .5};
      if (blockedAt(g.x, g.y, .3)) g = {x: it.x, y: it.y};
      goal = {...g, item: it, label: it.label.toLowerCase()}; say(`High-level: grab the ${it.label.toLowerCase()}`);
    }
    else if (blockedAt(w.x, w.y, .3)) { say('That spot is blocked · pick open floor'); flash = .4; return; }
    else { goal = {x: w.x, y: w.y, label: null}; say(`High-level: go to (${w.x.toFixed(1)}, ${w.y.toFixed(1)}) m`); }
    goalT = 0; goalStart = {x: R.x, y: R.y};
    hlAcc = 1 / HL_HZ; api.status('Moving');             // next high-level tick right away
  });

  function drawRobot(t) {
    const r = room(), s = r.s, [cx, cy] = S(R);
    const shake = R.stumble > 0 ? Math.sin(t * 60) * 3 * R.stumble : 0, sway = R.wob * .07 * s;
    const px = cx - Math.sin(R.a) * sway + shake, py = cy + Math.cos(R.a) * sway;
    ctx.lineCap = 'round';
    for (const l of R.legs) {                           // legs: hip → knee → foot
      const h = toWorld(l.hx, l.hy); const [hx, hy] = [px + (S(h)[0] - cx), py + (S(h)[1] - cy)]; const [fx, fy] = S(l.foot);
      const mx = (hx + fx) / 2 + (-Math.sin(R.a)) * Math.sign(l.hy) * s * .06, my = (hy + fy) / 2 + Math.cos(R.a) * Math.sign(l.hy) * s * .06;
      if (bodyId === 'quad') {
        ctx.strokeStyle = B.cool4; ctx.lineWidth = s * .07; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(mx, my); ctx.stroke();
        ctx.strokeStyle = B.cool2; ctx.lineWidth = s * .05; ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(fx, fy); ctx.stroke();
        ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(mx, my, s * .03, 0, 7); ctx.fill();
      } else { ctx.strokeStyle = B.cool3; ctx.lineWidth = s * .08; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(fx, fy); ctx.stroke(); }
      ctx.fillStyle = 'rgba(18,18,18,.12)'; ctx.beginPath(); ctx.arc(fx, fy, s * (.05 + l.hs * .02), 0, 7); ctx.fill();
      ctx.fillStyle = l.stance ? B.black : B.white; ctx.strokeStyle = B.black; ctx.lineWidth = 1.5;
      ctx.save(); ctx.translate(fx, fy - l.hs * s * .06); ctx.rotate(R.a);
      ctx.beginPath(); bodyId === 'quad' ? ctx.arc(0, 0, s * .045, 0, 7) : ctx.roundRect(-s * .09, -s * .045, s * .18, s * .09, 3); ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.translate(px, py); ctx.rotate(R.a + R.wob * .08);
    if (bodyId === 'quad') {
      ctx.fillStyle = B.black; ctx.beginPath(); ctx.roundRect(-s * .44, -s * .17, s * .88, s * .34, s * .08); ctx.fill();
      ctx.fillStyle = B.cool3; ctx.beginPath(); ctx.roundRect(-s * .3, -s * .09, s * .5, s * .18, s * .04); ctx.fill();
      ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(s * .38, 0, s * .05, 0, 7); ctx.fill();
    } else if (bodyId === 'human') {
      const sw = Math.sin(R.gp * Math.PI * 2) * s * .1 * Math.min(1, Math.hypot(R.vx, R.vy) * 3);
      ctx.strokeStyle = B.cool2; ctx.lineWidth = s * .06;
      for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(0, sd * s * .22); ctx.lineTo(sd * sw, sd * s * .27); ctx.stroke(); }
      ctx.fillStyle = B.black; ctx.beginPath(); ctx.ellipse(0, 0, s * .12, s * .24, 0, 0, 7); ctx.fill();
      ctx.fillStyle = B.cool3; ctx.beginPath(); ctx.arc(s * .02, 0, s * .1, 0, 7); ctx.fill();
      ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(s * .09, 0, s * .03, 0, 7); ctx.fill();
    } else {                                              // mobile manipulator: wheeled base + arm mount
      for (const [wx, wy] of [[.22, -.24], [.22, .24], [-.22, -.24], [-.22, .24]]) {
        ctx.fillStyle = B.cool4; ctx.beginPath(); ctx.roundRect(s * (wx - .09), s * (wy - .04), s * .18, s * .08, 3); ctx.fill();
        ctx.strokeStyle = B.cool1; ctx.lineWidth = 1; const ph = (R.gp * 4 + (wy > 0 ? .5 : 0)) % 1; ctx.beginPath(); ctx.moveTo(s * (wx - .09 + .18 * ph), s * (wy - .04)); ctx.lineTo(s * (wx - .09 + .18 * ph), s * (wy + .04)); ctx.stroke();
      }
      ctx.fillStyle = B.black; ctx.beginPath(); ctx.roundRect(-s * .3, -s * .21, s * .6, s * .42, s * .08); ctx.fill();
      ctx.fillStyle = B.cool3; ctx.beginPath(); ctx.arc(s * .08, 0, s * .1, 0, 7); ctx.fill();
      ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(s * .24, 0, s * .04, 0, 7); ctx.fill();
    }
    ctx.restore();
    if (R.reach > 0 && goal && goal.item) {             // reaching arm (the high level asked, the low level executes)
      const base = toWorld(bodyId === 'quad' ? .1 : .05, bodyId === 'human' ? .2 : 0), [bx, by] = S(base), [ix, iy] = S(goal.item);
      const ex = lerp(bx, ix, R.reach), ey = lerp(by, iy, R.reach);
      ctx.strokeStyle = B.cool4; ctx.lineWidth = s * .05; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.fillStyle = goal.slip ? B.cool2 : B.orange; ctx.beginPath(); ctx.arc(ex, ey, s * .045, 0, 7); ctx.fill();
      if (goal.item.got) { ctx.fillStyle = B.orange; ctx.beginPath(); ctx.roundRect(ex - s * .08, ey - s * .08, s * .16, s * .16, 4); ctx.fill(); }
    }
  }

  function draw(t) {
    k.clear(B.warm1);
    const r = room(), s = r.s, b = B_(), ax = PW + 20;
    k.text(run ? `Goal: grab all 3 items · ${run.got}/3 · ${run.t.toFixed(1)} s` : 'Goal: you are the high-level policy. Click an item to start a fetch run.', ax, 30, {size: 15, weight: 600});
    k.label('Room · top view · simulated · click floor or an item', ax, 48);
    ctx.fillStyle = B.white; ctx.strokeStyle = B.warm2; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(r.x, r.y, RW * s, RH * s, 12); ctx.fill(); ctx.stroke();
    ctx.save(); ctx.beginPath(); ctx.roundRect(r.x, r.y, RW * s, RH * s, 12); ctx.clip();
    ctx.strokeStyle = 'rgba(18,18,18,.05)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = 0; x <= RW; x += .5) { ctx.moveTo(r.x + x * s + .5, r.y); ctx.lineTo(r.x + x * s + .5, r.y + RH * s); }
    for (let y = 0; y <= RH; y += .5) { ctx.moveTo(r.x, r.y + y * s + .5); ctx.lineTo(r.x + RW * s, r.y + y * s + .5); } ctx.stroke();
    for (const o of OBST) { const [x, y] = S(o); ctx.fillStyle = B.warm2; ctx.strokeStyle = B.warm3; ctx.beginPath(); ctx.roundRect(x, y, o.w * s, o.h * s, 8); ctx.fill(); ctx.stroke(); k.label(o.label, x + 8, y + 16, {color: B.warm4}); }
    if (path.length > 1 && goal) {                      // high-level plan
      ctx.setLineDash([5, 6]); ctx.lineDashOffset = -t * 20; ctx.strokeStyle = B.cool1; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(...S(R));
      path.slice(1).forEach(p => ctx.lineTo(...S(p))); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const it of items) {
      if (it.got) continue;
      const [x, y] = S(it), hot = goal && goal.item === it, pulse = run ? 0 : (Math.sin(t * 3) + 1) * .5;
      if (!run && !goal) { ctx.strokeStyle = `rgba(255,126,0,${.25 + pulse * .4})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, s * (.24 + pulse * .06), 0, 7); ctx.stroke(); }
      ctx.fillStyle = hot ? B.orange : B.cool1; ctx.beginPath();
      it.label === 'Ball' ? ctx.arc(x, y, s * .12, 0, 7) : it.label === 'Toolbox' ? ctx.roundRect(x - s * .16, y - s * .1, s * .32, s * .2, 4) : ctx.roundRect(x - s * .06, y - s * .13, s * .12, s * .26, 4); ctx.fill();
      k.text(it.label, x, y + s * .28, {align: 'center', size: 11, color: B.cool2});
    }
    if (goal && !goal.item) { const [x, y] = S(goal), pr = (t * 1.5) % 1; ctx.strokeStyle = B.orange; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.stroke(); ctx.globalAlpha = 1 - pr; ctx.beginPath(); ctx.arc(x, y, 8 + pr * 18, 0, 7); ctx.stroke(); ctx.globalAlpha = 1; }
    drawRobot(t);
    if (lastRun && !run && flash > 0) { ctx.fillStyle = `rgba(255,126,0,${flash * .15})`; ctx.fillRect(r.x, r.y, RW * s, RH * s); }
    else if (flash > 0) { ctx.fillStyle = `rgba(46,58,71,${flash * .12})`; ctx.fillRect(r.x, r.y, RW * s, RH * s); }
    if (lastRun && !run) {
      const cw = Math.min(330, RW * s - 24); ctx.fillStyle = B.orange; ctx.beginPath(); ctx.roundRect(r.x + 12, r.y + 12, cw, 48, 10); ctx.fill();
      k.text(`Fetch run · ${lastRun.t} s · ${BODIES[lastRun.body].name}${lastRun.nb ? ' · best!' : ''}`, r.x + 26, r.y + 32, {size: 13, weight: 600, color: B.black});
      k.text('Now swap the body: same brain, same goals.', r.x + 26, r.y + 50, {size: 12, color: B.black});
    }
    ctx.restore();

    // ---- lanes: high-level (slow) and low-level (fast), left of the video corner ----
    const lx = ax, lw = Math.max(260, k.w - 360 - lx), ly = k.h - 236, lh = 224, x0 = lx + 104, xw = lw - 116, X = tt => x0 + (tt - (t - WIN)) / WIN * xw;
    ctx.fillStyle = B.white; ctx.strokeStyle = B.warm2; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(lx, ly, lw, lh, 12); ctx.fill(); ctx.stroke();
    k.label('High-level', lx + 12, ly + 24, {color: B.black}); k.label(`${HL_HZ} Hz · where`, lx + 12, ly + 38);
    ctx.strokeStyle = B.warm2; ctx.beginPath(); ctx.moveTo(x0, ly + 30); ctx.lineTo(x0 + xw, ly + 30); ctx.stroke();
    for (const h of hlTicks) {
      const x = X(h.t); if (x < x0) continue; ctx.fillStyle = h.go ? B.black : B.warm3; ctx.fillRect(x - 1, ly + 16, 2, 28);
      if (h.go) { ctx.save(); ctx.translate(x + 12, ly + 30); ctx.rotate(h.a); ctx.strokeStyle = B.orange; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(2, -4); ctx.lineTo(6, 0); ctx.lineTo(2, 4); ctx.stroke(); ctx.restore(); }
    }
    k.text(wpInfo, x0 + xw, ly + 14, {align: 'right', size: 11, mono: true, color: B.cool2});
    const rows = b.wheels ? [['L wheel', 0, 0], ['R wheel', 1, 0]] : bodyId === 'quad' ? R.legs.map((l, i) => [l.id + ' hip', i, 0]) : [['L hip', 0, 0], ['R hip', 1, 0], ['L knee', 0, 1], ['R knee', 1, 1]];
    const ry = ly + 64, rh = Math.min(34, (lh - 84) / rows.length);
    k.label('Low-level', lx + 12, ry + 20, {color: B.black}); k.label(`${rate} Hz · ${b.wheels ? 'wheels' : 'joints'}`, lx + 12, ry + 34);
    ctx.fillStyle = B.warm3; for (const tt of llTicks) { const x = X(tt); if (x > x0) ctx.fillRect(x, ry - 10, 1, 4); }
    rows.forEach(([name, li, ji], ri) => {
      const yc = ry + ri * rh + rh / 2;
      k.label(name, x0 - 8, yc + 4, {color: B.cool1, align: 'right'});
      ctx.strokeStyle = B.warm2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, yc); ctx.lineTo(x0 + xw, yc); ctx.stroke();
      ctx.strokeStyle = ri % 2 === 0 ? B.orange : B.cool2; ctx.lineWidth = 1.5; ctx.beginPath(); let pen = false;
      samples.forEach(sm => { const q = sm.q[li]; if (!q) return; const v = ji ? -q[1] * .8 + .4 : q[0] * .5; const x = X(sm.t), y = yc - v * rh * .8; if (x < x0) return; pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; });
      ctx.stroke();
    });
    k.label('illustrative rates · the post gives no numbers', lx + 12, ly + lh - 10, {color: B.cool1});

    // ---- left panel ----
    const x = 18, iw = PW - 36;
    ctx.fillStyle = B.white; ctx.fillRect(0, 0, PW, k.h); ctx.fillStyle = B.warm2; ctx.fillRect(PW, 0, 1, k.h);
    k.label('Skild Brain · one brain, any body', x, 28);
    k.text(b.name, x, 52, {size: 18, weight: 600});
    k.label('Best fetch run per body', x, 78);
    BIDS.forEach((id, i) => { const y = 96 + i * 18, bt = best[id]; ctx.fillStyle = bt !== undefined ? B.orange : id === bodyId ? B.black : B.warm2; ctx.beginPath(); ctx.arc(x + 5, y - 4, 5, 0, 7); ctx.fill();
      k.text(BODIES[id].name, x + 16, y, {size: 12, color: id === bodyId ? B.black : B.cool2, weight: id === bodyId ? 600 : 400}); k.text(bt !== undefined ? bt + ' s' : '—', x + iw, y, {size: 12, mono: true, align: 'right', color: bt !== undefined ? B.black : B.cool1}); });
    const per = Math.max(1, Math.round(rate / HL_HZ));
    k.label('Motor updates per decision', x, 162); k.text(`${per}`, x, 188, {size: 24, weight: 600, color: per >= 15 ? B.orange : B.black});
    k.text(`every ${Math.round(1000 / rate)} ms`, x + 56, 186, {size: 12, mono: true, color: B.cool2});
    k.meter(x, 214, iw, clamp(Math.abs(R.wob), 0, 1), 'Balance error');
    k.label('Stumbles', x, 238); k.text(String(stumbles), x + iw, 238, {size: 13, weight: 600, mono: true, align: 'right', color: stumbles ? B.black : B.cool1});
    k.text(!grounded ? 'Ungrounded motor control (stylized).' : rate >= 25 ? 'Fast layer keeps it steady.' : rate >= 10 ? 'Commands arrive late · jitter.' : 'Too slow to catch a fall.', x, 256, {size: 12, color: rate >= 25 && grounded ? B.cool2 : B.black});
    // training recipe card: the post's contrast
    ctx.fillStyle = grounded ? 'rgba(255,126,0,.1)' : B.warm1; ctx.beginPath(); ctx.roundRect(x, 270, iw, 68, 8); ctx.fill();
    k.label(grounded ? 'Trained on' : 'VLM in disguise · stylized', x + 10, 288, {color: grounded ? B.black : B.cool2});
    k.text(grounded ? 'Large-scale sim + human video' : 'Web images and text', x + 10, 306, {size: 12, weight: 600});
    k.text(grounded ? '+ targeted real-world data' : '+ <1% robot data sprinkled in', x + 10, 324, {size: 12, color: B.cool2});
    k.label('Log', x, 360);
    drawLog(k, log.slice(-7), x, 380, iw, k.h - 386);
  }

  resetBody(); hlTick(0);
  const bodyBtn = k.button('Body: Quadruped', () => {
    bodyId = BIDS[(BIDS.indexOf(bodyId) + 1) % BIDS.length]; bodyBtn.textContent = 'Body: ' + B_().name; resetBody(); samples = [];
    if (run) { run = null; items.forEach(i => { if (i.got) respawn(i); }); say('Run reset for the new body'); }
    say(`Swapped body → ${B_().name.toLowerCase()} · same brain, same goals`); clip(0);
  });
  const rateIn = k.slider('Low-level rate (Hz)', 2, 50, 50, v => { if (v !== rate) { rate = v; llTicks = []; } }, 1);
  const dataBtn = k.button('Data: sim + human video', () => {
    grounded = !grounded; dataBtn.textContent = grounded ? 'Data: sim + human video' : 'Data: VLM + <1% robot'; dataBtn.classList.toggle('on', !grounded);
    say(grounded ? 'Back to the Skild recipe: physically grounded training data' : 'Stylized contrast: a VLM with a sprinkle of robot data knows what, not how');
  });
  k.button('Clear goal', () => { if (goal && goal.item) goal.item.got = false; goal = null; path = []; cmdSpeed = 0; R.reachT = null; R.reach = 0; say('Goal cleared'); });
  k.button('Rate 50 Hz', () => { rateIn.value = 50; rateIn.oninput(); say('Low-level back to 50 Hz'); }, {primary: true});
  api.status('Click an item');
  return () => k.destroy();
}
