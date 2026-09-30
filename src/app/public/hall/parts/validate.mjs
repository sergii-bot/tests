#!/usr/bin/env node
// Headless physics validation of composed robots (Node + official MuJoCo WASM):
//   node hall/parts/validate.mjs [logDir]
// For each build: compose -> load in MuJoCo -> reset to 'home' -> 2 s with the stand-in controller holding the
// pose, then 2 s with its gait on. Checks: loads, no NaN, base height stays above a threshold (55% of the
// composed stance height), and the torso stays upright (tilt < 35 deg). Prints a table; writes XML + JSON log.
import fs from 'fs';
import os from 'os';
import path from 'path';
import {fileURLToPath} from 'url';
import {compose} from './composer.js';
import {makeController, CONTROLLER_LABEL} from './controller.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(HERE, '../..');
const LOG = process.argv[2] || path.join(os.tmpdir(), 'parts-validate');
fs.mkdirSync(LOG, {recursive: true});
const lib = JSON.parse(fs.readFileSync(path.join(HERE, 'parts.json'), 'utf8'));
const {default: loadMujoco} = await import(path.join(PUB, 'vendor/mujoco/mujoco_wasm.js'));
const mj = await loadMujoco();
mj.FS.mkdir('/m'); mj.FS.mount(mj.MEMFS, {root: '.'}, '/m');

// same MEMFS layout the browser loader uses: /m/<robotKey>/<file>, composed xml at /m/<name>.xml
function writeFiles(files) {
  for (const [key, list] of Object.entries(files)) for (const f of list) {
    let d = `/m/${key}`; try { mj.FS.mkdir(d); } catch {}
    for (const p of f.split('/').slice(0, -1)) { d += '/' + p; try { mj.FS.mkdir(d); } catch {} }
    mj.FS.writeFile(`/m/${key}/${f}`, fs.readFileSync(path.join(PUB, 'models', lib.sources[key].dir, f)));
  }
}

const BUILDS = [
  {name: 'go2_quad', ref: ['go2'], label: 'Go2 base + 4 Go2 legs', cfg: {torso: 'go2_base', legs: {part: 'go2_leg'}}, cmd: {vx: 0.3}},
  {name: 'spot_quad', ref: ['spot'], label: 'Spot body + 4 Spot legs', cfg: {torso: 'spot_body', legs: {part: 'spot_leg'}}, cmd: {vx: 0.3}},
  {name: 'h1_humanoid', ref: ['h1'], label: 'H1 torso + 2 H1 legs + 2 H1 arms', cfg: {torso: 'h1_torso', legs: {part: 'h1_leg'}, arms: [{part: 'h1_arm', mount: 'L'}, {part: 'h1_arm', mount: 'R'}]}, cmd: {gait: true}},
  {name: 'g1_humanoid', ref: ['g1'], label: 'G1 torso + 2 G1 legs + 2 G1 arms', cfg: {torso: 'g1_torso', legs: {part: 'g1_leg'}, arms: [{part: 'g1_arm', mount: 'L'}, {part: 'g1_arm', mount: 'R'}]}, cmd: {gait: true}},
  {name: 'go2_ur5e', ref: ['go2', 'ur5e'], label: 'Go2 base + 4 Go2 legs + UR5e (top plate, stowed)', cfg: {torso: 'go2_base', legs: {part: 'go2_leg'}, arms: [{part: 'ur5e_arm', mount: 'top'}], armPose: 'stow'}, cmd: {gait: true}},
  {name: 'go2_hexapod', ref: ['go2'], refParamsOnly: true, label: 'Go2 base + 6 Go2 legs (hexapod)', cfg: {torso: 'go2_base', legs: {part: 'go2_leg', layout: 'hex'}}, cmd: {vx: 0.3}},
];

