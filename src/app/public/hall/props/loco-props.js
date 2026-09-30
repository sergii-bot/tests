// Procedural props and sets for the locomotion TRY stands (one-policy, omni-bodied): real-world looks from the official
// videos (concrete stairs by a brick wall, a park, pallets in an office, a stairwell, red carpet, office carpet tiles,
// a brick patio, a café, curtains). Everything is built from three.js primitives and small canvas textures, no downloads.
// All coordinates are three.js (Y-up). Call disposeTree(obj) on cleanup.
import * as THREE from '../../vendor/three.module.js';

const texCache = new Map();
// canvas texture with world-scale repeat (uv units = metres after worldUV), cached per name
function canvasTex(name, size, draw) {
  if (texCache.has(name)) return texCache.get(name);
  let tex = null;
  try {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'); if (g) draw(g, size);
    tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  } catch { tex = null; }
  texCache.set(name, tex); return tex;
}
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
function speckle(g, n, size, cols, r = 2) { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(rnd() * size, rnd() * size, r * (.5 + rnd()), r * (.5 + rnd())); } }

// texture painters (1 texture tile = `tile` metres)
const T = {
  concrete: () => canvasTex('concrete', 256, (g, s) => { g.fillStyle = '#a7a39c'; g.fillRect(0, 0, s, s); speckle(g, 2600, s, ['#9b978f', '#b3afa7', '#8f8b84', '#bab6ae']); g.strokeStyle = 'rgba(60,55,50,.25)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s); }),
  brick: () => canvasTex('brick', 256, (g, s) => {
    g.fillStyle = '#b9b2a6'; g.fillRect(0, 0, s, s); const bh = s / 8, bw = s / 4;
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) { const x = c * bw + (r % 2) * bw / 2; const k = rnd(); g.fillStyle = k < .33 ? '#8e3f2c' : k < .66 ? '#9c4a33' : '#7c3626'; g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4); }
    speckle(g, 700, s, ['rgba(0,0,0,.12)', 'rgba(255,255,255,.08)']);
  }),
  wood: () => canvasTex('wood', 256, (g, s) => {
    g.fillStyle = '#c9a36b'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { g.strokeStyle = `rgba(${110 + rnd() * 40 | 0},${75 + rnd() * 25 | 0},40,.35)`; g.lineWidth = 1 + rnd() * 2; g.beginPath(); const y = rnd() * s; g.moveTo(0, y); g.bezierCurveTo(s * .3, y + rnd() * 8 - 4, s * .7, y + rnd() * 8 - 4, s, y); g.stroke(); }
  }),
  pallet: () => canvasTex('pallet', 256, (g, s) => {   // slats with dark gaps (a pallet seen from the side / top)
    g.fillStyle = '#3a2a1a'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#c49a5e' : '#b98d52'; g.fillRect(0, i * s / 5 + 3, s, s / 5 - 9); }
    for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(90,60,30,.3)'; g.fillRect(rnd() * s, rnd() * s, 10 + rnd() * 30, 1); }
    g.fillStyle = '#9a9a9a'; for (let i = 0; i < 12; i++) g.fillRect(rnd() * s, rnd() * s, 3, 3);
  }),
  grass: () => canvasTex('grass', 256, (g, s) => { g.fillStyle = '#5f8a3a'; g.fillRect(0, 0, s, s); speckle(g, 5000, s, ['#4f7a2f', '#6f9a45', '#7aa24c', '#557f33'], 3); }),
  leaves: () => canvasTex('leaves', 256, (g, s) => { g.fillStyle = '#6b8a3c'; g.fillRect(0, 0, s, s); speckle(g, 4000, s, ['#5a7a30', '#7c9a4a'], 3); speckle(g, 160, s, ['#c8782a', '#a8541e', '#d9a441', '#8a4a20'], 9); }),
  stone: () => canvasTex('stone', 256, (g, s) => { g.fillStyle = '#b8b0a2'; g.fillRect(0, 0, s, s); speckle(g, 2400, s, ['#a89f90', '#c6beb0', '#9d9588']); }),
  carpetTiles: () => canvasTex('carpetTiles', 256, (g, s) => {
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#5d6166' : '#6a6e73'; g.fillRect(i * s / 2, j * s / 2, s / 2, s / 2);
      for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(0,0,0,.12)'; (i + j) % 2 ? g.fillRect(i * s / 2 + k * 3.2, j * s / 2, 1, s / 2) : g.fillRect(i * s / 2, j * s / 2 + k * 3.2, s / 2, 1); } }
    speckle(g, 1500, s, ['rgba(255,255,255,.06)', 'rgba(0,0,0,.1)']);
  }),
  redCarpet: () => canvasTex('redCarpet', 128, (g, s) => { g.fillStyle = '#a3121b'; g.fillRect(0, 0, s, s); speckle(g, 2500, s, ['#8f0f17', '#b3202a', '#9a141c'], 2); }),
  patio: () => canvasTex('patio', 256, (g, s) => {
    g.fillStyle = '#7a7166'; g.fillRect(0, 0, s, s); const bw = s / 4, bh = s / 8;
    for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) { const x = c * bw + (r % 2) * bw / 2, k = rnd(); g.fillStyle = k < .3 ? '#a2533b' : k < .6 ? '#b0634a' : k < .85 ? '#8f4a36' : '#9b7a62'; g.fillRect(x + 2, r * bh + 2, bw - 4, bh - 4); }
    speckle(g, 900, s, ['rgba(0,0,0,.1)', 'rgba(255,255,255,.06)']);
  }),
  cafeFloor: () => canvasTex('cafeFloor', 256, (g, s) => { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#e7e1d6' : '#3b3632'; g.fillRect(i * s / 4, j * s / 4, s / 4, s / 4); } speckle(g, 600, s, ['rgba(0,0,0,.06)', 'rgba(255,255,255,.05)']); }),
  officeFloor: () => canvasTex('officeFloor', 256, (g, s) => { g.fillStyle = '#b9bbbd'; g.fillRect(0, 0, s, s); speckle(g, 1400, s, ['#b0b2b4', '#c3c5c7']); g.strokeStyle = 'rgba(0,0,0,.12)'; g.strokeRect(0, 0, s, s); }),
  labGrid: () => canvasTex('labGrid', 128, (g, s) => { g.fillStyle = '#d9d6cf'; g.fillRect(0, 0, s, s); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.strokeRect(0, 0, s, s); g.strokeStyle = 'rgba(0,0,0,.07)'; g.lineWidth = 1; g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke(); }),
  plaster: () => canvasTex('plaster', 128, (g, s) => { g.fillStyle = '#d8d3c8'; g.fillRect(0, 0, s, s); speckle(g, 900, s, ['#cfcabf', '#e0dbd0']); }),
};
// tile size in metres per texture
const TILE = {concrete: 1, brick: 1.2, wood: .6, pallet: .6, grass: 1.5, leaves: 1.5, stone: .8, carpetTiles: 1, redCarpet: .6, patio: .9, cafeFloor: 1.2, officeFloor: 1.2, labGrid: .5, plaster: 1};

export function mat(color, {tex, rough = .8, metal = 0, emissive, opacity} = {}) {
  const m = new THREE.MeshStandardMaterial({color, roughness: rough, metalness: metal});
  if (tex && T[tex]) { const t = T[tex](); if (t) { m.map = t; m.userData.tile = TILE[tex]; } }
  if (emissive) { m.emissive = new THREE.Color(emissive); m.emissiveIntensity = 1; }
  if (opacity !== undefined) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; }
  return m;
}
// set UVs from world-space positions (so textures tile at real scale); call after baking the translation into geo
export function worldUV(geo, tile = 1) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = geo.attributes.uv; if (!uv || !n) return geo;
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)), x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (ay >= ax && ay >= az) uv.setXY(i, x / tile, z / tile); else if (ax >= az) uv.setXY(i, z / tile, y / tile); else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true; return geo;
}
// box from min/max corners (world UVs)
export function block(x0, y0, z0, x1, y1, z1, material) {
  const geo = new THREE.BoxGeometry(Math.max(1e-3, x1 - x0), Math.max(1e-3, y1 - y0), Math.max(1e-3, z1 - z0));
  geo.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const mats = Array.isArray(material) ? material : [material];
  worldUV(geo, mats[0].userData.tile || 1);
  const m = new THREE.Mesh(geo, material); m.castShadow = m.receiveShadow = true; return m;
}
function plane(w, d, material, y = 0, x = 0, z = 0) {
  const geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2); geo.translate(x, y, z); worldUV(geo, material.userData.tile || 1);
  const m = new THREE.Mesh(geo, material); m.receiveShadow = true; return m;
}
function cyl(r0, r1, h, material, seg = 16) { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), material); m.castShadow = true; return m; }
// a cylinder between two points
export function rod(a, b, r, material) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length(), m = cyl(r, r, Math.max(1e-3, L), material, 10);
  m.position.copy(a).addScaledVector(d, .5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}

