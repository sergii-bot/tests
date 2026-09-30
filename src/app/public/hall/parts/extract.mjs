#!/usr/bin/env node
// Parts extractor (run once, in Node):  node hall/parts/extract.mjs
//
// Reads the official MuJoCo Menagerie MJCF files (read-only, never modified) and cuts them into reusable PARTS:
// torsos, legs and arms as MJCF body fragments that keep the original meshes, inertials, joint axes/ranges,
// default classes and actuators. Numbers that need the compiled model (masses, torque limits, stance drop,
// arm reach, top-plate height) are measured with the official MuJoCo WASM build, not typed in by hand.
// Output: hall/parts/parts.json (see README.md for the descriptor format).
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';
import {parseXML, toXML, clone, walk, find, findAll, el} from './xml.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, '../..');
const MODELS = path.join(PUB, 'models');
const manifest = JSON.parse(fs.readFileSync(path.join(MODELS, 'manifest.json'), 'utf8'));

// ---------- source robots ----------
// homeFrom: where the original 'home' pose lives. homeOverride: composer stance where the original pose is a
// straight-leg or missing pose (documented in parts.json as `homeNote`).
const SOURCES = {
  go2: {vendor: 'Unitree', label: 'Unitree Go2', xml: 'go2.xml', family: 'quadruped'},
  spot: {vendor: 'Boston Dynamics', label: 'Boston Dynamics Spot', xml: 'spot.xml', family: 'quadruped'},
  h1: {vendor: 'Unitree', label: 'Unitree H1', xml: 'h1.xml', homeFrom: 'scene.xml', family: 'humanoid'},
  g1: {vendor: 'Unitree', label: 'Unitree G1', xml: 'g1.xml', family: 'humanoid',
    homeOverride: {left_hip_pitch_joint: -0.1, right_hip_pitch_joint: -0.1, left_knee_joint: 0.3, right_knee_joint: 0.3,
      left_ankle_pitch_joint: -0.2, right_ankle_pitch_joint: -0.2},
    homeNote: 'legs: slightly bent stance (hip -0.1, knee 0.3, ankle -0.2) instead of the straight-leg "stand" key; arms from the original key'},
  ur5e: {vendor: 'Universal Robots', label: 'Universal Robots UR5e', xml: 'ur5e.xml', family: 'arm'},
};

