// Hardware Lab robot: one procedural builder for every body a visitor can assemble in try/hw-builder.js,
// and for spawning the visitor's saved robot ('skild-hall:myRobot') in the 3D lab room.
//
//   const r = buildRobotMesh(THREE, config, B, {drive, policy, radius, path, onEvent});
//   scene.add(r.group); each frame: r.update(t, dt);   on removal: r.dispose();
//
// Stylized, primitives only, Skild palette: graphite body, orange joints. Units are meters, +x is forward, y is up.
// One gait engine for any body: foot placement + 2-link IK per leg, so 2, 4 or 6 legs of any length walk
// (biped walk, trot, tripod), wheels roll. A "specialist" policy only knows one quadruped and fails on other bodies.
// THREE is passed in (no import here) so the lab and the stand share one three.js instance.

export const DEFAULT_ROBOT = {torso: 'compact', loco: 'legs4', arms: 0, hands: 'gripper', head: 'stereo', battery: 'M', legLen: .38, armLen: .55, payload: 0, name: 'Robot dog'};

export const CATALOG = {
  torso: {
    compact: {label: 'Compact body', sub: 'Quadruped torso', mass: 7},
    long: {label: 'Long body', sub: 'Room for 6 legs', mass: 11},
    humanoid: {label: 'Humanoid torso', sub: 'Upright · waist', mass: 16},
  },
  loco: {
    legs4: {label: '4 legs', sub: 'Trot · 12 DOF', legs: 4},
    legs6: {label: '6 legs', sub: 'Tripod · 18 DOF', legs: 6},
    legs2: {label: '2 legs', sub: 'Biped · 12 DOF', legs: 2},
    wheels4: {label: '4 wheels', sub: 'Skid steer · 4 DOF', wheels: 4},
    wheelbase: {label: 'Wheeled base', sub: 'Omni base · 3 DOF', base: true},
  },
  arms: {0: {label: 'No arms', sub: 'Mobility only'}, 1: {label: '1 arm', sub: '6–7 DOF'}, 2: {label: '2 arms', sub: 'Bimanual'}},
  hands: {
    gripper: {label: 'Parallel gripper', sub: '1 DOF', mass: .4, dof: 1},
    dex: {label: 'Dexterous hand', sub: '12 DOF · stylized', mass: .9, dof: 12},
  },
  head: {
    stereo: {label: 'Stereo camera', sub: 'Passive depth', mass: .3, watt: 3},
    depth: {label: 'Depth camera', sub: 'Active IR', mass: .35, watt: 5},
    lidar: {label: 'LiDAR puck', sub: '360° scan', mass: .8, watt: 10},
  },
  battery: {
    S: {label: 'Battery S', sub: '150 Wh', wh: 150, mass: 1.2},
    M: {label: 'Battery M', sub: '300 Wh', wh: 300, mass: 2.2},
    L: {label: 'Battery L', sub: '500 Wh', wh: 500, mass: 3.6},
  },
};
export const RANGES = {legLen: [.25, .95], armLen: [.3, 1], payload: [0, 20]};
export const GAIT = {legs4: 'trot', legs6: 'tripod gait', legs2: 'biped walk', wheels4: 'rolling · skid steer', wheelbase: 'rolling · omni base'};

