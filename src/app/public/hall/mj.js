// Real robots in the lab: official MuJoCo Menagerie models (Unitree H1/G1/Go2, UR5e, Boston Dynamics Spot)
// running on the official MuJoCo WebAssembly build. Each instance has its own MjModel/MjData, rendered with three.js.
//   const bot = await MJ.spawn('go2', {physics: false});  scene.add(bot.group);  bot.update(t, dt);
// Kinematic mode (default) drives the real joints with a motion "recipe" and mj_kinematics (exact geometry and joint axes).
// Physics mode steps the full simulation with a PD controller around the home pose (push it, change payload…).
import * as THREE from '../vendor/three.module.js';

let mujocoP = null, manifestP = null;
const loaded = new Map(); // key -> Promise<void> (files written to MEMFS)
const Z_UP_TO_Y_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

async function mujoco() {
  if (!mujocoP) mujocoP = (async () => {
    const {default: load} = await import('../vendor/mujoco/mujoco_wasm.js');
    const m = await load();
    m.FS.mkdir('/m'); m.FS.mount(m.MEMFS, {root: '.'}, '/m');
    return m;
  })();
  return mujocoP;
}
async function manifest() { if (!manifestP) manifestP = fetch('../models/manifest.json').then(r => r.json()); return manifestP; }

async function ensureFiles(key) {
  if (!loaded.has(key)) loaded.set(key, (async () => {
    const [m, man] = await Promise.all([mujoco(), manifest()]);
    const info = man[key]; if (!info) throw new Error('unknown robot ' + key);
    const root = `/m/${key}`; try { m.FS.mkdir(root); } catch {}
    await Promise.all(info.files.map(async f => {
      const buf = new Uint8Array(await (await fetch(`../models/${info.dir}/${f}`)).arrayBuffer());
      const parts = f.split('/'); let d = root; for (const p of parts.slice(0, -1)) { d += '/' + p; try { m.FS.mkdir(d); } catch {} }
      m.FS.writeFile(`${root}/${f}`, buf);
    }));
  })());
  return loaded.get(key);
}

// geom type ids (mjtGeom)
const PLANE = 0, SPHERE = 2, CAPSULE = 3, ELLIPSOID = 4, CYLINDER = 5, BOX = 6, MESH = 7;

function geomGeometry(model, g) {
  const type = model.geom_type[g], s = model.geom_size;
  const sx = s[g * 3], sy = s[g * 3 + 1], sz = s[g * 3 + 2];
  switch (type) {
    case SPHERE: return new THREE.SphereGeometry(sx, 20, 14);
    case ELLIPSOID: { const geo = new THREE.SphereGeometry(1, 20, 14); geo.scale(sx, sy, sz); return geo; }
    case BOX: return new THREE.BoxGeometry(sx * 2, sy * 2, sz * 2);
    case CYLINDER: { const geo = new THREE.CylinderGeometry(sx, sx, sy * 2, 24); geo.rotateX(Math.PI / 2); return geo; }
    case CAPSULE: { const geo = new THREE.CapsuleGeometry(sx, sy * 2, 6, 16); geo.rotateX(Math.PI / 2); return geo; }
    case MESH: {
      const id = model.geom_dataid[g]; if (id < 0) return null;
      const va = model.mesh_vertadr[id], vn = model.mesh_vertnum[id], fa = model.mesh_faceadr[id], fn = model.mesh_facenum[id];
      const pos = new Float32Array(model.mesh_vert.subarray(va * 3, (va + vn) * 3));
      const idx = new Uint32Array(model.mesh_face.subarray(fa * 3, (fa + fn) * 3));
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      geo.computeVertexNormals(); return geo;
    }
    default: return null;
  }
}