// ---------- which subtrees become parts ----------
const PARTS = [
  {id: 'go2_base', kind: 'torso', source: 'go2', label: 'Go2 base', root: 'base', cut: ['FL_hip', 'FR_hip', 'RL_hip', 'RR_hip'],
    legMounts: {quad: {FL: 'FL_hip', FR: 'FR_hip', RL: 'RL_hip', RR: 'RR_hip'}}, hexScale: 1.2},
  {id: 'spot_body', kind: 'torso', source: 'spot', label: 'Spot body', root: 'body', cut: ['fl_hip', 'fr_hip', 'hl_hip', 'hr_hip'],
    legMounts: {quad: {FL: 'fl_hip', FR: 'fr_hip', RL: 'hl_hip', RR: 'hr_hip'}}, hexScale: 1.0,
    // official Spot Arm mount point, from boston_dynamics_spot/spot_arm.xml (body arm_link_sh0)
    topMount: {pos: [0.292, 0, 0.188], quat: [1, 0, 0, 0], body: 'body', from: 'spot_arm.xml arm_link_sh0'}},
  {id: 'h1_torso', kind: 'torso', source: 'h1', label: 'H1 pelvis + torso', root: 'pelvis',
    cut: ['left_hip_yaw_link', 'right_hip_yaw_link', 'left_shoulder_pitch_link', 'right_shoulder_pitch_link'],
    legMounts: {biped: {L: 'left_hip_yaw_link', R: 'right_hip_yaw_link'}},
    armMounts: {L: 'left_shoulder_pitch_link', R: 'right_shoulder_pitch_link'}, topBody: 'torso_link'},
  {id: 'g1_torso', kind: 'torso', source: 'g1', label: 'G1 pelvis + waist + torso', root: 'pelvis',
    cut: ['left_hip_pitch_link', 'right_hip_pitch_link', 'left_shoulder_pitch_link', 'right_shoulder_pitch_link'],
    legMounts: {biped: {L: 'left_hip_pitch_link', R: 'right_hip_pitch_link'}},
    armMounts: {L: 'left_shoulder_pitch_link', R: 'right_shoulder_pitch_link'}, topBody: 'torso_link'},

  {id: 'go2_leg', kind: 'leg', source: 'go2', label: 'Go2 leg', mountType: 'hip',
    variants: {FL: 'FL_hip', FR: 'FR_hip', RL: 'RL_hip', RR: 'RR_hip'}},
  {id: 'spot_leg', kind: 'leg', source: 'spot', label: 'Spot leg', mountType: 'hip',
    variants: {FL: 'fl_hip', FR: 'fr_hip', RL: 'hl_hip', RR: 'hr_hip'}},
  {id: 'h1_leg', kind: 'leg', source: 'h1', label: 'H1 leg', mountType: 'hip', variants: {L: 'left_hip_yaw_link', R: 'right_hip_yaw_link'}},
  {id: 'g1_leg', kind: 'leg', source: 'g1', label: 'G1 leg', mountType: 'hip', variants: {L: 'left_hip_pitch_link', R: 'right_hip_pitch_link'}},

  {id: 'ur5e_arm', kind: 'arm', source: 'ur5e', label: 'UR5e arm', mountType: 'top_plate', variants: {C: 'base'}, tip: {site: 'attachment_site'}},
  {id: 'h1_arm', kind: 'arm', source: 'h1', label: 'H1 arm', mountType: 'shoulder', variants: {L: 'left_shoulder_pitch_link', R: 'right_shoulder_pitch_link'}},
  {id: 'g1_arm', kind: 'arm', source: 'g1', label: 'G1 arm', mountType: 'shoulder', variants: {L: 'left_shoulder_pitch_link', R: 'right_shoulder_pitch_link'}},
];

// joint role from the joint name (covers Unitree, Spot and UR naming); used by the stand-in controller
function roleOf(name, kind) {
  if (kind === 'arm') return 'arm';
  if (kind === 'torso') return 'waist';
  if (/hip_yaw/.test(name)) return 'hip_yaw';
  if (/hip_roll|_hx$|_hip_joint$/.test(name)) return 'hip_abd';
  if (/hip_pitch|thigh|_hy$/.test(name)) return 'hip_pitch';
  if (/knee|calf|_kn$/.test(name)) return 'knee';
  if (/ankle_roll/.test(name)) return 'ankle_roll';
  if (/ankle/.test(name)) return 'ankle_pitch';
  return 'other';
}
// "crouch" direction in joint space (shortens the leg, keeps the foot roughly under the hip); gains are measured below
const CROUCH = {quadruped: {hip_pitch: 1, knee: -2}, humanoid: {hip_pitch: -1, knee: 2, ankle_pitch: -1}};
const SWING = {quadruped: {hip_pitch: -1}, humanoid: {hip_pitch: -1, ankle_pitch: 1}}; // moves the foot forward

// ---------- MuJoCo (for measured numbers) ----------
const {default: loadMujoco} = await import(path.join(PUB, 'vendor/mujoco/mujoco_wasm.js'));
const mj = await loadMujoco();
mj.FS.mkdir('/m'); mj.FS.mount(mj.MEMFS, {root: '.'}, '/m');
function writeRobotFiles(key) {
  const info = manifest[key], root = `/m/${key}`;
  try { mj.FS.mkdir(root); } catch {}
  for (const f of info.files) {
    let d = root; for (const p of f.split('/').slice(0, -1)) { d += '/' + p; try { mj.FS.mkdir(d); } catch {} }
    mj.FS.writeFile(`${root}/${f}`, fs.readFileSync(path.join(MODELS, info.dir, f)));
  }
}
function names(model, adrField, n) {
  const s = new TextDecoder().decode(model.names), out = [];
  for (let i = 0; i < n; i++) { const a = model[adrField][i]; out.push(s.slice(a, s.indexOf('\0', a))); }
  return out;
}

