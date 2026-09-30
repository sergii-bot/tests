// TRY · S1 — "Prompt the robot": pick one human demo video as the prompt, S1 executes it with frozen weights.
// Then disturb it the way the post does: slide objects away, swap them, change the lighting, knock things loose.
import * as THREE from '../../vendor/three.module.js';
import {kit, B, lerp, clamp} from './kit.js';
import * as MJ from '../mj.js';
import {createProps} from '../props/s1-props.js';

const BASE = 'https://assets.skild.ai/site/v1/blog/sb-812a99baf442e4fb5939/';
// objects: [u, v, label, radius, hidden, swapLabel]  (u/v are table coords; swaps keep the same affordance)
const TASKS = {
  coffee: {
    label: 'Pour-over coffee', short: 'Coffee', prompt: 'coffee-prompt', clip: 'coffee', liquid: '#6B3E1F',
    objects: {filter: [.2, .6, 'Filter', 14, false, 'Paper cone'], dripper: [.48, .5, 'Dripper', 22, false, 'Funnel'], kettle: [.76, .6, 'Kettle', 24, false, 'Pitcher']},
    steps: [['L', 'pick', 'filter'], ['L', 'press', 'dripper'], ['R', 'pick', 'kettle'], ['R', 'pour', 'dripper'], ['R', 'place', 'kettle', [.76, .6]]],
  },
  pancakes: {
    label: 'Pancakes', short: 'Pancakes', prompt: 'pancakes-prompt', clip: 'pancakes', liquid: '#E9C98A',
    objects: {batter: [.2, .62, 'Batter', 18, false, 'Jug'], pan: [.48, .5, 'Pan', 34], plate: [.8, .34, 'Plate', 26, false, 'Board'], pancake: [.48, .5, 'Pancake', 20, true], spatula: [.76, .64, 'Spatula', 16, false, 'Turner']},
    steps: [['L', 'pick', 'batter'], ['L', 'pour', 'pan'], ['L', 'place', 'batter', [.2, .62]], ['R', 'wait', 'pan'], ['R', 'pick', 'spatula'], ['R', 'flip', 'pan'], ['R', 'serve', 'pancake', 'plate']],
  },
  potting: {
    label: 'Plant potting', short: 'Potting', prompt: 'potting-prompt', clip: 'potting', liquid: '#6E5641',
    objects: {plant: [.2, .6, 'Plant', 20, false, 'Seedling'], pot: [.5, .5, 'Pot', 30, false, 'Planter'], scoop: [.8, .6, 'Trowel', 16, false, 'Cup']},
    steps: [['R', 'pick', 'scoop'], ['R', 'dig', 'pot'], ['R', 'place', 'scoop', [.8, .6]], ['L', 'pick', 'plant'], ['L', 'place', 'plant', 'pot']],
  },
  kitting: {
    label: 'Kitting · parts into a grid tray', short: 'Kitting', prompt: 'kitting-prompt', clip: 'kitting', liquid: '#999',
    objects: {bearing: [.2, .6, 'Bearing', 14, false, 'Spacer'], tray: [.5, .48, 'Grid tray', 30], bolt: [.8, .6, 'Bolt', 10, false, 'Screw']},
    steps: [['L', 'pick', 'bearing'], ['L', 'place', 'bearing', 'tray', [-.06, -.01]], ['R', 'pick', 'bolt'], ['R', 'place', 'bolt', 'tray', [.06, -.01]], ['R', 'seat', 'tray']],
  },
};
const DWELL = {pick: .35, place: .35, serve: .35, pour: 1.6, wait: 1.4, flip: 1, press: 1, dig: 1.4, tighten: 1.2, seat: 1.2};
const PERT = [['slide', 'Slide'], ['swap', 'Swap'], ['light', 'Lights'], ['drop', 'Drop']];
const LIGHTS = [['Normal', null], ['Dim', 'rgba(18,24,34,.34)'], ['Warm lamp', 'rgba(255,150,40,.16)']];
// v3 scenario modes. Clip names are the official file names from the S1 post (see releases.js).
const MODES = [['tasks', 'Tasks'], ['seen', 'Seen tasks'], ['skate', 'Recovery: skate wheel'], ['juice', 'Common sense: juice'], ['water', 'Common sense: no can'], ['egg', 'Demo correction: egg'], ['levels', 'Robustness L1–L5'], ['kitchen', 'Mitsui kitchen pilot']];
const SEEN = [['lab-cup', 'Lab cup', 'Handles a lab cup'], ['flakes-macro', 'Flakes', 'Fine work with flakes'], ['bandaid-elbow', 'Bandage', 'Bandage on an elbow'], ['pack-lift', 'Pack lift', 'Lifts a pack'], ['cable-loop', 'Cable loop', 'Loops a cable'], ['ribbon-retie', 'Ribbon', 'Re-ties a ribbon'], ['syringe-hold', 'Syringe', 'Holds a syringe']];
const DEMO_FILL = .9;                                    // the juice demo fills an empty glass to 90 %
const LVTXT = ['', 'Same objects and placement as training', 'All objects shifted 15 cm / 30°', 'All objects shifted 30 cm / 45°', 'Swapped for same-affordance objects, ~15 cm higher', 'Placement forces half the actions onto the other arm'];
const LVSHIFT = [0, [0, 0], [15, 30], [30, 45], [0, 0], [0, 0]];
const LOBJ = [['block', 'Block', 'Box', .28, .58, 13], ['bowl', 'Bowl', 'Basket', .42, .8, 20], ['mug', 'Mug', 'Cup', .72, .58, 13], ['coaster', 'Coaster', 'Tray', .6, .82, 17]];
const LACT = [['pick', 'block'], ['place', 'block', 'bowl'], ['pick', 'mug'], ['place', 'mug', 'coaster']];
const CHART = {icl: [1, .96, .92, .86, .8], vla: [1, .88, .74, .58, .4]};   // stylized shapes only, each policy relative to its own L1
const ITEMS = [['Garnish', '#7FA36B'], ['Rice ball', ''], ['Salmon', '#E9967A']];

function chips(k, list, x, y, maxX) {                   // pill buttons drawn in the canvas; returns hit rects
  const {ctx} = k, rects = []; let cx = x, cy = y;
  ctx.font = '500 12px Geist, system-ui, sans-serif';
  for (const c of list) {
    const w = ctx.measureText(c.label).width + (c.done ? 34 : 24);
    if (cx + w > maxX && cx > x) { cx = x; cy += 32; }
    ctx.fillStyle = c.on ? B.black : B.white; ctx.strokeStyle = c.on ? B.black : B.warm3; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cx, cy, w, 26, 13); ctx.fill(); ctx.stroke();
    if (c.done) { ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(cx + 14, cy + 13, 4, 0, 7); ctx.fill(); }
    k.text(c.label, cx + (c.done ? 24 : 12), cy + 17, {size: 12, color: c.on ? B.white : c.dim ? B.cool1 : B.black});
    rects.push({id: c.id, x: cx, y: cy, w, h: 26}); cx += w + 8;
  }
  return rects;
}

function drawLog(k, lines, x, y, w, maxRows) {           // word-wrapped log, newest line in black
  const rows = []; k.ctx.font = '500 12px Geist, system-ui, sans-serif';
  lines.forEach((l, li) => { let cur = ''; for (const wd of l.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (k.ctx.measureText(t).width > w && cur) { rows.push([cur, li]); cur = wd; } else cur = t; } rows.push([cur, li]); });
  rows.slice(-maxRows).forEach(([t, li], i) => k.text(t, x, y + i * 17, {size: 12, color: li === lines.length - 1 ? B.black : B.cool2}));
}

// ================= 3D workcell: S1 rig (2× real MuJoCo UR5e, tinted black, on a white column) + props, under the 2D overlay =================
const ARM_S = .85, TIP = .13, SEED = {R: [1.673, -.563, 2.057, 3.123, -.79, 0], L: [-1.675, -2.579, -2.058, .024, .792, 0]};
const UR_J = ['shoulder_pan_joint', 'shoulder_lift_joint', 'elbow_joint', 'wrist_1_joint', 'wrist_2_joint', 'wrist_3_joint'];
export const W3 = (u, v) => [(u - .5) * 1.0, -.4 + v * .62];            // table coords (u right, v toward viewer) → world x, z (m)
function solveN(A, b, n) {
  for (let i = 0; i < n; i++) { let p = i; for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r; [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    const d = A[i][i] || 1e-12; for (let r = i + 1; r < n; r++) { const f = A[r][i] / d; if (!f) continue; for (let c = i; c < n; c++) A[r][c] -= f * A[i][c]; b[r] -= f * b[i]; } }
  const x = new Array(n).fill(0); for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / (A[i][i] || 1e-12); } return x;
}
// real UR5e adapter: joints → MuJoCo kinematics → tool frame (attachment_site) in world
function urAdapter(mount, bot) {
  mount.add(bot.group); mount.updateMatrixWorld(true);
  const inner = bot.group.children[0], adr = UR_J.map(n => bot.jnt[n]), d = bot.data, m4 = new THREE.Matrix4(), sq = new THREE.Quaternion(), iq = new THREE.Quaternion();
  return {set(q) { for (let j = 0; j < 6; j++) d.qpos[adr[j]] = q[j]; bot.kinematics(); },
    tool(p, q) { const xp = d.site_xpos, xm = d.site_xmat; p.set(xp[0], xp[1], xp[2]).applyMatrix4(inner.matrixWorld); m4.set(xm[0], xm[1], xm[2], 0, xm[3], xm[4], xm[5], 0, xm[6], xm[7], xm[8], 0, 0, 0, 0, 1); sq.setFromRotationMatrix(m4); inner.getWorldQuaternion(iq); q.copy(iq).multiply(sq); }};
}
const _ZA = new THREE.Vector3(0, 0, 1), _q0 = new THREE.Quaternion(), _p0 = new THREE.Vector3(), _a0 = new THREE.Vector3(), _p1 = new THREE.Vector3(), _a1 = new THREE.Vector3();
function fkTip(ad, q, p, a) { ad.set(q); ad.tool(p, _q0); a.copy(_ZA).applyQuaternion(_q0); p.addScaledVector(a, TIP); return p; }
// damped least-squares IK on the real joints (finite-difference Jacobian), null-space pull toward the seed pose
function ikSolve(arm, tp, ta, iters = 3) {
  const ad = arm.ad, q = arm.q, h = 1e-3, wA = .3, mu = .0004, nu = .15, e = new Array(6), J = [];
  for (let it = 0; it < iters; it++) {
    fkTip(ad, q, _p0, _a0);
    e[0] = tp.x - _p0.x; e[1] = tp.y - _p0.y; e[2] = tp.z - _p0.z; e[3] = wA * (ta.x - _a0.x); e[4] = wA * (ta.y - _a0.y); e[5] = wA * (ta.z - _a0.z);
    if (Math.hypot(...e) < 2e-4) break;
    for (let j = 0; j < 6; j++) { q[j] += h; fkTip(ad, q, _p1, _a1); q[j] -= h; J[j] = [(_p1.x - _p0.x) / h, (_p1.y - _p0.y) / h, (_p1.z - _p0.z) / h, wA * (_a1.x - _a0.x) / h, wA * (_a1.y - _a0.y) / h, wA * (_a1.z - _a0.z) / h]; }
    const A = [], H = [], g = [], r = [];
    for (let i = 0; i < 6; i++) { A[i] = []; H[i] = []; for (let j = 0; j < 6; j++) { let s = 0; for (let k = 0; k < 6; k++) s += J[i][k] * J[j][k]; A[i][j] = s; H[i][j] = s + (i === j ? mu : 0); } let s = 0; for (let k = 0; k < 6; k++) s += J[i][k] * e[k]; g[i] = s; r[i] = nu * (arm.seed[i] - q[i]); }
    const dq = solveN(H.map(x => x.slice()), g, 6), pr = solveN(H.map(x => x.slice()), A.map(row => row.reduce((s, v, j) => s + v * r[j], 0)), 6);
    let m = 0; for (let j = 0; j < 6; j++) { dq[j] += r[j] - pr[j]; m = Math.max(m, Math.abs(dq[j])); } const sc = m > .3 ? .3 / m : 1; for (let j = 0; j < 6; j++) q[j] += dq[j] * sc;
  }
  ad.set(q); ad.tool(arm.flange, arm.toolQ); arm.tip.copy(_ZA).applyQuaternion(arm.toolQ).multiplyScalar(TIP).add(arm.flange);
}

