// Browser loader for composed robots (Hardware Lab): compose -> write only the needed mesh files into MuJoCo's
// MEMFS (same layout as hall/mj.js: /m/<robotKey>/<file>) -> load -> three.js group -> stand-in controller.
//
//   import {spawnComposed} from './parts/loader.js';
//   const bot = await spawnComposed({torso: 'go2_base', legs: {part: 'go2_leg', layout: 'hex'}});
//   scene.add(bot.group);                        // Y-up group, like MJ.spawn() in hall/mj.js
//   every frame: bot.update(dt, {vx: 0.3});      // steps physics at model.opt.timestep, syncs meshes
//   bot.spec                                     // mass, dof, legs, arms, joints, sources (spec sheet data)
//   bot.dispose()
//
// Options: {mujoco, THREE, base, lib, fetchBytes} — pass `mujoco` to share one WASM instance with other code;
// `base` is the URL of the public root (default: resolved from this file, so it works from any page).
import {compose} from './composer.js';
import {makeController, CONTROLLER_LABEL} from './controller.js';

const HERE = new URL('.', import.meta.url);
const PUBLIC = new URL('../../', HERE);
let mujocoP = null, libP = null;
const writtenBy = new WeakMap(); // WASM instance -> Set of MEMFS paths already written
let composedCount = 0;

async function defaultMujoco() {
  if (!mujocoP) mujocoP = (async () => {
    const {default: load} = await import(new URL('vendor/mujoco/mujoco_wasm.js', PUBLIC).href);
    const m = await load();
    return m;
  })();
  return mujocoP;
}
function ensureMount(m) {
  try { m.FS.stat('/m'); } catch { m.FS.mkdir('/m'); m.FS.mount(m.MEMFS, {root: '.'}, '/m'); }
}
export async function loadLibrary(base = PUBLIC) {
  if (!libP) libP = fetch(new URL('hall/parts/parts.json', base)).then(r => r.json());
  return libP;
}
const defaultFetchBytes = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return new Uint8Array(await r.arrayBuffer()); };

// write the mesh files a composed robot needs; skips files already present (hall/mj.js writes whole robots there too)
export async function writeFiles(m, files, lib, {base = PUBLIC, fetchBytes = defaultFetchBytes} = {}) {
  ensureMount(m);
  if (!writtenBy.has(m)) writtenBy.set(m, new Set());
  const written = writtenBy.get(m), jobs = [];
  for (const [key, list] of Object.entries(files)) for (const f of list) {
    const p = `/m/${key}/${f}`;
    if (written.has(p)) continue;
    try { m.FS.stat(p); written.add(p); continue; } catch {}
    jobs.push((async () => {
      const bytes = await fetchBytes(new URL(`models/${lib.sources[key].dir}/${f}`, base).href);
      let d = `/m/${key}`; try { m.FS.mkdir(d); } catch {}
      for (const s of f.split('/').slice(0, -1)) { d += '/' + s; try { m.FS.mkdir(d); } catch {} }
      m.FS.writeFile(p, bytes); written.add(p);
    })());
  }
  await Promise.all(jobs);
}

// compose + load, no rendering (also usable in a worker)
export async function loadComposed(config, opts = {}) {
  const m = opts.mujoco || await defaultMujoco();
  const lib = opts.lib || await loadLibrary(opts.base);
  const {xml, files, spec} = compose(config, lib);
  await writeFiles(m, files, lib, opts);
  const path = `/m/composed_${++composedCount}.xml`; // xml at /m so mesh paths "<key>/assets/..." resolve
  m.FS.writeFile(path, xml);
  const model = m.MjModel.loadFromXML(path);
  try { m.FS.unlink(path); } catch {}
  const data = new m.MjData(model);
  m.mj_resetDataKeyframe(model, data, 0);
  m.mj_forward(model, data);
  const controller = makeController(model, data, spec, opts.controller);
  return {mujoco: m, model, data, spec, xml, files, controller};
}