const r6 = v => Math.round(v * 1e6) / 1e6;
const num = s => s.trim().split(/\s+/).map(Number);
const stem = f => path.basename(f).replace(/\.[^.]+$/, '');

// ---------- load each source ----------
const src = {};
for (const [key, S] of Object.entries(SOURCES)) {
  const dir = manifest[key].dir;
  const xmlText = fs.readFileSync(path.join(MODELS, dir, S.xml), 'utf8');
  const root = parseXML(xmlText);
  const compiler = find(root, n => n.tag === 'compiler')?.attrs || {};
  const meshdir = compiler.meshdir ? compiler.meshdir.replace(/\/$/, '') + '/' : '';
  const asset = find(root, n => n.tag === 'asset');
  const meshes = {}, materials = [];
  for (const a of asset.children) {
    if (a.tag === 'mesh') meshes[a.attrs.name || stem(a.attrs.file)] = meshdir + a.attrs.file;
    else if (a.tag === 'material') materials.push(a);
    else throw new Error(`${key}: unsupported asset <${a.tag}>`);
  }
  const defRoot = root.children.find(n => n.tag === 'default');
  if (defRoot.children.some(c => c.tag !== 'default')) throw new Error(`${key}: top-level defaults outside a class`);
  const worldbody = find(root, n => n.tag === 'worldbody');
  const bodies = {}; // name -> {node, parent, childclass}
  (function index(n, parent, cc) {
    for (const c of n.children) if (c.tag === 'body') {
      const ccHere = c.attrs.childclass || cc;
      bodies[c.attrs.name] = {node: c, parent, inheritedClass: cc};
      index(c, c, ccHere);
    }
  })(worldbody, null, null);
  const actuators = (find(root, n => n.tag === 'actuator')?.children) || [];
  const option = find(root, n => n.tag === 'option')?.attrs || {};
  const excludes = findAll(root, n => n.tag === 'exclude').map(n => [n.attrs.body1, n.attrs.body2]);

  writeRobotFiles(key);
  const model = mj.MjModel.loadFromXML(`/m/${key}/${S.xml}`);
  const data = new mj.MjData(model);
  // original home pose
  let homeQ = null;
  if (S.homeFrom) {
    writeRobotFiles(key);
    const sm = mj.MjModel.loadFromXML(`/m/${key}/${S.homeFrom}`);
    if (sm.nkey) homeQ = Array.from(sm.key_qpos.subarray(0, sm.nq));
    sm.delete();
  } else if (model.nkey) homeQ = Array.from(model.key_qpos.subarray(0, model.nq));
  const jn = names(model, 'name_jntadr', model.njnt), bn = names(model, 'name_bodyadr', model.nbody);
  const sn = names(model, 'name_siteadr', model.nsite);
  const home = {};
  for (let j = 0; j < model.njnt; j++) if (model.jnt_type[j] === 3) home[jn[j]] = homeQ ? homeQ[model.jnt_qposadr[j]] : 0;
  Object.assign(home, S.homeOverride || {});
  src[key] = {key, S, dir, root, meshes, materials, defRoot, bodies, actuators, option, excludes, model, data, jn, bn, sn, home, homeQ};
}

// ---------- renaming into composer namespace ----------
// class/material/mesh names get the robot key (shared once per robot in the composed file); element names get
// the {P} placeholder, which the composer replaces with the instance prefix (t_, leg0_, arm1_ ...).
function renameAssetRefs(n, key) {
  walk(n, x => {
    const a = x.attrs;
    if (a.mesh) a.mesh = `${key}__${a.mesh}`;
    if (a.material) a.material = `${key}__${a.material}`;
    if (a.class) a.class = `${key}__${a.class}`;
    if (a.childclass) a.childclass = `${key}__${a.childclass}`;
  });
  return n;
}
function renameFragment(n, key) {
  renameAssetRefs(n, key);
  walk(n, x => { if (x.attrs.name != null && x.tag !== 'default') x.attrs.name = '{P}' + x.attrs.name; });
  return n;
}
function usedMeshes(n) { const s = new Set(); walk(n, x => { if (x.attrs.mesh) s.add(x.attrs.mesh); }); return [...s]; }

