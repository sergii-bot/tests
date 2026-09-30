// TRY · Hardware Lab — "Teleoperation lab". Drive a 6-DOF arm from an operator console (keys or a joystick pad),
// record demonstrations at 20 Hz, then replay the last good demo as an open-loop "policy" on a slightly moved scene.
// The honest point: teleop is the richest data, but one demo does not generalize. It needs scale and diversity.
import * as THREE from '../../vendor/three.module.js';
import {kit, B, clamp, lerp, rand} from './kit.js';

const LS_KEY = 'skild-hall:teleop';
const HZ = 20, MAX_S = 400, SPEED = .22, TURN = 1.6, TILT = 1.3;
const D1 = .2, A2 = .38, A3 = .36, D6 = .16, FLANGE = .04, TIP = D6 - FLANGE;   // link lengths (m)
const BASE = new THREE.Vector3(0, 0, -.32), SHOULDER = new THREE.Vector3(0, D1, -.32);
const DEG = Math.PI / 180;
const LIM = [[-170, 170], [-60, 100], [0, 160], [-185, 185], [-125, 125], [-270, 270]].map(([a, b]) => [a * DEG, b * DEG]);
const JN = [['J1', 'Base yaw'], ['J2', 'Shoulder'], ['J3', 'Elbow'], ['J4', 'Wrist roll'], ['J5', 'Wrist pitch'], ['J6', 'Tool roll']];
const HOME = new THREE.Vector3(0, .24, .02);
const YMIN = .024, BOX = {x: [-.46, .46], y: [YMIN, .46], z: [-.18, .36]};
const BIN = {x: -.3, z: .05, hx: .1, hz: .08, h: .1, wall: .008, floor: .01};
const BOWL = {x: .28, z: -.08, r: .07, h: .045};
const LAYOUT0 = {b0: [-.1, .17, .2], b1: [.05, .23, -.3], b2: [.17, .12, .5], cup: [.1, 0, 0]};
const TASKS = {
  stack: {label: 'Stack 3 blocks', short: 'Stack', clip: 'Series C', goal: 'stack the 3 blocks into one tower', objs: ['b0', 'b1', 'b2']},
  bin: {label: 'Put the cup in the bin', short: 'Cup in bin', clip: 'Series C', goal: 'put the cup in the bin', objs: ['cup']},
  pour: {label: 'Pour', short: 'Pour', clip: 'coffee', goal: 'tilt the cup over the bowl and pour', objs: ['cup']},
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), DOWN = V(0, -1, 0);
const near = (a, ref) => a + 2 * Math.PI * Math.round((ref - a) / (2 * Math.PI));
const r3 = v => Math.round(v * 1000) / 1000;
const smooth = t => t * t * (3 - 2 * t);
const cloneLayout = l => Object.fromEntries(Object.entries(l).map(([k2, v]) => [k2, v.slice()]));
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _s = V();

// Kinematic chain (no meshes): yaw, pitch, pitch, roll, pitch, roll. Links run along each group's local +y.
export function chain() {
  const G = (parent, y) => { const g = new THREE.Group(); g.position.y = y; parent.add(g); return g; };
  const root = new THREE.Group(); root.position.copy(BASE);
  const g1 = G(root, .06), g2 = G(g1, D1 - .06), g3 = G(g2, A2), g4 = G(g3, A3 * .55), g5 = G(g4, A3 * .45), g6 = G(g5, FLANGE), tip = G(g6, TIP);
  const set = q => { g1.rotation.y = q[0]; g2.rotation.x = q[1]; g3.rotation.x = q[2]; g4.rotation.y = q[3]; g5.rotation.x = q[4]; g6.rotation.y = q[5]; root.updateMatrixWorld(true); };
  return {root, g: [g1, g2, g3, g4, g5, g6], tip, set};
}
// Tool orientation: approach axis points down, rotated by psi (wrist yaw) and tilted by theta about the finger axis.
export function toolFrame(psi, theta) {
  const x = V(Math.cos(psi), 0, -Math.sin(psi)), c = V().crossVectors(x, DOWN);
  const a = DOWN.clone().multiplyScalar(Math.cos(theta)).addScaledVector(c, Math.sin(theta));
  const z = V().crossVectors(x, a);
  return {q: new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(x, a, z)), a};
}
// Analytic IK (spherical wrist): position from J1–J3, orientation from J4–J6 (Y-X-Y Euler). Returns {ok, q} or {ok:false, j, why}.
export function solveIK(p, psi, theta, prev) {
  const {q: qt, a} = toolFrame(psi, theta);
  const d = p.clone().addScaledVector(a, -D6).sub(SHOULDER);
  const r = Math.hypot(d.x, d.z), h = d.y;
  if (r < .06) return {ok: false, j: 0, why: 'too close to the base'};
  const q1 = Math.atan2(d.x, d.z);
  const D = (r * r + h * h - A2 * A2 - A3 * A3) / (2 * A2 * A3);
  if (D > 1) return {ok: false, j: 2, why: 'out of reach'};
  if (D < -1) return {ok: false, j: 2, why: 'too close'};
  const beta = Math.acos(D);
  const phi2 = Math.PI / 2 - (Math.atan2(h, r) + Math.atan2(A3 * Math.sin(beta), A2 + A3 * Math.cos(beta)));
  _q.setFromAxisAngle(Y, q1).multiply(_qa.setFromAxisAngle(X, phi2 + beta)).invert().multiply(qt);
  const e = _m.makeRotationFromQuaternion(_q).elements;               // column-major
  const b = Math.acos(clamp(e[5], -1, 1));
  let a4, c6;
  if (Math.sin(b) > 1e-4) { a4 = Math.atan2(e[4], e[6]); c6 = Math.atan2(e[1], -e[9]); } else { c6 = prev[5]; a4 = Math.atan2(e[8], e[0]) - c6; }
  const inL = (v, j) => v >= LIM[j][0] && v <= LIM[j][1];
  let best = null, bc = 1e9;
  for (const [s4, s5, s6] of [[a4, b, c6], [a4 + Math.PI, -b, c6 + Math.PI]]) {
    const w = [near(s4, prev[3]), s5, near(s6, prev[5])];
    if (!inL(w[0], 3) || !inL(w[1], 4) || !inL(w[2], 5)) continue;
    const cost = Math.abs(w[0] - prev[3]) + Math.abs(w[1] - prev[4]) + Math.abs(w[2] - prev[5]);
    if (cost < bc) { bc = cost; best = w; }
  }
  const q = [q1, phi2, beta];
  for (let j = 0; j < 3; j++) if (!inL(q[j], j)) return {ok: false, j, why: 'at its limit'};
  if (!best) return {ok: false, j: 4, why: 'at its limit'};
  return {ok: true, q: [...q, ...best]};
}

function drawLog(k, lines, x, y, w, maxRows) {
  if (maxRows <= 0) return;
  const rows = []; k.ctx.font = '500 12px Geist, system-ui, sans-serif';
  lines.forEach((l, li) => { let cur = ''; for (const wd of l.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (k.ctx.measureText(t).width > w && cur) { rows.push([cur, li]); cur = wd; } else cur = t; } rows.push([cur, li]); });
  rows.slice(-maxRows).forEach(([t, li], i) => k.text(t, x, y + i * 16, {size: 12, color: li === lines.length - 1 ? B.black : B.cool2}));
}
const lum = hex => { const n = parseInt(String(hex).slice(1), 16); return ((n >> 16 & 255) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114) / 255; };
const inR = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