export async function spawn(key, {physics = false, tint = null, scale = 1} = {}) {
  await ensureFiles(key);
  const m = await mujoco(), man = await manifest();
  const model = m.MjModel.loadFromXML(`/m/${key}/${man[key].xml}`);
  const data = new m.MjData(model);
  if (model.nkey > 0) m.mj_resetDataKeyframe(model, data, 0);
  m.mj_forward(model, data);

  const group = new THREE.Group(), inner = new THREE.Group(); inner.quaternion.copy(Z_UP_TO_Y_UP); inner.scale.setScalar(scale); group.add(inner);
  const meshes = [];
  const matCache = new Map();
  for (let g = 0; g < model.ngeom; g++) {
    const grp = model.geom_group[g], type = model.geom_type[g];
    if (type === PLANE || grp >= 3) continue; // collision-only geoms live in group 3 in Menagerie
    const geo = geomGeometry(model, g); if (!geo) continue;
    let r = model.geom_rgba[g * 4], gg = model.geom_rgba[g * 4 + 1], b = model.geom_rgba[g * 4 + 2], a = model.geom_rgba[g * 4 + 3];
    const matId = model.geom_matid[g];
    if (matId >= 0 && model.mat_rgba) { r = model.mat_rgba[matId * 4]; gg = model.mat_rgba[matId * 4 + 1]; b = model.mat_rgba[matId * 4 + 2]; a = model.mat_rgba[matId * 4 + 3]; }
    if (a === 0) continue;
    const keyC = `${r.toFixed(2)},${gg.toFixed(2)},${b.toFixed(2)}`;
    let mat = matCache.get(keyC);
    if (!mat) { mat = new THREE.MeshStandardMaterial({color: tint || new THREE.Color(r, gg, b), roughness: .45, metalness: .25}); matCache.set(keyC, mat); }
    const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    mesh.userData = {g, body: model.geom_bodyid[g]}; inner.add(mesh); meshes.push(mesh);
  }

  // joint lookup by name -> qpos address
  const jnt = {};
  const names = new TextDecoder().decode(model.names || new Uint8Array());
  for (let j = 0; j < (model.njnt || 0); j++) {
    const adr = model.name_jntadr ? model.name_jntadr[j] : -1; if (adr < 0) continue;
    const end = names.indexOf('\0', adr); jnt[names.slice(adr, end)] = model.jnt_qposadr[j];
  }
  const home = Float64Array.from(data.qpos);
  const tmpM = new THREE.Matrix4();

  function sync() {
    const xp = data.geom_xpos, xm = data.geom_xmat;
    for (const mesh of meshes) {
      const g = mesh.userData.g, p = g * 3, q = g * 9;
      tmpM.set(xm[q], xm[q + 1], xm[q + 2], xp[p], xm[q + 3], xm[q + 4], xm[q + 5], xp[p + 1], xm[q + 6], xm[q + 7], xm[q + 8], xp[p + 2], 0, 0, 0, 1);
      mesh.matrix.copy(tmpM);
    }
  }
  sync();

  const bot = {
    key, group, model, data, jnt, home, meshes, physics,
    hidden: new Set(),
    set(name, value) { const a = jnt[name]; if (a !== undefined) data.qpos[a] = value; },
    reset() { for (let i = 0; i < home.length; i++) data.qpos[i] = home[i]; },
    kinematics() { m.mj_kinematics(model, data); sync(); },
    step(n = 1) { for (let i = 0; i < n; i++) m.mj_step(model, data); sync(); },
    hideBody(pred) { for (const mesh of meshes) if (pred(mesh.userData.body)) mesh.visible = false; },
    bodyName(b) { const adr = model.name_bodyadr?.[b]; if (adr == null) return ''; return names.slice(adr, names.indexOf('\0', adr)); },
    recipe: null,
    update(t, dt) { if (bot.recipe) { bot.reset(); bot.recipe(bot, t, dt); bot.kinematics(); } },
    dispose() { group.traverse(o => { o.geometry?.dispose?.(); }); data.delete(); model.delete(); },
  };
  return bot;
}

