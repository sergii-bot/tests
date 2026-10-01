// SKILD RELEASE HALL — a walkable gallery built from releases.js.
// Each pavilion: plaque (read) → screen with the official video (watch) → TRY stand (try).
import * as THREE from '../vendor/three.module.js';
import {CSS3DRenderer, CSS3DObject} from '../vendor/CSS3DRenderer.js';
import {RELEASES, BRAND} from './releases.js';
import * as DS from './dataset.js';
import {exhibit, MAT as ROBOT_MAT} from './robots.js';
import {start as audioStart, sfx, toggleMute, isMuted} from './sound.js';
import {startPresence} from './presence.js';
import {INVESTORS, ROUNDS} from './investors.js';
import {buildHardwareLab, HX} from './hardware.js';
import {buildResearchWing, RX} from './research-wing.js';
import {startLearners} from './learners.js';
import * as MJ from './mj.js';
import {createCinema} from './cinema.js';
import {createHeroes, HEROES} from './heroes.js';
import {installLookdev, upgradeRobot} from './lookdev.js';
import {dressCorridor} from './corridor.js';
import {dressJapanLab} from './japan.js';

// real robots (MuJoCo Menagerie models) per bay, posed/animated to match what that release's video shows
const BLACK = '#1d1f23';
const REAL = {
  'series-a': [['g1', MJ.RECIPES.humanoidWalk(.5), {tint: BLACK, dx: -.9}], ['go2', MJ.RECIPES.go2Trot(.8), {dx: .9}]],
  'skild-brain': [['g1', null, {tint: BLACK, shirt: 'skild.ai'}]],                                  // video: black humanoid in a skild.ai t-shirt
  'one-policy': [['g1', MJ.RECIPES.humanoidWalk(1), {dx: -.8, tint: BLACK}]],                       // black humanoid on stairs
  parkour: [['g1', MJ.RECIPES.humanoidParkour(), {dz: -.55, tint: BLACK}], ['go2', MJ.RECIPES.go2Parkour(), {dz: .7}]],
  'omni-bodied': [['go2', MJ.RECIPES.go2Limp('FR'), {hide: 'FR_calf'}]],
  'learning-by-watching': [['g1', MJ.RECIPES.humanoidWalk(.4), {tint: BLACK, dz: -.45}]],           // black humanoid at a table
  'series-c': [['g1', null, {tint: BLACK, dz: -.4}]],                                              // hand-over at a table
  bengaluru: [['g1', null, {tint: BLACK, dx: -1.1}]],
  reindustrial: [['ur5e', MJ.RECIPES.urPick(1), {dx: -.5, dy: .78, dz: -.35}], ['ur5e', MJ.RECIPES.urPick(2.4), {dx: .5, dy: .78, dz: -.35}]], // two cobots on a black bench (GTC)
  s1: [['ur5e', MJ.RECIPES.urPick(0), {dx: -.32, dy: 1.25, dz: -.42, tint: '#2a2c30', face: .35}], ['ur5e', MJ.RECIPES.urPick(Math.PI), {dx: .32, dy: 1.25, dz: -.42, tint: '#2a2c30', face: -.35}]], // S1 rig: dark arms on a white column
  '100m-arr': [['ur5e', MJ.RECIPES.urPick(1), {dx: -.5, dy: .78, dz: -.35}], ['ur5e', MJ.RECIPES.urPick(2.4), {dx: .5, dy: .78, dz: -.35}]],
  'self-play': [['g1', MJ.RECIPES.humanoidWalk(1.3), {dx: -.75, jersey: true}], ['g1', MJ.RECIPES.humanoidWalk(1.3), {dx: .75, face: Math.PI, tint: BLACK}]],
};

// which lab robot stands in each pavilion (opposite its screen, "watching" its own release)
const ROBOT = {'series-a': 'humanoid', 'skild-brain': 'quadruped', 'one-policy': 'humanoid-stairs', 'omni-bodied': 'quadruped-3leg', 'learning-by-watching': 'arm', 'series-c': 'amr', bengaluru: 'humanoid-walk', reindustrial: 'arm-industrial', zebra: 'amr-arm', s1: 'dual-arm', '100m-arr': 'amr', 'self-play': 'soccer'};

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
const DATE_LABEL = Object.fromEntries(RELEASES.filter(r => r.dateLabel).map(r => [r.date, r.dateLabel]));
const fmtDate = d => DATE_LABEL[d] || new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});

// ---------- progress (per visitor, browser only) ----------
const PKEY = 'skild-hall:progress:v1';
const progress = (() => { try { return JSON.parse(localStorage.getItem(PKEY)) || {}; } catch { return {}; } })();
const saveProgress = () => { try { localStorage.setItem(PKEY, JSON.stringify(progress)); } catch {} };
const stateOf = id => progress[id] || (progress[id] = {watched: false, tried: false});

// ---------- layout ----------
const SPACING = 15, HALL_W = 22, WALL_X = HALL_W / 2, START_Z = 6;
// newest release first: you enter at the latest bay and walk back in time to where it began
const ORDER = [...RELEASES].reverse();
const layout = ORDER.map((r, i) => {
  const side = i % 2 === 0 ? -1 : 1, z = -12 - i * SPACING;
  return {r, i, side, z,
    screen: new THREE.Vector3(side * (WALL_X - 0.08), 3.3, z),
    plaque: new THREE.Vector3(side * (WALL_X - 0.08), 2.7, z + 6.6),
    stand: new THREE.Vector3(side * 6.2, 0, z - 5.6),
    watchSpot: new THREE.Vector3(side * 5.2, 0, z)};
});
const END_Z = layout.at(-1).z - 20;

// ---------- renderers ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'high-performance'});
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const cine = createCinema(THREE, renderer); // the director's film look (LOOK_BIBLE.md); C toggles it

// ---------- loading screen: the lab appears only once light, surfaces and robots are ready (no flat first frames) ----------
const boot = (() => {
  const steps = {light: 'Light', hero: 'Your robot', robots: 'Robots in the bays'}, done = new Set();
  let tex = [0, 0], finished = false;
  THREE.DefaultLoadingManager.onProgress = (u, a, b) => { tex = [a, b]; paint(); };
  const bar = $('loadBar'), txt = $('loadText');
  function paint() {
    if (finished) return;
    const parts = Object.keys(steps).length + 1, texF = tex[1] ? tex[0] / tex[1] : 0;
    const p = (done.size + texF) / parts; bar.style.transform = `scaleX(${Math.max(.04, p).toFixed(3)})`;
    const next = Object.keys(steps).find(k => !done.has(k));
    txt.textContent = next ? `Loading · ${steps[next]}` : tex[1] && tex[0] < tex[1] ? `Loading · Surfaces ${tex[0]}/${tex[1]}` : 'Ready';
    if (done.size === Object.keys(steps).length && (!tex[1] || tex[0] >= tex[1])) finish();
  }
  function finish() { if (finished) return; finished = true; bar.style.transform = 'scaleX(1)'; setTimeout(() => $('loading').classList.add('gone'), 450); setTimeout(() => $('loading').remove(), 1400); }
  setTimeout(finish, 30000); // slow network: never trap the visitor
  return {done(k) { done.add(k); paint(); }};
})();
// Two CSS3D layers: 'under' (screens, plaques, posters) sits BELOW the WebGL canvas and shows through
// transparent 'holes', so robots and glass correctly occlude it (true depth/parallax).
// 'top' holds text-only elements (floor dates, stand signs, wall titles).
const css = new CSS3DRenderer(); $('css3d').append(css.domElement);
const cssTop = new CSS3DRenderer(); $('css3dTop').append(cssTop.domElement);
const sceneUnder = new THREE.Scene(), sceneTop = new THREE.Scene();

const scene = new THREE.Scene();
scene.background = null;
scene.fog = new THREE.Fog(BRAND.warm1, 30, 95);
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 250); // 50° reads like a 35 mm lens: truer proportions than the old 62°
const player = {x: 0, z: START_Z + 9, yaw: 0, pitch: -0.02, vx: 0, vz: 0};
const look = {yaw: 0, pitch: -0.02}; // mouse targets; the camera eases toward them

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); css.setSize(w, h); cssTop.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); cine.setSize(w, h); }
addEventListener('resize', resize); resize();

// ---------- heroes: walk the lab as a robot, a drone or an engineer; V switches third / first person ----------
const heroes = createHeroes(THREE, scene, MJ);
let heroId = (() => { try { return localStorage.getItem('skild-hall:hero'); } catch { return null; } })() || 'g1';
heroes.pick(heroId).finally(() => boot.done('hero'));

// ---------- materials & architecture ----------
const M = {
  floor: new THREE.MeshStandardMaterial({color: BRAND.warm2, roughness: .38, metalness: .05}),
  wall: new THREE.MeshStandardMaterial({color: BRAND.warm1, roughness: .92}),
  black: new THREE.MeshStandardMaterial({color: BRAND.black, roughness: .45, metalness: .2}),
  frame: new THREE.MeshStandardMaterial({color: '#0b0b0b', roughness: .6}),
  orange: new THREE.MeshBasicMaterial({color: BRAND.orange, toneMapped: false}),
  orangeDim: new THREE.MeshBasicMaterial({color: '#f3c79b', toneMapped: false}),
  grey: new THREE.MeshStandardMaterial({color: BRAND.cool1, roughness: .6, metalness: .3}),
  light: new THREE.MeshBasicMaterial({color: '#ffffff'}),
  glass: new THREE.MeshStandardMaterial({color: '#dfe6ea', roughness: .05, metalness: .1, transparent: true, opacity: .22}),
};
const hallLen = START_Z + 14 - END_Z, hallMid = (START_Z + 14 + END_Z) / 2;
const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, hallLen), M.floor);
floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, hallMid); floor.receiveShadow = true; scene.add(floor);
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, hallLen), M.wall);
ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 7.5, hallMid); scene.add(ceiling);
for (const s of [-1, 1]) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(hallLen, 7.5), M.wall);
  w.rotation.y = -s * Math.PI / 2; w.position.set(s * WALL_X, 3.75, hallMid); w.receiveShadow = true; scene.add(w);
  const base = new THREE.Mesh(new THREE.BoxGeometry(.06, .14, hallLen), M.black); base.position.set(s * (WALL_X - .03), .07, hallMid); scene.add(base);
}
for (const z of [START_Z + 14, END_Z]) {
  const w = new THREE.Mesh(new THREE.PlaneGeometry(HALL_W, 7.5), M.wall);
  w.position.set(0, 3.75, z); if (z > 0) w.rotation.y = Math.PI; scene.add(w);
}
// timeline: an orange line down the middle of the floor
const line = new THREE.Mesh(new THREE.PlaneGeometry(.08, hallLen - 20), M.orange);
line.rotation.x = -Math.PI / 2; line.position.set(0, .004, hallMid - 4); scene.add(line);
// ceiling light strips
for (let z = START_Z + 8; z > END_Z && false; z -= 11) { // replaced by the drop ceiling in corridor.js
  const strip = new THREE.Mesh(new THREE.BoxGeometry(HALL_W - 6, .05, .35), M.light);
  strip.position.set(0, 7.45, z); scene.add(strip);
}
const hemi = new THREE.HemisphereLight('#ffffff', BRAND.warm3, 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e6', 1.6);
sun.position.set(6, 14, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 40});
scene.add(sun, sun.target);
sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -.0004; sun.shadow.normalBias = .02; sun.shadow.radius = 4;
installLookdev(THREE, renderer, scene, M, {hallLen, hallW: HALL_W}).catch(e => console.warn('lookdev', e)).finally(() => boot.done('light'));
const upgradeExhibits = () => { for (const p of pav) upgradeRobot(THREE, p.bot.group); };
setTimeout(upgradeExhibits, 2500); setTimeout(upgradeExhibits, 9000);