// ---------- measurements ----------
function subtreeBodies(s, rootName) {
  const r = s.bn.indexOf(rootName); if (r < 0) throw new Error(`${s.key}: no body ${rootName}`);
  const ids = [];
  for (let b = 0; b < s.model.nbody; b++) { let p = b; while (p > 0 && p !== r) p = s.model.body_parentid[p]; if (p === r) ids.push(b); }
  return ids;
}
function setHome(s, extra = {}) {
  const {model, data} = s;
  if (s.homeQ) for (let i = 0; i < model.nq; i++) data.qpos[i] = s.homeQ[i];
  else { mj.mj_resetData(model, data); }
  for (let j = 0; j < model.njnt; j++) if (model.jnt_type[j] === 3) {
    const v = (s.home[s.jn[j]] ?? 0) + (extra[s.jn[j]] ?? 0); data.qpos[model.jnt_qposadr[j]] = v;
  }
  mj.mj_kinematics(s.model, s.data);
}
// lowest point of the collision primitives in a subtree (world z), and its xy
function lowestPoint(s, bodyIds) {
  const {model, data} = s, set = new Set(bodyIds);
  let best = {z: Infinity, x: 0, y: 0};
  for (let g = 0; g < model.ngeom; g++) {
    if (!set.has(model.geom_bodyid[g])) continue;
    if (model.geom_contype[g] === 0 && model.geom_conaffinity[g] === 0) continue;
    const t = model.geom_type[g], sz = model.geom_size.subarray(g * 3, g * 3 + 3), R = data.geom_xmat.subarray(g * 9, g * 9 + 9);
    const px = data.geom_xpos[g * 3], py = data.geom_xpos[g * 3 + 1], pz = data.geom_xpos[g * 3 + 2];
    let z;
    if (t === 2) z = pz - sz[0];
    else if (t === 3) z = pz - sz[0] - sz[1] * Math.abs(R[8]);
    else if (t === 5) z = pz - sz[1] * Math.abs(R[8]) - sz[0] * Math.hypot(R[6], R[7]);
    else if (t === 6) z = pz - sz[0] * Math.abs(R[6]) - sz[1] * Math.abs(R[7]) - sz[2] * Math.abs(R[8]);
    else continue; // meshes/planes: foot contacts in these models are primitives
    if (z < best.z) best = {z, x: px, y: py};
  }
  return best;
}
function lowestZ(s, g) {
  const {model, data} = s, t = model.geom_type[g], sz = model.geom_size.subarray(g * 3, g * 3 + 3), R = data.geom_xmat.subarray(g * 9, g * 9 + 9), pz = data.geom_xpos[g * 3 + 2];
  if (t === 2) return pz - sz[0];
  if (t === 3) return pz - sz[0] - sz[1] * Math.abs(R[8]);
  if (t === 5) return pz - sz[1] * Math.abs(R[8]) - sz[0] * Math.hypot(R[6], R[7]);
  if (t === 6) return pz - sz[0] * Math.abs(R[6]) - sz[1] * Math.abs(R[7]) - sz[2] * Math.abs(R[8]);
  return Infinity;
}
function torqueOf(s, j) {
  const {model} = s;
  for (let a = 0; a < model.nu; a++) {
    if (model.actuator_trntype[a] !== 0 || model.actuator_trnid[a * 2] !== j) continue;
    if (model.actuator_forcelimited[a]) return Math.max(Math.abs(model.actuator_forcerange[a * 2]), Math.abs(model.actuator_forcerange[a * 2 + 1]));
    if (model.jnt_actfrclimited[j]) return Math.max(Math.abs(model.jnt_actfrcrange[j * 2]), Math.abs(model.jnt_actfrcrange[j * 2 + 1]));
    if (model.actuator_biastype[a] === 0) return Math.max(Math.abs(model.actuator_ctrlrange[a * 2]), Math.abs(model.actuator_ctrlrange[a * 2 + 1])) * Math.abs(model.actuator_gear[a * 6]);
    return null;
  }
  return null;
}
function jointsIn(s, bodyIds, kind) {
  const {model} = s, set = new Set(bodyIds), out = [];
  for (let j = 0; j < model.njnt; j++) {
    if (!set.has(model.jnt_bodyid[j]) || model.jnt_type[j] !== 3) continue;
    const name = s.jn[j];
    out.push({name, role: roleOf(name, kind), range: [r6(model.jnt_range[j * 2]), r6(model.jnt_range[j * 2 + 1])],
      home: r6(s.home[name] ?? 0), torque: torqueOf(s, j)});
  }
  return out;
}
const massOf = (s, ids) => r6(ids.reduce((a, b) => a + s.model.body_mass[b], 0));
const relPos = (s, b, p) => { // world point -> body frame of b
  const x = s.data.xpos, R = s.data.xmat.subarray(b * 9, b * 9 + 9);
  const d = [p[0] - x[b * 3], p[1] - x[b * 3 + 1], p[2] - x[b * 3 + 2]];
  return [0, 1, 2].map(i => r6(R[i] * d[0] + R[3 + i] * d[1] + R[6 + i] * d[2]));
};

