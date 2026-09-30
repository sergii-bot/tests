// Procedural lab robots for the hall. Stylized, Skild palette: black/graphite bodies, orange joints.
// Each builder returns {group, update(t, dt)}. Kept light: primitives only, a few dozen meshes each.
import * as THREE from '../vendor/three.module.js';

export const MAT = {
  body: new THREE.MeshStandardMaterial({color: '#161616', roughness: .42, metalness: .35}),
  shell: new THREE.MeshStandardMaterial({color: '#2b2f33', roughness: .5, metalness: .3}),
  light: new THREE.MeshStandardMaterial({color: '#d9d6cf', roughness: .6, metalness: .1}),
  joint: new THREE.MeshBasicMaterial({color: '#ff7e00', toneMapped: false}),
  eye: new THREE.MeshBasicMaterial({color: '#ffb366', toneMapped: false}),
  ball: new THREE.MeshStandardMaterial({color: '#f5f5f5', roughness: .5}),
  plinth: new THREE.MeshStandardMaterial({color: '#ece9e2', roughness: .8}),
};
const box = (w, h, d, m = MAT.body) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.castShadow = true; return o; };
const cyl = (r, h, m = MAT.body, seg = 20) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); o.castShadow = true; return o; };
const ball = (r, m = MAT.joint) => { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), m); o.castShadow = true; return o; };
// a limb: pivot group at the joint, segment hanging down along -y
function limb(len, thick, m = MAT.shell) { const g = new THREE.Group(); const s = box(thick, len, thick, m); s.position.y = -len / 2; g.add(s, ball(thick * .75)); g.userData.len = len; return g; }

export function quadruped({missingLeg = false} = {}) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const torso = box(.95, .26, .42); torso.position.y = .62; body.add(torso);
  const head = box(.24, .18, .3, MAT.shell); head.position.set(.56, .7, 0); body.add(head);
  const eye = box(.02, .05, .2, MAT.eye); eye.position.set(.685, .72, 0); body.add(eye);
  const legs = [];
  for (const [x, z, i] of [[.36, .19, 0], [.36, -.19, 1], [-.36, .19, 2], [-.36, -.19, 3]]) {
    const hip = limb(.3, .09); hip.position.set(x, .56, z); body.add(hip);
    const knee = limb(.3, .075); knee.position.y = -.3; hip.add(knee);
    if (missingLeg && i === 1) { knee.visible = false; hip.scale.y = .45; }
    legs.push({hip, knee, i});
  }
  return {group: g, update(t) {
    const w = missingLeg ? 5.2 : 7;
    for (const L of legs) {
      const ph = (L.i === 0 || L.i === 3 ? 0 : Math.PI) + (missingLeg && L.i === 2 ? .8 : 0);
      L.hip.rotation.z = Math.sin(t * w + ph) * .38 + .15; L.knee.rotation.z = -Math.max(0, Math.sin(t * w + ph + 1.2)) * .7 - .25;
    }
    body.position.y = Math.abs(Math.sin(t * w)) * .03 - (missingLeg ? .03 : 0);
    body.rotation.x = missingLeg ? .12 + Math.sin(t * w) * .05 : 0;
    g.rotation.y = Math.sin(t * .4) * .5;
  }};
}

export function humanoid({mode = 'idle'} = {}) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const pelvis = box(.34, .14, .2); pelvis.position.y = .98; body.add(pelvis);
  const chest = box(.44, .46, .24); chest.position.y = 1.32; body.add(chest);
  const plate = box(.3, .2, .02, MAT.light); plate.position.set(0, 1.36, .13); body.add(plate);
  const head = box(.22, .24, .22, MAT.shell); head.position.y = 1.72; body.add(head);
  const visor = box(.18, .05, .02, MAT.eye); visor.position.set(0, 1.74, .115); body.add(visor);
  const mk = (x, y, a, b, t1, t2) => { const up = limb(a, t1); up.position.set(x, y, 0); const lo = limb(b, t2); lo.position.y = -a; up.add(lo); body.add(up); return {up, lo}; };
  const legL = mk(.1, .93, .46, .46, .11, .09), legR = mk(-.1, .93, .46, .46, .11, .09);
  const armL = mk(.29, 1.5, .32, .3, .08, .07), armR = mk(-.29, 1.5, .32, .3, .08, .07);
  return {group: g, body, legs: [legL, legR], update(t) {
    const w = mode === 'walk' || mode === 'stairs' ? 5.5 : mode === 'soccer' ? 7 : 1.4;
    const amp = mode === 'idle' ? .06 : .5;
    legL.up.rotation.x = Math.sin(t * w) * amp; legR.up.rotation.x = -Math.sin(t * w) * amp;
    legL.lo.rotation.x = Math.max(0, -Math.sin(t * w + .6)) * amp * 1.4; legR.lo.rotation.x = Math.max(0, Math.sin(t * w + .6)) * amp * 1.4;
    armL.up.rotation.x = -Math.sin(t * w) * amp * .7; armR.up.rotation.x = Math.sin(t * w) * amp * .7;
    armL.lo.rotation.x = armR.lo.rotation.x = -.35;
    body.position.y = mode === 'idle' ? Math.sin(t * 1.4) * .01 : Math.abs(Math.sin(t * w)) * .04;
    if (mode === 'stairs') { const c = (t * .45) % 1; body.position.y += c * .45; body.position.z = c * .9 - .45; }
  }};
}

