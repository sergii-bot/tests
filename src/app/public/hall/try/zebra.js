// TRY · Zebra (ex-Fetch Robotics) — "Run the warehouse": dispatch the AMR fleet to pick orders, end to end, in a 3D warehouse:
// tall pallet-rack aisles, Fetch-style low AMRs carrying totes along neon path lines on the floor, and two packing
// stations where a real UR5e (MuJoCo Menagerie model, analytic UR inverse kinematics) moves items tote → box. That step
// is the one the post calls human-bottlenecked; it is done by a human picker, by robots + workers side by side
// (Symmetry-style orchestration), or by the Skild Brain.
// Stylized game, not a model of the real system; all times and rates are simulated.
import {kit, B, lerp, clamp, rand} from './kit.js';
import * as MJ from '../mj.js';
import {THREE, stage, lights, std, box as mbox, cyl, boxes, amr, carton, worker, urSolve, setUR, styleUR, follower, UR_READY, canvasTex} from '../props/ind-props.js';

const COLS = 22, ROWS = 11, SHIFT = 180, SPEED = 4.2, PICK_T = .5, BRAIN_T = .8, HUMAN_T = 2.6, WALK = 2;
const PAIRS = [1, 4, 7, 10, 13];                       // shelf pairs (back-to-back racks), aisles between
const shelfAt = (c, r) => r % 5 !== 0 && PAIRS.some(p => c === p || c === p + 1);
const blocked = (c, r) => c < 0 || r < 0 || c >= COLS || r >= ROWS || shelfAt(c, r) || (c === 20 && (r === 2 || r === 7)) || (c === 21 && r >= 1 && r <= 8);
const ITEMS = ['Scanner', 'Label roll', 'Cable kit', 'Headset', 'Battery', 'Charger', 'Ribbon', 'RFID tags', 'Tablet', 'Printhead', 'Holster'];
const ICOL = ['#e0b64a', '#d9d9d6', '#4a90d9', '#c0563a', '#5aa469', '#8e6bbf', '#e07a1f', '#3a3f46', '#d85c8a', '#2fb5b0', '#b8733a'];
const DOCK = [[16, 10], [17, 10], [18, 10], [19, 10], [20, 10], [15, 10]];
const SLOTS = [[[19, 2], [18, 2], [17, 2], [16, 2], [16, 1], [16, 0], [17, 0], [18, 0], [19, 0], [20, 0]],
  [[19, 7], [18, 7], [17, 7], [16, 7], [16, 6], [16, 5], [17, 5], [18, 5], [19, 5], [20, 5]]];
const MODE = {classic: 'Human picker', hybrid: 'Robots + workers', brain: 'Skild Brain'};
const DEMAND = {normal: {name: 'Normal day', gap: [5.8, 3.8]}, peak: {name: 'Peak season', gap: [4.4, 2.8]}};
const man = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
const ease = v => v < .5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function astar(a, b) {
  const key = p => p[1] * COLS + p[0], h = p => man(p, b);
  const g = new Map([[key(a), 0]]), f = new Map([[key(a), h(a)]]), from = new Map(), open = [a];
  while (open.length) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (f.get(key(open[i])) < f.get(key(open[bi]))) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur[0] === b[0] && cur[1] === b[1]) { const path = [cur]; let kk = key(cur); while (from.has(kk)) { const p = from.get(kk); path.unshift(p); kk = key(p); } return path; }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = [cur[0] + dx, cur[1] + dy]; if (blocked(...n)) continue;
      const kn = key(n), ng = g.get(key(cur)) + 1;
      if (ng < (g.get(kn) ?? Infinity)) { g.set(kn, ng); f.set(kn, ng + h(n)); from.set(kn, cur); if (!open.some(o => o[0] === n[0] && o[1] === n[1])) open.push(n); }
    }
  }
  return [b];
}