function legStance(s, rootName, joints) {
  const fam = s.S.family, ids = subtreeBodies(s, rootName), b = s.bn.indexOf(rootName);
  // foot point: the contact primitives of the deepest body that touch the ground at home (tracked as a group,
  // so the point doesn't jump heel<->toe); drop uses the lowest collision point of the whole leg
  const footBody = ids[ids.length - 1];
  setHome(s);
  const low = lowestPoint(s, ids).z;
  const footGeoms = [];
  for (let g = 0; g < s.model.ngeom; g++) if (s.model.geom_bodyid[g] === footBody && [2, 3, 5, 6].includes(s.model.geom_type[g]) && (s.model.geom_contype[g] || s.model.geom_conaffinity[g])) {
    if (lowestZ(s, g) < low + 0.01) footGeoms.push(g);
  }
  const measure = (extra) => {
    setHome(s, extra); const lp = lowestPoint(s, ids), x = s.data.xpos, gp = s.data.geom_xpos;
    const fx = footGeoms.reduce((a, g) => a + gp[g * 3], 0) / footGeoms.length, fy = footGeoms.reduce((a, g) => a + gp[g * 3 + 1], 0) / footGeoms.length;
    return {drop: x[b * 3 + 2] - lp.z, foot: [fx - x[b * 3], fy - x[b * 3 + 1]]};
  };
  const vec = (dir, d) => Object.fromEntries(joints.filter(j => dir[j.role]).map(j => [j.name, dir[j.role] * d]));
  const h0 = measure({}), d = 0.05;
  const hc = measure(vec(CROUCH[fam], d)), hs = measure(vec(SWING[fam], d));
  setHome(s);
  return {drop: r6(h0.drop), foot: h0.foot.map(r6), crouch: CROUCH[fam], crouchGain: r6((hc.drop - h0.drop) / d),
    crouchFootGain: r6((hc.foot[0] - h0.foot[0]) / d),
    swing: SWING[fam], swingGain: r6((hs.foot[0] - h0.foot[0]) / d)};
}
function armReach(s, rootName, tip) {
  const {model, data} = s, ids = subtreeBodies(s, rootName), set = new Set(ids);
  const jids = []; for (let j = 0; j < model.njnt; j++) if (set.has(model.jnt_bodyid[j]) && model.jnt_type[j] === 3) jids.push(j);
  const last = ids[ids.length - 1];
  const tipPoint = () => {
    if (tip?.site) { const i = s.sn.indexOf(tip.site); return [data.site_xpos[i * 3], data.site_xpos[i * 3 + 1], data.site_xpos[i * 3 + 2]]; }
    let best = null, bd = -1; const bx = [data.xpos[last * 3], data.xpos[last * 3 + 1], data.xpos[last * 3 + 2]];
    for (let g = 0; g < model.ngeom; g++) if (model.geom_bodyid[g] === last) {
      const p = [data.geom_xpos[g * 3], data.geom_xpos[g * 3 + 1], data.geom_xpos[g * 3 + 2]]; const dd = Math.hypot(p[0] - bx[0], p[1] - bx[1], p[2] - bx[2]);
      if (dd > bd) { bd = dd; best = p; }
    }
    return best || bx;
  };
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let reach = 0;
  for (let k = 0; k < 4000; k++) {
    setHome(s);
    for (const j of jids) { const lo = Math.max(model.jnt_range[j * 2], -Math.PI), hi = Math.min(model.jnt_range[j * 2 + 1], Math.PI); data.qpos[model.jnt_qposadr[j]] = lo + (hi - lo) * rnd(); }
    mj.mj_kinematics(model, data);
    const a = data.xanchor.subarray(jids[0] * 3, jids[0] * 3 + 3), p = tipPoint();
    reach = Math.max(reach, Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]));
  }
  setHome(s);
  return r6(reach);
}
// highest visual-mesh point near the body's centre line (top plate), in the body frame
function topPlate(s, bodyName) {
  const {model, data} = s, b = s.bn.indexOf(bodyName);
  setHome(s);
  const R = data.xmat.subarray(b * 9, b * 9 + 9), bx = [data.xpos[b * 3], data.xpos[b * 3 + 1], data.xpos[b * 3 + 2]];
  const cx = model.body_ipos[b * 3];
  let top = -Infinity;
  for (let g = 0; g < model.ngeom; g++) {
    if (model.geom_bodyid[g] !== b || model.geom_type[g] !== 7) continue;
    const id = model.geom_dataid[g], va = model.mesh_vertadr[id], vn = model.mesh_vertnum[id];
    const gp = data.geom_xpos.subarray(g * 3, g * 3 + 3), gm = data.geom_xmat.subarray(g * 9, g * 9 + 9);
    for (let v = va; v < va + vn; v++) {
      const lv = model.mesh_vert.subarray(v * 3, v * 3 + 3);
      const w = [0, 1, 2].map(i => gp[i] + gm[i * 3] * lv[0] + gm[i * 3 + 1] * lv[1] + gm[i * 3 + 2] * lv[2]);
      const l = relPos(s, b, w);
      if (Math.abs(l[0] - cx) < 0.08 && Math.abs(l[1]) < 0.04) top = Math.max(top, l[2]);
    }
  }
  return {pos: [r6(cx), 0, r6(top)], quat: [1, 0, 0, 0], body: bodyName, from: 'measured: top of visual mesh near the COM line'};
}