export const PRESETS = {
  dog: {torso: 'compact', loco: 'legs4', arms: 0, hands: 'gripper', head: 'stereo', battery: 'M', legLen: .38, armLen: .55, payload: 0, name: 'Robot dog'},
  humanoid: {torso: 'humanoid', loco: 'legs2', arms: 2, hands: 'dex', head: 'depth', battery: 'L', legLen: .8, armLen: .6, payload: 0, name: 'Humanoid'},
  mobile: {torso: 'compact', loco: 'wheelbase', arms: 1, hands: 'gripper', head: 'lidar', battery: 'L', legLen: .45, armLen: .75, payload: 4, name: 'Mobile manipulator'},
  hexapod: {torso: 'long', loco: 'legs6', arms: 0, hands: 'gripper', head: 'lidar', battery: 'M', legLen: .34, armLen: .55, payload: 0, name: 'Hexapod'},
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// Clean up any config and make the combination buildable. `changed` is the category the visitor just picked:
// the other part adapts to it, and every swap is explained in `notes`.
export function resolveConfig(input = {}, changed = null) {
  const c = {...DEFAULT_ROBOT, ...(input && typeof input === 'object' ? input : {})};
  const notes = [];
  for (const cat of ['torso', 'loco', 'hands', 'head', 'battery']) if (!CATALOG[cat][c[cat]]) c[cat] = DEFAULT_ROBOT[cat];
  c.arms = [0, 1, 2].includes(Math.round(num(c.arms, 0))) ? Math.round(num(c.arms, 0)) : 0;
  for (const key of ['legLen', 'armLen', 'payload']) c[key] = +clamp(num(c[key], DEFAULT_ROBOT[key]), ...RANGES[key]).toFixed(2);
  c.name = String(c.name ?? '').slice(0, 24);
  const upright = () => c.torso === 'humanoid';
  if (changed === 'torso') {
    if (upright() && c.loco !== 'legs2' && c.loco !== 'wheelbase') { c.loco = 'legs2'; notes.push('A humanoid torso stands upright: it needs 2 legs or a wheeled base. Switched to 2 legs.'); }
    else if (!upright() && c.loco === 'legs2') { c.loco = 'legs4'; notes.push('2 legs only balance an upright humanoid torso. Switched to 4 legs.'); }
    if (c.torso === 'compact' && c.loco === 'legs6') { c.loco = 'legs4'; notes.push('The compact body has room for 2 hip pairs, not 3. Switched to 4 legs.'); }
  } else {
    if (c.loco === 'legs2' && !upright()) { c.torso = 'humanoid'; notes.push('2 legs need the humanoid torso to balance. Swapped the torso.'); }
    else if (upright() && ['legs4', 'legs6', 'wheels4'].includes(c.loco)) { c.torso = c.loco === 'legs6' ? 'long' : 'compact'; notes.push(`A humanoid torso can’t ride on ${CATALOG.loco[c.loco].label}. Swapped to the ${CATALOG.torso[c.torso].label.toLowerCase()}.`); }
    if (c.loco === 'legs6' && c.torso === 'compact') { c.torso = 'long'; notes.push('6 legs need the long body: room for 3 hip pairs. Swapped the torso.'); }
  }
  if (changed === 'hands' && c.arms === 0) { c.arms = 1; notes.push('A hand needs an arm to sit on. Added 1 arm.'); }
  return {config: c, notes};
}

// Short hint for a palette chip: what picking it would also change ('' when it fits as is).
export function conflictHint(cat, id, cfg) {
  const val = cat === 'arms' ? +id : id;
  if (cfg[cat] === val) return '';
  const r = resolveConfig({...cfg, [cat]: val}, cat).config;
  if (cat === 'torso' && id === 'humanoid' && r.loco !== cfg.loco) return 'needs 2 legs or a base';
  if (cat === 'hands' && r.arms !== cfg.arms) return 'adds an arm';
  if (r.torso !== cfg.torso && cat !== 'torso') return 'needs ' + CATALOG.torso[r.torso].label.toLowerCase();
  if (r.loco !== cfg.loco && cat !== 'loco') return 'needs ' + CATALOG.loco[r.loco].label.toLowerCase();
  return '';
}

function className(c) {
  const arms = c.arms > 0;
  switch (c.loco) {
    case 'legs4': return c.legLen > .6 ? 'Quadruped on stilts · experimental class' : arms ? 'Legged manipulator · quadruped-with-arm class' : c.torso === 'long' ? 'Quadruped · long-body class' : 'Quadruped · Skild quadruped class';
    case 'legs2': return !arms ? 'Bipedal walker class' : c.legLen >= .7 ? 'Humanoid · tall class' : 'Humanoid · compact class';
    case 'legs6': return arms ? 'Hexapod manipulator · research walker class' : 'Hexapod · research walker class';
    case 'wheels4': return arms ? 'Mobile manipulator · rover-with-arm class' : 'Wheeled rover · AMR class';
    default: return c.torso === 'humanoid' ? (arms ? 'Wheeled humanoid · mobile manipulator class' : 'Wheeled torso · telepresence class') : arms ? 'Mobile manipulator · AMR-with-arm class' : 'Mobile base · AMR class';
  }
}

// Stylized spec sheet (not real product numbers).
export function robotSpecs(input) {
  const c = resolveConfig(input).config, L = c.legLen, A = c.armLen, upright = c.torso === 'humanoid';
  const loco = {legs4: [4 * (.5 + 3.2 * L), 12, 5.5], legs6: [6 * (.4 + 2.6 * L), 18, 6.5], legs2: [2 * (2 + 7 * L), 12, 8], wheels4: [5.6 + 4 * L, 4, 1.6], wheelbase: [18 + 6 * L, 3, 1.8]}[c.loco];
  const hand = CATALOG.hands[c.hands], head = CATALOG.head[c.head], bat = CATALOG.battery[c.battery];
  const armDof = upright ? 7 : 6;
  const mass = CATALOG.torso[c.torso].mass + loco[0] + c.arms * (1.2 + 3.5 * A + hand.mass) + head.mass + bat.mass;
  const joints = {loco: loco[1], arms: c.arms * armDof, hands: c.arms * hand.dof, body: upright ? 3 : 0};
  const dof = joints.loco + joints.arms + joints.hands + joints.body;
  const watts = 40 + head.watt + loco[2] * (mass + c.payload) + c.arms * 12 + (c.hands === 'dex' ? 5 * c.arms : 0);
  const hours = bat.wh / watts;
  const reach = c.arms ? A + (c.hands === 'dex' ? .1 : .08) + (upright ? .22 : .1) : 0;
  const base = {legs4: .62, legs6: .85, legs2: .24, wheels4: .8, wheelbase: .7}[c.loco];
  const stab = clamp(base - (c.loco === 'legs2' ? .1 * (L - .8) : .45 * (L - .38)) - .5 * c.payload / (mass + c.payload) - .05 * c.arms * A - (upright && c.loco === 'wheelbase' ? .18 : 0), .05, .95);
  const capacity = {legs4: .45, legs6: .55, legs2: .3, wheels4: 1, wheelbase: 1.2}[c.loco] * mass;
  const balance = c.loco === 'legs2' ? 'dynamic balance' : stab >= .6 ? 'wide support' : stab >= .35 ? 'moderate' : 'needs active balance';
  return {mass, dof, joints, watts, hours, reach, stability: stab, balance, capacity, over: c.payload > capacity, cls: className(c), gait: GAIT[c.loco]};
}

const easeOutBack = x => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2; };