// ---------- CSS3D helpers ----------
const PX = 0.01; // 100 css px = 1 world unit
function css3d(node, pos, rotY = 0, scale = PX, rotX = 0, rotZ = 0, top = false, flip = false) {
  const o = new CSS3DObject(node); o.rotation.set(rotX, rotY, rotZ); o.scale.setScalar(scale);
  if (!flip) { o.position.copy(pos); (top ? sceneTop : sceneUnder).add(o); return o; }
  // text that is seen from both directions turns 180° so it always reads correctly (never mirrored)
  const g = new THREE.Group(); g.position.copy(pos); g.add(o); (top ? sceneTop : sceneUnder).add(g); flippers.push({g, o, flipped: false, flat: Math.abs(rotX) > 1, baseZ: rotZ}); return o;
}
const flippers = [];
function updateFlippers() {
  let changed = false;
  for (const f of flippers) { const want = camera.position.z < f.g.position.z; if (want !== f.flipped) { f.flipped = want; if (f.flat) { /* flat CSS text is no longer used */ } else f.g.rotation.y = want ? Math.PI : 0; changed = true; } }
  if (changed) syncHoles();
  for (const f of floorDates) { const want = camera.position.z < f.mesh.position.z; f.mesh.rotation.z = want ? Math.PI : 0; }
}
// punch a transparent hole in the WebGL layer for every 'under' element (sized from its laid-out box)
const holeMat = new THREE.MeshBasicMaterial({color: 0x000000, opacity: 0, blending: THREE.NoBlending, side: THREE.DoubleSide, fog: false, toneMapped: false});
const holes = new Map();
function syncHoles() {
  const all = []; sceneUnder.traverse(o => { if (o.isCSS3DObject) all.push(o); });
  for (const o of all) {
    const w = o.element.offsetWidth, h = o.element.offsetHeight; if (!w || !h) continue;
    let m = holes.get(o); if (!m) { m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), holeMat); holes.set(o, m); scene.add(m); }
    o.updateWorldMatrix(true, false); const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3(); o.matrixWorld.decompose(wp, wq, ws);
    m.scale.set(w * ws.x, h * ws.y, 1); m.position.copy(wp); m.quaternion.copy(wq);
  }
}
const faceCenter = side => (side < 0 ? Math.PI / 2 : -Math.PI / 2);

// entrance + end walls
css3d(el('div', 'w-wall', `<img src="../assets/brand/skild-wordmark.svg" alt="Skild AI"><h1>Next <span>release</span></h1><p>Reserved for what ships next · your brain grows with every experiment</p>`), new THREE.Vector3(0, 6.2, START_Z + 13.95), Math.PI, .0036, 0, 0, true);
css3d(el('div', 'w-wall', `<img src="../assets/brand/skild-wordmark.svg" alt="Skild AI"><h1>Where it <span>began</span></h1><p>2023 · Pittsburgh · founded by Deepak Pathak and Abhinav Gupta</p>`), new THREE.Vector3(0, 5.4, END_Z + .05), 0, .0042, 0, 0, true);

// ---------- investors wall (entrance): who backs the lab, and what shipped since each round ----------
{
  const tiles = INVESTORS.map(v => `<div class="inv ${v.logo ? 'has-logo' : ''} ${v.strategic ? 'strategic' : ''}">${v.logo ? `<img src="${v.logo}" alt="${esc(v.name)}">` : ''}<b>${esc(v.name)}</b><span>${v.rounds.map(r => `<i class="${(v.lead || []).includes(r) ? 'lead' : ''}">${r === 'A' ? 'Series A' : 'Series C'}${(v.lead || []).includes(r) ? ' · lead' : ''}</i>`).join('')}</span></div>`).join('');
  css3d(el('div', 'w-investors', `<p class="k">Backed by</p><h2>The people building this with us</h2><div class="inv-grid">${tiles}</div><p class="foot">Investors as named in Skild AI's Series A and Series C announcements · walk up and press E to open their official sites</p>`), new THREE.Vector3(-(WALL_X - .06), 3.75, END_Z + 7), Math.PI / 2, .0056);
  const shipped = ROUNDS.map((rd, i) => { const until = ROUNDS[i + 1]?.date || '9999'; const rel = RELEASES.filter(r => r.date > rd.date && r.date < until && r.kind !== 'company' && r.kind !== 'showcase'); return `<div class="round"><div class="rh"><b>${rd.amount}</b><span>${rd.name} · ${esc(fmtDate(rd.date))} · ${rd.valuation}</span></div><p class="k">Shipped since</p><ol>${rel.map(r => `<li><em>${esc(r.code)}</em>${esc(r.title)}<small>${esc(fmtDate(r.date))}</small></li>`).join('') || '<li>…</li>'}</ol></div>`; }).join('');
  css3d(el('div', 'w-investors w-built', `<p class="k">What it built</p><h2>Every bay in this lab is a result</h2><div class="rounds">${shipped}</div><p class="foot">Releases in chronological order after each round. Walk in and try each one.</p>`), new THREE.Vector3(WALL_X - .06, 3.75, START_Z + 7), -Math.PI / 2, .0056);
  css3d(el('div', 'w-team', `<img src="https://www.skild.ai/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fsilly.b5aea575.jpg&w=3840&q=75" alt="The Skild AI team"><div class="cap"><b>The team</b><span>From Skild AI's Series A announcement · July 2024</span></div>`), new THREE.Vector3(WALL_X - .06, 3.6, END_Z + 7), -Math.PI / 2, .0078);
}

// official imagery from skild.ai (hotlinked, never re-hosted)
const POSTERS = ['robot-construction', 'robotics-foundation', 'robot-assembly'].map(n => `https://www.skild.ai/_next/image?url=%2Fpng%2F${n}.png&w=1920&q=75`);
// ceiling cable tray down the lab


// ---------- pavilions ----------
const standMeshes = [], floorDates = [];
const pav = layout.map(L => {
  const {r, side, z} = L, rot = faceCenter(side), st = stateOf(r.id);
  // screen frame (WebGL) + screen (CSS3D)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(.12, 5.9, 10.2), M.frame);
  frame.position.set(side * (WALL_X - .06), 3.3, z); frame.castShadow = true; scene.add(frame);
  const glow = new THREE.Mesh(new THREE.BoxGeometry(.03, .06, 10.2), M.orange);
  glow.position.set(side * (WALL_X - .13), .32, z); scene.add(glow);
  const screenEl = el('div', 'w-screen');
  const v0 = r.videos[0];
  const posterImg = el('img'); posterImg.alt = r.title; posterImg.loading = 'lazy';
  if (v0.poster) { // YouTube: ask for the 1280 px frame (a 10 m screen shows every pixel), fall back to the 480 px one
    const hi = v0.poster.replace('/hqdefault.jpg', '/maxresdefault.jpg');
    posterImg.src = hi; if (hi !== v0.poster) posterImg.onerror = () => { posterImg.onerror = null; posterImg.src = v0.poster; };
    posterImg.addEventListener('load', () => { if (posterImg.naturalWidth === 120 && posterImg.src !== v0.poster) posterImg.src = v0.poster; }); // YouTube's 120 px "no image" stub
  }
  screenEl.append(posterImg);
  if (v0.type === 'youtube') screenEl.append(el('div', 'play'), el('div', 'yt-badge', 'Press E to watch'));
  let screenVideo = null;
  if (v0.type === 'mp4') { screenVideo = el('video'); Object.assign(screenVideo, {muted: true, loop: true, playsInline: true, preload: 'none'}); screenVideo.dataset.src = v0.src; if (v0.poster) screenVideo.poster = v0.poster; screenEl.replaceChildren(screenVideo); }
  css3d(screenEl, L.screen.clone().add(new THREE.Vector3(-side * .08, 0, 0)), rot, .0104);

  // plaque
  const plaque = el('div', 'w-plaque', `<span class="code">${esc(r.code)}</span><span class="date">${esc(fmtDate(r.date))}</span><h3>${esc(r.title)}</h3><div class="sub">${esc(r.subtitle)}</div><p>${esc(r.summary)}</p><div class="steps"><span class="s-read on">1 · Read</span><span class="s-watch">2 · Watch</span><span class="s-try">3 · Try</span></div>`);
  css3d(plaque, L.plaque, rot, .0068);
  if (L.r === RELEASES.at(-1)) plaque.insertAdjacentHTML('afterbegin', '<span class="new">NEW</span>');
  // overhead bay sign + glass partition + official Skild imagery above the robot
  css3d(el('div', 'w-bay', `<b>BAY ${String(L.i + 1).padStart(2, '0')}</b><span>${esc(r.code)} · ${esc(fmtDate(r.date))}</span><em>${esc(r.title)}</em>`), new THREE.Vector3(0, 6.55, z + 1), 0, .005, 0, 0, false, true);
  for (const s2 of [-1, 1]) { const glass = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.2, .05), M.glass); glass.position.set(s2 * (WALL_X - 1.6), 2.6, z + SPACING / 2); scene.add(glass); const post = new THREE.Mesh(new THREE.BoxGeometry(.08, 5.4, .08), M.black); post.position.set(s2 * (WALL_X - 3.2), 2.7, z + SPACING / 2); scene.add(post); }
  { const img = el('img', 'w-poster'); img.src = POSTERS[L.i % POSTERS.length]; img.alt = 'Skild AI'; img.loading = 'lazy'; css3d(img, new THREE.Vector3(-side * (WALL_X - .06), 5.3, z + 1), faceCenter(-side), .0042); }

  // floor date marker
  const d = new Date(r.date + 'T12:00:00Z');
  if (!r.dateLabel) { const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 192; const c2 = cv.getContext('2d');
    const draw = () => { c2.clearRect(0, 0, 1024, 192); c2.font = '500 120px "Geist Mono", ui-monospace, monospace'; c2.textBaseline = 'middle'; c2.fillStyle = BRAND.black; const m = d.toLocaleDateString('en-US', {month: 'short'}).toUpperCase() + ' '; c2.fillText(m, 20, 100); const w = c2.measureText(m).width; c2.fillStyle = BRAND.orange; c2.fillText(String(d.getUTCFullYear()), 20 + w, 100); tex.needsUpdate = true; };
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const dm = new THREE.Mesh(new THREE.PlaneGeometry(5.2, .975), new THREE.MeshBasicMaterial({map: tex, transparent: true, depthWrite: false, toneMapped: false}));
    dm.rotation.x = -Math.PI / 2; dm.position.set(-side * 1.6, .012, z + 2); scene.add(dm);
    floorDates.push({mesh: dm, draw}); draw(); document.fonts?.ready.then(draw); }

  // TRY stand (WebGL pedestal + hologram) + CSS3D sign
  const g = new THREE.Group(); g.position.copy(L.stand); scene.add(g);
  void 0;
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.2, 1.05, 48), M.black); ped.position.y = .525; ped.castShadow = true; ped.receiveShadow = true; g.add(ped);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.02, .04, 48), M.grey); top.position.y = 1.07; g.add(top);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, .035, 12, 64), st.watched ? M.orange : M.orangeDim); ring.rotation.x = Math.PI / 2; ring.position.y = 1.05; g.add(ring);
  const floorRing = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.62, 64), st.watched ? M.orange : M.orangeDim); floorRing.rotation.x = -Math.PI / 2; floorRing.position.y = .006; g.add(floorRing);
  const holo = new THREE.Mesh(new THREE.IcosahedronGeometry(.42, 1), new THREE.MeshBasicMaterial({color: BRAND.orange, wireframe: true, toneMapped: false}));
  holo.position.y = 1.75; g.add(holo);
  const sign = el('div', 'w-stand', `<div class="k">TRY · ${esc(r.code)}</div><div class="n">${esc(r.try.title)}</div><div class="l">${st.watched ? 'Press E' : 'Watch the video first'}</div>`);
  css3d(sign, L.stand.clone().add(new THREE.Vector3(0, 2.75, 0)), 0, .006, 0, 0, true).userData.billboard = true;
  standMeshes.push({x: L.stand.x, z: L.stand.z, r: 1.35});

  const bot = exhibit(ROBOT[r.id]); bot.group.position.set(-side * 6.4, 0, z + 1); bot.group.rotation.y = side < 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(bot.group); standMeshes.push({x: -side * 6.4, z: z + 1, r: 2.3});
  const p = {L, r, screenEl, screenVideo, plaque, sign, ring, floorRing, holo, bot, playing: false, real: []};
  paint(p);
  return p;
});
const corridor = dressCorridor(THREE, renderer, scene, {hallLen, hallMid, wallX: WALL_X, hallW: HALL_W, ceil: 7.3, bays: layout.map(L => ({robot: {x: -L.side * 6.4, z: L.z + 1}, stand: L.stand})), stands: layout.map(L => L.stand)});
const billboards = sceneTop.children.filter(o => o.userData?.billboard);
// swap in the real robots lazily, nearest bays first (keeps the first frame fast)
async function loadRealRobots() {
  const order = [...pav].sort((a, b) => Math.abs(a.L.z - player.z) - Math.abs(b.L.z - player.z));
  let bays = 0; const enough = () => { if (++bays === 3) boot.done('robots'); }; // the nearest three bays are what you see first
  for (const p of order) {
    const spec = REAL[p.r.id]; if (!spec) continue;
    try {
      for (const [key, recipe, opt = {}] of spec) {
        const b = await MJ.spawn(key, {tint: opt.tint || null, shared: true});
        if (opt.jersey || opt.shirt) dressTorso(b, opt);
        if (opt.hide) b.hideBody(id => b.bodyName(id).startsWith(opt.hide));
        b.recipe = recipe; b.group.position.set(opt.dx || 0, .12 + (opt.dy || 0), opt.dz || 0); b.group.rotation.y = opt.face || 0;
        p.bot.group.add(b.group); p.real.push(b); p.bot.group.userData.robot.visible = false; // real robot in: placeholder out
      }
      p.bot.group.userData.robot.visible = false; // hide the stylized placeholder
      dressBay(p);
      p.plaque.insertAdjacentHTML('beforeend', `<div class="model-tag">Stand-in body: third-party robot in Skild livery. Skild builds the brain, not this hardware · ${spec.map(s => MJ.LABEL[s[0]]).filter((v, i, a) => a.indexOf(v) === i).join(' · ')} · MuJoCo Menagerie</div>`);
      syncHoles();
      enough();
    } catch (e) { console.warn('real robot', p.r.id, e); enough(); }
  }
  boot.done('robots');
}
setTimeout(loadRealRobots, 600);