// ---------- fragments ----------
function actuatorsFor(s, jointNames) {
  const set = new Set(jointNames);
  return s.actuators.filter(a => set.has(a.attrs.joint)).map(a => {
    const c = renameAssetRefs(clone(a), s.key);
    c.attrs.name = '{P}' + (a.attrs.name || a.attrs.joint); c.attrs.joint = '{P}' + a.attrs.joint;
    return c;
  });
}
function cutSubtree(s, rootName, cut = []) {
  const info = s.bodies[rootName]; if (!info) throw new Error(`${s.key}: no body ${rootName}`);
  const node = clone(info.node), cutSet = new Set(cut);
  const origin = {pos: info.node.attrs.pos ? num(info.node.attrs.pos) : [0, 0, 0], quat: info.node.attrs.quat ? num(info.node.attrs.quat) : [1, 0, 0, 0]};
  delete node.attrs.pos; delete node.attrs.quat;
  (function prune(n) { n.children = n.children.filter(c => !(c.tag === 'body' && cutSet.has(c.attrs.name)) && c.tag !== 'freejoint' && c.tag !== 'light' && !(c.tag === 'joint' && c.attrs.type === 'free')); n.children.forEach(prune); })(node);
  if (!node.attrs.childclass && info.inheritedClass) node.attrs.childclass = info.inheritedClass;
  const jointNames = findAll(node, n => n.tag === 'joint').map(n => n.attrs.name);
  const acts = actuatorsFor(s, jointNames);
  renameFragment(node, s.key);
  return {node, origin, jointNames, acts};
}

