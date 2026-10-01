// TRY · Reindustrial revolution — "Swap the arm": three jobs on three kinds of OEM hardware, in a 3D workcell.
//  · NVIDIA GB300 compute tray: dual-arm, shared-zone lock.
//  · Blackwell tray · GTC live demo: busbar, limit block, 16 screws, remove the block.
//  · Insert 4 modules into a board.
// The workcell is two real UR5e cobots (MuJoCo Menagerie model, analytic UR inverse kinematics so the screwdriver bit
// really visits every hole) on a black workbench, as in "Live from GTC". Hardware swap: ABB-style heavy arm
// (procedural), UR5e cobot (real model), MiR-style mobile base + UR5e. Classic programming replays taught points and
// needs an expert reprogram for every new arm, task or tray position; the Skild Brain re-localizes the holes and adapts
// live. Stylized and simulated, not the real system: the tray model, hole layout, torque traces and timings are
// illustrative. The post gives no reprogramming times, so we count reprograms.
import {kit, B, clamp, lerp} from './kit.js';
import * as MJ from '../mj.js';
import {THREE, stage, lights, factoryRoom, workbench, gb300Tray, busbar, limitBlock, screwTool, screwMesh, abbArm, mirBase,
  urSolve, setUR, styleUR, follower, UR_READY, TRAY, TOOL_LEN, std, box as box3, disposeTree} from '../props/ind-props.js';

const PI = Math.PI, W = 12, H = 6.4, BENCH = 1.6, TRAY_TOP = 1.72, BOARD_TOP = 1.76, SEAT = 1.66, BOARD_MIN = 6.4, BOARD_MAX = 8.8;
const HW = {
  abb: {name: 'Industrial 6-axis arm', short: 'Industrial arm', tag: 'ABB-style', partner: 'ABB Robotics', base: [4.6, 1.05], l1: 3.0, l2: 2.8, tool: .6, axes: '6 axes · floor', spd: 1.15},
  ur: {name: 'Collaborative arm', short: 'Cobot', tag: 'UR-style', partner: 'Universal Robots · Teradyne', base: [4.6, 2.15], l1: 2.7, l2: 2.6, tool: .5, axes: '6 axes · bench', spd: 1},
  mir: {name: 'Mobile base + arm', short: 'Mobile + arm', tag: 'MiR-style', partner: 'MiR', base: [.9, 1.5], l1: 1.5, l2: 1.3, tool: .45, mobile: true, axes: 'AMR + arm', spd: .9},
};
const IDS = ['abb', 'ur', 'mir'];
const JOBS = {
  gb300: {name: 'NVIDIA GB300 tray', short: 'GB300', tag: 'GB300 tray', clip: 'Blackwell', view: 'tray', mid: true, letter: 'G'},
  blackwell: {name: 'Blackwell tray · GTC live demo', short: 'Blackwell (GTC)', tag: 'GTC live demo · 16 screws', clip: 'GTC', view: 'tray', mid: false, letter: 'B'},
  modules: {name: 'Insert 4 modules', short: '4 modules', tag: 'Insert 4 modules', clip: 'Precision', view: 'side', letter: 'M',
    parts: [2.0, 2.45, 2.9, 3.35].map((s, i) => ({s, dx: [-.72, -.24, .24, .72][i], dy: SEAT, w: .32, h: .34, kind: 'mod'}))},
};
const JOB_IDS = ['gb300', 'blackwell', 'modules'];
const move = (p, from, to) => [{k: 'above', p, at: from}, {k: 'at', p, at: from}, {k: 'grip', p}, {k: 'above', p, at: from}, {k: 'above', p, at: to}, {k: 'at', p, at: to}, {k: 'release', p, at: to}, {k: 'above', p, at: to}];
JOBS.modules.steps = [0, 1, 2, 3].flatMap(i => move(i, 'src', 'dst')).concat({k: 'home'});
const PHASES = [[0, 'Semi-structured · factories'], [3, 'Less structured · hospitals, hotels'], [6, 'Unstructured · homes']];

// ---------- tray world (tray-local units: chassis x −1…1, y −0.5…0.5; +y = toward the camera; 1 unit = 0.3 m)
// 18 holes: 4 corners, 2 edge mids, and 3 + 3 around the cold plates of each board. Symmetric; GTC drops the edge mids.
// Arm A (far side) drives the far row left→right (#1–9), arm B (near side) the near row right→left (#10–18).
const ROW = [[-.94, -.44], [-.84, -.3], [-.5, -.32], [-.16, -.3], [0, -.45], [.16, -.3], [.5, -.32], [.84, -.3], [.94, -.44]];
function holesFor(j) {
  const top = ROW.filter(p => JOBS[j].mid || p[0] !== 0);
  return [...top.map(([x, y]) => ({x, y, arm: 'T'})), ...top.map(([x, y]) => ({x: -x, y: -y, arm: 'B'}))].map((h, i) => ({...h, n: i + 1}));
}
const HOLES = {gb300: holesFor('gb300'), blackwell: holesFor('blackwell')};
const ZONE = .24;
const ARMS = {T: {name: 'Arm A · far', base: [.35, -.93], home: [.35, -.64], waitX: -.36}, B: {name: 'Arm B · near', base: [-.35, .93], home: [-.35, .64], waitX: .36}};
const PARTS = {bus: {name: 'Busbar', nest: [1.2, -.28], local: [0, 0]}, blk: {name: 'Limit block', nest: [-1.2, .28], local: [0, 0]}};
const trW = (P, x, y) => { const c = Math.cos(P.a), s = Math.sin(P.a); return [P.x + x * c - y * s, P.y + x * s + y * c]; };
const trL = (P, x, y) => { const c = Math.cos(P.a), s = Math.sin(P.a), dx = x - P.x, dy = y - P.y; return [dx * c + dy * s, -dx * s + dy * c]; };
function traySteps(jobId, arm) {
  const scr = HOLES[jobId].map((h, i) => ({k: 'screw', h: i, n: h.n, lp: [h.x, h.y], arm: h.arm})).filter(s => s.arm === arm);
  return arm === 'T'
    ? [{k: 'pick', part: 'bus', from: 'nest'}, {k: 'place', part: 'bus', to: 'tray', set: 'bus'}, {k: 'wait', need: ['bus', 'blk']}, ...scr, {k: 'mark', set: 'scrT'}, {k: 'home'}]
    : [{k: 'wait', need: ['bus']}, {k: 'pick', part: 'blk', from: 'nest'}, {k: 'place', part: 'blk', to: 'tray', set: 'blk'}, {k: 'wait', need: ['bus', 'blk']}, ...scr, {k: 'mark', set: 'scrB'},
       {k: 'wait', need: ['scrT', 'scrB']}, {k: 'pick', part: 'blk', from: 'tray'}, {k: 'place', part: 'blk', to: 'nest', set: 'out'}, {k: 'home'}];
}
function stepRef(st, a) {
  if (st.k === 'screw') return {local: st.lp};
  if (st.k === 'pick') return st.from === 'nest' ? {world: PARTS[st.part].nest} : {local: PARTS[st.part].local};
  if (st.k === 'place') return st.to === 'nest' ? {world: PARTS[st.part].nest} : {local: PARTS[st.part].local};
  if (st.k === 'home') return {world: ARMS[a].home};
  return null;
}
const refWorld = (st, a, P) => { const r = stepRef(st, a); return !r ? null : r.local ? trW(P, r.local[0], r.local[1]) : r.world; };
const inZone = st => { const r = stepRef(st, 'T'); return !!(r && r.local && Math.abs(r.local[0]) < ZONE); };
const makeTrayProgram = (id, jobId, P) => ({hw: id, job: jobId, view: 'tray', pose: {...P}, arms: Object.fromEntries(['T', 'B'].map(a => [a, traySteps(jobId, a).map(st => ({...st, wp: refWorld(st, a, P)}))]))});
// a program taught on a different arm lands off target (different kinematics / calibration)
function distort(p, a) { const b = ARMS[a].base, g = .06, s = 1.04, dx = p[0] - b[0], dy = p[1] - b[1]; return [b[0] + (dx * Math.cos(g) - dy * Math.sin(g)) * s, b[1] + (dx * Math.sin(g) + dy * Math.cos(g)) * s]; }
function torqueAt(kind, u) {
  const n = (Math.random() - .5) * .03;
  if (kind === 'ok') return u < .55 ? .1 + .03 * Math.sin(u * 50) + n : u < .8 ? .12 + .88 * ((u - .55) / .25) ** 1.6 + n : 1 + .015 * Math.sin(u * 70) * (1 - u) + n * .4;
  if (kind === 'cross') return u < .28 ? .1 + 2.1 * u + n * 4 : u < .4 ? .68 - (u - .28) * 5 + n * 3 : .04 + n;
  return .03 + Math.abs(n);
}

