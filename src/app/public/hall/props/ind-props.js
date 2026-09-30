// Shared 3D props for the industrial / warehouse / soccer TRY stands (reindustrial, zebra, self-play).
// A stand hosts a three.js WebGLRenderer under the kit's 2D overlay canvas (like hw-real.js), uses the real MuJoCo
// Menagerie robots from hall/mj.js where the video robot matches (UR5e, Unitree G1) and procedural props elsewhere.
// Everything created here is plain three.js and is released with disposeTree() / stage.dispose().
import * as THREE from '../../vendor/three.module.js';
export {THREE};

// ---------- stage: WebGL canvas under the 2D overlay, camera with orbit + view offset ----------
export function stage(k, {bg = '#202328', fov = 40, near = .02, far = 300, shadow = 2048} = {}) {
  const wrap = k.canvas.parentElement;
  const gl = document.createElement('canvas'); gl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  wrap.prepend(gl); k.canvas.style.position = 'relative'; k.canvas.style.zIndex = 1;
  const renderer = new THREE.WebGLRenderer({canvas: gl, antialias: true});
  renderer.setPixelRatio(Math.min(2, globalThis.devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(bg);
  const cam = new THREE.PerspectiveCamera(fov, 1, near, far);
  const orbit = {target: new THREE.Vector3(), yaw: 0, pitch: .6, dist: 3, minD: .3, maxD: 80, minP: .08, maxP: 1.52};
  let W = 0, H = 0;
  const S = {renderer, scene, cam, orbit, gl, shadow,
    // render with the orbit camera; (fx, fy) = screen point (CSS px) where the orbit target should appear
    render(fx = k.w / 2, fy = k.h / 2) {
      const w = Math.round(k.w), h = Math.round(k.h);
      if (w !== W || h !== H) { W = w; H = h; renderer.setSize(w, h, false); }
      cam.aspect = w / h; cam.setViewOffset(w, h, Math.round(w / 2 - fx), Math.round(h / 2 - fy), w, h);
      const c = Math.cos(orbit.pitch), t = orbit.target;
      cam.position.set(t.x + Math.sin(orbit.yaw) * orbit.dist * c, t.y + Math.sin(orbit.pitch) * orbit.dist, t.z + Math.cos(orbit.yaw) * orbit.dist * c);
      cam.lookAt(t); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
      renderer.render(scene, cam);
    },
    drag(dx, dy) { orbit.yaw -= dx * .006; orbit.pitch = Math.max(orbit.minP, Math.min(orbit.maxP, orbit.pitch + dy * .005)); },
    zoom(dy) { orbit.dist = Math.max(orbit.minD, Math.min(orbit.maxD, orbit.dist * (1 + dy * .001))); },
    // pointer (CSS px) → point on the horizontal plane y = h
    rayPlane(p, h = 0) {
      if (!W || !H) return null;
      ndc.set(p.x / W * 2 - 1, -(p.y / H) * 2 + 1); ray.setFromCamera(ndc, cam);
      plane.set(UP, -h); return ray.ray.intersectPlane(plane, new THREE.Vector3());
    },
    // world point → screen (CSS px); z > 1 means behind the camera
    project(v, out = {x: 0, y: 0, ok: true}) { tmpV.copy(v).project(cam); out.x = (tmpV.x + 1) / 2 * W; out.y = (1 - tmpV.y) / 2 * H; out.ok = tmpV.z < 1; return out; },
    dispose() { disposeTree(scene); renderer.dispose(); renderer.forceContextLoss?.(); gl.remove?.(); },
  };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(), UP = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3();
  // the 2D overlay keeps pointer events; stands forward "empty space" drags to S.drag and wheel to S.zoom
  const onWheel = e => { e.preventDefault(); S.zoom(e.deltaY); };
  k.canvas.addEventListener('wheel', onWheel, {passive: false});
  const dispose0 = S.dispose; S.dispose = () => { k.canvas.removeEventListener('wheel', onWheel); dispose0(); };
  return S;
}

export function lights(scene, {hemi = ['#ffffff', '#5a5650', 1.1], sun = ['#ffffff', 1.7], at = [2, 5, 3], box = 3, size = 2048} = {}) {
  const h = new THREE.HemisphereLight(hemi[0], hemi[1], hemi[2]);
  const s = new THREE.DirectionalLight(sun[0], sun[1]); s.position.set(...at); s.castShadow = true; s.shadow.mapSize.set(size, size);
  Object.assign(s.shadow.camera, {left: -box, right: box, top: box, bottom: -box, near: .1, far: 60}); s.shadow.bias = -.0004; s.shadow.normalBias = .01;
  scene.add(h, s, s.target); return {hemi: h, sun: s};
}

export function disposeTree(root) {
  const seen = new Set();
  root.traverse(o => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) { if (seen.has(m)) continue; seen.add(m); for (const key of ['map', 'emissiveMap', 'roughnessMap', 'normalMap', 'alphaMap']) if (m[key] && !seen.has(m[key])) { seen.add(m[key]); m[key].dispose(); } m.dispose(); }
    if (o.isInstancedMesh) o.dispose?.();
  });
}