const parts = [];
for (const P of PARTS) {
  const s = src[P.source];
  const base = {id: P.id, vendor: s.S.vendor, kind: P.kind, label: `${s.S.vendor} ${P.label}`,
    source: P.source, sourceFile: `${manifest[P.source].dir}/${s.S.xml}`};
  if (P.kind === 'torso') {
    const {node, origin, jointNames, acts} = cutSubtree(s, P.root, P.cut);
    const allIds = subtreeBodies(s, P.root);
    const cutIds = new Set(P.cut.flatMap(c => subtreeBodies(s, c)));
    const ids = allIds.filter(b => !cutIds.has(b));
    setHome(s);
    const mountOf = (bodyName) => {
      const bi = s.bodies[bodyName]; return {pos: num(bi.node.attrs.pos || '0 0 0').map(r6), quat: bi.node.attrs.quat ? num(bi.node.attrs.quat).map(r6) : [1, 0, 0, 0], body: bi.parent.attrs.name};
    };
    const leg_mounts = {};
    if (P.legMounts.quad) {
      const q = P.legMounts.quad;
      leg_mounts.quad = Object.entries(q).map(([code, b]) => ({...mountOf(b), end: code[0], side: code[1], from: `${s.S.xml} ${b}`}));
      const f = leg_mounts.quad.find(m => m.end === 'F' && m.side === 'L');
      const hx = f.pos[0] * P.hexScale;
      leg_mounts.hex = ['F', 'M', 'R'].flatMap(end => ['L', 'R'].map(side => ({pos: [r6(end === 'F' ? hx : end === 'R' ? -hx : 0), side === 'L' ? f.pos[1] : -f.pos[1], f.pos[2]],
        quat: [1, 0, 0, 0], body: f.body, end, side, from: `derived: original hip y/z, x spread ${P.hexScale}x the original hip x`})));
      leg_mounts.biped = ['L', 'R'].map(side => ({pos: [0, side === 'L' ? f.pos[1] : -f.pos[1], f.pos[2]], quat: [1, 0, 0, 0], body: f.body, end: 'F', side, from: 'derived: original hip y/z at x=0'}));
    }
    if (P.legMounts.biped) {
      const bm = Object.entries(P.legMounts.biped).map(([side, b]) => ({...mountOf(b), end: 'F', side, from: `${s.S.xml} ${b}`}));
      leg_mounts.biped = bm;
      const l = bm[0];
      leg_mounts.quad = ['F', 'R'].flatMap(end => ['L', 'R'].map(side => ({pos: [end === 'F' ? 0.12 : -0.12, side === 'L' ? Math.abs(l.pos[1]) : -Math.abs(l.pos[1]), l.pos[2]], quat: [1, 0, 0, 0], body: l.body, end, side, from: 'derived: original hip y/z, x = ±0.12'})));
      leg_mounts.hex = ['F', 'M', 'R'].flatMap(end => ['L', 'R'].map(side => ({pos: [end === 'F' ? 0.15 : end === 'R' ? -0.15 : 0, side === 'L' ? Math.abs(l.pos[1]) : -Math.abs(l.pos[1]), l.pos[2]], quat: [1, 0, 0, 0], body: l.body, end, side, from: 'derived: original hip y/z, x = ±0.15, 0'})));
    }
    const arm_mounts = P.armMounts ? Object.entries(P.armMounts).map(([side, b]) => ({...mountOf(b), side, from: `${s.S.xml} ${b}`})) : [];
    const top_mount = P.topMount || topPlate(s, P.topBody || P.root);
    const joints = jointsIn(s, ids, 'torso');
    parts.push({...base, mountType: 'root', mass: massOf(s, ids), dof: joints.length, joints,
      bodies: ids.map(b => s.bn[b]), rootBody: P.root, leg_mounts, arm_mounts, top_mount,
      xml: toXML(node), actuatorXml: acts.map(a => toXML(a)).join('\n'),
      meshes: usedMeshes(node), homeNote: s.S.homeNote});
    continue;
  }
  // limbs: one fragment per mirror variant, all cut from the original robot
  const variants = {};
  let mass = 0, dof = 0, meshes = new Set(), stance = null, reach = null;
  for (const [code, rootName] of Object.entries(P.variants)) {
    const {node, origin, acts} = cutSubtree(s, rootName);
    const ids = subtreeBodies(s, rootName), joints = jointsIn(s, ids, P.kind);
    const v = {root: rootName, origin: {pos: origin.pos.map(r6), quat: origin.quat.map(r6)}, joints, bodies: ids.map(b => s.bn[b]),
      xml: toXML(node), actuatorXml: acts.map(a => toXML(a)).join('\n')};
    // original <contact><exclude> pairs between the mount side (outside this limb) and a body of this limb
    const inLimb = new Set(ids.map(b => s.bn[b]));
    const ex = s.excludes.filter(([a, b]) => inLimb.has(a) !== inLimb.has(b)).map(([a, b]) => inLimb.has(a) ? b === s.bodies[rootName].parent?.attrs.name ? a : null : a === s.bodies[rootName].parent?.attrs.name ? b : null).filter(Boolean);
    if (ex.length) v.excludeWithMount = ex;
    if (P.kind === 'leg') v.stance = legStance(s, rootName, joints);
    if (P.kind === 'arm') v.reach = armReach(s, rootName, P.tip);
    variants[code] = v; mass = massOf(s, ids); dof = joints.length; usedMeshes(node).forEach(m => meshes.add(m));
    stance ??= v.stance; reach ??= v.reach;
  }
  const first = Object.values(variants)[0];
  const out = {...base, mountType: P.mountType, mass, dof, joints: first.joints.map(j => ({...j})),
    mirror: Object.keys(variants), variants, xml: first.xml, actuatorXml: first.actuatorXml, meshes: [...meshes], homeNote: s.S.homeNote};
  if (P.kind === 'leg') out.stance = {drop: stance.drop, crouchGain: stance.crouchGain};
  if (P.kind === 'arm') out.reach = reach;
  if (P.source === 'ur5e') out.baseQuat = first.origin.quat; // UR5e base is yawed 180° in the original file
  parts.push(out);
}