// ---------- props ----------
export function pallet(mt) {               // EUR pallet 1.2 × 0.8 × 0.144 m
  const g = new THREE.Group(), w = mt || mat('#c49a5e', {tex: 'wood'});
  for (let i = 0; i < 5; i++) g.add(block(-.6, .122, -.4 + i * .1875 - .05, .6, .144, -.4 + i * .1875 + .05, w));
  for (const z of [-.36, 0, .36]) { g.add(block(-.6, .1, z - .05, .6, .122, z + .05, w)); for (const x of [-.52, 0, .52]) g.add(block(x - .07, .022, z - .05, x + .07, .1, z + .05, w)); }
  for (const z of [-.36, 0, .36]) g.add(block(-.6, 0, z - .05, .6, .022, z + .05, w));
  return g;
}
export function cardboardBox(sx = .36, sy = .28, sz = .3) {
  const g = new THREE.Group();
  g.add(block(-sx / 2, -sy / 2, -sz / 2, sx / 2, sy / 2, sz / 2, mat('#b88a55', {rough: .95})));
  g.add(block(-sx / 2 - .002, sy / 2 - .001, -.03, sx / 2 + .002, sy / 2 + .003, .03, mat('#d8c39a', {rough: .6})));   // tape
  g.add(block(-sx / 2 - .003, -.03, sz / 2 - .002, -sx / 2 + .06, .03, sz / 2 + .004, mat('#ffffff', {rough: .5})));  // label
  return g;
}
// low-poly person (for push/pull and the chainsaw boot). Returns group with .pose(lean, reach, walkPhase)
export function person({shirt = '#3d5a80', pants = '#2b2b2b', skin = '#c8987a'} = {}) {
  const g = new THREE.Group(), ms = mat(shirt), mp = mat(pants), mk = mat(skin), shoe = mat('#1a1a1a');
  const hips = new THREE.Group(); hips.position.y = .92; g.add(hips);
  const torso = new THREE.Group(); hips.add(torso);
  const chest = new THREE.Mesh(new THREE.CapsuleGeometry(.16, .38, 4, 10), ms); chest.position.y = .3; chest.scale.z = .65; chest.castShadow = true; torso.add(chest);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.11, 16, 12), mk); head.position.y = .7; head.castShadow = true; torso.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.113, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#2a1d14')); hair.position.y = .71; torso.add(hair);
  const limb = (parent, len, r, material, y) => { const j = new THREE.Group(); j.position.y = y; parent.add(j); const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len - 2 * r, 4, 8), material); m.position.y = -len / 2; m.castShadow = true; j.add(m); return j; };
  const arms = [-1, 1].map(s => { const sh = limb(torso, .3, .05, ms, .52); sh.position.z = s * .21; const el = limb(sh, .28, .042, mk, -.3); return {sh, el}; });
  const legs = [-1, 1].map(s => { const hp = limb(hips, .46, .07, mp, 0); hp.position.z = s * .1; const kn = limb(hp, .46, .06, mp, -.46); const f = new THREE.Mesh(new THREE.BoxGeometry(.26, .08, .1), shoe); f.position.set(.06, -.48, 0); kn.add(f); return {hp, kn}; });
  g.userData = {torso, arms, legs, hips};
  g.pose = (lean = 0, reach = .6, walk = 0) => {
    torso.rotation.z = -lean;                                           // + lean = forward (+x)
    arms.forEach(({sh, el}, i) => { sh.rotation.z = -reach + Math.sin(walk + i * Math.PI) * .1; el.rotation.z = -.3; });
    legs.forEach(({hp, kn}, i) => { const s = Math.sin(walk + i * Math.PI); hp.rotation.z = s * .35 + lean * .3; kn.rotation.z = -Math.max(0, -s) * .5; });
  };
  g.hand = () => { const v = new THREE.Vector3(0, -.28, 0); arms[0].el.localToWorld(v); return v; };
  g.pose();
  return g;
}
export function tree(h = 4) {
  const g = new THREE.Group(), tr = cyl(.1, .16, h * .5, mat('#5b4331')); tr.position.y = h * .25; g.add(tr);
  const leafM = mat('#4f7a33', {rough: .9});
  for (const [x, y, z, r] of [[0, .72, 0, .34], [.18, .62, .1, .26], [-.2, .6, -.08, .25], [0, .88, .05, .22]]) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r * h, 1), leafM); s.position.set(x * h, y * h, z * h); s.castShadow = true; g.add(s); }
  return g;
}
export function lampPost(h = 3.4) {
  const g = new THREE.Group(), m = mat('#2b2e31', {metal: .6, rough: .4}); const p = cyl(.04, .05, h, m); p.position.y = h / 2; g.add(p);
  const l = new THREE.Mesh(new THREE.SphereGeometry(.14, 12, 10), mat('#fff6d8', {emissive: '#fff1c4'})); l.position.y = h + .1; g.add(l); return g;
}
export function bench() {
  const g = new THREE.Group(), w = mat('#8a5a36', {tex: 'wood'}), m = mat('#2b2e31', {metal: .5});
  for (let i = 0; i < 3; i++) g.add(block(-.8, .42, -.2 + i * .14, .8, .46, -.1 + i * .14, w));
  for (let i = 0; i < 2; i++) g.add(block(-.8, .55 + i * .14, -.25, .8, .64 + i * .14, -.22, w));
  for (const x of [-.7, .7]) { g.add(block(x - .03, 0, -.22, x + .03, .44, -.18, m)); g.add(block(x - .03, 0, .1, x + .03, .44, .14, m)); }
  return g;
}
export function chair(color = '#2f2f2f') {
  const g = new THREE.Group(), m = mat(color, {metal: .4, rough: .5}), s = mat('#9a6b44', {tex: 'wood'});
  g.add(block(-.21, .44, -.21, .21, .47, .21, s)); g.add(block(-.21, .47, -.23, .21, .88, -.2, s));
  for (const [x, z] of [[-.19, -.19], [.19, -.19], [-.19, .19], [.19, .19]]) g.add(block(x - .015, 0, z - .015, x + .015, .44, z + .015, m));
  return g;
}
export function cafeTable(r = .36) {
  const g = new THREE.Group(), top = cyl(r, r, .03, mat('#f0ece4', {rough: .35}), 28); top.position.y = .74; g.add(top);
  const leg = cyl(.03, .03, .72, mat('#2b2e31', {metal: .6})); leg.position.y = .37; g.add(leg);
  const foot = cyl(.22, .24, .03, mat('#2b2e31', {metal: .6})); foot.position.y = .015; g.add(foot);
  const cup = cyl(.04, .032, .08, mat('#ffffff', {rough: .3})); cup.position.set(.1, .8, .05); g.add(cup);
  return g;
}
// pleated curtain: a plane rippled along x (width w, height h), hung at y=0..h
export function curtains(w = 8, h = 3.2, color = '#6d1420') {
  const geo = new THREE.PlaneGeometry(w, h, Math.round(w * 24), 1), p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2 * Math.PI / .225) * .05);
  geo.computeVertexNormals(); geo.translate(0, h / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color, roughness: .85, side: THREE.DoubleSide})); m.receiveShadow = true; return m;
}
export function windowWall(x0, x1, h, z, {frame = '#2c2f33', glass = '#dfeaf2'} = {}) {
  const g = new THREE.Group(), fm = mat(frame, {metal: .5, rough: .4}), gm = mat(glass, {emissive: glass, rough: .2});
  gm.emissiveIntensity = .85;
  g.add(block(x0, 0, z - .06, x1, .5, z, mat('#c9c6bf'))); g.add(block(x0, h - .35, z - .06, x1, h, z, mat('#c9c6bf')));
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, h - .85), gm); pane.position.set((x0 + x1) / 2, .5 + (h - .85) / 2, z - .07); g.add(pane);
  for (let x = x0; x <= x1 + 1e-6; x += 1.8) g.add(block(x - .04, .5, z - .12, x + .04, h - .35, z - .02, fm));
  g.add(block(x0, h * .55 - .03, z - .12, x1, h * .55 + .03, z - .02, fm));
  return g;
}
// railing along a polyline of THREE.Vector3 tops: posts at each point, balusters every `bal` m, top rail
export function railing(tops, {color = '#1c1c1c', height = .9, bal = 0, r = .022, metal = .6} = {}) {
  const g = new THREE.Group(), m = mat(color, {metal, rough: .35});
  const up = p => new THREE.Vector3(p.x, p.y + height, p.z);
  for (let i = 0; i < tops.length; i++) {
    if (i < tops.length - 1) g.add(rod(up(tops[i]), up(tops[i + 1]), r, m));
    const post = i % 4 === 0 || i === tops.length - 1; if (post) g.add(rod(tops[i], up(tops[i]), r * .9, m));
    if (bal && i < tops.length - 1) { const a = tops[i], b = tops[i + 1], L = a.distanceTo(b), n = Math.max(1, Math.round(L / bal)); for (let k = 1; k < n; k++) { const p = a.clone().lerp(b, k / n); g.add(rod(p, up(p), r * .45, m)); } }
  }
  return g;
}
export function chainsaw() {
  const g = new THREE.Group(), body = mat('#e35f12', {rough: .5}), dark = mat('#1d1d1d', {rough: .6}), steel = mat('#b8bcc0', {metal: .8, rough: .3});
  g.add(block(-.16, -.07, -.06, .06, .08, .06, body));                         // engine housing
  g.add(block(-.2, .08, -.02, .02, .12, .02, dark));                           // top handle
  g.add(block(.06, -.03, -.008, .46, .03, .008, steel));                       // guide bar
  const chainM = mat('#3a3a3a', {metal: .6}); g.add(block(.06, .03, -.01, .46, .038, .01, chainM)); g.add(block(.06, -.038, -.01, .46, -.03, .01, chainM));
  const tip = cyl(.034, .034, .02, steel, 14); tip.rotation.x = Math.PI / 2; tip.position.x = .46; g.add(tip);
  return g;
}
export function boot() {
  const g = new THREE.Group(), m = mat('#3b2a1d', {rough: .7});
  g.add(block(-.05, 0, -.055, .22, .08, .055, m)); g.add(block(-.06, .08, -.055, .08, .28, .055, m));
  g.add(block(-.07, .28, -.07, .09, .6, .07, mat('#2d3a4a')));                // jeans
  return g;
}
export function wheel(r = .06, w = .035) {
  const g = new THREE.Group(), tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 22), mat('#161616', {rough: .9})); tyre.castShadow = true; g.add(tyre);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * .55, r * .55, w + .004, 6), mat('#9aa0a6', {metal: .7, rough: .3})); g.add(hub);
  const mark = block(-r * .92, -w / 2 - .003, -.006, r * .92, w / 2 + .003, .006, mat('#FF7E00')); g.add(mark);   // spin marker (across the disc)
  return g;
}