// ---------- tiny builders ----------
export const std = (color, o = {}) => new THREE.MeshStandardMaterial({color, roughness: o.r ?? .6, metalness: o.m ?? 0, emissive: o.e || '#000000', emissiveIntensity: o.ei ?? 1, transparent: o.opacity != null, opacity: o.opacity ?? 1, map: o.map || null, side: o.side ?? THREE.FrontSide, depthWrite: o.depthWrite ?? true});
export function box(w, h, d, mat, x = 0, y = 0, z = 0, parent = null, shadow = true) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = shadow; if (parent) parent.add(m); return m; }
export function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, parent = null, seg = 20) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; if (parent) parent.add(m); return m; }
export function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const c = cv.getContext('2d'); draw(c, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// instanced boxes: list of [x, y, z, sx, sy, sz, rotY?, color?]
export function boxes(list, mat, parent, {shadow = true} = {}) {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, Math.max(1, list.length)); const o = new THREE.Object3D(), c = new THREE.Color();
  list.forEach((b, i) => { o.position.set(b[0], b[1], b[2]); o.scale.set(b[3], b[4], b[5]); o.rotation.set(0, b[6] || 0, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); if (b[7]) im.setColorAt(i, c.set(b[7])); });
  im.count = list.length; im.castShadow = shadow; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; parent.add(im); return im;
}

