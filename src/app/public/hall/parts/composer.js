// Real-parts composer (browser + Node ES module, no DOM).
// Assembles parts cut from the official MuJoCo Menagerie models (see parts.json / extract.mjs) into ONE MJCF file:
// a free-floating torso, legs and arms on the torso's mount frames, a floor, a light, actuators for every joint
// (original actuator classes, so the original gains and force/ctrl limits are kept) and a 'home' keyframe.
//
//   import {compose} from './parts/composer.js';
//   const lib = await (await fetch('parts/parts.json')).json();
//   const {xml, files, spec} = compose({torso: 'go2_base', legs: {part: 'go2_leg', layout: 'hex'},
//                                       arms: [{part: 'ur5e_arm', mount: 'top'}]}, lib);
//   // files = {go2: ['assets/base_0.obj', ...], ur5e: [...]}: paths inside models/<dir>/ that must exist at
//   // <xml dir>/<robotKey>/<file> (hall/mj.js already writes robots to /m/<key>/..., so write xml to /m/<name>.xml)
//
// config:
//   torso: part id (kind 'torso')
//   legs:  {part, layout?: 'quad'|'hex'|'biped'}  or a list [{part, mount: 'FL'|'FR'|'ML'|'MR'|'RL'|'RR'|'L'|'R', variant?}]
//          layout defaults to 'biped' for humanoid legs (variants L/R) and 'quad' for quadruped legs
//   arms:  [{part, mount: 'L'|'R'|'top', variant?}]   (shoulder arms need torso arm_mounts; 'top' uses top_mount)
//   armPose: 'home' (original key of the source robot, default) | 'stow' (folded, low CoM; for arms on legged bases)
//   name:  model name (default 'composed')
import {parseXML, toXML, el, walk} from './xml.js';

const f6 = v => String(Math.round(v * 1e6) / 1e6);
const vec = a => a.map(f6).join(' ');
export function qmul(a, b) {
  return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
}
const isIdentity = q => Math.abs(q[0] - 1) < 1e-9 && !q[1] && !q[2] && !q[3];

// folded arm poses (joint name -> angle) used with armPose 'stow'; all values inside the original joint ranges
export const STOW = {
  ur5e_arm: {shoulder_pan_joint: 0, shoulder_lift_joint: -1.5708, elbow_joint: 2.9, wrist_1_joint: -1.33, wrist_2_joint: -1.5708, wrist_3_joint: 0},
};

const LAYOUT_CODES = {quad: ['FL', 'FR', 'RL', 'RR'], hex: ['FL', 'FR', 'ML', 'MR', 'RL', 'RR'], biped: ['L', 'R']};

function pickVariant(part, code) {
  const v = part.mirror;
  if (v.includes(code)) return code;
  const side = code.slice(-1), end = code.length > 1 ? code[0] : 'F';
  if (v.includes(side)) return side;                    // humanoid leg/arm on any mount: by side
  if (v.includes('F' + side) && end === 'M') return 'F' + side; // middle hex legs use the front-leg cut
  if (v.includes('F' + side)) return 'F' + side;
  if (v.includes('C')) return 'C';
  throw new Error(`${part.id}: no variant for mount ${code}`);
}