export function arm({dual = false, industrial = false} = {}) {
  const g = new THREE.Group();
  const bench = box(2.2, .9, 1.1, MAT.light); bench.position.y = .45; bench.receiveShadow = true; g.add(bench);
  const item = box(.18, .18, .18, MAT.joint); item.position.set(.5, .99, .15); g.add(item);
  const arms = [];
  for (const side of dual ? [-1, 1] : [0]) {
    const base = cyl(.16, .14, MAT.body); base.position.set(side * .55, .97, -.3); g.add(base);
    const yaw = new THREE.Group(); yaw.position.set(side * .55, 1.04, -.3); g.add(yaw);
    const sh = new THREE.Group(); sh.position.y = .08; yaw.add(sh);
    const a1 = box(.1, .55, .1, industrial ? MAT.joint : MAT.shell); a1.position.y = .275; sh.add(a1); sh.add(ball(.09));
    const el = new THREE.Group(); el.position.y = .55; sh.add(el); el.add(ball(.08));
    const a2 = box(.08, .5, .08, MAT.shell); a2.position.y = .25; el.add(a2);
    const wr = new THREE.Group(); wr.position.y = .5; el.add(wr);
    const f1 = box(.03, .1, .06), f2 = box(.03, .1, .06); f1.position.set(.04, .05, 0); f2.position.set(-.04, .05, 0); wr.add(f1, f2, ball(.05));
    arms.push({yaw, sh, el, wr, side});
  }
  return {group: g, update(t) {
    const c = (t * .35) % 1, s = Math.sin(c * Math.PI * 2);
    arms.forEach((A, i) => {
      const p = t * .9 + i * Math.PI;
      A.yaw.rotation.y = Math.sin(p) * .8; A.sh.rotation.x = .5 + Math.sin(p * 1.3) * .25; A.el.rotation.x = 1.1 + Math.sin(p * 1.3 + 1) * .3; A.wr.rotation.x = .3;
    });
    item.position.x = Math.sin(t * .9) * .5; item.position.z = .15 + Math.cos(t * .9) * .1; item.rotation.y = t * .6; void s;
  }};
}

export function amr({withArm = false} = {}) {
  const g = new THREE.Group(), bot = new THREE.Group(); g.add(bot);
  const base = box(.7, .28, .5, MAT.body); base.position.y = .22; bot.add(base);
  const top = box(.66, .04, .46, MAT.light); top.position.y = .38; bot.add(top);
  const strip = box(.72, .03, .02, MAT.joint); strip.position.set(0, .2, .26); bot.add(strip);
  for (const [x, z] of [[.25, .26], [-.25, .26], [.25, -.26], [-.25, -.26]]) { const w = cyl(.08, .05, MAT.shell); w.rotation.x = Math.PI / 2; w.position.set(x, .08, z); bot.add(w); }
  const tote = box(.4, .2, .3, MAT.joint); tote.position.y = .5; bot.add(tote);
  if (withArm) { const m = cyl(.05, .6, MAT.shell); m.position.set(-.2, .7, 0); bot.add(m); }
  return {group: g, update(t) { const a = t * .5; bot.position.set(Math.cos(a) * 1.1, 0, Math.sin(a) * .7); bot.rotation.y = -a - Math.PI / 2; }};
}

export function soccer() {
  const g = new THREE.Group();
  const h1 = humanoid({mode: 'soccer'}), h2 = humanoid({mode: 'soccer'});
  h1.group.scale.setScalar(.8); h2.group.scale.setScalar(.8); g.add(h1.group, h2.group);
  const b = ball(.11, MAT.ball); g.add(b);
  return {group: g, update(t, dt) {
    const a = t * .8, bx = Math.cos(a) * 1.2, bz = Math.sin(a * 1.6) * .6;
    b.position.set(bx, .11, bz); b.rotation.x += dt * 6;
    h1.group.position.set(bx - .45, 0, bz); h1.group.rotation.y = Math.PI / 2;
    h2.group.position.set(bx + .6 + Math.sin(t) * .2, 0, bz - .1); h2.group.rotation.y = -Math.PI / 2;
    h1.update(t); h2.update(t + .5);
  }};
}

// A plinth with a robot on it and a small caption area.
export function exhibit(kind) {
  const holder = new THREE.Group();
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.2, .12, 48), MAT.plinth); plinth.position.y = .06; plinth.receiveShadow = true; holder.add(plinth);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.12, .02, 8, 72), MAT.joint); ring.rotation.x = Math.PI / 2; ring.position.y = .12; holder.add(ring);
  const mk = {
    quadruped: () => quadruped(), 'quadruped-3leg': () => quadruped({missingLeg: true}),
    humanoid: () => humanoid(), 'humanoid-walk': () => humanoid({mode: 'walk'}), 'humanoid-stairs': () => humanoid({mode: 'stairs'}),
    arm: () => arm(), 'arm-industrial': () => arm({industrial: true}), 'dual-arm': () => arm({dual: true}),
    amr: () => amr(), 'amr-arm': () => amr({withArm: true}), soccer: () => soccer(),
  }[kind] || (() => humanoid());
  const r = mk(); r.group.position.y = .12; holder.add(r.group);
  holder.userData.robot = r.group;
  if (kind === 'humanoid-stairs') { for (let i = 0; i < 3; i++) { const s = box(1, .15, .45, MAT.light); s.position.set(0, .12 + .075 + i * .15, -.45 + i * .45); s.scale.y = 1 + i * 2; s.position.y = .12 + (.15 * (1 + i * 2)) / 2; holder.add(s); } }
  return {group: holder, update: r.update};
}