// ---------- Universal Robots UR5e: standard DH kinematics + analytic inverse kinematics ----------
export const UR = {d1: .1625, a2: -.425, a3: -.3922, d4: .1333, d5: .0997, d6: .0996};
const DHP = [[UR.d1, 0, Math.PI / 2], [0, UR.a2, 0], [0, UR.a3, 0], [UR.d4, 0, Math.PI / 2], [UR.d5, 0, -Math.PI / 2], [UR.d6, 0, 0]];
function dh(th, d, a, al) { const c = Math.cos(th), s = Math.sin(th), ca = Math.cos(al), sa = Math.sin(al); return [c, -s * ca, s * sa, a * c, s, c * ca, -c * sa, a * s, 0, sa, ca, d, 0, 0, 0, 1]; }
function mul4(A, B) { const C = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let v = 0; for (let q = 0; q < 4; q++) v += A[i * 4 + q] * B[q * 4 + j]; C[i * 4 + j] = v; } return C; }
function inv4(M) { const t = [M[3], M[7], M[11]]; return [M[0], M[4], M[8], -(M[0] * t[0] + M[4] * t[1] + M[8] * t[2]), M[1], M[5], M[9], -(M[1] * t[0] + M[5] * t[1] + M[9] * t[2]), M[2], M[6], M[10], -(M[2] * t[0] + M[6] * t[1] + M[10] * t[2]), 0, 0, 0, 1]; }
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
export function urFK(q) { let T = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; for (let i = 0; i < 6; i++) T = mul4(T, dh(q[i], ...DHP[i])); return T; }
// T: flange pose (row-major 4×4) in the UR base frame. Returns up to 8 joint solutions.
export function urIK(T) {
  const {a2, a3, d4, d6} = UR, out = [], r = (i, j) => T[i * 4 + j];
  const p5x = r(0, 3) - d6 * r(0, 2), p5y = r(1, 3) - d6 * r(1, 2), R = Math.hypot(p5x, p5y);
  if (R < Math.abs(d4) + 1e-9) return out;
  const phi = Math.atan2(p5y, p5x), psi = Math.acos(d4 / R);
  for (const sg1 of [1, -1]) {
    const t1 = phi + sg1 * psi + Math.PI / 2, c1 = Math.cos(t1), s1 = Math.sin(t1);
    const c5 = (r(0, 3) * s1 - r(1, 3) * c1 - d4) / d6; if (Math.abs(c5) > 1 + 1e-9) continue;
    for (const sg5 of [1, -1]) {
      const t5 = sg5 * Math.acos(Math.max(-1, Math.min(1, c5))), s5 = Math.sin(t5);
      const t6 = Math.abs(s5) < 1e-7 ? 0 : Math.atan2((-r(0, 1) * s1 + r(1, 1) * c1) / s5, (r(0, 0) * s1 - r(1, 0) * c1) / s5);
      const T14 = mul4(mul4(inv4(dh(t1, ...DHP[0])), T), inv4(mul4(dh(t5, ...DHP[4]), dh(t6, ...DHP[5]))));
      const px = T14[3], py = T14[7], L = Math.hypot(px, py), c3 = (L * L - a2 * a2 - a3 * a3) / (2 * a2 * a3);
      if (Math.abs(c3) > 1 + 1e-9) continue;
      for (const sg3 of [1, -1]) {
        const t3 = sg3 * Math.acos(Math.max(-1, Math.min(1, c3)));
        const t2 = Math.atan2(py, px) - Math.atan2(a3 * Math.sin(t3), a2 + a3 * Math.cos(t3));
        const T34 = mul4(inv4(mul4(dh(t2, ...DHP[1]), dh(t3, ...DHP[2]))), T14);
        out.push([t1, t2, t3, Math.atan2(T34[4], T34[0]), t5, t6].map(wrapA));
      }
    }
  }
  return out;
}
export const UR_JOINTS = ['shoulder_pan_joint', 'shoulder_lift_joint', 'elbow_joint', 'wrist_1_joint', 'wrist_2_joint', 'wrist_3_joint'];
export const UR_READY = [0, -1.9, 1.9, -1.57, -1.57, 0];
const _inv = new THREE.Matrix4(), _p = new THREE.Vector3();
// Tool pointing straight down, tool tip at `tipWorld` (three.js world coords). The tool is `toolLen` long along the
// flange z axis. Picks the elbow-up, wrist-down solution closest to `prev` (continuous joints). Returns q or null.
export function urSolve(bot, tipWorld, toolLen, prev = UR_READY, yawOff = Math.PI) {
  const inner = bot.group.children[0]; inner.updateWorldMatrix(true, false); _inv.copy(inner.matrixWorld).invert();
  _p.copy(tipWorld).applyMatrix4(_inv);           // model (z-up) frame of the UR base
  for (let tries = 0; tries < 8; tries++) {
    const px = _p.x, py = _p.y, pz = _p.z + toolLen, ps = Math.atan2(py, px) + yawOff, c = Math.cos(ps), s = Math.sin(ps);
    // columns: x6 = (c, s, 0), y6 = z6 × x6 = (s, -c, 0), z6 = (0, 0, -1)
    const sols = urIK([c, s, 0, px, s, -c, 0, py, 0, 0, -1, pz, 0, 0, 0, 1]);
    let best = null, bs = Infinity;
    for (const q of sols) {
      const u = q.map((v, i) => i === 2 ? v : prev[i] + wrapA(v - prev[i]));
      let sc = 0; for (let i = 0; i < 6; i++) sc += (u[i] - prev[i]) ** 2 * (i === 5 ? .2 : 1);
      if (u[2] < 0) sc += 40; if (q[1] > .2 || q[1] < -Math.PI - .2) sc += 40; if (q[4] > 0) sc += 25;
      if (sc < bs) { bs = sc; best = u; }
    }
    if (best) return best;
    const h = Math.hypot(_p.x, _p.y) || 1, sh = Math.max(.2, h * .94) / h; _p.x *= sh; _p.y *= sh; // out of reach: pull in
  }
  return null;
}
export function setUR(bot, q) { UR_JOINTS.forEach((n, i) => bot.set(n, q[i])); bot.kinematics(); }
// UR5e as in the videos: silver links, black joint caps
export function styleUR(bot, {link = '#c9cdd1', cap = '#202328', joint = '#8c9298', black = '#141619'} = {}) {
  const done = new Set();
  for (const mesh of bot.meshes) {
    const m = mesh.material; if (done.has(m)) continue; done.add(m);
    const c = m.color, lum = (c.r + c.g + c.b) / 3;
    if (c.b > c.r + .12) { m.color.set(cap); m.roughness = .35; m.metalness = .3; }
    else if (lum > .55) { m.color.set(link); m.roughness = .32; m.metalness = .55; }
    else if (lum > .15) { m.color.set(joint); m.roughness = .4; m.metalness = .4; }
    else { m.color.set(black); m.roughness = .45; }
  }
}
// an Object3D that follows a MuJoCo site or body frame (added under the bot's z-up inner group). Call .sync() after kinematics.
export function follower(bot, {site = null, body = null} = {}) {
  const inner = bot.group.children[0], o = new THREE.Group(); o.matrixAutoUpdate = false; inner.add(o);
  const names = new TextDecoder().decode(bot.model.names || new Uint8Array());
  const find = (n, adr, count) => { for (let i = 0; i < count; i++) { const a = adr[i]; if (names.slice(a, names.indexOf('\0', a)) === n) return i; } return -1; };
  const sid = site ? find(site, bot.model.name_siteadr, bot.model.nsite) : -1, bid = body ? find(body, bot.model.name_bodyadr, bot.model.nbody) : -1;
  o.sync = () => {
    const d = bot.data, xp = sid >= 0 ? d.site_xpos : d.xpos, xm = sid >= 0 ? d.site_xmat : d.xmat, i = sid >= 0 ? sid : bid; if (i < 0) return;
    const p = i * 3, q = i * 9;
    o.matrix.set(xm[q], xm[q + 1], xm[q + 2], xp[p], xm[q + 3], xm[q + 4], xm[q + 5], xp[p + 1], xm[q + 6], xm[q + 7], xm[q + 8], xp[p + 2], 0, 0, 0, 1);
    o.matrixWorldNeedsUpdate = true;
  };
  o.sync(); return o;
}

