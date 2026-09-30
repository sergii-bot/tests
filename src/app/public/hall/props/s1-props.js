// Props and set pieces for the S1 TRY stand (hall/try/s1.js): the S1 rig column + gripper, and everything the official S1 videos show
// on the table, modelled from three.js primitives. `createProps()` returns {M, build, env, ...}. Everything created here is released with
// P.disposeTree(group) (per object) or P.dispose() (shared materials / textures). No network, no DOM except small canvas textures.
import * as THREE from '../../vendor/three.module.js';
export {THREE};

const PI = Math.PI;
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // deterministic texture noise
const cyl = (rt, rb, h, s = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, ws = 20, hs = 14) => new THREE.SphereGeometry(r, ws, hs);
const tor = (r, t, arc = PI * 2, rs = 8, ts = 24) => new THREE.TorusGeometry(r, t, rs, ts, arc);

export function createProps() {
  const own = [];                                            // shared disposables (textures, materials)
  function canvasTex(w, h, draw, repeat) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); if (!g) return null;
    draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    own.push(t); return t;
  }
  const T = {
    wood: canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#b98b57'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 8; i++) { const y = i * h / 8, l = 44 + rnd() * 18; g.fillStyle = `hsl(30,${38 + rnd() * 12}%,${l}%)`; g.fillRect(0, y, w, h / 8);
        g.strokeStyle = 'rgba(70,40,15,.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
        for (let n = 0; n < 9; n++) { g.strokeStyle = `rgba(80,45,15,${.08 + rnd() * .1})`; g.lineWidth = 1; g.beginPath(); const yy = y + rnd() * h / 8; g.moveTo(0, yy); g.bezierCurveTo(w * .3, yy + rnd() * 6 - 3, w * .6, yy + rnd() * 6 - 3, w, yy + rnd() * 4 - 2); g.stroke(); }
        const cx = rnd() * w; g.strokeStyle = 'rgba(60,35,12,.4)'; g.beginPath(); g.moveTo(cx, y); g.lineTo(cx, y + h / 8); g.stroke(); }
    }, [1, 1]),
    tennis: canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#c9d92e'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { g.fillStyle = rnd() < .5 ? 'rgba(255,255,120,.22)' : 'rgba(90,120,0,.2)'; g.fillRect(rnd() * w, rnd() * h, 2, 2); }
      g.strokeStyle = '#f7f7ef'; g.lineWidth = 9; g.lineCap = 'round';
      for (const ph of [0, PI]) { g.beginPath(); for (let x = 0; x <= w; x += 4) { const y = h * (.5 + .27 * Math.sin(x / w * PI * 2 + ph)); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    }),
    grip: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#1b1b1d'; g.fillRect(0, 0, w, h); for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(${rnd() < .5 ? '255,255,255' : '0,0,0'},.16)`; g.fillRect(rnd() * w, rnd() * h, 2, 2); } }, [6, 2]),
    logo: canvasTex(128, 64, (g, w, h) => { g.fillStyle = '#f4f3ef'; g.fillRect(0, 0, w, h); g.fillStyle = '#FF7E00'; g.font = '700 40px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('S1', w / 2, h / 2 + 2); }),
    soilBag: canvasTex(128, 96, (g, w, h) => { g.fillStyle = '#3a2a1e'; g.fillRect(0, 0, w, h); g.fillStyle = '#f0e6d0'; g.fillRect(14, 22, w - 28, 44); g.fillStyle = '#3a2a1e'; g.font = '700 26px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SOIL', w / 2, 44); }),
    belt: canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#2b2d31'; g.fillRect(0, 0, w, h); g.fillStyle = '#383b40'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h); }, [16, 1]),
    tile: canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#e9eef0'; g.fillRect(0, 0, w, h); g.strokeStyle = '#c7d0d4'; g.lineWidth = 3; g.strokeRect(0, 0, w, h); }, [22, 8]),
    deckArt: canvasTex(256, 64, (g, w, h) => { g.fillStyle = '#e8b878'; g.fillRect(0, 0, w, h); g.fillStyle = '#e04a2a'; g.fillRect(0, 0, w * .55, h); g.fillStyle = '#1aa6a0'; g.beginPath(); g.moveTo(w * .35, 0); g.lineTo(w * .7, 0); g.lineTo(w * .55, h); g.lineTo(w * .2, h); g.fill(); g.fillStyle = '#f5efe0'; g.beginPath(); g.arc(w * .8, h / 2, h * .32, 0, 7); g.fill(); }),
  };
  const mk = (color, o = {}) => { const m = new THREE.MeshStandardMaterial({color, roughness: .55, metalness: 0, ...o}); own.push(m); return m; };
  const gl = (color, op = .28, o = {}) => mk(color, {transparent: true, opacity: op, roughness: .05, depthWrite: false, side: THREE.DoubleSide, ...o});
  const M = {
    wood: mk('#ffffff', {map: T.wood, roughness: .7}), woodDark: mk('#7a5533', {roughness: .75}), woodLight: mk('#d9b884', {roughness: .7}),
    steel: mk('#c4c9ce', {metalness: .85, roughness: .32}), steelDark: mk('#80868d', {metalness: .8, roughness: .4}), stainless: mk('#b9bfc5', {metalness: .9, roughness: .36}),
    black: mk('#17191c', {roughness: .45, metalness: .2}), blackGloss: mk('#0c0d0f', {roughness: .14, metalness: .3}), white: mk('#f2f1ee', {roughness: .35}), ceramic: mk('#f6f3ec', {roughness: .2, side: THREE.DoubleSide}),
    ceramicIn: mk('#e9e4da', {roughness: .3}), terracotta: mk('#c1653a', {roughness: .85, side: THREE.DoubleSide}), soil: mk('#4a3323', {roughness: 1}), soilWet: mk('#2c1e14', {roughness: .9}),
    leaf: mk('#63a04b', {roughness: .7, side: THREE.DoubleSide}), leafDark: mk('#3f7a37', {roughness: .7, side: THREE.DoubleSide}),
    glass: gl('#d8eef2'), glassBlue: gl('#cfe4f4', .3), oj: mk('#f6a01a', {roughness: .25, transparent: true, opacity: .93, emissive: '#a04a00', emissiveIntensity: .25}),
    coffee: mk('#3a2113', {roughness: .2}), water: mk('#8bbfe0', {transparent: true, opacity: .75, roughness: .1}), batter: mk('#efd48f', {roughness: .5}),
    eggshell: mk('#f1e6d0', {roughness: .6}), yolk: mk('#f2b418', {roughness: .2}), eggwhite: mk('#f7f6ef', {transparent: true, opacity: .88, roughness: .15}),
    blue: mk('#2a6bd1', {roughness: .5}), blueDark: mk('#1d4a95', {roughness: .5}), yellowLiq: mk('#f2d13a', {transparent: true, opacity: .88, roughness: .2}), orangePl: mk('#f0871f', {roughness: .5, side: THREE.DoubleSide}),
    skin: mk('#dca47f', {roughness: .75}), skinShade: mk('#c98e69', {roughness: .8}), sleeve: mk('#3d4b5c', {roughness: .9}), bandaid: mk('#efc39a', {roughness: .7}), pad: mk('#f8f6f0', {roughness: .9}),
    ribbon: mk('#cf1f26', {roughness: .35}), gift: mk('#0d0d10', {roughness: .15, metalness: .15}), cableW: mk('#eeeeea', {roughness: .5}), clip: mk('#18191b', {roughness: .5}),
    navy: mk('#2f4a7c', {roughness: .9}), navyDark: mk('#223658', {roughness: .9}), zipOrange: mk('#f08a1c', {roughness: .5}), urethane: mk('#efe5c9', {roughness: .4}), wheelBlue: mk('#2d7fe0', {roughness: .4}),
    deck: mk('#d9a96b', {roughness: .55}), gripTape: mk('#ffffff', {map: T.grip, roughness: 1}), deckArt: mk('#ffffff', {map: T.deckArt, roughness: .5}), nylon: mk('#1b1c1e', {roughness: .6}),
    cardboard: mk('#b8915a', {roughness: .9}), eggCarton: mk('#b9b0a1', {roughness: .95}), wicker: mk('#b98a55', {roughness: .95, side: THREE.DoubleSide}), paper: mk('#f6f4ee', {roughness: .9, side: THREE.DoubleSide}),
    flake: mk('#e7b14a', {roughness: .7}), hobGlass: mk('#0a0b0d', {roughness: .1, metalness: .4}), hobRing: mk('#4a1c0a', {emissive: '#ff5a14', emissiveIntensity: 0, roughness: .5}),
    panIn: mk('#23262b', {roughness: .35, metalness: .5, side: THREE.DoubleSide}), canGreen: mk('#3e8e57', {roughness: .45, metalness: .3}), tennis: mk('#ffffff', {map: T.tennis, roughness: .95}),
    column: mk('#f4f3ef', {roughness: .28}), logo: mk('#ffffff', {map: T.logo, roughness: .4}), armBody: mk('#2d3136', {roughness: .4, metalness: .5}), armJoint: mk('#15171a', {roughness: .35, metalness: .55}), rubber: mk('#3a3d42', {roughness: .9}),
    lens: mk('#0a1220', {roughness: .05, metalness: .6}), soilBag: mk('#ffffff', {map: T.soilBag, roughness: .9}),
    greenWall: mk('#4e8b5b', {roughness: 1}), greenWallDark: mk('#3f7449', {roughness: 1}), floor: mk('#8f8a80', {roughness: .95}), labWall: mk('#dfe5ea', {roughness: .95}), labBench: mk('#eef0f2', {roughness: .3}),
    tileWall: mk('#ffffff', {map: T.tile, roughness: .25}), belt: mk('#ffffff', {map: T.belt, roughness: .8}), trayDark: mk('#2b2d31', {roughness: .5}), rice: mk('#fbfaf5', {roughness: .6}), salmon: mk('#e9906f', {roughness: .5}),
    garnish: mk('#68a556', {roughness: .7}), pickle: mk('#e28aa1', {roughness: .6}), tamago: mk('#f4cf5d', {roughness: .6}), mat: mk('#141517', {roughness: .95}), dim: mk('#d9d6cf', {roughness: .8}),
    screen: mk('#12202e', {emissive: '#2a5a8a', emissiveIntensity: .5, roughness: .3}), window: new THREE.MeshBasicMaterial({color: '#eaf6ff'}),
  };
  own.push(M.window);
  const ring = new THREE.MeshBasicMaterial({color: '#FF7E00', transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false}); own.push(ring); M.ring = ring;

  // ---------- helpers ----------
  const grp = (...c) => { const g = new THREE.Group(); c.forEach(x => g.add(x)); return g; };
  function add(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = !mat.transparent; m.receiveShadow = true; parent.add(m); return m;
  }
  const lathe = (pts, s = 32) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), s);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const tube = (pts, r, seg = 24, closed = false) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => V3(...p)), closed), seg, r, 8, closed);
  function roundedRectShape(w, d, r, rl = r, rr = r) {        // XY shape, x = length, y = width; independent end radii
    const s = new THREE.Shape(), hx = w / 2, hy = d / 2;
    s.moveTo(-hx + rl, -hy); s.lineTo(hx - rr, -hy); s.absarc(hx - rr, -hy + rr, rr, -PI / 2, 0, false); s.lineTo(hx, hy - rr); s.absarc(hx - rr, hy - rr, rr, 0, PI / 2, false);
    s.lineTo(-hx + rl, hy); s.absarc(-hx + rl, hy - rl, rl, PI / 2, PI, false); s.lineTo(-hx, -hy + rl); s.absarc(-hx + rl, -hy + rl, rl, PI, PI * 1.5, false); return s;
  }
  function slab(w, d, h, r, mat, x, y, z, parent, rl, rr) {    // rounded slab lying flat, y = bottom
    const g = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r, rl, rr), {depth: h, bevelEnabled: false, curveSegments: 10}); g.rotateX(-PI / 2);
    return add(parent, g, mat, x, y, z);
  }
  const build = {}, env = {};
  const node = (g = .05, top = 0) => { const n = new THREE.Group(); n.userData = {g, top}; return n; };
  const Ly = (pts, mat, n, y = 0) => add(n, lathe(pts), mat, 0, y, 0);
  // ---------- per-object builders: origin = bottom centre on the table; userData.g = grasp height, top = surface for stacking ----------
  build.hob = () => { const n = node(0, .012); add(n, box(.3, .012, .3), M.hobGlass, 0, .006); add(n, tor(.085, .003, PI * 2, 6, 40), M.hobRing, 0, .0125, 0, PI / 2); return n; };
  build.pan = () => { const n = build.hob(); n.userData.top = .03; Ly([[0, .014], [.1, .014], [.12, .05], [.122, .052]], M.panIn, n); add(n, box(.17, .016, .028), M.black, .2, .045, 0, 0, 0, .12); return n; };
  build.batter = () => { const n = node(.13); add(n, cyl(.034, .036, .15), mk('#f6f1e4', {roughness: .3}), 0, .075); add(n, cyl(.031, .031, .09), M.batter, 0, .05); add(n, cyl(.022, .026, .03), mk('#d23b2b'), 0, .165); add(n, cyl(.003, .01, .035), mk('#d23b2b'), 0, .197); n.userData.spout = V3(0, .215, 0); n.userData.pour = 2.2; return n; };
  build.spatula = () => { const n = node(.12); slab(.09, .08, .004, .015, M.steel, 0, 0, 0, n); add(n, box(.012, .06, .01), M.steel, 0, .03, -.045, -.7); add(n, cyl(.011, .011, .11), M.black, 0, .1, -.07, -.25); return n; };
  build.plate = () => { const n = node(.02, .012); Ly([[0, .002], [.08, .002], [.11, .016], [.118, .02]], M.ceramic, n); return n; };
  build.pancake = () => { const n = node(.01); const m = mk('#efd48f', {roughness: .6}); add(n, cyl(.065, .065, .012, 32), m, 0, .006); n.userData.mat = m; return n; };
  build.filter = () => { const n = node(.06); Ly([[.02, 0], [.055, .07], [.057, .072]], M.paper, n); return n; };
  build.dripper = () => { const n = node(.2, .19); Ly([[0, 0], [.05, 0], [.058, .03], [.055, .12], [.045, .125]], M.glass, n); const c = add(n, cyl(.05, .052, .1), M.coffee, 0, .05); c.scale.y = .02; n.userData.fill = c;
    Ly([[.028, .12], [.035, .128], [.066, .195], [.07, .2]], M.ceramic, n); const f = Ly([[.024, .13], [.06, .196]], M.paper, n); f.visible = false; n.userData.filterIn = f; return n; };
  build.kettle = () => { const n = node(.16); Ly([[0, 0], [.07, 0], [.075, .02], [.072, .1], [.05, .13], [.02, .14], [0, .142]], M.black, n); add(n, sph(.012), M.steel, 0, .148);
    add(n, tube([[.065, .03, 0], [.12, .06, 0], [.14, .13, 0], [.19, .15, 0]], .006), M.black, 0, 0); add(n, tube([[-.07, .12, 0], [-.12, .1, 0], [-.11, .03, 0], [-.07, .03, 0]], .01), M.woodDark); n.userData.spout = V3(.19, .15, 0); n.userData.pour = 1.1; return n; };
  build.mug = (col = '#f6f3ec') => { const n = node(.08); Ly([[0, 0], [.04, 0], [.042, .09], [.04, .092]], mk(col, {roughness: .25, side: THREE.DoubleSide}), n); add(n, tor(.025, .007, PI), mk(col), .042, .045, 0, 0, 0, -PI / 2); n.userData.spout = V3(.042, .092, 0); n.userData.pour = 1.5; return n; };
  build.beans = () => { const n = node(); for (let i = 0; i < 26; i++) { const b = add(n, sph(.008, 8, 6), M.coffee, (rnd() - .5) * .07, .006, (rnd() - .5) * .07); b.scale.set(1, .6, .7); } return n; };
  build.pot = () => { const n = node(.13, .11); Ly([[0, 0], [.065, 0], [.09, .12], [.1, .12], [.1, .135], [.088, .135]], M.terracotta, n); const s = add(n, cyl(.087, .087, .01, 32), M.soil.clone(), 0, .11); own.push(s.material); n.userData.soil = s.material; return n; };
  build.plant = (alt) => { const n = node(.07); const k = alt ? .7 : 1; add(n, sph(.04 * k), M.soil, 0, .03 * k); add(n, cyl(.004, .004, .1 * k), M.leafDark, 0, .1 * k);
    for (let i = 0; i < 7; i++) { const a = i * 2.4, l = add(n, sph(.03 * k, 10, 8), i % 2 ? M.leaf : M.leafDark, Math.cos(a) * .04 * k, (.1 + i * .015) * k, Math.sin(a) * .04 * k); l.scale.set(1.4, .25, .7); l.rotation.set(0, -a, .4); } return n; };
  build.trowel = () => { const n = node(.03); add(n, new THREE.CylinderGeometry(.03, .03, .1, 16, 1, true, 0, PI), M.steel, .06, .012, 0, 0, 0, PI / 2).material.side = THREE.DoubleSide; add(n, cyl(.012, .012, .1), M.woodDark, -.05, .012, 0, 0, 0, PI / 2); return n; };
  build.soilBag = () => { const n = node(); add(n, box(.2, .24, .09), M.soilBag, 0, .12); add(n, sph(.07, 12, 8), M.soil, 0, .24).scale.set(1.2, .35, .5); return n; };
  build.basket = () => { const n = node(); Ly([[0, 0], [.1, 0], [.12, .09], [.125, .09]], M.wicker, n); add(n, tor(.12, .006, PI), M.wicker, 0, .09); return n; };
  build.tray = () => { const n = node(.03, .012); add(n, box(.3, .012, .2), M.blue, 0, .006); for (let i = 0; i <= 4; i++) add(n, box(.005, .035, .2), M.blue, -.15 + i * .075, .0175); for (let i = 0; i <= 3; i++) add(n, box(.3, .035, .005), M.blue, 0, .0175, -.1 + i * .0667); return n; };
  build.bearing = (alt) => { const n = node(.015); Ly([[.009, 0], [.022, 0], [.022, .012], [.009, .012], [.009, 0]], alt ? mk('#c8a24a', {metalness: .8, roughness: .3}) : M.steel, n); return n; };
  build.bolt = (alt) => { const n = node(.045); const m = alt ? M.black : M.steel; add(n, cyl(.012, .012, .008, 6), m, 0, .004); add(n, cyl(.006, .006, .04, 12), m, 0, .028); return n; };
  build.partsBin = () => { const n = node(); add(n, box(.16, .05, .12), mk('#6d737a'), 0, .025); for (let i = 0; i < 6; i++) add(n, cyl(.012, .012, .008, 6), M.steel, (rnd() - .5) * .1, .054, (rnd() - .5) * .07); return n; };
  build.wheel = () => { const n = node(.06); add(n, cyl(.027, .027, .032, 28), M.urethane, 0, .027, 0, PI / 2); add(n, cyl(.011, .011, .034, 16), M.nylon, 0, .027, 0, PI / 2); return n; };
  build.skateboard = () => {                                        // deck along x with kicktails + grip tape, trucks, 3 wheels (rear -z wheel missing)
    const n = node(); const D = .082;
    slab(.5, .2, .012, .01, M.deck, 0, D, 0, n); slab(.49, .19, .002, .01, M.gripTape, 0, D + .012, 0, n); add(n, box(.5, .001, .19), M.deckArt, 0, D - .0006, 0);
    for (const s of [-1, 1]) { const t = new THREE.Group(); t.position.set(s * .25, D, 0); t.rotation.z = s * .28; n.add(t); slab(.13, .2, .012, .01, M.deck, s * .06, 0, 0, t, s < 0 ? .1 : .01, s > 0 ? .1 : .01); slab(.125, .19, .002, .01, M.gripTape, s * .06, .012, 0, t, s < 0 ? .095 : .01, s > 0 ? .095 : .01); }
    for (const x of [-.21, .21]) { add(n, box(.06, .012, .05), M.steel, x, D - .006, 0); add(n, cyl(.012, .016, .03), mk('#e8a13a'), x, D - .03, 0); add(n, cyl(.012, .012, .16), M.steel, x, .03, 0, PI / 2); add(n, cyl(.004, .004, .22), M.steelDark, x, .027, 0, PI / 2);
      for (const z of [-.095, .095]) if (!(x > 0 && z < 0)) { const w = build.wheel(); w.position.set(x, 0, z); n.add(w); } }
    n.userData.axleEnd = V3(.21, 0, -.095); return n; };
  build.glass = () => { const n = node(.08); Ly([[0, 0], [.034, 0], [.038, .11], [.039, .112]], M.glass, n); const l = add(n, cyl(.033, .036, 1, 28), M.oj, 0, .5); l.castShadow = false; n.userData.liq = l;
    const p = add(n, cyl(1, 1, .002, 28), M.oj, 0, .001); p.visible = false; n.userData.puddle = p; n.userData.setLevel = (v, sp = 0) => { v = Math.max(.001, Math.min(1, v)); l.scale.y = v * .105; l.position.y = v * .105 / 2 + .002; p.visible = sp > 0; p.scale.set(.04 + sp * .12, 1, .04 + sp * .12); }; n.userData.setLevel(0); return n; };
  build.jug = () => { const n = node(.13); Ly([[0, 0], [.05, 0], [.055, .03], [.05, .16], [.046, .18]], M.glass, n); const l = add(n, cyl(.047, .05, 1, 24), M.oj, 0, .08); l.castShadow = false; add(n, tor(.04, .007, PI), M.glass, -.05, .1, 0, 0, 0, PI / 2);
    n.userData.setLevel = v => { v = Math.max(.01, v); l.scale.y = v * .15; l.position.y = v * .075 + .003; }; n.userData.setLevel(1); n.userData.spout = V3(.05, .18, 0); n.userData.pour = 1.2; return n; };
  build.can = () => { const n = node(.2); add(n, cyl(.06, .065, .13, 28), M.canGreen, 0, .065); add(n, tor(.05, .008, PI), M.canGreen, 0, .13, 0, 0, PI / 2); add(n, tube([[.05, .03, 0], [.13, .1, 0], [.2, .16, 0]], .008), M.canGreen); add(n, cyl(.022, .008, .03), M.canGreen, .2, .165, 0, 0, 0, -1); n.userData.spout = V3(.21, .17, 0); n.userData.pour = .7; return n; };
  build.pottedPlant = () => { const n = build.pot(); const p = build.plant(); p.position.y = .09; p.scale.setScalar(1.5); n.add(p); return n; };
  build.egg = () => { const n = node(.04); add(n, sph(.021, 20, 14), M.eggshell, 0, .028).scale.set(1, 1.33, 1); return n; };
  build.tennis = () => { const n = node(.045); add(n, sph(.033, 28, 18), M.tennis, 0, .033); return n; };
  build.bowl = () => { const n = node(.03, .008); Ly([[0, .004], [.05, .004], [.085, .04], [.092, .062], [.094, .064]], M.ceramic, n); return n; };
  build.carton = () => { const n = node(0, .025); add(n, box(.16, .03, .11), M.eggCarton, 0, .015); for (let i = 0; i < 6; i++) add(n, cyl(.02, .016, .02, 12, true), M.eggCarton, -.053 + (i % 3) * .053, .035, i < 3 ? -.027 : .027); add(n, box(.16, .005, .11), M.eggCarton, 0, .07, -.1, -1.2); return n; };
  build.mess = () => { const n = node(); const s = new THREE.Shape(); for (let i = 0; i <= 18; i++) { const a = i / 18 * PI * 2, r = .045 * (.7 + rnd() * .5); i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    const g = new THREE.ShapeGeometry(s); g.rotateX(-PI / 2); add(n, g, M.eggwhite, 0, .002); add(n, sph(.014, 16, 10, 0), M.yolk, .005, .003).scale.y = .45;
    for (let i = 0; i < 4; i++) add(n, new THREE.SphereGeometry(.02, 8, 6, 0, 1.4, 0, 1.2), M.eggshell, (rnd() - .5) * .1, .004, (rnd() - .5) * .08, rnd() * 3, rnd() * 3, 0).material.side = THREE.DoubleSide; return n; };
  build.block = alt => { const n = node(.045); add(n, box(alt ? .065 : .05, alt ? .06 : .05, alt ? .065 : .05), alt ? M.cardboard : M.woodLight, 0, alt ? .03 : .025); return n; };
  build.lbowl = alt => { const n = node(.04, .008); Ly([[0, .003], [.06, .003], [.085, .05], [.088, .052]], alt ? M.wicker : M.ceramic, n); return n; };
  build.lmug = alt => alt ? (() => { const n = node(.08); Ly([[0, 0], [.032, 0], [.042, .1], [.043, .1]], M.paper, n); return n; })() : build.mug('#3d6fb6');
  build.coaster = alt => { const n = node(.01, .007); if (alt) add(n, box(.13, .012, .1), M.black, 0, .006); else add(n, cyl(.048, .048, .006, 28), M.cardboard, 0, .003); return n; };
  build.riser = () => { const n = node(0, .15); add(n, box(.12, .15, .12), M.white, 0, .075); return n; };
  // seen tasks
  build.rack = () => { const n = node(); add(n, box(.24, .008, .07), M.blue, 0, .07); add(n, box(.24, .008, .07), M.blue, 0, .005); for (const s of [-1, 1]) add(n, box(.008, .075, .07), M.blue, s * .12, .037);
    for (let i = 0; i < 6; i++) { const x = -.1 + i * .04; add(n, cyl(.008, .008, .1, 12, true), M.glass, x, .06); if (i % 2 === 0) add(n, cyl(.007, .007, .05, 12), M.yellowLiq, x, .036); } return n; };
  build.beaker = () => { const n = node(.08); Ly([[0, 0], [.04, 0], [.04, .1], [.046, .104]], M.glass, n); add(n, cyl(.038, .038, .06, 24), M.yellowLiq, 0, .031); return n; };
  build.orangeCup = () => { const n = node(.07); Ly([[0, 0], [.03, 0], [.038, .085], [.039, .086]], M.orangePl, n); return n; };
  build.forearm = () => { const n = node(); const cap = (a, b, r, m) => { const d = V3(...b).sub(V3(...a)), g = new THREE.CapsuleGeometry(r, d.length(), 6, 16), me = add(n, g, m); me.position.copy(V3(...a).add(V3(...b)).multiplyScalar(.5)); me.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); return me; };
    cap([-.3, .045, .03], [0, .042, 0], .042, M.skin); cap([-.3, .045, .03], [-.14, .045, .02], .047, M.sleeve); cap([0, .042, 0], [.24, .032, -.07], .031, M.skin);
    add(n, sph(.04, 16, 12), M.skin, .29, .025, -.085).scale.set(1.3, .5, 1); for (let i = 0; i < 4; i++) cap([.32, .022, -.11 + i * .016], [.37, .012, -.12 + i * .02], .008, M.skinShade); n.userData.elbow = V3(-.005, .085, .005); return n; };
  build.bandaid = () => { const n = node(.012); add(n, new THREE.CapsuleGeometry(.011, .05, 4, 12), M.bandaid, 0, .002, 0, 0, 0, PI / 2).scale.set(1, 1, .15); add(n, box(.022, .002, .016), M.pad, 0, .003); return n; };
  build.backpack = () => { const n = node(.36); const b = add(n, new THREE.CapsuleGeometry(.12, .12, 6, 16), M.navy, 0, .18); b.scale.set(1, 1, .55); add(n, box(.18, .14, .05), M.navyDark, 0, .12, .06);
    add(n, box(.16, .006, .006), M.zipOrange, 0, .19, .086); add(n, tor(.035, .008, PI), M.black, 0, .35, 0); for (const s of [-1, 1]) add(n, tube([[s * .06, .3, -.06], [s * .08, .2, -.1], [s * .07, .06, -.07]], .012), M.black); return n; };
  build.gift = () => { const n = node(.12); add(n, box(.18, .1, .14), M.gift, 0, .05); add(n, box(.19, .02, .15), M.gift, 0, .1); add(n, box(.026, .122, .152), M.ribbon, 0, .055); add(n, box(.192, .122, .026), M.ribbon, 0, .055);
    for (const s of [-1, 1]) add(n, tor(.025, .007, PI * 2, 8, 20), M.ribbon, s * .025, .125, 0, 0, 0, s * .6).scale.set(1, .6, 1); add(n, sph(.012), M.ribbon, 0, .118); n.userData.knot = V3(0, .12, 0); return n; };
  build.syringe = () => { const n = node(.08); add(n, cyl(.01, .01, .09, 16), M.glass, 0, .065); add(n, cyl(.004, .004, .03), M.steel, 0, .005); const p = add(n, cyl(.0035, .0035, .09), M.white, 0, .12); add(n, cyl(.014, .014, .003), M.white, 0, .165).parent = p; n.userData.plunger = p; add(n, cyl(.018, .018, .004), M.white, 0, .11); return n; };
  build.stand = () => { const n = node(); add(n, box(.14, .02, .12), M.white, 0, .01); add(n, box(.02, .16, .02), M.white, -.05, .09); add(n, box(.07, .015, .02), M.white, -.02, .16); add(n, tor(.014, .004), M.white, .015, .16, 0, PI / 2); return n; };
  build.clips = pts => { const n = node(); for (const [x, z] of pts) { add(n, box(.03, .008, .02), M.clip, x, .004, z); add(n, tor(.01, .003, PI), M.clip, x, .008, z, 0, PI / 2); } return n; };
  build.flakes = () => { const n = build.bowl(); for (let i = 0; i < 40; i++) { const a = rnd() * 7, r = rnd() * .05; add(n, cyl(.007, .007, .0015, 7), M.flake, Math.cos(a) * r, .012 + rnd() * .02, Math.sin(a) * r, rnd() * 2, 0, rnd() * 2); } return n; };
  build.cerealBox = () => { const n = node(); add(n, box(.14, .22, .05), mk('#e8b026'), 0, .11); add(n, box(.1, .06, .052), mk('#d8332b'), 0, .16); return n; };
  // kitchen
  build.bento = (comp = 0) => { const n = node(0, .012); add(n, box(.2, .012, .14), M.trayDark, 0, .006); for (const s of [-1, 1]) { add(n, box(.2, .03, .005), M.trayDark, 0, .02, s * .07); add(n, box(.005, .03, .14), M.trayDark, s * .1, .02); }
    add(n, box(.004, .028, .14), M.trayDark, 0, .02); add(n, box(.2, .028, .004), M.trayDark, 0, .02); const fills = [M.rice, M.tamago, M.garnish, M.pickle];
    for (let i = 0; i < 4; i++) if (i !== comp) { const f = add(n, sph(.028, 12, 8), fills[i], (i % 2 ? .05 : -.05), .02, (i > 1 ? .035 : -.035)); f.scale.set(1.3, .45, .9); } return n; };
  build.item = kind => { const n = node(.03); if (kind === 0) { for (let i = 0; i < 4; i++) add(n, sph(.009, 10, 8), M.garnish, (i - 1.5) * .008, .01 + (i % 2) * .006, 0); }
    else if (kind === 1) { const s = new THREE.Shape(); s.moveTo(-.022, 0); s.lineTo(.022, 0); s.lineTo(0, .035); s.closePath(); const g = new THREE.ExtrudeGeometry(s, {depth: .018, bevelEnabled: true, bevelSize: .006, bevelThickness: .006, bevelSegments: 3}); g.translate(0, .006, -.009); add(n, g, M.rice); add(n, box(.02, .018, .032), M.black, 0, .012); }
    else { add(n, box(.045, .014, .028), M.salmon, 0, .007); add(n, box(.046, .002, .004), M.rice, 0, .0145); } return n; };
  build.hotelPan = kind => { const n = node(0, .01); add(n, box(.18, .01, .13), M.stainless, 0, .005); for (const s of [-1, 1]) { add(n, box(.18, .05, .004), M.stainless, 0, .025, s * .065); add(n, box(.004, .05, .13), M.stainless, s * .09, .025); }
    for (let i = 0; i < 5; i++) { const it = build.item(kind); it.position.set(-.06 + (i % 3) * .06, .01, i < 3 ? -.03 : .03); n.add(it); } return n; };
  build.conveyor = () => { const n = node(); add(n, box(1.7, .02, .22), M.belt, 0, .01); for (const s of [-1, 1]) add(n, box(1.7, .035, .012), M.stainless, 0, .017, s * .116); return n; };

  // ---------- environments: wall + table + extras. Table top is y = 0 ----------
  function table(w, d, top, legs) { const g = new THREE.Group(); add(g, box(w, .04, d), top, 0, -.02, 0); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(g, box(.05, .71, .05), legs, x * (w / 2 - .05), -.395, z * (d / 2 - .05)); return g; }
  env.green = () => { const g = new THREE.Group(); add(g, box(6, 3, .05), M.greenWall, 0, .7, -1.05); add(g, new THREE.PlaneGeometry(8, 8), M.floor, 0, -.75, 0, -PI / 2); g.add(table(1.7, 1.1, M.wood, M.woodDark)); return g; };
  env.lab = () => { const g = new THREE.Group(); add(g, box(7, 3, .05), M.labWall, 0, .7, -2.1); add(g, new THREE.PlaneGeometry(9, 9), M.floor, 0, -.75, 0, -PI / 2); g.add(table(1.7, 1.1, M.labBench, M.steelDark));
    for (const x of [-1.5, 1.4]) { const d = table(1.4, .7, M.labBench, M.steelDark); d.position.set(x, 0, -1.55); g.add(d); add(g, box(.5, .3, .03), M.screen, x, .3, -1.7); add(g, box(.04, .15, .04), M.black, x, .07, -1.72); }
    for (let i = 0; i < 6; i++) add(g, cyl(.03, .03, .16), [M.blue, M.orangePl, M.glass, M.yellowLiq][i % 4], -.4 + i * .16, .08, -1.6); add(g, box(1.6, .9, .02), M.window, .1, 1.1, -2.07); return g; };
  env.kitchen = () => { const g = new THREE.Group(); add(g, box(7, 3, .05), M.tileWall, 0, .7, -1.05); add(g, new THREE.PlaneGeometry(9, 9), mk('#6f767b', {roughness: .7}), 0, -.75, 0, -PI / 2);
    g.add(table(1.9, 1.1, M.stainless, M.stainless)); add(g, box(1.9, .6, .02), M.stainless, 0, -.4, .54); add(g, box(2.4, .35, .7), M.stainless, 0, 1.55, -.7); add(g, box(2, .02, .3), M.stainless, 0, .95, -.9);
    for (let i = 0; i < 4; i++) add(g, box(.3, .08, .2), M.steelDark, -.75 + i * .5, 1.0, -.9); return g; };
  // ---------- S1 rig: white column with head camera mast, shoulder plates ----------
  build.rig = () => { const g = new THREE.Group(); add(g, box(.34, .02, .26), M.column, 0, .01, -.5); add(g, box(.15, 1.0, .13), M.column, 0, .5, -.5); add(g, box(.1, .05, .002), M.logo, 0, .72, -.434);
    for (const s of [-1, 1]) add(g, cyl(.06, .06, .03, 24), M.column, s * .08, .46, -.5, 0, 0, -s * PI / 4);
    add(g, cyl(.012, .012, .14), M.steelDark, 0, 1.07, -.5); add(g, box(.16, .05, .06), M.black, 0, 1.16, -.49); for (const s of [-1, 1]) add(g, cyl(.012, .012, .01, 16), M.lens, s * .045, 1.16, -.457, PI / 2); return g; };
  build.gripper = () => { const g = new THREE.Group(); add(g, cyl(.035, .035, .03, 20), M.armJoint, 0, 0, .015, PI / 2); add(g, box(.1, .03, .05), M.armBody, 0, 0, .045);
    const f = [-1, 1].map(s => { const p = new THREE.Group(); g.add(p); add(p, box(.012, .02, .06), M.armJoint, 0, 0, .09); add(p, box(.012, .02, .02), M.rubber, 0, 0, .115); return p; }); g.userData.set = open => { f[0].position.x = -.012 - open * .03; f[1].position.x = .012 + open * .03; }; g.userData.set(1); return g; };

  function disposeTree(o) { o.traverse(x => { x.geometry?.dispose?.(); }); }
  return {M, T, build, env, disposeTree, add, box, cyl, dispose() { own.forEach(x => x.dispose?.()); }};
}