export function buildRobotMesh(THREE, config, B = {}, opts = {}) {
  const c = resolveConfig(config).config;
  const L = c.legLen, A = c.armLen, upright = c.torso === 'humanoid';
  const isLegs = c.loco.startsWith('legs'), nLegs = CATALOG.loco[c.loco].legs || 0;
  const geos = [], cats = {torso: [], loco: [], arms: [], hands: [], head: [], battery: [], payload: []};

  const M = {
    body: new THREE.MeshStandardMaterial({color: '#17191c', roughness: .42, metalness: .35}),
    shell: new THREE.MeshStandardMaterial({color: '#2b2f33', roughness: .5, metalness: .3}),
    panel: new THREE.MeshStandardMaterial({color: '#d9d6cf', roughness: .6, metalness: .1}),
    joint: new THREE.MeshStandardMaterial({color: '#ff7e00', emissive: '#ff7e00', emissiveIntensity: .45, roughness: .45}),
    eye: new THREE.MeshBasicMaterial({color: '#ffb366', toneMapped: false}),
    lens: new THREE.MeshStandardMaterial({color: '#0a0c0e', roughness: .15, metalness: .6}),
    tire: new THREE.MeshStandardMaterial({color: '#0e0f11', roughness: .95}),
    crate: new THREE.MeshStandardMaterial({color: '#c1bcb3', roughness: .8}),
  };
  let themeKey = '';
  function theme() {                                   // B is mutated live by dark mode: follow it
    const bg = String(B?.warm1 || '#F7F5F1'), key = bg + (B?.orange || '');
    if (key === themeKey) return; themeKey = key;
    const dark = /^#[0-9a-f]{6}$/i.test(bg) && parseInt(bg.slice(1, 3), 16) < 128;
    M.body.color.set(dark ? '#3a3f45' : '#17191c'); M.shell.color.set(dark ? '#59616a' : '#2b2f33');
    M.panel.color.set(dark ? '#aeb4ba' : '#d9d6cf'); M.crate.color.set(dark ? '#8e8177' : '#c1bcb3');
    const o = B?.orange || '#FF7E00'; M.joint.color.set(o); M.joint.emissive.set(o);
  }
  theme();

  const mk = (geo, m) => { geos.push(geo); const o = new THREE.Mesh(geo, m); o.castShadow = true; return o; };
  const box = (w, h, d, m = M.body) => mk(new THREE.BoxGeometry(w, h, d), m);
  const cyl = (r, h, m = M.body, seg = 20) => mk(new THREE.CylinderGeometry(r, r, h, seg), m);
  const sph = (r, m = M.joint) => mk(new THREE.SphereGeometry(r, 16, 12), m);
  const G = () => new THREE.Group();
  const tag = (cat, o) => { o.userData.base = o.scale.clone(); cats[cat].push(o); return o; };   // top-level part groups only

  // hierarchy: group (placed by the caller) > mover (path) > tip (fall pivot) > rig > body (bob / sway)
  const group = G(); group.name = 'hw-robot';
  const mover = G(), tip = G(), rig = G(), body = G();
  group.add(mover); mover.add(tip); tip.add(rig); rig.add(body);

  const T = upright ? {len: .24, wid: .4, hgt: .6} : c.torso === 'long' ? {len: 1.0, wid: .34, hgt: .2} : {len: .62, wid: .32, hgt: .2};
  const footR = .035, hipY = upright ? -.06 : -.07;
  const wheelR = .07 + .13 * L, baseR = upright ? .32 : Math.max(.32, T.len * .45), baseH = .24, column = .1 + .7 * L;
  let bodyY;
  if (isLegs) bodyY = footR + L * (upright ? .93 : .84) - hipY;
  else if (c.loco === 'wheels4') bodyY = wheelR + .05 + .3 * L;
  else bodyY = .05 + baseH + column + (upright ? .06 : T.hgt / 2);
  body.position.y = bodyY;

  // ---- torso ----
  const torsoG = tag('torso', G()); body.add(torsoG);
  let chest = null, headParent, headPos, batParent;
  if (upright) {
    torsoG.add(box(.2, .12, .3));
    const waist = sph(.07); waist.position.y = .09; torsoG.add(waist);
    chest = G(); chest.position.y = .12; torsoG.add(chest);
    const cb = box(.24, .42, .4); cb.position.y = .23; chest.add(cb);
    const plate = box(.02, .22, .26, M.panel); plate.position.set(.125, .26, 0); chest.add(plate);
    const strip = box(.022, .02, .3, M.joint); strip.position.set(.126, .1, 0); chest.add(strip);
    headParent = chest; headPos = [0, .44, 0]; batParent = chest;
  } else {
    torsoG.add(box(T.len, T.hgt, T.wid));
    const top = box(T.len * .7, .012, T.wid * .8, M.panel); top.position.y = T.hgt / 2 + .006; torsoG.add(top);
    for (const s of [1, -1]) { const st = box(T.len * .5, .018, .006, M.joint); st.position.set(0, -.02, s * (T.wid / 2 + .003)); torsoG.add(st); }
    const nose = box(.02, T.hgt * .6, T.wid * .7, M.shell); nose.position.x = T.len / 2 + .01; torsoG.add(nose);
    headParent = body; headPos = [T.len / 2 + .07, .05, 0]; batParent = body;
  }

  // ---- head / sensors ----
  const headG = tag('head', G()); headG.position.set(...headPos); headParent.add(headG);
  let lidar = null;
  {
    const hw = upright ? .2 : .14, hh = upright ? .22 : .12, hd = upright ? .2 : .22;
    if (upright) { const neck = sph(.05); neck.position.y = .02; headG.add(neck); }
    const hb = box(hw, hh, hd, M.shell); hb.position.y = upright ? .14 : 0; headG.add(hb);
    const fx = hw / 2 + .01, fy = hb.position.y + (upright ? .01 : 0);
    const lensAt = (z, r, m = M.lens) => { const l = cyl(r, .02, m, 16); l.rotation.z = Math.PI / 2; l.position.set(fx + .01, fy, z); headG.add(l); return l; };
    if (c.head === 'stereo') {
      const bar = box(.02, .05, hd * .8, M.body); bar.position.set(fx, fy, 0); headG.add(bar);
      for (const z of [-hd * .26, hd * .26]) { lensAt(z, .024); const ring = cyl(.012, .022, M.eye, 12); ring.rotation.z = Math.PI / 2; ring.position.set(fx + .012, fy, z); headG.add(ring); }
    } else if (c.head === 'depth') {
      const bar = box(.03, .06, hd * .85, M.body); bar.position.set(fx + .005, fy, 0); headG.add(bar);
      lensAt(-hd * .28, .018); lensAt(hd * .28, .018); lensAt(0, .014, M.eye);
    } else {
      const visor = box(.02, .03, hd * .7, M.eye); visor.position.set(fx, fy, 0); headG.add(visor);
      lidar = G(); lidar.position.y = hb.position.y + hh / 2 + .045; headG.add(lidar);
      lidar.add(cyl(.07, .07, M.shell, 28));
      const band = cyl(.072, .018, M.joint, 28); lidar.add(band);
      const win = box(.03, .02, .02, M.eye); win.position.set(.066, 0, 0); lidar.add(win);
    }
  }

  // ---- battery ----
  const batDims = {S: [.14, .05, .18], M: [.2, .06, .2], L: [.28, .075, .22]}[c.battery];
  const batG = tag('battery', G()); batParent.add(batG);
  const leds = [];
  let batTop = 0;
  {
    const [bl, bh, bw] = batDims, n = {S: 1, M: 2, L: 3}[c.battery];
    if (upright) {
      batG.position.set(-.12 - bh * .6, .24, 0);
      const pack = box(bh * 1.2, bl, bw, M.shell); batG.add(pack);
      for (let i = 0; i < n; i++) { const d = box(.01, .02, .05, M.joint); d.position.set(-bh * .6 - .005, -bl / 2 + .04 + i * .035, 0); batG.add(d); leds.push(d); }
      batTop = .24 + bl / 2;
    } else {
      batG.position.set(-T.len / 2 + bl / 2 + .03, T.hgt / 2 + bh / 2 + .012, 0);
      const pack = box(bl, bh, bw, M.shell); batG.add(pack);
      for (let i = 0; i < n; i++) { const d = box(.03, .01, .012, M.joint); d.position.set(-bl / 2 + .03 + i * .04, bh / 2 + .005, bw / 2 - .03); batG.add(d); leds.push(d); }
      batTop = T.hgt / 2 + bh + .012;
    }
  }

  // ---- arms + hands ----
  const arms = [];
  function chain(len1, len2, th, dir) {
    const root = G(); root.add(sph(th * .8));
    const u = box(th, len1, th, M.shell); u.position.y = dir * len1 / 2; root.add(u);
    const el = G(); el.position.y = dir * len1; root.add(el); el.add(sph(th * .72));
    const f = box(th * .85, len2, th * .85, M.shell); f.position.y = dir * len2 / 2; el.add(f);
    const wr = G(); wr.position.y = dir * len2; el.add(wr); wr.add(sph(th * .6));
    return {root, el, wr};
  }
  function hand(wr, dir) {
    const h = tag('hands', G()); wr.add(h);
    const out = {fingers: [], kind: c.hands};
    if (c.hands === 'gripper') {
      const palm = box(.05, .04, .09, M.body); palm.position.y = dir * .03; h.add(palm);
      for (const s of [1, -1]) { const f = box(.02, .07, .016, M.joint); f.position.set(0, dir * .085, s * .03); h.add(f); out.fingers.push({f, s}); }
    } else {
      const palm = box(.035, .08, .09, M.shell); palm.position.y = dir * .045; h.add(palm);
      for (const z of [-.033, -.011, .011, .033]) {
        const f = G(); f.position.set(0, dir * .085, z); h.add(f);
        const s1 = box(.018, .04, .016, M.body); s1.position.y = dir * .02; f.add(s1);
        const f2 = G(); f2.position.y = dir * .04; f.add(f2); f2.add(sph(.009));
        const s2 = box(.016, .032, .015, M.body); s2.position.y = dir * .016; f2.add(s2);
        out.fingers.push({f, f2});
      }
      const th = G(); th.position.set(.02, dir * .03, .045); th.rotation.x = -dir * .7; h.add(th);
      const ts = box(.018, .045, .016, M.body); ts.position.y = dir * .022; th.add(ts); out.thumb = th;
    }
    return out;
  }
  for (let i = 0; i < c.arms; i++) {
    const side = c.arms === 1 ? (upright ? 1 : 0) : i === 0 ? 1 : -1;
    if (upright) {
      const ch = chain(A * .5, A * .5, .075, -1);
      const mount = tag('arms', G()); mount.position.set(0, .38, side * .245); chest.add(mount);
      mount.add(ch.root); ch.root.rotation.x = side * .08;
      arms.push({...ch, yaw: null, side, dir: -1, hand: hand(ch.wr, -1)});
    } else {
      const mount = tag('arms', G()); mount.position.set(T.len / 2 - .14, T.hgt / 2, side * .1); body.add(mount);
      const base = cyl(.07, .05, M.body, 24); base.position.y = .025; mount.add(base);
      const yaw = G(); yaw.position.y = .06; mount.add(yaw);
      const ch = chain(A * .5, A * .5, .065, 1); yaw.add(ch.root);
      arms.push({...ch, yaw, side, dir: 1, hand: hand(ch.wr, 1)});
    }
  }

  // ---- payload ----
  let crate = null;
  if (c.payload > 0) {
    const s = .09 + .012 * c.payload;
    crate = tag('payload', G());
    const cb = box(s, s * .7, s, M.crate); crate.add(cb);
    const strap = box(s + .004, .014, .03, M.joint); strap.position.y = s * .35 - .005; crate.add(strap);
    if (upright && c.arms) { crate.position.set(.2 + s / 2, .02, 0); chest.add(crate); }
    else if (upright) { crate.position.set(-.12 - batDims[1] * .6, batTop + s * .35, 0); chest.add(crate); }
    else { crate.position.set(batG.position.x, batTop + s * .35, 0); body.add(crate); }
  }

  // ---- locomotion ----
  const legs = [], wheels = [];
  if (isLegs) {
    let mounts;
    const wz = T.wid / 2 - .02;
    if (nLegs === 2) mounts = [[0, .1], [0, -.1]];
    else if (nLegs === 4) { const hx = T.len / 2 - .08; mounts = [[hx, wz], [hx, -wz], [-hx, wz], [-hx, -wz]]; }
    else { const hx = T.len / 2 - .1; mounts = [[hx, wz], [hx, -wz], [0, wz], [0, -wz], [-hx, wz], [-hx, -wz]]; }
    const offs = {2: [0, .5], 4: [0, .5, .5, 0], 6: [0, .5, .5, 0, 0, .5]}[nLegs];
    const th = upright ? .1 : clamp(.055 + .06 * L, .06, .1);
    mounts.forEach(([x, z], i) => {
      const splay = tag('loco', G()); splay.position.set(x, hipY, z); body.add(splay);
      const sp = nLegs === 6 ? .38 : nLegs === 4 ? .06 : 0; splay.rotation.x = -Math.sign(z) * sp;
      if (nLegs >= 4) { const mot = cyl(th * .7, th * 1.3, M.body, 16); mot.rotation.x = Math.PI / 2; splay.add(mot); }
      const hip = G(); splay.add(hip); hip.add(sph(th * .8));
      const a = L / 2, b = L / 2;
      const t1 = box(th, a, th, M.shell); t1.position.y = -a / 2; hip.add(t1);
      const knee = G(); knee.position.y = -a; hip.add(knee); knee.add(sph(th * .72));
      const t2 = box(th * .8, b, th * .8, upright ? M.shell : M.body); t2.position.y = -b / 2; knee.add(t2);
      const ankle = G(); ankle.position.y = -b; knee.add(ankle);
      if (upright) { const foot = box(.2, .045, .1, M.body); foot.position.set(.035, -.012, 0); ankle.add(foot); ankle.add(sph(.04)); }
      else ankle.add(sph(footR * 1.15, M.body));
      legs.push({hip, knee, ankle, x, z, sp, off: offs[i], i, a, b});
    });
  } else if (c.loco === 'wheels4') {
    const r = wheelR, wx = T.len / 2 - r * .5, wz = T.wid / 2 + .045;
    for (const [x, z] of [[wx, wz], [wx, -wz], [-wx, wz], [-wx, -wz]]) {
      const wg = tag('loco', G()); wg.position.set(x, r, z); rig.add(wg);
      const spin = G(); wg.add(spin);
      const tire = cyl(r, .07, M.tire, 28); tire.rotation.x = Math.PI / 2; spin.add(tire);
      const hub = cyl(r * .45, .076, M.joint, 20); hub.rotation.x = Math.PI / 2; spin.add(hub);
      const spoke = box(r * 1.5, r * .16, .078, M.shell); spin.add(spoke);
      const sh = bodyY - r; const strut = box(.04, sh, .04, M.body); strut.position.set(0, sh / 2, -Math.sign(z) * .03); wg.add(strut);
      wheels.push({spin, r});
    }
  } else {
    const bg = tag('loco', G()); rig.add(bg);
    const base = cyl(baseR, baseH, M.body, 40); base.position.y = .05 + baseH / 2; bg.add(base);
    const ring = cyl(baseR + .006, .025, M.joint, 40); ring.position.y = .05 + baseH * .35; bg.add(ring);
    const deck = cyl(baseR * .92, .012, M.panel, 40); deck.position.y = .05 + baseH + .006; bg.add(deck);
    const col = cyl(.06, column, M.shell, 20); col.position.y = .05 + baseH + column / 2; bg.add(col);
    for (let i = 0; i < 3; i++) {
      const a = i * Math.PI * 2 / 3 + Math.PI / 6, spin = G(); spin.position.set(Math.cos(a) * baseR * .7, .05, Math.sin(a) * baseR * .7); bg.add(spin);
      const w = cyl(.05, .04, M.tire, 16); w.rotation.x = Math.PI / 2; spin.add(w);
      const sk = box(.07, .012, .042, M.shell); spin.add(sk);
      wheels.push({spin, r: .05});
    }
  }

  // ---- state + animation ----
  const radius = opts.radius ?? 1.3, path = opts.path || 'circle';
  const st = {drive: !!opts.drive, policy: opts.policy === 'specialist' ? 'specialist' : 'omni', walk: 0, phase: 0, ang: 0, dist: 0, driveT: 0, fail: 0, fallen: false, tipT: 0, side: 1, reach: 0};
  const specialistOk = c.loco === 'legs4' && Math.abs(L - .38) < .16;
  const duty = c.loco === 'legs2' ? .6 : .55;
  const payloadF = 1 - .45 * Math.min(1, c.payload / 25);
  const v0 = isLegs ? .9 * Math.sqrt(L) * (upright ? .8 : 1) : .75;
  const stride = isLegs ? (upright ? .42 : .5) * L : 0;
  const cycle = isLegs ? stride / (v0 * payloadF * duty) : 1;
  const halfW = upright ? .2 : T.wid / 2 + (c.loco === 'wheels4' ? .08 : c.loco === 'wheelbase' ? Math.max(0, baseR - T.wid / 2) : .05);
  const maxTip = upright ? 1.42 : c.loco === 'wheelbase' ? 1.35 : 1.15;
  const pops = {};
  const api = {group, mover, config: c, info: null, state: st, onEvent: opts.onEvent || null};

  function solveLeg(g, fx, fy) {
    const hipWorldY = body.position.y + hipY;
    const dy = ((footR + fy) - hipWorldY) / Math.cos(g.sp);
    const D = clamp(Math.hypot(fx, dy), .02, g.a + g.b - .002);
    const bend = Math.PI - Math.acos(clamp((g.a * g.a + g.b * g.b - D * D) / (2 * g.a * g.b), -1, 1));
    const baseA = Math.atan2(fx, -dy), alpha = Math.acos(clamp((g.a * g.a + D * D - g.b * g.b) / (2 * g.a * D), -1, 1));
    if (upright) { g.hip.rotation.z = baseA + alpha; g.knee.rotation.z = -bend; g.ankle.rotation.z = -(g.hip.rotation.z + g.knee.rotation.z); }
    else { g.hip.rotation.z = baseA - alpha; g.knee.rotation.z = bend; }
  }

  function update(t = 0, dt = 0) {
    theme();
    dt = clamp(dt || 0, 0, .05);
    const failing = st.drive && st.policy === 'specialist' && !specialistOk;
    st.walk += ((st.drive && !st.fallen ? 1 : 0) - st.walk) * Math.min(1, dt * 3);
    const speed = v0 * payloadF * st.walk * (failing ? .15 : 1) * (st.fallen ? 0 : 1);
    if (st.drive && !st.fallen) st.driveT += dt;
    const ds = speed * dt; st.dist += ds;
    if (path === 'circle') { st.ang += ds / radius; mover.position.set(radius * Math.sin(st.ang), 0, radius * Math.cos(st.ang) - radius); mover.rotation.y = st.ang; }

    // legs: stance feet slide back at body speed, swing feet arc forward; any count, any length
    if (isLegs) {
      st.phase = (st.phase + dt / cycle) % 1;
      for (const g of legs) {
        let p = failing ? (st.phase * (1 + .37 * g.i) + g.off + Math.sin(t * 3 + g.i) * .15) % 1 : (st.phase + g.off) % 1;
        if (p < 0) p += 1;
        let fx, fy;
        if (p < duty) { fx = stride * (.5 - p / duty); fy = 0; }
        else { const q = (p - duty) / (1 - duty); fx = stride * (-.5 + (1 - Math.cos(Math.PI * q)) / 2); fy = (.1 * L + .015) * Math.sin(Math.PI * q); }
        fx *= st.walk; fy *= st.walk;
        if (st.fallen) { const e = Math.min(1, st.tipT * 2); fx = lerp(fx, (g.i % 2 ? .12 : -.08) * L, e); fy = lerp(fy, .3 * L, e); }
        solveLeg(g, fx, fy);
      }
      const bob = (1 - Math.cos(st.phase * Math.PI * 4)) / 2;
      body.position.y = bodyY - (upright ? .018 : .01) * st.walk * bob;
      body.position.z = upright ? .025 * Math.sin(st.phase * Math.PI * 2) * st.walk : 0;
      body.rotation.z = upright ? 0 : .025 * Math.sin(st.phase * Math.PI * 4) * st.walk;
      if (chest) chest.rotation.y = .12 * Math.sin(st.phase * Math.PI * 2) * st.walk;
    } else {
      for (const w of wheels) w.spin.rotation.z -= ds / w.r + (failing && !st.fallen ? Math.sin(t * 23) * .12 : 0);
      if (chest) chest.rotation.y = Math.sin(t * .6) * .08;
    }

    // arms: swing with a biped walk, otherwise reach while driving, breathe when idle
    const reachGoal = st.drive && !st.fallen && !(upright && isLegs) ? 1 : 0;
    st.reach += (reachGoal - st.reach) * Math.min(1, dt * 2);
    const cyc = (Math.sin(t * 1.4) + 1) / 2, breathe = Math.sin(t * 1.3) * .04;
    const flail = failing && !st.fallen ? Math.sin(t * 9) * .5 : 0;
    for (const a of arms) {
      let grip = .7;
      if (a.dir < 0) {                                  // upright arms hang from the shoulder
        let sh = .05 + breathe, el = .3;
        if (crate) { sh = .55; el = .95; grip = .1; }
        else if (isLegs) { sh = lerp(sh, .45 * Math.sin(st.phase * Math.PI * 2) * a.side, st.walk); el = lerp(el, .45, st.walk); }
        else { sh = lerp(sh, lerp(.3, 1.3, cyc), st.reach); el = lerp(el, lerp(.9, .15, cyc), st.reach); grip = lerp(grip, cyc, st.reach); }
        a.root.rotation.z = sh + flail * a.side; a.el.rotation.z = el;
      } else {                                           // top-mounted arms stand up from the body
        const sh = lerp(-.5 + breathe, lerp(-.55, -1.1, cyc), st.reach), el = lerp(-1.6, lerp(-1.5, -.7, cyc), st.reach);
        a.root.rotation.z = sh + flail; a.el.rotation.z = el;
        a.yaw.rotation.y = lerp(Math.sin(t * .5) * .15, Math.sin(t * .7) * .6, st.reach) * (a.side || 1);
        grip = lerp(.7, cyc, st.reach);
      }
      a.wr.rotation.z = a.dir < 0 ? -.2 : .4;
      if (a.hand.kind === 'gripper') for (const f of a.hand.fingers) f.f.position.z = f.s * (.012 + .022 * grip);
      else { const curl = (1 - grip) * .9 + .1; for (const f of a.hand.fingers) { f.f.rotation.z = -a.dir * curl * .8; f.f2.rotation.z = -a.dir * curl; } if (a.hand.thumb) a.hand.thumb.rotation.z = -a.dir * curl * .6; }
    }

    if (lidar) lidar.rotation.y += dt * 6;
    headG.rotation.y = Math.sin(t * .5) * (upright ? .25 : .15) * (1 - st.walk * .6);
    leds.forEach((d, i) => { d.visible = i < leds.length - 1 || (t * 1.5) % 1 < .7; });

    // specialist on the wrong body: wobble, then tip over
    if (failing && !st.fallen) {
      st.fail += dt;
      tip.position.z = st.side * halfW; rig.position.z = -st.side * halfW;
      tip.rotation.x = st.side * Math.abs(Math.sin(t * 11)) * .05 * (1 + st.fail * 2.2);
      if (path === 'circle') mover.position.x += Math.sin(t * 17) * .006 * st.fail;
      if (st.fail > 1.8) { st.fallen = true; st.tipT = 0; api.onEvent?.('fall', {after: +st.driveT.toFixed(1)}); }
    } else if (st.fallen) {
      st.tipT += dt;
      const e = Math.min(1, st.tipT / .7), k = st.tipT - .7;
      const ang = maxTip * e * e - (e >= 1 ? .07 * Math.exp(-6 * k) * Math.abs(Math.sin(k * 18)) : 0);
      tip.rotation.x = st.side * Math.max(tip.rotation.x * st.side, ang);
    } else {
      tip.rotation.x *= Math.max(0, 1 - dt * 6);
      if (Math.abs(tip.rotation.x) < 1e-3) { tip.rotation.x = 0; tip.position.z = 0; rig.position.z = 0; }
    }

    // snap-in pops
    for (const cat in pops) {
      pops[cat] += dt / .45;
      const s = pops[cat] >= 1 ? 1 : Math.max(.001, easeOutBack(pops[cat]));
      for (const o of cats[cat]) o.scale.copy(o.userData.base).multiplyScalar(s);
      if (pops[cat] >= 1) delete pops[cat];
    }
  }

  Object.assign(api, {
    update,
    pop(cat) { if (cats[cat]?.length) { pops[cat] = 0; for (const o of cats[cat]) o.scale.setScalar(.001); } },
    setDrive(on) { st.drive = !!on; if (on) { st.driveT = 0; st.fail = 0; } },
    setPolicy(p) { st.policy = p === 'specialist' ? 'specialist' : 'omni'; st.fail = 0; },
    reset() { st.fallen = false; st.fail = 0; st.tipT = 0; st.side = Math.random() < .5 ? 1 : -1; },
    getState() { return {drive: st.drive, policy: st.policy, walk: st.walk, phase: st.phase, ang: st.ang, dist: st.dist, driveT: st.driveT}; },
    setState(s = {}) { for (const key of ['drive', 'policy', 'walk', 'phase', 'ang', 'dist', 'driveT']) if (s[key] !== undefined) st[key] = s[key]; update(0, 0); },
    specialistOk,
    dispose() { group.removeFromParent(); geos.forEach(g => g.dispose()); Object.values(M).forEach(m => m.dispose()); geos.length = 0; },
  });

  update(0, 0);
  group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(group), size = bb.getSize(new THREE.Vector3());
  api.info = {height: size.y, length: size.x, width: size.z, bodyY, gait: GAIT[c.loco], specs: robotSpecs(c)};
  return api;
}