// ---------- shared per-robot data ----------
const sources = {};
for (const [key, s] of Object.entries(src)) {
  const used = new Set(parts.filter(p => p.source === key).flatMap(p => p.meshes));
  const defaults = s.defRoot.children.map(d => renameAssetRefs(clone(d), key));
  const materials = s.materials.map(m => { const c = renameAssetRefs(clone(m), key); c.attrs.name = `${key}__${m.attrs.name}`; return c; });
  const meshes = {};
  for (const [n, f] of Object.entries(s.meshes)) if (used.has(`${key}__${n}`)) meshes[`${key}__${n}`] = f;
  sources[key] = {label: s.S.label, vendor: s.S.vendor, dir: manifest[key].dir, file: s.S.xml, option: s.option,
    defaults: defaults.map(d => toXML(d)).join('\n'), materials: materials.map(m => toXML(m)).join('\n'), meshes,
    files: [...new Set(Object.values(meshes))].sort()};
}
for (const p of parts) {
  p.files = [...new Set(p.meshes.map(m => sources[p.source].meshes[m]))].sort();
  if (p.homeNote === undefined) delete p.homeNote;
}

const out = {
  generated: new Date().toISOString(), generator: 'hall/parts/extract.mjs', mujoco: mj.mj_versionString(),
  note: 'Parts cut from the official MuJoCo Menagerie MJCF files (unmodified). {P} is the per-instance name prefix placeholder. ' +
    'Class, material and mesh names are namespaced with the source robot key (go2__knee). Mesh files are relative to the robot model dir.',
  sources, parts,
};
fs.writeFileSync(path.join(HERE, 'parts.json'), JSON.stringify(out, null, 1));
console.log(`wrote parts.json: ${parts.length} parts`);
for (const p of parts) console.log(`  ${p.id.padEnd(10)} ${p.kind.padEnd(5)} ${p.vendor.padEnd(16)} mass ${p.mass.toFixed(3).padStart(7)} kg  dof ${String(p.dof).padStart(2)}  ${p.mirror ? 'variants ' + p.mirror.join('/') : ''}${p.stance ? `  drop ${p.stance.drop.toFixed(3)} m` : ''}${p.reach ? `  reach ${p.reach.toFixed(3)} m` : ''}`);
