// TRY · Learning by watching — "Show it once": the visitor is the human in the video. They demonstrate a task with the
// mouse (a hand), the robot maps that motion into its own body (the embodiment gap) and repeats it, on different bodies.
// Post facts used: human video (egocentric + instructional) is the internet-scale data source; videos carry no forces or
// torques; a hand, a 7-DOF arm and a quadruped have very different bodies; new skills from video with <1 hr of robot data.
import {kit, B, lerp, clamp} from './kit.js';

// Task space is a unit square shared by both panes (u → right, v → down). Table surface at v = .84.
const FLOOR = .805, CUBE = .035, A = [.2, FLOOR], BZ = [.8, FLOOR], HUMAN = {sh: [-.04, .32], l1: .52, l2: .52};
const PI = Math.PI;
const BODIES = [
  {id: 'arm3', name: '3-link arm', base: [.5, .84], lens: [.26, .22, .14], rMin: .08, aMin: -PI, aMax: 0, side: -1, tool: 'gripper', rest: [.5, .45]},
  {id: 'arm2', name: '2-link arm', base: [.5, .84], lens: [.24, .2], rMin: .1, aMin: -PI, aMax: 0, side: -1, tool: 'gripper', rest: [.5, .5]},
  {id: 'leg', name: 'Quadruped front leg', base: [.5, .34], lens: [.3, .3], rMin: .12, aMin: .35, aMax: PI - .35, side: 1, tool: 'foot', rest: [.46, .78]},
];
const CUP = {u0: .7, u1: .9, v0: .4, v1: .7};            // pour zone above the cup at B
const WIPE = {u0: .25, u1: .75, n: 10};
const TASKS = {
  place: {name: 'Pick & place', short: 'Place', obj: 'cube', goal: 'carry the cube from A to B'},
  tea: {name: 'Pour the tea', short: 'Tea', obj: 'teapot', goal: 'lift the teapot at A and hold it over the cup', armsOnly: true},
  wipe: {name: 'Wipe the table', short: 'Wipe', obj: 'cloth', goal: 'grab the cloth at A and wipe between the marks'},
};
const TIDS = Object.keys(TASKS);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const toward = (a, b, L) => { const dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1e-6; return [a[0] + dx / d * L, a[1] + dy / d * L]; };
const r3 = v => Math.round(v * 1000) / 1000;

// Project a point into a body's reachable workspace (annulus sector around the base).
function project(body, p) {
  const [bx, by] = body.base, dx = p[0] - bx, dy = p[1] - by;
  const rMax = body.lens.reduce((s, l) => s + l, 0) * .985;
  let r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
  const inA = a >= body.aMin && a <= body.aMax;
  if (!inA) a = Math.abs(wrap(a - body.aMin)) < Math.abs(wrap(a - body.aMax)) ? body.aMin : body.aMax;
  const ok = inA && r >= body.rMin && r <= rMax;
  r = clamp(r, body.rMin, rMax);
  return {u: bx + Math.cos(a) * r, v: by + Math.sin(a) * r, ok};
}
// FABRIK with a warm start, keeping joints on the body's side of the base (arms above the table, leg below the hip).
function fabrik(J, body, T) {
  const n = body.lens.length, base = body.base;
  for (let i = 1; i < n; i++) J[i][1] += body.side * .012;      // small bend bias: avoids the straight-chain singularity
  for (let it = 0; it < 12; it++) {
    J[n] = [T[0], T[1]];
    for (let i = n - 1; i >= 0; i--) J[i] = toward(J[i + 1], J[i], body.lens[i]);
    for (let i = 1; i < n; i++) J[i][1] = body.side < 0 ? Math.min(J[i][1], base[1] - .02) : Math.max(J[i][1], base[1] + .02);
    J[0] = [base[0], base[1]];
    for (let i = 0; i < n; i++) J[i + 1] = toward(J[i], J[i + 1], body.lens[i]);
  }
  return J;
}
function initPose(body) {
  const J = [[...body.base]]; let a = body.side < 0 ? -PI / 2 - .5 : PI / 2 + .45;
  body.lens.forEach((l, i) => { const p = J[i]; J.push([p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l]); a += body.side < 0 ? 1.1 : -.9; });
  return fabrik(J, body, body.rest);
}
// Human arm angles (shoulder, elbow) for the naive "copy the joints" baseline.
function humanAngles(u, v) {
  const {sh, l1, l2} = HUMAN, d = clamp(Math.hypot(u - sh[0], v - sh[1]), .05, l1 + l2 - 1e-3), a = Math.atan2(v - sh[1], u - sh[0]);
  const t1 = a + Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const el = [sh[0] + Math.cos(t1) * l1, sh[1] + Math.sin(t1) * l1];
  return {t1, t2: Math.atan2(v - el[1], u - el[0]) - t1, el};
}
function fk(body, t1, t2) {
  const J = [[...body.base]]; let a = t1;
  body.lens.forEach((l, i) => { if (i === 1) a += t2; const p = J[i]; J.push([p[0] + Math.cos(a) * l, p[1] + Math.sin(a) * l]); });
  return J;
}
// task progress, shared by the human demo and the robot replay
const newEv = () => ({pour: 0, bins: new Set(), grabbed: false});
function evTick(tid, ev, o, held, dt) {
  if (held) ev.grabbed = true;
  if (tid === 'tea' && held && o.u > CUP.u0 && o.u < CUP.u1 && o.v > CUP.v0 && o.v < CUP.v1) ev.pour += dt;
  if (tid === 'wipe' && held && o.v >= FLOOR - .02 && o.u >= WIPE.u0 && o.u <= WIPE.u1) ev.bins.add(Math.min(WIPE.n - 1, Math.floor((o.u - WIPE.u0) / (WIPE.u1 - WIPE.u0) * WIPE.n)));
}
function evOk(tid, ev, o) {
  if (tid === 'place') return ev.grabbed && Math.abs(o.u - BZ[0]) < .075;
  if (tid === 'tea') return ev.pour >= .8;
  return ev.bins.size >= 8;
}
const evPct = (tid, ev) => tid === 'tea' ? clamp(ev.pour / .8, 0, 1) : tid === 'wipe' ? ev.bins.size / 8 : ev.grabbed ? .5 : 0;