// ---------- screwdriver end-effector (tool frame: +z out of the flange) ----------
export const TOOL_LEN = .168;
export function screwTool() {
  const g = new THREE.Group(), black = std('#17191c', {r: .45, m: .2}), alu = std('#b8bec4', {r: .3, m: .75}), steel = std('#d9dde0', {r: .22, m: .9});
  const Z = (m, z) => { m.rotation.x = Math.PI / 2; m.position.z = z; g.add(m); return m; };
  Z(cyl(.034, .034, .012, alu), .006);                                       // ISO flange adapter
  Z(cyl(.027, .027, .085, black), .054);                                     // nutrunner motor
  Z(cyl(.02, .024, .018, alu), .105);                                        // torque transducer collar
  Z(cyl(.011, .016, .02, black), .124);                                      // nose
  const bitG = new THREE.Group(); bitG.position.z = .134; g.add(bitG);
  const bit = new THREE.Mesh(new THREE.CylinderGeometry(.0028, .0028, .034, 6), steel); bit.rotation.x = Math.PI / 2; bit.position.z = .017; bit.castShadow = true; bitG.add(bit);
  const tipM = new THREE.Mesh(new THREE.ConeGeometry(.0028, .004, 6), steel); tipM.rotation.x = -Math.PI / 2; tipM.position.z = .032; bitG.add(tipM);
  // small side gripper for busbar / block / modules
  const fingers = [-1, 1].map(s => { const f = box(.006, .012, .05, alu, s * .03, 0, .12); g.add(f); return f; });
  const carried = screwMesh(); carried.rotation.x = -Math.PI / 2; carried.position.z = TOOL_LEN + .0005; carried.visible = false; g.add(carried);
  const T = {group: g, bit: bitG, fingers, carried, len: TOOL_LEN,
    spin(a) { bitG.rotation.z = a; carried.rotation.y = a; },
    grip(open, reach = 0) { fingers.forEach((f, i) => { f.position.x = (i ? 1 : -1) * (.012 + .02 * open); f.position.z = .12 + reach * .042; }); },
  };
  T.grip(1); return T;
}
// M4-ish screw: head + shank; local +y = screw axis (head on top)
export function screwMesh() {
  const g = new THREE.Group(), steel = std('#c3c8cc', {r: .25, m: .9}), dark = std('#2a2e33', {r: .5});
  const head = cyl(.0048, .0048, .0028, steel, 0, .0014, 0, g, 16); head.castShadow = false;
  box(.0068, .0008, .0012, dark, 0, .0029, 0, g, false); box(.0012, .0008, .0068, dark, 0, .0029, 0, g, false);
  const sh = cyl(.002, .002, .008, steel, 0, -.004, 0, g, 8); sh.castShadow = false;
  return g;
}

// ---------- factory cell: black workbench, floor, backdrop ----------
export function factoryRoom(parent, {floorY = -.9} = {}) {
  const g = new THREE.Group(); parent.add(g);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), std('#6d7176', {r: .85})); floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; floor.receiveShadow = true; g.add(floor);
  const tape = std('#e3b616', {r: .7});
  for (const [x, z, w, d] of [[0, -1.35, 3.4, .06], [0, 1.35, 3.4, .06], [-1.7, 0, .06, 2.76], [1.7, 0, .06, 2.76]]) box(w, .004, d, tape, x, floorY + .002, z, g, false);
  const wall = std('#2b2f35', {r: .9}); box(14, 5, .1, wall, 0, floorY + 2.5, -4, g, false);
  const panel = std('#353a41', {r: .8}); for (let i = -3; i <= 3; i++) box(1.8, 2.2, .02, panel, i * 2, floorY + 1.6, -3.94, g, false);
  const lamp = std('#ffffff', {e: '#ffffff', ei: 1.4}); for (const x of [-1.2, 1.2]) box(1.6, .03, .14, lamp, x, 1.55, -.4, g, false);
  const frame = std('#9aa1a8', {r: .4, m: .6}); for (const x of [-2.2, 2.2]) box(.08, 2.6, .08, frame, x, floorY + 1.3, -1.8, g);
  box(4.48, .08, .08, frame, 0, floorY + 2.6, -1.8, g);
  return g;
}
export function workbench(parent, {w = 1.7, d = 1.0, h = .9, top = '#141518'} = {}) {
  const g = new THREE.Group(); parent.add(g);
  box(w, .04, d, std(top, {r: .55, m: .1}), 0, -.02, 0, g);
  const alu = std('#a9afb5', {r: .35, m: .7});
  for (const [x, z] of [[-w / 2 + .05, -d / 2 + .05], [w / 2 - .05, -d / 2 + .05], [-w / 2 + .05, d / 2 - .05], [w / 2 - .05, d / 2 - .05]]) box(.05, h - .04, .05, alu, x, -h / 2 - .02, z, g);
  box(w - .1, .05, .05, alu, 0, -.08, d / 2 - .05, g); box(w - .1, .05, .05, alu, 0, -.08, -d / 2 + .05, g);
  box(w - .1, .03, d - .1, std('#2a2d31', {r: .8}), 0, -h + .16, 0, g);
  return g;
}