// ---------- motion recipes on real joint names (kinematic, matched to what each release video shows) ----------
const legs4 = ['FL', 'FR', 'RL', 'RR'];
export const RECIPES = {
  // Unitree Go2 trot
  go2Trot: (speed = 1) => (b, t) => {
    const w = 9 * speed;
    legs4.forEach((L, i) => {
      const ph = (i === 0 || i === 3 ? 0 : Math.PI);
      b.set(`${L}_thigh_joint`, b.home[b.jnt[`${L}_thigh_joint`]] + Math.sin(t * w + ph) * .35);
      b.set(`${L}_calf_joint`, b.home[b.jnt[`${L}_calf_joint`]] - Math.max(0, Math.sin(t * w + ph + 1.3)) * .55);
    });
  },
  // Go2 missing a calf: limp with big thigh swings (omni-bodied video: "Adapting to loss of limbs")
  go2Limp: (lostLeg = 'FR') => (b, t) => {
    const w = 6.5;
    legs4.forEach((L, i) => {
      const ph = i * Math.PI / 2;
      const thighAmp = L === lostLeg ? .9 : .3;
      b.set(`${L}_thigh_joint`, b.home[b.jnt[`${L}_thigh_joint`]] + Math.sin(t * w + ph) * thighAmp - (L === lostLeg ? .5 : 0));
      if (L !== lostLeg) b.set(`${L}_calf_joint`, b.home[b.jnt[`${L}_calf_joint`]] - Math.max(0, Math.sin(t * w + ph + 1.2)) * .5);
    });
  },
  // Unitree H1 / G1 walk (one-policy: walking, stairs)
  humanoidWalk: (speed = 1) => (b, t) => {
    const w = 5.5 * speed, s = Math.sin(t * w);
    for (const [side, sg] of [['left', 1], ['right', -1]]) {
      b.set(`${side}_hip_pitch${b.jnt[`${side}_hip_pitch_joint`] !== undefined ? '_joint' : ''}`, -.25 * s * sg - .15);
      b.set(`${side}_hip_pitch_joint`, -.3 * s * sg - .2);
      b.set(`${side}_knee`, .35 + Math.max(0, s * sg) * .55); b.set(`${side}_knee_joint`, .35 + Math.max(0, s * sg) * .55);
      b.set(`${side}_ankle`, -.2); b.set(`${side}_ankle_pitch_joint`, -.2 - Math.max(0, s * sg) * .2);
      b.set(`${side}_shoulder_pitch`, .3 * s * sg); b.set(`${side}_shoulder_pitch_joint`, .3 * s * sg);
      b.set(`${side}_elbow`, 1.1); b.set(`${side}_elbow_joint`, 1.1);
    }
  },
  // UR5e pick-and-place loop (learning-by-watching, reindustrial, S1 arms)
  urPick: (phase = 0) => (b, t) => {
    const u = t * .7 + phase;
    b.set('shoulder_pan_joint', Math.sin(u) * 1.1);
    b.set('shoulder_lift_joint', -1.4 + Math.sin(u * 2) * .35);
    b.set('elbow_joint', 1.7 - Math.sin(u * 2) * .4);
    b.set('wrist_1_joint', -1.9 + Math.sin(u * 2 + .5) * .3);
    b.set('wrist_2_joint', -1.57);
    b.set('wrist_3_joint', Math.sin(u) * .8);
  },
  // Go2 parkour loop: runs along the boxes and hops onto/over them (as in Skild's parkour compilation)
  go2Parkour: () => (b, t) => {
    const T = 3.2, c = (t % T) / T, x = -1 + c * 2.2;               // base travels along x
    const hop = Math.max(0, Math.sin(c * Math.PI * 3)) ** 1.5 * .38; // three hops per loop
    const base = b.jnt[''] ?? 0; // free joint qpos starts at 0
    b.data.qpos[0] = b.home[0] + x; b.data.qpos[2] = b.home[2] + hop;
    const tuck = hop > .05 ? 1 : 0, w = 11;
    legs4.forEach((L, i) => {
      const ph = (i < 2 ? 0 : Math.PI);
      b.set(`${L}_thigh_joint`, b.home[b.jnt[`${L}_thigh_joint`]] + (tuck ? (i < 2 ? -.5 : .4) : Math.sin(t * w + ph) * .4));
      b.set(`${L}_calf_joint`, b.home[b.jnt[`${L}_calf_joint`]] - (tuck ? .7 : Math.max(0, Math.sin(t * w + ph + 1.3)) * .6));
    });
    void base;
  },
  // Humanoid parkour loop (Unitree G1/H1): run, two-footed jump onto boxes, jump down (Skild's parkour compilation)
  humanoidParkour: () => (b, t) => {
    const T = 3.6, c = (t % T) / T, x = -1.1 + c * 2.2;
    const hopW = Math.max(0, Math.sin(c * Math.PI * 2)) ** 1.6, hop = hopW * .5;
    b.data.qpos[0] = b.home[0] + x; b.data.qpos[2] = b.home[2] + hop;
    const air = hopW > .08, s = Math.sin(t * 9);
    const J = n => b.jnt[n] !== undefined ? n : n.replace('_joint', '');
    for (const [side, sg] of [['left', 1], ['right', -1]]) {
      b.set(J(`${side}_hip_pitch_joint`), air ? -.9 : -.45 * s * sg - .25);
      b.set(J(`${side}_knee_joint`), air ? 1.5 : .5 + Math.max(0, s * sg) * .7);
      b.set(J(`${side}_ankle_pitch_joint`), air ? -.5 : -.25); b.set(`${side}_ankle`, air ? -.5 : -.25);
      b.set(J(`${side}_shoulder_pitch_joint`), air ? -1.4 : .6 * s * sg); b.set(J(`${side}_elbow_joint`), air ? .4 : 1.2);
    }
  },
  // Spot trot
  spotTrot: () => (b, t) => {
    const w = 8;
    ['fl', 'fr', 'hl', 'hr'].forEach((L, i) => {
      const ph = (i === 0 || i === 3 ? 0 : Math.PI);
      b.set(`${L}_hy`, b.home[b.jnt[`${L}_hy`]] + Math.sin(t * w + ph) * .35);
      b.set(`${L}_kn`, b.home[b.jnt[`${L}_kn`]] - Math.max(0, Math.sin(t * w + ph + 1.3)) * .5);
    });
  },
};

export const LABEL = {h1: 'Unitree H1', g1: 'Unitree G1', go2: 'Unitree Go2', ur5e: 'Universal Robots UR5e', spot: 'Boston Dynamics Spot'};