// jersey / t-shirt on a humanoid torso (Argentina stripes for self-play, skild.ai tee for the brain video)
function dressTorso(b, opt) {
  const torso = b.meshes.filter(m => /torso|waist|pelvis/i.test(b.bodyName(m.userData.body)));
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const c = cv.getContext('2d');
  if (opt.jersey) { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#75aadb'; c.fillRect(i * 32, 0, 32, 256); } }
  else { c.fillStyle = '#111'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#fff'; c.font = '600 44px Geist, sans-serif'; c.textAlign = 'center'; c.fillText(opt.shirt, 128, 140); }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({map: tex, roughness: .8});
  for (const m of torso) if (/torso/i.test(b.bodyName(m.userData.body))) m.material = mat;
}

// ---------- scene dressing: each bay's props match what its release video shows ----------
const PM = {
  table: new THREE.MeshStandardMaterial({color: '#d9d6cf', roughness: .7}), dark: new THREE.MeshStandardMaterial({color: '#1b1e22', roughness: .5, metalness: .3}),
  grass: new THREE.MeshStandardMaterial({color: '#3f7d3a', roughness: .95}), line: new THREE.MeshBasicMaterial({color: '#f4f4f0'}),
  ball: new THREE.MeshStandardMaterial({color: '#f5f5f5', roughness: .4}), pcb: new THREE.MeshStandardMaterial({color: '#2f4a3a', roughness: .6, metalness: .2}),
  steel: new THREE.MeshStandardMaterial({color: '#b5b9ba', roughness: .3, metalness: .8}), pancake: new THREE.MeshStandardMaterial({color: '#d49a4c', roughness: .8}),
  plate: new THREE.MeshStandardMaterial({color: '#f7f5f1', roughness: .4}), cube: new THREE.MeshStandardMaterial({color: '#ff7e00', roughness: .5}),
  stair: new THREE.MeshStandardMaterial({color: '#8e8177', roughness: .9}),
};
const mk = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
function workTable(parent) { mk(new THREE.BoxGeometry(1.9, .06, .9), PM.table, 0, .87, 0, parent); for (const [x, z] of [[-.85, -.38], [.85, -.38], [-.85, .38], [.85, .38]]) mk(new THREE.BoxGeometry(.05, .75, .05), PM.dark, x, .495, z, parent); }
function dressBay(p) {
  const g = p.bot.group, id = p.r.id, top = .9 + .12;
  if (id === 'self-play') {
    mk(new THREE.BoxGeometry(3.2, .02, 2.2), PM.grass, 0, .13, 0, g);
    for (const x of [-1.6, 0, 1.6]) mk(new THREE.BoxGeometry(.02, .005, 2.2), PM.line, x, .145, 0, g);
    const circle = new THREE.Mesh(new THREE.RingGeometry(.34, .36, 48), PM.line); circle.rotation.x = -Math.PI / 2; circle.position.y = .146; g.add(circle);
    for (const s of [-1, 1]) { const goal = new THREE.Group(); goal.position.set(s * 1.55, .13, 0); for (const z of [-.45, .45]) mk(new THREE.BoxGeometry(.04, .5, .04), PM.line, 0, .25, z, goal); mk(new THREE.BoxGeometry(.04, .04, .94), PM.line, 0, .5, 0, goal); g.add(goal); }
    p.ball = mk(new THREE.SphereGeometry(.11, 24, 16), PM.ball, 0, .25, 0, g);
  }
  if (id === 's1') {
    mk(new THREE.BoxGeometry(.16, 1.5, .16), PM.plate, 0, .12 + .75, -.42, g); mk(new THREE.BoxGeometry(.9, .06, .2), PM.plate, 0, 1.3, -.42, g); mk(new THREE.BoxGeometry(.18, .12, .14), PM.dark, 0, 1.72, -.42, g); // white column + mast + head camera
    mk(new THREE.BoxGeometry(3.2, 2.6, .05), new THREE.MeshStandardMaterial({color: '#4f6b58', roughness: .9}), 0, .12 + 1.3, -1.25, g); // green wall set
    const t = new THREE.Group(); t.position.set(0, .12, .25); g.add(t); workTable(t);
    mk(new THREE.CylinderGeometry(.2, .18, .05, 32), PM.dark, 0, .93, 0, t); p.pancake = mk(new THREE.CylinderGeometry(.13, .13, .02, 32), PM.pancake, 0, .96, 0, t);
    mk(new THREE.CylinderGeometry(.16, .14, .02, 32), PM.plate, .55, .91, .1, t); mk(new THREE.BoxGeometry(.04, .01, .25), PM.steel, -.45, .91, .15, t);
  }
  if (id === 'learning-by-watching') { const t = new THREE.Group(); t.position.set(0, .12, .45); g.add(t); workTable(t); p.cube = mk(new THREE.BoxGeometry(.1, .1, .1), PM.cube, .3, .95, .1, t); mk(new THREE.BoxGeometry(.3, .005, .3), PM.line, -.4, .902, .1, t); }
  if (id === 'reindustrial') {
    const t = new THREE.Group(); t.position.set(0, .12, .25); g.add(t); workTable(t); t.children[0].material = PM.dark;
    mk(new THREE.BoxGeometry(.9, .03, .5), PM.pcb, 0, .915, .05, t); mk(new THREE.BoxGeometry(.22, .04, .22), PM.steel, -.18, .945, .05, t); mk(new THREE.BoxGeometry(.22, .04, .22), PM.steel, .18, .945, .05, t);
    // screw points around the tray
    const pts = []; for (let i = 0; i < 6; i++) { pts.push([-.4 + i * .16, -.2], [-.4 + i * .16, .3]); } for (const x of [-.4, .4]) pts.push([x, .05]); for (const x of [-.02, .02]) pts.push([x, -.08], [x, .18]);
    p.screws = pts.slice(0, 18).map(([x, z]) => mk(new THREE.CylinderGeometry(.012, .012, .01, 12), PM.steel, x, .935, z, t));
  }
  if (id === 'one-policy') { for (let i = 0; i < 4; i++) mk(new THREE.BoxGeometry(1.1, .17 * (i + 1), .32), PM.stair, .45 + i * .32 * 0 + .2, .12 + .085 * (i + 1), 0, g).position.set(.4 + i * .32, .12 + .085 * (i + 1), 0); }
  if (id === 'learning-by-watching' || id === 'series-c') { /* table set below for lbw; series-c hand-over table */ if (id === 'series-c') { const t = new THREE.Group(); t.position.set(0, .12, .45); g.add(t); workTable(t); mk(new THREE.CylinderGeometry(.12, .1, .06, 24), PM.plate, -.3, .93, 0, t); mk(new THREE.BoxGeometry(.35, .04, .25), PM.steel, .3, .91, 0, t); } }
  if (id === 'skild-brain') { mk(new THREE.BoxGeometry(.9, .45, .45), PM.dark, .9, .345, -.6, g); mk(new THREE.SphereGeometry(.08, 16, 12), PM.cube, -.7, .2, .5, g); }
  if (id === 'parkour') { for (const [x, h] of [[-.55, .3], [.45, .5]]) mk(new THREE.BoxGeometry(.5, h, .6), PM.table, x, .12 + h / 2, -.55, g); for (const [x, h] of [[-.7, .2], [.1, .32], [.8, .24]]) mk(new THREE.BoxGeometry(.4, h, .45), PM.table, x, .12 + h / 2, .7, g); }
  if (id === '100m-arr') { const t = new THREE.Group(); t.position.set(0, .12, .25); g.add(t); workTable(t); t.children[0].material = PM.dark; mk(new THREE.BoxGeometry(.7, .03, .06), PM.steel, 0, .92, -.05, t); mk(new THREE.BoxGeometry(.8, .025, .45), PM.pcb, 0, .915, .12, t); }
  if (id === 'bengaluru') { const globe = mk(new THREE.SphereGeometry(.45, 32, 20), new THREE.MeshStandardMaterial({color: '#2e3a47', roughness: .6, wireframe: true}), .5, 1.0, 0, g); p.globe = globe; for (const [la, lo, c] of [[37, -122, PM.plate], [40, -80, PM.plate], [13, 77.6, PM.cube]]) { const a = la * Math.PI / 180, b = lo * Math.PI / 180; mk(new THREE.SphereGeometry(.04, 12, 8), c, .5 * 0 + Math.cos(a) * Math.cos(b) * .47, Math.sin(a) * .47, -Math.cos(a) * Math.sin(b) * .47, globe); } }
  if (id === 'zebra') { for (let i = 0; i < 3; i++) mk(new THREE.BoxGeometry(.35, .3, .35), PM.table, -1 + i * .4, .27 + (i === 1 ? .3 : 0), -.8, g); }
}
function animateDressing(p, t) {
  if (p.globe) p.globe.rotation.y = t * .25;
  if (p.ball) { const u = t * 1.3; p.ball.position.x = Math.sin(u) * .45; p.ball.rotation.z = -Math.cos(u) * 2; }
  if (p.pancake) { const c = (t * .25) % 1; p.pancake.position.y = .96 + (c > .7 && c < .85 ? Math.sin((c - .7) / .15 * Math.PI) * .25 : 0); p.pancake.rotation.x = c > .7 && c < .85 ? (c - .7) / .15 * Math.PI : 0; }
  if (p.cube) { p.cube.position.x = .3 - ((t * .2) % 1) * .7; }
  if (p.screws) { const k = Math.floor((t * 1.5) % 19); p.screws.forEach((s, i) => { s.material = i < k ? PM.cube : PM.steel; }); }
}

function paint(p) {
  if (!p.plaque) return;
  const st = stateOf(p.r.id);
  p.plaque.querySelector('.s-watch').classList.toggle('on', st.watched);
  p.plaque.querySelector('.s-try').classList.toggle('on', st.tried);
  p.sign.classList.toggle('unlocked', st.watched); p.sign.classList.toggle('done', st.tried);
  p.sign.querySelector('.l').textContent = st.tried ? 'Done · press E to replay' : st.watched ? 'Press E to try' : 'Watch the video first';
  p.ring.material = p.floorRing.material = st.watched ? M.orange : M.orangeDim;
}
function renderPassport(hereId = null) {
  const box = $('passport'); box.replaceChildren();
  RELEASES.forEach((r, i) => { const st = stateOf(r.id); const d = el('i'); d.title = `${r.code} · ${r.title}`; if (st.watched) d.classList.add('watched'); if (st.tried) d.classList.add('tried'); if (r.id === hereId) d.classList.add('here'); box.append(d); });
}
renderPassport();
DS.onChange(s => { $('datasetBtn').innerHTML = `Dataset <b>${s.episodes}</b> ep · <b>${s.frames}</b> frames`; });
$('datasetBtn').onclick = () => openDataset();
function openDataset() {
  const s = DS.stats(), rows = DS.byRelease();
  $('dsSummary').innerHTML = `<div><b>${s.episodes}</b><span>episodes</span></div><div><b>${s.frames}</b><span>frames</span></div><div><b>${s.releases}</b><span>stands</span></div><div><b>${s.seconds}s</b><span>play time</span></div><div class="lvl"><b>L${s.level}</b><span>your brain</span></div>`;
  const tb = $('dsRows'); tb.replaceChildren();
  if (!rows.length) tb.append(el('tr', null, '<td colspan="5" class="empty">No data yet. Every interaction at a TRY stand becomes a frame in your dataset.</td>'));
  for (const x of rows) tb.append(el('tr', null, `<td class="mono">${esc(x.code)}</td><td>${esc(x.stand)}</td><td>${x.episodes}</td><td>${x.frames}</td><td>${x.completed ? '✓ ' + x.completed : '–'}</td>`));
  showModal('dataset');
}
$('dsExport').onclick = () => DS.exportJSON();
$('dsClear').onclick = () => { if (confirm('Clear your local dataset?')) { DS.clear(); openDataset(); } };

// ---------- thin grid on floor and walls (reads as space, not void; stronger in dark mode) ----------
const gridMat = new THREE.LineBasicMaterial({color: '#8e8177', transparent: true, opacity: .16, toneMapped: false, depthWrite: false});
function gridLines(pts) { const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); const l = new THREE.LineSegments(g2, gridMat); l.renderOrder = 1; scene.add(l); return l; }
function addGrid(xa, xb, za, zb, h = 7.5, step = 1) {
  const p = [];
  for (let x = Math.ceil(xa); x <= xb; x += step) p.push(x, .004, za, x, .004, zb);
  for (let z = Math.ceil(za); z <= zb; z += step) p.push(xa, .004, z, xb, .004, z);
  for (const wx of [xa + .01, xb - .01]) { for (let y = step; y < h; y += step) p.push(wx, y, za, wx, y, zb); for (let z = Math.ceil(za); z <= zb; z += step * 2) p.push(wx, 0, z, wx, h, z); }
  gridLines(p);
}
addGrid(-WALL_X, WALL_X, END_Z, START_Z + 14);

// ---------- Hardware Lab (side room) + door from the hall's future zone ----------
const hw = buildHardwareLab({scene, css3d, el, M, BRAND});
const japanLab = dressJapanLab(THREE, scene, {HX, HZ: 0, HW: 28, HD: 26}); // Japanese-tech look (director's references)
// shelves: swap the box placeholders for real robot parts (exact Menagerie meshes, one body each)
const RACK_PARTS = [
  [['go2', 'FL_thigh'], ['go2', 'FL_calf'], ['g1', 'left_knee_link'], ['g1', 'left_ankle_roll_link'], ['spot', 'fl_uleg'], ['spot', 'fl_lleg'], ['h1', 'left_knee_link'], ['g1', 'left_hip_pitch_link'], ['h1', 'left_ankle_link'], ['go2', 'RR_calf']],
  [['ur5e', 'wrist_1_link'], ['ur5e', 'wrist_2_link'], ['ur5e', 'wrist_3_link'], ['ur5e', 'forearm_link'], ['g1', 'left_elbow_link'], ['g1', 'left_wrist_roll_link'], ['h1', 'left_elbow_link'], ['g1', 'left_shoulder_pitch_link'], ['ur5e', 'upper_arm_link'], ['h1', 'left_shoulder_pitch_link']],
  [['ur5e', 'base'], ['ur5e', 'shoulder_link'], ['g1', 'pelvis'], ['h1', 'pelvis'], ['spot', 'fl_hip'], ['g1', 'waist_yaw_link'], ['go2', 'FL_hip'], ['g1', 'waist_roll_link'], ['h1', 'left_hip_yaw_link'], ['g1', 'left_hip_roll_link']],
];
async function fillRacks() {
  const count = [0, 0, 0];
  for (const slot of hw.rackSlots) {
    const list = RACK_PARTS[slot.rack], [key, name] = list[count[slot.rack]++ % list.length];
    try {
      const part = await MJ.bodyPart(key, name); if (!part) continue;
      // long parts lie down; small ones are shown a little larger so they read from across the lab
      if (part.size.y > Math.max(part.size.x, part.size.z) * 1.3) { const inner = part.group.children[0]; part.group.remove(inner); const lay = new THREE.Group(); lay.rotation.z = Math.PI / 2; lay.add(inner); inner.position.x -= 0; part.group.add(lay); lay.position.y = Math.max(part.size.x, part.size.z) / 2; inner.position.y -= part.size.y / 2; }
      const big = Math.max(part.size.x, part.size.y, part.size.z), fit = Math.max(1, Math.min(2.2, .42 / big));
      part.group.scale.setScalar(Math.min(fit, .8 / big)); part.group.position.set(slot.x, slot.y, slot.z); part.group.rotation.y = slot.rot;
      slot.rackG.add(part.group); slot.placeholder.visible = false;
    } catch (e) { console.warn('rack part', key, name, e); }
  }
}
setTimeout(fillRacks, 6000);
hw.refreshArena();
addGrid(HX - 14, HX + 14, -13, 13);
const hallDoor = {x: -7, z: START_Z + 12.6};
{ const f = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.2, .12), M.black); f.position.set(hallDoor.x, 2.1, START_Z + 13.94); scene.add(f);
  const h2 = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.9), M.orange); h2.position.set(hallDoor.x, 1.95, START_Z + 13.87); h2.rotation.y = Math.PI; scene.add(h2);
  css3d(el('div', 'w-doorsign', 'Hardware Lab →<small>build a robot · teleoperate</small>'), new THREE.Vector3(hallDoor.x, 4.7, START_Z + 13.86), Math.PI, .005); }