// ---------- NVIDIA GB300-style compute tray (stylized): chassis, 2 boards, cold plates, connectors, screw bosses ----------
export const TRAY = {U: .3, HOLE_Y: .02, PCB_Y: .016};
function pcbTexture() {
  return canvasTex(512, 480, (c, w, h) => {
    c.fillStyle = '#4c6656'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(190,220,200,.16)'; c.lineWidth = 2;
    for (let i = 0; i < 70; i++) { const y = 8 + i * 6.7; c.beginPath(); c.moveTo(10, y); c.lineTo(w * (.3 + (i * 37 % 50) / 100), y); c.lineTo(w * (.3 + (i * 37 % 50) / 100) + 12, y + 12); c.lineTo(w - 10, y + 12); c.stroke(); }
    c.fillStyle = 'rgba(215,190,120,.55)'; for (let i = 0; i < 180; i++) c.fillRect((i * 97) % w, (i * 53) % h, 4, 3);
    c.fillStyle = 'rgba(245,245,240,.6)'; c.font = '600 18px monospace'; c.fillText('SKU GB300 · REV A · STYLIZED', 16, h - 14);
  });
}
export function gb300Tray(holes, {label = 'GB300 COMPUTE TRAY'} = {}) {
  const U = TRAY.U, g = new THREE.Group();
  const sheet = std('#b9bec3', {r: .35, m: .65}), wallM = std('#a3a9ae', {r: .4, m: .6}), conn = std('#1d2126', {r: .5}), pin = std('#c9a54a', {r: .3, m: .8});
  const plate = std('#aab2b9', {r: .25, m: .85}), die = std('#8e979f', {r: .3, m: .8}), hose = std('#131417', {r: .6}), qd = std('#3a6fb5', {r: .4, m: .3}), qdR = std('#b53a3a', {r: .4, m: .3});
  box(.6, .008, .3, sheet, 0, .004, 0, g);                                                              // chassis pan
  for (const [x, z, w, d] of [[0, -.149, .6, .003], [0, .149, .6, .003], [-.299, 0, .003, .3], [.299, 0, .003, .3]]) box(w, .026, d, wallM, x, .013, z, g);
  const lip = canvasTex(512, 32, (c, w, h) => { c.fillStyle = '#a3a9ae'; c.fillRect(0, 0, w, h); c.fillStyle = '#23272c'; c.font = '600 20px monospace'; c.fillText(label + ' · STYLIZED', 10, 23); });
  const lipM = new THREE.Mesh(new THREE.PlaneGeometry(.3, .018), new THREE.MeshStandardMaterial({map: lip, roughness: .5})); lipM.position.set(-.13, .013, .1508); g.add(lipM);
  for (const z of [-.081, -.027, .027, .081]) { box(.024, .02, .04, conn, -.286, .018, z, g); box(.004, .012, .03, pin, -.299, .018, z, g, false); }   // front I/O cages
  for (const z of [-.066, 0, .066]) { box(.024, .022, .055, conn, .286, .019, z, g); for (let i = -2; i <= 2; i++) box(.003, .014, .004, pin, .299, .019, z + i * .009, g, false); } // rear NVLink
  const pcbMat = new THREE.MeshStandardMaterial({map: pcbTexture(), roughness: .6, metalness: .1});
  for (const c0 of [-.5, .5]) {
    const cx = c0 * U; box(.24, .003, .222, pcbMat, cx, .0115, 0, g);
    for (const gx of [c0 - .155, c0 + .155]) { box(.078, .012, .081, plate, gx * U, .019, -.0195, g); box(.045, .004, .042, die, gx * U, .027, -.0195, g); box(.028, .002, .03, std('#76c043', {r: .5}), gx * U, .0295, -.0195, g, false); }
    box(.066, .01, .033, plate, cx, .018, .051, g); box(.036, .003, .018, die, cx, .0245, .051, g);
    // liquid-cooling loop between the plates (black hoses with blue / red quick disconnects)
    const pts = [[c0 - .155, -.02], [c0 - .155, .1], [c0, .1], [c0 + .155, .1], [c0 + .155, -.02]].map(([x, z]) => new THREE.Vector3(x * U, .03, z * U));
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, .0045, 8), hose); tube.castShadow = true; g.add(tube);
    cyl(.007, .007, .012, qd, (c0 + .3) * U, .026, -.12 * U, g); cyl(.007, .007, .012, qdR, (c0 + .3) * U, .026, -.05 * U, g);
    const h2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3((c0 + .155) * U, .03, -.1 * U), new THREE.Vector3((c0 + .3) * U, .034, -.12 * U), new THREE.Vector3(.27, .03, -.08)]), 20, .004, 8), hose); g.add(h2);
  }
  // screw bosses: chrome ring + dark hole at every screw position (tray-local units → m)
  const ring = std('#dfe3e6', {r: .25, m: .9}), holeM = std('#0e1012', {r: .8});
  const H = holes.map(h => {
    const x = h.x * U, z = h.y * U, b = cyl(.0062, .0062, TRAY.HOLE_Y - .008, ring, x, .008 + (TRAY.HOLE_Y - .008) / 2, z, g, 16);
    cyl(.0026, .0026, .0006, holeM, x, TRAY.HOLE_Y + .0003, z, g, 10);
    const s = screwMesh(); s.position.set(x, TRAY.HOLE_Y, z); s.visible = false; g.add(s);
    return {boss: b, screw: s, pos: new THREE.Vector3(x, TRAY.HOLE_Y, z)};
  });
  // shared zone (dual-arm lock) as a translucent band on the tray
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({color: '#ff7e00', transparent: true, opacity: .06, depthWrite: false}));
  zone.rotation.x = -Math.PI / 2; zone.position.y = .0335; g.add(zone);
  return {group: g, holes: H, zone};
}
export function busbar() {
  const g = new THREE.Group(), cu = std('#b8733a', {r: .3, m: .85}), cuH = std('#d99a5e', {r: .25, m: .9});
  box(.021, .008, .216, cu, 0, .004, 0, g); box(.042, .008, .018, cu, 0, .004, -.101, g); box(.042, .008, .018, cu, 0, .004, .101, g);
  box(.004, .0012, .19, cuH, -.004, .0085, 0, g, false); return g;
}
export function limitBlock() {
  const g = new THREE.Group(); box(.051, .025, .03, std('#39424c', {r: .45, m: .5}), 0, .0125, 0, g);
  for (const x of [-.0165, .0165]) cyl(.0035, .0035, .002, std('#b8bec4', {r: .3, m: .8}), x, .026, 0, g, 12);
  return g;
}