// compose + load + three.js meshes (Y-up group) + fixed-step update
// maker logos are separate meshes (H1/G1 "logo_link"): composed robots never draw them either (director: no maker names)
function logoGeom(model, g) {
  if (model.geom_type[g] !== 7 || !model.name_meshadr) return false;
  const id = model.geom_dataid[g]; if (id < 0) return false;
  const names = model.__names || (model.__names = new TextDecoder().decode(model.names || new Uint8Array()));
  const adr = model.name_meshadr[id]; return /logo/i.test(names.slice(adr, names.indexOf('\0', adr)));
}
export async function spawnComposed(config, opts = {}) {
  const THREE = opts.THREE || await import(new URL('vendor/three.module.js', PUBLIC).href);
  const r = await loadComposed(config, opts);
  const {mujoco: m, model, data} = r;
  const group = new THREE.Group(), inner = new THREE.Group();
  inner.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2); // MuJoCo Z-up -> three Y-up
  group.add(inner);
  const meshes = [], mats = new Map();
  for (let g = 0; g < model.ngeom; g++) {
    if (model.geom_type[g] === 0 || model.geom_group[g] >= 3 || logoGeom(model, g)) continue; // floor plane, collision-only geoms, maker logo plates
    const geo = geometry(THREE, model, g); if (!geo) continue;
    const mi = model.geom_matid[g], src = mi >= 0 ? model.mat_rgba : model.geom_rgba, o = (mi >= 0 ? mi : g) * 4;
    if (src[o + 3] === 0) continue;
    const k = `${src[o].toFixed(2)},${src[o + 1].toFixed(2)},${src[o + 2].toFixed(2)}`;
    if (!mats.has(k)) { const c = new THREE.Color(src[o], src[o + 1], src[o + 2]), l = c.r * .3 + c.g * .59 + c.b * .11; // same shell finish as hall/mj.js
      mats.set(k, new THREE.MeshPhysicalMaterial({color: c, roughness: l > .5 ? .38 : .28, metalness: l > .5 ? 0 : .65, clearcoat: l > .5 ? .35 : .15, clearcoatRoughness: .35, envMapIntensity: .9})); }
    const mesh = new THREE.Mesh(geo, mats.get(k)); mesh.castShadow = mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
    mesh.userData.g = g; inner.add(mesh); meshes.push(mesh);
  }
  const M4 = new THREE.Matrix4();
  const sync = () => {
    const p = data.geom_xpos, x = data.geom_xmat;
    for (const mesh of meshes) { const g = mesh.userData.g, a = g * 3, b = g * 9;
      M4.set(x[b], x[b + 1], x[b + 2], p[a], x[b + 3], x[b + 4], x[b + 5], p[a + 1], x[b + 6], x[b + 7], x[b + 8], p[a + 2], 0, 0, 0, 1);
      mesh.matrix.copy(M4); }
  };
  sync();
  let acc = 0;
  const dt = model.opt.timestep;
  return {...r, group, meshes, label: CONTROLLER_LABEL,
    reset() { m.mj_resetDataKeyframe(model, data, 0); m.mj_forward(model, data); sync(); },
    update(frameDt, cmd = {}) { // fixed-step physics, max 1/15 s per frame
      acc = Math.min(acc + frameDt, 1 / 15);
      while (acc >= dt) { r.controller.step(dt, cmd); m.mj_step(model, data); acc -= dt; }
      sync();
    },
    dispose() { group.traverse(o => o.geometry?.dispose?.()); for (const mt of mats.values()) mt.dispose(); data.delete(); model.delete(); },
  };
}

function geometry(THREE, model, g) {
  const t = model.geom_type[g], s = model.geom_size, x = s[g * 3], y = s[g * 3 + 1], z = s[g * 3 + 2];
  if (t === 2) return new THREE.SphereGeometry(x, 20, 14);
  if (t === 4) { const q = new THREE.SphereGeometry(1, 20, 14); q.scale(x, y, z); return q; }
  if (t === 6) return new THREE.BoxGeometry(x * 2, y * 2, z * 2);
  if (t === 5) { const q = new THREE.CylinderGeometry(x, x, y * 2, 24); q.rotateX(Math.PI / 2); return q; }
  if (t === 3) { const q = new THREE.CapsuleGeometry(x, y * 2, 6, 16); q.rotateX(Math.PI / 2); return q; }
  if (t === 7) {
    const id = model.geom_dataid[g]; if (id < 0) return null;
    const va = model.mesh_vertadr[id], vn = model.mesh_vertnum[id], fa = model.mesh_faceadr[id], fn = model.mesh_facenum[id];
    const q = new THREE.BufferGeometry();
    q.setAttribute('position', new THREE.BufferAttribute(new Float32Array(model.mesh_vert.subarray(va * 3, (va + vn) * 3)), 3));
    q.setIndex(new THREE.BufferAttribute(new Uint32Array(model.mesh_face.subarray(fa * 3, (fa + fn) * 3)), 1));
    q.computeVertexNormals(); return q;
  }
  return null;
}