// ---------- 3D world: 1 grid cell = CELL metres; x = column, z = row (north = −z, the camera looks from the south)
const CELL = .9, RH = 2.4, LEVELS = [.16, .96, 1.76], BASE_Y = .8, TOOL = .16;
const WX = c => (c - (COLS - 1) / 2) * CELL, WZ = r => (r - (ROWS - 1) / 2) * CELL;
const CX = WX(21) - .2;                                   // conveyor centre line (a little west of cell 21, within reach of the arms)
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export default function mount(root, api) {
  const k = kit(root);
  const {ctx} = k;
  const clip = m => api.clip?.(m), record = (kind, d) => api.record?.(kind, d);
  const RIGHT = 340, TOP = 80, BOT = 70, VID = 240;          // right panel is as wide as the video corner; nothing critical below k.h - VID
  let mode = 'classic', endMode = 'classic', demand = 'normal', phase = 'ready', simT = 0, nextAt = 0, seq = 1041, fleetN = 5, doneOnce = false, dead = false;
  let streak = 0, bestStreak = 0, switches = 0, pops = [];
  let robots = [], orders = [], boxes3 = [], log = ['Pick a mode, then Start shift.'], cards = [];
  let selOrder = null, selRobot = null, drag = null, hover = {robot: null, card: null}, overlay = 1, modeFlash = 0, orbitDrag = null, userZoom = false;
  let stats = {onTime: 0, late: 0, shipped: 0, maxQ: 0};
  const best = {};                                           // best result per mode · demand
  const stations = [0, 1].map(i => ({i, r: i ? 7 : 2, line: [], item: null, p: 0, fill: 0}));
  const human = {at: 0, to: 0, walk: 0};
  const say = s => { log.push(s); if (log.length > 30) log.shift(); };
  const isHuman = st => mode === 'classic' || (mode === 'hybrid' && st.i === 1);

  function buildFleet() {
    robots = Array.from({length: fleetN}, (_, id) => ({id, x: DOCK[id][0], y: DOCK[id][1], head: -Math.PI / 2, goalHead: -Math.PI / 2, path: [], state: 'idle', order: null, plan: [], tote: [], t: 0, shake: 0, ping: 0, st: null, wait: 0}));
  }
  buildFleet();
  const slot = (st, i) => SLOTS[st.i][Math.min(i, SLOTS[st.i].length - 1)];
  function go(r, cell, state) { r.path = astar([Math.round(r.x), Math.round(r.y)], cell); r.state = state; }
  const waitingCount = () => stations.reduce((n, s) => n + Math.max(0, s.line.filter(r => r.state === 'line').length - (s.item ? 1 : 0)), 0);
  const lateNow = () => stats.late + orders.filter(o => o.state !== 'shipped' && o.late).length;
  const pct = () => { const d = stats.onTime + lateNow(); return d ? stats.onTime / d : null; };

  function start() {
    phase = 'running'; simT = 0; nextAt = .6; seq = 1041; orders = []; boxes3 = []; selOrder = selRobot = null; drag = null;
    stats = {onTime: 0, late: 0, shipped: 0, maxQ: 0}; streak = 0; bestStreak = 0; switches = 0; pops = [];
    stations.forEach(s => Object.assign(s, {line: [], item: null, p: 0, fill: 0})); Object.assign(human, {at: mode === 'hybrid' ? 1 : 0, to: mode === 'hybrid' ? 1 : 0, walk: 0});
    buildFleet(); log = []; say(`Shift started · ${MODE[mode]} · ${DEMAND[demand].name}`); bStart.textContent = 'Restart shift'; api.status(`Shift running · ${MODE[mode]}`);
    clip('Zebra');
  }
  function setMode(m) {
    if (m === mode) return; mode = m; modeFlash = 1; if (phase === 'running') switches++;
    modeBtns.forEach(b => b.classList.toggle('on', b.dataset.m === m));
    if (m === 'hybrid') { human.walk = 0; human.at = human.to = 1; }
    say(m === 'brain' ? 'Skild Brain runs both stations' : m === 'hybrid' ? 'Station A: Skild Brain · station B: a worker' : 'Both stations handed back to a human picker');
    clip('Zebra');
    if (phase === 'running') api.status(`Shift running · ${MODE[mode]}`);
  }
  function spawn() {
    const n = Math.random() < .35 ? 1 : Math.random() < .7 ? 2 : 3, used = new Set(), items = [];
    while (items.length < n) {
      const pi = Math.floor(rand(0, PAIRS.length)), p = PAIRS[pi], c = p + (Math.random() < .5 ? 0 : 1), r = [1, 2, 3, 4, 6, 7, 8, 9][Math.floor(rand(0, 8))];
      if (used.has(c + ',' + r)) continue; used.add(c + ',' + r);
      const ni = Math.floor(rand(0, ITEMS.length));
      items.push({name: ITEMS[ni], col: ICOL[ni], shelf: [c, r], face: [c === p ? c - 1 : c + 1, r], addr: 'ABCDE'[pi] + '-' + String(r).padStart(2, '0'), picked: false});
    }
    orders.push({id: seq++, items, created: simT, due: simT + 22 + 5 * n, state: 'new', robot: null, late: false, cy: null, a: 0});
  }
  function assign(o, r) {
    if (phase !== 'running' || !o || o.state !== 'new' || !r) return;
    if (r.order) { r.shake = 1; say(`AMR ${r.id + 1} is busy · pick an idle one`); return; }
    o.state = 'assigned'; o.robot = r.id; r.order = o; r.tote = []; r.ping = 1;
    const left = o.items.slice(); r.plan = []; let at = [Math.round(r.x), Math.round(r.y)];
    while (left.length) { left.sort((a, b) => man(a.face, at) - man(b.face, at)); const it = left.shift(); r.plan.push(it); at = it.face; }
    go(r, r.plan[0].face, 'pick'); selOrder = selRobot = null;
    say(`#${o.id} → AMR ${r.id + 1} · ${o.items.length} pick${o.items.length > 1 ? 's' : ''} (${o.items.map(i => i.addr).join(', ')})`);
  }
  function toStation(r) {
    const cost = s => s.line.length + man([19, s.r], [r.x, r.y]) / 12;
    const st = cost(stations[0]) <= cost(stations[1]) ? stations[0] : stations[1];
    st.line.push(r); r.st = st; r.wait = 0; go(r, slot(st, st.line.length - 1), 'toStation');
  }
  function finish(st, f) {
    const o = f.order, ok = simT <= o.due; o.state = 'shipped'; o.shippedAt = simT; o.ok = ok;
    stats.shipped++; ok ? stats.onTime++ : stats.late++;
    streak = ok ? streak + 1 : 0; bestStreak = Math.max(bestStreak, streak);
    pops.push({r: st.r, t: 0, txt: ok ? (streak > 2 ? `on time · streak ${streak}` : 'on time') : 'late', ok});
    say(`#${o.id} packed & shipped${ok ? ' · on time' : ' · late'}`); boxes3.push({y: st.r, n: st.fill}); st.fill = 0;
    f.order = null; f.st = null; st.line.shift(); go(f, DOCK[f.id], 'return');
    st.line.forEach((r, i) => go(r, slot(st, i), 'toStation'));
  }
  function drive(r, dt) {
    let step = SPEED * dt;
    while (step > 1e-6 && r.path.length) {
      const [tc, tr] = r.path[0], dx = tc - r.x, dy = tr - r.y, d = Math.hypot(dx, dy);
      if (d < 1e-4) { r.path.shift(); continue; }
      r.goalHead = Math.atan2(dy, dx);
      const m = Math.min(d, step); r.x += dx / d * m; r.y += dy / d * m; step -= m; if (m >= d) r.path.shift();
    }
    const dh = Math.atan2(Math.sin(r.goalHead - r.head), Math.cos(r.goalHead - r.head)); r.head += dh * Math.min(1, dt * 12);
    return !r.path.length;
  }
  function updRobot(r, dt) {
    const arrived = drive(r, dt);
    r.shake = Math.max(0, r.shake - dt * 3); r.ping = Math.max(0, r.ping - dt * 1.6);
    if (r.state === 'pick' && arrived) { r.state = 'picking'; r.t = 0; }
    else if (r.state === 'picking') { r.t += dt; if (r.t >= PICK_T) { const it = r.plan.shift(); it.picked = true; r.tote.push(it); if (r.plan.length) go(r, r.plan[0].face, 'pick'); else toStation(r); } }
    else if (r.state === 'toStation' && arrived) r.state = 'line';
    else if (r.state === 'return' && arrived) r.state = 'idle';
    if (r.state === 'line' && r.st && r.st.line[0] !== r) r.wait += dt;
  }
  const rdy = s => s.line[0] && s.line[0].state === 'line';
  function updStations(dt) {
    for (const st of stations) {
      if (!rdy(st)) continue;
      if (isHuman(st) && (human.walk > 0 || human.at !== st.i)) continue;
      const f = st.line[0];
      if (!st.item) { st.item = f.tote[0]; st.p = 0; }
      st.p += dt / (isHuman(st) ? HUMAN_T : BRAIN_T);
      if (st.p >= 1) { f.tote.shift(); st.item = null; st.p = 0; st.fill++; if (!f.tote.length) finish(st, f); }
    }
    if (mode === 'classic') {
      if (human.walk > 0) { human.walk -= dt; if (human.walk <= 0) { human.walk = 0; human.at = human.to; } }
      else if (!rdy(stations[human.at]) && rdy(stations[1 - human.at])) { human.to = 1 - human.at; human.walk = WALK; }
    }
  }
  function endShift() {
    phase = 'done'; simT = SHIFT; overlay = 0; endMode = mode;
    const p = pct() ?? 0, opm = stats.shipped / (SHIFT / 60);
    const key = mode + '·' + demand, prev = best[key], rec = {p, opm, shipped: stats.shipped, maxQ: stats.maxQ, streak: bestStreak};
    if (!prev || p > prev.p || (p === prev.p && stats.shipped > prev.shipped)) best[key] = rec;
    record('zebra_shift', {mode, demand, fleet: fleetN, shipped: stats.shipped, on_time: stats.onTime, late: lateNow(), on_time_pct: Math.round(p * 100), orders_per_min: +opm.toFixed(2), peak_queue: stats.maxQ, best_streak: bestStreak, mode_switches: switches});
    bStart.textContent = 'Start new shift';
    const win = mode === 'brain' && p >= .9 && stats.shipped >= 10;
    if (win) { say(`Shift done · ${Math.round(p * 100)}% on time. No station bottleneck.`); if (!doneOnce) { doneOnce = true; api.complete(`Warehouse run · ${Math.round(p * 100)}% on time`); } else api.status('Shift complete'); }
    else { say(mode === 'classic' ? `Shift done · the picker was the bottleneck (queue peaked at ${stats.maxQ})` : mode === 'hybrid' ? `Shift done · ${Math.round(p * 100)}% on time. Station B still waits on a person.` : `Shift done · ${Math.round(p * 100)}% on time. Dispatch faster: goal is 90%.`); api.status('Shift over · try again'); }
  }

  // =====================================================================================================
  // 3D scene
  const S = stage(k, {bg: '#3a3e44', fov: 38, near: .1, far: 200});
  const {scene} = S;
  const L = lights(scene, {hemi: ['#f3f5f8', '#4a4640', 1.05], sun: ['#ffffff', 1.55], at: [7, 16, 9], box: 15, size: 2048});
  L.sun.shadow.camera.far = 60; L.sun.target.position.set(0, 0, 0);
  Object.assign(S.orbit, {target: V3(0, .5, 0), yaw: 0, pitch: 1.0, dist: 22, minD: 5, maxD: 45, minP: .25, maxP: 1.5});
  const z0 = S.zoom; S.zoom = dy => { userZoom = true; z0(dy); };
  const world = new THREE.Group(); scene.add(world);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // floor, walls, neon guide lines
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(70, 50), std('#797d82', {r: .85})); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
  const grid = new THREE.GridHelper(50, 50, '#63676c', '#63676c'); grid.material.transparent = true; grid.material.opacity = .28; grid.position.y = .002; world.add(grid);
  const wall = std('#a9aeb3', {r: .9}); mbox(46, 5.5, .3, wall, 0, 2.75, WZ(-1) - 3.4, world); mbox(46, 1.2, .32, std('#30353b', {r: .8}), 0, .6, WZ(-1) - 3.38, world);
  for (let i = -4; i <= 4; i++) mbox(3.2, 3.4, .06, std('#c6cacd', {r: .5, m: .3}), i * 5, 1.9, WZ(-1) - 3.2, world, false);
  const neonC = new THREE.MeshBasicMaterial({color: '#28d4ff', transparent: true, opacity: .42, depthWrite: false});
  const nl = [];
  for (const c of [0, 3, 6, 9, 12, 15, 17, 19]) nl.push([WX(c), .006, WZ(5), .05, .006, ROWS * CELL]);
  for (const r of [0, 5, 10]) nl.push([WX(9.5), .006, WZ(r), (COLS - 3) * CELL, .006, .05]);
  boxes(nl, neonC, world, {shadow: false});
  const yel = std('#e3b616', {r: .7}), yl = [];
  for (const [x0, x1, r] of [[18.4, 21.6, 2], [18.4, 21.6, 7]]) { const a = WX(x0), b = WX(x1), za = WZ(r) - .75, zb = WZ(r) + .75; yl.push([(a + b) / 2, .005, za, b - a, .006, .06], [(a + b) / 2, .005, zb, b - a, .006, .06], [a, .005, (za + zb) / 2, .06, .006, zb - za], [b, .005, (za + zb) / 2, .06, .006, zb - za]); }
  for (const [c, r] of DOCK) { const x = WX(c), z = WZ(r), h = .4; yl.push([x, .005, z - h, h * 2, .006, .05], [x, .005, z + h, h * 2, .006, .05], [x - h, .005, z, .05, .006, h * 2], [x + h, .005, z, .05, .006, h * 2]); }
  boxes(yl, yel, world, {shadow: false});

  // pallet racks: blue uprights, orange beams, pallets with cartons on three levels
  const up = [], beam = [], deck = [], cart = [], rackLab = [];
  const CCOL = ['#b58a55', '#a67c4a', '#c39a66', '#d9d3c4', '#8f96a0', '#3f6fa8', '#b58a55', '#c39a66'];
  for (const [pi, p] of PAIRS.entries()) for (const r0 of [1, 6]) {
    const x0 = WX(p) - CELL / 2, x1 = WX(p + 1) + CELL / 2, xm = (x0 + x1) / 2, za = WZ(r0) - CELL / 2, zb = WZ(r0 + 3) + CELL / 2, len = zb - za;
    for (const x of [x0 + .04, xm, x1 - .04]) for (let j = 0; j <= 4; j++) up.push([x, RH / 2, za + j * CELL + (j === 0 ? .04 : j === 4 ? -.04 : 0), .07, RH, .07]);
    for (const y of LEVELS) for (const x of [x0 + .04, x1 - .04, xm]) beam.push([x, y, (za + zb) / 2, .05, .1, len]);
    for (const x of [x0 + .04, x1 - .04]) beam.push([x, RH, (za + zb) / 2, .05, .07, len]);
    for (let c = 0; c < 2; c++) for (let r = 0; r < 4; r++) for (const y of LEVELS) {
      const cx = WX(p + c), cz = WZ(r0 + r);
      deck.push([cx, y + .11, cz, CELL - .1, .12, CELL - .16]);
      if (rnd() < .12) continue;
      for (const [ox, oz] of [[-.2, -.2], [.2, -.2], [-.2, .2], [.2, .2]]) { if (rnd() < .18) continue; const h = .26 + rnd() * .3; cart.push([cx + ox + (rnd() - .5) * .03, y + .17 + h / 2, cz + oz, .36, h, .36, (rnd() - .5) * .1, CCOL[Math.floor(rnd() * CCOL.length)]]); }
    }
    rackLab.push({x: (x0 + x1) / 2, z: (za + zb) / 2, txt: 'ABCDE'[pi] + (r0 === 1 ? '·N' : '·S')});
  }
  boxes(up, std('#1f56a8', {r: .5, m: .3}), world); boxes(beam, std('#e8731a', {r: .45, m: .2}), world);
  boxes(deck, std('#a97b4a', {r: .85}), world); boxes(cart, std('#ffffff', {r: .8}), world);

  // conveyor: belt scrolls toward the ship end; cartons ride it
  const cLen = 8.9 * CELL, cMid = WZ((.8 + 9.7) / 2);
  mbox(.66, .5, cLen, std('#2b2f35', {r: .6, m: .3}), CX, .27, WZ(5.25 - .0), world);
  const beltTex = canvasTex(64, 64, (c, w, h) => { c.fillStyle = '#26292e'; c.fillRect(0, 0, w, h); c.strokeStyle = '#4b5158'; c.lineWidth = 5; c.beginPath(); c.moveTo(6, 8); c.lineTo(32, 30); c.lineTo(58, 8); c.stroke(); });
  beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping; beltTex.repeat.set(1, cLen / .45);
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(.52, cLen), new THREE.MeshStandardMaterial({map: beltTex, roughness: .8})); belt.rotation.x = -Math.PI / 2; belt.position.set(CX, .525, WZ(5.25)); belt.receiveShadow = true; world.add(belt);
  void cMid;
  for (const s of [-1, 1]) mbox(.05, .07, cLen, std('#9aa1a8', {r: .35, m: .7}), CX + s * .3, .56, WZ(5.25), world);
  const shipSign = mbox(.9, .1, .1, std('#ff7e00', {e: '#ff7e00', ei: .6}), CX, .8, WZ(9.8), world, false); shipSign.visible = true;
  // stations: pedestal + bench plate; UR5e (brain) or a human worker
  const ped = stations.map(st => { const g = new THREE.Group(); g.position.set(WX(20), 0, WZ(st.r)); world.add(g);
    mbox(.42, BASE_Y - .04, .42, std('#34383d', {r: .6, m: .3}), 0, (BASE_Y - .04) / 2, 0, g); mbox(.6, .04, .6, std('#8f969d', {r: .4, m: .6}), 0, BASE_Y - .02, 0, g);
    const bench = new THREE.Group(); g.add(bench); mbox(.5, .012, .5, std('#d8dbdd', {r: .5}), 0, BASE_Y + .006, 0, bench); mbox(.14, .1, .08, std('#15171a', {r: .5}), .15, BASE_Y + .06, -.15, bench);
    mbox(.03, .2, .03, std('#15171a', {r: .5}), .15, BASE_Y + .1, -.15, bench);
    return {g, bench}; });
  // suction end-effector
  function suction() {
    const g = new THREE.Group(), blk = std('#17191c', {r: .5}), alu = std('#b8bec4', {r: .3, m: .75});
    const z = (m, zz) => { m.rotation.x = Math.PI / 2; m.position.z = zz; g.add(m); };
    z(cyl(.034, .034, .012, alu), .006); z(cyl(.022, .022, .07, blk), .047); z(cyl(.014, .03, .04, blk), .102); z(cyl(.03, .03, .012, std('#2a2d31', {r: .9})), .128);
    return g;
  }
  const urs = [null, null], urQ = [UR_READY.slice(), UR_READY.slice()], urF = [null, null], tools = [suction(), suction()];
  const dbg = root.__dbg = {urErr: 0, urMax: 0, urN: 0};
  Promise.all([0, 1].map(() => MJ.spawn('ur5e'))).then(bots => {
    if (dead) { bots.forEach(b => b.dispose()); return; }
    bots.forEach((b, i) => { styleUR(b); urs[i] = b; b.group.position.set(WX(20), BASE_Y, WZ(stations[i].r)); world.add(b.group); urF[i] = follower(b, {site: 'attachment_site'}); urF[i].add(tools[i]); setUR(b, urQ[i]); urF[i].sync(); });
  }).catch(e => console.warn('ur5e', e));

  // AMRs (Fetch-style low bases with totes), floor rings, neon path ribbons
  const dashTex = canvasTex(64, 16, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(.5, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 40, h); });
  dashTex.wrapS = THREE.RepeatWrapping;
  const MAXR = 6, MAXSEG = 72;
  const bots = Array.from({length: MAXR}, () => {
    const a = amr(); world.add(a.group); a.group.visible = false;
    const ringG = new THREE.RingGeometry(.46, .53, 48); ringG.rotateX(-Math.PI / 2);
    const sel = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({color: '#ff7e00', transparent: true, opacity: 0, depthWrite: false})), ping = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({color: '#ff7e00', transparent: true, opacity: 0, depthWrite: false}));
    sel.position.y = ping.position.y = .03; world.add(sel, ping);
    const pos = new Float32Array(MAXSEG * 12), uv = new Float32Array(MAXSEG * 8), idx = [];
    for (let i = 0; i < MAXSEG; i++) { const b = i * 4; idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({map: dashTex, color: '#28d4ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide});
    const rib = new THREE.Mesh(geo, mat); rib.frustumCulled = false; rib.renderOrder = 3; world.add(rib);
    return {a, sel, ping, rib, pos, uv, geo, mat};
  });
  function ribbon(b, pts) {
    let n = 0, u = 0; const w = .055, y = .028;
    for (let i = 0; i + 1 < pts.length && n < MAXSEG; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz); if (d < 1e-4) continue;
      const px = -dz / d * w, pz = dx / d * w, o = n * 12, q = n * 8, u1 = u + d / .36;
      b.pos.set([ax + px, y, az + pz, ax - px, y, az - pz, bx + px, y, bz + pz, bx - px, y, bz - pz], o); b.uv.set([u, 0, u, 1, u1, 0, u1, 1], q); u = u1; n++;
    }
    b.geo.attributes.position.needsUpdate = true; b.geo.attributes.uv.needsUpdate = true; b.geo.setDrawRange(0, n * 6);
  }
  // order bins: solid glow + pin over the racks for the focused order, wire boxes for what robots are about to pick
  const pinG = new THREE.ConeGeometry(.16, .4, 16); pinG.rotateX(Math.PI); const binG = new THREE.BoxGeometry(.8, .62, .8);
  const strong = Array.from({length: 4}, () => { const g = new THREE.Group(), m = new THREE.Mesh(binG, new THREE.MeshBasicMaterial({color: '#ff7e00', transparent: true, opacity: .4, depthWrite: false})), p = new THREE.Mesh(pinG, new THREE.MeshBasicMaterial({color: '#ff7e00'})); p.position.y = 1.5; g.add(m, p); g.visible = false; world.add(g); return g; });
  const weak = Array.from({length: 28}, () => { const g = new THREE.Group(), m = new THREE.LineSegments(new THREE.EdgesGeometry(binG), new THREE.LineBasicMaterial({color: '#ff9a3c'})); g.add(m); g.visible = false; world.add(g); return g; });
  const binPos = it => V3(WX(it.shelf[0]), LEVELS[1] + .05 + .12 + .31, WZ(it.shelf[1]));
  // cartons riding the conveyor + the open carton at each station (filled with the items packed so far)
  const rideC = Array.from({length: 10}, () => { const c = carton(.4, .28, .34); c.visible = false; world.add(c); return c; });
  const stC = stations.map(st => { const c = carton(.4, .28, .34); c.position.set(CX, .56, WZ(st.r)); world.add(c); return c; });
  const cube = new THREE.BoxGeometry(.1, .1, .1);
  const stCubes = stations.map(() => Array.from({length: 6}, (_, i) => { const m = new THREE.Mesh(cube, std('#e0b64a', {r: .6})); m.castShadow = true; m.visible = false; m.position.set(CX + (i % 3 - 1) * .11, .56 + .06, 0); world.add(m); return m; }));
  const carried = [0, 1, 2].map(() => { const m = new THREE.Mesh(cube, std('#e0b64a', {r: .6})); m.castShadow = true; m.visible = false; world.add(m); return m; });
  const wk = worker(); world.add(wk.group);
  const tmpV = V3(0, 0, 0), tmpP = {x: 0, y: 0, ok: true}, scr = (x, y, z) => S.project(tmpV.set(x, y, z), tmpP);

  // ---------- hand target for a station item in progress (p in 0..1): rest → tote → box, arcing around the base
  const bez = (a, c, b, u) => V3((1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x, (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y, (1 - u) * (1 - u) * a.z + 2 * (1 - u) * u * c.z + u * u * b.z);
  function handTarget(st, rest) {
    const z = WZ(st.r), PICK = V3(WX(19) + .15, .78, z), DROP = V3(CX, .95, z), CTRL = V3(WX(20), 1.25, z + .85);
    if (!st.item) return {tip: rest, carry: false};
    const p = st.p;
    if (p < .35) { const q = ease(p / .35); return {tip: V3(lerp(rest.x, PICK.x, q), lerp(rest.y, PICK.y + .12, q), lerp(rest.z, PICK.z, q)), carry: false}; }
    if (p < .5) { const q = (p - .35) / .15; return {tip: V3(PICK.x, PICK.y + .12 - q * .12, PICK.z), carry: p > .44}; }
    if (p < .88) return {tip: bez(PICK, CTRL, DROP, ease((p - .5) / .38)), carry: true};
    return {tip: DROP, carry: false};
  }
  const tipS = [null, null, null]; // smoothed hand (0,1 = arms, 2 = worker)
  const smooth = (i, t, dt, rate = 18) => { if (!tipS[i]) tipS[i] = t.clone(); tipS[i].lerp(t, Math.min(1, dt * rate)); return tipS[i]; };
  const _q = new THREE.Quaternion(), _d = V3(0, 0, 0), _dn = V3(0, -1, 0);

  function updScene(dt, t) {
    // AMRs
    robots.forEach((r, i) => {
      const b = bots[i], wait = r.state === 'line' && r.st && r.st.line[0] !== r;
      b.a.group.visible = true; b.a.group.position.set(WX(r.x) + Math.sin(t * 60) * r.shake * .04, 0, WZ(r.y)); b.a.group.rotation.y = -r.head;
      const hot = r.order && !wait;
      b.a.light.material.emissive.set(hot ? '#ff7e00' : wait ? '#5c6670' : '#3aa0ff'); b.a.light.material.emissiveIntensity = hot ? 1.1 : .8;
      const carrying = st => st && st.item && st.p > .44 && st.line[0] === r;
      const nShow = Math.max(0, r.tote.length - (carrying(r.st) ? 1 : 0));
      b.a.items.forEach((m, j) => { m.visible = j < nShow; if (m.visible) m.material.color.set(r.tote[j]?.col || '#d9d9d6'); });
      // path ribbon: neon line from the AMR to its goal (as in the Zebra video)
      const sel = selRobot === r.id;
      if (r.path.length && r.order) { ribbon(b, [[WX(r.x), WZ(r.y)], ...r.path.map(([c, rw]) => [WX(c), WZ(rw)])]); b.rib.visible = true; b.mat.color.set(sel ? '#ff7e00' : r.state === 'toStation' || r.state === 'return' ? '#7dffb0' : '#28d4ff'); }
      else b.rib.visible = false;
      const inviting = drag || selOrder != null, hov = hover.robot === r.id;
      const so = sel || (inviting && hov) ? .95 : inviting && !r.order ? .35 + .3 * Math.sin(t * 6) : 0;
      b.sel.material.opacity = so; b.sel.position.set(WX(r.x), .03, WZ(r.y)); b.sel.scale.setScalar(1 + (so > .9 ? .04 * Math.sin(t * 8) : 0));
      b.ping.position.set(WX(r.x), .03, WZ(r.y)); b.ping.material.opacity = r.ping; b.ping.scale.setScalar(1 + (1 - r.ping) * 1.4);
    });
    for (let i = robots.length; i < MAXR; i++) { bots[i].a.group.visible = false; bots[i].rib.visible = false; bots[i].sel.material.opacity = 0; bots[i].ping.material.opacity = 0; }
    // bins
    const foc = orders.find(o => o.id === (drag?.o.id ?? selOrder ?? hover.card)), fl = foc && foc.state === 'new' ? foc.items : [];
    strong.forEach((g, i) => { const it = fl[i]; g.visible = !!it; if (it) { const p = binPos(it); g.position.set(p.x, p.y, p.z); g.children[1].position.y = .6 + RH - p.y + .5 + Math.sin(t * 5) * .06; g.children[0].material.opacity = .32 + .1 * Math.sin(t * 5); } });
    const wl = robots.flatMap(r => r.plan);
    weak.forEach((g, i) => { const it = wl[i]; g.visible = !!it; if (it) { const p = binPos(it); g.position.set(p.x, p.y, p.z); } });
    // conveyor + cartons
    beltTex.offset.y = (beltTex.offset.y + dt * 1.6 * CELL / .45) % 1;
    rideC.forEach((c, i) => { const b = boxes3[i]; c.visible = !!b; if (b) c.position.set(CX, .56, WZ(b.y)); });
    stations.forEach((st, si) => { stCubes[si].forEach((m, j) => { const on = j < st.fill; m.visible = on; if (on) { m.position.z = WZ(st.r) + (Math.floor(j / 3) - .5) * .11; m.material.color.set(ICOL[(st.i * 3 + j * 5) % ICOL.length]); } }); });
    // arms (brain) or bench + worker (human)
    let workerAt = null;
    stations.forEach((st, si) => {
      const human_ = isHuman(st), bot = urs[si];
      ped[si].bench.visible = human_; if (bot) bot.group.visible = !human_;
      const rest = V3(WX(20), 1.1, WZ(st.r) + .5), ht = handTarget(st, rest), tip = smooth(si, ht.tip, dt);
      if (!human_) {
        const it = st.item; carried[si].visible = ht.carry && !!it; if (it) { carried[si].material.color.set(it.col || '#e0b64a'); carried[si].position.set(tip.x, tip.y - TOOL - .05, tip.z); }
        if (bot) {
          const q = urSolve(bot, V3(tip.x, tip.y, tip.z), TOOL, urQ[si]); if (q) urQ[si] = q;
          setUR(bot, urQ[si]); urF[si].sync();
          const d = bot.data, R0 = V3(d.site_xpos[0] + d.site_xmat[2] * TOOL, d.site_xpos[1] + d.site_xmat[5] * TOOL, d.site_xpos[2] + d.site_xmat[8] * TOOL); bot.group.children[0].localToWorld(R0);
          const e = R0.distanceTo(tip); dbg.urErr = e; dbg.urMax = Math.max(dbg.urMax, e); dbg.urN++;
        }
      } else carried[si].visible = false;
    });
    // worker
    wk.group.visible = mode !== 'brain';
    if (mode !== 'brain') {
      const from = stations[human.walk > 0 ? 1 - human.to : human.at], to = stations[human.walk > 0 ? human.to : human.at];
      const q = human.walk > 0 ? ease(1 - human.walk / WALK) : 1, sign = to.r === 2 ? 1 : -1;
      const row = lerp(from.r, to.r, q) + (human.walk > 0 ? 0 : .6 * sign);
      const st = to, h = human.walk > 0 ? null : handTarget(st, V3(WX(20) + .1, 1.0, WZ(row) - sign * .3));
      const hand = h ? smooth(2, h.tip, dt, 14) : null;
      const baseX = human.walk > 0 ? WX(20) + .45 : WX(20) + .05, shift = hand ? clamp((hand.x - baseX) * .5, -.4, .4) : 0;
      wk.group.position.set(baseX + shift, 0, WZ(row)); wk.group.rotation.y = human.walk > 0 ? (to.r > from.r ? 0 : Math.PI) : (sign > 0 ? Math.PI : 0);
      const sw = human.walk > 0 ? Math.sin(t * 9) * .55 : 0; wk.legL.rotation.x = sw; wk.legR.rotation.x = -sw; wk.armL.rotation.x = -sw * .8;
      if (hand && isHuman(st)) {
        wk.group.updateMatrixWorld(true); const inv = wk.group.matrixWorld.clone().invert();
        _d.copy(hand).applyMatrix4(inv).sub(V3(wk.shoulderX, wk.shoulderY, 0)); const len = _d.length() || 1e-3;
        _q.setFromUnitVectors(_dn, _d.multiplyScalar(1 / len)); wk.armR.quaternion.copy(_q); wk.armR.scale.y = clamp(len / wk.armLen, .5, 1.8);
        carried[2].visible = h.carry && !!st.item;
        if (carried[2].visible) { const tp = V3(0, -wk.armLen * wk.armR.scale.y - .04, 0).applyQuaternion(_q).add(V3(wk.shoulderX, wk.shoulderY, 0)).applyMatrix4(wk.group.matrixWorld); carried[2].position.copy(tp); carried[2].material.color.set(st.item.col || '#e0b64a'); }
      } else { wk.armR.quaternion.identity(); wk.armR.scale.y = 1; carried[2].visible = false; workerAt = null; }
      workerAt = {x: wk.group.position.x, z: wk.group.position.z};
    } else carried[2].visible = false;
    updScene.workerAt = workerAt;
  }
  const reg = () => ({x: 16, y: TOP, w: Math.max(200, k.w - RIGHT - 32), h: Math.max(150, k.h - TOP - BOT)});
  function fitCam() {
    const r = reg(), tanF = Math.tan(S.cam.fov * Math.PI / 360), o = S.orbit;
    const dW = (COLS * CELL + 3) * k.h / (r.w * 2 * tanF), dH = (ROWS * CELL * Math.sin(o.pitch) + RH * Math.cos(o.pitch) + 2) * k.h / (r.h * 2 * tanF);
    o.dist = clamp(Math.max(dW, dH), o.minD, o.maxD);
  }

  // ---------- input ----------
  const inCard = (p, c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;
  const robotAt = p => { let bst = null, bd = 34; for (const r of robots) { const s = scr(WX(r.x), .4, WZ(r.y)); if (!s.ok) continue; const d = Math.hypot(p.x - s.x, p.y - s.y); if (d < bd) { bd = d; bst = r; } } return bst; };
  const inMap = p => { const r = reg(); return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h; };
  k.onDown(p => {
    if (phase === 'running') {
      const c = cards.find(c => inCard(p, c));
      if (c) {
        if (c.o.state !== 'new') { say(`#${c.o.id} is already ${c.o.state === 'shipped' ? 'shipped' : 'on its way'}`); return; }
        if (selRobot != null) { assign(c.o, robots[selRobot]); return; }
        selOrder = c.o.id; drag = {o: c.o, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false}; return;
      }
      const r = robotAt(p);
      if (r) { if (selOrder != null) assign(orders.find(o => o.id === selOrder), r); else { selRobot = selRobot === r.id ? null : r.id; r.ping = .6; } return; }
      selOrder = selRobot = null;
    }
    if (inMap(p)) orbitDrag = {x: p.x, y: p.y};
  });
  k.onMove(p => {
    if (orbitDrag) { S.drag(p.x - orbitDrag.x, p.y - orbitDrag.y); orbitDrag = {x: p.x, y: p.y}; if (S.orbit.pitch !== 1.0) userZoom = userZoom; return; }
    if (drag) { drag.x = p.x; drag.y = p.y; if (Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6) drag.moved = true; }
    hover.robot = robotAt(p)?.id ?? null; hover.card = cards.find(c => inCard(p, c))?.o.id ?? null;
  });
  k.onUp(p => { orbitDrag = null; if (drag && drag.moved) { const r = robotAt(p); if (r) assign(drag.o, r); } drag = null; });
  k.onKey(e => {
    const n = Number(e.key); if (!(n >= 1 && n <= robots.length) || phase !== 'running') return;
    const r = robots[n - 1]; if (selOrder != null) assign(orders.find(o => o.id === selOrder), r); else selRobot = r.id;
  });

  // ---------- frame ----------
  k.frame((dt, t) => {
    modeFlash = Math.max(0, modeFlash - dt * 1.5);
    overlay = lerp(overlay, phase === 'ready' ? 1 : 0, Math.min(1, dt * 8));
    if (phase === 'running') {
      simT += dt;
      if (simT >= nextAt) { spawn(); const g = DEMAND[demand].gap; nextAt = simT + lerp(g[0], g[1], simT / SHIFT) * rand(.85, 1.15); }
      robots.forEach(r => updRobot(r, dt)); updStations(dt);
      for (const o of orders) if (o.state !== 'shipped' && !o.late && simT > o.due) { o.late = true; say(`#${o.id} missed its deadline`); }
      stats.maxQ = Math.max(stats.maxQ, waitingCount());
      if (simT >= SHIFT) endShift();
    }
    boxes3.forEach(b => b.y += dt * 1.6); boxes3 = boxes3.filter(b => b.y < 9.6);
    pops.forEach(q => q.t += dt); pops = pops.filter(q => q.t < 1.4);
    updScene(dt, t); dbg.simT = simT; dbg.orders = orders.length; dbg.shipped = stats.shipped;
    if (!userZoom) fitCam();
    const r = reg(); S.render(r.x + r.w / 2, r.y + r.h / 2);
    draw(t, dt);
  });

  // ---------- 2D overlay: the page palette B reads dark/light; the warehouse keeps its real colours ----------
  function rr(x, y, w, h, r, fill, stroke, lw = 1) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
  function fit(s, w, size = 12, weight = 400) { ctx.font = `${weight} ${size}px Geist, system-ui, sans-serif`; if (ctx.measureText(s).width <= w) return s; while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
  const tag = (txt, x, y, o = {}) => { const {bg = 'rgba(18,18,18,.66)', fg = '#FFFFFF', size = 9, weight = 600} = o; ctx.font = `${weight} ${size}px "Geist Mono", ui-monospace, monospace`; const tw = ctx.measureText(txt).width + 10; rr(x - tw / 2, y - 7, tw, 14, 7, bg); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + .5); ctx.textBaseline = 'alphabetic'; };

  function draw(t, dt) {
    const mr = reg(), cs = CELL;
    k.clear(B.warm1);
    ctx.save(); ctx.beginPath(); ctx.roundRect(mr.x, mr.y, mr.w, mr.h, 14); ctx.clip(); ctx.clearRect(mr.x, mr.y, mr.w, mr.h); ctx.restore();
    rr(mr.x, mr.y, mr.w, mr.h, 14, null, B.warm2, 1.5);
    const cx = mr.x + mr.w / 2, focus = orders.find(o => o.id === (drag?.o.id ?? selOrder ?? hover.card));
    // labels in the scene
    for (const l of rackLab) { const s = scr(l.x, RH + .05, l.z); if (s.ok) tag(l.txt, s.x, s.y, {size: 8, weight: 600}); }
    { const s = scr(WX(14.7), .1, WZ(10)); if (s.ok) tag('DOCK', s.x, s.y + 4); }
    { const s = scr(CX, 1.1, WZ(9.9)); if (s.ok) tag('SHIP', s.x, s.y, {bg: B.orange, fg: '#121212'}); }
    for (const st of stations) {
      const waiting = st.line.filter((r, i) => i > 0 && r.state === 'line').length;
      const sa = scr(WX(19.6), 1.15, WZ(st.r) + (st.r === 2 ? -.95 : .95)); if (sa.ok) tag(`STATION ${'AB'[st.i]}${isHuman(st) ? ' · PICKER' : ' · BRAIN'}`, sa.x, sa.y, {bg: isHuman(st) ? 'rgba(18,18,18,.66)' : B.orange, fg: isHuman(st) ? '#FFFFFF' : '#121212'});
      if (waiting) { const s = scr(WX(17.5), .9, WZ(st.r === 2 ? 3.2 : 8.2)); if (s.ok) { tag(`QUEUE ${waiting}`, s.x, s.y, {bg: 'rgba(92,102,112,.85)'}); if (isHuman(st)) k.label('waiting for picker', s.x, s.y + 14, {align: 'center', color: '#FFFFFF', size: 9}); } }
    }
    if (updScene.workerAt) { const s = scr(updScene.workerAt.x, 1.85, updScene.workerAt.z); if (s.ok) tag('PICKER', s.x, s.y, {size: 8}); }
    // focused order: address tags over the racks
    if (focus && focus.state === 'new') focus.items.forEach(it => { const s = scr(WX(it.shelf[0]), RH + .95, WZ(it.shelf[1])); if (s.ok) tag(`${it.addr} · ${it.name}`, s.x, s.y - 4, {bg: B.orange, fg: '#121212'}); });
    // AMR numbers, pick / wait progress arcs
    for (const r of robots) {
      const s = scr(WX(r.x), .95, WZ(r.y)); if (!s.ok) continue; const wait = r.state === 'line' && r.st && r.st.line[0] !== r;
      tag(String(r.id + 1), s.x, s.y, {bg: r.order ? (wait ? 'rgba(92,102,112,.9)' : B.orange) : 'rgba(18,18,18,.66)', fg: r.order && !wait ? '#121212' : '#FFFFFF', size: 10, weight: 700});
      if (r.state === 'picking') { ctx.strokeStyle = B.orange; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(s.x, s.y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * r.t / PICK_T); ctx.stroke(); }
      if (wait && r.st && isHuman(r.st)) { ctx.strokeStyle = '#B5B9BA'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ((r.wait / 10) % 1)); ctx.stroke(); }
    }
    pops.forEach(q => { const a = clamp(1.4 - q.t, 0, 1), s = scr(WX(19.2), 1.6, WZ(q.r)); if (!s.ok) return; ctx.globalAlpha = a; k.text(q.txt, s.x, s.y - 24 - q.t * 34, {align: 'center', size: 12, weight: 700, color: q.ok ? B.orange : '#FFFFFF'}); ctx.globalAlpha = 1; });
    if (modeFlash > 0) { const s = scr(WX(20), .5, WZ(5)), s2 = scr(WX(18.5), .5, WZ(5)); ctx.fillStyle = mode !== 'classic' ? `rgba(255,126,0,${modeFlash * .12})` : `rgba(92,102,112,${modeFlash * .18})`; ctx.fillRect(Math.min(s.x, s2.x) - 40, mr.y, Math.abs(s.x - s2.x) + 200, mr.h); }
    k.label('Drag to orbit · scroll to zoom', mr.x + 14, mr.y + mr.h - 10, {color: '#FFFFFF', size: 9});

    // header
    k.text('Goal: finish a 3-min shift at ≥ 90% on time with the Skild Brain', 18, 28, {size: 15, weight: 600});
    k.label(fit(`${DEMAND[demand].name} · ` + (mode === 'brain' ? 'Skild Brain moves items tote → box at both stations' : mode === 'hybrid' ? 'robots + workers: brain at station A, a worker at B' : 'one human picker moves items tote → box'), k.w - RIGHT - 170, 10), 18, 48, {color: mode !== 'classic' ? B.orange2 : B.cool2});
    k.text(fit(log[log.length - 1] || '', k.w - RIGHT - 170), 18, 68, {size: 12, color: B.black});
    if (phase === 'running' && streak > 1) k.label(`Streak ${streak}`, k.w - RIGHT - 110, 24, {align: 'right', color: B.orange2});
    const right = k.w - RIGHT - 16, left = SHIFT - simT;
    k.label('Shift clock', right, 24, {align: 'right'});
    k.text(phase === 'ready' ? '3:00' : mmss(Math.max(0, Math.ceil(left))), right, 50, {align: 'right', mono: true, size: 22, weight: 600, color: phase === 'running' && left < 20 ? B.orange2 : B.black});

    // metrics strip
    const my = k.h - BOT + 18, bw = (k.w - RIGHT - 32) / 4, p = pct();
    const cells = [
      ['Orders / min', simT > 15 ? (stats.shipped / (simT / 60)).toFixed(1) : '—'],
      ['On-time', p == null ? '—' : Math.round(p * 100) + '%'],
      ['Queue at stations', String(waitingCount())],
      ['Shipped', `${stats.shipped}`],
    ];
    cells.forEach(([l, v], i) => {
      const x = 18 + i * bw; k.label(l, x, my);
      k.text(v, x, my + 28, {mono: true, size: 22, weight: 600, color: i === 2 && waitingCount() > 2 ? B.cool2 : i === 1 && p != null && p >= .9 ? B.orange2 : B.black});
      if (i === 1) { const mw = bw - 90; k.meter(x + 70, my + 20, mw, p ?? 0); ctx.fillStyle = B.black; ctx.fillRect(x + 70 + mw * .9, my + 16, 1.5, 14); k.label('90%', x + 70 + mw * .9, my + 42, {align: 'center', size: 9}); }
      if (i === 2) { for (let j = 0; j < Math.min(8, waitingCount()); j++) rr(x + 40 + j * 12, my + 14, 9, 14, 3, B.cool1); }
    });

    // orders panel
    const px = k.w - RIGHT; ctx.fillStyle = B.white; ctx.fillRect(px, 0, RIGHT, k.h); ctx.fillStyle = B.warm2; ctx.fillRect(px, 0, 1, k.h);
    const open = orders.filter(o => o.state !== 'shipped');
    k.label(`Orders · ${open.length} open`, px + 16, 26);
    k.label('Click, then an AMR', px + RIGHT - 16, 26, {align: 'right', color: B.warm4});
    const list = orders.filter(o => o.state !== 'shipped' || simT - o.shippedAt < 1.6)
      .sort((a, b) => (a.state === 'new' ? 0 : a.state === 'assigned' ? 1 : 2) - (b.state === 'new' ? 0 : b.state === 'assigned' ? 1 : 2) || a.due - b.due);
    const CH = 64, maxN = Math.max(1, Math.floor((k.h - VID - 44) / (CH + 8)));
    cards = [];
    list.slice(0, maxN).forEach((o, i) => {
      const ty = 40 + i * (CH + 8); o.cy = o.cy == null ? ty + 20 : lerp(o.cy, ty, Math.min(1, dt * 12)); o.a = Math.min(1, o.a + dt * 5);
      const x = px + 14, w = RIGHT - 28, y = o.cy, sel = selOrder === o.id, sh = o.state === 'shipped';
      ctx.globalAlpha = sh ? clamp(1 - (simT - o.shippedAt) / 1.6, 0, 1) : o.a;
      rr(x, y, w, CH, 10, o.late && !sh ? B.warm2 : B.white, sel ? B.orange : hover.card === o.id && o.state === 'new' ? B.cool1 : B.warm2, sel ? 2 : 1);
      k.text(`#${o.id}`, x + 12, y + 19, {mono: true, size: 12, weight: 600});
      k.text(`${o.items.length} item${o.items.length > 1 ? 's' : ''}`, x + 64, y + 19, {size: 12, color: B.cool2});
      const rem = o.due - simT;
      k.text(sh ? (o.ok ? 'on time' : 'late') : o.late ? 'LATE' : mmss(Math.max(0, rem)), x + w - 12, y + 19, {align: 'right', mono: true, size: 12, weight: 600, color: sh ? (o.ok ? B.orange2 : B.cool2) : o.late ? B.cool4 : rem < 10 ? B.black : B.cool3});
      k.text(fit(o.items.map(it => it.name).join(' · '), w - 24), x + 12, y + 37, {size: 12, color: B.ink});
      const rb = o.robot != null ? robots[o.robot] : null;
      let s = o.late ? 'Late · still unassigned' : 'Unassigned';
      if (sh) s = 'Packed & shipped ✓';
      else if (rb && rb.order === o) {
        const pk = o.items.filter(i => i.picked).length;
        s = rb.state === 'pick' || rb.state === 'picking' ? `AMR ${rb.id + 1} · picking ${pk}/${o.items.length}` : rb.state === 'toStation' ? `AMR ${rb.id + 1} · to station ${'AB'[rb.st.i]}` :
          rb.st?.line[0] === rb ? (!isHuman(rb.st) ? 'Brain packing' : human.at === rb.st.i && !human.walk ? 'Picker packing' : 'Waiting for picker') : isHuman(rb.st) ? 'Queued for picker' : 'Queued';
      }
      k.label(fit(s, w - 24, 10), x + 12, y + 54, {color: sh ? B.orange2 : s.includes('picker') || s.startsWith('Queued') ? B.cool2 : rb ? B.black : B.cool2});
      const life = clamp(rem / (o.due - o.created), 0, 1);
      ctx.fillStyle = B.warm2; ctx.fillRect(x + 12, y + CH - 5, w - 24, 2); ctx.fillStyle = life < .25 ? B.black : B.cool1; ctx.fillRect(x + 12, y + CH - 5, (w - 24) * (sh ? 0 : life), 2);
      ctx.globalAlpha = 1;
      cards.push({o, x, y, w, h: CH});
    });
    if (list.length > maxN) k.label(`+${list.length - maxN} more waiting`, px + 16, 40 + maxN * (CH + 8) + 6, {color: B.cool3});
    if (!list.length) k.text(phase === 'running' ? 'Waiting for orders…' : 'No orders yet', px + 16, 64, {size: 13, color: B.cool2});

    // drag ghost
    if (drag && drag.moved) {
      ctx.strokeStyle = B.orange; ctx.lineWidth = 1.5; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(drag.sx, drag.sy); ctx.lineTo(drag.x, drag.y); ctx.stroke(); ctx.setLineDash([]);
      rr(drag.x + 8, drag.y - 14, 78, 26, 8, B.black); k.text(`#${drag.o.id}`, drag.x + 47, drag.y + 3, {align: 'center', mono: true, size: 12, color: B.white, weight: 600});
    }
    // overlays
    if (overlay > .02) {
      ctx.globalAlpha = overlay; const w = Math.min(460, mr.w - 40), h = 212, x = cx - w / 2, y = mr.y + mr.h / 2 - h / 2;
      rr(x, y, w, h, 14, B.white, B.warm2, 1.5);
      k.label('Warehouse shift · 3 min · simulated', x + 22, y + 30);
      k.text('Run the warehouse', x + 22, y + 58, {size: 20, weight: 600});
      ['1  Click an order card, then an AMR (or drag it onto one).', '2  The AMR (ex-Fetch Robotics fleet) picks each item.', '3  At the station, items move between receptacles,', '    tote → box: the step that was still human-bottlenecked.', 'Pick a station mode, press Start shift. Flip any time.']
        .forEach((l, i) => k.text(fit(l, w - 40, 13), x + 22, y + 88 + i * 21, {size: 13, color: i === 4 ? B.black : B.cool3, weight: i === 4 ? 600 : 400}));
      ctx.globalAlpha = 1;
    }
    if (phase === 'done') {
      const w = Math.min(480, mr.w - 40), h = 246, x = cx - w / 2, y = mr.y + mr.h / 2 - h / 2, pp = pct() ?? 0, win = endMode === 'brain' && pp >= .9 && stats.shipped >= 10;
      rr(x, y, w, h, 14, B.white, win ? B.orange : B.warm3, win ? 2 : 1.5);
      k.label(`Shift over · ${MODE[endMode]}`, x + 22, y + 30, {color: win ? B.orange2 : B.cool2});
      k.text(win ? 'Goal reached. Nothing waits at the station.' : endMode === 'classic' ? 'The station was the bottleneck.' : 'Close. Dispatch faster.', x + 22, y + 58, {size: 19, weight: 600});
      k.text(`${Math.round(pp * 100)}%`, x + 22, y + 104, {mono: true, size: 34, weight: 600, color: win ? B.orange2 : B.black}); k.label('on time', x + 22, y + 122);
      k.text((stats.shipped / 3).toFixed(1), x + 150, y + 104, {mono: true, size: 34, weight: 600}); k.label('orders / min', x + 150, y + 122);
      k.text(String(stats.maxQ), x + 290, y + 104, {mono: true, size: 34, weight: 600, color: B.cool3}); k.label('peak queue', x + 290, y + 122);
      k.label(`Your best · ${DEMAND[demand].name} · longest on-time streak ${bestStreak}`, x + 22, y + 152);
      ['classic', 'hybrid', 'brain'].forEach((m, i) => { const b = best[m + '·' + demand]; k.text(fit(`${MODE[m]}: ${b ? `${Math.round(b.p * 100)}% on time · ${b.opm.toFixed(1)}/min · peak queue ${b.maxQ}` : 'not run yet'}`, w - 40), x + 22, y + 174 + i * 19, {size: 12, color: m === 'brain' ? B.black : B.cool2}); });
      if (!win) k.text(endMode === 'brain' ? 'Goal: ≥ 90% on time and 10+ orders shipped.' : 'Now run a shift in Skild Brain mode.', x + 22, y + 236, {size: 12, weight: 600, color: B.orange2});
    }
    void cs;
  }

  const bStart = k.button('Start shift', start, {primary: true});
  const modeBtns = ['classic', 'hybrid', 'brain'].map(m => { const b = k.button(MODE[m], () => setMode(m)); b.dataset.m = m; b.classList.toggle('on', m === mode); return b; });
  const bDemand = k.button('Demand: Normal day', () => {
    demand = demand === 'normal' ? 'peak' : 'normal'; bDemand.textContent = 'Demand: ' + DEMAND[demand].name; bDemand.classList.toggle('on', demand === 'peak');
    say(phase === 'running' ? `${DEMAND[demand].name}: order rate changes now` : `${DEMAND[demand].name} selected`);
  });
  k.button('Reset view', () => { userZoom = false; Object.assign(S.orbit, {yaw: 0, pitch: 1.0}); });
  k.slider('Fleet (AMRs)', 4, 6, fleetN, v => { fleetN = v; if (phase !== 'running') buildFleet(); else say('Fleet size applies to the next shift'); });
  api.status('Ready · pick a mode');
  return () => { dead = true; urs.forEach(b => b && b.dispose()); S.dispose(); k.destroy(); };
}