// ---------- ABB-style heavy industrial arm (procedural, orange/white), 2-link planar IK + base yaw + wrist ----------
export function abbArm({L1 = .5, L2 = .48, sh = .34, a1 = .1, lw = .1} = {}) {
  const orange = std('#e8731a', {r: .4, m: .15}), white = std('#eeeeea', {r: .45}), dark = std('#2c3035', {r: .5, m: .3}), grey = std('#7f868d', {r: .4, m: .5});
  const root = new THREE.Group();
  cyl(.16, .18, .1, dark, 0, .05, 0, root, 28);
  const j1 = new THREE.Group(); j1.position.y = .1; root.add(j1);
  cyl(.14, .15, .14, orange, 0, .07, 0, j1, 28); box(.2, .18, .22, orange, .03, .2, 0, j1);
  const j2 = new THREE.Group(); j2.position.set(a1, sh - .1, 0); j1.add(j2);
  const mz = m => { m.rotation.x = Math.PI / 2; return m; };
  j2.add(mz(cyl(.09, .09, .26, white, 0, 0, 0, null, 24)));
  box(L1, .13, .12, orange, L1 / 2, 0, .0, j2); box(L1 * .7, .02, .125, white, L1 / 2, .066, 0, j2, false);
  const j3 = new THREE.Group(); j3.position.x = L1; j2.add(j3);
  j3.add(mz(cyl(.075, .075, .2, white, 0, 0, 0, null, 24))); box(.16, .12, .12, orange, -.05, 0, 0, j3);
  box(L2 - .06, .085, .085, orange, (L2 - .06) / 2, 0, 0, j3); cyl(.05, .05, .1, grey, -.1, 0, 0, j3).rotation.z = Math.PI / 2;
  const j5 = new THREE.Group(); j5.position.x = L2; j3.add(j5);
  j5.add(mz(cyl(.045, .045, .1, white, 0, 0, 0, null, 20)));
  const fl = new THREE.Group(); fl.position.x = lw; j5.add(fl);
  const neck = cyl(.035, .035, lw, dark, -lw / 2, 0, 0, j5); neck.rotation.z = Math.PI / 2;
  const mount = new THREE.Group(); mount.rotation.y = Math.PI / 2; fl.add(mount);          // tool +z along the flange (+x)
  const arm = {group: root, mount, L1, L2,
    // tip in the arm's root frame (y up). Tool points down.
    solve(tip, toolLen) {
      const yaw = Math.atan2(-tip.z, tip.x); j1.rotation.y = yaw;
      const r = Math.hypot(tip.x, tip.z) - a1, h = tip.y + toolLen + lw - sh;
      const D = Math.min(L1 + L2 - 1e-4, Math.max(Math.abs(L1 - L2) + 1e-4, Math.hypot(r, h)));
      const al = Math.atan2(h, r), be = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
      const p1 = al + be, ex = Math.cos(p1) * L1, ey = Math.sin(p1) * L1, p2 = Math.atan2(h * D / Math.hypot(r, h || 1e-9) - ey, r * D / Math.hypot(r, h || 1e-9) - ex);
      j2.rotation.z = p1; j3.rotation.z = p2 - p1; j5.rotation.z = -Math.PI / 2 - p2;
    },
  };
  return arm;
}