export default function mount(root, api) {
  const k = kit(root); const {ctx} = k;
  const clip = m => api.clip?.(m), record = (kind, d) => api.record?.(kind, d);
  const wrap = root.querySelector('.try-canvas');
  k.canvas.style.position = 'relative'; k.canvas.style.zIndex = '1';

  // ---------- WebGL view ----------
  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({antialias: true}); } catch (err) { console.warn('Teleop lab: WebGL unavailable', err); }
  const gl = renderer ? renderer.domElement : null;
  if (renderer) {
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.style.cssText = 'position:absolute;left:0;top:0;border-radius:12px;z-index:0;pointer-events:none';
    wrap.prepend(gl);
  }
  const scene = new THREE.Scene();
  const mats = [];
  const M = (o = {}, basic = false) => { const m = basic ? new THREE.MeshBasicMaterial(o) : new THREE.MeshStandardMaterial({roughness: .55, metalness: .08, ...o}); mats.push(m); return m; };
  const mat = {
    body: M({color: '#161616', roughness: .42, metalness: .35}), shell: M({color: '#2b2f33', roughness: .5, metalness: .3}),
    joint: M({color: '#FF7E00', toneMapped: false}, true), bench: M({color: '#ffffff', roughness: .85}), floor: M({color: B.warm1, roughness: 1}),
    leg: M({color: '#c1bcb3'}), block: [M(), M(), M()], cup: M({side: THREE.DoubleSide}), liquid: M({color: '#6B3E1F', roughness: .3}),
    bin: M(), bowl: M({side: THREE.DoubleSide}), finger: M({color: '#2b2f33', roughness: .5, metalness: .3}),
    ring: M({color: '#FF7E00', transparent: true, opacity: .55, side: THREE.DoubleSide, depthWrite: false, toneMapped: false}, true),
    grasp: M({color: '#FF7E00', side: THREE.DoubleSide, toneMapped: false}, true),
  };
  const lineMat = new THREE.LineBasicMaterial({color: '#FF7E00', transparent: true, opacity: .7, toneMapped: false});
  const gridMat = new THREE.LineBasicMaterial({color: '#E6E4DD', transparent: true, opacity: .8});
  mats.push(lineMat, gridMat);
  const mesh = (geo, m, parent, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const boxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const cylG = (r, h, seg = 24, r2 = r, open = false) => new THREE.CylinderGeometry(r, r2, h, seg, 1, open);
  const capX = (parent, r, len, y) => { mesh(cylG(r, len, 20), mat.joint, parent, 0, y, 0).rotation.z = Math.PI / 2; };
  const ringY = (parent, r, y) => { mesh(new THREE.TorusGeometry(r, .007, 8, 32), mat.joint, parent, 0, y, 0).rotation.x = Math.PI / 2; };

  // workbench
  mesh(boxG(1.7, .05, 1), mat.bench, scene, 0, -.025, 0);
  for (const [x, z] of [[-.8, -.45], [.8, -.45], [-.8, .45], [.8, .45]]) mesh(boxG(.05, .7, .05), mat.leg, scene, x, -.4, z);
  const floor = mesh(new THREE.PlaneGeometry(14, 14), mat.floor, scene, 0, -.75, 0); floor.rotation.x = -Math.PI / 2; floor.castShadow = false;
  { const gp = []; for (let x = -.8; x <= .801; x += .1) gp.push(x, .0006, -.5, x, .0006, .5); for (let z = -.5; z <= .501; z += .1) gp.push(-.85, .0006, z, .85, .0006, z);
    scene.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)), gridMat)); }
  const hemi = new THREE.HemisphereLight('#ffffff', '#d9d6cf', 1.3); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 1.9); sun.position.set(.7, 1.8, 1.1); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left: -1, right: 1, top: 1, bottom: -1, near: .5, far: 5}); sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -.0005; sun.shadow.normalBias = .01; scene.add(sun);

  // robot
  const ch = chain(); scene.add(ch.root);
  const [g1, g2, g3, g4, g5, g6] = ch.g;
  mesh(cylG(.11, .06, 32), mat.body, ch.root, 0, .03, 0); ringY(ch.root, .105, .06);
  mesh(cylG(.08, .08, 28), mat.shell, g1, 0, .04, 0); mesh(boxG(.1, .08, .1), mat.shell, g1, 0, .1, 0); capX(g1, .055, .15, D1 - .06);
  mesh(boxG(.075, A2, .075), mat.shell, g2, 0, A2 / 2, 0); capX(g2, .048, .12, A2);
  mesh(boxG(.065, A3 * .55, .065), mat.shell, g3, 0, A3 * .275, 0); ringY(g3, .042, A3 * .55);
  mesh(boxG(.055, A3 * .45 - .04, .055), mat.body, g4, 0, (A3 * .45 - .04) / 2 + .005, 0); capX(g4, .036, .1, A3 * .45);
  mesh(boxG(.05, .04, .05), mat.body, g5, 0, .02, 0); ringY(g5, .034, FLANGE);
  mesh(cylG(.032, .012), mat.shell, g6, 0, .006, 0); mesh(boxG(.11, .04, .05), mat.body, g6, 0, .05, 0);
  const fingers = [mesh(boxG(.012, .07, .032), mat.finger, g6, .045, .105, 0), mesh(boxG(.012, .07, .032), mat.finger, g6, -.045, .105, 0)];
  mesh(new THREE.SphereGeometry(.006, 10, 8), mat.joint, g6, 0, TIP, 0);
  mesh(boxG(.03, .02, .02), mat.body, g6, 0, .055, .035);
  const wristCam = new THREE.PerspectiveCamera(78, 1.5, .005, 4); wristCam.position.set(0, .06, .042); wristCam.rotation.x = Math.PI / 2 - .3; g6.add(wristCam);

  // objects
  const objs = [];
  const blockG = boxG(.05, .05, .05);
  ['b0', 'b1', 'b2'].forEach((id, i) => { const g = new THREE.Group(); mesh(blockG, mat.block[i], g); scene.add(g); objs.push({id, kind: 'block', g, hs: .025, h: .05, pos: V(), yaw: 0, held: false, falling: false, vy: 0, tx: 0, ty: 0, tz: 0, inBin: false, off: new THREE.Matrix4()}); });
  const cg = new THREE.Group(); scene.add(cg);
  mesh(cylG(.035, .09, 28, .03, true), mat.cup, cg); mesh(cylG(.03, .006, 24), mat.cup, cg, 0, -.042, 0);
  const liq = mesh(cylG(.031, 1, 20, .028), mat.liquid, cg); liq.castShadow = false;
  mesh(new THREE.TorusGeometry(.02, .006, 8, 16, Math.PI), mat.cup, cg, .036, 0, 0).rotation.z = -Math.PI / 2;
  objs.push({id: 'cup', kind: 'cup', g: cg, hs: .035, h: .09, pos: V(), yaw: 0, held: false, falling: false, vy: 0, tx: 0, ty: 0, tz: 0, inBin: false, off: new THREE.Matrix4()});
  const cup = objs[3], byId = id => objs.find(o => o.id === id);
  const binG = new THREE.Group(); binG.position.set(BIN.x, 0, BIN.z); scene.add(binG);
  mesh(boxG(BIN.hx * 2, BIN.floor, BIN.hz * 2), mat.bin, binG, 0, BIN.floor / 2, 0);
  for (const s of [-1, 1]) { mesh(boxG(BIN.hx * 2, BIN.h, BIN.wall), mat.bin, binG, 0, BIN.h / 2, s * (BIN.hz - BIN.wall / 2)); mesh(boxG(BIN.wall, BIN.h, BIN.hz * 2), mat.bin, binG, s * (BIN.hx - BIN.wall / 2), BIN.h / 2, 0); }
  const bowlG = new THREE.Group(); bowlG.position.set(BOWL.x, 0, BOWL.z); scene.add(bowlG);
  mesh(cylG(BOWL.r, BOWL.h, 40, BOWL.r * .72, true), mat.bowl, bowlG, 0, BOWL.h / 2, 0); mesh(cylG(BOWL.r * .72, .004, 32), mat.bowl, bowlG, 0, .002, 0);
  mesh(new THREE.TorusGeometry(BOWL.r, .005, 8, 48), mat.joint, bowlG, 0, BOWL.h, 0).rotation.x = Math.PI / 2;
  const bowlLiq = mesh(cylG(BOWL.r * .8, .004, 32, BOWL.r * .76), mat.liquid, bowlG, 0, .006, 0); bowlLiq.visible = false;
  // aids: drop line under the tool, aim ring, grasp-ready ring
  const dropLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3)), lineMat); dropLine.frustumCulled = false; scene.add(dropLine);
  const aim = new THREE.Mesh(new THREE.RingGeometry(.016, .022, 32), mat.ring); aim.rotation.x = -Math.PI / 2; scene.add(aim);
  const graspRing = new THREE.Mesh(new THREE.RingGeometry(.04, .047, 40), mat.grasp); graspRing.rotation.x = -Math.PI / 2; graspRing.visible = false; scene.add(graspRing);
  // pour particles
  const PN = 90, partMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.0045, 6, 4), mat.liquid, PN); partMesh.frustumCulled = false; scene.add(partMesh);
  const parts = Array.from({length: PN}, () => ({p: V(), v: V(), life: 0})); let partI = 0, partAcc = 0;
  const _o = new THREE.Object3D();

  const cam = new THREE.PerspectiveCamera(36, 1.6, .05, 30), camT = V(0, .15, -.02), CAM_R = 1.4;
  let camYaw = 0, camPitch = .55;
  const placeCam = () => { cam.position.set(camT.x + Math.sin(camYaw) * Math.cos(camPitch) * CAM_R, camT.y + Math.sin(camPitch) * CAM_R, camT.z + Math.cos(camYaw) * Math.cos(camPitch) * CAM_R); cam.lookAt(camT); };

  // ---------- state ----------
  let taskId = 'stack', layout = cloneLayout(LAYOUT0), mode = 'op', homing = null, rec = null, rp = null, lastDemo = null;
  const tgt = {p: HOME.clone(), psi: 0, theta: 0};
  let q = [0, 0, Math.PI / 2, 0, 0, 0];
  { const s0 = solveIK(tgt.p, 0, 0, q); if (s0.ok) q = s0.q; }
  let closed = false, grip = 0, held = null, taskT = 0, done = false, failed = null, card = null, fade = 0, completed = false;
  let liquid = 1, bowlFill = 0, spilled = 0, pourState = 0, noise = 2, limT = 0, traceAcc = 0;
  const cmd = V(), keys = new Set(), pad = {x: 0, y: 0, z: 0, drag: null}, limFlash = [0, 0, 0, 0, 0, 0], trace = [], recStamps = [];
  let orbit = null, hit = {};
  const tally = {ok: 0, fail: 0};
  const stats = (() => { try { const s = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); return {demos: +s.demos || 0, seconds: +s.seconds || 0, ok: +s.ok || 0}; } catch { return {demos: 0, seconds: 0, ok: 0}; } })();
  const saveStats = () => { try { localStorage.setItem(LS_KEY, JSON.stringify({demos: stats.demos, seconds: +stats.seconds.toFixed(1), ok: stats.ok})); } catch {} };
  let log = ['Teleop maps images and proprioception to joint torques.', 'Drive the arm: W/S · A/D · Q/E, arrows for the wrist, Space to grip.'];
  const say = s => { log.push(s); if (log.length > 20) log.shift(); };
  const oname = o => o.kind === 'cup' ? 'the cup' : `block ${+o.id[1] + 1}`;
  const task = () => TASKS[taskId];
  const tipPos = () => _s.setFromMatrixPosition(ch.tip.matrixWorld).clone();
  const syncObj = o => { if (!o.held) { o.g.position.copy(o.pos); o.g.quaternion.setFromAxisAngle(Y, o.yaw); } o.g.updateMatrixWorld(true); };

  // ---------- physics-lite: where does a released object come to rest? ----------
  const restY = p => p.falling ? p.ty : p.pos.y, restXZ = p => p.falling ? [p.tx, p.tz] : [p.pos.x, p.pos.z];
  function settle(o) {
    let x = o.pos.x, z = o.pos.z;
    const pushBox = (cx, cz, hx, hz) => { const dx = x - cx, dz = z - cz; if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) return false; if (hx - Math.abs(dx) < hz - Math.abs(dz)) x = cx + Math.sign(dx || 1) * (hx + .003); else z = cz + Math.sign(dz || 1) * (hz + .003); return true; };
    for (let it = 0; it < 6; it++) {
      let moved = false;
      const bx = x - BIN.x, bz = z - BIN.z;
      o.inBin = Math.abs(bx) < BIN.hx - BIN.wall - o.hs && Math.abs(bz) < BIN.hz - BIN.wall - o.hs;
      if (!o.inBin) moved = pushBox(BIN.x, BIN.z, BIN.hx + o.hs, BIN.hz + o.hs) || moved;          // landed on a wall: slides off outside
      const dx = x - BOWL.x, dz = z - BOWL.z, dd = Math.hypot(dx, dz), rr = BOWL.r + o.hs + .003;
      if (dd < rr) { x = BOWL.x + (dd > 1e-4 ? dx / dd : 1) * rr; z = BOWL.z + (dd > 1e-4 ? dz / dd : 0) * rr; moved = true; }
      for (const p of objs) {
        if (p === o || p.held) continue;
        const [qx, qz] = restXZ(p), px = x - qx, pz = z - qz, reach = o.hs + p.hs;
        if (Math.abs(px) >= reach || Math.abs(pz) >= reach) continue;
        if (restY(p) - p.h / 2 >= o.pos.y + o.h / 2 - .012) continue;                                   // p sits above o: not in the way
        const beside = restY(p) + p.h / 2 > o.pos.y - o.h / 2 + .012;
        if (!beside && p.kind === 'block' && Math.abs(px) < p.hs && Math.abs(pz) < p.hs) continue;     // centre over the block: rests on it
        moved = pushBox(qx, qz, reach, reach) || moved;                                                // otherwise it slides off
      }
      x = clamp(x, -.8, .8); z = clamp(z, -.46, .46);
      if (!moved) break;
    }
    let base = o.inBin ? BIN.floor : 0;
    for (const p of objs) {
      if (p === o || p.held || p.kind !== 'block') continue;
      const [qx, qz] = restXZ(p);
      if (Math.abs(x - qx) < p.hs && Math.abs(z - qz) < p.hs) { const top = restY(p) + p.h / 2; if (top <= o.pos.y - o.h / 2 + .012) base = Math.max(base, top); }
    }
    o.tx = x; o.tz = z; o.ty = base + o.h / 2;
    if (o.pos.y < o.ty) o.pos.y = o.ty;
    o.falling = o.pos.y > o.ty + .001 || Math.hypot(x - o.pos.x, z - o.pos.z) > .001; o.vy = 0;
  }
  const settleAll = () => objs.filter(o => !o.held).sort((a, b) => a.pos.y - b.pos.y).forEach(settle);
  function release(o) {
    const e = new THREE.Euler().setFromQuaternion(o.g.quaternion, 'YXZ'); o.yaw = e.y; o.pos.copy(o.g.position); settle(o);
  }
  function candidate() {
    const tp = tipPos(); let best = null, bd = 1e9;
    for (const o of objs) { if (o.held) continue; const d = o.pos.distanceTo(tp); if (d < (o.kind === 'cup' ? .04 : .034) && d < bd) { bd = d; best = o; } }
    return best;
  }
  function toggleGrip() {
    closed = !closed;
    if (closed) {
      const o = candidate();
      if (o) { objs.forEach(syncObj); held = o; o.held = true; o.falling = false; o.inBin = false; o.off.copy(ch.tip.matrixWorld).invert().multiply(o.g.matrixWorld); settleAll(); say(`Grasped ${oname(o)}`); }
      else say('Gripper closed on nothing');
    } else if (held) { const o = held; held = null; o.held = false; release(o); say(`Released ${oname(o)}`); }
    else say('Gripper open');
  }

  // ---------- target → IK ----------
  function accept(p, psi, th) {
    if (held && p.y < tgt.p.y) { const bottom = p.y + (held.pos.y - tgt.p.y) - held.h / 2; if (bottom < -.002) return false; }
    const s = solveIK(p, psi, th, q);
    if (s.ok) { tgt.p.copy(p); tgt.psi = psi; tgt.theta = th; q = s.q; return true; }
    limFlash[s.j] = 1;
    if (limT <= 0) { say(`${JN[s.j][0]} ${JN[s.j][1].toLowerCase()} ${s.why}`); limT = 1.5; }
    return false;
  }
  function tryMove(vel, dpsi, dth, dt) {
    const np = tgt.p.clone().addScaledVector(vel, dt);
    np.x = clamp(np.x, ...BOX.x); np.y = clamp(np.y, ...BOX.y); np.z = clamp(np.z, ...BOX.z);
    const nth = clamp(tgt.theta + dth, -1.95, 1.95), npsi = tgt.psi + dpsi;
    if (np.distanceTo(tgt.p) < 1e-7 && !dpsi && nth === tgt.theta) return;
    if (accept(np, npsi, nth)) return;
    if (dpsi || nth !== tgt.theta) accept(tgt.p.clone(), npsi, nth);                                  // slide along the limit
    for (const ax of ['x', 'y', 'z']) { if (np[ax] === tgt.p[ax]) continue; const p2 = tgt.p.clone(); p2[ax] = np[ax]; accept(p2, tgt.psi, tgt.theta); }
  }
  function home(then) {
    if (held) { const o = held; held = null; o.held = false; release(o); }
    closed = false; cmd.set(0, 0, 0);
    homing = {p0: tgt.p.clone(), psi0: tgt.psi, th0: tgt.theta, t: 0, then};
  }

  // ---------- episodes ----------
  function resetScene(lay) {
    if (held) { held.held = false; held = null; } closed = false;
    for (const o of objs) { const [x, z, yaw] = lay[o.id]; o.pos.set(x, o.h / 2, z); o.yaw = yaw; o.falling = false; o.vy = 0; o.inBin = false; o.held = false; }
    liquid = 1; bowlFill = 0; spilled = 0; parts.forEach(p => { p.life = 0; });
    done = false; failed = null; taskT = 0; fade = 1;
  }
  function cancelRuns() {
    if (rec) { rec = null; setRecBtn(); say('Recording discarded'); }
    if (rp) { rp = null; mode = 'op'; say('Replay stopped'); }
  }
  function chooseTask(id) {
    cancelRuns();
    taskId = id; resetScene(layout); home(); card = null;
    taskBtns.forEach(b => b.classList.toggle('on', b.dataset.id === id));
    clip(TASKS[id].clip); api.status(`${TASKS[id].short} · drive the arm`); say(`Task: ${TASKS[id].label}. Timer running.`);
  }
  function toggleRecord() {
    if (mode === 'replay') { say('Wait for the replay to finish.'); return; }
    if (rec) { stopRecord(); return; }
    resetScene(layout); card = null;
    rec = {task: taskId, t: 0, acc: 0, samples: [], layout: cloneLayout(layout), live: false, successAt: null};
    home(() => { if (rec) { rec.live = true; api.status('Recording demo'); say('Recording at 20 Hz. Do the task.'); } });
    setRecBtn(); clip('Series C');
  }
  function stopRecord(reason) {
    const r = rec; rec = null; setRecBtn();
    if (!r) return;
    if (r.samples.length < 10) { say('Demo too short · not saved'); return; }
    const success = done && r.successAt != null, dur = +(r.samples.length / HZ).toFixed(2);
    record('teleop_demo', {task: r.task, duration_s: dur, success, samples: r.samples});
    stats.demos++; stats.seconds += dur; if (success) stats.ok++; saveStats();
    if (reason) say(reason);
    if (success) {
      lastDemo = r; replayBtn.disabled = false;
      card = {ok: true, title: `Demo saved · ${TASKS[r.task].short} · ${dur} s · ${r.samples.length} samples`, sub: 'Now press "Replay as policy". Then try Randomize objects.'};
      say(`Demo saved: ${r.samples.length} samples, success.`); api.status('Demo recorded');
      if (!completed) { completed = true; api.complete('Teleop demo recorded'); }
    } else {
      card = {ok: false, title: `Demo saved · not successful · ${dur} s`, sub: 'Failed demos are data too. Record a successful one to replay it.'};
      say(`Demo saved: ${r.samples.length} samples, no success.`); api.status('Demo saved');
    }
  }
  function startReplay() {
    if (!lastDemo) { say('Record one successful demo first.'); return; }
    if (rec) { say('Stop recording first.'); return; }
    if (mode === 'replay') return;
    if (taskId !== lastDemo.task) { taskId = lastDemo.task; taskBtns.forEach(b => b.classList.toggle('on', b.dataset.id === taskId)); }
    const lay = cloneLayout(layout);
    for (const id in lay) { const a = rand(0, Math.PI * 2), m = noise / 100 * rand(.5, 1); lay[id][0] += Math.cos(a) * m; lay[id][1] += Math.sin(a) * m; }
    resetScene(lay); settleAll();
    const ids = TASKS[taskId].objs;
    const moved = ids.reduce((s, id) => { const o = byId(id), d = lastDemo.layout[id]; return s + Math.hypot((o.falling ? o.tx : o.pos.x) - d[0], (o.falling ? o.tz : o.pos.z) - d[1]); }, 0) / ids.length * 100;
    mode = 'replay'; card = null;
    rp = {t: 0, s: lastDemo.samples, moved, noise, live: false, doneAt: null};
    home(() => { if (rp) rp.live = true; });
    api.status('Policy replay · hands off'); clip('Series C');
    say(`Open-loop replay of your demo. Objects moved ${moved.toFixed(1)} cm on average.`);
  }
  function finishReplay() {
    const r = rp; rp = null; mode = 'op';
    const ok = done, m = r.moved.toFixed(1);
    if (ok) tally.ok++; else tally.fail++;
    record('teleop_replay', {task: taskId, noise_cm: r.noise, moved_cm: +m, success: ok});
    card = ok ? {ok: true, title: `Pure replay succeeded · objects moved ${m} cm`, sub: 'Small shifts can still work. Raise the noise or Randomize objects.'}
      : {ok: false, title: `Pure replay failed · objects moved ${m} cm`, sub: 'One demo does not generalize. Teleop data needs scale and diversity.'};
    say(ok ? 'Replay succeeded.' : 'Replay failed. Teleop alone can’t reach foundation-model scale: Skild adds human video and simulation.');
    if (!ok) clip('prompt');
    api.status(ok ? 'Replay succeeded' : 'Replay failed');
  }
  function randomize() {
    if (rec || mode === 'replay') { say('Stop the recording or replay first.'); return; }
    const lay = {}, placed = [];
    for (const id of ['b0', 'b1', 'b2', 'cup']) {
      let got = null;
      for (let n = 0; n < 80 && !got; n++) {
        const [x0, z0] = LAYOUT0[id], x = clamp(x0 + rand(-.1, .1), -.2, .22), z = clamp(z0 + rand(-.08, .08), -.05, .26);
        if (placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < .09)) continue;
        if (Math.abs(x - BIN.x) < BIN.hx + .05 && Math.abs(z - BIN.z) < BIN.hz + .05) continue;
        if (Math.hypot(x - BOWL.x, z - BOWL.z) < BOWL.r + .07) continue;
        got = [x, z, rand(-.8, .8)];
      }
      lay[id] = got || LAYOUT0[id].slice(); placed.push(lay[id]);
    }
    layout = lay; resetScene(layout); home(); card = null;
    if (lastDemo) { const ids = TASKS[lastDemo.task].objs; const d = ids.reduce((s, id) => s + Math.hypot(lay[id][0] - lastDemo.layout[id][0], lay[id][1] - lastDemo.layout[id][1]), 0) / ids.length * 100; say(`Objects randomized · ${d.toFixed(1)} cm from your demo scene`); }
    else say('Objects randomized');
  }

  // ---------- per-frame steps ----------
  function operatorStep(dt) {
    const kd = c => keys.has(c) ? 1 : 0, dz = v => Math.abs(v) < .08 ? 0 : v;
    const f = clamp(kd('KeyW') - kd('KeyS') - dz(pad.y), -1, 1), r = clamp(kd('KeyD') - kd('KeyA') + dz(pad.x), -1, 1), u = clamp(kd('KeyQ') - kd('KeyE') + dz(pad.z), -1, 1);
    const want = V(-Math.sin(camYaw), 0, -Math.cos(camYaw)).multiplyScalar(f * SPEED).addScaledVector(V(Math.cos(camYaw), 0, -Math.sin(camYaw)), r * SPEED); want.y = u * SPEED;
    cmd.lerp(want, 1 - Math.exp(-12 * dt));
    if (cmd.lengthSq() < 1e-8) cmd.set(0, 0, 0);
    tryMove(cmd, (kd('ArrowLeft') - kd('ArrowRight')) * TURN * dt, (kd('ArrowDown') - kd('ArrowUp')) * TILT * dt, dt);   // ↑ tips the cup away from you
  }
  function homingStep(dt) {
    homing.t = Math.min(1, homing.t + dt / .7); const s = smooth(homing.t);
    const p = homing.p0.clone().lerp(HOME, s), psi = lerp(homing.psi0, 0, s), th = lerp(homing.th0, 0, s);
    if (!accept(p, psi, th)) { const s0 = solveIK(p, psi, th, q); if (s0.ok) { q = s0.q; tgt.p.copy(p); tgt.psi = psi; tgt.theta = th; } }
    if (homing.t >= 1) { const fn = homing.then; homing = null; tgt.p.copy(HOME); tgt.psi = 0; tgt.theta = 0; fn?.(); }
  }
  function replayStep(dt) {
    if (!rp.live) return;
    rp.t += dt;
    const s = rp.s, fi = rp.t * HZ, i = Math.min(s.length - 1, Math.floor(fi)), j = Math.min(s.length - 1, i + 1), u = clamp(fi - i, 0, 1), A = s[i], Bs = s[j];
    accept(V(lerp(A[1], Bs[1], u), lerp(A[2], Bs[2], u), lerp(A[3], Bs[3], u)), lerp(A[4], Bs[4], u), lerp(A[5], Bs[5], u));
    if (!!A[12] !== closed) toggleGrip();
    if (done && rp.doneAt == null) rp.doneAt = rp.t;
    if ((rp.doneAt != null && rp.t - rp.doneAt > .8) || rp.t > s.length / HZ + 1.2) finishReplay();
  }
  function pourStep(dt) {
    pourState = 0;
    if (!cup.held || liquid <= 0) return;
    const up = V(0, 1, 0).applyQuaternion(cup.g.quaternion), tilt = Math.acos(clamp(up.y, -1, 1));
    if (tilt < 1.05) return;
    const rim = DOWN.clone().addScaledVector(up, -DOWN.dot(up)); if (rim.lengthSq() < 1e-6) rim.set(1, 0, 0); rim.normalize();
    const sp = cup.pos.clone().addScaledVector(up, .045).addScaledVector(rim, .035);
    const flow = Math.min(liquid, clamp((tilt - 1.05) * .9, .12, .6) * dt); liquid -= flow;
    const inBowl = Math.hypot(sp.x - BOWL.x, sp.z - BOWL.z) < BOWL.r - .012 && sp.y > BOWL.h;
    if (inBowl) bowlFill += flow; else spilled += flow;
    pourState = inBowl ? 1 : -1;
    partAcc += dt * 70;
    while (partAcc >= 1) { partAcc--; const P = parts[partI]; partI = (partI + 1) % PN; P.p.copy(sp); P.v.copy(rim).multiplyScalar(.25).add(V(rand(-.03, .03), rand(-.02, .02), rand(-.03, .03))); P.life = 1.2; }
  }
  function particles(dt) {
    for (let i = 0; i < PN; i++) {
      const P = parts[i];
      if (P.life > 0) { P.v.y -= 9.8 * dt; P.p.addScaledVector(P.v, dt); P.life -= dt; if (P.p.y < (Math.hypot(P.p.x - BOWL.x, P.p.z - BOWL.z) < BOWL.r ? .012 : .002)) P.life = 0; }
      _o.position.copy(P.p); _o.scale.setScalar(P.life > 0 ? 1 : 0); _o.updateMatrix(); partMesh.setMatrixAt(i, _o.matrix);
    }
    partMesh.instanceMatrix.needsUpdate = true;
  }
  function stackHeight() {
    const bl = objs.filter(o => o.kind === 'block' && !o.held && !o.falling).sort((a, b) => a.pos.y - b.pos.y), lvl = new Map(); let best = 0;
    for (const o of bl) {
      let l = 1;
      for (const p of bl) if (lvl.has(p) && Math.abs(o.pos.x - p.pos.x) < p.hs && Math.abs(o.pos.z - p.pos.z) < p.hs && Math.abs(o.pos.y - o.h / 2 - p.pos.y - p.h / 2) < .01) l = Math.max(l, lvl.get(p) + 1);
      lvl.set(o, l); best = Math.max(best, l);
    }
    return best;
  }
  function progress() {
    if (taskId === 'stack') { const h = stackHeight(); return {v: h / 3, txt: `Tower height ${h}/3`, ok: h === 3 && objs.every(o => o.kind !== 'block' || (!o.held && !o.falling))}; }
    if (taskId === 'bin') { const ok = cup.inBin && !cup.held && !cup.falling; return {v: ok ? 1 : cup.held ? .5 : 0, txt: ok ? 'Cup is in the bin' : cup.held ? 'Cup in the gripper' : 'Cup on the table', ok}; }
    return {v: clamp(bowlFill / .6, 0, 1), txt: `Poured ${Math.round(bowlFill * 100)}% · spilled ${Math.round(spilled * 100)}%`, ok: bowlFill >= .6};
  }
  function onDone() {
    done = true; const t = taskT.toFixed(1);
    say(`${task().short} done in ${t} s`);
    if (rec?.live) { rec.successAt = rec.t; card = {ok: true, title: `${task().short} done · ${t} s`, sub: 'Saving the demo…'}; }
    else if (mode === 'replay') { if (rp) rp.doneAt = rp.t; }
    else { card = {ok: true, title: `${task().short} done · ${t} s`, sub: 'Press ● Record demo to capture a run like this.'}; api.status(`${task().short} done`); }
  }

  let lastTheme = '';
  function theme() {
    const key = B.warm1 + B.white; if (key === lastTheme) return; lastTheme = key;
    const dark = lum(B.warm1) < .3;
    mat.bench.color.set(dark ? '#262a2f' : '#ffffff'); mat.floor.color.set(B.warm1); mat.leg.color.set(B.warm3); gridMat.color.set(dark ? '#33383e' : B.warm2);
    mat.block[0].color.set(dark ? '#d9d6cf' : '#2E3A47'); mat.block[1].color.set(dark ? '#9AA3AB' : '#5C6670'); mat.block[2].color.set('#8E8177');
    mat.cup.color.set(dark ? '#e6e4dd' : '#C1BCB3'); mat.bin.color.set(dark ? '#4A535C' : '#5C6670'); mat.bowl.color.set(dark ? '#3B4148' : '#E6E4DD');
    mat.shell.color.set(dark ? '#4A535C' : '#2b2f33'); mat.body.color.set(dark ? '#2b2f33' : '#161616');
    hemi.intensity = dark ? 1 : 1.3; hemi.groundColor.set(dark ? '#0e1012' : '#d9d6cf'); sun.intensity = dark ? 1.4 : 1.9;
  }

  const L = () => {
    const lw = 270, vx = lw + 16, vy = 58, vw = Math.max(220, k.w - vx - 16), vh = Math.max(150, k.h - vy - 132);
    const iw = Math.round(clamp(vw * .3, 150, 260)), ih = Math.round(iw * .66);
    return {lw, vx, vy, vw, vh, iw, ih, ix: vx + vw - iw - 12, iy: vy + 12, bw: Math.max(220, k.w - 356 - vx)};
  };
  let glW = 0, glH = 0;

  k.frame((dt, t) => {
    theme();
    limT -= dt; for (let j = 0; j < 6; j++) limFlash[j] = Math.max(0, limFlash[j] - dt * 2.5);
    if (pad.drag !== 'xy') { const s = 1 - Math.exp(-10 * dt); pad.x = lerp(pad.x, 0, s); pad.y = lerp(pad.y, 0, s); }
    if (pad.drag !== 'z') pad.z = lerp(pad.z, 0, 1 - Math.exp(-10 * dt));
    if (homing) homingStep(dt); else if (mode === 'replay' && rp) replayStep(dt); else operatorStep(dt);
    ch.set(q);
    grip = lerp(grip, closed ? 1 : 0, 1 - Math.exp(-14 * dt));
    const gap = lerp(.046, (held ? held.hs : .008) + .006, grip);
    fingers[0].position.x = gap; fingers[1].position.x = -gap;
    if (held) { _m.multiplyMatrices(ch.tip.matrixWorld, held.off); _m.decompose(held.g.position, held.g.quaternion, _s); held.pos.copy(held.g.position); }
    for (const o of objs) if (o.falling) {
      o.vy -= 9.8 * dt; o.pos.y = Math.max(o.ty, o.pos.y + o.vy * dt);
      const s = 1 - Math.exp(-14 * dt); o.pos.x = lerp(o.pos.x, o.tx, s); o.pos.z = lerp(o.pos.z, o.tz, s);
      if (o.pos.y <= o.ty + 1e-4 && Math.hypot(o.pos.x - o.tx, o.pos.z - o.tz) < .002) { o.pos.set(o.tx, o.ty, o.tz); o.falling = false; o.vy = 0; }
    }
    objs.forEach(syncObj);
    pourStep(dt); particles(dt);
    liq.visible = liquid > .01; liq.scale.y = Math.max(.001, .075 * liquid); liq.position.y = -.039 + liq.scale.y / 2;
    bowlLiq.visible = bowlFill > .01; bowlLiq.position.y = .006 + Math.min(1, bowlFill / .9) * (BOWL.h - .016);
    // aids
    const tp = tipPos(); let sup = 0;
    if (Math.abs(tp.x - BIN.x) < BIN.hx && Math.abs(tp.z - BIN.z) < BIN.hz) sup = BIN.floor;
    for (const o of objs) if (!o.held && Math.abs(tp.x - o.pos.x) < o.hs && Math.abs(tp.z - o.pos.z) < o.hs && o.pos.y + o.h / 2 < tp.y) sup = Math.max(sup, o.pos.y + o.h / 2);
    const lp = dropLine.geometry.attributes.position; lp.setXYZ(0, tp.x, tp.y, tp.z); lp.setXYZ(1, tp.x, sup + .001, tp.z); lp.needsUpdate = true;
    aim.position.set(tp.x, sup + .0015, tp.z);
    const cand = !closed && !homing ? candidate() : null;
    graspRing.visible = !!cand;
    if (cand) { graspRing.position.set(cand.pos.x, cand.pos.y - cand.h / 2 + .0015, cand.pos.z); graspRing.scale.setScalar(cand.hs / .025 * (1 + Math.sin(t * 8) * .06)); }
    // task progress + timer
    const pr = progress();
    if (!homing && !done && !failed) {
      taskT += dt;
      if (pr.ok) onDone();
      else if (taskId === 'pour' && liquid < .3) { failed = 'Spilled'; say('Too much spilled. Reset to try again.'); if (mode !== 'replay') card = {ok: false, title: 'Spilled · pour over the bowl', sub: 'Press Reset and try again.'}; }
    }
    // recording at 20 Hz
    if (rec?.live) {
      rec.t += dt; rec.acc += dt;
      while (rec && rec.acc >= 1 / HZ) {
        rec.acc -= 1 / HZ;
        rec.samples.push([r3(rec.samples.length / HZ), r3(tgt.p.x), r3(tgt.p.y), r3(tgt.p.z), r3(tgt.psi), r3(tgt.theta), ...q.map(r3), closed ? 1 : 0]);
        recStamps.push(t);
        if (rec.samples.length >= MAX_S) stopRecord('Hit the 400-sample limit (20 s)');
      }
      if (rec && rec.successAt != null && rec.t - rec.successAt > .6) stopRecord();
    }
    while (recStamps.length && recStamps[0] < t - 1) recStamps.shift();
    traceAcc += dt;
    if (traceAcc >= 1 / HZ) { traceAcc = 0; trace.push({q: q.map((v, j) => (v - LIM[j][0]) / (LIM[j][1] - LIM[j][0])), g: closed ? 1 : 0, r: !!rec?.live}); if (trace.length > 200) trace.shift(); }
    fade = Math.max(0, fade - dt * 3);
    const v = L();
    if (renderer) render(v);
    draw(v, t);
  });

  function render(v) {
    const w = Math.round(v.vw), h = Math.round(v.vh);
    if (w !== glW || h !== glH) { glW = w; glH = h; renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setSize(w, h, false); gl.style.width = w + 'px'; gl.style.height = h + 'px'; }
    gl.style.left = v.vx + 'px'; gl.style.top = v.vy + 'px';
    placeCam(); const full = glW * 1.16; cam.aspect = full / glH; cam.setViewOffset(full, glH, glW * .16, 0, glW, glH);   // push the bench left, away from the inset/video
    renderer.setScissorTest(false); renderer.setViewport(0, 0, glW, glH); renderer.setClearColor(B.warm1); renderer.render(scene, cam);
    const ix = glW - v.iw - 12, iy = glH - 12 - v.ih;                                                // wrist inset, top-right (GL origin is bottom-left)
    wristCam.aspect = v.iw / v.ih; wristCam.updateProjectionMatrix();
    dropLine.visible = aim.visible = false;
    renderer.setScissorTest(true); renderer.setViewport(ix, iy, v.iw, v.ih); renderer.setScissor(ix, iy, v.iw, v.ih); renderer.setClearColor(B.warm2); renderer.render(scene, wristCam);
    renderer.setScissorTest(false); dropLine.visible = aim.visible = true;
  }

  // ---------- 2D HUD ----------
  function draw(v, t) {
    k.clear(B.warm1);
    const {lw, vx, vy, vw, vh} = v;
    ctx.clearRect(vx, vy, vw, vh);                                                                   // hole for the WebGL view
    if (!renderer) k.text('WebGL is not available in this browser.', vx + vw / 2, vy + vh / 2, {align: 'center', size: 15, color: B.cool2});
    if (fade > 0) { ctx.globalAlpha = fade * .85; ctx.fillStyle = B.warm1; ctx.fillRect(vx, vy, vw, vh); ctx.globalAlpha = 1; }
    ctx.strokeStyle = B.warm2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(vx, vy, vw, vh, 12); ctx.stroke();
    // goal + hint
    k.text(`Goal: ${task().goal}, then record it as a demo.`, vx, 28, {size: 15, weight: 600});
    k.label(mode === 'replay' ? 'Policy is driving · hands off' : 'W/S · A/D · Q/E move · ←/→ wrist · ↑/↓ tilt · Space grip · drag the view to orbit', vx, 47, {color: mode === 'replay' ? B.orange : B.cool2});
    k.label('Operator view · simulated', vx + 12, vy + 20);
    // wrist inset frame
    ctx.strokeStyle = B.black; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(v.ix, v.iy, v.iw, v.ih, 8); ctx.stroke();
    ctx.fillStyle = B.black; ctx.beginPath(); ctx.roundRect(v.ix + 8, v.iy + 8, 104, 18, 9); ctx.fill();
    k.text('WRIST CAMERA', v.ix + 60, v.iy + 21, {size: 10, mono: true, color: B.white, align: 'center'});
    if (grip > .5) { ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(v.ix + v.iw - 14, v.iy + 17, 5, 0, 7); ctx.fill(); }
    // REC / replay pill (bottom-left of the view, clear of the corner video)
    if (rec || rp || homing) {
      const txt = rec ? (rec.live ? `REC ${rec.t.toFixed(1)} s · ${rec.samples.length}/${MAX_S}` : 'REC · homing…') : rp ? (rp.live ? `POLICY REPLAY · ${rp.t.toFixed(1)} s` : 'POLICY · homing…') : 'Homing…';
      ctx.font = '600 11px "Geist Mono", ui-monospace, monospace'; const pw = ctx.measureText(txt).width + 34, py = vy + vh - 36;
      ctx.fillStyle = rec ? B.orange : B.black; ctx.beginPath(); ctx.roundRect(vx + 12, py, pw, 24, 12); ctx.fill();
      if (rec && Math.sin(t * 6) > -.3) { ctx.fillStyle = B.black; ctx.beginPath(); ctx.arc(vx + 25, py + 12, 4, 0, 7); ctx.fill(); }
      if (!rec) { ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(vx + 25, py + 12, 4, 0, 7); ctx.fill(); }
      k.text(txt, vx + 36, py + 16, {size: 11, mono: true, weight: 600, color: rec ? B.black : B.white});
    }
    if (pourState) k.label(pourState > 0 ? 'Pouring into the bowl' : 'Spilling on the bench', vx + 12, vy + 38, {color: pourState > 0 ? B.orange : B.cool2});
    // result card (top-left of the view)
    if (card) {
      const cw = Math.min(440, vw - v.iw - 40), cx = vx + 12, cy = vy + 46;
      if (cw > 160) {
        ctx.fillStyle = card.ok ? B.orange : B.black; ctx.beginPath(); ctx.roundRect(cx, cy, cw, 54, 12); ctx.fill();
        k.text(card.title, cx + 14, cy + 22, {size: 13, weight: 600, color: card.ok ? '#121212' : B.white});
        k.text(card.sub, cx + 14, cy + 40, {size: 12, color: card.ok ? '#121212' : B.warm2});
      }
    }

    // ---- left column: console ----
    ctx.fillStyle = B.white; ctx.fillRect(0, 0, lw, k.h); ctx.fillStyle = B.warm2; ctx.fillRect(lw, 0, 1, k.h);
    const pr = progress();
    k.label('Task', 18, 24); k.text(task().label, 18, 44, {size: 15, weight: 600});
    k.text(`${taskT.toFixed(1)} s`, lw - 16, 44, {size: 15, mono: true, weight: 600, align: 'right', color: done ? B.orange : B.black});
    k.meter(18, 74, lw - 36, done ? 1 : pr.v, failed ? `${pr.txt} · failed` : pr.txt);
    k.label('Joints · analytic IK · live', 18, 102);
    JN.forEach(([jn, nm], j) => {
      const y = 120 + j * 18, [lo, hi] = LIM[j], f = clamp((q[j] - lo) / (hi - lo), 0, 1), fl = limFlash[j];
      k.text(jn, 18, y, {size: 11, mono: true, weight: 600, color: fl > .1 ? B.orange : B.black});
      k.text(nm, 42, y, {size: 11, color: B.cool2});
      const bx = 118, bwid = 80;
      ctx.fillStyle = B.warm2; ctx.fillRect(bx, y - 5, bwid, 3);
      ctx.fillStyle = B.cool1; ctx.fillRect(bx + bwid * clamp(-lo / (hi - lo), 0, 1) - .5, y - 8, 1, 9);
      ctx.fillStyle = fl > .1 ? B.orange : B.black; ctx.beginPath(); ctx.arc(bx + bwid * f, y - 3.5, 3 + fl * 2, 0, 7); ctx.fill();
      const d = q[j] / DEG; k.text(`${d >= 0 ? '+' : ''}${d.toFixed(1)}°`, lw - 16, y, {size: 11, mono: true, align: 'right'});
    });
    // joystick pad + z strip + key hints
    const s = Math.round(clamp(k.h - 430, 64, 120)), py = 244;
    k.label('Joystick pad · drag', 18, 234);
    hit.pad = {x: 18, y: py, w: s, h: s}; hit.z = {x: 18 + s + 10, y: py, w: 22, h: s};
    ctx.fillStyle = B.warm1; ctx.strokeStyle = B.warm2; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(18, py, s, s, 10); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(hit.z.x, py, 22, s, 10); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = B.warm2; ctx.beginPath(); ctx.moveTo(18 + s / 2, py + 8); ctx.lineTo(18 + s / 2, py + s - 8); ctx.moveTo(26, py + s / 2); ctx.lineTo(18 + s - 8, py + s / 2); ctx.stroke();
    const kx = 18 + s / 2 + pad.x * (s / 2 - 12), ky = py + s / 2 + pad.y * (s / 2 - 12);
    ctx.fillStyle = pad.drag === 'xy' ? B.orange : B.black; ctx.beginPath(); ctx.arc(kx, ky, 9, 0, 7); ctx.fill();
    ctx.fillStyle = pad.drag === 'z' ? B.orange : B.black; ctx.beginPath(); ctx.roundRect(hit.z.x + 3, py + s / 2 - 6 - pad.z * (s / 2 - 12), 16, 12, 6); ctx.fill();
    k.text('fwd', 18 + s / 2, py + 14, {size: 9, mono: true, color: B.cool2, align: 'center'}); k.text('z', hit.z.x + 11, py + 14, {size: 9, mono: true, color: B.cool2, align: 'center'});
    const hx = 18 + s + 42;
    [['W S', 'fwd · back'], ['A D', 'left · right'], ['Q E', 'up · down'], ['← →', 'wrist'], ['↑ ↓', 'tilt'], ['Space', 'grip'], ['R', 'record']].forEach(([a, b], i) => {
      const y = py + 10 + i * Math.min(14, (s - 4) / 6.5);
      k.text(a, hx, y, {size: 10, mono: true, weight: 600}); k.text(b, hx + 40, y, {size: 10, color: B.cool2});
    });
    const gy = py + s + 10; hit.grip = {x: 18, y: gy, w: lw - 36, h: 26};
    ctx.fillStyle = closed ? B.black : B.white; ctx.strokeStyle = closed ? B.black : B.warm3; ctx.beginPath(); ctx.roundRect(18, gy, lw - 36, 26, 13); ctx.fill(); ctx.stroke();
    ctx.fillStyle = held ? B.orange : closed ? B.cool2 : B.warm3; ctx.beginPath(); ctx.arc(32, gy + 13, 4, 0, 7); ctx.fill();
    k.text(`Gripper · ${closed ? (held ? 'holding ' + oname(held) : 'closed') : 'open'}`, 44, gy + 17, {size: 12, color: closed ? B.white : B.black});
    // dataset
    const dy = gy + 52;
    k.label('Your teleop dataset', 18, dy);
    k.text(`${stats.demos} demo${stats.demos === 1 ? '' : 's'} · ${Math.round(stats.seconds)} s`, 18, dy + 20, {size: 15, weight: 600});
    k.text(`${stats.ok} successful · replays ${tally.ok} ok / ${tally.fail} failed`, 18, dy + 37, {size: 11, color: B.cool2});
    drawLog(k, log.slice(-3), 18, dy + 62, lw - 36, Math.floor((k.h - dy - 62) / 16));

    // ---- bottom strip: joint trace, gripper, data rate ----
    const bx = vx, by = k.h - 120, bw = v.bw, pw = bw - 24;
    ctx.fillStyle = B.white; ctx.strokeStyle = B.warm2; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(bx, by, bw, 108, 12); ctx.fill(); ctx.stroke();
    k.label('Joint angles · last 10 s', bx + 12, by + 16);
    const px0 = bx + 12, py0 = by + 24, ph = 40, n = trace.length, step = pw / 199;
    for (let i = 0; i < n; i++) if (trace[i].r) { ctx.fillStyle = 'rgba(255,126,0,.10)'; ctx.fillRect(px0 + (200 - n + i) * step, py0, step + .5, ph); }
    let act = 0, am = -1;
    if (n > 20) for (let j = 0; j < 6; j++) { const dlt = Math.abs(trace[n - 1].q[j] - trace[n - 20].q[j]); if (dlt > am) { am = dlt; act = j; } }
    for (let j = 0; j < 6; j++) {
      if (j === act && am > .002) continue;
      ctx.strokeStyle = B.cool1; ctx.lineWidth = 1; ctx.beginPath();
      for (let i = 0; i < n; i++) { const x = px0 + (200 - n + i) * step, y = py0 + ph - trace[i].q[j] * ph; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    if (am > .002) { ctx.strokeStyle = B.orange; ctx.lineWidth = 2; ctx.beginPath(); for (let i = 0; i < n; i++) { const x = px0 + (200 - n + i) * step, y = py0 + ph - trace[i].q[act] * ph; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); }
    k.label(am > .002 ? `${JN[act][0]} moving` : 'idle', bx + bw - 12, by + 16, {align: 'right', color: am > .002 ? B.orange : B.cool2});
    const gyb = py0 + ph + 6;
    ctx.fillStyle = B.warm2; ctx.fillRect(px0, gyb, pw, 5);
    ctx.fillStyle = B.orange; for (let i = 0; i < n; i++) if (trace[i].g) ctx.fillRect(px0 + (200 - n + i) * step, gyb, step + .5, 5);
    const rate = rec?.live ? recStamps.length : 0, ns = rec ? rec.samples.length : 0, mw = (pw - 12) / 2;
    k.meter(px0, by + 96, mw, rate / HZ, rec?.live ? `Data rate ${rate} Hz · 13 ch` : 'Data rate 0 Hz · idle');
    k.meter(px0 + mw + 12, by + 96, mw, ns / MAX_S, `${ns}/${MAX_S} samples`);
  }

  // ---------- input ----------
  const setPad = p => {
    if (pad.drag === 'xy') { const r = hit.pad; pad.x = clamp((p.x - r.x - r.w / 2) / (r.w / 2 - 12), -1, 1); pad.y = clamp((p.y - r.y - r.h / 2) / (r.h / 2 - 12), -1, 1); }
    else if (pad.drag === 'z') { const r = hit.z; pad.z = clamp(-(p.y - r.y - r.h / 2) / (r.h / 2 - 12), -1, 1); }
  };
  const handsOff = () => { if (mode === 'replay') { say('Policy is driving · wait for the replay to finish'); return true; } return false; };
  k.onDown(p => {
    const v = L();
    if (inR(p, hit.pad)) { if (!handsOff()) { pad.drag = 'xy'; setPad(p); } return; }
    if (inR(p, hit.z)) { if (!handsOff()) { pad.drag = 'z'; setPad(p); } return; }
    if (inR(p, hit.grip)) { if (!handsOff() && !homing) toggleGrip(); return; }
    if (inR(p, {x: v.vx, y: v.vy, w: v.vw, h: v.vh})) orbit = {x: p.x, y: p.y, yaw: camYaw, pitch: camPitch};
  });
  k.onMove(p => {
    if (pad.drag) setPad(p);
    else if (orbit) { camYaw = clamp(orbit.yaw - (p.x - orbit.x) * .005, -.7, .7); camPitch = clamp(orbit.pitch + (p.y - orbit.y) * .004, .2, 1.1); }
  });
  k.onUp(() => { pad.drag = null; orbit = null; });
  const KEYS = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
  const onKeyDown = e => {
    if (!root.isConnected || e.target?.closest?.('input, textarea, select')) return;
    if (KEYS.has(e.code)) { keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); if (mode === 'replay' && !e.repeat) handsOff(); }
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat && !handsOff() && !homing) toggleGrip(); }
    if (e.code === 'KeyR' && !e.repeat) toggleRecord();
  };
  const onKeyUp = e => { keys.delete(e.code); if (e.code === 'Space') e.preventDefault(); };
  const onBlur = () => keys.clear();
  addEventListener('keydown', onKeyDown); addEventListener('keyup', onKeyUp); addEventListener('blur', onBlur);

  // ---------- control bar ----------
  const btn = (label, fn, o) => k.button(label, () => { fn(); document.activeElement?.blur?.(); }, o);
  const taskBtns = Object.entries(TASKS).map(([id, tk]) => { const b = btn(tk.label, () => chooseTask(id)); b.dataset.id = id; return b; });
  const recBtn = btn('● Record demo', toggleRecord, {primary: true});
  const setRecBtn = () => { recBtn.textContent = rec ? '■ Stop recording' : '● Record demo'; };
  const replayBtn = btn('Replay as policy', startReplay); replayBtn.disabled = true; replayBtn.title = 'Record one successful demo first';
  btn('Randomize objects', randomize);
  btn('Reset', () => { cancelRuns(); resetScene(layout); home(); card = null; say('Scene reset'); });
  k.slider('Replay noise (cm)', 0, 6, noise, x => { noise = x; }, .5);

  resetScene(layout); fade = 0; ch.set(q); placeCam();
  taskBtns[0].classList.add('on');
  clip(TASKS[taskId].clip); api.status('Stack · drive the arm');

  api._probe?.({objs, tgt, accept, toggleGrip, get q() { return q; }, get closed() { return closed; }, get done() { return done; }, get homing() { return !!homing; }, get mode() { return mode; }, get card() { return card; }, get liquid() { return liquid; }, get bowlFill() { return bowlFill; }});   // headless tests only
  return () => {
    removeEventListener('keydown', onKeyDown); removeEventListener('keyup', onKeyUp); removeEventListener('blur', onBlur);
    const geos = new Set(), ms = new Set(mats);
    scene.traverse(o => { if (o.geometry) geos.add(o.geometry); if (o.material) [].concat(o.material).forEach(m => ms.add(m)); });
    geos.forEach(g => g.dispose()); ms.forEach(m => m.dispose()); partMesh.dispose();
    sun.shadow.map?.dispose();
    if (renderer) { renderer.dispose(); renderer.forceContextLoss(); gl.remove(); }
    k.destroy();
  };
}