const inHW = () => player.x > HX - 20;
// ---------- Research Wing (Pathak Lab, CMU) + door on the right of the back wall ----------
const rw = await buildResearchWing({scene, css3d, el, esc, M});
const rwDoor = {x: 7, z: START_Z + 12.6};
{ const f = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.2, .12), M.black); f.position.set(rwDoor.x, 2.1, START_Z + 13.94); scene.add(f);
  const h2 = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.9), M.orange); h2.position.set(rwDoor.x, 1.95, START_Z + 13.87); h2.rotation.y = Math.PI; scene.add(h2);
  css3d(el('div', 'w-doorsign', `Research Wing →<small>${rw.count} papers · the ideas behind Skild</small>`), new THREE.Vector3(rwDoor.x, 4.7, START_Z + 13.86), Math.PI, .005); }
const inRW = () => player.x < RX + 20;
let learners = {update() {}, nearest: () => null, teach() {}};
startLearners({scene, sceneTop, rw, getPlayer: () => player, onLearn: (L, p) => { if (inRW()) toast(`${L.spec.name.split(' ·')[0]} learned from “${p.title.split(':')[0]}”`); }}).then(x => learners = x).catch(e => console.warn('learners', e));
addGrid(rw.bounds.x0 - .6, rw.bounds.x1 + .6, rw.bounds.z0 - .6, rw.bounds.z1 + .6);