// ---------- side sim (4-module job): planar arm; the 3D arm follows its tool tip
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const shoulder = (hw, bx) => hw.mobile ? [bx, 1.5] : hw.base;
const motionStep = (steps, si) => (steps[si].k === 'grip' || steps[si].k === 'release') ? steps[si - 1] : steps[si];
function target(job, st, bx, baseX, hw) {
  if (st.k === 'home') return [(hw.mobile ? baseX : hw.base[0]) + 1, 3.6];
  const d = job.parts[st.p], up = st.k === 'above' ? 1 : 0;
  return st.at === 'src' ? [d.s, TRAY_TOP + d.h + up] : [bx + d.dx, d.dy + d.h + up];
}
function ik(hw, S, T) {
  const w = [T[0], T[1] + hw.tool], dx = w[0] - S[0], dy = w[1] - S[1];
  const d = clamp(Math.hypot(dx, dy), Math.abs(hw.l1 - hw.l2) + 1e-3, hw.l1 + hw.l2 - 1e-3), a = Math.atan2(dy, dx);
  const c = Math.acos(clamp((hw.l1 ** 2 + d * d - hw.l2 ** 2) / (2 * hw.l1 * d), -1, 1));
  const t1 = Math.sin(a + c) > Math.sin(a - c) ? a + c : a - c;
  const e = [S[0] + Math.cos(t1) * hw.l1, S[1] + Math.sin(t1) * hw.l1], t2 = Math.atan2(w[1] - e[1], w[0] - e[0]);
  return [t1, wrapA(t2 - t1), wrapA(-PI / 2 - t2)];
}
function fk(hw, S, q) {
  const a1 = q[0], a2 = a1 + q[1], a3 = a2 + q[2];
  const E = [S[0] + Math.cos(a1) * hw.l1, S[1] + Math.sin(a1) * hw.l1], Wr = [E[0] + Math.cos(a2) * hw.l2, E[1] + Math.sin(a2) * hw.l2];
  return {S, E, W: Wr, T: [Wr[0] + Math.cos(a3) * hw.tool, Wr[1] + Math.sin(a3) * hw.tool]};
}
function makeSideProgram(id, bx, jobId) {
  const hw = HW[id], job = JOBS[jobId]; let base = hw.base[0];
  const steps = job.steps.map((_, si) => {
    const s0 = motionStep(job.steps, si);
    if (hw.mobile && s0.k !== 'home') base = clamp(target(job, s0, bx, base, hw)[0] - 1.1, .8, 11);
    return {q: ik(hw, shoulder(hw, base), target(job, s0, bx, base, hw)), base};
  });
  return {hw: id, bx, job: jobId, view: 'side', steps};
}

// ---------- 3D layout (metres; bench top = y 0, floor = y −0.9)
const U = TRAY.U, HY = TRAY.HOLE_Y, SS = .1;                    // tray unit, screw seat height, side-sim unit
const sideX = x => (x - 6) * SS, sideY = y => (y - BENCH) * SS;
const PART_H = {bus: .008, blk: .025}, NEST_Y = .006;
const RIG = {                                                   // arm bases (tray jobs): x, y, z of the arm root
  ur: {T: [.105, 0, -.44], B: [-.105, 0, .44]},
  mir: {T: [.105, 0, -.64], B: [-.105, 0, .64]},
  abb: {T: [.105, -.12, -.76], B: [-.105, -.12, .76]},
};
const CAMS = [['GTC view', {yaw: .55, pitch: .7, dist: 1.3}], ['Overhead', {yaw: 0, pitch: 1.5, dist: 1.02}], ['Close-up', {yaw: -.4, pitch: .82, dist: .66}]];

