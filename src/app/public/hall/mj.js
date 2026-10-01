// Real robots in the lab: official MuJoCo Menagerie models (Unitree H1/G1/Go2, UR5e, Boston Dynamics Spot)
// running on the official MuJoCo WebAssembly build. Each instance has its own MjModel/MjData, rendered with three.js.
//   const bot = await MJ.spawn('go2', {physics: false});  scene.add(bot.group);  bot.update(t, dt);
// Kinematic mode (default) drives the real joints with a motion "recipe" and mj_kinematics (exact geometry and joint axes).
// Physics mode steps the full simulation with a PD controller around the home pose (push it, change payload…).
import * as THREE from '../vendor/three.module.js';

let mujocoP = null, manifestP = null;
const loaded = new Map(); // key -> Promise<void> (files written to MEMFS)
// one compiled MjModel and one set of three.js geometries per robot type, shared by every instance
// (compiling per instance ran the WASM heap past its 2 GB limit once heroes joined the exhibits)
const models = new Map(), geoCache = new Map(), sharedData = new Map(), sharedHome = new Map(), decalCache = new Map();
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
  })().catch(e => { loaded.delete(key); throw e; })); // a network hiccup can be retried later
  return loaded.get(key);
}

// ---------- Skild livery: the wordmark on every robot's chest, maker logos hidden (director's call) ----------
let markP = null;
function wordmarkImg() {
  if (!markP) markP = new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = '../assets/brand/skild-wordmark-mono.svg'; });
  return markP;
}
const liveryTex = new Map();
function livery(color, plate = null, ratio = 1.76) {
  const id = color + (plate || '') + ratio; if (liveryTex.has(id)) return liveryTex.get(id);
  const c = document.createElement('canvas'); c.width = 2048; c.height = Math.round(2048 / ratio); // 2K, proportions match the decal
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  wordmarkImg().then(img => {
    const x = c.getContext('2d');
    if (plate) { x.fillStyle = plate; x.beginPath(); x.roundRect(8, 8, c.width - 16, c.height - 16, 120); x.fill(); x.globalCompositeOperation = 'destination-out'; }
    const mw = Math.min(c.width * .66, c.height * .5 * 134 / 40), mh = mw * 40 / 134; // keep the wordmark's own 134:40 proportions
    if (img) x.drawImage(img, (c.width - mw) / 2, (c.height - mh) / 2, mw, mh);
    else { x.font = '600 190px sans-serif'; x.textBaseline = 'middle'; x.fillText('SKILD AI', 20, c.height / 2); }
    if (plate) { // plate with the wordmark cut out, then the wordmark painted back in its own colour
      x.globalCompositeOperation = 'destination-over'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'destination-in'; x.beginPath(); x.roundRect(8, 8, c.width - 16, c.height - 16, 120); x.fill();
    } else { x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); }
    tex.needsUpdate = true;
  });
  tex.userData.shared = true; liveryTex.set(id, tex); return tex; // shared across robots: TRY stands must not dispose it
}
const CHEST = ['torso_link', 'torso', 'trunk', 'base_link', 'base', 'body', 'pelvis', 'shoulder_link'];