// ---------- finale: the visitor's brain core, fed by their dataset ----------
const core = (() => {
  const N = 2400, pos = new Float32Array(N * 3), base = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, r = Math.cbrt(Math.random()), s = Math.sqrt(1 - u * u); base.set([s * Math.cos(th) * r, u * r, s * Math.sin(th) * r], i * 3); }
  pos.set(base);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({color: BRAND.orange, size: .03, transparent: true, opacity: .9, toneMapped: false}));
  const g = new THREE.Group(); g.position.set(0, 2.5, START_Z + 7); g.add(pts); scene.add(g);
  const ringM = new THREE.MeshBasicMaterial({color: BRAND.black});
  for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(2.3 + i * .25, .015, 8, 96), ringM); t.rotation.set(Math.PI / 2 + i * .5, i * .8, 0); g.add(t); }
  const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.9, .5, 48), M.black); ped.position.set(0, .25, START_Z + 7); scene.add(ped);
  const panel = el('div', 'w-core');
  css3d(panel, new THREE.Vector3(0, 5.2, START_Z + 7), Math.PI, .004, 0, 0, true);
  let level = 0, target = .5;
  DS.onChange(s => {
    const tried = RELEASES.filter(r => stateOf(r.id).tried).length;
    level = s.level; target = .5 + Math.min(1.1, s.frames / 400 + tried * .08);
    panel.innerHTML = `<b>YOUR BRAIN · L${s.level}</b><span>${s.episodes} episodes · ${s.frames} frames · ${tried}/${RELEASES.length} experiments</span>`;
  });
  standMeshes.push({x: 0, z: START_Z + 7, r: 2.1});
  const board = el('div', 'w-research'); css3d(board, new THREE.Vector3(-(WALL_X - .06), 3.6, START_Z + 7), Math.PI / 2, .0052);
  window.__researchBoard = board;
  let sc = .5;
  return {update(t, dt) {
    sc += (target - sc) * Math.min(1, dt * 1.5); g.scale.setScalar(sc);
    g.rotation.y += dt * (.15 + level * .03);
    const arr = geo.attributes.position.array, k = .06 + level * .01;
    for (let i = 0; i < arr.length; i += 3) { const w = 1 + Math.sin(t * 1.7 + base[i] * 4 + base[i + 1] * 3) * k; arr[i] = base[i] * w; arr[i + 1] = base[i + 1] * w; arr[i + 2] = base[i + 2] * w; }
    geo.attributes.position.needsUpdate = true;
  }};
})();

async function refreshResearchBoard() {
  const b = window.__researchBoard; if (!b) return;
  let d = null; try { d = await (await fetch('/api/research')).json(); } catch {}
  const rel = d?.releases || {}, next = {};
  for (const r of Object.values(rel)) for (const [k, v] of Object.entries(r.next)) next[k] = (next[k] || 0) + v;
  const top = Object.entries(next).sort((a, c) => c[1] - a[1]).slice(0, 6), max = top[0]?.[1] || 1;
  const rows = RELEASES.map(r => { const x = rel[r.id]; return `<tr><td class="c">${esc(r.code)}</td><td>${esc(r.title)}</td><td>${x?.episodes || 0}</td><td>${x?.votes ? (x.useful / x.votes).toFixed(1) + ' / 5' : '–'}</td></tr>`; }).join('');
  b.innerHTML = `<p class="k">Research board · live from visitors</p><h2>What should robots learn next?</h2>
    <div class="bars">${top.length ? top.map(([k, v]) => `<div class="bar"><span>${esc(k)}</span><i style="width:${Math.round(v / max * 100)}%"></i><b>${v}</b></div>`).join('') : '<p class="empty">No votes yet. Finish a stand and tell the lab.</p>'}</div>
    <table><thead><tr><th></th><th>Experiment</th><th>Shared episodes</th><th>Clarity</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="foot">${d ? `${d.totals.episodes} contributed episodes · ${d.totals.feedback} responses` : 'Lab server offline: research board is local only'}</p>`;
  syncHoles();
}
refreshResearchBoard(); setInterval(refreshResearchBoard, 15000);

// ---------- input ----------
const held = new Set();
let playing = false, modalOpen = false;
const KEYMAP = {KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run'};
addEventListener('keydown', e => {
  if (e.target.closest?.('input, textarea')) return;
  if (modalOpen) { if (e.code === 'Escape') closeModals(); return; }
  if (KEYMAP[e.code]) { held.add(KEYMAP[e.code]); e.preventDefault(); }
  if (e.code === 'KeyE' || e.code === 'Enter') interact();
  if (e.code === 'KeyT') openTimeline();
  if (e.code === 'KeyN' || e.code === 'PageDown') jump(1);
  if (e.code === 'KeyB' || e.code === 'PageUp') jump(-1);
  if (e.code === 'KeyG') openDataset();
  if (e.code === 'KeyM') $('muteBtn').click();
  if (e.code === 'KeyL') $('themeBtn').click();
  if (e.code === 'KeyV') toggleView();
  if (e.code === 'KeyC') { cine.enabled = !cine.enabled; toast(cine.enabled ? 'Film look on' : 'Film look off'); }
  if (e.code === 'KeyH') openHeroes();
  if (e.code === 'Space') { e.preventDefault(); guideNext(); }
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) held.delete(KEYMAP[e.code]); });
addEventListener('blur', () => held.clear());
canvas.addEventListener('click', () => { if (!modalOpen && $('intro').hidden) lock(); });
function lock() { canvas.requestPointerLock?.()?.catch?.(() => {}); }
function unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
document.addEventListener('pointerlockchange', () => { playing = document.pointerLockElement === canvas; document.body.classList.toggle('playing', playing); });
document.addEventListener('mousemove', e => {
  if (!playing) return;
  look.yaw -= e.movementX * .0022; look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - e.movementY * .0022));
});
// drag-to-look fallback (no pointer lock, touch)
let drag = null;
canvas.addEventListener('pointerdown', e => { if (!playing) drag = {x: e.clientX, y: e.clientY}; });
addEventListener('pointerup', () => drag = null);
addEventListener('pointermove', e => { if (!drag || playing) return; look.yaw -= (e.clientX - drag.x) * .004; look.pitch = Math.max(-1.2, Math.min(1.2, look.pitch - (e.clientY - drag.y) * .004)); drag = {x: e.clientX, y: e.clientY}; });

let audioOn = false;
// the intro has the lab's own ambience (starts on the first click / key: browsers allow sound only after a gesture)
const wake = () => { audioOn = true; audioStart(); };
addEventListener('pointerdown', wake, {once: true}); addEventListener('keydown', wake, {once: true});
let enteredAt = 0; // video sound waits a beat after you enter, then fades in
$('enter').onclick = () => { $('intro').hidden = true; enteredAt = performance.now(); audioStart(); flyIn(); lock(); };
$('enterLatest').onclick = () => { $('intro').hidden = true; enteredAt = performance.now(); audioStart(); teleport(layout.length - 1); sfx.whoosh(); lock(); };
$('muteBtn').onclick = () => { $('muteBtn').textContent = toggleMute() ? 'Sound off' : 'Sound on'; };
$('muteBtn').textContent = isMuted() ? 'Sound off' : 'Sound on';
let flyT = 1; function flyIn() { flyT = 0; sfx.whoosh(); }
$('timelineBtn').onclick = openTimeline;
document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeModals);
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModals(); }));

// ---------- proximity & interaction ----------
let focus = null; // {kind: 'watch'|'try', p}
function updateFocus() {
  let best = null, bestD = Infinity;
  for (const p of pav) {
    const dw = Math.hypot(player.x - p.L.watchSpot.x, player.z - p.L.watchSpot.z);
    const dt = Math.hypot(player.x - p.L.stand.x, player.z - p.L.stand.z);
    if (dw < 6 && dw < bestD) { best = {kind: 'watch', p}; bestD = dw; }
    if (dt < 3.4 && dt < bestD) { best = {kind: 'try', p}; bestD = dt; }
  }
  if (best && (!focus || focus.p !== best.p || focus.kind !== best.kind || focus.to !== best.to)) sfx.near();
  if (!best) {
    const ex = inRW() ? rw.nearest(player.x, player.z) : null, lr = inRW() ? learners.nearest(player.x, player.z) : null;
    if (lr) best = {kind: 'learner', lr, ex};
    else if (ex) best = {kind: 'paper', ex};
    else if (Math.hypot(player.x - rwDoor.x, player.z - rwDoor.z) < 2.6) best = {kind: 'door', to: 'rw'};
    else if (inRW() && Math.hypot(player.x - rw.door.x, player.z - rw.door.z) < 2.6) best = {kind: 'door', to: 'hall-rw'};
    else if (player.x < -WALL_X + 5 && Math.abs(player.z - (END_Z + 7)) < 6) best = {kind: 'investors'};
    else if (Math.hypot(player.x - hallDoor.x, player.z - hallDoor.z) < 2.6) best = {kind: 'door', to: 'hw'};
    else if (Math.hypot(player.x - hw.door.x, player.z - hw.door.z) < 2.6) best = {kind: 'door', to: 'hall'};
    else for (const s of hw.stations) if (Math.hypot(player.x - s.L.stand.x, player.z - s.L.stand.z) < 2.4) { best = {kind: 'try', p: s}; }
  }
  focus = best;
  const pr = $('prompt');
  if (!best || modalOpen) { pr.hidden = true; return; }
  pr.hidden = false;
  if (best.kind === 'learner') { pr.classList.remove('locked'); $('promptText').textContent = best.ex ? `Show ${best.lr.spec.name.split(' ·')[0]} “${best.ex.p.title.split(':')[0].slice(0, 36)}”` : `${best.lr.spec.name} · ${best.lr.skills.length} skills learned`; return; }
  if (best.kind === 'paper') { pr.classList.remove('locked'); $('promptText').textContent = `${best.ex.p.year} · ${best.ex.p.title.slice(0, 48)}${best.ex.p.title.length > 48 ? '…' : ''}`; return; }
  if (best.kind === 'investors') { pr.classList.remove('locked'); $('promptText').textContent = 'Investors · visit their official sites'; return; }
  if (best.kind === 'door') { pr.classList.remove('locked'); $('promptText').textContent = best.to === 'hw' ? 'Enter the Hardware Lab' : best.to === 'rw' ? 'Enter the Research Wing' : 'Back to the Release Hall'; return; }
  const st = stateOf(best.p.r.id);
  pr.classList.toggle('locked', best.kind === 'try' && !st.watched);
  $('promptText').textContent = best.kind === 'watch' ? `Watch · ${best.p.r.title}` : st.watched ? `Try · ${best.p.r.try.title}` : 'Watch the video first. Press E to open it';
}
function interact() {
  if (!focus) return;
  if (focus.kind === 'door') { enterRoom(focus.to); return; }
  if (focus.kind === 'investors') { openInvestors(); return; }
  if (focus.kind === 'paper') { openPaper(focus.ex.p); return; }
  if (focus.kind === 'learner') { if (focus.ex) { learners.teach(focus.lr, rw.exhibits.indexOf(focus.ex)); toast(`${focus.lr.spec.name.split(' ·')[0]} is heading to “${focus.ex.p.title.split(':')[0]}” · watch together for 2× learning`); } return; }
  if (focus.p.r.kind === 'hardware') { openTry(focus.p); return; }
  if (focus.kind === 'watch' || !stateOf(focus.p.r.id).watched) openCinema(focus.p); else openTry(focus.p);
}