function drawLog(k, lines, x, y, w, maxRows) {           // word-wrapped log, newest line in black
  const rows = []; k.ctx.font = '500 12px Geist, system-ui, sans-serif';
  lines.forEach((l, li) => { let cur = ''; for (const wd of l.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (k.ctx.measureText(t).width > w && cur) { rows.push([cur, li]); cur = wd; } else cur = t; } rows.push([cur, li]); });
  rows.slice(-maxRows).forEach(([t, li], i) => k.text(t, x, y + i * 16, {size: 12, color: li === lines.length - 1 ? B.black : B.cool2}));
}

export default function mount(root, api) {
  const k = kit(root); const {ctx} = k;
  const clip = m => api.clip?.(m), record = (kind, d) => api.record?.(kind, d);
  let tid = 'place', bodyI = 0, retarget = true, demo = [], demoId = 0, rec = false, recT = 0, pendingPlay = -1, rep = null;
  const hand = {u: .5, v: .5, grip: false, in: false};
  const hobj = {u: A[0], v: FLOOR, vy: 0};
  const robot = {J: initPose(BODIES[0]), tgt: [...BODIES[0].rest], obj: {u: A[0], v: FLOOR, vy: 0}, held: false};
  let hev = newEv(), rev = newEv(), demoTask = 'place';
  const wins = new Set(), fastest = {}; let completed = false, humanOk = null, result = null, resultT = 0, flash = 0, nDemos = 0, streak = 0, bestStreak = 0;
  const log = ['Press and drag in the left pane: you are the human in the video.'];
  const say = s => { log.push(s); if (log.length > 12) log.shift(); };
  let cache = {key: ''};
  const T = () => TASKS[tid];

  // layout: panes on top, strip below; the strip stops left of the bottom-right video corner (340×230)
  const panes = () => { const top = 40, bot = k.h - 240, mid = k.w / 2; return {L: {x: 16, y: top, w: mid - 24, h: bot - top}, R: {x: mid + 8, y: top, w: k.w - mid - 24, h: bot - top}}; };
  const fit = p => { const s = Math.max(40, Math.min(p.w - 24, p.h - 34)); return {s, ox: p.x + (p.w - s) / 2, oy: p.y + 30 + (p.h - 34 - s) / 2}; };
  const XY = (f, u, v) => [f.ox + u * f.s, f.oy + v * f.s];
  const proj = () => {
    const key = demoId + '/' + bodyI + '/' + demo.length;
    if (cache.key !== key) { const pts = demo.map(s => project(BODIES[bodyI], [s.u, s.v])); cache = {key, pts, gap: pts.length ? pts.filter(p => !p.ok).length / pts.length : 0}; }
    return cache;
  };
  const resetObj = o => Object.assign(o, {u: A[0], v: FLOOR, vy: 0});

  function pickTask(id) {
    if (rec) return;
    tid = id; demo = []; demoId++; rep = null; result = null; humanOk = null; pendingPlay = -1; hev = newEv(); rev = newEv();
    resetObj(hobj); resetObj(robot.obj); robot.held = false; hand.grip = false;
    taskBtns.forEach(b => b.classList.toggle('on', b.dataset.id === id));
    say(`Task: ${T().name}. Show it once in the left pane.`); api.status('Task · ' + T().short);
    clip(0);
  }
  function startRec() {
    rec = true; recT = 0; demo = []; demoId++; hand.grip = false; humanOk = null; pendingPlay = -1; rep = null; result = null; hev = newEv(); demoTask = tid;
    resetObj(hobj); resetObj(robot.obj); robot.held = false;
    api.status('Recording demo'); say(`Recording… ${T().goal}.`);
  }
  function saveDemo(ok) {                                // every human demo goes to the player dataset (crowd policy input)
    const n = demo.length, stride = Math.max(1, Math.ceil(n / 120)), pts = [];
    for (let i = 0; i < n && pts.length < 120; i += stride) pts.push([r3(demo[i].u), r3(demo[i].v), r3(demo[i].t)]);
    record('demo', {task: demoTask, body: BODIES[bodyI].id, points: pts, success: !!ok});
    nDemos++;
  }
  function stopRec() {
    if (!rec) return; rec = false; hand.grip = false;
    if (demo.length < 2) { api.status('Ready'); return; }
    const ok = evOk(tid, hev, hobj); humanOk = ok;
    saveDemo(ok);
    if (demo.length < 8) { say('Too short. Drag a longer motion.'); api.status('Ready'); return; }
    say(`Demo ${nDemos} · ${demo[demo.length - 1].t.toFixed(1)} s · ${ok ? 'task done ✓' : 'task not done'} · saved to the dataset`);
    pendingPlay = .7; api.status('Demo recorded');
  }
  function play() {
    if (rec) stopRec();
    if (demo.length < 8) { say('Record a demo first: drag in the left pane.'); return; }
    const body = BODIES[bodyI];
    if (T().armsOnly && body.tool === 'foot') { say(`A foot can’t hold a ${T().obj}. That gap is too wide · switch to an arm.`); api.status('Embodiment gap too wide'); flash = .6; return; }
    pendingPlay = -1; rep = {t: 0, idx: 0, naive: !retarget, body: bodyI, picked: false, end: 0};
    resetObj(robot.obj); robot.held = false; result = null; rev = newEv();
    if (!rep.naive) robot.J = initPose(body);
    say(rep.naive ? 'Naive copy: human joint angles → robot joints.' : `Mapping the hand path into the ${body.name}…`);
    api.status('Robot repeating'); clip(0);
  }
  function finish() {
    const body = BODIES[rep.body], ok = evOk(tid, rev, robot.obj), gap = Math.round(proj().gap * 100);
    result = {ok, naive: rep.naive}; resultT = 0;
    record('robot_repeat', {task: tid, body: body.id, retarget: !rep.naive, success: ok, gap_pct: gap, demo_s: r3(demo[demo.length - 1].t)});
    if (ok && !rep.naive) {
      const cell = tid + '/' + body.id, fresh = !wins.has(cell); wins.add(cell); flash = 1; streak++; bestStreak = Math.max(bestStreak, streak);
      const d = demo[demo.length - 1].t; if (!fastest[tid] || d < fastest[tid]) fastest[tid] = d;
      say(`${body.name}: ${T().short.toLowerCase()} done ✓${fresh ? ' · new cell' : ''}${streak > 1 ? ` · streak ${streak}` : ''}`);
    } else {
      streak = 0;
      if (ok) say('Lucky: the joint copy worked this time.');
      else if (rep.naive) say(rep.picked ? 'Joint copy lost the object off target.' : 'Missed: human joint angles don’t fit this body.');
      else say(rep.picked ? 'Repeated the motion but missed the goal. Was the demo itself a success?' : `The demo never touched the ${T().obj}, so neither did the robot.`);
    }
    api.status(ok ? 'Repeated ✓' : 'Missed');
    const bodiesDone = new Set([...wins].map(c => c.split('/')[1]));
    if (!completed && bodiesDone.size >= 2) { completed = true; say('Two bodies learned from your demos. The post: new skills from video, <1 hr of robot data.'); api.complete('Learned by watching · 2 bodies'); }
    rep = null;
  }
  function fall(c, dt) { if (c.v < FLOOR) { c.vy += 3.2 * dt; c.v = Math.min(FLOOR, c.v + c.vy * dt); } else c.vy = 0; }

  k.onDown(p => {
    const f = fit(panes().L); const u = (p.x - f.ox) / f.s, v = (p.y - f.oy) / f.s;
    if (u >= -.02 && u <= 1.02 && v >= -.02 && v <= 1) { hand.u = clamp(u, 0, 1); hand.v = clamp(v, 0, .83); startRec(); }
  });
  k.onMove(p => {
    const f = fit(panes().L); const u = (p.x - f.ox) / f.s, v = (p.y - f.oy) / f.s;
    hand.in = u >= -.05 && u <= 1.05 && v >= -.05 && v <= 1.05; hand.u = clamp(u, 0, 1); hand.v = clamp(v, 0, .83);
  });
  k.onUp(() => stopRec());

  k.frame((dt, t) => {
    flash = Math.max(0, flash - dt * 1.2); resultT += dt;
    if (rec) {
      recT += dt;
      if (!hand.grip && dist([hand.u, hand.v], [hobj.u, hobj.v]) < .065) { hand.grip = true; say(`Grasp the ${T().obj}.`); }
      demo.push({t: recT, u: hand.u, v: hand.v, grip: hand.grip});
      if (recT > 12) { say('12 s limit reached.'); stopRec(); }
    }
    if (hand.grip) { hobj.u = hand.u; hobj.v = Math.min(FLOOR, hand.v + .01); hobj.vy = 0; } else fall(hobj, dt);
    if (rec) evTick(tid, hev, hobj, hand.grip, dt);
    if (pendingPlay > 0) { pendingPlay -= dt; if (pendingPlay <= 0) play(); }

    const body = BODIES[bodyI];
    if (rep) {
      const d = demo, last = d[d.length - 1];
      rep.t += dt;
      while (rep.idx < d.length - 2 && d[rep.idx + 1].t <= rep.t) rep.idx++;
      const a = d[rep.idx], b = d[Math.min(rep.idx + 1, d.length - 1)], f = b.t > a.t ? clamp((rep.t - a.t) / (b.t - a.t), 0, 1) : 1;
      if (rep.naive) { const h = humanAngles(lerp(a.u, b.u, f), lerp(a.v, b.v, f)); robot.J = fk(body, h.t1, h.t2); }
      else { const P = proj().pts, pa = P[rep.idx], pb = P[Math.min(rep.idx + 1, P.length - 1)]; fabrik(robot.J, body, [lerp(pa.u, pb.u, f), lerp(pa.v, pb.v, f)]); }
      const tip = robot.J[robot.J.length - 1], grip = rep.t < last.t && a.grip;
      if (grip && !robot.held && dist(tip, [robot.obj.u, robot.obj.v]) < .08) { robot.held = true; rep.picked = true; say(body.tool === 'foot' ? 'Foot contact · pushing it along' : 'Robot grasp'); }
      if (robot.held && !grip) robot.held = false;
      if (rep.t >= last.t) rep.end += dt;
      robot.tgt = [...tip];
    } else {
      robot.tgt[0] = lerp(robot.tgt[0], body.rest[0], Math.min(1, dt * 3)); robot.tgt[1] = lerp(robot.tgt[1], body.rest[1], Math.min(1, dt * 3));
      if (robot.J.length !== body.lens.length + 1) robot.J = initPose(body);
      fabrik(robot.J, body, robot.tgt);
    }
    if (robot.held) { const tip = robot.J[robot.J.length - 1]; robot.obj.u = tip[0]; robot.obj.v = Math.min(FLOOR, tip[1] + (body.tool === 'foot' ? .02 : .03)); robot.obj.vy = 0; }
    else fall(robot.obj, dt);
    if (rep) evTick(tid, rev, robot.obj, robot.held, dt);
    if (rep && rep.end > .2 && robot.obj.v >= FLOOR) finish();
    draw(t);
  });

  function drawHand(x, y, closed) {
    ctx.save(); ctx.translate(x, y - 6); ctx.fillStyle = B.warm2; ctx.strokeStyle = B.ink; ctx.lineWidth = 1.4;
    const fl = closed ? 5 : 14;
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.roundRect(-10 + i * 5.4, -fl - (i === 1 || i === 2 ? 2 : 0), 4.8, fl + 6, 2.4); ctx.fill(); ctx.stroke(); }
    ctx.save(); ctx.translate(-11, 10); ctx.rotate(closed ? -.4 : -1); ctx.beginPath(); ctx.roundRect(-2.8, -12, 5.6, 13, 2.8); ctx.fill(); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.roundRect(-11, 0, 22, 18, 6); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function scene(p, f, title, sub, ev, t) {
    ctx.fillStyle = B.white; ctx.strokeStyle = B.warm2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, 14); ctx.fill(); ctx.stroke();
    k.label(title, p.x + 14, p.y + 20); if (sub) k.label(sub, p.x + p.w - 14, p.y + 20, {align: 'right', color: B.cool1});
    const [, ty] = XY(f, 0, .84); ctx.fillStyle = B.warm1; ctx.fillRect(f.ox, ty, f.s, f.s * .16); ctx.fillStyle = B.warm3; ctx.fillRect(f.ox, ty, f.s, 1.5);
    const [ax, ay] = XY(f, A[0], .84), [bx] = XY(f, BZ[0], .84), zw = f.s * .15;
    ctx.fillStyle = B.cool2; ctx.beginPath(); ctx.moveTo(ax, ay + 4); ctx.lineTo(ax - 5, ay + 11); ctx.lineTo(ax + 5, ay + 11); ctx.fill();
    k.label('A', ax, ay + 24, {align: 'center'});
    if (tid === 'place') {
      ctx.setLineDash([5, 4]); ctx.strokeStyle = B.orange; ctx.lineWidth = 1.5; ctx.strokeRect(bx - zw / 2, ay - f.s * .1, zw, f.s * .1); ctx.setLineDash([]);
      k.label('B · target', bx, ay + 24, {align: 'center', color: B.orange});
    } else if (tid === 'tea') {
      const cw = f.s * .07, ch = f.s * .07, pct = clamp(ev.pour / .8, 0, 1);
      ctx.fillStyle = B.white; ctx.strokeStyle = B.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(bx - cw / 2, ay - ch, cw, ch, [0, 0, 5, 5]); ctx.fill(); ctx.stroke();
      if (pct > 0) { ctx.fillStyle = '#B5651D'; ctx.fillRect(bx - cw / 2 + 2, ay - 2 - (ch - 4) * pct, cw - 4, (ch - 4) * pct); }
      const [z0x, z0y] = XY(f, CUP.u0, CUP.v0), [z1x, z1y] = XY(f, CUP.u1, CUP.v1);
      ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,126,0,.55)'; ctx.lineWidth = 1; ctx.strokeRect(z0x, z0y, z1x - z0x, z1y - z0y); ctx.setLineDash([]);
      k.label('pour here', (z0x + z1x) / 2, z0y - 6, {align: 'center', color: B.orange});
      k.label('Cup', bx, ay + 24, {align: 'center', color: B.orange});
    } else {
      const [w0] = XY(f, WIPE.u0, 0), [w1] = XY(f, WIPE.u1, 0), bw = (w1 - w0) / WIPE.n;
      for (let i = 0; i < WIPE.n; i++) { ctx.fillStyle = ev.bins.has(i) ? B.orange : 'rgba(142,129,119,.28)'; ctx.fillRect(w0 + i * bw + 1, ay + 3, bw - 2, 4); }
      ctx.fillStyle = B.orange; ctx.fillRect(w0 - 1, ay - 8, 2, 10); ctx.fillRect(w1 - 1, ay - 8, 2, 10);
      k.label(`wiped ${ev.bins.size}/${WIPE.n}`, (w0 + w1) / 2, ay + 24, {align: 'center', color: B.orange});
    }
  }
  function drawObj(f, o, held, pouring, t) {
    const [x, y] = XY(f, o.u, o.v), s = CUBE * 2 * f.s;
    ctx.fillStyle = held ? B.orange : B.cool3;
    if (tid === 'place') { ctx.beginPath(); ctx.roundRect(x - s / 2, y - s / 2, s, s, 4); ctx.fill(); }
    else if (tid === 'tea') {
      ctx.beginPath(); ctx.ellipse(x, y - s * .1, s * .6, s * .5, 0, 0, 7); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = ctx.fillStyle; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + s * .5, y - s * .1); ctx.lineTo(x + s * .95, y - s * .45); ctx.stroke();
      if (pouring) { ctx.strokeStyle = '#B5651D'; ctx.lineWidth = 3; ctx.setLineDash([2, 5]); ctx.lineDashOffset = -t * 40; ctx.beginPath(); ctx.moveTo(x + s * .95, y - s * .4); ctx.lineTo(x + s * .95, XY(f, 0, .8)[1]); ctx.stroke(); ctx.setLineDash([]); }
    } else { ctx.beginPath(); ctx.roundRect(x - s * .8, y - s * .25, s * 1.6, s * .5, 3); ctx.fill(); }
  }
  const pouring = (o, held) => tid === 'tea' && held && o.u > CUP.u0 && o.u < CUP.u1 && o.v > CUP.v0 && o.v < CUP.v1;
  function pathLine(f, pts, color, w, dash, filter) {
    ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash || []); ctx.lineJoin = ctx.lineCap = 'round'; ctx.beginPath(); let pen = false;
    pts.forEach((q, i) => { if (filter && !filter(i)) { pen = false; return; } const [x, y] = XY(f, q.u, q.v); if (pen) ctx.lineTo(x, y); else ctx.moveTo(x, y); pen = true; });
    ctx.stroke(); ctx.setLineDash([]);
  }

  function draw(t) {
    k.clear(B.warm1);
    k.text(`Goal: ${T().goal}, then let 2 robot bodies repeat it.`, 16, 26, {size: 14, weight: 600});
    const {L, R} = panes(), fL = fit(L), fR = fit(R), body = BODIES[bodyI], P = proj();

    // ---- human pane
    scene(L, fL, 'Human video · you', rec ? '● REC ' + recT.toFixed(1) + ' s' : 'motion only · no forces', hev, t);
    ctx.save(); ctx.beginPath(); ctx.roundRect(L.x, L.y, L.w, L.h, 14); ctx.clip();
    if (demo.length > 1) { pathLine(fL, demo, B.cool1, 2); pathLine(fL, demo, B.orange, 4, null, i => demo[i].grip); }
    const hx = rec || hand.in ? hand.u : .5, hy = rec || hand.in ? hand.v : .5;
    const h = humanAngles(hx, hy), sh = XY(fL, ...HUMAN.sh), el = XY(fL, ...h.el), wr = XY(fL, hx, hy);
    ctx.strokeStyle = 'rgba(193,188,179,.55)'; ctx.lineCap = 'round'; ctx.lineWidth = 16; ctx.beginPath(); ctx.moveTo(...sh); ctx.lineTo(...el); ctx.lineTo(...wr); ctx.stroke();
    drawObj(fL, hobj, hand.grip, pouring(hobj, hand.grip), t);
    drawHand(wr[0], wr[1], hand.grip);
    if (rec && tid !== 'place') k.meter(L.x + 14, L.y + 44, 120, evPct(tid, hev), tid === 'tea' ? 'pouring' : 'wiped');
    if (humanOk !== null && !rec) k.text(humanOk ? 'Demo: task done ✓' : 'Demo: task not done', L.x + 14, L.y + 42, {size: 12, color: humanOk ? B.orange : B.cool2, weight: 600});
    ctx.restore();

    // ---- robot pane
    scene(R, fR, `Robot · ${body.name}`, 'simulated', rep ? rev : result ? rev : newEv(), t);
    ctx.save(); ctx.beginPath(); ctx.roundRect(R.x, R.y, R.w, R.h, 14); ctx.clip();
    const [bx, by] = XY(fR, ...body.base), rMax = body.lens.reduce((s, l) => s + l, 0) * fR.s;
    ctx.fillStyle = 'rgba(255,126,0,.05)'; ctx.strokeStyle = B.warm3; ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(bx, by, rMax, body.aMin, body.aMax); ctx.arc(bx, by, body.rMin * fR.s, body.aMax, body.aMin, true); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    k.label('reachable workspace', bx, by + (body.side < 0 ? -rMax - 6 : rMax + 14), {align: 'center', color: B.warm4});
    if (demo.length > 1) {
      if (retarget) {
        pathLine(fR, demo, B.cool1, 1.5, [3, 4], i => !P.pts[i].ok);
        ctx.strokeStyle = 'rgba(255,126,0,.35)'; ctx.lineWidth = 1; ctx.beginPath();
        demo.forEach((s, i) => { if (i % 5 || P.pts[i].ok) return; ctx.moveTo(...XY(fR, s.u, s.v)); ctx.lineTo(...XY(fR, P.pts[i].u, P.pts[i].v)); }); ctx.stroke();
        pathLine(fR, P.pts, B.ink, 2, null, i => P.pts[i].ok);
        pathLine(fR, P.pts, B.orange, 3.5, null, i => !P.pts[i].ok);
      } else pathLine(fR, demo, B.cool1, 1.5, [3, 4]);
    }
    if (body.tool === 'foot') { ctx.fillStyle = B.cool4; ctx.beginPath(); ctx.roundRect(bx - fR.s * .34, by - fR.s * .11, fR.s * .42, fR.s * .1, 10); ctx.fill(); k.label('body', bx - fR.s * .3, by - fR.s * .045, {color: B.cool1}); }
    else { ctx.fillStyle = B.black; ctx.beginPath(); ctx.roundRect(bx - 22, by - 8, 44, 12, 5); ctx.fill(); }
    const J = robot.J;
    ctx.lineCap = 'round';
    for (let i = 0; i < J.length - 1; i++) { ctx.strokeStyle = i % 2 ? B.cool3 : B.black; ctx.lineWidth = 13 - i * 2.5; ctx.beginPath(); ctx.moveTo(...XY(fR, ...J[i])); ctx.lineTo(...XY(fR, ...J[i + 1])); ctx.stroke(); }
    for (let i = 0; i < J.length - 1; i++) { ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(...XY(fR, ...J[i]), 5, 0, 7); ctx.fill(); }
    const tip = XY(fR, ...J[J.length - 1]), pre = XY(fR, ...J[J.length - 2]), ang = Math.atan2(tip[1] - pre[1], tip[0] - pre[0]);
    ctx.save(); ctx.translate(...tip); ctx.rotate(ang);
    if (body.tool === 'foot') { ctx.fillStyle = B.black; ctx.beginPath(); ctx.ellipse(2, 0, 9, 7, 0, 0, 7); ctx.fill(); }
    else { const g = robot.held ? 5 : 10; ctx.strokeStyle = B.black; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -g); ctx.lineTo(10, -g); ctx.moveTo(0, g); ctx.lineTo(10, g); ctx.moveTo(0, -g); ctx.lineTo(0, g); ctx.stroke(); }
    ctx.restore();
    drawObj(fR, robot.obj, robot.held, pouring(robot.obj, robot.held), t);
    if (retarget && demo.length > 1) k.text(`Embodiment gap: ${Math.round(P.gap * 100)}% of the demo is out of reach → mapped to the edge`, R.x + 14, R.y + 42, {size: 12, color: P.gap > 0 ? B.orange : B.cool2});
    if (!retarget) k.text('Mapping OFF · copying human joint angles', R.x + 14, R.y + 42, {size: 12, color: B.cool2});
    if (T().armsOnly && body.tool === 'foot') k.text(`No gripper: a foot can’t hold a ${T().obj}`, R.x + 14, R.y + 60, {size: 12, color: B.black, weight: 600});
    if (result && resultT < 3) { ctx.globalAlpha = clamp(3 - resultT, 0, 1); k.text(result.ok ? 'Repeated ✓' : 'Missed', R.x + R.w / 2, R.y + R.h * .22, {align: 'center', size: 28, weight: 700, color: result.ok ? B.orange : B.cool2}); ctx.globalAlpha = 1; }
    if (flash) { ctx.fillStyle = `rgba(255,126,0,${flash * .12})`; ctx.fillRect(R.x, R.y, R.w, R.h); }
    if (completed) { const w = 230; ctx.fillStyle = B.orange; ctx.beginPath(); ctx.roundRect(R.x + 14, R.y + 72, w, 28, 14); ctx.fill(); k.text('✓ Learned by watching · 2 bodies', R.x + 14 + w / 2, R.y + 91, {align: 'center', size: 12, weight: 700, color: B.black}); }
    ctx.restore();

    // ---- bottom strip (left of the video corner): timeline + log | data + scoreboard
    const y0 = k.h - 222, sw = Math.max(420, k.w - 356 - 16), tw = Math.max(200, sw * .52), mx = 16 + tw + 24, mw = Math.max(170, sw - tw - 24);
    const dur = demo.length ? demo[demo.length - 1].t : 0, span = Math.max(4, Math.ceil(dur));
    k.label(`Demo timeline · ${dur.toFixed(1)} s`, 16, y0);
    ctx.fillStyle = B.warm2; ctx.beginPath(); ctx.roundRect(16, y0 + 8, tw, 22, 6); ctx.fill();
    const X = s => 16 + s / span * tw;
    demo.forEach((s, i) => { if (!i) return; const x0 = X(demo[i - 1].t), x1 = X(s.t) + .6;
      if (s.grip) { ctx.fillStyle = B.orange; ctx.fillRect(x0, y0 + 10, x1 - x0, 11); }
      if (retarget && P.pts[i] && !P.pts[i].ok) { ctx.fillStyle = B.cool2; ctx.fillRect(x0, y0 + 23, x1 - x0, 5); } });
    for (let s = 1; s < span; s++) { ctx.fillStyle = 'rgba(18,18,18,.15)'; ctx.fillRect(X(s), y0 + 8, 1, 22); }
    const head = rec ? recT : rep ? Math.min(rep.t, dur) : -1;
    if (head >= 0) { ctx.fillStyle = B.black; ctx.fillRect(X(head) - 1, y0 + 4, 2, 30); }
    k.label('holding', 16, y0 + 44, {color: B.orange}); k.label('out of reach', 86, y0 + 44);
    drawLog(k, log.slice(-5), 16, y0 + 66, tw, 8);

    k.label('Robot data needed (post)', mx, y0); k.text('< 1 hr', mx, y0 + 26, {size: 20, weight: 700});
    k.label('Your demos · saved', mx + mw * .55, y0); k.text(String(nDemos), mx + mw * .55, y0 + 26, {size: 20, weight: 700, color: nDemos ? B.orange : B.cool1});
    k.label('Repeated · task × body', mx, y0 + 52);
    const cs = Math.min(22, (mw - 70) / BODIES.length - 4);
    BODIES.forEach((b2, j) => k.text(b2.id === 'leg' ? 'leg' : b2.id, mx + 60 + j * (cs + 4) + cs / 2, y0 + 70, {size: 9, mono: true, color: j === bodyI ? B.black : B.cool2, align: 'center'}));
    TIDS.forEach((id, i) => {
      const y = y0 + 76 + i * (cs + 4);
      k.text(TASKS[id].short, mx, y + cs * .7, {size: 11, color: id === tid ? B.black : B.cool2, weight: id === tid ? 600 : 400});
      BODIES.forEach((b2, j) => {
        const on = wins.has(id + '/' + b2.id), na = TASKS[id].armsOnly && b2.tool === 'foot', x = mx + 60 + j * (cs + 4);
        ctx.fillStyle = on ? B.orange : na ? B.warm1 : B.warm2; ctx.beginPath(); ctx.roundRect(x, y, cs, cs, 5); ctx.fill();
        if (na) { ctx.strokeStyle = B.warm3; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + 4, y + cs - 4); ctx.lineTo(x + cs - 4, y + 4); ctx.stroke(); }
        if (id === tid && j === bodyI) { ctx.strokeStyle = B.black; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(x, y, cs, cs, 5); ctx.stroke(); }
      });
    });
    const sy = y0 + 84 + 3 * (cs + 4);
    k.text(`Score ${wins.size}/8 · best streak ${bestStreak}${fastest[tid] ? ` · fastest ${T().short.toLowerCase()} demo ${fastest[tid].toFixed(1)} s` : ''}`, mx, sy, {size: 11, mono: true, color: B.cool2});
  }

  const taskBtns = TIDS.map((id, i) => { const b = k.button(`${i + 1} · ${TASKS[id].short}`, () => pickTask(id)); b.dataset.id = id; b.classList.toggle('on', id === tid); return b; });
  k.button('▶ Robot: repeat', play, {primary: true});
  const bodyBtn = k.button('Body: ' + BODIES[0].name, () => {
    bodyI = (bodyI + 1) % BODIES.length; const b2 = BODIES[bodyI];
    bodyBtn.textContent = 'Body: ' + b2.name; rep = null; robot.held = false; robot.J = initPose(b2); robot.tgt = [...b2.rest];
    resetObj(robot.obj); result = null; rev = newEv();
    say(`Body swapped: ${b2.name}. Same demo, press Repeat.`);
  });
  k.toggle('Map to body (IK)', true, v => { retarget = v; say(v ? 'Mapping ON: fit the hand path into this body’s workspace.' : 'Mapping OFF: copy the human arm’s joint angles 1:1.'); });
  k.button('■ Stop', () => { if (rec) stopRec(); else if (rep) { rep = null; robot.held = false; say('Stopped.'); } });
  k.onKey(e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; const i = '123'.indexOf(e.key); if (i >= 0) pickTask(TIDS[i]); });
  api.status('Ready');
  return () => k.destroy();
}