// ---------- MiR-style mobile base with a pedestal (arm mounts on top at height h) ----------
export function mirBase(h = .9, off = 0) {
  const g = new THREE.Group(), body = std('#8a9097', {r: .5, m: .2}), dark = std('#23262a', {r: .6}), strip = std('#58c3ff', {e: '#58c3ff', ei: .9});
  box(.62, .28, .44, body, 0, .16, 0, g); box(.64, .05, .46, dark, 0, .035, 0, g);
  box(.625, .018, .445, strip, 0, .26, 0, g, false);
  box(.2, h - .3, .2, std('#b8bec4', {r: .35, m: .6}), 0, .3 + (h - .3) / 2, off, g); box(.26, .02, .26, dark, 0, h - .01, off, g);
  for (const [x, z] of [[-.22, -.17], [.22, -.17], [-.22, .17], [.22, .17]]) { const w = cyl(.045, .045, .03, dark, x, .045, z, g, 16); w.rotation.x = Math.PI / 2; }
  return g;
}

// ---------- warehouse: pallet racks, Fetch-style AMRs with totes, conveyor, cartons, a worker ----------
export function tote(color = '#3d6fa8') {
  const g = new THREE.Group(), m = std(color, {r: .6}), w = .46, d = .34, h = .2, t = .012;
  box(w, t, d, m, 0, t / 2, 0, g); box(w, h, t, m, 0, h / 2, d / 2 - t / 2, g); box(w, h, t, m, 0, h / 2, -d / 2 + t / 2, g); box(t, h, d, m, w / 2 - t / 2, h / 2, 0, g); box(t, h, d, m, -w / 2 + t / 2, h / 2, 0, g);
  return g;
}
export function amr() {
  const g = new THREE.Group(), shell = std('#2b2f35', {r: .45, m: .2}), top = std('#d9dcdf', {r: .5}), dark = std('#111214', {r: .7});
  const base = box(.66, .22, .5, shell, 0, .14, 0, g); void base;
  box(.62, .03, .46, top, 0, .265, 0, g); box(.05, .06, .3, dark, .33, .13, 0, g);            // lidar slot at the front
  const light = box(.664, .02, .504, std('#ff7e00', {e: '#ff7e00', ei: 1}), 0, .215, 0, g, false);
  for (const x of [-.18, .18]) box(.03, .22, .03, std('#9aa1a8', {r: .35, m: .7}), x, .38, 0, g);
  box(.5, .02, .38, std('#9aa1a8', {r: .35, m: .7}), 0, .49, 0, g);                            // tote shelf
  const t = tote(); t.position.y = .5; g.add(t);
  const items = []; const icol = ['#e0b64a', '#d9d9d6', '#3a3f46', '#b8733a'];
  for (let i = 0; i < 4; i++) { const it = box(.1, .08, .1, std(icol[i], {r: .6}), -.14 + i * .095, .56, 0, g); it.visible = false; items.push(it); }
  return {group: g, light, items, tote: t};
}
export function carton(w = .42, h = .3, d = .32) {
  const g = new THREE.Group(); box(w, h, d, std('#b58a55', {r: .85}), 0, h / 2, 0, g);
  box(.04, .002, d + .002, std('#d8c6a0', {r: .6}), 0, h + .001, 0, g, false); return g;
}
export function worker(vest = '#c7f000') {
  const g = new THREE.Group(), skin = std('#c99a7a', {r: .7}), pants = std('#2d3440', {r: .8}), v = std(vest, {r: .6, e: vest, ei: .12});
  const leg = x => { const p = new THREE.Group(); p.position.set(x, .8, 0); g.add(p); box(.12, .8, .14, pants, 0, -.4, 0, p); box(.13, .06, .22, std('#1b1d20', {r: .7}), 0, -.8, .04, p); return p; };
  const legL = leg(-.07), legR = leg(.07);
  box(.36, .56, .22, v, 0, 1.08, 0, g); const hd = new THREE.Mesh(new THREE.SphereGeometry(.11, 16, 12), skin); hd.position.y = 1.5; hd.castShadow = true; g.add(hd);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), std('#f2f2ee', {r: .4})); helmet.position.y = 1.53; g.add(helmet);
  const arm = x => { const p = new THREE.Group(); p.position.set(x, 1.32, 0); g.add(p); box(.09, .68, .09, v, 0, -.34, 0, p); box(.1, .1, .1, skin, 0, -.7, 0, p); return p; };
  const armL = arm(-.23), armR = arm(.23);
  return {group: g, armR, armL, legL, legR, armLen: .72, shoulderY: 1.32, shoulderX: .23};
}