// ---------- in-world video: only the nearest mp4 screen plays ----------
// a YouTube player that talks back is alive: fade it in over the poster
addEventListener('message', e => {
  if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
  for (const p of pav) if (p.yt && e.source === p.yt.contentWindow) { let d = {}; try { d = JSON.parse(e.data); } catch {} if (d.event === 'onError') { p.yt.remove(); p.yt = null; p.ytFailed = true; continue; } if (d.event === 'onReady' || d.event === 'infoDelivery' || d.event === 'initialDelivery') { p.ytOk = true; p.yt.style.opacity = 1; } }
});
function ytCmd(f, func, args = []) { try { f.contentWindow?.postMessage(JSON.stringify({event: 'command', func, args}), '*'); } catch {} }
// nearest screen plays (mp4 and YouTube); its sound fades in with distance, like walking past a real screen
function updateScreens() {
  let near = null, nd = 18;
  for (const p of pav) { const d = Math.hypot(player.x - p.L.watchSpot.x, player.z - p.L.watchSpot.z); if (d < nd) { nd = d; near = p; } }
  // the intro (name entry) shows the lab as a silent backdrop: screens play, but without sound
  const settle = Math.max(0, Math.min(1, (performance.now() - enteredAt - 1000) / 1500)); // 1 s of quiet, then 1.5 s fade-in
  const vol = near && !modalOpen && !isMuted() && audioOn && $('intro').hidden ? Math.max(0, Math.min(1, 1 - (nd - 2) / 12)) * settle : 0;
  for (const p of pav) {
    const want = p === near && !modalOpen, v0 = p.r.videos[0];
    if (p.screenVideo) {
      if (want && !p.playing) { if (!p.screenVideo.src) p.screenVideo.src = p.screenVideo.dataset.src; p.screenVideo.play().catch(() => {}); p.playing = true; }
      else if (!want && p.playing) { p.screenVideo.pause(); p.screenVideo.muted = true; p.playing = false; }
      if (want) { p.screenVideo.muted = vol <= 0; p.screenVideo.volume = vol * .8; }
    } else if (v0.type === 'youtube') {
      if (want && !p.yt && !p.ytFailed) {
        // YouTube needs to know the embedding site (origin + referrer) or it can stay black on a hosted page;
        // if the player never answers, drop it and keep the poster ("Press E to watch") instead of a black screen
        const f = el('iframe'); f.allow = 'autoplay; encrypted-media'; f.referrerPolicy = 'strict-origin-when-cross-origin'; f.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;opacity:0;transition:opacity .6s';
        f.src = `https://www.youtube-nocookie.com/embed/${v0.id}?autoplay=1&mute=1&loop=1&playlist=${v0.id}&controls=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}&widget_referrer=${encodeURIComponent(location.href.split('?')[0])}`;
        f.onload = () => f.contentWindow?.postMessage(JSON.stringify({event: 'listening', id: v0.id}), '*'); // ask the player to report its state
        p.screenEl.append(f); p.yt = f; p.ytVol = -1; p.ytOk = false;
        const me = f; setTimeout(() => { if (p.yt === me && !p.ytOk) { me.remove(); p.yt = null; p.ytFailed = true; } }, 5000);
      } else if (!want && p.yt) { p.yt.remove(); p.yt = null; }
      if (want && p.yt) { const v = Math.round(vol * 80); if (v !== p.ytVol) { if (v > 0) { ytCmd(p.yt, 'unMute'); ytCmd(p.yt, 'setVolume', [v]); } else ytCmd(p.yt, 'mute'); p.ytVol = v; } }
    }
  }
}

// ---------- cinema ----------
let cinemaP = null, cinemaTimer = 0;
function playerFor(v) {
  const box = $('player'); box.replaceChildren();
  if (v.type === 'youtube') {
    const f = el('iframe'); f.src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&rel=0&modestbranding=1`; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true; f.title = v.title; box.append(f);
  } else {
    const vid = el('video'); Object.assign(vid, {src: v.src, controls: true, autoplay: true, playsInline: true}); if (v.poster) vid.poster = v.poster; box.append(vid);
  }
}
function openCinema(p) {
  cinemaP = p; const r = p.r;
  $('cinemaCode').textContent = `${r.code} · ${fmtDate(r.date)}`;
  $('cinemaTitle').textContent = r.title; $('cinemaSub').textContent = r.subtitle; $('cinemaSummary').textContent = r.summary;
  $('cinemaPoints').replaceChildren(...r.points.map(t => el('li', null, esc(t))));
  $('cinemaBlog').href = r.url;
  const pl = $('playlist'); pl.replaceChildren();
  r.videos.forEach((v, i) => { const b = el('button', i === 0 ? 'active' : '', `${v.poster ? `<img src="${esc(v.poster)}" alt="">` : '<img alt="">'}${esc(v.title)}`); b.onclick = () => { pl.querySelectorAll('button').forEach(x => x.classList.remove('active')); b.classList.add('active'); playerFor(v); }; pl.append(b); });
  pl.hidden = r.videos.length < 2;
  showModal('cinema'); sfx.open(); // first: showModal() clears every modal's player, so the video goes in after it
  playerFor(r.videos[0]);
  // "watched" = the cinema stayed open for a few seconds (or the visitor jumps to TRY from here)
  clearTimeout(cinemaTimer); cinemaTimer = setTimeout(() => markWatched(p), 6000);
}
function markWatched(p) {
  const st = stateOf(p.r.id); if (st.watched) return;
  st.watched = true; sfx.unlock(); saveProgress(); paint(p); renderPassport(p.r.id); toast(`TRY stand unlocked · ${p.r.try.title}`);
}
$('toTry').onclick = () => { const p = cinemaP; markWatched(p); closeModals(); openTry(p); };

// ---------- TRY ----------
let unmountTry = null, episode = null;
// capture visitor inputs inside a TRY stand as dataset frames
{ const root = $('tryRoot'); let dragging = false;
  root.addEventListener('pointerdown', () => { dragging = true; episode?.input('pointer'); });
  addEventListener('pointerup', () => dragging = false);
  root.addEventListener('pointermove', () => { if (dragging) episode?.input('drag'); });
  addEventListener('keydown', () => { if (!$('try').hidden) episode?.input('key'); }); }

// picture-in-picture: the real robot doing it, from the official video
function mountPip(r) {
  const box = $('pip'); box.replaceChildren(); box.hidden = false; box.classList.remove('min');
  const vids = r.videos; let i = Math.min(r.try.pip ?? 0, vids.length - 1);
  const media = el('div', 'pip-media'), bar = el('div', 'pip-bar');
  const show = () => {
    const v = vids[i]; media.replaceChildren();
    if (v.type === 'youtube') { const f = el('iframe'); f.src = `https://www.youtube-nocookie.com/embed/${v.id}?autoplay=1&mute=1&loop=1&playlist=${v.id}&controls=0&rel=0&modestbranding=1&playsinline=1`; f.allow = 'autoplay; encrypted-media'; f.title = v.title; media.append(f); }
    else { const m = el('video'); Object.assign(m, {src: v.src, muted: true, autoplay: true, loop: true, playsInline: true}); if (v.poster) m.poster = v.poster; media.append(m); }
    title.textContent = v.title;
  };
  const title = el('span', 'pip-title');
  const label = el('span', 'pip-label', 'Real robot · official video');
  const next = el('button', 'pip-btn', vids.length > 1 ? 'Next clip' : ''); next.hidden = vids.length < 2; next.onclick = () => { i = (i + 1) % vids.length; show(); };
  const min = el('button', 'pip-btn', '–'); min.title = 'Minimize'; min.onclick = () => box.classList.toggle('min');
  bar.append(label, title, next, min); box.append(media, bar); show();
  // stands can switch the real-robot clip: api.clip(index) or api.clip('pancakes') (matches title or file name)
  pipSelect = m => { const n = typeof m === 'number' ? m : vids.findIndex(v => (v.title + ' ' + (v.src || v.id)).toLowerCase().includes(String(m).toLowerCase())); if (n >= 0 && n !== i) { i = n; show(); } };
}
let pipSelect = null;
async function openTry(p) {
  const r = p.r; markWatched(p);
  $('tryCode').textContent = `TRY · ${r.code} · ${r.title}`; $('tryTitle').textContent = r.try.title; $('tryBlurb').textContent = r.try.blurb;
  const status = $('tryStatus'); const st = stateOf(r.id);
  status.textContent = st.tried ? 'Completed' : 'In progress'; status.classList.toggle('done', st.tried);
  const root = $('tryRoot'); root.replaceChildren();
  showModal('try'); sfx.open();
  mountPip(r);
  episode = DS.startEpisode(r);
  const api = {
    release: r, brand: BRAND,
    status(text) { status.textContent = text; },
    record(kind, data) { episode?.record(kind, data); },
    clip(match) { pipSelect?.(match); },
    complete(text = 'Completed') {
      status.textContent = text; status.classList.add('done'); episode?.complete();
      if (!st.tried) { sfx.complete(); st.tried = true; saveProgress(); paint(p); renderPassport(p.r.id); toast(`${r.code} complete · ${r.try.title}`); }
    },
  };
  try {
    const mod = await import(`./try/${r.try.module}.js`);
    if ($('try').hidden) return;
    unmountTry = mod.default(root, api) || null;
  } catch (err) {
    console.warn('TRY stand not built yet:', r.try.module, err);
    root.append(el('div', 'try-missing', `<p class="eyebrow">Stand under construction</p><h3>${esc(r.try.title)}</h3><p>${esc(r.try.blurb)}</p>`));
  }
}