export function compose(config, lib) {
  const byId = Object.fromEntries(lib.parts.map(p => [p.id, p]));
  const get = (id, kind) => {
    const p = byId[id]; if (!p) throw new Error(`unknown part ${id}`);
    if (kind && p.kind !== kind) throw new Error(`${id} is a ${p.kind}, not a ${kind}`);
    return p;
  };
  const name = config.name || 'composed';
  const torso = get(config.torso, 'torso');

  // ---- resolve leg list ----
  let legCfg = config.legs || [];
  let layout = null;
  if (!Array.isArray(legCfg)) {
    const lp = get(legCfg.part, 'leg');
    layout = legCfg.layout || (lp.mirror.includes('L') ? 'biped' : 'quad');
    legCfg = LAYOUT_CODES[layout].map(mount => ({part: legCfg.part, mount}));
  } else {
    layout = legCfg.length === 6 ? 'hex' : legCfg.length === 2 ? 'biped' : 'quad';
  }
  const mountSet = torso.leg_mounts[layout];
  if (!mountSet) throw new Error(`${torso.id} has no ${layout} leg mounts`);
  const mountCode = m => layout === 'biped' ? m.side : m.end + m.side;
  const legMount = code => {
    const m = mountSet.find(x => mountCode(x) === code);
    if (!m) throw new Error(`${torso.id}: no ${layout} leg mount ${code}`);
    return m;
  };

  // ---- instances ----
  const P = {torso: 't_'};
  const instances = [{prefix: P.torso, part: torso.id, kind: 'torso', source: torso.source}];
  const sources = new Set([torso.source]);
  const root = parseXML(torso.xml.replaceAll('{P}', P.torso));
  root.attrs.name = P.torso + torso.rootBody;
  const bodyByName = {};
  const reindex = () => walk(root, n => { if (n.tag === 'body') bodyByName[n.attrs.name] = n; });
  reindex();
  const excludes = [];
  let actuatorXml = torso.actuatorXml ? [torso.actuatorXml.replaceAll('{P}', P.torso)] : [];
  const homeOf = {}; // prefixed joint name -> home angle
  const jointInfo = {}; // prefixed joint name -> {role, range, torque, instance}
  for (const j of torso.joints) { homeOf[P.torso + j.name] = j.home; jointInfo[P.torso + j.name] = {...j, instance: P.torso}; }

  function attach(part, variantCode, mount, prefix, extraQuat) {
    const v = part.variants[variantCode];
    const node = parseXML(v.xml.replaceAll('{P}', prefix));
    node.attrs = {name: node.attrs.name, pos: vec(mount.pos), ...node.attrs};
    let q = mount.quat || [1, 0, 0, 0];
    if (extraQuat) q = qmul(q, extraQuat);
    if (!isIdentity(q)) node.attrs.quat = vec(q);
    const parentName = P.torso + mount.body;
    const parent = bodyByName[parentName];
    if (!parent) throw new Error(`mount body ${parentName} missing`);
    parent.children.push(node);
    reindex();
    if (v.actuatorXml) actuatorXml.push(v.actuatorXml.replaceAll('{P}', prefix));
    for (const b of v.excludeWithMount || []) excludes.push([parentName, prefix + b]);
    sources.add(part.source);
    return v;
  }

  const legs = [];
  legCfg.forEach((lc, i) => {
    const part = get(lc.part, 'leg'), mount = legMount(lc.mount), prefix = `leg${i}_`;
    const variant = lc.variant || pickVariant(part, lc.mount);
    const v = attach(part, variant, mount, prefix);
    const joints = v.joints.map(j => ({...j, name: prefix + j.name}));
    for (const j of joints) { homeOf[j.name] = j.home; jointInfo[j.name] = {...j, instance: prefix}; }
    legs.push({prefix, part: part.id, source: part.source, mount: lc.mount, variant, mirrored: variant.slice(-1) === 'R',
      end: mount.end, side: mount.side, pos: mount.pos, joints, footBody: v.bodies[v.bodies.length - 1], stance: v.stance, family: part.mirror.includes('L') ? 'humanoid' : 'quadruped'});
    instances.push({prefix, part: part.id, kind: 'leg', source: part.source, mount: lc.mount, variant});
  });

  const arms = [];
  (config.arms || []).forEach((ac, i) => {
    const part = get(ac.part, 'arm'), prefix = `arm${i}_`;
    let mount, extra = null;
    if (ac.mount === 'top' || part.mountType === 'top_plate') {
      if (!torso.top_mount) throw new Error(`${torso.id} has no top mount`);
      mount = torso.top_mount; extra = part.baseQuat || null;
    } else {
      mount = (torso.arm_mounts || []).find(m => m.side === ac.mount);
      if (!mount) throw new Error(`${torso.id} has no shoulder mount ${ac.mount} (shoulder arms need a humanoid torso; use mount 'top' for a top-plate arm)`);
    }
    const variant = ac.variant || pickVariant(part, ac.mount === 'top' ? 'C' : ac.mount);
    const v = attach(part, variant, mount, prefix, extra);
    const stow = (config.armPose === 'stow' && STOW[part.id]) || null;
    const joints = v.joints.map(j => ({...j, name: prefix + j.name, home: stow && stow[j.name] != null ? stow[j.name] : j.home}));
    for (const j of joints) { homeOf[j.name] = j.home; jointInfo[j.name] = {...j, instance: prefix}; }
    arms.push({prefix, part: part.id, source: part.source, mount: ac.mount || 'top', variant, joints, reach: part.reach});
    instances.push({prefix, part: part.id, kind: 'arm', source: part.source, mount: ac.mount || 'top', variant});
  });

  // ---- free joint + stance height ----
  root.children.unshift(el('freejoint', {name: 'root'}));
  let z0 = 0.3;
  if (legs.length) z0 = Math.max(...legs.map(l => l.stance.drop - l.pos[2])) + 0.003;
  root.attrs.pos = vec([0, 0, z0]);
  delete root.attrs.quat;
  // keep 'name' first for readability
  root.attrs = {name: root.attrs.name, pos: root.attrs.pos, ...root.attrs};

  // ---- joint order (MuJoCo: bodies in depth-first document order, joints in body order) ----
  const qJoints = [];
  (function dfs(b) {
    for (const c of b.children) if (c.tag === 'joint') qJoints.push(c.attrs.name);
    for (const c of b.children) if (c.tag === 'body') dfs(c);
  })(root);
  const qpos = [0, 0, z0, 1, 0, 0, 0, ...qJoints.map(n => homeOf[n] ?? 0)];

  // ---- actuators and key ctrl ----
  const actNodes = actuatorXml.flatMap(s => { const r = parseXML(`<a>${s}</a>`); return r.children; });
  const ctrl = actNodes.map(a => a.tag === 'motor' ? 0 : (homeOf[a.attrs.joint] ?? 0));

  // ---- assets / defaults ----
  const srcList = [...sources];
  const usedMesh = new Set();
  walk(root, n => { if (n.attrs.mesh) usedMesh.add(n.attrs.mesh); });
  const files = {};
  const meshEls = [], matEls = [], defEls = [];
  for (const key of srcList) {
    const s = lib.sources[key];
    files[key] = [];
    for (const [mn, file] of Object.entries(s.meshes)) if (usedMesh.has(mn)) {
      meshEls.push(el('mesh', {name: mn, file: `${key}/${file}`}));
      if (!files[key].includes(file)) files[key].push(file);
    }
    files[key].sort();
    if (s.materials) matEls.push(...parseXML(`<a>${s.materials}</a>`).children);
    if (s.defaults) defEls.push(...parseXML(`<a>${s.defaults}</a>`).children);
  }

  const doc = el('mujoco', {model: name}, [
    el('compiler', {angle: 'radian', autolimits: 'true'}),
    el('option', {timestep: '0.002', integrator: 'implicitfast', cone: 'elliptic', impratio: '100'}),
    el('statistic', {meansize: '0.05', center: vec([0, 0, z0 * 0.6]), extent: vec([Math.max(1, z0 * 2.5)])}),
    el('visual', {}, [el('headlight', {diffuse: '0.6 0.6 0.6', ambient: '0.3 0.3 0.3', specular: '0 0 0'}), el('global', {azimuth: '-130', elevation: '-20'})]),
    el('default', {}, defEls),
    el('asset', {}, [
      el('texture', {type: 'skybox', builtin: 'gradient', rgb1: '0.3 0.5 0.7', rgb2: '0 0 0', width: '512', height: '3072'}),
      el('texture', {type: '2d', name: 'groundplane', builtin: 'checker', mark: 'edge', rgb1: '0.2 0.3 0.4', rgb2: '0.1 0.2 0.3', markrgb: '0.8 0.8 0.8', width: '300', height: '300'}),
      el('material', {name: 'groundplane', texture: 'groundplane', texuniform: 'true', texrepeat: '5 5', reflectance: '0.2'}),
      ...matEls, ...meshEls]),
    el('worldbody', {}, [
      el('light', {name: 'sun', pos: '0 0 3', dir: '0 0 -1', directional: 'true'}),
      el('light', {name: 'track', mode: 'trackcom', pos: '0 -2 2.5', dir: '0 0.6 -0.8'}),
      el('geom', {name: 'floor', size: '0 0 0.05', type: 'plane', material: 'groundplane'}),
      root]),
    ...(excludes.length ? [el('contact', {}, excludes.map(([a, b]) => el('exclude', {body1: a, body2: b})))] : []),
    el('actuator', {}, actNodes),
    el('keyframe', {}, [el('key', {name: 'home', qpos: qpos.map(f6).join(' '), ctrl: ctrl.map(f6).join(' ')})]),
  ]);

  const massParts = [torso, ...legs.map(l => byId[l.part]), ...arms.map(a => byId[a.part])];
  const spec = {
    name, layout, legCount: legs.length, armCount: arms.length,
    rootBody: root.attrs.name, rootJoint: 'root', baseHeight: z0,
    mass: Math.round(massParts.reduce((a, p) => a + p.mass, 0) * 1000) / 1000,
    dof: qJoints.length,
    torso: {part: torso.id, source: torso.source, joints: torso.joints.map(j => ({...j, name: P.torso + j.name}))},
    legs, arms, instances,
    joints: qJoints.map(n => ({name: n, ...jointInfo[n], home: homeOf[n] ?? 0})),
    actuators: actNodes.map((a, i) => ({name: a.attrs.name, joint: a.attrs.joint, type: a.tag, ctrlHome: ctrl[i]})),
    home: {qpos, ctrl},
    sources: srcList.map(k => ({key: k, label: lib.sources[k].label, vendor: lib.sources[k].vendor, file: `${lib.sources[k].dir}/${lib.sources[k].file}`})),
    gait: legs.length === 6 ? 'tripod' : legs.length === 4 ? 'trot' : legs.length === 2 ? 'step' : 'none',
  };
  return {xml: toXML(doc) + '\n', files, spec};
}

// Where each robot's files come from (relative to the public root), for loaders
export function fileURLs(files, lib, base = '../models/') {
  const out = [];
  for (const [key, list] of Object.entries(files)) for (const f of list) out.push({key, file: f, url: `${base}${lib.sources[key].dir}/${f}`, memfs: `${key}/${f}`});
  return out;
}