function world3d(k) {
  const wrap = k.canvas.parentElement; let renderer = null;
  try { renderer = new THREE.WebGLRenderer({antialias: true}); } catch (err) { console.warn('S1: WebGL unavailable', err); }
  const gl = renderer?.domElement;
  if (renderer) { renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    gl.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;pointer-events:none'; wrap.prepend(gl); }
  k.canvas.style.position = 'relative'; k.canvas.style.zIndex = '1';
  const P = createProps(), scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(34, 1, .02, 40), V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const hemi = new THREE.HemisphereLight('#ffffff', '#6d5c4a', 1.0), key = new THREE.DirectionalLight('#fff3e2', 2.2), fill = new THREE.DirectionalLight('#dfe9ff', .55);
  key.position.set(.9, 2.4, 1.6); key.castShadow = true; key.shadow.mapSize.set(1536, 1536); Object.assign(key.shadow.camera, {left: -1.1, right: 1.1, top: 1.1, bottom: -1.1, near: .5, far: 6}); key.shadow.bias = -.0004; key.shadow.normalBias = .01; fill.position.set(-1.5, 1.2, 1); scene.add(hemi, key, fill);
  const envs = {}; let envName = null;
  const rig = P.build.rig(); scene.add(rig);
  const arms = {};
  for (const s of ['L', 'R']) {
    const sg = s === 'L' ? -1 : 1, mount = new THREE.Group(); mount.position.set(sg * .085, .46, -.5); mount.quaternion.setFromUnitVectors(V(0, 1, 0), V(sg, 1, 0).normalize()); scene.add(mount);
    const grip = P.build.gripper(); grip.visible = false; scene.add(grip);
    arms[s] = {side: s, mount, grip, ad: null, bot: null, q: SEED[s].slice(), seed: SEED[s], flange: V(), toolQ: new THREE.Quaternion(), tip: V(sg * .25, .3, -.2), tp: V(sg * .25, .3, -.2), want: V(sg * .25, .3, -.2), a: V(0, -1, 0), open: 1, openW: 1};
  }
  let rigState = 'loading', dead = false;
  Promise.all(['L', 'R'].map(() => MJ.spawn('ur5e', {tint: '#23262a', scale: ARM_S}))).then(bots => {
    if (dead) { bots.forEach(b => { P.disposeTree(b.group); b.dispose(); }); return; }
    ['L', 'R'].forEach((s, i) => { const a = arms[s]; a.bot = bots[i]; a.ad = urAdapter(a.mount, bots[i]); a.grip.visible = true; a.q = a.seed.slice(); });
    rigState = 'ok';
  }).catch(err => { rigState = 'fail'; console.warn('S1: rig load failed', err); for (const a of Object.values(arms)) a.grip.visible = true; });

  // per-mode props
  let stageKey = null, stageG = null, nodes = {};
  const streams = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, 1, 8), new THREE.MeshStandardMaterial({color: '#8bbfe0', transparent: true, opacity: .85})); m.visible = false; scene.add(m); return m; });
  const lightBase = {hemi: 1, key: 2.2, keyC: '#fff3e2'};
  const W = {
    P, scene, cam, arms, nodes,
    get rigState() { return rigState; },
    env(name) { if (name === envName) return; if (envName) envs[envName].visible = false; envName = name; if (!envs[name]) { envs[name] = P.env[name](); scene.add(envs[name]); } envs[name].visible = true;
      Object.assign(lightBase, name === 'lab' ? {hemi: 1.25, key: 2.0, keyC: '#ffffff'} : name === 'kitchen' ? {hemi: 1.3, key: 2.1, keyC: '#f4f8ff'} : {hemi: 1, key: 2.2, keyC: '#fff3e2'}); },
    // specs: {id: [kind, arg]}; rebuilt only when key changes
    stage(key, specs) {
      if (key === stageKey) return nodes;
      if (stageG) { scene.remove(stageG); P.disposeTree(stageG); }
      stageKey = key; stageG = new THREE.Group(); scene.add(stageG); nodes = W.nodes = {};
      for (const [id, [kind, arg]] of Object.entries(specs)) { const n = P.build[kind](arg); n.userData.kind = kind; n.userData.q = new THREE.Quaternion(); stageG.add(n); nodes[id] = n; }
      for (const a of Object.values(arms)) a.heldBy = null;
      return nodes;
    },
    // place a node on the table (u, v) at height y, or in an arm's gripper
    put(id, {u, v, x, z, y = 0, yaw = 0, hidden = false, held = null, tilt = 0, dir = 0, rx = 0}) {
      const n = nodes[id]; if (!n) return; n.visible = !hidden; if (hidden) return;
      const qd = _qd.setFromEuler(_eu.set(rx, yaw, 0));
      if (held) {
        const a = arms[held], ax = _ax.set(Math.sin(dir), 0, Math.cos(dir));        // tilt about the horizontal axis ⟂ to the pour direction
        qd.setFromAxisAngle(_ax2.set(0, 1, 0), dir - Math.PI / 2).premultiply(_qt.setFromAxisAngle(_ax3.crossVectors(ax, _ax2.set(0, -1, 0)).normalize(), tilt));
        a.a.set(0, -1, 0).applyQuaternion(_qt);
        n.quaternion.slerp(qd, .35); n.position.copy(a.tip).sub(_ax2.set(0, n.userData.g, 0).applyQuaternion(n.quaternion));
      } else { if (x === undefined) [x, z] = W3(u, v); n.quaternion.slerp(qd, .3); n.position.set(x, y, z); }
    },
    arm(side, x, y, z, {open = 1, a = null} = {}) { const A = arms[side]; A.want.set(x, y, z); A.openW = open; if (a) A.a.copy(a); },
    armHome(side) { const sg = side === 'L' ? -1 : 1; W.arm(side, sg * .3, .28, -.2); arms[side].a.set(0, -1, 0); },
    stream(i, from, to, color) { const m = streams[i]; if (!from) { m.visible = false; return; } m.visible = true; m.material.color.set(color); const d = _ax.subVectors(to, from), L = d.length(); m.position.copy(from).addScaledVector(d, .5); m.scale.set(1, L, 1); m.quaternion.setFromUnitVectors(_ax2.set(0, 1, 0), d.normalize()); },
    tipOf(side) { return arms[side].tip; },
    project(v, rect) { _pv.copy(v).project(cam); return {x: rect.x + (_pv.x + 1) / 2 * rect.w, y: rect.y + (1 - _pv.y) / 2 * rect.h, ok: _pv.z < 1}; },
    unproject(px, py, rect, h = 0) { _nd.set((px - rect.x) / rect.w * 2 - 1, -((py - rect.y) / rect.h) * 2 + 1); _rc.setFromCamera(_nd, cam); _pl.set(_ax2.set(0, 1, 0), -h); return _rc.ray.intersectPlane(_pl, V()); },
    // view = {look:[x,y,z], dist, yaw, pitch}; rect = screen rect (CSS px) the view is centred in; light = {dim, warm}
    render(dt, rect, view, light = {}) {
      for (const A of Object.values(arms)) {
        const r = 1 - Math.exp(-12 * dt); A.tp.lerp(A.want, r); A.open += (A.openW - A.open) * Math.min(1, dt * 10);
        if (A.ad) ikSolve(A, A.tp, A.a.normalize()); else { A.tip.copy(A.tp); A.flange.copy(A.tp).addScaledVector(A.a, -TIP); A.toolQ.setFromUnitVectors(_ZA, A.a); }
        A.grip.position.copy(A.flange); A.grip.quaternion.copy(A.toolQ); A.grip.userData.set(A.open);
      }
      hemi.intensity = lightBase.hemi * (light.dim ? .35 : 1); key.intensity = lightBase.key * (light.dim ? .3 : 1); key.color.set(light.warm ? '#ffb060' : lightBase.keyC); hemi.color.set(light.warm ? '#ffd8a8' : '#ffffff');
      if (!renderer) return;
      const w = Math.round(k.w), h = Math.round(k.h), pr = renderer.getPixelRatio();
      if (gl.width !== Math.round(w * pr) || gl.height !== Math.round(h * pr)) renderer.setSize(w, h, false);
      renderer.setClearColor(B.warm1);
      const [lx, ly, lz] = view.look, c = Math.cos(view.pitch);
      cam.aspect = rect.w / rect.h; cam.position.set(lx + Math.sin(view.yaw) * view.dist * c, ly + Math.sin(view.pitch) * view.dist, lz + Math.cos(view.yaw) * view.dist * c); cam.lookAt(lx, ly, lz);
      cam.updateProjectionMatrix(); cam.updateMatrixWorld();
      renderer.setViewport(rect.x, h - rect.y - rect.h, rect.w, rect.h); renderer.setScissor(0, 0, w, h); renderer.render(scene, cam);
    },
    dispose() { dead = true; for (const A of Object.values(arms)) if (A.bot) { P.disposeTree(A.bot.group); A.bot.dispose(); } scene.traverse(o => o.geometry?.dispose?.()); streams.forEach(m => m.material.dispose()); P.dispose(); if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); gl.remove(); } },
  };
  return W;
}
const _qd = new THREE.Quaternion(), _qt = new THREE.Quaternion(), _eu = new THREE.Euler(), _ax = new THREE.Vector3(), _ax2 = new THREE.Vector3(), _ax3 = new THREE.Vector3(), _pv = new THREE.Vector3(), _nd = new THREE.Vector2(), _rc = new THREE.Raycaster(), _pl = new THREE.Plane();