// ---------- timeline ----------
function openTimeline() {
  const ol = $('timelineList'); ol.replaceChildren();
  ORDER.forEach(r => {
    const i = layout.findIndex(L => L.r === r), st = stateOf(r.id);
    const b = el('button', null, `<span class="d">${esc(fmtDate(r.date))}</span><span class="t">${esc(r.title)}<small>${esc(r.subtitle)}</small></span><span class="s ${st.tried ? 'tried' : ''}">${st.tried ? 'TRIED' : st.watched ? 'WATCHED' : r.code}</span>`);
    b.onclick = () => { teleport(i); closeModals(); lock(); };
    ol.append(el('li')).append(b);
  });
  showModal('timeline');
}
// ---------- guided walk: Space glides to the next point of interest (screen → stand → next bay) ----------
let glide = null;
function guideNext() {
  const L0 = layout[Math.max(0, hereIdx)];
  const atWatch = Math.hypot(player.x - L0.watchSpot.x, player.z - L0.watchSpot.z) < 1.2;
  const atStand = Math.hypot(player.x - (L0.stand.x - L0.side * 2.3), player.z - L0.stand.z) < 1.2;
  let L = L0, kind = 'watch';
  if (atWatch) kind = 'stand'; else if (atStand) { L = layout[Math.min(layout.length - 1, layout.indexOf(L0) + 1)]; kind = 'watch'; }
  const to = kind === 'watch' ? {x: L.watchSpot.x - L.side * .3, z: L.watchSpot.z, yaw: L.side > 0 ? -Math.PI / 2 : Math.PI / 2}
                              : {x: L.stand.x - L.side * 2.3, z: L.stand.z, yaw: L.side > 0 ? -Math.PI / 2 : Math.PI / 2};
  glide = {fx: player.x, fz: player.z, fy: look.yaw, ...to, t: 0, d: Math.min(2.2, .6 + Math.hypot(to.x - player.x, to.z - player.z) / 9)};
  sfx.whoosh();
}
function updateGlide(dt) {
  if (!glide) return;
  glide.t = Math.min(1, glide.t + dt / glide.d); const e = glide.t < .5 ? 2 * glide.t ** 2 : 1 - (-2 * glide.t + 2) ** 2 / 2;
  player.x = glide.fx + (glide.x - glide.fx) * e; player.z = glide.fz + (glide.z - glide.fz) * e;
  let dy = glide.yaw - glide.fy; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); look.yaw = glide.fy + dy * e; look.pitch += (-0.02 - look.pitch) * .1;
  player.vx = player.vz = 0;
  if (glide.t >= 1) glide = null;
}
function openPaper(p) {
  showModal('paperModal'); sfx.open(); // first: showModal() clears the media box
  $('paperMeta').textContent = `${p.year} · ${p.venue}${p.award ? ' · ' + p.award : ''}`;
  $('paperTitle').textContent = p.title; $('paperAuthors').textContent = p.authors; $('paperIdea').textContent = p.idea;
  $('paperRobot').textContent = p.robot ? `Robot: ${p.robot}` : ''; $('paperSkild').textContent = p.skild?.release ? `In Skild: ${p.skild.why || ''}` : '';
  const box = $('paperMedia'); box.replaceChildren();
  if (p.media?.type === 'mp4') { const v = el('video'); Object.assign(v, {src: p.media.teaser, autoplay: true, loop: true, muted: true, playsInline: true, controls: true}); box.append(v); } else if (p.media?.teaser) { const im = el('img'); im.src = p.media.teaser; im.alt = p.title; box.append(im); }
  const links = $('paperLinks'); links.replaceChildren();
  for (const [k, u] of Object.entries(p.links || {})) { if (!u) continue; const a = el('a', 'btn ghost', `${k === 'webpage' ? 'Project page' : k === 'arxiv' ? 'arXiv' : k[0].toUpperCase() + k.slice(1)} ↗`); a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a); }
  const rel = p.skild?.release && pav.find(x => x.r.id === p.skild.release);
  const tryBtn = $('paperTry'); tryBtn.hidden = !(rel || p.try); tryBtn.textContent = p.try ? `Try it: ${p.tryTitle || 'the stand'} →` : rel ? `Try it: ${rel.r.try.title} →` : '';
  tryBtn.onclick = () => { closeModals(true); if (p.try) openTry({r: {id: 'rw-' + p.id, code: 'RW', kind: 'hardware', title: p.title, subtitle: 'Research Wing', url: p.links?.webpage, summary: p.idea, points: [], videos: p.videos || [{type: 'mp4', src: p.media.teaser, poster: null, title: p.title}], try: {module: p.try, title: p.tryTitle, blurb: p.tryBlurb || ''}}, L: {i: 200, side: 1}}); else if (rel) openTry(rel); };
}
function openInvestors() {
  const list = $('invList'); list.replaceChildren();
  for (const v of INVESTORS) {
    const tag = v.url ? 'a' : 'div';
    const n = el(tag, 'inv-link' + (v.url ? '' : ' nolink'), `${v.logo ? `<img src="${v.logo}" alt="">` : '<span class="ph"></span>'}<b>${esc(v.name)}</b><small>${v.rounds.map(r => (r === 'A' ? 'Series A' : 'Series C') + ((v.lead || []).includes(r) ? ' · lead' : '')).join(' · ')}</small><i>${v.url ? esc(new URL(v.url).hostname.replace(/^www\./, '')) + ' ↗' : 'no verified site'}</i>`);
    if (v.url) { n.href = v.url; n.target = '_blank'; n.rel = 'noopener noreferrer'; }
    list.append(n);
  }
  showModal('investorsModal'); sfx.open();
}
function enterRoom(to) {
  sfx.whoosh(); glide = null; player.vx = player.vz = 0;
  if (to === 'hw') { player.x = HX; player.z = hw.door.z - 1.5; look.yaw = player.yaw = 0; }
  else if (to === 'rw') { player.x = RX; player.z = rw.door.z - 1.5; look.yaw = player.yaw = 0; }
  else if (to === 'hall-rw') { player.x = rwDoor.x; player.z = rwDoor.z - 1.8; look.yaw = player.yaw = 0; }
  else { player.x = hallDoor.x; player.z = hallDoor.z - 1.8; look.yaw = player.yaw = 0; }
  look.pitch = player.pitch = -0.02; toast(to === 'hw' ? 'Hardware Lab' : to === 'rw' ? `Research Wing · ${rw.lab.name}` : 'Release Hall');
}
function jump(d) { sfx.whoosh(); const i = Math.max(0, Math.min(layout.length - 1, (hereIdx < 0 ? -1 : hereIdx) + d)); teleport(i); toast(`${layout[i].r.code} · ${layout[i].r.title}`); }
function teleport(i) { const L = layout[i]; player.x = -L.side * 2.5; player.z = L.z + 9; player.yaw = look.yaw = L.side > 0 ? -0.55 : 0.55; player.pitch = look.pitch = -0.02; player.vx = player.vz = 0; }

// ---------- modal plumbing ----------
function showModal(id) { closeModals(true); modalOpen = true; document.body.classList.add('modal-open'); held.clear(); unlock(); $(id).hidden = false; $('prompt').hidden = true; }
// ---------- research card: what visitors tell the lab (feedback + opt-in data contribution) ----------
const NEXT = ['Home chores', 'Cooking', 'Warehouse', 'Factory assembly', 'Healthcare help', 'Outdoor inspection', 'Elder care', 'Construction'];
let pendingResearch = null;
function openResearch(r, ep) {
  const box = $('research'); let useful = 0, next = '';
  box.querySelector('.rc-title').textContent = `${r.code} · ${r.try.title}`;
  const stars = box.querySelector('.rc-stars'); stars.replaceChildren(...[1, 2, 3, 4, 5].map(n => { const b = el('button', null, String(n)); b.onclick = () => { useful = n; stars.querySelectorAll('button').forEach((x, i) => x.classList.toggle('on', i < n)); }; return b; }));
  const chips = box.querySelector('.rc-chips'); chips.replaceChildren(...NEXT.map(t => { const b = el('button', null, t); b.onclick = () => { next = next === t ? '' : t; chips.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.textContent === next)); }; return b; }));
  box.querySelector('.rc-note').value = '';
  const share = box.querySelector('.rc-share'); try { share.checked = localStorage.getItem('skild-hall:share') === '1'; } catch {}
  box.querySelector('.rc-send').onclick = async () => {
    try { localStorage.setItem('skild-hall:share', share.checked ? '1' : '0'); } catch {}
    const note = box.querySelector('.rc-note').value.trim().slice(0, 500);
    const post = (u, b) => fetch(u, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(b)}).then(x => x.ok).catch(() => false);
    const ok = await post('/api/feedback', {release: r.id, useful, next, note});
    if (share.checked && ep) await post('/api/contribute', {episode: ep});
    DS.noteFeedback?.({release: r.id, useful, next, note});
    box.hidden = true; toast(ok ? 'Thanks. Your input is in the lab\'s research pool' : 'Saved locally (no lab server running)'); refreshResearchBoard();
  };
  box.querySelector('.rc-skip').onclick = () => { box.hidden = true; };
  box.hidden = false;
}
function closeModals(silent) {
  clearTimeout(cinemaTimer);
  for (const id of ['heroes', 'cinema', 'try', 'timeline', 'dataset', 'investorsModal', 'paperModal']) $(id).hidden = true;
  $('paperMedia')?.replaceChildren();
  $('player').replaceChildren();
  if (unmountTry) { try { unmountTry(); } catch {} unmountTry = null; }
  if (episode?.ep?.release === 'hw-builder') setTimeout(() => hw.refreshArena(), 100);
  if (episode) { const ep = episode.end(); episode = null; if (ep.frames) toast(`+${ep.frames} frames to your dataset`); const r = RELEASES.find(x => x.id === ep.release); if (r && (ep.completed || ep.frames > 25)) pendingResearch = {r, ep}; }
  $('pip').replaceChildren(); $('pip').hidden = true;
  $('tryRoot').replaceChildren();
  if (modalOpen && !silent) sfx.close();
  modalOpen = false; document.body.classList.remove('modal-open');
  if (pendingResearch) { const {r, ep} = pendingResearch; pendingResearch = null; setTimeout(() => openResearch(r, ep), 250); silent = true; }
  if (!silent && $('intro').hidden) lock();
}
let toastT = 0;
function toast(t) { const n = $('toast'); n.textContent = t; n.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => n.classList.remove('show'), 3200); }

// ---------- movement ----------
let stepAcc = 0;
function blocked(x, z) {
  if (x < RX + 20) return rw.blocked(x, z);
  if (x > HX - 20) return hw.blocked(x, z);
  if (Math.abs(x) > WALL_X - .6 || z > START_Z + 13 || z < END_Z + .8) return true;
  if (Math.abs(x) > WALL_X - 3.35 && layout.some(L => Math.abs(z - (L.z + SPACING / 2)) < .35)) return true;
  return standMeshes.some(s => Math.hypot(x - s.x, z - s.z) < s.r);
}
function move(dt) {
  if (modalOpen || !$('intro').hidden && !playing) return;
  const f = (held.has('f') ? 1 : 0) - (held.has('b') ? 1 : 0), s = (held.has('r') ? 1 : 0) - (held.has('l') ? 1 : 0);
  const l = Math.hypot(f, s) || 1, top = held.has('run') ? 15 : 8.5;
  const wx = (-Math.sin(player.yaw) * f + Math.cos(player.yaw) * s) / l * top, wz = (-Math.cos(player.yaw) * f - Math.sin(player.yaw) * s) / l * top;
  const k = 1 - Math.exp(-dt * (f || s ? 9 : 12)); player.vx += (wx - player.vx) * k; player.vz += (wz - player.vz) * k;
  if (Math.hypot(player.vx, player.vz) < .02) { player.vx = player.vz = 0; return; }
  const dx = player.vx * dt, dz = player.vz * dt;
  const ox = player.x, oz = player.z;
  if (!blocked(player.x + dx, player.z)) player.x += dx;
  if (!blocked(player.x, player.z + dz)) player.z += dz;
  stepAcc += Math.hypot(player.x - ox, player.z - oz); if (stepAcc > (held.has('run') ? 2 : 1.45)) { stepAcc = 0; sfx.step(); }
}

// ---------- deep links: ?release=<id> starts at that pavilion, &present opens its video ----------
const params = new URLSearchParams(location.search);
const deep = layout.findIndex(L => L.r.id === params.get('release'));
if (deep < 0) teleport(0); // default: stand in front of the newest release
if (deep >= 0) { teleport(deep); $('intro').hidden = true; if (params.has('present')) setTimeout(() => openCinema(pav[deep]), 300); }