// maker logos are separate meshes inside the torso body (H1/G1 "logo_link"): never draw them
function isLogoGeom(model, g) {
  if (model.geom_type[g] !== 7 || !model.name_meshadr) return false;
  const id = model.geom_dataid[g]; if (id < 0) return false;
  const names = model.__names || (model.__names = new TextDecoder().decode(model.names || new Uint8Array()));
  const adr = model.name_meshadr[id]; return /logo/i.test(names.slice(adr, names.indexOf('\0', adr)));
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

export async function spawn(key, {physics = false, tint = null, scale = 1, brand = true, shared = false} = {}) {
  await ensureFiles(key);
  const m = await mujoco(), man = await manifest();
  if (!models.has(key)) models.set(key, m.MjModel.loadFromXML(`/m/${key}/${man[key].xml}`));
  const model = models.get(key);
  if (!geoCache.has(key)) geoCache.set(key, new Map());
  const geos = geoCache.get(key);
  // shared: kinematic-only robots of one type share one MjData (each MjData reserves a large arena;
  // ~20 private ones ran the 2 GB WASM heap out). Each robot keeps its own qpos and borrows the sim to pose itself.
  let sim;
  if (shared && !physics) {
    if (!sharedData.has(key)) { const d = new m.MjData(model); if (model.nkey > 0) m.mj_resetDataKeyframe(model, d, 0); m.mj_forward(model, d); sharedData.set(key, d); sharedHome.set(key, Float64Array.from(d.qpos)); }
    sim = sharedData.get(key);
  } else { sim = new m.MjData(model); if (model.nkey > 0) m.mj_resetDataKeyframe(model, sim, 0); m.mj_forward(model, sim); }
  const data = sim === sharedData.get(key) && shared && !physics ? {qpos: Float64Array.from(sharedHome.get(key))} : sim; // own pose, starting from the keyframe
  const pose = () => { if (data !== sim) sim.qpos.set(data.qpos); };

  const group = new THREE.Group(), inner = new THREE.Group(); inner.quaternion.copy(Z_UP_TO_Y_UP); inner.scale.setScalar(scale); group.add(inner);
  const meshes = [];
  const matCache = new Map();
  for (let g = 0; g < model.ngeom; g++) {
    const grp = model.geom_group[g], type = model.geom_type[g];
    if (type === PLANE || grp >= 3 || isLogoGeom(model, g)) continue; // collision-only geoms live in group 3 in Menagerie
    if (!geos.has(g)) { const gg0 = geomGeometry(model, g); if (gg0) gg0.userData.shared = true; geos.set(g, gg0); }
    const geo = geos.get(g); if (!geo) continue;
    let r = model.geom_rgba[g * 4], gg = model.geom_rgba[g * 4 + 1], b = model.geom_rgba[g * 4 + 2], a = model.geom_rgba[g * 4 + 3];
    const matId = model.geom_matid[g];
    if (matId >= 0 && model.mat_rgba) { r = model.mat_rgba[matId * 4]; gg = model.mat_rgba[matId * 4 + 1]; b = model.mat_rgba[matId * 4 + 2]; a = model.mat_rgba[matId * 4 + 3]; }
    if (a === 0) continue;
    const keyC = `${r.toFixed(2)},${gg.toFixed(2)},${b.toFixed(2)}`;
    let mat = matCache.get(keyC);
    if (!mat) { // satin plastic shells, anodised dark parts (the look lookdev.upgradeRobot used to apply later)
      const c = tint ? new THREE.Color(tint) : new THREE.Color(r, gg, b), l = c.r * .3 + c.g * .59 + c.b * .11;
      mat = new THREE.MeshPhysicalMaterial({color: c, roughness: l > .5 ? .38 : .28, metalness: l > .5 ? 0 : .65, clearcoat: l > .5 ? .35 : .15, clearcoatRoughness: .35, envMapIntensity: .9});
      matCache.set(keyC, mat);
    }
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
  const bodyName = b => { const adr = model.name_bodyadr?.[b]; if (adr == null) return ''; return names.slice(adr, names.indexOf('\0', adr)); };
  for (const mesh of meshes) if (/logo/i.test(bodyName(mesh.userData.body))) mesh.visible = false; // maker logo plates

  // chest decal: find the torso, measure its front face in body coordinates, stick the wordmark on it
  const decals = [];
  if (brand) {
    let chest = -1; for (const n of CHEST) { for (let b = 1; b < model.nbody && chest < 0; b++) if (bodyName(b) === n) chest = b; if (chest >= 0) break; }
    if (chest < 0) chest = 1;
    const box = new THREE.Box3(), v = new THREE.Vector3(), q = new THREE.Quaternion(), gp = new THREE.Vector3(); let lum = 0, nl = 0; const avg = new THREE.Color(0, 0, 0); let wsum = 0;
    for (const mesh of meshes) {
      const g = mesh.userData.g; if (mesh.userData.body !== chest || !mesh.visible) continue;
      gp.set(model.geom_pos[g * 3], model.geom_pos[g * 3 + 1], model.geom_pos[g * 3 + 2]);
      q.set(model.geom_quat[g * 4 + 1], model.geom_quat[g * 4 + 2], model.geom_quat[g * 4 + 3], model.geom_quat[g * 4]);
      const pa = mesh.geometry.attributes.position;
      for (let i = 0; i < pa.count; i += 3) box.expandByPoint(v.fromBufferAttribute(pa, i).applyQuaternion(q).add(gp));
      const c = mesh.material.color, wgt = pa.count; lum += c.r * .3 + c.g * .59 + c.b * .11; nl++; if (wgt > wsum) { avg.copy(c); wsum = wgt; } // the biggest shell piece sets the paint colour
    }
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3()), yc = (box.min.y + box.max.y) / 2;
      // where the shell surface actually is inside the plate's footprint (not the bounding box: shoulders stick out)
      const surface = (front, zc, hw, hh) => {
        let best = front ? -Infinity : Infinity;
        for (const mesh of meshes) {
          const g = mesh.userData.g; if (mesh.userData.body !== chest || !mesh.visible) continue;
          gp.set(model.geom_pos[g * 3], model.geom_pos[g * 3 + 1], model.geom_pos[g * 3 + 2]);
          q.set(model.geom_quat[g * 4 + 1], model.geom_quat[g * 4 + 2], model.geom_quat[g * 4 + 3], model.geom_quat[g * 4]);
          const pa = mesh.geometry.attributes.position;
          for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyQuaternion(q).add(gp); if (Math.abs(v.y - yc) < hw && Math.abs(v.z - zc) < hh) best = front ? Math.max(best, v.x) : Math.min(best, v.x); }
        }
        return Number.isFinite(best) ? best : (front ? box.max.x : box.min.x);
      };
      // light plate + dark wordmark, front and back, laid over the maker lettering moulded into the shell
      const pw = Math.min(size.y * .62, .26), ph = pw / (key === 'h1' ? 1.2 : 1.76);
      // no plate: the wordmark is printed on the shell. The patch under it is the shell's own colour and finish,
      // so it reads as bare body while still hiding moulded maker lettering. Dark robot → white logo, light → black.
      const shellLum = avg.r * .3 + avg.g * .59 + avg.b * .11, dark = shellLum < .35;
      const ink = dark ? '#f2f4f3' : '#141817', paint = '#' + avg.getHexString(THREE.SRGBColorSpace);
      const moulded = key === 'h1' || key === 'go2'; // shells with maker lettering moulded in: print over a shell-coloured patch
      const mat = new THREE.MeshPhysicalMaterial({map: livery(ink, moulded ? paint : null, key === 'h1' ? 1.2 : 1.76), transparent: true, roughness: dark ? .28 : .38, metalness: dark ? .65 : 0, clearcoat: dark ? .2 : .6, clearcoatRoughness: .25, polygonOffset: true, polygonOffsetFactor: -4});
      // conformal decal: copy the shell triangles under the footprint, lift them 1.5 mm, map the wordmark across them
      // (it follows every curve of the body instead of sitting flat in front of it)
      let slot = 0;
      const conform = (U, V, N, C, w, h, material) => {
        const ck = `${key}:${slot++}`;
        if (decalCache.has(ck)) { const m = new THREE.Mesh(decalCache.get(ck), material); m.matrixAutoUpdate = false; m.userData.decal = true; inner.add(m); decals.push({mesh: m, body: chest, local: new THREE.Matrix4()}); return; }
        const pos = [], uv = [], A = new THREE.Vector3(), B2 = new THREE.Vector3(), D = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3(), t = new THREE.Vector3();
        for (const mesh of meshes) {
          const g = mesh.userData.g; if (mesh.userData.body !== chest || !mesh.visible) continue;
          gp.set(model.geom_pos[g * 3], model.geom_pos[g * 3 + 1], model.geom_pos[g * 3 + 2]); q.set(model.geom_quat[g * 4 + 1], model.geom_quat[g * 4 + 2], model.geom_quat[g * 4 + 3], model.geom_quat[g * 4]);
          const pa = mesh.geometry.attributes.position, ix = mesh.geometry.index; const n = ix ? ix.count : pa.count;
          for (let k = 0; k < n; k += 3) {
            const tri = [A, B2, D].map((P, j) => P.fromBufferAttribute(pa, ix ? ix.getX(k + j) : k + j).applyQuaternion(q).add(gp));
            fn.crossVectors(e1.subVectors(B2, A), e2.subVectors(D, A)).normalize(); if (fn.dot(N) < .35) continue;
            const uvs = tri.map(P => { t.subVectors(P, C); return [t.dot(U) / w + .5, t.dot(V) / h + .5, t.dot(N)]; });
            if (uvs.every(([u]) => u < 0) || uvs.every(([u]) => u > 1) || uvs.every(([, v]) => v < 0) || uvs.every(([, v]) => v > 1)) continue;
            if (uvs.some(([, , d]) => d < -.04)) continue; // only the outer skin, not parts behind it
            const lift = key === 'go2' ? .006 : .0015; // Go2's lettering is raised relief: sit above it
            tri.forEach((P, j) => { pos.push(P.x + fn.x * lift, P.y + fn.y * lift, P.z + fn.z * lift); uv.push(uvs[j][0], uvs[j][1]); });
          }
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.computeVertexNormals();
        geo.userData.shared = true; decalCache.set(ck, geo);
        material.map.wrapS = material.map.wrapT = THREE.ClampToEdgeWrapping;
        const m = new THREE.Mesh(geo, material); m.matrixAutoUpdate = false; m.userData.decal = true; inner.add(m);
        decals.push({mesh: m, body: chest, local: new THREE.Matrix4()});
      };
      const long = (key === 'go2' || key === 'spot') && size.x > size.z * 1.3; // quadruped body: plates on both flanks (covers the moulded model name)
      if (long) {
        const surfY = side => { let best = side > 0 ? -Infinity : Infinity;
          for (const mesh of meshes) { const g = mesh.userData.g; if (mesh.userData.body !== chest || !mesh.visible) continue;
            gp.set(model.geom_pos[g * 3], model.geom_pos[g * 3 + 1], model.geom_pos[g * 3 + 2]); q.set(model.geom_quat[g * 4 + 1], model.geom_quat[g * 4 + 2], model.geom_quat[g * 4 + 3], model.geom_quat[g * 4]);
            const pa = mesh.geometry.attributes.position; const xc = (box.min.x + box.max.x) / 2, zc = (box.min.z + box.max.z) / 2;
            for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i).applyQuaternion(q).add(gp); if (Math.abs(v.x - xc) < size.x * .4 && Math.abs(v.z - zc) < size.z * .3) best = side > 0 ? Math.max(best, v.y) : Math.min(best, v.y); } }
          return Number.isFinite(best) ? best : (side > 0 ? box.max.y : box.min.y); };
        const qw = Math.min(size.x * 1.05, .72), qh = Math.min(qw / 2.4, size.z * .62), xc = (box.min.x + box.max.x) / 2, zc = box.min.z + size.z * .58; // lettering sits on the upper flank
        const flankMat = mat.clone(); flankMat.map = livery(ink, paint, qw / qh);
        for (const side of [1, -1]) {
          // printed on the flank (+y / -y); text reads front-to-back on each side
          conform(new THREE.Vector3(-side, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, side, 0), new THREE.Vector3(xc, surfY(side), zc), qw, qh, flankMat);
        }
      } else
      for (const [front, frac] of [[true, key === 'h1' ? .55 : .49], [false, .44]]) {
        const zc = box.min.z + size.z * frac, x = surface(front, zc, pw / 2, ph / 2);
        conform(new THREE.Vector3(0, front ? 1 : -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(front ? 1 : -1, 0, 0), new THREE.Vector3(x, yc, zc), pw, ph, mat);
      }
    }
  }
  const tmpM = new THREE.Matrix4();

  function sync() {
    const xp = sim.geom_xpos, xm = sim.geom_xmat;
    for (const mesh of meshes) {
      const g = mesh.userData.g, p = g * 3, q = g * 9;
      tmpM.set(xm[q], xm[q + 1], xm[q + 2], xp[p], xm[q + 3], xm[q + 4], xm[q + 5], xp[p + 1], xm[q + 6], xm[q + 7], xm[q + 8], xp[p + 2], 0, 0, 0, 1);
      mesh.matrix.copy(tmpM);
    }
    const bp = sim.xpos, bm = sim.xmat;
    for (const d of decals) {
      const b = d.body, p = b * 3, q = b * 9;
      tmpM.set(bm[q], bm[q + 1], bm[q + 2], bp[p], bm[q + 3], bm[q + 4], bm[q + 5], bp[p + 1], bm[q + 6], bm[q + 7], bm[q + 8], bp[p + 2], 0, 0, 0, 1);
      d.mesh.matrix.multiplyMatrices(tmpM, d.local);
    }
  }
  pose(); m.mj_kinematics(model, sim); sync();

  const bot = {
    key, group, model, data, jnt, home, meshes, physics,
    hidden: new Set(),
    set(name, value) { const a = jnt[name]; if (a !== undefined) data.qpos[a] = value; },
    reset() { for (let i = 0; i < home.length; i++) data.qpos[i] = home[i]; },
    kinematics() { pose(); m.mj_kinematics(model, sim); sync(); },
    step(n = 1) { for (let i = 0; i < n; i++) m.mj_step(model, data); sync(); },
    hideBody(pred) { for (const mesh of meshes) if (pred(mesh.userData.body)) mesh.visible = false; },
    meshName(g) { const id = model.geom_dataid[g]; if (id < 0 || !model.name_meshadr) return ''; const adr = model.name_meshadr[id]; return names.slice(adr, names.indexOf('\0', adr)); },
    bodyName(b) { const adr = model.name_bodyadr?.[b]; if (adr == null) return ''; return names.slice(adr, names.indexOf('\0', adr)); },
    recipe: null,
    update(t, dt) { if (bot.recipe) { bot.reset(); bot.recipe(bot, t, dt); bot.kinematics(); } },
    dispose() { group.removeFromParent(); for (const d of decals) d.mesh.material.dispose(); for (const mm of matCache.values()) mm.dispose(); if (data === sim) data.delete(); }, // model, geometries, decal shapes and shared sims stay
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

// shown in the lab: every robot wears the Skild livery (maker names stay only in the license files)
export const LABEL = {h1: 'Skild humanoid XL', g1: 'Skild humanoid', go2: 'Skild quadruped', ur5e: 'Skild arm', spot: 'Skild quadruped L'};

// ---------- real parts for the Hardware Lab shelves: one body of a real robot, its exact meshes, posed at home ----------
export async function bodyPart(key, name) {
  await ensureFiles(key);
  const m = await mujoco(), man = await manifest();
  if (!models.has(key)) models.set(key, m.MjModel.loadFromXML(`/m/${key}/${man[key].xml}`));
  const model = models.get(key);
  if (!geoCache.has(key)) geoCache.set(key, new Map());
  const geos = geoCache.get(key);
  if (!sharedData.has(key)) { const d = new m.MjData(model); if (model.nkey > 0) m.mj_resetDataKeyframe(model, d, 0); m.mj_forward(model, d); sharedData.set(key, d); sharedHome.set(key, Float64Array.from(d.qpos)); }
  const d = sharedData.get(key);
  if (model.nkey > 0) m.mj_resetDataKeyframe(model, d, 0); m.mj_kinematics(model, d);
  const names = new TextDecoder().decode(model.names || new Uint8Array());
  let b = -1; for (let i = 0; i < model.nbody; i++) { const adr = model.name_bodyadr[i]; if (names.slice(adr, names.indexOf('\0', adr)) === name) { b = i; break; } }
  if (b < 0) return null;
  const bw = new THREE.Matrix4().set(d.xmat[b * 9], d.xmat[b * 9 + 1], d.xmat[b * 9 + 2], d.xpos[b * 3], d.xmat[b * 9 + 3], d.xmat[b * 9 + 4], d.xmat[b * 9 + 5], d.xpos[b * 3 + 1], d.xmat[b * 9 + 6], d.xmat[b * 9 + 7], d.xmat[b * 9 + 8], d.xpos[b * 3 + 2], 0, 0, 0, 1).invert();
  const inner = new THREE.Group(); inner.quaternion.copy(Z_UP_TO_Y_UP);
  for (let g = 0; g < model.ngeom; g++) {
    if (model.geom_bodyid[g] !== b || model.geom_group[g] >= 3 || model.geom_type[g] === PLANE || isLogoGeom(model, g)) continue;
    if (!geos.has(g)) geos.set(g, geomGeometry(model, g));
    const geo = geos.get(g); if (!geo) continue;
    const matId = model.geom_matid[g], src = matId >= 0 && model.mat_rgba ? model.mat_rgba : model.geom_rgba, k = matId >= 0 && model.mat_rgba ? matId : g;
    if (src[k * 4 + 3] === 0) continue;
    const mesh = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({color: new THREE.Color(src[k * 4], src[k * 4 + 1], src[k * 4 + 2]), roughness: .38, metalness: .25, clearcoat: .4}));
    const gw = new THREE.Matrix4().set(d.geom_xmat[g * 9], d.geom_xmat[g * 9 + 1], d.geom_xmat[g * 9 + 2], d.geom_xpos[g * 3], d.geom_xmat[g * 9 + 3], d.geom_xmat[g * 9 + 4], d.geom_xmat[g * 9 + 5], d.geom_xpos[g * 3 + 1], d.geom_xmat[g * 9 + 6], d.geom_xmat[g * 9 + 7], d.geom_xmat[g * 9 + 8], d.geom_xpos[g * 3 + 2], 0, 0, 0, 1);
    mesh.matrixAutoUpdate = false; mesh.matrix.multiplyMatrices(bw, gw); mesh.castShadow = mesh.receiveShadow = true; inner.add(mesh);
  }
  if (!inner.children.length) return null;
  // centre it and sit it on the shelf (y = 0 is the bottom)
  const outer = new THREE.Group(); outer.add(inner); outer.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  return {group: outer, size, label: `${LABEL[key] || key} · ${name.replace(/_link$/, '').replace(/_/g, ' ')}`};
}