export default function mount(root, api) {
  const k = kit(root);
  const {ctx} = k;
  const clip = m => api.clip?.(m), record = (kind, d) => api.record?.(kind, d);
  const clipF = n => clip('/' + n + '.mp4');           // match by file name: titles overlap ('coffee' is in two titles)
  const posters = {};
  for (const [id, t] of Object.entries(TASKS)) { const i = new Image(); i.src = BASE + t.prompt + '-poster.jpg'; posters[id] = i; }

  let taskId = null, task = null, objs = {}, step = 0, phase = 'idle', phaseT = 0, contextFill = 0, log = ['Pick a prompt video below.'];
  let flash = 0, cooked = 0, flipped = false, stream = null, light = 0, runT = 0, pert = {}, drag = null, fx = [], traj = [], trajT = 0;
  let chipRects = [], completed = false, result = null;
  const doneTasks = {}, best = {};
  const arms = {L: {bx: .36, tip: [.36, .25], hold: null}, R: {bx: .64, tip: [.64, .25], hold: null}};
  const say = s => { log.push(s); if (log.length > 20) log.shift(); };
  const nPert = () => Object.values(pert).reduce((a, b) => a + b, 0);

  // layout: left column (prompt + plan), workcell on the right. Objects stay clear of the bottom-right video corner.
  // ---- 3D mapping: the workcell is rendered by world3d; logic stays in table coords (u, v) ----
  const w3 = world3d(k); api.debug?.(w3);
  const orbit = {yaw: 0, pitch: 0, drag: null};
  const glRect = () => { const y = mode === 'seen' ? 178 : 92; return {x: 241, y, w: Math.max(10, k.w - 241), h: Math.max(10, k.h - y)}; };
  const area = () => { const r = glRect(); return {x0: r.x + 20, y0: r.y, w: r.w - 40, h: r.h}; };
  const P = ([u, v], y = .03) => { const [x, z] = W3(u, v), q = w3.project(new THREE.Vector3(x, y, z), glRect()); return [q.x, q.y]; };
  const U = (x, y) => { const p = w3.unproject(x, y, glRect(), .02); if (!p) return [.5, .5]; return [p.x + .5, (p.z + .4) / .62]; };
  const view = (look = [0, .1, -.12], dist = 1.55, pitch = .52) => { const r = glRect(), a = r.w / r.h; return {look, dist: dist * Math.max(1, 1.45 / a), yaw: orbit.yaw, pitch: clamp(pitch + orbit.pitch, .15, 1.2)}; };
  const lightNow = () => ({dim: LIGHTS[light][0] === 'Dim', warm: LIGHTS[light][0] === 'Warm lamp'});
  const nodeTop = id => w3.nodes[id]?.userData.top || 0, nodeG = id => w3.nodes[id]?.userData.g || .05;
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z), DOWN = V3(0, -1, 0);
  function card(x, y, w, h, a = .88) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = B.warm1; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill(); ctx.restore(); }
  function header() {                                  // opaque band above the 3D view + honesty / loading labels
    const r = glRect(); ctx.fillStyle = B.warm1; ctx.fillRect(r.x - 1, 0, k.w - r.x + 1, r.y);
    card(r.x + 10, r.y + 8, 330, 20, .8); k.label('3D · simulated · stylized props · drag empty space to orbit', r.x + 18, r.y + 22, {color: B.cool3});
    if (w3.rigState !== 'ok') { const txt = w3.rigState === 'loading' ? 'loading rig… (2× MuJoCo UR5e)' : 'rig failed to load · grippers only'; card(r.x + r.w - 250, r.y + 8, 240, 20, .9); k.label(txt, r.x + r.w - 18, r.y + 22, {align: 'right', color: B.orange}); }
  }
  // tasks: which prop builds each logic object
  const KIND = {filter: 'filter', dripper: 'dripper', kettle: 'kettle', batter: 'batter', pan: 'pan', plate: 'plate', pancake: 'pancake', spatula: 'spatula', plant: 'plant', pot: 'pot', scoop: 'trowel', bearing: 'bearing', tray: 'tray', bolt: 'bolt'};
  const DECOR = {coffee: {beans: ['beans', [.9, .38]], mug: ['mug', [.1, .4]]}, pancakes: {}, potting: {bag: ['soilBag', [.94, .36]], basket: ['basket', [.06, .38]]}, kitting: {bin: ['partsBin', [.9, .36]]}};
  function sync3Tasks(dt) {
    w3.env('green');
    if (!task) { w3.stage('none', {}); w3.armHome('L'); w3.armHome('R'); w3.stream(0, null); return; }
    const sw = Object.entries(objs).filter(([, o]) => o.swapped).map(([n]) => n).join(','), specs = {};
    for (const id of Object.keys(objs)) specs[id] = [KIND[id], objs[id].swapped];
    for (const [id, [kd]] of Object.entries(DECOR[taskId])) specs['d_' + id] = [kd];
    const N = w3.stage(taskId + ':' + sw, specs);
    for (const [id, [, uv]] of Object.entries(DECOR[taskId])) w3.put('d_' + id, {u: uv[0], v: uv[1], yaw: .5});
    const s = phase === 'acting' ? task.steps[step] : null;
    const atGoal = side => { if (!s || s[0] !== side) return false; const g = target(s), a = arms[side]; return Math.hypot(g[0] - a.tip[0], g[1] - a.tip[1]) < .012; };
    const surfAt = (id, o) => { let y = 0; for (const [j, q] of Object.entries(objs)) { if (j === id || q.hidden || heldBy(j) || !nodeTop(j)) continue; const [x1, z1] = W3(o.u, o.v), [x2, z2] = W3(q.u, q.v); if (Math.hypot(x1 - x2, z1 - z2) < .1) y = Math.max(y, nodeTop(j)); } return y; };
    const pourDir = (from, toId) => { const [x1, z1] = W3(...from), [x2, z2] = W3(objs[toId].u, objs[toId].v); return Math.atan2(x2 - x1, z2 - z1); };
    const tilt = {L: 0, R: 0};
    for (const side of ['L', 'R']) if (atGoal(side)) {
      const act = s[1], hn = arms[side].hold, f = clamp(phaseT / (DWELL[act] || .35), 0, 1);
      if (act === 'pour' && hn) tilt[side] = (N[hn]?.userData.pour || 1) * Math.sin(Math.min(1, f * 1.4) * Math.PI / 2) * (f > .85 ? (1 - f) / .15 : 1);
      if (act === 'dig') tilt[side] = .5 * Math.sin(f * Math.PI);
    }
    for (const [id, o] of Object.entries(objs)) {
      const arm = heldBy(id), side = arm === arms.L ? 'L' : arm === arms.R ? 'R' : null;
      if (id === 'pancake' && !o.hidden && N.pancake) {
        N.pancake.userData.mat.color.set(flipped ? '#c8893f' : '#efd48f').lerp(new THREE.Color('#d9a45a'), flipped ? 0 : cooked * .6);
        if (s && s[1] === 'serve' && arms[s[0]].hold === 'spatula' && N.spatula) { const sp = N.spatula.position; w3.put(id, {x: sp.x, z: sp.z, y: sp.y + .006}); continue; }
        if (s && s[1] === 'flip' && atGoal(s[0])) { const f = clamp(phaseT / DWELL.flip, 0, 1); w3.put(id, {u: o.u, v: o.v, y: nodeTop('pan') + Math.sin(f * Math.PI) * .12, rx: f * Math.PI}); continue; }
      }
      const dir = s && s[0] === side && s[1] === 'pour' ? pourDir(arms[side].tip, s[2]) : 0;
      w3.put(id, {u: o.u, v: o.v, y: surfAt(id, o), hidden: o.hidden, held: side, tilt: side ? tilt[side] : 0, dir, yaw: id === 'spatula' ? -.6 : 0});
      if (o.swapped && N[id]) N[id].scale.setScalar(.88);
    }
    if (N.dripper) { N.dripper.userData.filterIn.visible = !!objs.filter?.hidden; const fl = N.dripper.userData.fill; fl.scale.y = Math.min(1, Math.max(.02, fl.scale.y + (stream && s?.[1] === 'pour' ? dt * .6 : 0))); fl.position.y = .05 * fl.scale.y + .002; }
    if (N.pot) N.pot.userData.soil.color.set(step > 1 || phase === 'done' ? '#2f2117' : '#4a3323');
    w3.P.M.hobRing.emissiveIntensity = N.pan && !objs.pancake?.hidden && phase === 'acting' ? .9 : 0;
    // stream from the held container's spout into the target
    let st = null;
    if (stream && s) { const n = N[arms[s[0]].hold]; if (n?.userData.spout) { const [x, z] = W3(objs[s[2]].u, objs[s[2]].v); st = [n.localToWorld(n.userData.spout.clone()), V3(x, nodeTop(s[2]) + .01, z)]; } }
    w3.stream(0, st?.[0], st?.[1], task.liquid); w3.stream(1, null);
    for (const side of ['L', 'R']) {
      const a = arms[side], [x, z] = W3(...a.tip), hn = a.hold, hg = hn ? nodeG(hn) : 0;
      let y = .2 + hg;
      if (atGoal(side)) {
        const act = s[1];
        if (act === 'pick') y = nodeG(s[2]) + surfAt(s[2], objs[s[2]]);
        else if (act === 'place' || act === 'serve') y = hg + (Array.isArray(s[3]) ? 0 : nodeTop(s[3])) + .004;
        else if (act === 'pour') y = nodeTop(s[2]) + .2 + hg * .3;
        else if (act === 'press' || act === 'dig') y = nodeTop(s[2]) + .03 + hg;
        else if (act === 'flip') y = nodeTop(s[2]) + hg;
        else if (act === 'wait') y = nodeTop(s[2]) + .22;
        else y = nodeTop(s[2]) + .05 + Math.sin(phaseT * 14) * .01;
      }
      w3.arm(side, x, y, z, {open: hn ? 0 : 1, a: hn ? null : DOWN});
    }
  }
  const armName = s => s === 'L' ? 'Left' : 'Right';
  const lc = s => s.toLowerCase();

  function choose(id) {
    taskId = id; task = TASKS[id]; step = 0; phase = 'reading'; phaseT = 0; contextFill = 0; cooked = 0; flipped = false; stream = null;
    runT = 0; pert = {}; traj = []; trajT = 0; result = null; drag = null;
    objs = Object.fromEntries(Object.entries(task.objects).map(([k2, [u, v, label, r, hidden, alt]]) => [k2, {u, v, label, r, hidden: !!hidden, alt, swapped: false}]));
    arms.L.tip = [.36, .22]; arms.R.tip = [.64, .22]; arms.L.hold = arms.R.hold = null;
    log = [`Prompt: 1 human video · ${task.label}`];
    api.status('Reading the prompt'); clipF(task.prompt);
    buttons.forEach(b => b.classList.toggle('on', b.dataset.id === id));
  }
  function target(s) {
    const [, act, obj, to] = s;
    if (act === 'place' || act === 'serve') { if (Array.isArray(to)) return to; const o = objs[to], off = s[4] || [0, -.02]; return [o.u + off[0], o.v + off[1]]; }
    const o = objs[obj];
    if (act === 'pour' || act === 'flip' || act === 'wait') return [o.u + (s[0] === 'L' ? -.08 : .08), o.v - .12];
    if (act === 'press' || act === 'dig' || act === 'tighten' || act === 'seat') return [o.u, o.v - .03];
    return [o.u, o.v];
  }
  const heldBy = n => Object.values(arms).find(a => a.hold === n);

  function bump(type, msg) { pert[type] = (pert[type] || 0) + 1; flash = 1; say(msg); }
  function knockLoose(name, why) {                      // an object leaves the gripper: S1 goes back and tries again
    const arm = heldBy(name); if (!arm) return false;
    arm.hold = null; const o = objs[name];
    o.v = clamp(o.v + .08, .36, .72); o.u = clamp(o.u + (Math.random() - .5) * .12, .1, .9);
    for (let i = step; i >= 0; i--) if (task.steps[i][1] === 'pick' && task.steps[i][2] === name) { step = i; break; }
    phaseT = 0; stream = null;
    bump('drop', `${why} ${lc(o.label)} · S1 tries again`); clipF('pancake-recovery');
    return true;
  }
  function doDrop() {
    if (!task || phase !== 'acting') { say('Start a task first.'); return; }
    const name = arms.R.hold || arms.L.hold;
    if (!name) { say('Nothing in the grippers right now · wait for a grasp'); return; }
    knockLoose(name, 'Knocked loose:');
  }
  function doSwap() {
    if (!task || phase !== 'acting') { say('Start a task first.'); return; }
    const cands = Object.entries(objs).filter(([n, o]) => o.alt && !o.hidden && !o.swapped && !heldBy(n));
    if (!cands.length) { say('Nothing left to swap'); return; }
    const [, o] = cands[Math.floor(Math.random() * cands.length)];
    const old = o.label; o.label = o.alt; o.swapped = true;
    fx.push({u: o.u, v: o.v, t: 0});
    bump('swap', `Swapped ${lc(old)} → ${lc(o.label)} · same affordance, keeps going`);
  }
  function doLight() {
    light = (light + 1) % LIGHTS.length;
    if (task && phase === 'acting') bump('light', `Lighting: ${lc(LIGHTS[light][0])} · same weights, keeps going`);
    else say(`Lighting: ${lc(LIGHTS[light][0])}`);
  }

  function finishTask() {
    phase = 'done'; api.status('Task complete');
    const n = nPert(), t = +runT.toFixed(1);
    doneTasks[taskId] = Math.max(doneTasks[taskId] || 0, n);
    const prevBest = best[taskId]; if (!prevBest || n > prevBest.n || (n === prevBest.n && t < prevBest.t)) best[taskId] = {n, t};
    result = {n, t, types: Object.keys(pert).length};
    say(n ? `Done in ${t} s. Recovered from ${n} disturbance${n > 1 ? 's' : ''}.` : `Done in ${t} s. Now run it again and disturb it mid-task.`);
    record('s1_run', {task: taskId, time_s: t, disturbances: {...pert}, lighting: LIGHTS[light][0], swapped: Object.values(objs).filter(o => o.swapped).map(o => o.label), tips: traj});
    clipF(task.clip);
    if (n > 0 && !completed) { completed = true; api.complete('S1 · 1 video, recovered'); }
  }

  k.frame((dt, t) => {
    flash = Math.max(0, flash - dt * 2);
    if (mode !== 'tasks') { SCN[mode].tick(dt, t); drawScenario(t); return; }
    phaseT += dt;
    fx.forEach(f => f.t += dt); fx = fx.filter(f => f.t < .8);
    if (phase === 'reading') { contextFill = Math.min(1, contextFill + dt * .7); if (contextFill >= 1) { phase = 'acting'; phaseT = 0; api.status('Executing · same weights'); say('0 gradient steps. The weights never change.'); clipF(task.clip); } }
    if (phase === 'acting') {
      runT += dt; trajT += dt;
      if (trajT > .25 && traj.length < 200) { trajT = 0; traj.push([+runT.toFixed(2), ...arms.L.tip.map(v => +v.toFixed(3)), ...arms.R.tip.map(v => +v.toFixed(3))]); }
      const s = task.steps[step], arm = arms[s[0]], goal = target(s);
      const d = Math.hypot(goal[0] - arm.tip[0], goal[1] - arm.tip[1]);
      const sp = 0.55 * dt;
      if (d > .006) { arm.tip[0] += (goal[0] - arm.tip[0]) / d * Math.min(d, sp); arm.tip[1] += (goal[1] - arm.tip[1]) / d * Math.min(d, sp); phaseT = 0; if (s[1] !== 'pour') stream = null; }
      if (arm.hold && objs[arm.hold] && drag?.name !== arm.hold) { const o = objs[arm.hold]; o.u = arm.tip[0]; o.v = arm.tip[1] + .03; }
      if (d <= .006) {
        const act = s[1], dwell = DWELL[act] || .35;
        if (act === 'pick' && drag?.name === s[2]) phaseT = 0;          // you are holding it: wait
        if (act === 'pour') stream = {from: arm.tip.slice(), to: [objs[s[2]].u, objs[s[2]].v]};
        if (act === 'wait') cooked = Math.min(1, phaseT / dwell);
        if (act === 'flip') flipped = phaseT > .5;
        if (phaseT >= dwell) {
          const o = objs[s[2]];
          if (act === 'pick') { arm.hold = s[2]; say(`${armName(s[0])} arm · grasp ${lc(o.label)}`); }
          if (act === 'place' || act === 'serve') { const held = arm.hold || s[2]; const tgt = target(s); if (objs[held]) { objs[held].u = tgt[0]; objs[held].v = tgt[1]; } arm.hold = null; say(`Placed ${lc(objs[held]?.label || '')}`); }
          if (act === 'serve') { o.u = objs[s[3]].u; o.v = objs[s[3]].v; }
          if (act === 'pour') { stream = null; if (objs.pancake) objs.pancake.hidden = false; say(`Pour · ${lc(o.label)}`); }
          if (act === 'press') { const held = arm.hold; if (held) { objs[held].hidden = true; arm.hold = null; } say(`Pressed the filter into the ${lc(o.label)}`); }
          if (act === 'dig') say(`Dug into the soil in the ${lc(o.label)}`);
          if (act === 'tighten') say('Tightened the nut · wheel on');
          if (act === 'seat') say('Seated the parts in the grid tray');
          if (act === 'flip') say('Flip');
          const ft = target(s); fx.push({u: ft[0], v: ft[1], t: 0});
          step++; phaseT = 0;
          if (step >= task.steps.length) finishTask();
        }
      }
    }
    draw(t);
  });

  // ---- pointer: drag objects around the table (slide them away), grab one from a gripper (knock it loose), chips ----
  k.onDown(p => {
    if (mode !== 'tasks') { scDown(p); return; }
    const c = chipRects.find(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    if (c) { ({drop: doDrop, swap: doSwap, light: doLight})[c.id]?.(); return; }
    if (!task) return;
    let bestN = null, bd = 1e9;
    for (const [n, o] of Object.entries(objs)) { if (o.hidden) continue; const [x, y] = P([o.u, o.v]); const d = Math.hypot(p.x - x, p.y - y); if (d < o.r + 10 && d < bd) { bd = d; bestN = n; } }
    if (!bestN) { orbit.drag = {x: p.x, y: p.y}; return; }
    if (phase === 'acting' && heldBy(bestN)) knockLoose(bestN, 'You pulled the');
    const o = objs[bestN]; drag = {name: bestN, from: [o.u, o.v], moved: 0};
  });
  k.onMove(p => {
    if (orbit.drag) { orbit.yaw = clamp(orbit.yaw - (p.x - orbit.drag.x) * .005, -.9, .9); orbit.pitch = clamp(orbit.pitch + (p.y - orbit.drag.y) * .004, -.35, .6); orbit.drag = {x: p.x, y: p.y}; return; }
    if (mode !== 'tasks') { scMove(p); return; }
    if (!drag) return; const o = objs[drag.name]; const [u, v] = U(p.x, p.y);
    const nu = clamp(u, .08, .92), nv = clamp(v, .34, .74); drag.moved += Math.hypot(nu - o.u, nv - o.v); o.u = nu; o.v = nv;
  });
  k.onUp(() => {
    if (orbit.drag) { orbit.drag = null; return; }
    if (mode !== 'tasks') { scUp(); return; }
    if (!drag) return; const o = objs[drag.name];
    if (drag.moved > .03) { if (phase === 'acting') bump('slide', `Slid the ${lc(o.label)} away · re-targeting`); else say(`Moved the ${lc(o.label)}`); }
    drag = null;
  });

  function label3(txt, u, v, y, o = {}) { const [x, py] = P([u, v], y); ctx.font = '500 11px Geist, system-ui, sans-serif'; const w = ctx.measureText(txt).width + 12; card(x - w / 2, py - 8, w, 18, .82); k.text(txt, x, py + 5, {align: 'center', size: 11, color: o.color || B.cool3, weight: o.weight || 500}); }
  function draw(t) {
    sync3Tasks(k.dt); w3.render(k.dt, glRect(), view(), lightNow());
    ctx.clearRect(0, 0, k.w, k.h); header();
    const a = area(), r = glRect();
    k.text(task ? `Goal: let S1 finish ${lc(task.short)} while you disturb it.` : 'Goal: give S1 one video, then disturb it mid-task.', a.x0, 28, {size: 15, weight: 600});
    k.label('Disturb it · drag any object to slide it away', a.x0, 48);
    const on = task && phase === 'acting';
    chipRects = chips(k, [
      {id: 'swap', label: '⇄ Swap an object', dim: !on}, {id: 'light', label: `☀ Lighting: ${LIGHTS[light][0]}`, on: light > 0},
      {id: 'drop', label: '↯ Knock it loose', dim: !on || !(arms.L.hold || arms.R.hold)},
    ], a.x0, 56, k.w - 20);
    if (task) {
      const s = phase === 'acting' ? task.steps[step] : null, dw = s ? DWELL[s[1]] : 0;
      for (const [id, o] of Object.entries(objs)) {
        if (o.hidden || heldBy(id) || id === 'pancake') continue;
        if (drag?.name === id) { const [x, y] = P([o.u, o.v]); ctx.strokeStyle = B.orange; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, o.r + 12, (o.r + 12) * .45, 0, 0, 7); ctx.stroke(); }
        if (Object.entries(objs).some(([j, q]) => j !== id && !q.hidden && q.r > o.r && Math.hypot(q.u - o.u, q.v - o.v) < .04)) continue;
        label3(o.label, o.u, o.v + .1, 0, {color: o.swapped ? B.black : B.cool3, weight: o.swapped ? 600 : 500});
      }
      if (s && dw > .5 && phaseT > 0) { const [x, y] = P(target(s), .02); ctx.strokeStyle = B.orange; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 18, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(phaseT / dw, 0, 1)); ctx.stroke(); }
    } else { card(r.x + r.w / 2 - 170, r.y + r.h * .42, 340, 34); k.text('Pick a prompt video in the bar below.', r.x + r.w / 2, r.y + r.h * .42 + 22, {align: 'center', size: 15, color: B.cool2}); }
    for (const f of fx) { const [x, y] = P([f.u, f.v], .02); ctx.strokeStyle = `rgba(255,126,0,${1 - f.t / .8})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, 14 + f.t * 40, (14 + f.t * 40) * .45, 0, 0, 7); ctx.stroke(); }
    if (flash > 0) { ctx.fillStyle = `rgba(255,126,0,${flash * .16})`; ctx.fillRect(r.x, r.y, r.w, r.h); }
    if (phase === 'acting') { card(r.x + r.w - 90, r.y + 36, 76, 24); k.text(`${runT.toFixed(1)} s`, r.x + r.w - 22, r.y + 53, {align: 'right', size: 13, mono: true, weight: 600}); }
    if (phase === 'done' && result) {
      const cw = Math.min(380, a.w - 40), cx = a.x0 + (a.w - cw) / 2, cy = r.y + 40;
      ctx.fillStyle = result.n ? B.orange : B.black; ctx.beginPath(); ctx.roundRect(cx, cy, cw, 56, 12); ctx.fill();
      k.text(`${task.short} done · ${result.t} s · ${result.n} disturbance${result.n === 1 ? '' : 's'} recovered`, cx + 16, cy + 23, {size: 14, weight: 600, color: result.n ? '#121212' : B.white});
      k.text(result.n ? 'Same weights. No post-training. Try another task.' : 'Run it again and disturb it mid-task.', cx + 16, cy + 42, {size: 12, color: result.n ? '#121212' : B.warm2});
    }

    // left column: prompt card + plan + scoreboard
    ctx.fillStyle = B.white; ctx.fillRect(0, 0, 240, k.h); ctx.fillStyle = B.warm2; ctx.fillRect(240, 0, 1, k.h);
    k.label('Prompt (context)', 18, 26);
    if (task) {
      const img = posters[taskId];
      if (img.complete && img.naturalWidth) { ctx.save(); ctx.beginPath(); ctx.roundRect(18, 36, 204, 115, 8); ctx.clip(); ctx.drawImage(img, 18, 36, 204, 115); ctx.restore(); }
      else { ctx.fillStyle = B.warm2; ctx.beginPath(); ctx.roundRect(18, 36, 204, 115, 8); ctx.fill(); }
      k.text('Human demo · 1 video · no post-training', 18, 168, {size: 12, color: B.cool2});
      k.label('Plan read from the video', 18, 194);
      task.steps.forEach((s, i) => {
        const y = 214 + i * 20, done = i < step || phase === 'done', cur = i === step && phase === 'acting';
        ctx.fillStyle = done ? B.orange : cur ? B.black : B.warm2; ctx.beginPath(); ctx.arc(24, y - 4, cur ? 5 + Math.sin(t * 8) : 5, 0, 7); ctx.fill();
        k.text(`${s[0]} · ${s[1]} ${s[2]}${s[3] && !Array.isArray(s[3]) ? ' → ' + s[3] : ''}`, 38, y, {size: 12, color: cur ? B.black : B.cool2, weight: cur ? 600 : 400, mono: true});
      });
    } else k.text('No prompt yet', 18, 60, {size: 13, color: B.cool2});
    const sy = Math.max(360, k.h - 150);
    k.label('Disturbances this run', 18, sy);
    PERT.forEach(([id, lab], i) => {
      const x = 18 + i * 52, n = pert[id] || 0;
      ctx.fillStyle = n ? B.orange : B.warm1; ctx.beginPath(); ctx.roundRect(x, sy + 8, 46, 34, 8); ctx.fill();
      k.text(String(n), x + 23, sy + 24, {align: 'center', size: 13, weight: 700, color: n ? B.black : B.cool1});
      k.text(lab, x + 23, sy + 37, {align: 'center', size: 9, mono: true, color: n ? B.black : B.cool2});
    });
    k.label('Tasks done · most disturbances survived', 18, sy + 62);
    Object.entries(TASKS).forEach(([id, tk], i) => {
      const x = 18 + i * 52, d = doneTasks[id];
      ctx.fillStyle = d !== undefined ? (d > 0 ? B.orange : B.black) : B.warm2; ctx.beginPath(); ctx.arc(x + 8, sy + 78, 6, 0, 7); ctx.fill();
      k.text(tk.short.slice(0, 6), x + 18, sy + 82, {size: 10, mono: true, color: d !== undefined ? B.black : B.cool2});
      if (d) k.text('×' + d, x + 8, sy + 98, {size: 10, mono: true, color: B.cool2, align: 'center'});
    });
    k.label('Weights', 18, sy + 122); k.text('frozen · 0 updates', 80, sy + 122, {mono: true, size: 11, color: B.black});

    // bottom strip (left of the video corner): context window + log
    const cy = k.h - 116, bw = Math.max(160, Math.min(a.w - 20, k.w - 370 - a.x0)); card(a.x0 - 10, cy - 18, bw + 20, 110);
    k.label(`Context window · ${task ? '1 video' : 'empty'}`, a.x0, cy);
    const n = 24;
    for (let i = 0; i < n; i++) { const lit = i / n < contextFill; ctx.fillStyle = lit ? B.orange : B.warm2; ctx.fillRect(a.x0 + i * (bw / n), cy + 10, bw / n - 3, 16); }
    drawLog(k, log.slice(-3), a.x0, cy + 50, bw, 3);
  }

  // ================= v3 scenario modes · each one switches the corner clip to the matching official video =================
  let mode = 'tasks', sc = null, sdrag = null, scRects = [];
  const cfg = {obj: 'egg', fill: 40, dropH: 70, can: false, level: 1, item: 0, comp: 1, forced: 0, seen: -1};
  const seenPosters = {}, seenWatched = new Set();
  const SA = () => glRect();
  const SP = (u, v) => P([u, v]);
  const posterImgs = {}, posterOf = n => { if (!posterImgs[n]) { const i = new Image(); i.src = BASE + n + '-poster.jpg'; posterImgs[n] = i; } return posterImgs[n]; };
  function poster(img, x, y, w, h) { if (!(img?.complete && img.naturalWidth)) return false; const q = Math.max(w / img.naturalWidth, h / img.naturalHeight), dw = img.naturalWidth * q, dh = img.naturalHeight * q; ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); return true; }
  const pct = v => Math.round(v * 100) + '%';
  const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); };
  const seg = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const box = (x, y, w, h, r, fill, stroke) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } };
  const toward = (p, g, sp) => { const d = Math.hypot(g[0] - p[0], g[1] - p[1]); if (d <= sp) { p[0] = g[0]; p[1] = g[1]; return true; } p[0] += (g[0] - p[0]) / d * sp; p[1] += (g[1] - p[1]) / d * sp; return false; };
  const table = (s, top = .3, lab = 'Workcell · simulated') => { box(s.x, s.y + s.h * top, s.w, s.h * (1 - top), 14, B.white, B.warm2); k.label(lab, s.x + 14, s.y + s.h * top + 20); return s.y + s.h * top; };
  function para(str, x, y, w, {size = 12, color = B.cool2, lh = 16} = {}) {            // wrapped paragraph, returns next y
    ctx.font = `500 ${size}px Geist, system-ui, sans-serif`; let cur = '';
    for (const wd of str.split(' ')) { const t2 = cur ? cur + ' ' + wd : wd; if (ctx.measureText(t2).width > w && cur) { k.text(cur, x, y, {size, color}); y += lh; cur = wd; } else cur = t2; }
    if (cur) { k.text(cur, x, y, {size, color}); y += lh; }
    return y;
  }
  function tiles(y, list) {                              // [label, value, hot] number tiles in the left column
    list.forEach(([lab, n, hot], i) => {
      const x = 18 + i * 52; box(x, y, 46, 34, 8, hot ? B.orange : B.warm1);
      k.text(String(n), x + 23, y + 16, {align: 'center', size: 13, weight: 700, color: hot ? B.black : B.cool2});
      k.text(lab, x + 23, y + 29, {align: 'center', size: 9, mono: true, color: hot ? B.black : B.cool2});
    });
    return y + 50;
  }
  function arm2(bx, by, tx, ty, side, hold) {            // two-link arm in pixels (stylized, links stretch to reach)
    const dx = tx - bx, dy = ty - by, d = Math.max(1, Math.hypot(dx, dy)), L = Math.max(70, d * .6);
    const sh = Math.atan2(dy, dx) + (side === 'L' ? 1 : -1) * Math.acos(clamp(d / (2 * L), -1, 1));
    const ex = bx + Math.cos(sh) * L, ey = by + Math.sin(sh) * L;
    ctx.lineCap = 'round'; ctx.strokeStyle = B.black; ctx.lineWidth = 12; seg(bx, by, ex, ey);
    ctx.strokeStyle = B.cool3; ctx.lineWidth = 9; seg(ex, ey, tx, ty);
    ctx.fillStyle = B.orange; dot(ex, ey, 5); ctx.fillStyle = hold ? B.orange : B.cool2; dot(tx, ty, 7);
    box(bx - 18, by - 12, 36, 14, 5, B.black);
  }
  function glass(cx, by, gw, gh, level, spill) {
    const liq = B.orangeSoft;
    if (spill > 0) { ctx.fillStyle = liq; ctx.globalAlpha = .5; ctx.beginPath(); ctx.ellipse(cx, by + 3, gw * .5 + spill * gw * 2, 4 + spill * 12, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    const lh = gh * clamp(level, 0, 1); ctx.fillStyle = liq; ctx.fillRect(cx - gw / 2 + 2, by - lh, gw - 4, lh);
    if (spill > 0) { ctx.strokeStyle = liq; ctx.lineWidth = 3; seg(cx - gw / 2 - 1, by - gh, cx - gw / 2 - 3, by); seg(cx + gw / 2 + 1, by - gh, cx + gw / 2 + 3, by); }
    ctx.strokeStyle = B.cool3; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - gw / 2, by - gh); ctx.lineTo(cx - gw / 2, by); ctx.lineTo(cx + gw / 2, by); ctx.lineTo(cx + gw / 2, by - gh); ctx.stroke();
  }
  function pitcher(x, y, ang, pouring, tx, ty) {         // x,y = pivot; spout stream to (tx, ty)
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); box(-12, -40, 24, 40, 5, B.cool1, B.cool3); ctx.restore();
    if (pouring) { const sx = x + Math.cos(ang) * 12 - Math.sin(ang) * -40, sy = y + Math.sin(ang) * 12 + Math.cos(ang) * -40; ctx.strokeStyle = B.orangeSoft; ctx.lineWidth = 3; ctx.setLineDash([3, 5]); ctx.lineDashOffset = -k.t * 40; seg(sx, sy, tx, ty); ctx.setLineDash([]); }
  }
  function egg(x, y, st) {
    if (st === 'broken') { ctx.fillStyle = B.white; ctx.beginPath(); ctx.ellipse(x, y + 2, 20, 6, 0, 0, 7); ctx.fill(); ctx.strokeStyle = B.warm3; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = '#F2C14E'; dot(x + 3, y + 1, 5); ctx.fillStyle = B.warm2; ctx.fillRect(x - 16, y - 4, 5, 3); ctx.fillRect(x + 12, y - 3, 4, 3); return; }
    ctx.fillStyle = '#F4EFE6'; ctx.strokeStyle = B.warm4; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y, 8, 11, 0, 0, 7); ctx.fill(); ctx.stroke();
  }
  function endScenario(data, msg, status) {
    sc.phase = 'done'; say(msg); api.status(status);
    record('s1_scenario', {scenario: mode, ...data, time_s: +sc.t.toFixed(1)});
  }
  const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

  const SCN = {
    seen: {
      clip: 'lab-cup', status: 'Seen tasks', goal: 'Goal: browse tasks S1 has seen, and watch the real robot do each.',
      hint: 'Click a card · the corner plays the official clip', intro: 'Seen tasks: S1 runs them autonomously. Click a card.',
      init() { SEEN.forEach(([f]) => { if (!seenPosters[f]) { const i = new Image(); i.src = BASE + f + '-poster.jpg'; seenPosters[f] = i; } }); return {phase: 'ready', t: 0, cards: []}; },
      tick() {},
      sync(dt) {
        w3.env('lab'); const i = cfg.seen; sc.lt = (sc.lt || 0) + dt; const T = sc.lt;
        const specs = [{rack: ['rack'], b1: ['beaker'], b2: ['beaker'], cup: ['orangeCup']}, {bowl: ['flakes'], box: ['cerealBox'], pinch: ['flakes']}, {arm: ['forearm'], aid: ['bandaid']},
          {pack: ['backpack']}, {clips: ['clips', [[-.1, .08], [.08, -.02], [.24, .09]]]}, {gift: ['gift']}, {stand: ['stand'], syr: ['syringe']}][i] || {};
        const N = w3.stage('seen:' + i, specs), sm = x => x * x * (3 - 2 * x), ph = (T % 6) / 6, loop = (a, b) => sm(clamp((ph - a) / (b - a), 0, 1));
        w3.stream(0, null); w3.stream(1, null);
        if (i < 0) { w3.armHome('L'); w3.armHome('R'); return; }
        const R = (x, y, z, o) => w3.arm('R', x, y, z, o), L = (x, y, z, o) => w3.arm('L', x, y, z, o);
        if (i === 0) {                                   // lab cup: pick the orange cup, carry it past the rack, put it back
          w3.put('rack', {x: -.14, z: -.06}); w3.put('b1', {x: .02, z: -.16}); w3.put('b2', {x: .3, z: -.04});
          const up = loop(.1, .25) - loop(.8, .95), mv = loop(.3, .5) - loop(.6, .78), cx = lerp(.16, .04, mv), cz = lerp(.12, .02, mv), cy = .07 + up * .12;
          const held = ph > .15 && ph < .9; R(cx, cy + (held ? 0 : .1 * (1 - loop(.02, .15)) + .1 * loop(.9, 1)), cz, {open: held ? 0 : 1, a: DOWN});
          w3.put('cup', held ? {held: 'R', dir: Math.PI / 2, tilt: .5 * (loop(.5, .56) - loop(.56, .62))} : {x: .16, z: .12}); L(-.14 + Math.sin(T * 2) * .08, .2, -.06, {a: DOWN});
        } else if (i === 1) {                            // flakes: pinch from the box pile, sprinkle over the bowl
          w3.put('bowl', {x: .12, z: 0}); w3.put('box', {x: -.25, z: -.18, yaw: .4});
          R(.12 + Math.sin(T * 3) * .02, .16 + Math.sin(T * 5) * .01, Math.cos(T * 3) * .02, {open: .15 + .15 * Math.max(0, Math.sin(T * 9)), a: DOWN});
          const n = N.pinch; n.visible = true; n.scale.setScalar(.25); const tip = w3.tipOf('R'); n.position.set(tip.x, tip.y - .03 - (T * .3 % .12), tip.z); L(-.3, .26, -.15, {a: DOWN});
        } else if (i === 2) {                            // bandage: left arm lays a band-aid on the elbow, right arm steadies the wrist
          w3.put('arm', {x: 0, z: .04, yaw: .1}); const el = N.arm.localToWorld(N.arm.userData.elbow.clone()), on = ph > .55;
          const d = loop(.15, .5), x = lerp(-.25, el.x, d), z = lerp(-.1, el.z, d), y = lerp(.2, el.y + .014, d) + .08 * loop(.6, .8);
          L(x, on ? Math.max(y, el.y + .014) : y, z, {open: on ? 1 : 0, a: DOWN}); w3.put('aid', on ? {x: el.x, z: el.z, y: el.y - .002, yaw: .1} : {held: 'L', dir: Math.PI / 2});
          R(.22, .11 - .02 * loop(.2, .3), -.03, {open: .4, a: DOWN});
        } else if (i === 3) {                            // lift a pack with both arms by the top handle
          const lift = .16 * (loop(.25, .45) - loop(.7, .9)); w3.put('pack', {x: 0, z: -.05, y: lift});
          const hy = .37 + lift, g = ph > .15 && ph < .95 ? 0 : 1; L(-.03, hy + g * .06, -.05, {open: g, a: DOWN}); R(.03, hy + g * .06, -.05, {open: g, a: DOWN});
        } else if (i === 4) {                            // cable loop: route the cable end through the clips
          w3.put('clips', {x: 0, z: 0}); const a = ph * Math.PI * 2, e = [.24 + Math.cos(a) * .12, .03 + .05 * Math.max(0, Math.sin(a * 2)), .09 + Math.sin(a) * .08];
          R(e[0], e[1] + .02, e[2], {open: 0, a: DOWN}); L(-.3, .05, .1, {open: 0, a: DOWN});
          const n = N.clips; if (!n.userData.cable) { n.userData.cable = new THREE.Mesh(new THREE.BufferGeometry(), w3.P.M.cableW); n.add(n.userData.cable); }
          if (!(sc.cf = (sc.cf || 0) + 1) || sc.cf % 2 === 0) { const c = n.userData.cable, tip = w3.tipOf('R'); c.geometry.dispose(); c.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V3(-.38, .006, .1), V3(-.3, .006, .1), V3(-.1, .01, .08), V3(.08, .01, -.02), V3((.08 + tip.x) / 2, .012, (tip.z - .02) / 2), V3(tip.x, Math.max(.006, tip.y - .03), tip.z)]), 40, .006, 8, false); }
        } else if (i === 5) {                            // re-tie a ribbon: two arms pull the tails out and up
          w3.put('gift', {x: 0, z: -.04}); const k0 = N.gift.localToWorld(N.gift.userData.knot.clone()), pull = loop(.1, .45) - loop(.65, .95);
          const tl = V3(-.08 - pull * .12, .16 + pull * .1, -.02), tr = V3(.08 + pull * .12, .16 + pull * .1, -.02); L(tl.x, tl.y, tl.z, {open: 0, a: DOWN}); R(tr.x, tr.y, tr.z, {open: 0, a: DOWN});
          const n = N.gift; if (!n.userData.tails) { n.userData.tails = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.BufferGeometry(), w3.P.M.ribbon); w3.scene.add(m); return m; }); n.userData.tails.forEach(m => n.add(m)); }
          n.updateMatrixWorld(); n.userData.tails.forEach((m, j) => { const tp = n.worldToLocal(w3.tipOf(j ? 'R' : 'L').clone().add(V3(0, -.02, 0))), kn = n.userData.knot; m.geometry.dispose(); m.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([kn.clone(), kn.clone().lerp(tp, .5).add(V3(0, -.03, 0)), tp]), 16, .004, 6); });
        } else if (i === 6) {                            // hold a syringe over the white stand
          w3.put('stand', {x: .06, z: 0}); const d = loop(.15, .45) - loop(.7, .95); R(.075, .28 - d * .08, 0, {open: 0, a: DOWN}); w3.put('syr', {held: 'R', dir: Math.PI / 2});
          N.syr.userData.plunger.position.y = .12 + .03 * Math.sin(T * 2); L(-.25, .25, -.1, {a: DOWN});
        }
      },
      draw() {
        const r = glRect(), n = SEEN.length, g = 8, cw = (r.w - 24 - g * (n - 1)) / n, ch = 100, y0 = 70; sc.cards = [];
        SEEN.forEach(([f, name], i) => {
          const x = r.x + 12 + i * (cw + g), on = cfg.seen === i, ih = Math.min(ch - 26, cw * 9 / 16);
          box(x, y0, cw, ch, 10, B.white, on ? B.orange : B.warm2);
          ctx.save(); ctx.beginPath(); ctx.roundRect(x + 5, y0 + 5, cw - 10, ih, 7); ctx.clip(); ctx.fillStyle = B.warm2; ctx.fillRect(x + 5, y0 + 5, cw - 10, ih); poster(seenPosters[f], x + 5, y0 + 5, cw - 10, ih); ctx.restore();
          k.text(name, x + 8, y0 + ch - 9, {size: 12, weight: 600});
          if (on) { ctx.fillStyle = B.orange; dot(x + cw - 12, y0 + ch - 13, 4); }
          sc.cards.push({i, x, y: y0, w: cw, h: ch});
        });
        if (cfg.seen < 0) { card(r.x + r.w / 2 - 190, r.y + r.h * .4, 380, 34); k.text('Click a card: the rig does a short loop of that task.', r.x + r.w / 2, r.y + r.h * .4 + 22, {align: 'center', size: 14, color: B.cool2}); }
        else { card(r.x + 12, r.y + 36, 330, 22); k.label(`Lab bench · ${SEEN[cfg.seen][2]} · stylized loop`, r.x + 20, r.y + 51, {color: B.cool3}); }
      },
      down(p) {
        const c = sc.cards.find(r => inRect(p, r)); if (!c) return false;
        const [f, name, cap] = SEEN[c.i]; cfg.seen = c.i; sc.lt = 0; seenWatched.add(f); clipF(f);
        say(`Seen task · ${cap}. Playing the real robot.`); api.status('Seen · ' + name); record('s1_seen', {clip: f, watched: seenWatched.size});
        return true;
      },
      prompt(x, y, w, h) {
        const f = SEEN[cfg.seen]?.[0], img = f && seenPosters[f];
        if (img?.complete && img.naturalWidth) ctx.drawImage(img, x, y, w, h);
        else k.text('Pick a seen task', x + w / 2, y + h / 2 + 4, {align: 'center', size: 13, color: B.cool2});
      },
      promptCap: () => cfg.seen >= 0 ? SEEN[cfg.seen][2] : 'S1 autonomous execution',
      side(y) { para('S1 executes a wide range of tasks it has seen. The corner clip is the real robot, not this canvas.', 18, y, 204); },
      metric(x, y, w) { k.meter(x, y, w, seenWatched.size / SEEN.length, `Seen clips watched · ${seenWatched.size} / ${SEEN.length}`); },
    },

    skate: {
      clip: 'skate', status: 'Recovery · skateboard wheel', goal: 'Goal: S1 misses, notices, and retries until the wheel is on.',
      hint: 'Run S1 · "Make it fail" forces a miss · drag the wheel', intro: 'Out of distribution: a skateboard wheel. Press Run S1.',
      init: () => ({phase: 'ready', t: 0, st: 'toWheel', stT: 0, tip: [.5, .16], hold: false, wheel: {u: .22, v: .42, rot: 0, r: 18, name: 'wheel'}, ax: [.66, .64], attempts: 0, retries: 0, misses: 0, forcedUsed: 0, fall: null, mark: null}),
      tick(dt) {
        const c = sc, w = c.wheel, sp = .7 * dt;
        if (c.mark) { c.mark.t += dt; if (c.mark.t > 1.6) c.mark = null; }
        if (c.phase !== 'running') return;
        c.t += dt; c.stT += dt;
        if (c.st === 'toWheel') { if (sdrag?.o !== w && toward(c.tip, [w.u, w.v - .03], sp)) { c.st = 'grasp'; c.stT = 0; } }
        else if (c.st === 'grasp') { if (c.stT > .3) { c.hold = true; c.st = 'toAxle'; say(c.attempts ? 'Re-grasped the wheel' : 'Grasped the wheel'); } }
        else if (c.st === 'toAxle') { if (toward(c.tip, [c.ax[0], c.ax[1] - .22], sp)) { c.st = 'insert'; c.stT = 0; c.attempts++; } }
        else if (c.st === 'insert') {
          c.tip[1] = lerp(c.ax[1] - .22, c.ax[1] - .03, clamp(c.stT / .8, 0, 1));
          if (c.stT > .8) {
            const forced = cfg.forced > 0, miss = forced || (c.attempts === 1 && Math.random() < .3);
            c.hold = false;
            if (miss) {
              if (forced) { cfg.forced--; c.forcedUsed++; }
              c.misses++; const sd = Math.random() < .5 ? -1 : 1;
              c.fall = {from: [w.u, w.v], to: [clamp(c.ax[0] + sd * .13, .08, .92), clamp(c.ax[1] - .16, .3, .9)], t: 0}; c.mark = {t: 0}; c.st = 'fall'; flash = 1;
              say(`Attempt ${c.attempts}: missed the axle · the wheel slipped off`);
            } else {
              w.u = c.ax[0]; w.v = c.ax[1]; c.st = 'done'; c.tip[1] -= .1;
              endScenario({outcome: 'success', attempts: c.attempts, retries: c.retries, misses: c.misses, forced_misses: c.forcedUsed},
                c.retries ? `Wheel on after ${c.retries} retr${c.retries > 1 ? 'ies' : 'y'}. Nobody told it to try again.` : 'Wheel on, first try. Press "Make it fail" and run again.', `Wheel on · ${c.retries} retries`);
            }
          }
        }
        else if (c.st === 'fall') { c.fall.t += dt; const f = clamp(c.fall.t / .6, 0, 1); w.u = lerp(c.fall.from[0], c.fall.to[0], f); w.v = lerp(c.fall.from[1], c.fall.to[1], f) - Math.sin(f * Math.PI) * .08; w.rot += dt * 10; if (f >= 1) { c.st = 'notice'; c.stT = 0; say('S1 notices the failure · tries again'); } }
        else if (c.st === 'notice') { if (c.stT > .7) { c.retries++; c.st = 'toWheel'; } }
        if (c.hold) { w.u = c.tip[0]; w.v = c.tip[1] + .03; }
      },
      drags: () => sc.hold ? [] : [sc.wheel],
      sync(dt) {
        w3.env('green'); const c = sc, N = w3.stage('skate', {board: ['skateboard'], wheel: ['wheel']}), [ax, az] = W3(...c.ax), e = N.board.userData.axleEnd;
        w3.put('board', {x: ax - e.x, z: az - e.z}); const w = c.wheel;
        if (c.hold) w3.put('wheel', {held: 'R', dir: Math.PI / 2});
        else if (c.st === 'done') w3.put('wheel', {x: ax, z: az + .004});
        else if (c.st === 'fall') { const f = clamp(c.fall.t / .6, 0, 1); w3.put('wheel', {u: w.u, v: w.v, y: Math.sin(f * Math.PI) * .1, rx: w.rot}); }
        else w3.put('wheel', {u: w.u, v: w.v, rx: 0});
        const [x, z] = W3(...c.tip), low = c.st === 'grasp' || c.st === 'insert' || (c.st === 'toWheel' && Math.hypot(c.tip[0] - w.u, c.tip[1] - w.v + .03) < .03);
        w3.arm('R', x, low ? .06 : c.st === 'done' ? .22 : .15, z, {open: c.hold ? 0 : 1, a: c.hold ? null : DOWN}); w3.armHome('L'); w3.stream(0, null); w3.stream(1, null);
      },
      draw(s, t) {
        const c = sc, r = glRect();
        label3('Axle', c.ax[0] + .06, c.ax[1] - .02, .03);
        if (c.mark) { const [x, y] = P(c.ax, .06), a = 1 - c.mark.t / 1.6; ctx.strokeStyle = `rgba(210,60,40,${a})`; ctx.lineWidth = 3; seg(x - 9, y - 9, x + 9, y + 9); seg(x + 9, y - 9, x - 9, y + 9); k.text('miss', x + 14, y + 4, {size: 12, mono: true, color: `rgba(210,60,40,${a})`, weight: 700}); }
        if (c.st === 'notice') { const [x, y] = P([c.wheel.u, c.wheel.v]); ctx.strokeStyle = B.orange; ctx.lineWidth = 2; ctx.setLineDash([4, 5]); ctx.lineDashOffset = -t * 30; ctx.beginPath(); ctx.ellipse(x, y, 30, 14, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
        if (!c.hold && c.st !== 'done') label3('Wheel · drag it', c.wheel.u, c.wheel.v + .09, 0);
        card(r.x + r.w - 206, r.y + 36, 194, cfg.forced ? 42 : 24); k.text(`Attempt ${c.attempts} · retries ${c.retries}`, r.x + r.w - 20, r.y + 53, {align: 'right', size: 12, mono: true, weight: 600});
        if (cfg.forced) k.text(`Next insertion will miss ×${cfg.forced}`, r.x + r.w - 20, r.y + 71, {align: 'right', size: 11, color: B.orange, weight: 600});
      },
      poster: 'skate',
      promptCap: () => 'Human demo · wheel onto the axle',
      side(y) {
        const c = sc; y = tiles(y, [['TRIES', c.attempts, c.attempts > 0], ['MISSES', c.misses, c.misses > 0], ['RETRY', c.retries, c.retries > 0], ['FORCED', c.forcedUsed, c.forcedUsed > 0]]);
        para('When S1 fails, it often tries again. The post saw this off the shelf, even on out-of-distribution tasks like this one.', 18, y, 204);
      },
      metric(x, y, w) { const c = sc; k.meter(x, y, w, c.st === 'done' ? 1 : c.attempts ? .5 : 0, c.st === 'done' ? `Wheel on · ${c.attempts} attempt${c.attempts > 1 ? 's' : ''}` : `Wheel on axle · attempt ${c.attempts}`); },
    },

    juice: {
      clip: 'orange-juice', status: 'Common sense · juice', goal: 'Goal: set how full the glass is. Compare a naive copy with S1.',
      hint: 'Slider: glass already full · then Run S1', intro: 'The demo pours into an empty glass. Set how full yours is.',
      init: () => { const f = cfg.fill / 100; return {phase: 'ready', t: 0, start: f, nv: {lvl: f, poured: 0, spill: 0, done: false}, s1: {lvl: f, poured: 0, done: false, look: 0}, endT: 0}; },
      tick(dt) {
        const c = sc;
        if (c.phase === 'ready') { c.start = c.nv.lvl = c.s1.lvl = cfg.fill / 100; return; }
        if (c.phase !== 'running') return;
        c.t += dt; const R = .3 * dt, tgt = Math.max(DEMO_FILL, c.start);
        if (!c.nv.done) { c.nv.poured = Math.min(DEMO_FILL, c.nv.poured + R); const tot = c.start + c.nv.poured; c.nv.lvl = Math.min(1, tot); c.nv.spill = Math.max(0, tot - 1); if (c.nv.poured >= DEMO_FILL) c.nv.done = true; }
        if (!c.s1.done) { c.s1.look += dt; if (c.s1.look > .5) { const rem = tgt - c.s1.lvl; if (rem <= .002) c.s1.done = true; else { const add = Math.min(rem, R * clamp(rem / .12, .2, 1)); c.s1.lvl += add; c.s1.poured += add; } } }
        if (c.nv.done && c.s1.done && !c.endT) c.endT = c.t;
        if (c.endT && c.t - c.endT > .4) {
          const sp = c.nv.spill;
          endScenario({start_fill: +c.start.toFixed(2), demo_adds: DEMO_FILL, naive: {final: +c.nv.lvl.toFixed(2), spill: +sp.toFixed(2)}, s1: {final: +c.s1.lvl.toFixed(2), poured: +c.s1.poured.toFixed(2)}, outcome: sp > 0 ? 'naive_overflow_s1_ok' : 'both_ok'},
            sp > 0 ? `Naive copy spilled ${pct(sp)} of a glass. S1 topped off ${pct(c.s1.poured)} and stopped.` : 'No overflow: the glass started low. Try it nearly full.', sp > 0 ? 'S1 topped it off' : 'Both fine · raise the fill');
        }
      },
      sync() {
        w3.env('green'); const c = sc; w3.stage('juice', {gN: ['glass'], gS: ['glass'], jN: ['jug'], jS: ['jug']}); const N = w3.nodes;
        [['N', c.nv, .3, 'L'], ['S', c.s1, .7, 'R']].forEach(([id, st, u, side], i) => {
          const [gx, gz] = W3(u, .62); w3.put('g' + id, {x: gx, z: gz}); N['g' + id].userData.setLevel(st.lvl, st.spill || 0);
          const pouring = c.phase === 'running' && !st.done && (id === 'N' || st.look > .5);
          w3.arm(side, gx - .1, .24, gz, {open: 0}); w3.put('j' + id, {held: side, dir: Math.PI / 2, tilt: pouring ? 1.25 : .1});
          N['j' + id].userData.setLevel(1 - (st.poured || 0) * .7);
          if (pouring) { const j = N['j' + id]; w3.stream(i, j.localToWorld(j.userData.spout.clone()), V3(gx, Math.min(1, st.lvl) * .105 + .004, gz), '#f6a01a'); } else w3.stream(i, null);
        });
      },
      draw() {
        const c = sc, tgt = Math.max(DEMO_FILL, c.start);
        [['Naive trajectory copy', c.nv, .3, false], ['S1 · demo read as a goal', c.s1, .7, true]].forEach(([lab, st, u, isS1]) => {
          label3(lab, u, .62, .36, {color: isS1 ? B.orange : B.cool3, weight: 600});
          const note = isS1 ? (c.phase === 'ready' ? `Target: the demo end state (${pct(tgt)})` : st.done ? `Poured ${pct(st.poured)} · stopped` : 'Topping off…') : (st.spill > 0 ? `Overflow · spilled ${pct(st.spill)} of a glass` : c.phase === 'ready' ? 'Replays the demo pour: +90%' : st.done ? 'Replayed +90%' : 'Replaying +90%…');
          label3(`Fill ${pct(st.lvl)} · ${note}`, u, .82, 0, {color: !isS1 && st.spill > 0 ? B.black : B.cool3, weight: !isS1 && st.spill > 0 ? 600 : 500});
          if (isS1) { const [x, y] = P([u, .62], tgt * .105), [x2] = P([u + .06, .62], tgt * .105); ctx.strokeStyle = B.orange; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; seg(x - (x2 - x), y, x2, y); ctx.setLineDash([]); }
        });
      },
      poster: 'orange-juice',
      promptCap: () => 'Demo: fill an empty glass',
      side(y) { y = tiles(y, [['START', pct(sc.start), false], ['NAIVE', pct(Math.min(1, sc.nv.lvl)), sc.nv.spill > 0], ['S1', pct(sc.s1.lvl), sc.phase === 'done']]); para('The glass is already partly full. A copy of the motion overflows; S1 just tops it off (simulated).', 18, y, 204); },
      metric(x, y, w) { k.meter(x, y, w, sc.nv.spill / .9, `Naive spill · ${pct(sc.nv.spill)} of a glass   S1 spill · 0%`); },
    },

    water: {
      clip: 'pouring-affordance', status: 'Common sense · no watering can', goal: 'Goal: the demo uses a watering can. Watch S1 make do with a cup.',
      hint: 'Run S1 · drag the cup anywhere · toggle the can', intro: 'The prompt waters a plant with a watering can. This table has only a cup.',
      init: () => ({phase: 'ready', t: 0, st: 'toTool', stT: 0, tip: [.5, .16], hold: null, soil: 0, tool: cfg.can ? 'can' : 'cup', home: null,
        cup: {u: .22, v: .72, r: 14, tilt: 0, name: 'cup'}, can: {u: .42, v: .74, r: 20, tilt: 0, name: 'watering can'}, pot: [.76, .7]}),
      tick(dt) {
        const c = sc; if (c.phase !== 'running') return;
        c.t += dt; c.stT += dt; const tool = c[c.tool], sp = .7 * dt;
        if (!c.home) c.home = [tool.u, tool.v];
        if (c.st === 'toTool') { if (sdrag?.o !== tool && toward(c.tip, [tool.u, tool.v - .03], sp)) { c.st = 'grasp'; c.stT = 0; } }
        else if (c.st === 'grasp') { if (c.stT > .3) { c.hold = c.tool; c.home = [tool.u, tool.v]; c.st = 'toPlant'; say(c.tool === 'cup' ? 'No watering can · grasped the cup instead' : 'Grasped the watering can, as in the demo'); } }
        else if (c.st === 'toPlant') { if (toward(c.tip, [c.pot[0] - .1, c.pot[1] - .3], sp)) { c.st = 'pour'; c.stT = 0; } }
        else if (c.st === 'pour') { tool.tilt = Math.min(1, c.stT / .4); c.soil = Math.min(1, c.soil + dt * .4); if (c.soil >= 1) { c.st = 'back'; say('Soil is wet · returning the ' + tool.name); } }
        else if (c.st === 'back') { tool.tilt = Math.max(0, tool.tilt - dt * 3); if (toward(c.tip, [c.home[0], c.home[1] - .03], sp)) { c.hold = null; c.st = 'done';
          endScenario({tool: c.tool, can_available: c.tool === 'can', soil: 1, outcome: 'watered'}, c.tool === 'cup' ? 'Watered with the cup. The prompt never showed a cup.' : 'Watered with the can. Now toggle the can off.', 'Plant watered · ' + c.tool); } }
        if (c.hold) { tool.u = c.tip[0]; tool.v = c.tip[1] + .03; }
      },
      drags: () => [sc.cup, sc.can].filter(o => sc.hold !== (o === sc.cup ? 'cup' : 'can') && (o === sc.cup || sc.tool === 'can')),
      chips: () => [{id: 'can', label: `Watering can on table: ${cfg.can ? 'ON' : 'OFF'}`, on: cfg.can}],
      chip(id) { if (id !== 'can') return; cfg.can = !cfg.can; sc = SCN.water.init(); say(cfg.can ? 'Watering can back on the table.' : 'Watering can removed · only a cup.'); },
      sync() {
        w3.env('green'); const c = sc; w3.stage('water', {cup: ['mug'], can: ['can'], plant: ['pottedPlant']}); const N = w3.nodes, [px, pz] = W3(...c.pot);
        w3.put('plant', {x: px, z: pz}); N.plant.userData.soil.color.set('#4a3323').lerp(new THREE.Color('#231710'), c.soil);
        const dir = t => Math.atan2(px - W3(...c.tip)[0], pz - W3(...c.tip)[1]);
        for (const [id, o] of [['cup', c.cup], ['can', c.can]]) {
          const vis = id === 'cup' || c.tool === 'can' || (c.phase === 'ready' && cfg.can);
          if (c.hold === id) w3.put(id, {held: 'R', dir: dir(), tilt: o.tilt * (N[id].userData.pour || 1)}); else w3.put(id, {u: o.u, v: o.v, hidden: !vis, yaw: -Math.PI / 2});
        }
        const tool = c[c.tool], n = N[c.tool];
        if (c.hold && tool.tilt > .5) w3.stream(0, n.localToWorld(n.userData.spout.clone()), V3(px, .115, pz), '#8bbfe0'); else w3.stream(0, null); w3.stream(1, null);
        const [x, z] = W3(...c.tip), near = !c.hold && Math.hypot(c.tip[0] - tool.u, c.tip[1] - tool.v + .03) < .03;
        w3.arm('R', x, c.st === 'grasp' || near ? nodeG(c.tool) : c.st === 'pour' || c.st === 'toPlant' ? .3 : .2 + (c.hold ? nodeG(c.tool) : 0), z, {open: c.hold ? 0 : 1, a: c.hold ? null : DOWN}); w3.armHome('L');
      },
      draw() {
        const c = sc, r = glRect();
        label3('Plant', c.pot[0], c.pot[1] + .12, 0);
        if (c.hold !== 'cup') label3('Cup', c.cup.u, c.cup.v + .08, 0);
        if (c.tool === 'can' && c.hold !== 'can') label3('Watering can', c.can.u, c.can.v + .1, 0);
        if (c.tool === 'cup') { card(r.x + 12, r.y + 36, 270, 42); k.text('A trajectory copy would reach for:', r.x + 22, r.y + 52, {size: 11, color: B.cool2}); k.text('the watering can · not here → stalls', r.x + 22, r.y + 69, {size: 12, weight: 600, color: B.cool3}); }
      },
      poster: 'pouring-affordance',
      promptCap: () => 'Demo: water the plant with a can',
      side(y) { y = tiles(y, [['TOOL', sc.tool === 'cup' ? 'cup' : 'can', sc.tool === 'cup'], ['SOIL', pct(sc.soil), sc.soil >= 1]]); para('Only a cup is available, so S1 uses the cup. The demo is read as "water the plant", not "move this exact tool".', 18, y, 204); },
      metric(x, y, w) { k.meter(x, y, w, sc.soil, `Soil moisture · ${pct(sc.soil)} (simulated)`); },
    },

    egg: {
      clip: 'eggs', status: 'Demo correction · egg', goal: 'Goal: the demo drops the egg. See S1 place it with control.',
      hint: 'Slider: how early the demonstrator lets go · then Run S1', intro: 'In the prompt, the demonstrator drops the egg too early.',
      init: () => { const mk = kind => ({kind, tip: [.5, .2], egg: {u: .2, v: .72, vy: 0, st: 'carton'}, st: 'toEgg', stT: 0}); return {phase: 'ready', t: 0, P: [mk('naive'), mk('s1')], endT: 0}; },
      tick(dt) {
        const c = sc; if (c.phase !== 'running') return; c.t += dt;
        const relV = .7 - .5 * cfg.dropH / 100;
        for (const p of c.P) {
          p.stT += dt; const e = p.egg, sp = .8 * dt;
          if (p.st === 'toEgg') { if (toward(p.tip, [.2, .66], sp)) { p.st = 'grasp'; p.stT = 0; } }
          else if (p.st === 'grasp') { if (p.stT > .25) { e.st = 'held'; p.st = 'carry'; } }
          else if (p.st === 'carry') { if (toward(p.tip, [.72, p.kind === 'naive' ? relV - .06 : .26], sp)) { if (p.kind === 'naive') { e.st = 'fall'; e.vy = 0; p.st = 'up'; } else p.st = 'lower'; } }
          else if (p.st === 'lower') { if (toward(p.tip, [.72, .64], .16 * dt)) { e.st = 'placed'; e.v = .72; p.st = 'up'; say(`S1 · lowered the ${cfg.obj === 'ball' ? 'ball' : 'egg'} and released it gently`); } }
          else if (p.st === 'up') toward(p.tip, [.5, .2], sp);
          if (e.st === 'held') { e.u = p.tip[0]; e.v = p.tip[1] + .06; }
          if (e.st === 'fall') { e.vy += 3.5 * dt; e.v += e.vy * dt; if (e.v >= .72) { e.v = .72; e.st = .72 - relV > .12 ? 'broken' : 'placed'; say(e.st === 'broken' ? (cfg.obj === 'ball' ? 'Naive copy · let go at the demo height · ball bounced out' : 'Naive copy · let go at the demo height · egg broke') : `Naive copy · low release, ${cfg.obj === 'ball' ? 'ball' : 'egg'} stayed in`); } }
        }
        const landed = c.P.every(p => p.egg.st === 'placed' || p.egg.st === 'broken');
        if (landed && !c.endT) c.endT = c.t;
        if (c.endT && c.t - c.endT > .8) {
          const nv = c.P[0].egg.st, s1 = c.P[1].egg.st;
          endScenario({demo_drop_height: cfg.dropH, naive: nv, s1, outcome: s1 === 'placed' ? 'controlled_placement' : 'fail'}, nv === 'broken' ? 'The copy repeated the mistake. S1 took the demo as a goal and placed the egg.' : 'Low drop this time. Raise the drop height and run again.', 'Egg placed by S1');
        }
      },
      chips: () => [{id: 'eggs', label: '🥚 Egg', on: cfg.obj !== 'ball'}, {id: 'tennis', label: '🎾 Tennis ball', on: cfg.obj === 'ball'}],
      chip(id) { if (sc.phase === 'running') { say('Wait for this run to finish'); return; } cfg.obj = id === 'tennis' ? 'ball' : 'egg'; sc = SCN.egg.init(); clipF(id === 'tennis' ? 'tennis-ball' : 'eggs'); say(id === 'tennis' ? 'Object: a tennis ball · the tennis-ball demo-correction clip plays' : 'Object: an egg · the egg clip plays'); },
      sync() {
        w3.env('green'); const c = sc, ball = cfg.obj === 'ball', obj = ball ? 'tennis' : 'egg';
        w3.stage('egg:' + obj, {cN: ['carton'], bN: ['bowl'], eN: [obj], mN: ['mess'], cS: ['carton'], bS: ['bowl'], eS: [obj], mS: ['mess']});
        const X = (i, u) => (i ? .27 : -.27) + (u - .46) * .5, Y = v => (.72 - v) * .6, Z = -.02;
        c.P.forEach((p, i) => {
          const id = i ? 'S' : 'N', side = i ? 'R' : 'L', e = p.egg, bx = X(i, .72);
          w3.put('c' + id, {x: X(i, .2), z: Z}); w3.put('b' + id, {x: bx, z: Z});
          const broken = e.st === 'broken';
          w3.put('m' + id, {x: bx, z: Z, y: .006, hidden: !broken || ball});
          if (e.st === 'held') w3.put('e' + id, {held: side, dir: Math.PI / 2});
          else if (e.st === 'carton') w3.put('e' + id, {x: X(i, .2), z: Z, y: .02});
          else if (broken) w3.put('e' + id, ball ? {x: bx + .14, z: Z + .05, y: 0} : {hidden: true});
          else w3.put('e' + id, {x: X(i, e.u), z: Z, y: Math.max(.006, Y(e.v))});
          w3.arm(side, X(i, p.tip[0]), Y(p.tip[1]) + .035, Z, {open: e.st === 'held' ? 0 : 1, a: e.st === 'held' ? null : DOWN});
        });
        w3.stream(0, null); w3.stream(1, null);
      },
      draw() {
        const c = sc, relV = .7 - .5 * cfg.dropH / 100, ball = cfg.obj === 'ball';
        c.P.forEach((p, i) => {
          const isS1 = p.kind === 's1', x0 = (i ? .27 : -.27), u = x0 + .5, pr = (x, y) => w3.project(V3(x, y, -.02), glRect());
          const a = pr(x0, .42); ctx.font = '600 11px Geist, system-ui, sans-serif'; const lab = isS1 ? 'S1 · controlled placement' : 'Naive trajectory copy', w = ctx.measureText(lab).width + 14;
          card(a.x - w / 2, a.y - 12, w, 20, .85); k.text(lab, a.x, a.y + 2, {align: 'center', size: 11, weight: 600, color: isS1 ? B.orange : B.cool3});
          if (!isS1) { const y = (.72 - relV) * .6, q1 = pr(x0 + .04, y), q2 = pr(x0 + .2, y); ctx.strokeStyle = B.cool2; ctx.setLineDash([3, 4]); ctx.lineWidth = 1.2; seg(q1.x, q1.y, q2.x, q2.y); ctx.setLineDash([]); k.text('demo release', q2.x + 4, q2.y + 4, {size: 10, mono: true, color: B.cool3}); }
          const res = p.egg.st === 'broken' ? (ball ? 'Bounced out' : 'Broken') : p.egg.st === 'placed' ? (ball ? 'In the bowl' : 'Intact') : '';
          if (res) { const b = pr(x0 + .13, .12); card(b.x - 44, b.y - 12, 88, 20, .9); k.text(res, b.x, b.y + 3, {align: 'center', size: 12, weight: 700, color: p.egg.st === 'placed' ? B.orange : B.black}); }
          void u;
        });
      },
      poster: () => cfg.obj === 'ball' ? 'tennis-ball' : 'eggs',
      promptCap: () => 'Demo: the egg slips, lands in a mess',
      side(y) { const [a, b] = sc.P.map(p => p.egg.st); y = tiles(y, [['DROP', cfg.dropH, false], ['NAIVE', a === 'broken' ? '✗' : a === 'placed' ? '✓' : '–', false], ['S1', b === 'placed' ? '✓' : '–', b === 'placed']]); para('S1 treats the demo as a goal specification, not a trajectory to copy: it does the step with a controlled motion.', 18, y, 204); },
      metric(x, y, w) { const n = sc.P.filter(p => p.egg.st === 'placed').length; k.meter(x, y, w, n / 2, `Eggs intact · ${n} / 2 (naive + S1)`); },
    },

    levels: {
      clip: 'blue-juice', status: 'Robustness L1–L5', goal: 'Goal: pick a robustness level and watch S1 adapt the plan.',
      hint: 'Pick L1–L5 (keys 1–5) · Run S1 · drag objects', intro: 'L1 = training placement. Each level moves further from it.',
      init() {
        const lv = cfg.level, [cm, deg] = LVSHIFT[lv];
        const objs = LOBJ.map(([id, lab, alt, u, v, r]) => {
          let nu = u, nv = v, rot = 0;
          if (cm) { const a = Math.random() * Math.PI * 2; nu += Math.cos(a) * cm / 100; nv += Math.sin(a) * cm / 100 / .62; rot = (Math.random() < .5 ? -1 : 1) * deg * Math.PI / 180; }
          if (lv === 5 && (id === 'block' || id === 'bowl')) nu = 1 - u;
          return {id, name: lv === 4 ? alt : lab, u: clamp(nu, .08, .92), v: clamp(nv, .45, .84), r, rot, lift: lv === 4 && (id === 'block' || id === 'mug') ? 15 : 0, base: [u, v], train: u < .5 ? 'L' : 'R'};
        });
        return {phase: 'ready', t: 0, objs, step: 0, stT: 0, opp: 0, arms: {L: {tip: [.3, .3], hold: null, home: [.3, .3]}, R: {tip: [.7, .3], hold: null, home: [.7, .3]}}, actArm: []};
      },
      tick(dt) {
        const c = sc; if (c.phase !== 'running') return; c.t += dt; c.stT += dt;
        const O = id => c.objs.find(o => o.id === id), act = LACT[c.step], o = O(act[1]);
        let armId = act[0] === 'pick' ? (o.u < .5 ? 'L' : 'R') : (c.arms.L.hold === o ? 'L' : 'R');
        const arm = c.arms[armId], other = c.arms[armId === 'L' ? 'R' : 'L'];
        if (!other.hold) toward(other.tip, other.home, .5 * dt);
        const goal = act[0] === 'pick' ? [o.u, o.v] : (tg => [tg.u, tg.v - .02])(O(act[2]));
        if (sdrag?.o === o && act[0] === 'pick') { c.stT = 0; return; }
        if (!toward(arm.tip, goal, .7 * dt)) c.stT = 0;
        else if (c.stT > .3) {
          if (act[0] === 'pick') { arm.hold = o; c.actArm[c.step] = armId; if (armId !== o.train) { c.opp++; say(`${armId === 'L' ? 'Left' : 'Right'} arm takes the ${o.name.toLowerCase()} · the other arm than in training`); } else say(`${armId === 'L' ? 'Left' : 'Right'} arm · grasp ${o.name.toLowerCase()}`); }
          else { arm.hold = null; o.u = goal[0]; o.v = goal[1] + .02; o.lift = 0; c.actArm[c.step] = armId; if (armId !== o.train) c.opp++; say(`Placed the ${o.name.toLowerCase()}`); }
          c.step++; c.stT = 0;
          if (c.step >= LACT.length) { const lv = cfg.level;
            endScenario({level: lv, shift_cm: LVSHIFT[lv][0], rot_deg: LVSHIFT[lv][1], swapped: lv === 4, lifted_cm: lv === 4 ? 15 : 0, opposite_arm_actions: c.opp, outcome: 'complete_simulated'},
              `L${lv} done${c.opp ? ` · ${c.opp} of 4 actions on the other arm` : ''}. Same weights, same one video.`, `L${lv} complete (simulated)`); }
        }
        for (const a of Object.values(c.arms)) if (a.hold) { a.hold.u = a.tip[0]; a.hold.v = a.tip[1] + .02; }
      },
      drags: () => sc.objs.filter(o => sc.arms.L.hold !== o && sc.arms.R.hold !== o),
      chips: () => [1, 2, 3, 4, 5].map(n => ({id: 'L' + n, label: 'L' + n, on: cfg.level === n})).concat([{id: 'shuffle', label: '↻ Reshuffle'}]),
      chip(id) { if (id === 'shuffle') { sc = SCN.levels.init(); say('New random placement for L' + cfg.level); } else setLevel(+id.slice(1)); },
      sync() {
        w3.env('green'); const c = sc, lv = cfg.level, alt = lv === 4;
        w3.stage('levels:' + lv + ':' + c.seed, {block: ['block', alt], bowl: ['lbowl', alt], mug: ['lmug', alt], coaster: ['coaster', alt], rB: ['riser'], rM: ['riser']});
        const O = id => c.objs.find(o => o.id === id);
        for (const o of c.objs) o.r0 ??= [o.u, o.v];
        w3.put('rB', {u: O('block').r0[0], v: O('block').r0[1], hidden: !alt}); w3.put('rM', {u: O('mug').r0[0], v: O('mug').r0[1], hidden: !alt});
        const yOf = o => { if (o.lift) return .15; for (const tid of ['bowl', 'coaster']) { const q = O(tid); if (q !== o && Math.hypot(q.u - o.u, q.v - o.v) < .06) return nodeTop(tid); } return 0; };
        for (const o of c.objs) { const side = c.arms.L.hold === o ? 'L' : c.arms.R.hold === o ? 'R' : null; w3.put(o.id, side ? {held: side, dir: Math.PI / 2 + o.rot} : {u: o.u, v: o.v, y: yOf(o), yaw: o.rot}); }
        const act = LACT[c.step];
        for (const side of ['L', 'R']) {
          const a = c.arms[side], [x, z] = W3(...a.tip), hg = a.hold ? nodeG(a.hold.id) : 0; let y = .26 + hg;
          if (act && c.phase === 'running') { const o = O(act[1]), goal = act[0] === 'pick' ? [o.u, o.v] : [O(act[2]).u, O(act[2]).v - .02];
            if (Math.hypot(goal[0] - a.tip[0], goal[1] - a.tip[1]) < .015 && (act[0] === 'pick' ? !a.hold : a.hold === o)) y = act[0] === 'pick' ? nodeG(o.id) + yOf(o) : nodeTop(act[2]) + hg + .004; }
          w3.arm(side, x, y, z, {open: a.hold ? 0 : 1, a: a.hold ? null : DOWN});
        }
        w3.stream(0, null); w3.stream(1, null);
      },
      draw() {
        const c = sc, r = glRect();
        for (const o of c.objs) {
          const [gx, gy] = P(o.base, .002); ctx.strokeStyle = B.cool1; ctx.lineWidth = 1.2; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.ellipse(gx, gy, o.r + 6, (o.r + 6) * .45, 0, 0, 7); ctx.stroke();
          const [x, y] = P([o.u, o.v], .002); if (Math.hypot(x - gx, y - gy) > 8 && !Object.values(c.arms).some(a => a.hold === o)) seg(gx, gy, x, y); ctx.setLineDash([]);
          if (!Object.values(c.arms).some(a => a.hold === o)) label3(o.name + (o.lift ? ' · +15 cm' : ''), o.u, o.v + .09, 0);
        }
        card(r.x + 12, r.y + 36, 360, 22); k.text(`L${cfg.level} · ${LVTXT[cfg.level]}`, r.x + 22, r.y + 51, {size: 12, color: B.cool3});
      },
      poster: 'blue-juice',
      promptCap: () => 'Demo: block → bowl, mug → coaster',
      side(y, t) {
        k.label('Plan · arm per action', 18, y);
        LACT.forEach(([a, o, to], i) => {
          const yy = y + 20 + i * 18, done = i < sc.step, obj = sc.objs.find(q => q.id === o), arm = sc.actArm[i] || (obj.u < .5 ? 'L' : 'R'), opp = arm !== obj.train;
          ctx.fillStyle = done ? B.orange : i === sc.step && sc.phase === 'running' ? B.black : B.warm2; dot(24, yy - 4, i === sc.step && sc.phase === 'running' ? 5 + Math.sin(t * 8) : 5);
          k.text(`${arm} · ${a} ${o}${to ? ' → ' + to : ''}${opp ? ' ⇄' : ''}`, 38, yy, {size: 12, mono: true, color: opp ? B.orange : B.cool2, weight: opp ? 600 : 400});
        });
        drawChart(18, y + 110, 204, Math.min(150, k.h - y - 140));
      },
      metric(x, y, w) { k.meter(x, y, w, sc.step / LACT.length, `L${cfg.level} · actions ${sc.step} / 4 · on the other arm: ${sc.opp}`); },
    },

    kitchen: {
      clip: 'pancakes', status: 'Mitsui kitchen pilot', goal: 'Goal: record one new plating step. S1 runs it on the tray line.',
      hint: 'Pick an item, click a slot in the demo tray · Run S1 · click a tray to nudge it', intro: 'Pilot: S1-powered robots in Mitsui & Co. commercial kitchens.',
      init: () => ({phase: 'ready', t: 0, trays: [], spawned: 0, spawn: 0, plated: 0, nudges: 0, tip: [.5, .22], st: 'idle', stT: 0, target: null, hold: false, demo: 0}),
      slot(tr) { const i = cfg.comp, cu = tr.u, cv = .66 + tr.dv; return {cu, cv, su: cu + (i % 2 ? .05 : -.05), sv: cv + (i > 1 ? .035 : -.035) / .62}; },
      tick(dt) {
        const c = sc; if (c.phase !== 'running') return; c.t += dt; c.stT += dt;
        if (c.t < 1.4) { c.demo = c.t / 1.4; return; } c.demo = 1;
        c.spawn -= dt; if (c.spawn <= 0 && c.spawned < 8) { c.trays.push({u: -.12, dv: 0, served: false}); c.spawned++; c.spawn = 3; }
        for (const tr of c.trays) tr.u += .1 * dt;
        c.trays = c.trays.filter(tr => tr.u < 1.2);
        const s = SA(), BIN = [.3, .2], sp = 1.1 * dt;
        if (c.st === 'idle') { toward(c.tip, [.5, .22], sp); c.target = c.trays.find(tr => !tr.served && tr.u > .18 && tr.u < .62); if (c.target) c.st = 'toBin'; }
        else if (c.st === 'toBin') { if (toward(c.tip, BIN, sp)) { c.st = 'grab'; c.stT = 0; } }
        else if (c.st === 'grab') { if (c.stT > .2) { c.hold = true; c.st = 'toTray'; } }
        else if (c.st !== 'idle' && !c.trays.includes(c.target)) { c.st = 'idle'; c.hold = false; }
        else if (c.st === 'toTray') { const q = SCN.kitchen.slot(c.target); if (toward(c.tip, [q.su, q.sv], sp + .1 * dt)) { c.st = 'place'; c.stT = 0; } }
        else if (c.st === 'place') { const q = SCN.kitchen.slot(c.target); c.tip[0] = q.su; c.tip[1] = q.sv;
          if (c.stT > .25) { c.hold = false; c.target.served = true; c.plated++; c.st = 'idle';
            if (c.plated >= 8) endScenario({item: ITEMS[cfg.item][0], compartment: cfg.comp, trays_plated: c.plated, nudges: c.nudges, outcome: 'complete'}, `8 trays plated from one demo${c.nudges ? `, ${c.nudges} nudged trays re-targeted` : ''}. Pilot, simulated.`, 'Tray line done (simulated)'); } }
      },
      chips: () => ITEMS.map(([n], i) => ({id: 'i' + i, label: n, on: cfg.item === i})),
      chip(id) { if (sc.phase === 'running') { say('Finish this run first · the new demo applies to the next run'); return; } cfg.item = +id.slice(1); sc = SCN.kitchen.init(); say(`Demo item: ${ITEMS[cfg.item][0].toLowerCase()}`); },
      down(p) {
        if (p.x >= 18 && p.x <= 222 && p.y >= 36 && p.y <= 151) {
          if (sc.phase === 'running') { say('Finish this run first'); return true; }
          cfg.comp = (p.x > 120 ? 1 : 0) + (p.y > 93 ? 2 : 0); sc = SCN.kitchen.init(); say(`Demo slot: ${['top left', 'top right', 'bottom left', 'bottom right'][cfg.comp]}`); return true;
        }
        const s = SA();
        for (const tr of sc.trays) { const q = SCN.kitchen.slot(tr), [cx, cy] = P([q.cu, q.cv]); if (Math.hypot(p.x - cx, p.y - cy) < 40) { tr.dv = tr.dv > 0 ? -.06 : .06; sc.nudges++; say(tr.served ? 'Nudged a plated tray' : 'Nudged a tray · S1 re-targets'); return true; } }
        return false;
      },
      itemDot(x, y, i, r = 7) { const col = ITEMS[i][1]; ctx.fillStyle = col || B.white; dot(x, y, r); if (!col) { ctx.strokeStyle = B.cool1; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); } },
      sync() {
        w3.env('kitchen'); const c = sc, specs = {bin: ['hotelPan', cfg.item], belt: ['conveyor'], held: ['item', cfg.item]};
        for (let i = 0; i < 8; i++) { specs['t' + i] = ['bento', cfg.comp]; specs['p' + i] = ['item', cfg.item]; }
        w3.stage('kitchen:' + cfg.item + ':' + cfg.comp, specs);
        const [bx, bz] = W3(.3, .2), [, lz] = W3(.5, .66); w3.put('bin', {x: bx, z: bz}); w3.put('belt', {x: 0, z: lz});
        const used = new Set();
        for (const tr of c.trays) { tr.i ??= (c._n = (c._n ?? -1) + 1) % 8; used.add(tr.i); const q = SCN.kitchen.slot(tr), [x, z] = W3(q.cu, q.cv), [sx, sz] = W3(q.su, q.sv);
          w3.put('t' + tr.i, {x, z, y: .02, hidden: Math.abs(x) > .88}); w3.put('p' + tr.i, {x: sx, z: sz, y: .032, hidden: !tr.served || Math.abs(x) > .88}); }
        for (let i = 0; i < 8; i++) if (!used.has(i)) { w3.put('t' + i, {hidden: true}); w3.put('p' + i, {hidden: true}); }
        w3.put('held', c.hold ? {held: 'R', dir: Math.PI / 2} : {hidden: true});
        const [x, z] = W3(...c.tip), low = c.st === 'grab' ? .075 : c.st === 'place' ? .07 : .18;
        w3.arm('R', x, low, z, {open: c.hold ? 0 : 1, a: c.hold ? null : DOWN}); w3.armHome('L'); w3.stream(0, null); w3.stream(1, null);
      },
      draw() {
        const c = sc, r = glRect();
        card(r.x + 12, r.y + 36, 290, 24); box(r.x + 18, r.y + 40, 52, 16, 8, B.black); k.text('PILOT', r.x + 44, r.y + 52, {align: 'center', size: 10, mono: true, color: B.orange, weight: 600});
        k.text('Mitsui & Co. · commercial kitchens', r.x + 78, r.y + 53, {size: 12, color: B.cool3});
        card(r.x + r.w - 116, r.y + 36, 104, 24); k.text(`${c.plated} / 8 trays`, r.x + r.w - 22, r.y + 53, {align: 'right', size: 13, mono: true, weight: 600});
        label3(`Bin · ${ITEMS[cfg.item][0].toLowerCase()}`, .3, .3, 0);
      },
      prompt(x, y, w, h, t) {
        const tw = w - 40, th = h - 44, tx = x + 20, tyy = y + 30;
        box(tx, tyy, tw, th, 8, B.cool4);
        for (let i = 0; i < 4; i++) { const sx = tx + (i % 2) * tw / 2 + 6, sy = tyy + (i > 1 ? th / 2 : 0) + 5; box(sx, sy, tw / 2 - 12, th / 2 - 10, 5, i === cfg.comp ? B.cool3 : B.cool2, i === cfg.comp ? B.orange : null); if (i !== cfg.comp) { ctx.fillStyle = B.warm3; dot(sx + tw / 4 - 6, sy + th / 4 - 5, 6); } }
        const i = cfg.comp, gx = tx + (i % 2) * tw / 2 + tw / 4, gy = tyy + (i > 1 ? th / 2 : 0) + th / 4, f = sc.phase === 'running' ? sc.demo : (t % 2.5) / 2.5;
        this.itemDot(lerp(x + w - 10, gx, clamp(f * 1.4, 0, 1)), lerp(y + 12, gy, clamp(f * 1.4, 0, 1)), cfg.item, 7);
        ctx.fillStyle = B.warm3; ctx.globalAlpha = .8; ctx.beginPath(); ctx.ellipse(lerp(x + w - 6, gx + 6, clamp(f * 1.4, 0, 1)), lerp(y + 4, gy - 10, clamp(f * 1.4, 0, 1)), 13, 8, -.4, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
        k.label('your demo · click a slot', x + 8, y + 16);
      },
      promptCap: () => `Demo: ${ITEMS[cfg.item][0].toLowerCase()} → ${['top left', 'top right', 'bottom left', 'bottom right'][cfg.comp]}`,
      side(y) {
        y = para('Mitsui & Co. is piloting S1-powered general-purpose robots in commercial kitchens. One video of a new step, no post-training.', 18, y, 204) + 8;
        box(18, y, 204, 70, 10, B.warm1, B.warm2);
        k.label('Context · not a Skild output', 30, y + 18);
        k.text('Mitsui supply chains:', 30, y + 38, {size: 12, color: B.cool3});
        k.text('1.4M meals/day across Japan', 30, y + 56, {size: 13, weight: 600});
      },
      metric(x, y, w) { k.meter(x, y, w, sc.plated / 8, `Trays plated this run (simulated) · ${sc.plated} / 8`); },
    },
  };

  function drawChart(x, y, w, h) {                       // stylized bars: ICL vs language-prompted VLA across L1–L5
    if (h < 90) return;
    k.label('Success vs level · stylized', x, y);
    const top = y + 14, bh = h - 58, base = top + bh, gw = w / 5;
    for (let i = 0; i < 5; i++) {
      const gx = x + i * gw, on = cfg.level === i + 1;
      if (on) box(gx + 1, top - 2, gw - 2, bh + 20, 5, B.warm1);
      const b1 = bh * CHART.icl[i], b2 = bh * CHART.vla[i];
      ctx.fillStyle = B.orange; ctx.fillRect(gx + gw * .2, base - b1, gw * .28, b1);
      ctx.fillStyle = B.cool1; ctx.fillRect(gx + gw * .52, base - b2, gw * .28, b2);
      k.text('L' + (i + 1), gx + gw / 2, base + 13, {align: 'center', size: 10, mono: true, color: on ? B.black : B.cool2, weight: on ? 700 : 500});
    }
    ctx.fillStyle = B.orange; ctx.fillRect(x, base + 22, 8, 8); k.text('ICL (S1)', x + 12, base + 30, {size: 10, color: B.cool3});
    ctx.fillStyle = B.cool1; ctx.fillRect(x + 72, base + 22, 8, 8); k.text('Language-prompted VLA', x + 84, base + 30, {size: 10, color: B.cool3});
    k.text('stylized from Fig. 5 · up to 3× more degradation at L5', x, base + 44, {size: 9, mono: true, color: B.cool2});
  }

  function setLevel(n) { cfg.level = n; sc = SCN.levels.init(); say(`L${n}: ${LVTXT[n]}`); api.status(`Robustness · L${n}`); }
  function runScenario() {
    if (mode === 'tasks' || mode === 'seen') return;
    if (sc.phase === 'running') { say('Already running.'); return; }
    sc = SCN[mode].init(); sc.phase = 'running'; api.status('S1 running · same weights'); clipF(SCN[mode].clip);
    say(mode === 'kitchen' ? 'Reading your demo · 1 video into the context window' : 'Run · 1 video in context, 0 gradient steps');
  }
  function scDown(p) {
    const S = SCN[mode], c = scRects.find(r => inRect(p, r));
    if (c) { S.chip?.(c.id); return; }
    if (S.down?.(p)) return;
    const s = SA(); let best = null, bd = 1e9;
    for (const o of S.drags?.() || []) { const [x, y] = SP(o.u, o.v, s), d = Math.hypot(p.x - x, p.y - y); if (d < o.r + 12 && d < bd) { bd = d; best = o; } }
    if (best) sdrag = {o: best, moved: 0};
  }
  function scMove(p) {
    if (!sdrag) return; const o = sdrag.o, [u, v] = U(p.x, p.y);
    const nu = clamp(u, .06, .94), nv = clamp(v, .3, .92);
    sdrag.moved += Math.hypot(nu - o.u, nv - o.v); o.u = nu; o.v = nv; if (o.lift) o.lift = 0;
  }
  function scUp() {
    if (!sdrag) return;
    if (sdrag.moved > .03) say(sc.phase === 'running' ? `Moved the ${sdrag.o.name.toLowerCase()} · S1 re-targets` : `Moved the ${sdrag.o.name.toLowerCase()}`);
    sdrag = null;
  }
  function drawScenario(t) {
    const S = SCN[mode], s = SA(), r = glRect();
    S.sync(k.dt, t); w3.render(k.dt, r, mode === 'seen' ? view([.02, .1, -.05], 1.2, .55) : mode === 'kitchen' ? view([0, .08, -.1], 1.6, .62) : view(), lightNow());
    ctx.clearRect(0, 0, k.w, k.h); header();
    k.text(S.goal, s.x + 20, 28, {size: 15, weight: 600});
    k.label(S.hint, s.x + 20, 48);
    scRects = S.chips ? chips(k, S.chips(), s.x + 20, 56, k.w - 20) : [];
    S.draw(s, t);
    if (flash > 0) { ctx.fillStyle = `rgba(255,126,0,${flash * .14})`; ctx.fillRect(r.x, r.y, r.w, r.h); }
    if (sc.phase === 'done') {                           // success banner at the top of the 3D view
      const cw = Math.min(420, r.w - 40), cx = r.x + (r.w - cw) / 2;
      box(cx, r.y + 64, cw, 30, 10, B.orange); k.text(log[log.length - 1].slice(0, 64), cx + 14, r.y + 83, {size: 12, weight: 600, color: '#121212'});
    }
    ctx.fillStyle = B.white; ctx.fillRect(0, 0, 240, k.h); ctx.fillStyle = B.warm2; ctx.fillRect(240, 0, 1, k.h);
    k.label(mode === 'seen' ? 'Seen task' : 'Prompt (context)', 18, 26);
    ctx.save(); ctx.beginPath(); ctx.roundRect(18, 36, 204, 115, 8); ctx.clip(); ctx.fillStyle = B.warm2; ctx.fillRect(18, 36, 204, 115);
    if (S.poster) { const n = typeof S.poster === 'function' ? S.poster() : S.poster; if (!poster(posterOf(n), 18, 36, 204, 115)) k.text('loading poster…', 120, 98, {align: 'center', size: 12, color: B.cool2});
      ctx.fillStyle = 'rgba(18,18,18,.62)'; ctx.fillRect(18, 131, 204, 20); k.text('official clip poster · corner plays it', 26, 145, {size: 10, mono: true, color: '#f4f3ef'}); }
    else S.prompt(18, 36, 204, 115, t);
    ctx.restore();
    ctx.strokeStyle = B.warm2; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(18, 36, 204, 115, 8); ctx.stroke();
    k.text(S.promptCap(), 18, 168, {size: 12, color: B.cool2});
    S.side(194, t);
    k.label('Weights', 18, k.h - 20); k.text('frozen · 0 updates', 80, k.h - 20, {mono: true, size: 11, color: B.black});
    const bx = r.x + 20, bw = Math.max(160, Math.min(r.w - 40, k.w - 370 - bx)), my = k.h - 132;
    card(bx - 10, my - 20, bw + 20, 126);
    S.metric(bx, my, bw);
    drawLog(k, log.slice(-4), bx, k.h - 88, bw, 4);
  }
  function setMode(id) {
    mode = id; drag = null; sdrag = null;
    root.querySelectorAll('.s1-prompt').forEach(x => x.remove());
    modeBtns.forEach(b => b.classList.toggle('on', b.dataset.m === id));
    const vis = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };
    buttons.forEach(b => vis(b, id === 'tasks')); vis(watchBtn, id === 'tasks');
    vis(runBtn, id !== 'tasks' && id !== 'seen'); vis(failBtn, id === 'skate');
    vis(fillSl.parentElement, id === 'juice'); vis(dropSl.parentElement, id === 'egg');
    if (id === 'tasks') { log = [task ? `Back to ${task.label}.` : 'Pick a prompt video below.']; api.status(task ? 'Task · ' + task.short : 'Pick a prompt'); if (task) clipF(task.clip); return; }
    const S = SCN[id]; sc = S.init(); log = [S.intro]; api.status(S.status); clipF(S.clip);
  }
  const modeBtns = MODES.map(([id, lab]) => { const b = k.button(lab, () => setMode(id)); b.dataset.m = id; b.classList.toggle('on', id === 'tasks'); return b; });
  const buttons = Object.entries(TASKS).map(([id, t]) => { const b = k.button(t.short, () => choose(id)); b.dataset.id = id; return b; });
  const watchBtn = k.button('Watch the prompt clip', () => {
    if (!task) { say('Pick a task first.'); return; }
    root.querySelectorAll('.s1-prompt').forEach(x => x.remove());
    const v = document.createElement('video'); Object.assign(v, {src: BASE + task.prompt + '.mp4', autoplay: true, controls: true, playsInline: true, muted: true});
    v.className = 's1-prompt'; v.style.cssText = 'position:absolute;left:16px;top:16px;width:420px;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.3);background:#000;z-index:2';
    const close = document.createElement('button'); close.textContent = '×'; close.className = 'close s1-prompt'; close.style.cssText = 'position:absolute;left:444px;top:16px;z-index:3';
    close.onclick = () => { v.remove(); close.remove(); };
    root.querySelector('.try-canvas').append(v, close);
  }, {primary: true});
  k.onKey(e => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (mode === 'levels') { const n = '12345'.indexOf(e.key); if (n >= 0) setLevel(n + 1); return; }
    if (mode !== 'tasks') return;
    const i = '1234'.indexOf(e.key); if (i >= 0) choose(Object.keys(TASKS)[i]);
  });
  const runBtn = k.button('Run S1', runScenario, {primary: true});
  const failBtn = k.button('↯ Make it fail', () => { cfg.forced++; say(`The next insertion will miss (×${cfg.forced}) · watch S1 notice and retry`); if (mode === 'skate' && sc.phase !== 'running') runScenario(); });
  const fillSl = k.slider('Glass already full %', 0, 95, cfg.fill, v => { cfg.fill = v; if (mode === 'juice' && sc?.phase === 'running') say('Applies to the next run'); else if (mode === 'juice' && sc?.phase === 'done') sc = SCN.juice.init(); }, 5);
  const dropSl = k.slider('Demo drop height', 0, 100, cfg.dropH, v => { cfg.dropH = v; if (mode === 'egg' && sc?.phase === 'done') sc = SCN.egg.init(); }, 5);
  [runBtn, failBtn, fillSl.parentElement, dropSl.parentElement].forEach(el => { el.style.display = 'none'; });
  api.status('Pick a prompt');
  return () => { w3.dispose(); k.destroy(); };
}