export default function mount(root, api) {
  const k = kit(root); const {ctx} = k;
  const clip = m => api.clip?.(m), record = (kind, d) => api.record?.(kind, d);
  let hwId = 'abb', jobId = 'gb300', mode = 'classic', reprograms = 0, run = null, swap = 0, pending = -1, drag = null, flash = 0, completed = false;
  let lastFlags = {}, data = 0, lastResult = null, sparks = [], rings = [], anim = null, reloc = 0, relocFlash = 0, dead = false, orbitDrag = null, camI = 0, camGoal = null;
  const board = {x: 7.6}, pose = {x: 0, y: 0, a: 0};
  let prog = makeTrayProgram('abb', 'gb300', pose);
  const R = {q: [0, 0, 0], base: 0, tip: [0, 0]};
  const wins = Object.fromEntries(IDS.map(id => [id, {gb300: false, blackwell: false, modules: false}]));
  const bestT = {gb300: null, blackwell: null, modules: null};
  const doneHW = new Set();
  let sparts = [], holes = [], tparts = {}, xmarks = [], stat = {t: 0, relocs: 0, missed: 0};
  const armState = id => ({id, steps: [], si: 0, ph: 'start', pt: 0, tip: [...ARMS[id].home], z: 1, holding: null, trace: [], tr: null, waiting: false, off: [0, 0], label: 'READY', cur: null, spin: 0});
  const AR = {T: armState('T'), B: armState('B')};
  const log = ['Classic: an expert taught the GB300 tray job on the industrial arm.', 'Run it, then Shift tray (or drag it) mid-run.'];
  const say = s => { log.push(s); if (log.length > 6) log.shift(); };
  const job = () => JOBS[jobId], isTray = () => job().view === 'tray';
  const other = id => id === 'T' ? 'B' : 'T';
  const partWorld = p => p.state === 'tray' ? trW(pose, p.lx, p.ly) : [p.wx, p.wy];
  function resetScene() {
    if (isTray()) {
      holes = HOLES[jobId].map(h => ({...h, state: 'open'})); xmarks = []; rings = []; lastFlags = {};
      tparts = Object.fromEntries(Object.entries(PARTS).map(([id, d]) => [id, {id, d, state: 'nest', wx: d.nest[0], wy: d.nest[1], lx: 0, ly: 0, ok: false, by: null}]));
      for (const a of ['T', 'B']) Object.assign(AR[a], armState(a), {tip: AR[a].tip, z: AR[a].z});
    } else sparts = job().parts.map(d => ({d, x: d.s, y: TRAY_TOP, state: 'tray', rot: 0, vy: 0}));
    home();
  }
  function home() { const hw = HW[hwId]; R.base = hw.base[0]; R.tip = target(JOBS.modules, {k: 'home'}, board.x, R.base, hw); R.q = ik(hw, shoulder(hw, R.base), R.tip); }
  resetScene();

  const poseOff = () => ({d: Math.hypot(pose.x - prog.pose.x, pose.y - prog.pose.y), a: Math.abs(pose.a - prog.pose.a)});
  const stale = () => {
    if (mode !== 'classic') return null;
    if (prog.hw !== hwId) return 'hw';
    if (prog.job !== jobId) return 'job';
    if (isTray()) { const o = poseOff(); return o.d > .006 || o.a > .004 ? 'board' : null; }
    return Math.abs(prog.bx - board.x) > .06 ? 'board' : null;
  };
  function startRun() {
    pending = -1; lastResult = null; anim = null; drag = null;
    const j = job();
    if (mode === 'classic' && JOBS[prog.job].view !== j.view) {
      say(`No taught program for this task (taught: ${JOBS[prog.job].short}). Reprogram (expert).`);
      lastResult = {ok: false, txt: 'no program for this task', t: 0, mode}; api.status('Reprogram needed'); return;
    }
    resetScene();
    if (j.view === 'tray') {
      const src = mode === 'skild' ? {T: traySteps(jobId, 'T'), B: traySteps(jobId, 'B')} : prog.arms;
      for (const a of ['T', 'B']) AR[a].steps = src[a].map(s => ({...s}));
      run = {tray: true, t: 0, flags: {}, lock: null, relocs: 0, shifts: 0, missed: 0, screws: [], moved: false};
      stat = {t: 0, relocs: 0, missed: 0};
      clip(j.clip);
    } else run = {si: 0, dwell: 0, moved: false, t: 0, misses: 0};
    say(`Run · ${j.short} · ${mode === 'skild' ? '2× ' : ''}${HW[hwId].short} · ${mode === 'skild' ? 'Skild Brain' : 'taught program'}`);
    api.status(mode === 'skild' ? 'Skild Brain · running' : 'Classic · running');
  }
  function finish(ok, t, txt) {
    const hw = HW[hwId];
    lastResult = {ok, txt, t, mode};
    if (ok) {
      flash = 1; say(`${hw.short} · ${job().short}: done in ${t} s ✓`);
      if (!bestT[jobId] || t < bestT[jobId].t) bestT[jobId] = {t, mode};
      if (mode === 'skild') {
        wins[hwId][jobId] = true; data++;
        const ph = PHASES.findLast(p => data >= p[0]); if (PHASES.some(p => p[0] === data && data > 0)) say(`Fleet data unlocks the next phase: ${ph[1]} (post roadmap, stylized)`);
        if (!doneHW.has(hwId)) { doneHW.add(hwId); if (doneHW.size < 3) say(`${doneHW.size}/3 robots done with one brain. Swap the arm.`); }
      }
    } else say(mode === 'classic' ? `${hw.short}: ${txt}. Taught ${isTray() ? 'coordinates' : 'joint angles'} don’t fit this setup.` : `${hw.short}: ${txt}.`);
    api.status(ok ? 'Job done ✓' : 'Job failed');
    if (!completed && doneHW.size === 3) { completed = true; say('Same brain, three robots, 0 reprograms.'); api.complete('One brain · 3 robots'); }
  }
  function endSideRun() {
    const n = sparts.filter(p => p.state === 'in').length, t = +run.t.toFixed(1), moved = run.moved, ok = n === 4, txt = `${n}/4 modules inserted`; run = null;
    finish(ok, t, txt);
    record('reindustrial_run', {job: jobId, hardware: hwId, mode, ok, result: txt, time_s: t, board_moved: moved, board_x: +board.x.toFixed(2), reprograms_total: reprograms});
  }
  function endTrayRun() {
    const N = holes.length, seated = holes.filter(h => h.state === 'seated').length, never = holes.filter(h => h.state === 'open').length, bus = tparts.bus, blk = tparts.blk, r = run;
    const ok = seated === N && r.missed === 0 && bus.state === 'tray' && bus.ok && blk.state === 'nest', t = +r.t.toFixed(1);
    const txt = ok ? `${N}/${N} screws seated` : [`screws ${seated}/${N}`, r.missed ? `${r.missed} missed` : '', bus.state !== 'tray' || !bus.ok ? 'busbar off' : '', blk.state !== 'nest' ? 'block left on tray' : ''].filter(Boolean).join(' · ');
    run = null; lastFlags = r.flags; finish(ok, t, txt);
    if (!ok && mode === 'classic' && never && prog.job !== jobId) say(`${never} holes never driven: the program was taught for the ${JOBS[prog.job].short} tray.`);
    if (ok && mode === 'skild' && r.relocs) say(`Tray shifted ${r.relocs}× · re-localized · 0 missed.`);
    record('gb300_run', {job: jobId, tray: job().tag, screws_total: N, hardware: hwId, mode, ok, cycle_s: t, seated, missed: r.missed, never_driven: never, relocalizations: r.relocs, shifts: r.shifts,
      busbar_ok: bus.state === 'tray' && bus.ok, block_removed: blk.state === 'nest', tray_pose: {x: +pose.x.toFixed(3), y: +pose.y.toFixed(3), a: +pose.a.toFixed(3)},
      program: mode === 'classic' ? {hw: prog.hw, job: prog.job} : null, reprograms_total: reprograms, screws: r.screws});
  }
  function setHW(id) {
    if (id === hwId) return; hwId = id; run = null; swap = 1; anim = null; resetScene(); pending = .8;
    say(stale() === 'hw' ? `Swapped to ${HW[id].short}. The program was taught on another arm.` : `Swapped to ${HW[id].short}.`);
    clip(job().clip);
  }
  function setJob(id) {
    if (id === jobId) return; jobId = id; run = null; anim = null; drag = null; lastResult = null; resetScene(); pending = .7;
    jobBtn.textContent = 'Job: ' + job().short; jobBtn.classList.toggle('on', id !== 'modules');
    say(id === 'gb300' ? 'GB300 tray: busbar, limit block, remove the block.' : id === 'blackwell' ? 'GTC live demo: dual arms · busbar, limit block, 16 screws, remove the block.' : 'Job: insert 4 modules into the board.');
    if (stale() === 'job') say('New task → the taught program no longer applies.');
    clip(job().clip); setCam(isTray() ? camI : 0, true);
  }
  function setMode(m) {
    mode = m; run = null; anim = null; resetScene(); pending = .6;
    modeBtn.textContent = 'Mode: ' + (m === 'skild' ? 'Skild Brain' : 'Classic programming'); modeBtn.classList.toggle('on', m === 'skild');
    say(m === 'skild' ? 'Skild Brain: perceives the tray, re-localizes, no task-by-task reprogramming.' : 'Classic: replay the points an expert taught.');
  }
  function reprogram() {
    if (mode !== 'classic') { say('Skild Brain needs no reprogramming.'); return; }
    const st = stale(); if (!st) { say('Program is already taught for this setup.'); return; }
    reprograms++; run = null; anim = null; prog = isTray() ? makeTrayProgram(hwId, jobId, pose) : makeSideProgram(hwId, board.x, jobId);
    say(`Expert reprogram #${reprograms}: ${st === 'hw' ? 'new arm' : st === 'job' ? 'new task' : isTray() ? 'tray moved' : 'board moved'}.`);
    record('reindustrial_reprogram', {reason: st, hardware: hwId, job: jobId, total: reprograms});
    resetScene(); pending = .5;
  }
  // ---- disturbance: drag the tray, or Shift tray
  function disturb() { if (run && run.tray) { run.shifts++; run.moved = true; } }
  function trayMoved() {
    if (run && run.tray) {
      if (mode === 'skild') { reloc = .5; relocFlash = 1.6; run.relocs++; stat.relocs = run.relocs; say('Tray shifted → Skild Brain re-localized the holes and continues.'); }
      else say('Tray shifted → classic keeps driving at the old coordinates.');
    } else say(stale() === 'board' ? 'Tray moved. The taught points are now stale.' : 'Tray moved.');
  }
  function shiftTray() {
    if (anim || drag) return;
    if (!isTray()) {
      const to = clamp(board.x + (board.x > 7.6 ? -1 : 1) * (.5 + Math.random() * .6), BOARD_MIN, BOARD_MAX);
      anim = {side: true, from: board.x, to, t: 0};
      if (run && !run.moved) { run.moved = true; say(mode === 'skild' ? 'Board moved mid-task → targets updated live.' : 'Board moved → the taught points are now wrong.'); }
      return;
    }
    disturb();
    const sx = pose.x > 0 ? -1 : 1, sy = pose.y > 0 ? -1 : 1, sa = pose.a > 0 ? -1 : 1;
    anim = {from: {...pose}, to: {x: clamp(pose.x + sx * (.07 + Math.random() * .06), -.13, .13), y: clamp(pose.y + sy * (.035 + Math.random() * .035), -.09, .09), a: clamp(pose.a + sa * (.025 + Math.random() * .025), -.06, .06)}, t: 0};
  }

  // ---- tray simulation
  function moveTip(a, g, dt, v) {
    const dx = g[0] - a.tip[0], dy = g[1] - a.tip[1], d = Math.hypot(dx, dy);
    if (d < .0015) { a.tip = [g[0], g[1]]; return true; }
    const s = Math.min(d, v * clamp(d / .12, .22, 1) * dt); a.tip = [a.tip[0] + dx / d * s, a.tip[1] + dy / d * s]; return d - s < .0015;
  }
  function goal(a, st) {
    if (mode === 'skild') return st.k === 'pick' && st.from === 'tray' ? partWorld(tparts[st.part]) : refWorld(st, a.id, pose);
    return prog.hw !== hwId ? distort(st.wp, a.id) : st.wp;
  }
  function next(a) {
    const st = a.steps[a.si];
    if (st && inZone(st) && run.lock === a.id) run.lock = AR[other(a.id)].waiting ? other(a.id) : null;
    if (st && st.set && st.k === 'place') run.flags[st.set] = true;
    a.si++; a.ph = 'start'; a.pt = 0;
  }
  function engage(a) {
    const lp = trL(pose, a.tip[0], a.tip[1]); let bi = -1, bd = 9;
    holes.forEach((h, i) => { if (h.state !== 'open') return; const d = Math.hypot(h.x - lp[0], h.y - lp[1]); if (d < bd) { bd = d; bi = i; } });
    a.tr = bd < .02 ? {kind: 'ok', hole: bi} : {kind: bd < .07 ? 'cross' : 'miss', hole: bi, lp};
    if (a.tr.kind === 'ok') Object.assign(holes[bi], {state: 'driving', by: a.id});
  }
  function seat(a, st) {
    const tr = a.tr, t = +run.t.toFixed(2);
    if (tr.kind === 'ok') { const h = holes[tr.hole]; h.state = 'seated'; rings.push({lx: h.x, ly: h.y, t: 0}); run.screws.push({n: h.n, arm: a.id, ok: true, t}); }
    else {
      const why = tr.kind === 'cross' ? 'cross-threaded' : 'missed';
      xmarks.push({lx: tr.lp[0], ly: tr.lp[1], why, t: 0}); run.missed++; stat.missed = run.missed; run.screws.push({n: st.n, arm: a.id, ok: false, why, t});
      if (run.missed <= 3) say(`Screw #${st.n}: ${why}, driven at the taught coordinates.`); else if (run.missed === 4) say('…more screws missed.');
    }
  }
  function grip(a, st) {
    const p = tparts[st.part], pw = partWorld(p);
    if (p.state !== 'held' && Math.hypot(pw[0] - a.tip[0], pw[1] - a.tip[1]) < .04) { p.state = 'held'; p.by = a.id; a.holding = p.id; }
    else say(`${ARMS[a.id].name}: grasped air · the ${p.d.name.toLowerCase()} isn’t at the taught point.`);
  }
  function release(a, st) {
    const p = tparts[st.part]; if (a.holding !== p.id) return; a.holding = null; p.by = null;
    if (st.to === 'tray') {
      const [lx, ly] = trL(pose, a.tip[0], a.tip[1]); Object.assign(p, {state: 'tray', lx, ly, ok: Math.hypot(lx - p.d.local[0], ly - p.d.local[1]) < .03});
      say(p.ok ? `${p.d.name} ${p.id === 'bus' ? 'placed' : 'installed'}` : `${p.d.name} misplaced: taught point is off the tray.`);
    } else {
      const n = p.d.nest, ok = Math.hypot(a.tip[0] - n[0], a.tip[1] - n[1]) < .05;
      Object.assign(p, ok ? {state: 'nest', wx: n[0], wy: n[1]} : {state: 'off', wx: a.tip[0], wy: a.tip[1]}); if (ok) say('Limit block removed');
    }
  }
  function stepArm(a, dt) {
    const st = a.steps[a.si], spd = HW[hwId].spd, zTo = (zt, r = 14) => { a.z += (zt - a.z) * Math.min(1, dt * r); };
    if (!st) { a.label = 'DONE · HOME'; a.cur = null; moveTip(a, ARMS[a.id].home, dt, 1.6 * spd); zTo(1); return; }
    a.cur = st;
    const coupled = a.ph === 'engage' || a.ph === 'torque' || a.ph === 'seat' || a.ph === 'grip';
    if (mode === 'skild' && (anim || drag || reloc > 0) && !coupled) { a.label = reloc > 0 ? 'RE-LOCALIZING' : 'TRACKING TRAY'; return; }
    if (st.k === 'mark') { run.flags[st.set] = true; next(a); return; }
    if (st.k === 'wait') { if (st.need.every(f => run.flags[f])) next(a); else { a.label = st.need.includes('scrT') ? 'WAIT · OTHER ARM' : 'WAIT · PRE-PHASE'; zTo(1); } return; }
    if (a.ph === 'start') {
      if (inZone(st)) {
        if (run.lock && run.lock !== a.id) { a.waiting = true; a.label = 'WAIT · SHARED ZONE'; moveTip(a, trW(pose, ARMS[a.id].waitX, stepRef(st, a.id).local[1]), dt, 1.4 * spd); zTo(1); return; }
        run.lock = a.id;
      }
      a.waiting = false; a.ph = 'move'; a.pt = 0; a.trace = []; a.tr = null;
      const r = Math.random() * PI * 2, m = .014 + Math.random() * .01;
      a.off = st.k === 'screw' && mode === 'skild' ? [Math.cos(r) * m, Math.sin(r) * m] : [0, 0];
    }
    a.pt += dt;
    const T = goal(a, st), nm = st.part ? PARTS[st.part].name.toUpperCase() : '';
    if (a.ph === 'move') {
      a.label = st.k === 'screw' ? `APPROACH · #${st.n}` : st.k === 'home' ? 'HOME' : st.k === 'pick' ? `PICK · ${nm}` : `PLACE · ${nm}`; zTo(st.k === 'screw' ? .75 : 1);
      if (moveTip(a, [T[0] + a.off[0], T[1] + a.off[1]], dt, 1.7 * spd)) { if (st.k === 'home') { next(a); return; } a.ph = st.k === 'screw' ? 'align' : 'down'; a.pt = 0; }
    } else if (a.ph === 'align') {
      a.label = `ALIGN · #${st.n}`; zTo(.5);
      if (mode === 'skild') {
        a.off = a.off.map(v => v * Math.max(0, 1 - dt * 7)); moveTip(a, [T[0] + a.off[0], T[1] + a.off[1]], dt, 1.2);
        if (a.pt > .26 / spd && Math.hypot(a.off[0], a.off[1]) < .0015) { a.off = [0, 0]; a.tip = [T[0], T[1]]; a.ph = 'engage'; a.pt = 0; }
      } else if (a.pt > .1) { a.ph = 'engage'; a.pt = 0; }
    } else if (a.ph === 'engage') {
      a.label = `ENGAGE · #${st.n}`; zTo(0, 18); if (mode === 'skild') a.tip = [T[0], T[1]];
      if (a.pt > .16 / spd) { engage(a); a.ph = 'torque'; a.pt = 0; }
    } else if (a.ph === 'torque') {
      const u = a.pt / (.62 / spd), kind = a.tr.kind;
      a.label = kind === 'ok' ? `TORQUE · #${st.n}` : kind === 'cross' ? 'CROSS-THREAD' : 'NO HOLE';
      if (kind === 'ok') { const h = holes[a.tr.hole]; a.tip = trW(pose, h.x, h.y); }
      a.trace.push([Math.min(u, 1), torqueAt(kind, u)]);
      if (u >= (kind === 'ok' ? 1 : .55)) { seat(a, st); a.ph = 'seat'; a.pt = 0; }
    } else if (a.ph === 'seat') {
      if (a.tr.kind === 'ok') { const h = holes[a.tr.hole]; a.tip = trW(pose, h.x, h.y); }
      a.label = a.tr.kind === 'ok' ? `SEATED · #${st.n}` : 'MISSED';
      if (a.pt > .14) { a.ph = 'up'; a.pt = 0; }
    } else if (a.ph === 'down') {
      a.label = st.k === 'pick' ? `PICK · ${nm}` : `PLACE · ${nm}`; zTo(0, 18); if (a.pt > .14 / spd) { a.ph = 'grip'; a.pt = 0; }
    } else if (a.ph === 'grip') {
      a.label = st.k === 'pick' ? 'GRIP' : 'RELEASE'; if (a.pt > .2) { st.k === 'pick' ? grip(a, st) : release(a, st); a.ph = 'up'; a.pt = 0; }
    } else if (a.ph === 'up') { zTo(1, 16); if (a.pt > .12 / spd) next(a); }
  }
  function updTray(dt) {
    reloc = Math.max(0, reloc - dt); relocFlash = Math.max(0, relocFlash - dt);
    xmarks.forEach(x => x.t += dt); rings.forEach(r => r.t += dt); rings = rings.filter(r => r.t < .6);
    if (run && run.tray) {
      run.t += dt; stat.t = run.t;
      stepArm(AR.T, dt); stepArm(AR.B, dt);
      if (AR.T.si >= AR.T.steps.length && AR.B.si >= AR.B.steps.length && ['T', 'B'].every(a => Math.hypot(AR[a].tip[0] - ARMS[a].home[0], AR[a].tip[1] - ARMS[a].home[1]) < .01)) endTrayRun();
    } else for (const a of ['T', 'B']) { const s = AR[a]; moveTip(s, ARMS[a].home, dt, 1.4); s.z += (1 - s.z) * Math.min(1, dt * 8); s.waiting = false; s.label = pending > 0 ? 'STARTING' : 'READY'; }
    for (const p of Object.values(tparts)) if (p.state === 'held' && p.by) { p.wx = AR[p.by].tip[0]; p.wy = AR[p.by].tip[1]; }
  }
  // ---- side simulation (4 modules)
  function updSide(dt) {
    sparks.forEach(s => s.t += dt); sparks = sparks.filter(s => s.t < .5);
    const hw = HW[hwId], J = JOBS.modules;
    if (run && !run.tray) {
      run.t += dt;
      const si = run.si, st = J.steps[si], s0 = motionStep(J.steps, si);
      let qT, baseT = R.base, arrived = true;
      if (mode === 'skild') {
        if (hw.mobile && s0.k !== 'home') baseT = clamp(target(J, s0, board.x, R.base, hw)[0] - 1.1, .8, 11);
        const T = target(J, s0, board.x, R.base, hw), d = Math.hypot(T[0] - R.tip[0], T[1] - R.tip[1]), sp = 6 * dt;
        if (d > sp) { R.tip = [R.tip[0] + (T[0] - R.tip[0]) / d * sp, R.tip[1] + (T[1] - R.tip[1]) / d * sp]; arrived = false; } else R.tip = T;
        qT = ik(hw, shoulder(hw, R.base), R.tip);
        R.q = R.q.map((a, i) => a + wrapA(qT[i] - a) * Math.min(1, dt * 14));
      } else {
        const ps = prog.steps[Math.min(si, prog.steps.length - 1)]; qT = ps.q; if (hw.mobile && HW[prog.hw].mobile) baseT = ps.base;
        R.q = R.q.map((a, i) => a + clamp(wrapA(qT[i] - a), -2.6 * dt, 2.6 * dt));
      }
      R.base += clamp(baseT - R.base, -3.6 * dt, 3.6 * dt);
      const err = Math.max(...R.q.map((a, i) => Math.abs(wrapA(qT[i] - a))));
      if (mode === 'classic') R.tip = fk(hw, shoulder(hw, R.base), R.q).T;
      if (arrived && err < (mode === 'skild' ? .03 : .004) && Math.abs(baseT - R.base) < .005) {
        run.dwell += dt;
        if (run.dwell >= (st.k === 'grip' || st.k === 'release' ? .25 : .04)) {
          const tip = fk(hw, shoulder(hw, R.base), R.q).T, m = sparts[st.p];
          if (st.k === 'grip') {
            if ((m.state === 'tray' || m.state === 'in') && Math.hypot(tip[0] - m.x, tip[1] - (m.y + m.d.h)) < .22) m.state = 'held';
            else { run.misses++; say(`Grasped air: module ${st.p + 1} isn’t where the joints go.`); }
          }
          if (st.k === 'release' && m.state === 'held') {
            const [tx] = target(J, {k: 'at', p: st.p, at: st.at}, board.x, R.base, hw), ty = st.at === 'src' ? TRAY_TOP : m.d.dy;
            if (Math.abs(m.x - tx) < .12 && Math.abs(m.y - ty) < .2) { m.state = st.at === 'src' ? 'tray' : 'in'; say(`Module ${st.p + 1} placed`); sparks.push({x: m.x, y: m.y + m.d.h, t: 0}); }
            else { m.state = 'loose'; m.rot = (Math.random() - .5) * 1.2; m.vy = 0; run.misses++; say(`Module ${st.p + 1} missed.`); }
          }
          run.si++; run.dwell = 0;
          if (run.si >= J.steps.length) endSideRun();
        }
      }
    }
    const tipNow = fk(hw, shoulder(hw, R.base), R.q).T;
    const surface = x => Math.abs(x - board.x) < 1 ? BOARD_TOP : x > 1.7 && x < 3.65 ? TRAY_TOP : BENCH;
    for (const m of sparts) {
      if (m.state === 'held') { m.x = tipNow[0]; m.y = tipNow[1] - m.d.h; }
      else if (m.state === 'in') { m.x = board.x + m.d.dx; m.y = m.d.dy; }
      else if (m.state === 'loose') { const sf = surface(m.x); if (m.y > sf) { m.vy -= 12 * dt; m.y = Math.max(sf, m.y + m.vy * dt); } else m.y = sf; }
    }
  }

  // =====================================================================================================
  // 3D scene
  const S = stage(k, {bg: '#1c1f24', fov: 36, near: .01, far: 60});
  const {scene} = S;
  const L = lights(scene, {hemi: ['#f4f6f8', '#3a3631', 1.05], sun: ['#ffffff', 1.9], at: [.9, 2.6, 1.3], box: 1.3});
  const fill = new THREE.DirectionalLight('#dfe8ff', .55); fill.position.set(-1.5, 1.2, 1.8); scene.add(fill);
  factoryRoom(scene); workbench(scene, {w: 1.8, d: 1.0});
  const cell = new THREE.Group(); scene.add(cell);
  // trays (Blackwell GTC 16 screws) and parts
  const TR = {gb300: gb300Tray(HOLES.gb300, {label: 'NVIDIA GB300 COMPUTE TRAY'}), blackwell: gb300Tray(HOLES.blackwell, {label: 'BLACKWELL TRAY · GTC'})};
  for (const t of Object.values(TR)) cell.add(t.group);
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(.32, .07), new THREE.MeshBasicMaterial({color: '#ff7e00', transparent: true, opacity: .28, side: THREE.DoubleSide, depthWrite: false}));
  sweep.rotation.y = PI / 2; sweep.visible = false;
  const bus3 = busbar(), blk3 = limitBlock(); cell.add(bus3, blk3);
  const fixture = std('#8f969d', {r: .4, m: .6});
  const nestB = box3(.06, .006, .25, fixture, PARTS.bus.nest[0] * U, .003, PARTS.bus.nest[1] * U, cell), nestK = box3(.08, .006, .06, fixture, PARTS.blk.nest[0] * U, .003, PARTS.blk.nest[1] * U, cell);
  const nestLab = [nestB, nestK];
  const missPool = Array.from({length: 18}, () => { const s = screwMesh(); s.visible = false; cell.add(s); return s; });
  const ghost = new THREE.Group(); cell.add(ghost); let ghostKey = '';
  // side job: feeder, board with 4 slots, 4 modules
  const side = new THREE.Group(); cell.add(side);
  box3(sideX(3.65) - sideX(1.7), .012, .09, std('#5d646b', {r: .6, m: .3}), (sideX(1.7) + sideX(3.65)) / 2, .006, 0, side);
  const boardG = new THREE.Group(); side.add(boardG);
  const pcbM = std('#4c6656', {r: .6}); box3(.2, .016, .1, pcbM, 0, .008, 0, boardG);
  const slotM = std('#15181b', {r: .7}); JOBS.modules.parts.forEach(d => box3(d.w * SS + .006, .004, .05, slotM, d.dx * SS, .017, 0, boardG));
  const modM = std('#9aa3ab', {r: .35, m: .6}), goldM = std('#d6b24a', {r: .3, m: .8});
  const mods3 = JOBS.modules.parts.map(d => { const g = new THREE.Group(); box3(d.w * SS, d.h * SS, .04, modM, 0, d.h * SS / 2, 0, g); box3(d.w * SS * .9, .004, .041, goldM, 0, .002, 0, g, false); side.add(g); return g; });
  // arms: 2× real UR5e (cobot + mobile), 2× ABB-style (procedural); a screwdriver tool on each
  const tools = {ur: [screwTool(), screwTool()], abb: [screwTool(), screwTool()]};
  const abb = [abbArm(), abbArm()]; abb.forEach((a, i) => { a.mount.add(tools.abb[i].group); cell.add(a.group); });
  const abbPed = abb.map(() => box3(.34, .78, .34, std('#34383d', {r: .6, m: .3}), 0, 0, 0, cell));
  const mirs = [mirBase(.9, .12), mirBase(.9, .12)]; mirs.forEach(m => cell.add(m));
  const urPlates = [0, 1].map(() => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .01, 28), std('#2a2d31', {r: .5, m: .4})); p.receiveShadow = true; cell.add(p); return p; });
  const urs = [null, null], urQ = [UR_READY.slice(), UR_READY.slice()], urFollow = [null, null];
  let urErr = '';
  Promise.all([0, 1].map(() => MJ.spawn('ur5e'))).then(bots => {
    if (dead) { bots.forEach(b => b.dispose()); return; }
    bots.forEach((b, i) => { styleUR(b); urs[i] = b; cell.add(b.group); urFollow[i] = follower(b, {site: 'attachment_site'}); urFollow[i].add(tools.ur[i].group); setUR(b, urQ[i]); urFollow[i].sync(); });
  }).catch(e => { urErr = 'Arm model failed to load'; console.warn(e); });

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const tmp = new THREE.Vector3(), tmpP = {x: 0, y: 0, ok: true};
  const toScreen = (x, y, z) => S.project(tmp.set(x, y, z), {x: 0, y: 0, ok: true});
  const trayWorld3 = (lx, ly, y = HY) => { const [x, z] = trW(pose, lx, ly); return V(x * U, y, z * U); };
  function surfaceFor(st) {             // height of what the tool touches for this step (tray job)
    if (!st) return HY + .11;
    if (st.k === 'screw') return HY + .0112;
    if (st.k === 'pick' || st.k === 'place') {
      const p = st.part, onTray = (st.k === 'pick' && st.from === 'tray') || (st.k === 'place' && st.to === 'tray');
      return (onTray ? (p === 'blk' ? .016 : .008) : NEST_Y) + PART_H[p];
    }
    return HY + .11;
  }
  function tipOf(a) {
    const st = a.cur; let y = surfaceFor(st) + a.z * .11;
    if (st && st.k === 'screw' && a.tr && a.tr.kind === 'ok' && (a.ph === 'torque' || a.ph === 'seat')) { const u = a.ph === 'seat' ? 1 : clamp(a.pt / (.62 / HW[hwId].spd), 0, 1); y = HY + .0032 + (1 - u) * .008 + a.z * .11; }
    return V(a.tip[0] * U, y, a.tip[1] * U);
  }
  // put arm i's tool tip at `tip` (world) with arm root at `base`; returns the reached tip (UR: from the MuJoCo site)
  const reached = [V(0, 0, 0), V(0, 0, 0)];
  function driveArm(i, base, tip, drop, show) {
    const isAbb = hwId === 'abb', ur = urs[i];
    abb[i].group.visible = isAbb && show; abbPed[i].visible = isAbb && show;
    mirs[i].visible = hwId === 'mir' && show; urPlates[i].visible = hwId === 'ur' && show;
    if (ur) ur.group.visible = !isAbb && show;
    if (!show) return;
    if (isAbb) {
      const g = abb[i].group; g.position.set(base[0], base[1], base[2]); g.updateMatrixWorld(true);
      abb[i].solve(g.worldToLocal(tmp.copy(tip)), TOOL_LEN); g.position.y -= drop;
      abbPed[i].position.set(base[0], (base[1] - .9) / 2 - drop / 2, base[2]); abbPed[i].scale.y = Math.max(.01, (base[1] + .9 - drop) / .78);
      return;
    }
    if (hwId === 'mir') { mirs[i].position.set(base[0], -.9 - drop, base[2] + (base[2] < 0 ? -.12 : .12)); mirs[i].rotation.y = base[2] < 0 ? 0 : PI; }
    else urPlates[i].position.set(base[0], .005 - drop, base[2]);
    if (!ur) return;
    ur.group.position.set(base[0], base[1] + .01, base[2]); ur.group.rotation.y = base[2] < 0 ? -PI / 2 : PI / 2; ur.group.updateMatrixWorld(true);
    const q = urSolve(ur, tip, TOOL_LEN, urQ[i]); if (q) urQ[i] = q;
    setUR(ur, urQ[i]); urFollow[i].sync();
    ur.group.position.y -= drop; ur.group.updateMatrixWorld(true);
    // reached tip = site + TOOL_LEN along the site z axis (for the "bit visits the hole" check)
    const d = ur.data, R0 = reached[i]; R0.set(d.site_xpos[0] + d.site_xmat[2] * TOOL_LEN, d.site_xpos[1] + d.site_xmat[5] * TOOL_LEN, d.site_xpos[2] + d.site_xmat[8] * TOOL_LEN);
    ur.group.children[0].localToWorld(R0);
  }
  const toolOf = i => (hwId === 'abb' ? tools.abb : tools.ur)[i];
  function rebuildGhost() {
    const st = stale(), key = mode === 'classic' && st && JOBS[prog.job].view === 'tray' && isTray() ? `${prog.hw}|${prog.job}|${prog.pose.x},${prog.pose.y},${prog.pose.a}|${hwId}` : '';
    if (key === ghostKey) return; ghostKey = key;
    for (const c of [...ghost.children]) { ghost.remove(c); disposeTree(c); }
    if (!key) return;
    const pts = [[-1, -.5], [1, -.5], [1, .5], [-1, .5]].map(([x, y]) => { const [wx, wz] = trW(prog.pose, x, y); return V(wx * U, .037, wz * U); });
    const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({color: '#b5b9ba', dashSize: .012, gapSize: .008})); loop.computeLineDistances(); ghost.add(loop);
    const seg = [];
    for (const a of ['T', 'B']) for (const s of prog.arms[a]) if (s.k === 'screw') { const p = prog.hw !== hwId ? distort(s.wp, a) : s.wp, x = p[0] * U, z = p[1] * U; seg.push(V(x - .007, .038, z), V(x + .007, .038, z), V(x, .038, z - .007), V(x, .038, z + .007)); }
    ghost.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), new THREE.LineBasicMaterial({color: '#d0d4d6'})));
  }
  function upd3D(dt, t) {
    const tray = isTray(), drop = swap * swap * .35;
    for (const [id, T3] of Object.entries(TR)) T3.group.visible = tray && jobId === id;
    bus3.visible = blk3.visible = tray; nestLab.forEach(n => n.visible = tray); side.visible = !tray;
    rebuildGhost(); ghost.visible = tray;
    if (tray) {
      const T3 = TR[jobId]; T3.group.position.set(pose.x * U, 0, pose.y * U); T3.group.rotation.y = -pose.a;
      if (sweep.parent !== T3.group) T3.group.add(sweep);
      sweep.visible = reloc > 0; if (reloc > 0) sweep.position.set((-1 + 2 * (1 - reloc / .5)) * U, .06, 0);
      const waitA = run && run.tray && ['T', 'B'].some(a => AR[a].waiting);
      T3.zone.scale.set(2 * ZONE * U, U * .98, 1); T3.zone.material.opacity = waitA ? .16 + .08 * Math.sin(t * 9) : .05;
      // screws in the holes: sink while torquing, flush when seated
      holes.forEach((h, i) => {
        const s = T3.holes[i].screw; s.visible = h.state !== 'open';
        if (h.state === 'driving') { const a = AR[h.by], u = a && a.ph === 'torque' ? clamp(a.pt / (.62 / HW[hwId].spd), 0, 1) : 0; s.position.y = HY + (1 - u) * .008; s.rotation.y = -a.spin; }
        else if (h.state === 'seated') s.position.y = HY;
      });
      missPool.forEach((s, i) => {
        const m = xmarks[i]; s.visible = !!m; if (!m) return;
        const [x, z] = trW(pose, m.lx, m.ly); s.position.set(x * U, .02, z * U); s.rotation.set(m.why === 'missed' ? PI / 2 : .45, 0, m.why === 'missed' ? .6 : .2);
      });
      // parts
      for (const [id, obj] of [['bus', bus3], ['blk', blk3]]) {
        const p = tparts[id];
        if (p.state === 'held') { const tp = tipOf(AR[p.by]); obj.position.set(tp.x, tp.y - PART_H[id], tp.z); obj.rotation.set(0, -pose.a, 0); }
        else if (p.state === 'tray') { const [x, z] = trW(pose, p.lx, p.ly); obj.position.set(x * U, id === 'blk' && tparts.bus.state === 'tray' ? .016 : .008, z * U); obj.rotation.set(0, -pose.a, 0); }
        else if (p.state === 'off') { obj.position.set(p.wx * U, 0, p.wy * U); obj.rotation.set(0, .5, .12); }
        else { obj.position.set(p.wx * U, NEST_Y, p.wy * U); obj.rotation.set(0, 0, 0); }
      }
      ['T', 'B'].forEach((a, i) => {
        const st = AR[a], tl = toolOf(i);
        driveArm(i, RIG[hwId][a], tipOf(st), drop, true);
        if (st.ph === 'torque') st.spin += dt * 38; tl.spin(st.spin); tl.bit.visible = true; tl.grip(st.holding ? .25 : 1, 0);
        tl.carried.visible = !!(run && run.tray && st.cur && st.cur.k === 'screw' && (['move', 'align', 'engage'].includes(st.ph) || (st.ph === 'torque' && st.tr && st.tr.kind !== 'ok')));
        const o = toolOf(1 - i); void o;
      });
      [...tools.ur, ...tools.abb].forEach(tl => { if (!tl.group.parent?.visible) tl.carried.visible = tl.carried.visible && true; });
    } else {
      const hw = HW[hwId], tip = fk(hw, shoulder(hw, R.base), R.q).T, held = sparts.some(m => m.state === 'held');
      boardG.position.set(sideX(board.x), 0, 0);
      sparts.forEach((m, i) => { const g = mods3[i]; g.position.set(sideX(m.x), sideY(m.y), 0); g.rotation.set(0, 0, m.state === 'loose' ? -m.rot : 0); });
      const base = hwId === 'abb' ? [sideX(4.6), -.12, -.64] : hwId === 'mir' ? [sideX(R.base), 0, -.64] : [sideX(4.6), 0, -.3];
      driveArm(0, base, V(sideX(tip[0]), sideY(tip[1]), 0), drop, true); driveArm(1, base, V(0, 0, 0), 0, false);
      const tl = toolOf(0); tl.bit.visible = false; tl.carried.visible = false; tl.grip(held ? .55 : 1, 1); tl.spin(0);
    }
  }

  // ---------- camera
  function setCam(i, now = false) {
    camI = i; const c = isTray() ? CAMS[i][1] : {yaw: .35, pitch: .62, dist: 1.25};
    camGoal = {...c}; if (now) Object.assign(S.orbit, c);
    camBtn && (camBtn.textContent = 'Camera: ' + (isTray() ? CAMS[i][0] : 'Side'));
  }
  Object.assign(S.orbit, CAMS[0][1], {minD: .35, maxD: 3.2, maxP: 1.52});

  // ---------- layout (3D view between the left panel and the HMI; nothing critical in the bottom-right 340×230)
  const lay = () => { const rc = clamp(k.w * .2, 200, 240), hx = k.w - 16 - rc; return {rc, hx, x0: 262, x1: hx - 10, y0: 44, y1: k.h - 124, bx0: 262, bx1: Math.max(262 + 240, k.w - 356), by0: k.h - 116}; };
  const inRect = (p, x, y, w, h) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;

  k.onDown(p => {
    if (p.x < 250) { const i = Math.floor((p.y - 64) / 70); if (i >= 0 && i < 3 && (p.y - 64) % 70 < 62) setHW(IDS[i]); return; }
    const l = lay();
    if (p.y < 40 || inRect(p, l.hx, 44, l.rc, k.h - 290) || inRect(p, l.bx0, l.by0, l.bx1 - l.bx0, 110)) return;
    if (isTray()) {
      const w = S.rayPlane(p, HY);
      if (w && !anim) {
        const sx = w.x / U, sy = w.z / U, lp = trL(pose, sx, sy);
        if (Math.abs(lp[0]) < 1.03 && Math.abs(lp[1]) < .53) {
          drag = {tray: true, off: [sx - pose.x, sy - pose.y], moved: false}; disturb();
          if (run && run.tray) say(mode === 'skild' ? 'Tray grabbed → Skild Brain tracks it.' : 'Tray grabbed → the taught points will be wrong.');
          return;
        }
      }
    } else {
      const w = S.rayPlane(p, .016);
      if (w && Math.abs(w.x - sideX(board.x)) < .13 && Math.abs(w.z) < .09) {
        drag = {off: w.x / SS + 6 - board.x};
        if (run && !run.moved) { run.moved = true; say(mode === 'skild' ? 'Board moved mid-task → targets updated live.' : 'Board moved → the taught points are now wrong.'); }
        return;
      }
    }
    orbitDrag = {x: p.x, y: p.y}; camGoal = null;
  });
  k.onMove(p => {
    if (orbitDrag) { S.drag(p.x - orbitDrag.x, p.y - orbitDrag.y); orbitDrag = {x: p.x, y: p.y}; return; }
    if (!drag) return;
    if (drag.tray) { const w = S.rayPlane(p, HY); if (!w) return; pose.x = clamp(w.x / U - drag.off[0], -.13, .13); pose.y = clamp(w.z / U - drag.off[1], -.09, .09); drag.moved = true; return; }
    const w = S.rayPlane(p, .016); if (w) board.x = clamp(w.x / SS + 6 - drag.off, BOARD_MIN, BOARD_MAX);
  });
  k.onUp(() => { orbitDrag = null; const d = drag; drag = null; if (d && d.tray && d.moved) trayMoved(); });
  k.onKey(e => { if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return; const i = '123'.indexOf(e.key); if (i >= 0) setHW(IDS[i]); if (e.key === 's' || e.key === 'S') shiftTray(); if (e.key === 'c' || e.key === 'C') setCam((camI + 1) % CAMS.length); });

  k.frame((dt, t) => {
    swap = Math.max(0, swap - dt * 2.2); flash = Math.max(0, flash - dt * 1.3);
    if (pending > 0) { pending -= dt; if (pending <= 0) startRun(); }
    if (anim) {
      anim.t = Math.min(1, anim.t + dt / .38); const e = anim.t * anim.t * (3 - 2 * anim.t);
      if (anim.side) board.x = lerp(anim.from, anim.to, e); else for (const key of ['x', 'y', 'a']) pose[key] = lerp(anim.from[key], anim.to[key], e);
      if (anim.t >= 1) { const sd = anim.side; anim = null; if (!sd) trayMoved(); }
    }
    if (isTray()) updTray(dt); else updSide(dt);
    upd3D(dt, t);
    if (camGoal) { const o = S.orbit, f = Math.min(1, dt * 5); o.yaw = lerp(o.yaw, camGoal.yaw, f); o.pitch = lerp(o.pitch, camGoal.pitch, f); o.dist = lerp(o.dist, camGoal.dist, f); }
    const tgt = isTray() ? [pose.x * U * .5, .03, pose.y * U * .5] : [.02, .05, -.1];
    S.orbit.target.set(...tgt);
    const l = lay(); S.render((l.x0 + l.x1) / 2, (l.y0 + l.y1) / 2);
    draw(t);
  });

  // =====================================================================================================
  // 2D overlay: panels read the brand palette B (dark mode flips it); the set keeps its real colours
  function fit(s, w, size = 12, mono = false, weight = 500) { ctx.font = `${weight} ${size}px ${mono ? '"Geist Mono", ui-monospace, monospace' : 'Geist, system-ui, sans-serif'}`; if (ctx.measureText(s).width <= w) return s; while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
  const fitL = (s, w) => fit(String(s).toUpperCase(), w, 10, true);
  const box = (x, y, w, h, r, fill, stroke, lw = 1) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } };
  const glass = (x, y, w, h, r = 12) => { ctx.save(); ctx.globalAlpha = .9; box(x, y, w, h, r, B.white); ctx.restore(); box(x, y, w, h, r, null, B.warm2, 1); };
  const pill = (txt, x, y, bg, fg, size = 9) => { ctx.font = `600 ${size}px "Geist Mono", ui-monospace, monospace`; const tw = ctx.measureText(txt).width + 10; box(x - tw / 2, y - 7, tw, 14, 7, bg); ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(txt, x, y + .5); ctx.textBaseline = 'alphabetic'; };
  function drawTrayHUD(t) {
    const T3 = TR[jobId], cur = {};
    if (run && run.tray) for (const a of ['T', 'B']) { const st = AR[a].cur; if (st && st.k === 'screw') cur[st.n] = AR[a]; }
    // hole numbers (vision overlay), seated = orange
    holes.forEach((h, i) => {
      const w = T3.group.localToWorld(tmp.copy(T3.holes[i].pos)), s = S.project(w, tmpP); if (!s.ok) return;
      const a = cur[h.n], seated = h.state === 'seated', dy = h.y < 0 ? -13 : 13;
      if ((a && mode === 'skild' && (a.ph === 'move' || a.ph === 'align')) || h.state === 'driving') { ctx.strokeStyle = B.orange; ctx.lineWidth = 1.5; ctx.setLineDash(h.state === 'driving' ? [] : [3, 3]); ctx.beginPath(); ctx.arc(s.x, s.y, 8 + Math.sin(t * 9) * 1.2, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
      pill(String(h.n), s.x, s.y + dy, seated ? B.orange : a ? '#121212' : 'rgba(18,18,18,.62)', seated ? '#121212' : '#FFFFFF');
      if (relocFlash > 0) { ctx.strokeStyle = `rgba(255,126,0,${Math.min(1, relocFlash) * .9})`; ctx.lineWidth = 1.5; const b = 9, e = 4; ctx.beginPath(); for (const [dx, dy2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { ctx.moveTo(s.x + dx * b, s.y + dy2 * (b - e)); ctx.lineTo(s.x + dx * b, s.y + dy2 * b); ctx.lineTo(s.x + dx * (b - e), s.y + dy2 * b); } ctx.stroke(); }
    });
    for (const g of rings) { const s = S.project(trayWorld3(g.lx, g.ly), tmpP); if (!s.ok) continue; ctx.strokeStyle = `rgba(255,126,0,${1 - g.t / .6})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x, s.y, 8 + g.t * 30, 0, 7); ctx.stroke(); }
    for (const m of xmarks) {
      const s = S.project(trayWorld3(m.lx, m.ly), tmpP); if (!s.ok) continue; const q = 6;
      ctx.strokeStyle = B.cool2; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(s.x - q, s.y - q); ctx.lineTo(s.x + q, s.y + q); ctx.moveTo(s.x + q, s.y - q); ctx.lineTo(s.x - q, s.y + q); ctx.stroke();
      if (m.t < 3) { ctx.globalAlpha = clamp(3 - m.t, 0, 1); pill(m.why.toUpperCase(), s.x, s.y - (m.ly < 0 ? 26 : -26), B.cool2, B.white); ctx.globalAlpha = 1; }
    }
    // alignment reticle (brain)
    for (const a of ['T', 'B']) { const st = AR[a]; if (run && run.tray && mode === 'skild' && st.cur && st.cur.k === 'screw' && st.ph === 'align') { const s = S.project(trayWorld3(st.cur.lp[0], st.cur.lp[1]), tmpP), q = 12; ctx.strokeStyle = B.orange; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(s.x - q, s.y); ctx.lineTo(s.x - 4, s.y); ctx.moveTo(s.x + 4, s.y); ctx.lineTo(s.x + q, s.y); ctx.moveTo(s.x, s.y - q); ctx.lineTo(s.x, s.y - 4); ctx.moveTo(s.x, s.y + 4); ctx.lineTo(s.x, s.y + q); ctx.stroke(); } }
    const waitA = run && run.tray && ['T', 'B'].find(a => AR[a].waiting), zl = S.project(trayWorld3(0, -.5, .05), tmpP);
    pill(waitA ? `ZONE LOCK · ${waitA === 'T' ? 'ARM A' : 'ARM B'} WAITS` : 'SHARED ZONE', zl.x, zl.y - 12, waitA ? B.orange : 'rgba(18,18,18,.55)', waitA ? '#121212' : '#FFFFFF');
    // arm tags
    ['T', 'B'].forEach((a, i) => { const bs = RIG[hwId][a], s = S.project(tmp.set(bs[0], bs[1] + .02, bs[2]), tmpP); if (s.ok) pill(a === 'T' ? 'ARM A' : 'ARM B', s.x, s.y + 16, mode === 'skild' ? B.orange : B.cool1, '#121212'); void i; });
    for (const [id, n] of [['bus', 'BUSBAR FEED'], ['blk', 'BLOCK NEST']]) { const s = S.project(tmp.set(PARTS[id].nest[0] * U, .01, PARTS[id].nest[1] * U + (id === 'bus' ? -.15 : .06)), tmpP); if (s.ok) pill(n, s.x, s.y, 'rgba(18,18,18,.55)', '#FFFFFF', 8); }
  }
  function drawSideHUD() {
    const s = S.project(tmp.set(sideX(board.x), .02, .07), tmpP);
    if (s.ok) pill(drag ? 'BOARD · DRAGGING' : 'BOARD · ⇔ DRAG ME', s.x, s.y + 16, drag ? B.orange : 'rgba(18,18,18,.6)', drag ? '#121212' : '#FFFFFF');
    const f = S.project(tmp.set((sideX(1.7) + sideX(3.65)) / 2, .015, .06), tmpP); if (f.ok) pill('FEEDER', f.x, f.y + 14, 'rgba(18,18,18,.6)', '#FFFFFF');
    for (const sp of sparks) { const q = S.project(tmp.set(sideX(sp.x), sideY(sp.y), 0), tmpP); ctx.strokeStyle = `rgba(255,126,0,${1 - sp.t / .5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(q.x, q.y, 4 + sp.t * 24, 0, 7); ctx.stroke(); }
  }
  function drawSceneHeader(l) {
    const w = Math.min(460, l.x1 - l.x0 - 12), x = l.x0 + 6, y = l.y0 + 4;
    glass(x, y, w, drag || !run ? 64 : 48, 10);
    k.label(fitL(`Workcell · ${isTray() ? job().tag : job().name} · 3D · simulated`, w - 20), x + 12, y + 18);
    k.label(fitL(mode === 'skild' ? (isTray() ? 'Skild Brain · 2 arms · perceives the tray, re-localizes holes' : 'Skild Brain · adapts live') : `Classic · replays taught ${isTray() ? 'coordinates' : 'joint angles'} (${HW[prog.hw].tag} · ${JOBS[prog.job].short})`, w - 20), x + 12, y + 33, {color: mode === 'skild' ? B.orange : B.cool2});
    if (drag) k.label(isTray() ? 'Tray · dragging' : 'Board · dragging', x + 12, y + 50, {color: B.orange});
    else if (!run) k.label(fitL(isTray() ? '⇔ drag the tray · Shift tray (S) · drag empty space to orbit' : '⇔ drag the board · drag empty space to orbit', w - 20), x + 12, y + 50, {color: B.cool2});
    const hw = HW[hwId];
    const model = hwId === 'abb' ? 'Procedural ABB-style arm' : `Partner cobot (Universal Robots UR5e) · MuJoCo Menagerie${hwId === 'mir' ? ' · on a MiR-style base' : ''}`;
    k.label(fitL(`${model} · analytic IK · stylized tray`, l.x1 - l.x0 - 12), l.x0 + 8, l.y1 - 6, {color: B.cool1, size: 9});
    if ((hwId !== 'abb') && !urs[0]) { glass(l.x0 + 6, l.y1 - 44, 300, 26, 8); k.text(urErr || `Loading ${hw.tag} partner cobot (MuJoCo Menagerie)…`, l.x0 + 18, l.y1 - 26, {size: 12, weight: 600}); }
    const st = stale();
    if (st && !isTray()) {
      const bw = Math.min(262, l.x1 - l.x0 - 28), bx = l.x1 - bw - 6, by = l.y0 + 4;
      box(bx, by, bw, 64, 10, B.black); ctx.fillStyle = B.orange; ctx.fillRect(bx, by + 10, 3, 44);
      k.text(st === 'hw' ? 'Reprogramming required' : st === 'job' ? 'New task: reprogram' : 'Taught points are stale', bx + 16, by + 26, {size: 15, weight: 700, color: B.white});
      k.label(fitL(st === 'hw' ? `program was taught on ${HW[prog.hw].tag}` : st === 'job' ? `program was taught for ${JOBS[prog.job].short}` : `board was at ${prog.bx.toFixed(1)}, now ${board.x.toFixed(1)}`, bw - 24), bx + 16, by + 46, {color: B.cool1});
    }
    const ry = l.y0 + (drag || !run ? 74 : 58);
    if (run) { glass(x, ry, 90, 24, 8); k.text(`${run.t.toFixed(1)} s`, x + 12, ry + 17, {size: 13, mono: true, weight: 600}); }
    else if (lastResult) { const ok = lastResult.ok; box(x, ry, Math.min(340, w), 26, 13, ok ? B.orange : B.black); k.text(fit(ok ? `✓ ${job().short} · ${lastResult.t} s${lastResult.mode === 'skild' ? ' · Skild Brain' : ''}` : `✗ ${lastResult.txt}`, Math.min(340, w) - 24), x + 12, ry + 17, {size: 12, weight: 700, color: ok ? '#121212' : B.white}); }
    if (completed) { const cw = 280; box(l.x1 - cw - 6, l.y1 - 40, cw, 28, 14, B.orange); k.text('✓ Same brain · 3 robots · 0 reprograms', l.x1 - cw / 2 - 6, l.y1 - 21, {align: 'center', size: 12, weight: 700, color: '#121212'}); }
    if (flash) { ctx.fillStyle = `rgba(255,126,0,${flash * .08})`; ctx.fillRect(l.x0, l.y0, l.x1 - l.x0, l.y1 - l.y0); }
  }
  function drawHMI(l) {
    const x = l.hx, w = l.rc, y0 = 44, h = Math.max(220, k.h - 240 - y0 - 8), N = holes.length, seated = holes.filter(q => q.state === 'seated').length;
    box(x, y0, w, h, 12, B.warm1, B.warm2, 1);
    let y = y0 + 10; const tw = (w - 26) / 2, th = 34;
    const tiles = isTray() ? [['Cycle time', `${stat.t.toFixed(1)} s`, !!run], ['Screws', `${seated}/${N}`, seated === N && N > 0], ['Re-localized', String(stat.relocs), stat.relocs > 0 && mode === 'skild'], ['Missed · classic', String(stat.missed), false]]
      : [['Cycle time', `${run ? run.t.toFixed(1) : '0.0'} s`, !!run], ['Modules', `${sparts.filter(m => m.state === 'in').length}/4`, sparts.every(m => m.state === 'in')], ['Board x', board.x.toFixed(2), false], ['Misses', String(run ? run.misses : 0), false]];
    tiles.forEach(([lb, val, hi], i) => {
      const tx = x + 9 + (i % 2) * (tw + 8), ty = y + Math.floor(i / 2) * (th + 6);
      box(tx, ty, tw, th, 7, B.white, B.warm2, 1);
      k.label(fitL(lb, tw - 12), tx + 7, ty + 12, {size: 8});
      k.text(val, tx + 7, ty + 29, {size: 15, mono: true, weight: 600, color: hi ? B.orange : i === 3 && stat.missed && isTray() ? B.cool2 : B.black});
    });
    y += 2 * th + 6 + 16;
    const best = bestT[jobId];
    k.label('Best cycle · this job', x + 10, y); k.text(best ? `${best.t} s${best.mode === 'skild' ? ' · brain' : ' · classic'}` : '—', x + w - 10, y, {size: 10, mono: true, weight: 600, align: 'right', color: best ? B.black : B.cool2});
    y += 8;
    const st = stale(); let head, sub, col = B.white, bar = B.cool1, txtc = B.black;
    if (st) { col = B.black; bar = B.orange; txtc = B.white; head = st === 'hw' ? 'Reprogramming required' : st === 'job' ? 'New tray: reprogram' : 'Taught points are stale'; const o = poseOff(); sub = st === 'hw' ? `taught on ${HW[prog.hw].tag}` : st === 'job' ? `taught for ${JOBS[prog.job].short}` : isTray() ? `tray moved ${(o.d * U * 1000).toFixed(0)} mm · ${(o.a * 180 / PI).toFixed(1)}° (sim)` : 'board moved'; }
    else if (run && run.tray) { const f = run.flags; head = !f.bus || !f.blk ? 'Pre-phase · busbar + limit block' : !(f.scrT && f.scrB) ? `Screws · dual-arm · ${seated}/${N}` : 'Remove limit block'; sub = mode === 'skild' ? 'Skild Brain · live' : 'taught program'; bar = mode === 'skild' ? B.orange : B.cool1; }
    else if (run) { head = 'Inserting modules'; sub = mode === 'skild' ? 'Skild Brain · live' : 'taught program'; bar = mode === 'skild' ? B.orange : B.cool1; }
    else if (lastResult) { head = lastResult.ok ? `✓ Done · ${lastResult.t} s` : '✗ Job failed'; sub = lastResult.ok ? (lastResult.mode === 'skild' ? 'Skild Brain' : 'classic program') : lastResult.txt; bar = lastResult.ok ? B.orange : B.cool2; }
    else { head = 'Ready · ▶ Run task'; sub = mode === 'skild' ? 'Skild Brain' : 'classic program'; }
    box(x + 9, y, w - 18, 36, 7, col, st ? null : B.warm2, 1); ctx.fillStyle = bar; ctx.fillRect(x + 9, y + 7, 3, 22);
    k.text(fit(head, w - 40, 12, false, 700), x + 19, y + 16, {size: 12, weight: 700, color: txtc}); k.label(fitL(sub, w - 40), x + 19, y + 29, {size: 8, color: st ? B.cool1 : B.cool2});
    y += 44;
    if (isTray()) { const ah = (y0 + h - 8 - y) / 2; ['T', 'B'].forEach((a, i) => drawArmCard(x + 9, y + i * ah, w - 18, ah - 6, a)); }
  }
  function drawArmCard(x, y, w, h, a) {
    const st = AR[a], active = run && run.tray;
    box(x, y, w, h, 7, B.white, st.waiting ? B.orange : B.warm2, st.waiting ? 1.5 : 1);
    k.label(ARMS[a].name, x + 8, y + 13, {size: 8, color: B.black, weight: 600});
    const lab = active ? st.label : pending > 0 ? 'STARTING' : 'READY', hot = /TORQUE|SEATED|ALIGN|RE-LOC/.test(lab);
    k.label(fitL(lab, w - 90), x + w - 8, y + 13, {size: 8, align: 'right', color: st.waiting || hot ? B.orange : B.cool2, weight: 600});
    if (h < 34) return;
    const cx = x + 8, cy = y + 20, cw = w - 16, ch = h - 26, yv = val => cy + ch - clamp(val / 1.25, 0, 1) * ch;
    ctx.fillStyle = B.warm1; ctx.fillRect(cx, cy, cw, ch);
    ctx.setLineDash([3, 3]); ctx.strokeStyle = 'rgba(255,126,0,.55)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx, yv(1) + .5); ctx.lineTo(cx + cw, yv(1) + .5); ctx.stroke(); ctx.setLineDash([]);
    k.text('TARGET', cx + cw - 3, yv(1) - 3, {size: 7, mono: true, align: 'right', color: B.orange, weight: 600});
    if (ch > 30) k.text('TORQUE · % TARGET · SIM', cx + 3, cy + ch - 3, {size: 7, mono: true, color: B.cool1, weight: 600});
    const tr = st.trace;
    if (tr.length > 1) {
      const ok = st.tr && st.tr.kind === 'ok';
      ctx.strokeStyle = ok ? B.orange : B.cool2; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.beginPath();
      tr.forEach(([u, val], i) => { const X = cx + u * cw, Y = yv(val); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }); ctx.stroke();
      const last = tr[tr.length - 1]; k.text(`${Math.round(clamp(last[1], 0, 1.25) * 100)}%`, cx + 3, cy + 10, {size: 9, mono: true, weight: 700, color: ok ? B.orange : B.cool2});
      if (st.cur && st.cur.k === 'screw') k.text(`#${st.cur.n}`, cx + cw - 3, cy + 10, {size: 9, mono: true, weight: 700, align: 'right', color: B.black});
    }
  }
  function draw(t) {
    ctx.clearRect(0, 0, k.w, k.h);
    const l = lay();
    ctx.fillStyle = B.warm1; ctx.fillRect(0, 0, k.w, 40);
    k.text(fit('Goal: finish a job on all 3 robots with the Skild Brain. Try classic first, then shift the tray mid-run.', k.w - 32, 14, false, 600), 16, 26, {size: 14, weight: 600});
    if (isTray()) drawTrayHUD(t); else drawSideHUD();
    drawSceneHeader(l);
    // left panel: hardware cards + metrics
    box(16, 40, 230, k.h - 56, 14, B.white, B.warm2, 1.5);
    k.label(isTray() ? 'Hardware · 2 arms each · 1–3' : 'Hardware · click or 1–3', 30, 58);
    IDS.forEach((id, i) => {
      const y = 64 + i * 70, hw = HW[id], on = id === hwId, w = wins[id];
      box(26, y, 210, 62, 10, on ? B.warm1 : B.white, on ? B.black : B.warm2, on ? 2 : 1);
      k.text(fit(hw.name, 142, 13, false, 600), 38, y + 20, {size: 13, weight: 600}); k.label(`${hw.tag} · ${hw.axes}`, 38, y + 35);
      k.text(fit(`Partner: ${hw.partner}`, 190, 10), 38, y + 52, {size: 10, color: B.cool2});
      JOB_IDS.forEach((j, n) => { const lt = JOBS[j].letter, cx = 190 + n * 16; ctx.fillStyle = w[j] ? B.orange : B.warm2; ctx.beginPath(); ctx.arc(cx, y + 16, 6, 0, 7); ctx.fill(); k.text(lt, cx, y + 19, {size: 8, mono: true, align: 'center', weight: 700, color: w[j] ? '#121212' : B.cool2}); });
    });
    let my = 64 + 3 * 70 + 16;
    k.label('Expert reprograms', 30, my); k.text(String(reprograms), 30, my + 30, {size: 26, weight: 700, color: reprograms ? B.black : B.cool2});
    k.text(mode === 'skild' ? 'Skild Brain: none needed' : 'one per new arm, task or layout', 30, my + 48, {size: 11, color: B.cool2});
    my += 72;
    if (my + 30 < k.h - 110) { k.label('Program taught for', 30, my); k.text(fit(`${HW[prog.hw].tag} · ${JOBS[prog.job].short}`, 200, 11, true), 30, my + 17, {size: 11, mono: true, color: mode === 'classic' ? B.black : B.cool1}); }
    if (my + 70 < k.h - 110) { const f = j => bestT[j] ? bestT[j].t : '—'; k.label('Best cycle · per job', 30, my + 42); k.text(fit(`G ${f('gb300')} · B ${f('blackwell')} · M ${f('modules')} s`, 200, 11, true), 30, my + 59, {size: 11, mono: true}); }
    const fy0 = k.h - 96, ph = PHASES.findLast(p => data >= p[0]);
    k.label('Data flywheel · post roadmap', 30, fy0);
    k.meter(30, fy0 + 12, 200, data / 6);
    PHASES.forEach(([n]) => { const x = 30 + 200 * n / 6; ctx.fillStyle = data >= n ? B.orange : B.cool1; ctx.fillRect(x - 1, fy0 + 8, 2, 14); });
    k.text(fit(ph[1], 200, 11), 30, fy0 + 38, {size: 11, weight: 600});
    k.meter(30, k.h - 30, 200, doneHW.size / 3, `One brain · ${doneHW.size}/3 robots`);
    drawHMI(l);
    // bottom strip (left of the video corner): job plan, progress, log
    const bx = l.bx0, bw = l.bx1 - l.bx0, y0 = l.by0 + 18;
    glass(bx - 8, l.by0, bw + 16, k.h - l.by0 - 10, 12);
    k.label(fitL(`Job · ${isTray() ? job().tag : job().name}`, bw), bx, y0);
    let plan, cs;
    if (isTray()) {
      const N = holes.length, n = holes.filter(q => q.state === 'seated').length, bp = tparts.bus, bl = tparts.blk;
      const F = run && run.tray ? run.flags : lastFlags, out = bl.state === 'nest' && !!F.out;
      const done = [bp.state === 'tray' && bp.ok, !!F.blk && (bl.state === 'tray' ? bl.ok : out), n === N, out];
      done.forEach((d, i) => box(bx + i * 30, y0 + 8, 24, 14, 4, d ? B.orange : B.warm2));
      k.text(`screws ${n}/${N}`, bx + 124, y0 + 20, {size: 11, mono: true, weight: 600, color: n === N ? B.orange : B.cool3});
      cs = run && run.tray ? `A ${AR.T.label.toLowerCase()} · B ${AR.B.label.toLowerCase()}` : 'idle · Run, drag or shift the tray';
      plan = `Place busbar → Install limit block → Drive ${N} screws (${N / 2} + ${N / 2}, dual-arm) → Remove limit block`;
    } else {
      sparts.forEach((m, i) => box(bx + i * 30, y0 + 8, 24, 14, 4, m.state === 'in' ? B.orange : m.state === 'loose' ? B.cool1 : m.state === 'held' ? B.black : B.warm2));
      const cur = run && !run.tray && JOBS.modules.steps[run.si];
      cs = cur ? `${cur.k}${cur.at ? ' · ' + (cur.at === 'src' ? 'feeder' : 'board') : ''}` : 'idle · Run, or swap the arm';
      plan = 'Insert modules 1–4';
    }
    k.text(fit(cs, bw - 214, 11, true), bx + 214, y0 + 20, {size: 11, mono: true, color: run ? B.black : B.cool2});
    k.text(fit(plan, bw, 11), bx, y0 + 40, {size: 11, color: B.cool2});
    log.slice(-3).forEach((ln, i, a) => k.text(fit(ln, bw), bx, y0 + 60 + i * 15, {size: 12, color: i === a.length - 1 ? B.black : B.cool2}));
  }

  k.button('▶ Run task', startRun, {primary: true});
  const jobBtn = k.button('Job: ' + job().short, () => setJob(JOB_IDS[(JOB_IDS.indexOf(jobId) + 1) % JOB_IDS.length]));
  jobBtn.classList.toggle('on', true);
  const modeBtn = k.button('Mode: Classic programming', () => setMode(mode === 'skild' ? 'classic' : 'skild'));
  k.button('Reprogram (expert)', reprogram);
  k.button('⇄ Shift tray', shiftTray);
  const camBtn = k.button('Camera: GTC view', () => setCam((camI + 1) % CAMS.length));
  api.status('Classic · ready');
  return () => { dead = true; urs.forEach(b => b && b.dispose()); S.dispose(); k.destroy(); };
}