// ---------- sets ----------
// set descriptor: {bg, fog, ground (top-level floor material), path {top, side, nose}, build(group, ctx)}
//   ctx = {span: [x0, x1], terrainAt: x -> height (three y) or null, rail: (z, step) -> Vector3[] along the smoothed terrain}
export const SETS = {
  outdoor: {bg: '#cdd8e2', hemi: ['#eef3f8', '#8d7f70', 1.2], sun: 1.8,
    path: () => ({top: mat('#a9a59e', {tex: 'concrete'}), side: mat('#9c988f', {tex: 'concrete'}), nose: mat('#7f7b74')}),
    ground: () => mat('#9d9990', {tex: 'concrete'}),
    build(g, c) {
      g.add(block(c.span[0] - 4, 0, -2.4, c.span[1] + 4, 4.6, -1.6, mat('#9c4a33', {tex: 'brick'})));          // brick building
      for (let x = c.span[0] - 2; x < c.span[1] + 3; x += 2.6) g.add(block(x, 1.4, -1.62, x + 1.1, 2.9, -1.58, mat('#2d3a47', {rough: .2, metal: .3})));   // windows
      g.add(railing(c.rail(-.95, .25), {color: '#9aa0a6', metal: .85, r: .02}));                      // metal handrail
    }},
  park: {bg: '#cfe0ec', hemi: ['#f2f7ea', '#5d6e3a', 1.25], sun: 1.9,
    path: () => ({top: mat('#bdb5a7', {tex: 'stone'}), side: mat('#aaa293', {tex: 'stone'}), nose: mat('#8e877b')}),
    ground: () => mat('#6b8a3c', {tex: 'grass'}), embank: () => mat('#5f8a3a', {tex: 'grass'}),
    build(g, c) {
      for (const [x, z, h] of [[-1.5, -4, 4.5], [2.2, -5.2, 5], [5.5, -4.2, 4], [8.6, -5, 5.2], [11.5, -4.4, 4.4], [1, 4.8, 4.2], [7, 5.4, 4.6]]) { const t = tree(h); t.position.set(x, c.terrainAt(x) ?? 0, z); g.add(t); }
      for (const x of [.4, 6.2]) { const l = lampPost(); l.position.set(x, c.terrainAt(x) ?? 0, -1.35); g.add(l); }
      const b = bench(); b.position.set(-1.2, 0, -1.5); g.add(b);
      g.add(railing(c.rail(-.9, .5), {color: '#2b2e31', metal: .6, r: .02}));
    }},
  office: {bg: '#e7ebee', hemi: ['#ffffff', '#9a9c9e', 1.35], sun: 1.3,
    path: () => ({top: mat('#c49a5e', {tex: 'pallet'}), side: mat('#b98d52', {tex: 'pallet'}), nose: mat('#8a6438')}), palletPath: true,
    ground: () => mat('#b9bbbd', {tex: 'officeFloor', rough: .45}),
    build(g, c) {
      g.add(windowWall(c.span[0] - 5, c.span[1] + 5, 3.4, -3));
      for (let x = c.span[0] - 2; x < c.span[1] + 4; x += 4.8) g.add(block(x - .25, 0, -2.9, x + .25, 3.4, -2.4, mat('#d6d4cf')));    // columns
      g.add(block(c.span[0] - 5, 3.4, -3, c.span[1] + 5, 3.45, 3, mat('#eeeeec')));                          // ceiling
      for (const [x, z, n] of [[-1.6, -1.6, 3], [4.8, -1.8, 2], [9.3, -1.5, 4], [11.8, 1.6, 2]]) for (let i = 0; i < n; i++) { const p = pallet(); p.position.set(x, i * .144, z); p.rotation.y = i * .08; g.add(p); }
    }},
  stairwell: {bg: '#b9b6ae', hemi: ['#fff8ec', '#6e6a62', 1.15], sun: 1.1,
    path: () => ({top: mat('#8f949a', {tex: 'concrete'}), side: mat('#b3afa7', {tex: 'concrete'}), nose: mat('#d9b233')}),
    ground: () => mat('#8f949a', {tex: 'concrete'}),
    build(g, c) {
      g.add(block(c.span[0] - 4, -.5, -1.9, c.span[1] + 4, 6, -1.6, mat('#d8d3c8', {tex: 'plaster'})));
      g.add(block(c.span[0] - 4, -.5, -1.62, c.span[1] + 4, .12, -1.58, mat('#5c6670')));                     // skirting
      g.add(railing(c.rail(-.9, .3), {color: '#141414', bal: .13, r: .02, metal: .3}));                  // black railings
      for (let x = c.span[0]; x < c.span[1] + 2; x += 3.2) { const l = new THREE.Mesh(new THREE.BoxGeometry(1.2, .04, .14), mat('#ffffff', {emissive: '#fffaf0'})); l.position.set(x, (c.terrainAt(x) ?? 0) + 2.9, -1.2); g.add(l); }
    }},
  tight: {bg: '#dcdfe2', hemi: ['#ffffff', '#8e8a84', 1.3], sun: 1.4,
    path: () => ({top: mat('#9aa0a6', {metal: .5, rough: .45}), side: mat('#7d848b', {metal: .45, rough: .5}), nose: mat('#e8c237')}),
    ground: () => mat('#c9c6bf', {tex: 'concrete'}),
    build(g, c) {
      g.add(block(c.span[0] - 4, 0, -2.2, c.span[1] + 4, 4, -2, mat('#e4e1da', {tex: 'plaster'})));
      g.add(railing(c.rail(-.9, .25), {color: '#2b2e31', metal: .7, r: .018}));
    }},
  carpet: {bg: '#4a4e53', hemi: ['#fff4e6', '#5a3a30', 1.2], sun: 1.3,
    path: () => ({top: mat('#a3121b', {tex: 'redCarpet', rough: 1}), side: mat('#8f0f17', {tex: 'redCarpet', rough: 1}), nose: mat('#6d0b12')}),
    ground: () => mat('#5b5e61', {tex: 'concrete'}),
    build(g, c) {
      g.add(block(c.span[0] - 4, 0, -3.2, c.span[1] + 4, 4.5, -3, mat('#6b6f74', {tex: 'concrete'})));
      for (const [x, z, n] of [[-1.8, -1.7, 4], [3.6, -2.1, 3], [7.4, -1.8, 5], [11, -2, 2], [1.2, 2.4, 2]]) for (let i = 0; i < n; i++) { const p = pallet(); p.position.set(x, i * .144, z); g.add(p); }
    }},
  lab: {bg: '#e9e6e0', hemi: ['#ffffff', '#b3ada3', 1.3], sun: 1.5,
    path: () => ({top: mat('#d9d6cf', {tex: 'labGrid'}), side: mat('#c1bcb3'), nose: mat('#FF7E00')}),
    ground: () => mat('#e6e4dd', {tex: 'labGrid'}),
    build(g, c) { g.add(block(c.span[0] - 4, 0, -2.6, c.span[1] + 4, 3.5, -2.4, mat('#f2f0eb'))); }},
  // omni-bodied floors (flat). Content repeats every 18 m in x so the stand can scroll the set with the robot (see omni-bodied.js).
  officeCarpet: {bg: '#d9dcdf', hemi: ['#ffffff', '#6f7378', 1.3], sun: 1.3, ground: () => mat('#62666b', {tex: 'carpetTiles', rough: 1}),
    build(g) { g.add(windowWall(-36, 36, 3, -6, {glass: '#e6eef3'})); for (let x = -36; x <= 36; x += 6) { const t = new THREE.Mesh(new THREE.BoxGeometry(2, .74, .8), mat('#e9e6e0')); t.position.set(x, .37, -4.7); t.castShadow = true; g.add(t); } }},
  patio: {bg: '#cfdce6', hemi: ['#f4f7fa', '#7a6a5a', 1.25], sun: 1.9, ground: () => mat('#a2533b', {tex: 'patio'}),
    build(g) { g.add(block(-36, 0, -6.2, 36, 1.1, -5.8, mat('#9c4a33', {tex: 'brick'}))); for (let x = -36, i = 0; x <= 36; x += 9, i++) { const t = tree(4.5); t.position.set(x + (i % 2) * 2, 0, -8 - (i % 3) * .4); g.add(t); } g.add(plane(90, 20, mat('#6b8a3c', {tex: 'leaves'}), -.01, 0, -16)); }},
  leaves: {bg: '#cfe0e8', hemi: ['#f2f7ea', '#5d6e3a', 1.25], sun: 1.8, ground: () => mat('#6b8a3c', {tex: 'leaves'}),
    build(g) { g.add(block(-36, 0, -5.6, 36, 1.2, -5.0, mat('#3f6a2c', {rough: 1}))); for (let x = -36, i = 0; x <= 36; x += 9, i++) { const t = tree(4.8); t.position.set(x + (i % 2) * 2.5, 0, -7.5 - (i % 3) * .5); g.add(t); } }},
  cafe: {bg: '#e8dccb', hemi: ['#fff3e0', '#7a5a40', 1.25], sun: 1.3, ground: () => mat('#e7e1d6', {tex: 'cafeFloor', rough: .4}),
    build(g) {
      g.add(block(-36, 0, -6.4, 36, 3.2, -6.2, mat('#caa77f', {tex: 'plaster'})));
      for (let x = -36; x <= 36; x += 3) { const t = cafeTable(); t.position.set(x, 0, -2.8 + (Math.abs(x) % 2) * .4); g.add(t); for (const [dx, ry] of [[-.6, Math.PI / 2], [.6, -Math.PI / 2]]) { const ch = chair(); ch.position.set(x + dx, 0, t.position.z); ch.rotation.y = ry; g.add(ch); } }
      for (let x = -36; x <= 36; x += 6) { const t = cafeTable(.3); t.position.set(x, 0, -4.7); g.add(t); const ch = chair('#6b4a2e'); ch.position.set(x + .55, 0, -4.7); ch.rotation.y = -Math.PI / 2; g.add(ch); }
    }},
  stage: {bg: '#2a1c1e', hemi: ['#ffeede', '#3a1418', 1.1], sun: 1.5, ground: () => mat('#5b5e61', {tex: 'concrete'}),
    build(g) {
      g.add(plane(72, 3.6, mat('#a3121b', {tex: 'redCarpet', rough: 1}), .004, 0, 0));
      const cu = curtains(72, 3.6, '#5e0f1a'); cu.position.z = -3.0; g.add(cu);
    }},
  workshop: {bg: '#c7c9cb', hemi: ['#ffffff', '#6f7378', 1.25], sun: 1.4, ground: () => mat('#62666b', {tex: 'carpetTiles', rough: 1}),
    build(g) { g.add(block(-30, 0, -5.2, 30, 3, -5, mat('#d8d3c8', {tex: 'plaster'}))); for (const [x, z, n] of [[-3, -3.5, 2], [4, -3.8, 3]]) for (let i = 0; i < n; i++) { const p = pallet(); p.position.set(x, i * .144, z); g.add(p); } }},
};

// flat ground plane for a set (big)
export function groundPlane(set, size = 80) { return plane(size, size, set.ground(), 0); }

export function disposeTree(obj) {
  obj.traverse(o => {
    o.geometry?.dispose?.();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { m.map?.dispose?.(); m.dispose?.(); }   // cached textures re-upload on next use
  });
}