function footGeomsOf(model, spec) {
  const s = new TextDecoder().decode(model.names), id = {};
  for (let b = 0; b < model.nbody; b++) { const a = model.name_bodyadr[b]; id[s.slice(a, s.indexOf('\0', a))] = b; }
  return spec.legs.map(l => { const fb = id[l.prefix + l.footBody], out = [];
    for (let g = 0; g < model.ngeom; g++) if (model.geom_bodyid[g] === fb && (model.geom_contype[g] || model.geom_conaffinity[g]) && model.geom_type[g] !== 7) out.push(g);
    return out; });
}
function run(model, data, spec, cmd, seconds, ctl) {
  const n = Math.round(seconds / model.opt.timestep);
  const feet = footGeomsOf(model, spec); let lift = 0; // max clearance of any foot's lowest contact primitive
  const low = gs => Math.min(...gs.map(g => data.geom_xpos[g * 3 + 2] - model.geom_size[g * 3]));
  const base = feet.map(low);
  let minH = Infinity, maxTilt = 0, nan = false, x0 = data.qpos[0];
  for (let i = 0; i < n; i++) {
    const s = ctl.step(model.opt.timestep, cmd);
    mj.mj_step(model, data);
    const h = data.qpos[2];
    if (!Number.isFinite(h) || data.qpos.some(v => !Number.isFinite(v))) { nan = true; break; }
    minH = Math.min(minH, h);
    feet.forEach((gs, k) => { lift = Math.max(lift, low(gs) - base[k]); });
    maxTilt = Math.max(maxTilt, Math.hypot(s.roll, s.pitch));
  }
  return {minH, endH: data.qpos[2], maxTiltDeg: maxTilt * 180 / Math.PI, nan, dx: data.qpos[0] - x0, lift};
}

// reference: the unmodified original robots (mass and actuator count) to show the composed body is faithful
const manifest = JSON.parse(fs.readFileSync(path.join(PUB, 'models/manifest.json'), 'utf8'));
const refCache = {};
// equal within 1e-4 relative (dampratio-derived kv is recomputed from the composed inertia: last-digit differences)
const same = (a, b) => {
  if (a == null || b == null) return a === b;
  if (typeof a === 'number') return Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a), Math.abs(b));
  if (typeof a !== 'object') return a === b;
  const ka = Object.keys(a); return ka.length === Object.keys(b).length && ka.every(k => same(a[k], b[k]));
};
// per-joint signature of everything that must survive composition: joint range/damping/armature/frictionloss and
// the actuator's ctrl/force ranges, gains and bias (keyed by the original joint name, prefix stripped)
function signatures(m) {
  const s = new TextDecoder().decode(m.names), nm = a => s.slice(a, s.indexOf('\0', a)), out = {};
  const r = v => Math.round(v * 1e6) / 1e6;
  for (let j = 0; j < m.njnt; j++) {
    if (m.jnt_type[j] !== 3) continue;
    const d = m.jnt_dofadr[j];
    out[nm(m.name_jntadr[j]).replace(/^(t|leg\d+|arm\d+)_/, '')] = {range: [r(m.jnt_range[j * 2]), r(m.jnt_range[j * 2 + 1])],
      actfrc: [r(m.jnt_actfrcrange[j * 2]), r(m.jnt_actfrcrange[j * 2 + 1])], damping: r(m.dof_damping[d]), armature: r(m.dof_armature[d]), frictionloss: r(m.dof_frictionloss[d])};
  }
  for (let a = 0; a < m.nu; a++) {
    const j = m.actuator_trnid[a * 2], k = nm(m.name_jntadr[j]).replace(/^(t|leg\d+|arm\d+)_/, '');
    if (!out[k]) continue;
    out[k].act = [m.actuator_ctrlrange[a * 2], m.actuator_ctrlrange[a * 2 + 1], m.actuator_forcerange[a * 2], m.actuator_forcerange[a * 2 + 1],
      m.actuator_gainprm[a * 10], m.actuator_biasprm[a * 10 + 1], m.actuator_biasprm[a * 10 + 2], m.actuator_gear[a * 6]].map(r);
  }
  return out;
}
function reference(key) {
  if (refCache[key]) return refCache[key];
  const info = manifest[key];
  writeFiles({[key]: info.files});
  const m = mj.MjModel.loadFromXML(`/m/${key}/${info.xml}`);
  let mass = 0; for (let b = 1; b < m.nbody; b++) mass += m.body_mass[b];
  const r = {mass, nu: m.nu, sig: signatures(m)}; m.delete();
  return (refCache[key] = r);
}
const rows = [], log = {generated: new Date().toISOString(), mujoco: mj.mj_versionString(), controller: CONTROLLER_LABEL, builds: []};
for (const B of BUILDS) {
  const row = {build: B.name, label: B.label};
  try {
    const {xml, files, spec} = compose({...B.cfg, name: B.name}, lib);
    fs.writeFileSync(path.join(LOG, `${B.name}.xml`), xml);
    writeFiles(files);
    mj.FS.writeFile(`/m/${B.name}.xml`, xml);
    const model = mj.MjModel.loadFromXML(`/m/${B.name}.xml`);
    const data = new mj.MjData(model);
    mj.mj_resetDataKeyframe(model, data, 0);
    mj.mj_forward(model, data);
    let totalMass = 0; for (let b = 1; b < model.nbody; b++) totalMass += model.body_mass[b];
    Object.assign(row, {load: 'OK', nq: model.nq, nu: model.nu, dof: spec.dof, mass: totalMass, gait: spec.gait, h0: spec.baseHeight});
    if (B.ref) {
      const rs = B.ref.map(reference), sig = signatures(model), ref = Object.assign({}, ...rs.map(r => r.sig));
      const bad = Object.keys(sig).filter(k => !same(sig[k], ref[k]));
      if (bad.length) row.limitDiff = bad.map(k => ({joint: k, composed: sig[k], original: ref[k]}));
      row.limits = bad.length ? 'DIFF ' + bad.join(',') : `same (${Object.keys(sig).length} jnt)`;
    }
    if (B.ref && !B.refParamsOnly) { const rs = B.ref.map(reference); row.refMass = rs.reduce((a, r) => a + r.mass, 0); row.refNu = rs.reduce((a, r) => a + r.nu, 0); }
    const thr = 0.55 * spec.baseHeight;
    const ctl = makeController(model, data, spec);
    const stand = run(model, data, spec, {}, 2, ctl);
    const walk = run(model, data, spec, B.cmd, 2, ctl);
    row.stand = stand; row.walk = walk; row.threshold = thr;
    row.standPass = !stand.nan && stand.minH > thr && stand.maxTiltDeg < 35;
    row.walkPass = !walk.nan && walk.minH > thr && walk.maxTiltDeg < 35;
    data.delete(); model.delete();
    log.builds.push({...row, files, spec: {...spec, home: undefined}});
  } catch (e) {
    row.load = 'FAIL'; row.error = String(e.message || e);
    log.builds.push(row);
  }
  rows.push(row);
}
fs.writeFileSync(path.join(LOG, 'validate.json'), JSON.stringify(log, null, 1));