// debug: a turntable to inspect any robot from any side (?debug only)
let debugCam = null, inspectBot = null;
if (params.has('debug')) window.__inspect = async (key, angle = 0, dist = 1.6, h = 1.1) => {
  if (!key) { debugCam = null; inspectBot?.dispose(); inspectBot = null; return 'off'; }
  if (inspectBot?.key !== key) { inspectBot?.dispose(); inspectBot = await MJ.spawn(key, {shared: true}); upgradeRobot(THREE, inspectBot.group); scene.add(inspectBot.group); }
  const c = new THREE.Vector3(player.x, 0, player.z - 4); inspectBot.group.position.copy(c);
  debugCam = {pos: new THREE.Vector3(c.x + Math.sin(angle) * dist, h, c.z + Math.cos(angle) * dist), at: new THREE.Vector3(c.x, h * .85, c.z)};
  return key + ' @ ' + angle.toFixed(2);
};
// debug hook for automated checks
if (params.has('debug')) window.__hall = () => ({x: player.x, z: player.z, yaw: player.yaw, focus: focus && {kind: focus.kind, id: focus.p?.r.id || focus.to}, modalOpen, playing, progress});
if (params.has('debug')) Object.assign(window, {__scene: scene, __camera: camera, __hallTeleport: teleport, __hallGo: (x, z, yaw = player.yaw) => { Object.assign(player, {x, z, yaw, vx: 0, vz: 0}); look.yaw = yaw; }, __flippers: flippers, __hallTry: id => openTry(pav.find(p => p.r.id === id) || hw.stations.find(s => s.r.id === id)), __hallWatch: id => openCinema(pav.find(p => p.r.id === id)), __hallLayout: layout.map(L => ({id: L.r.id, watch: [L.watchSpot.x, L.watchSpot.z], stand: [L.stand.x, L.stand.z], side: L.side}))});

// ---------- presence: other visitors, live ----------
let visitorName = (() => { try { return localStorage.getItem('skild-hall:name') || ''; } catch { return ''; } })();
$('nameInput').value = visitorName;
$('nameInput').addEventListener('input', e => { visitorName = e.target.value.trim().slice(0, 24); try { localStorage.setItem('skild-hall:name', visitorName); } catch {} });
const doing = () => !$('try').hidden ? `Trying · ${$('tryTitle').textContent}` : !$('cinema').hidden ? `Watching · ${$('cinemaTitle').textContent}` : '';
const presenceLink = startPresence({scene, sceneTop, room: params.get('room') || 'lab',
  getState: () => ({name: visitorName || 'Visitor', x: +player.x.toFixed(2), z: +player.z.toFixed(2), yaw: +player.yaw.toFixed(3), doing: doing(), level: DS.stats().level}),
  onCount: n => { $('online').textContent = `${n} in the lab`; $('online').classList.toggle('multi', n > 1); }});

// ---------- dark mode: UI (CSS vars), 3D lab (materials, fog, light) and TRY stand canvases (shared BRAND palette) ----------
const LIGHT = {...BRAND};
const DARK = {...BRAND, black: '#F2F0EB', ink: '#E6E4DD', white: '#262a2f', warm1: '#1e2125', warm2: '#363b41', warm3: '#474d54', warm4: '#8E8177', cool1: '#4A535C', cool2: '#9AA3AB', cool3: '#C7CDD2', cool4: '#E3E6E9'};
const SCENE_THEME = {
  // dark = black product studio (spot pools, floor fading to black); light = bright showroom (glowing ceiling, cool carpet)
  dark: {floor: '#3a3b3c', wall: '#141617', fog: '#07090a', sky: '#ffffff', ground: '#000000', hemi: .12, sun: .2, glass: '#3a3f42', dim: '#e9c37a', plinth: '#1a1c1d', bench: '#222526', exposure: .9, near: 12, far: 85, line: '#b8883a', rough: .62,
    grade: {shadowTint: [1, 1, 1], highTint: [1, .975, .93], liftC: [.004, .004, .004], vig: .7}},
  light: {floor: '#7a8086', wall: '#b7bdc2', fog: '#c9ced2', sky: '#f2f4f6', ground: '#8a9096', hemi: .8, sun: .75, glass: '#dfe6ea', dim: '#f3c79b', plinth: '#e8edf0', bench: '#d0d8dd', exposure: .9, near: 26, far: 100, line: '#d9a441', rough: .95,
    grade: {shadowTint: [.93, .97, 1.04], highTint: [.98, 1, 1.02], liftC: [.02, .024, .03], vig: .3}},
};
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  Object.assign(BRAND, t === 'dark' ? DARK : LIGHT);
  document.documentElement.dataset.film = t === 'film' ? '1' : '';
  const s = SCENE_THEME[t];
  M.floor.color.set(s.floor); M.wall.color.set(s.wall); M.glass.color.set(s.glass); M.orangeDim.color.set(s.dim);
  scene.fog.color.set(s.fog); hemi.color.set(s.sky); hemi.groundColor.set(s.ground); hemi.intensity = s.hemi; sun.intensity = s.sun;
  scene.fog.near = s.near || 30; scene.fog.far = s.far || 95; M.orange.color.set(s.line || BRAND.orange);
  M.floor.roughness = s.rough ?? .5; corridor.setTheme(t); cine.set(s.grade || {});
  gridMat.color.set(t === 'dark' ? '#9aa3ab' : '#8e8177'); gridMat.opacity = t === 'dark' ? 0 : .13;
  ROBOT_MAT.plinth.color.set(s.plinth); ROBOT_MAT.light.color.set(s.bench); renderer.toneMappingExposure = s.exposure;
  $('themeBtn').textContent = t === 'dark' ? 'Light' : 'Dark';
  for (const f of floorDates) f.draw();
  try { localStorage.setItem('skild-hall:look', t); } catch {}
}
let theme = (() => { try { return localStorage.getItem('skild-hall:look'); } catch { return null; } })(); if (theme !== 'light') theme = 'dark';
applyTheme(theme);
$('themeBtn').onclick = () => { theme = theme === 'dark' ? 'light' : 'dark'; applyTheme(theme); };

// ---------- hero picker (intro card + H) ----------
function heroButtons(box, after) {
  box.replaceChildren(...HEROES.map(h => { const b = el('button', 'hero-btn' + (h.id === heroId ? ' on' : ''), `<b>${h.name}</b><span>${h.role}</span>`);
    b.onclick = () => { heroId = h.id; try { localStorage.setItem('skild-hall:hero', h.id); } catch {} heroes.pick(h.id); box.querySelectorAll('.hero-btn').forEach(x => x.classList.toggle('on', x === b)); sfx.near(); after?.(); }; return b; }));
}
heroButtons($('heroRow'));
function toggleView() { const v = heroes.toggleView(); $('viewBtn').firstChild.textContent = v === 'third' ? '3rd person ' : '1st person '; toast(v === 'third' ? 'Third person' : 'First person'); }
$('viewBtn').onclick = toggleView; $('heroBtn').onclick = () => openHeroes();
function openHeroes() { unlock(); modalOpen = true; document.body.classList.add('modal-open'); heroButtons($('heroGrid'), () => closeModals()); $('heroes').hidden = false; }

// CSS3D ignores walls: signs from another room showed through them. Only the current room's signs stay visible.
const roomOf = x => x > HX - 20 ? 'hw' : x < RX + 20 ? 'rw' : 'hall';
const cssRoom = new Map(), wp = new THREE.Vector3();
let litRoom = '';
function cullCssByRoom() {
  const here = roomOf(player.x);
  if (here !== litRoom) { litRoom = here; japanLab.group.traverse(o => { if (o.isLight) { o.userData.on ??= o.intensity; o.intensity = here === 'hw' ? o.userData.on : 0; } }); corridor.setLit(here === 'hall'); } // lights only where you are
  for (const sc of [sceneTop, sceneUnder]) sc.traverse(o => {
    if (!o.isCSS3DObject || o.element.classList.contains('w-peer')) return; // visitors move: never cached
    if (!cssRoom.has(o)) { o.getWorldPosition(wp); cssRoom.set(o, roomOf(wp.x)); }
    const show = cssRoom.get(o) === here;
    if (o.userData.roomHidden !== !show) { o.userData.roomHidden = !show; o.element.style.visibility = show ? '' : 'hidden'; }
  });
}

// ---------- loop ----------
let last = performance.now(), hereIdx = -2, frameCount = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now; frameCount++;
  { const k = 1 - Math.exp(-dt * 16); player.yaw += (look.yaw - player.yaw) * k; player.pitch += (look.pitch - player.pitch) * k; }
  if (held.size) glide = null;
  updateGlide(dt);
  move(dt);
  presenceLink.update(dt, camera);
  heroes.update(player, dt, now / 1000);
  heroes.cameraFor(player, camera, dt, blocked);
  if (debugCam) { camera.position.copy(debugCam.pos); camera.lookAt(debugCam.at); }
  if (flyT < 1) { flyT = Math.min(1, flyT + dt / 2.6); const e = 1 - (1 - flyT) ** 3; camera.position.y += (1 - e) * 4.2; camera.position.z += (1 - e) * 3.5; camera.rotateX(-(1 - e) * .42); }
  { const sx = Math.round(player.x / 2) * 2, sz = Math.round(player.z / 2) * 2; sun.position.set(sx + 6, 14, sz + 4); sun.target.position.set(sx, 0, sz - 4); }
  if (!inHW() && !inRW()) corridor.update(player.x, player.z, player.yaw);
  if (player.z - START_Z > -40) core.update(now / 1000, dt);
  if (inHW()) hw.update(now / 1000, dt);
  if (inRW() && frameCount % 10 === 0) rw.update(player.x, player.z);
  if (inRW()) learners.update(now / 1000, dt, camera);
  for (const p of pav) { if (Math.abs(p.L.z - player.z) < 40) { p.bot.update(now / 1000, dt); for (const b of p.real) b.update(now / 1000, dt); animateDressing(p, now / 1000); } p.holo.rotation.y += dt * .8; p.holo.rotation.x += dt * .3; p.holo.position.y = 1.75 + Math.sin(now / 700 + p.L.i) * .06; }
  for (const b of billboards) b.rotation.y = Math.atan2(camera.position.x - b.position.x, camera.position.z - b.position.z);
  if (frameCount % 3 === 0) updateFlippers();
  if (frameCount % 15 === 1) cullCssByRoom();
  if (frameCount % 6 === 0) {
    updateFocus(); updateScreens();
    const idx = layout.reduce((bi, L, i) => Math.abs(L.z + 4 - player.z) < Math.abs(layout[bi].z + 4 - player.z) ? i : bi, 0);
    if (inHW()) { $('where').textContent = 'HARDWARE LAB · build · teleoperate · test'; } else if (inRW()) { $('where').textContent = `RESEARCH WING · ${rw.lab.name}`; } else if (idx !== hereIdx) { hereIdx = idx; const r = layout[idx].r; renderPassport(r.id); $('where').textContent = `${r.code} · ${fmtDate(r.date)} · ${r.title}`; }
    $('miniDot').style.left = (100 * Math.max(0, Math.min(1, (START_Z - player.z) / (START_Z - layout.at(-1).z)))) + '%';
  }
  cine.render(scene, camera, dt); css.render(sceneUnder, camera); cssTop.render(sceneTop, camera);
  if (frameCount === 1) { syncHoles(); setTimeout(syncHoles, 800); setTimeout(syncHoles, 3000); document.fonts?.ready.then(syncHoles); }
}
requestAnimationFrame(frame);