// ---------- soccer ----------
export function pitchTexture({w = 20, h = 12, g0 = 4.2, g1 = 7.8, light = '#57a84a', darkG = '#4d9a41', line = '#f6f7f2', px = 64} = {}) {
  return canvasTex(Math.round((w + 2) * px), Math.round((h + 2) * px), (c) => {
    const X = x => (x + 1) * px, Y = y => (y + 1) * px;
    c.fillStyle = light; c.fillRect(0, 0, (w + 2) * px, (h + 2) * px);
    for (let i = 0; i < 8; i++) if (i % 2) { c.fillStyle = darkG; c.fillRect(X(i * 2.5), 0, 2.5 * px, (h + 2) * px); }
    c.strokeStyle = line; c.lineWidth = .1 * px;
    c.strokeRect(X(0), Y(0), w * px, h * px); c.beginPath(); c.moveTo(X(w / 2), Y(0)); c.lineTo(X(w / 2), Y(h)); c.stroke();
    c.beginPath(); c.arc(X(w / 2), Y(h / 2), 1.8 * px, 0, 7); c.stroke(); c.fillStyle = line; c.beginPath(); c.arc(X(w / 2), Y(h / 2), .12 * px, 0, 7); c.fill();
    c.strokeRect(X(0), Y(3), 3 * px, 6 * px); c.strokeRect(X(w - 3), Y(3), 3 * px, 6 * px);
    c.strokeRect(X(0), Y(g0 - .2), 1.1 * px, (g1 - g0 + .4) * px); c.strokeRect(X(w - 1.1), Y(g0 - .2), 1.1 * px, (g1 - g0 + .4) * px);
  });
}
export function goalFrame(width, height, depth) {
  const g = new THREE.Group(), white = std('#f7f7f4', {r: .35}), r = .045;
  const post = (x, z) => cyl(r, r, height, white, x, height / 2, z, g, 12);
  post(0, -width / 2); post(0, width / 2);
  const bar = cyl(r, r, width, white, 0, height, 0, g, 12); bar.rotation.x = Math.PI / 2;
  const back = (z) => { const s = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, Math.hypot(depth, height), 8), white); s.position.set(-depth / 2, height / 2, z); s.rotation.z = -Math.atan2(depth, height); g.add(s); };
  back(-width / 2); back(width / 2);
  const netM = new THREE.MeshBasicMaterial({color: '#ffffff', wireframe: true, transparent: true, opacity: .45});
  const net = new THREE.Mesh(new THREE.PlaneGeometry(width, Math.hypot(depth, height), 14, 8), netM); net.position.set(-depth / 2, height / 2, 0); net.rotation.set(0, Math.PI / 2, 0); net.rotateX(Math.atan2(depth, height)); g.add(net);
  for (const z of [-width / 2, width / 2]) { const s = new THREE.Mesh(new THREE.PlaneGeometry(depth, height, 4, 6), netM); s.position.set(-depth / 2, height / 2, z); g.add(s); }
  return g;
}
export function soccerBall(r = .11) {
  const tex = canvasTex(256, 128, (c, w, h) => {
    c.fillStyle = '#f7f7f5'; c.fillRect(0, 0, w, h); c.fillStyle = '#16181b';
    const spots = [[.1, .5], [.35, .2], [.35, .8], [.6, .5], [.85, .2], [.85, .8], [.5, .02], [.5, .98], [.0, .1], [1, .1], [0, .9], [1, .9]];
    for (const [u, v] of spots) { c.beginPath(); for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 - Math.PI / 2; c.lineTo(u * w + Math.cos(a) * 15, v * h + Math.sin(a) * 15 * (1 + Math.abs(v - .5))); } c.fill(); }
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshStandardMaterial({map: tex, roughness: .45})); m.castShadow = true; return m;
}
export function jerseyTexture() {
  return canvasTex(512, 256, (c, w, h) => {
    const n = 10; for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#75aadb'; c.fillRect(i * w / n, 0, w / n + 1, h); }
    c.fillStyle = 'rgba(0,0,0,.06)'; c.fillRect(0, 0, w, 14); c.fillRect(0, h - 10, w, 10);
    c.fillStyle = '#1b2a4a'; c.font = '800 70px Geist, system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('10', w * .75, h * .62);  // back number
  });
}