const f = (v, d = 3) => v == null ? '-' : Number(v).toFixed(d);
const hdr = ['build', 'load', 'nu (orig)', 'mass kg (orig)', 'joint+actuator params', 'h0 m', 'thr m', 'stand minH', 'tilt°', 'stand', 'gait', 'gait minH', 'tilt°', 'dx m', 'lift cm', 'gait ok'];
const lines = rows.map(r => r.load !== 'OK' ? [r.build, 'FAIL ' + r.error] :
  [r.build, r.load, r.refNu != null ? `${r.nu} (${r.refNu})` : r.nu, r.refMass != null ? `${f(r.mass, 2)} (${f(r.refMass, 2)})` : f(r.mass, 2), r.limits || '-', f(r.h0), f(r.threshold), f(r.stand.minH), f(r.stand.maxTiltDeg, 1), r.standPass ? 'PASS' : 'FAIL',
    r.gait, f(r.walk.minH), f(r.walk.maxTiltDeg, 1), f(r.walk.dx, 2), f(r.walk.lift * 100, 1), r.walkPass ? 'PASS' : 'FAIL']);
const widths = hdr.map((h, i) => Math.max(h.length, ...lines.map(l => String(l[i] ?? '').length)));
const fmt = l => l.map((c, i) => String(c ?? '').padEnd(widths[i])).join(' | ');
const out = [`MuJoCo ${log.mujoco} | ${CONTROLLER_LABEL} | 2 s stand + 2 s gait per build`, fmt(hdr), widths.map(w => '-'.repeat(w)).join('-|-'), ...lines.map(fmt)].join('\n');
console.log(out);
fs.writeFileSync(path.join(LOG, 'validate.txt'), out + '\n');
process.exitCode = rows.every(r => r.load === 'OK' && r.standPass) ? 0 : 1;
