// Hardware Lab · "Build your robot": snap parts onto a body in a live 3D preview, from a robot dog to a humanoid.
// Test drive it with one brain (the gait adapts to any leg count and length), compare with a quadruped-only
// specialist that falls over on other bodies, then activate it: the config is saved for the lab room.
import * as THREE from '../../vendor/three.module.js';
import {kit, B, clamp} from './kit.js';
import {buildRobotMesh, resolveConfig, robotSpecs, conflictHint, CATALOG, PRESETS, RANGES} from '../hw-robot.js';

const PANEL = 256, STORE = 'skild-hall:myRobot', PATH_R = 1.3;
const CATS = [['torso', 'Torso'], ['loco', 'Locomotion'], ['arms', 'Arms'], ['hands', 'Hands'], ['head', 'Head · sensors'], ['battery', 'Battery']];
const SLIDERS = [['legLen', 'Leg length', 'm', .01], ['armLen', 'Arm length', 'm', .01], ['payload', 'Payload', 'kg', 1]];
const PRESET_LIST = [['dog', 'Robot dog'], ['humanoid', 'Humanoid'], ['mobile', 'Mobile manipulator'], ['hexapod', 'Hexapod']];
const CSS = `
.hwb-panel{position:absolute;left:0;top:0;bottom:0;width:${PANEL}px;overflow:auto;padding:16px 14px 20px;background:var(--sk-white);border-right:1px solid var(--sk-warm-2);z-index:2;font-family:var(--sans);color:var(--sk-black);scrollbar-width:thin}
.hwb-cat{margin:0 0 12px}
.hwb-h{font:500 10px/1.2 var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--sk-cool-2);margin:0 0 6px;display:flex;justify-content:space-between;gap:6px}
.hwb-h i{font-style:normal;color:var(--sk-orange-2)}
.hwb-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.hwb-chip{appearance:none;text-align:left;border:1px solid var(--sk-warm-2);background:var(--sk-warm-1);color:var(--sk-black);border-radius:10px;padding:7px 9px;cursor:pointer;font:inherit;min-width:0;transition:border-color .15s,background .15s,transform .12s}
.hwb-chip b{display:block;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hwb-chip small{display:block;font:400 10px/1.3 var(--mono);color:var(--sk-cool-2);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hwb-chip:hover{border-color:var(--sk-orange)}
.hwb-chip:active{transform:scale(.96)}
.hwb-chip.on{background:var(--sk-black);border-color:var(--sk-black);color:var(--sk-white)}
.hwb-chip.on small{color:var(--sk-warm-3)}
.hwb-chip.warn small{color:var(--sk-orange-2)}
.hwb-chip.dim{opacity:.55}
.hwb-sl{display:grid;grid-template-columns:1fr auto;gap:2px 8px;align-items:center;margin:0 0 8px;font-size:12px;color:var(--sk-cool-3)}
.hwb-sl input{grid-column:1/3;width:100%;margin:2px 0;accent-color:var(--sk-orange)}
.hwb-sl b{font:500 11px var(--mono);color:var(--sk-black)}
.hwb-name{border:1px solid var(--sk-warm-3);background:var(--sk-white);color:var(--sk-black);border-radius:999px;padding:9px 14px;font:inherit;font-size:14px;width:170px;outline:none}
.hwb-name:focus{border-color:var(--sk-orange)}
.hwb-gl{position:absolute;top:0;bottom:0;left:${PANEL}px;right:0;width:calc(100% - ${PANEL}px);height:100%;display:block;z-index:0}
`;

function drawLog(k, lines, x, y, w, maxRows) {           // word-wrapped log, newest line in black (as in s1.js)
  const rows = []; k.ctx.font = '500 12px Geist, system-ui, sans-serif';
  lines.forEach((l, li) => { let cur = ''; for (const wd of l.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (k.ctx.measureText(t).width > w && cur) { rows.push([cur, li]); cur = wd; } else cur = t; } rows.push([cur, li]); });
  rows.slice(-maxRows).forEach(([t, li], i) => k.text(t, x, y + i * 17, {size: 12, color: li === lines.length - 1 ? B.black : B.cool2}));
}
function wrap(k, str, w, font) { k.ctx.font = font; const out = []; let cur = ''; for (const wd of str.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (k.ctx.measureText(t).width > w && cur) { out.push(cur); cur = wd; } else cur = t; } out.push(cur); return out; }
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

export default function mount(root, api) {
  const k = kit(root);
  const {ctx} = k;
  const record = (kind, d) => api.record?.(kind, d);
  let lastClip = ''; const clip = m => { if (m && m !== lastClip) { lastClip = m; api.clip?.(m); } };
  const cleanups = [];
  const on = (target, ev, fn, o) => { target.addEventListener(ev, fn, o); cleanups.push(() => target.removeEventListener(ev, fn, o)); };

  // ---------- DOM: 3D canvas under the kit's 2D overlay, parts palette on the left ----------
  const wrapEl = root.querySelector('.try-canvas');
  const style = el('style', null, CSS); root.append(style);
  const glCanvas = el('canvas', 'hwb-gl'); wrapEl.prepend(glCanvas);
  k.canvas.style.position = 'relative'; k.canvas.style.zIndex = '1';
  const panel = el('div', 'hwb-panel'); wrapEl.append(panel);

  // ---------- state ----------
  let cfg = resolveConfig(PRESETS.dog).config, spec = robotSpecs(cfg), shown = {...spec};
  let robot = null, driving = false, policy = 'omni', driveLogged = false, completed = false;
  let log = ['Pick parts on the left, or a preset below.'], toast = null, banner = null, fx = [], nameTouched = false;
  const bodiesDriven = new Set();
  const say = s => { log.push(s); if (log.length > 20) log.shift(); };
  const note = s => { say(s); toast = {text: s, t: 0}; };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved && typeof saved === 'object') { cfg = resolveConfig(saved).config; nameTouched = !!cfg.name; log = [`Loaded your saved robot${cfg.name ? ': ' + cfg.name : ''}. Change anything.`]; }
  } catch {}

  // ---------- three.js scene ----------
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({canvas: glCanvas, antialias: true});
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  } catch { renderer = null; }
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(B.warm1, 9, 22);
  const camera = new THREE.PerspectiveCamera(36, 1, .05, 60);
  const hemi = new THREE.HemisphereLight('#ffffff', B.warm3, 1.15); scene.add(hemi);
  const key = new THREE.DirectionalLight('#ffffff', 1.7); key.position.set(3.5, 6, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, {left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: .5, far: 20}); key.shadow.camera.updateProjectionMatrix(); key.shadow.bias = -.0005; key.shadow.normalBias = .02;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#ffe4c8', .45); fill.position.set(-4, 3, -3); scene.add(fill);
  const own = [];                                        // scene geometries/materials we dispose at cleanup
  const keep = (...xs) => { own.push(...xs); return xs[0]; };
  const floorMat = keep(new THREE.MeshStandardMaterial({color: B.warm1, roughness: .95}));
  const floor = new THREE.Mesh(keep(new THREE.PlaneGeometry(60, 60)), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  let grid = null, themeKey = '';
  const pathMat = keep(new THREE.MeshBasicMaterial({color: B.orange, transparent: true, opacity: 0, depthWrite: false}));
  const pathRing = new THREE.Mesh(keep(new THREE.RingGeometry(PATH_R - .012, PATH_R + .012, 128)), pathMat);
  pathRing.rotation.x = -Math.PI / 2; pathRing.position.set(0, .004, -PATH_R); scene.add(pathRing);
  const ringGeo = keep(new THREE.RingGeometry(.3, .325, 64));
  function syncTheme() {
    if (renderer) renderer.setClearColor(B.warm1, 1);
    const tk = B.warm1 + B.warm2 + B.warm3;
    if (tk === themeKey) return; themeKey = tk;
    scene.fog.color.set(B.warm1); floorMat.color.set(B.warm1); hemi.groundColor.set(B.warm3); pathMat.color.set(B.orange);
    const dark = parseInt(String(B.warm1).slice(1, 3), 16) < 128;
    hemi.intensity = dark ? .85 : 1.15; key.intensity = dark ? 1.2 : 1.7;
    if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
    grid = new THREE.GridHelper(24, 48, B.warm3, B.warm2); grid.position.y = .002;
    grid.material.transparent = true; grid.material.opacity = dark ? .9 : .8; grid.material.depthWrite = false; scene.add(grid);
  }

  // camera orbit (drag) + zoom (wheel), following the robot
  const cam = {yaw: .8, pitch: .3, dist: 3.2, distGoal: 3.2, target: new THREE.Vector3(0, .45, 0), lastInput: -99};
  let drag = null;
  k.onDown((p, e) => { if (p.x < PANEL) return; drag = {x: p.x, y: p.y}; cam.lastInput = k.t; if (e) e.preventDefault?.(); });
  k.onMove(p => { if (!drag) return; cam.yaw -= (p.x - drag.x) * .008; cam.pitch = clamp(cam.pitch + (p.y - drag.y) * .006, .04, 1.35); drag.x = p.x; drag.y = p.y; cam.lastInput = k.t; });
  k.onUp(() => { drag = null; });
  on(k.canvas, 'wheel', e => { e.preventDefault(); cam.distGoal = clamp(cam.distGoal * Math.exp(e.deltaY * .0012), 1.1, 8); cam.lastInput = k.t; }, {passive: false});
  const fitDist = () => clamp(Math.max(robot.info.height * 1.9, robot.info.length * 1.7) + 1.1, 1.8, 6.5);

  // click sound (local, respects the hall mute setting)
  let actx = null;
  function click(strong = false) {
    try {
      if (localStorage.getItem('skild-hall:muted') === '1') return;
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      actx = actx || new AC(); const n = actx.currentTime;
      for (const [f, d, g, type] of strong ? [[520, .12, .07, 'triangle'], [1040, .18, .05, 'sine']] : [[1500, .035, .05, 'square'], [190, .07, .09, 'triangle']]) {
        const o = actx.createOscillator(), gn = actx.createGain(); o.type = type;
        o.frequency.setValueAtTime(f, n); o.frequency.exponentialRampToValueAtTime(f * (strong ? 1.5 : .45), n + d);
        gn.gain.setValueAtTime(g, n); gn.gain.exponentialRampToValueAtTime(.0001, n + d);
        o.connect(gn).connect(actx.destination); o.start(n); o.stop(n + d + .02);
      }
    } catch {}
  }
  function snapFx(big = false) {                          // orange ring expanding from the robot's feet
    const m = new THREE.MeshBasicMaterial({color: B.orange, transparent: true, opacity: .9, depthWrite: false});
    const r = new THREE.Mesh(ringGeo, m); r.rotation.x = -Math.PI / 2;
    const p = robot.mover.position; r.position.set(p.x, .006, p.z); scene.add(r);
    fx.push({r, m, t: 0, size: Math.max(1.2, robot.info.length * 2.4) * (big ? 1.8 : 1), dur: big ? 1.1 : .6});
  }

  // ---------- robot ----------
  function onRobotEvent(type, d) {
    if (type !== 'fall') return;
    driving = false; robot.setDrive(false); updateDriveBtn();
    say(`Fell after ${d.after} s. The specialist only knows the one quadruped it was trained on.`);
    toast = {text: 'Specialist policy lost balance on this body. Turn it off to use the Skild Brain.', t: 0};
    api.status('Specialist fell'); clip('failures');
    record('robot_drive', driveSample('fell', d.after));
  }
  function rebuild(popCats = []) {
    const prev = robot?.getState();
    robot?.dispose();
    robot = buildRobotMesh(THREE, cfg, B, {radius: PATH_R, policy, onEvent: onRobotEvent});
    if (prev) robot.setState({...prev, drive: driving, policy});
    scene.add(robot.group);
    popCats.forEach(c => robot.pop(c));
    spec = robotSpecs(cfg);
    refreshPanel();
  }
  const bodyName = () => `${CATALOG.torso[cfg.torso].label.toLowerCase()} on ${CATALOG.loco[cfg.loco].label.toLowerCase()}`;
  const configOut = () => ({torso: cfg.torso, loco: cfg.loco, arms: cfg.arms, hands: cfg.hands, head: cfg.head, battery: cfg.battery, legLen: cfg.legLen, armLen: cfg.armLen, payload: cfg.payload, name: (nameInput.value.trim() || cfg.name || 'My robot').slice(0, 24)});
  const driveSample = (result, seconds) => ({...configOut(), policy, gait: spec.gait, result, seconds: +(+seconds).toFixed(1), distance_m: +robot.state.dist.toFixed(2), dof: spec.dof});

  function pick(cat, id) {
    const val = cat === 'arms' ? +id : id;
    cam.lastInput = k.t;
    if (cfg[cat] === val) { robot.pop(cat); click(); snapFx(); return; }
    const r = resolveConfig({...cfg, [cat]: val}, cat);
    const changed = ['torso', 'loco', 'arms', 'hands', 'head', 'battery'].filter(c => r.config[c] !== cfg[c]);
    const before = cfg; cfg = r.config;
    const pops = [...changed];
    if (changed.includes('torso')) pops.push('head', 'battery', 'arms', 'hands', 'payload');
    if (changed.includes('arms') && cfg.arms) pops.push('hands');
    rebuild([...new Set(pops)]);
    click(); snapFx();
    const cat0 = CATALOG[cat][id];
    say(`Snapped on: ${cat0.label.toLowerCase()}${cat === 'arms' && !val ? ' (arms removed)' : ''}`);
    r.notes.forEach(note);
    if (changed.includes('torso') || changed.includes('loco')) cam.distGoal = fitDist();
    if (cat === 'loco') clip(val.startsWith('legs') ? 'limbs' : 'wheels');
    if (cat === 'hands' && before.arms === 0) clip('limbs');
    if (driving) driveLogged = false;
  }

  // ---------- palette ----------
  const chips = [], sliders = {};
  const title = el('div', 'hwb-h'); title.append(el('span', null, 'Parts palette'), el('span', null, 'click to snap on')); title.style.marginBottom = '12px';
  panel.append(title);
  for (const [cat, label] of CATS) {
    const sec = el('div', 'hwb-cat'), h = el('div', 'hwb-h'), hint = el('i');
    h.append(el('span', null, label), hint); sec.append(h);
    const gridEl = el('div', 'hwb-grid');
    for (const [id, part] of Object.entries(CATALOG[cat])) {
      const b = el('button', 'hwb-chip'); b.type = 'button';
      const sub = el('small', null, part.sub); b.append(el('b', null, part.label), sub);
      b.onclick = () => pick(cat, id);
      gridEl.append(b); chips.push({b, sub, cat, id, part});
    }
    sec.append(gridEl); panel.append(sec);
    if (cat === 'hands') chips.handsHint = hint;
  }
  const slSec = el('div', 'hwb-cat'); slSec.append(el('div', 'hwb-h', 'Dimensions'));
  for (const [keyName, label, unit, step] of SLIDERS) {
    const l = el('label', 'hwb-sl'), out = el('b'), i = el('input');
    Object.assign(i, {type: 'range', min: RANGES[keyName][0], max: RANGES[keyName][1], step, value: cfg[keyName]});
    l.append(el('span', null, label), out, i); slSec.append(l);
    i.oninput = () => onSlider(keyName, Number(i.value));
    sliders[keyName] = {i, out, unit};
  }
  panel.append(slSec);
  let stiltsWarned = false;
  function onSlider(keyName, v) {
    const was = cfg[keyName];
    cfg = resolveConfig({...cfg, [keyName]: v}).config;
    cam.lastInput = k.t;
    rebuild([]);
    if (keyName === 'legLen') {
      const tall = cfg.loco.startsWith('legs') && cfg.torso !== 'humanoid' && cfg.legLen > .6;
      if (tall && !stiltsWarned) { stiltsWarned = true; say('Stilts: much longer legs. Same brain, it re-plans the gait.'); clip('stilts'); }
      if (!tall) stiltsWarned = false;
    }
    if (keyName === 'payload' && was === 0 && cfg.payload > 0) { say('Payload strapped on · the gait slows and lowers'); clip('payload'); robot.pop('payload'); click(); }
    if (keyName === 'payload' && spec.over && !robotSpecs({...cfg, payload: was}).over) note(`Over the rated payload for this body (about ${spec.capacity.toFixed(0)} kg, stylized).`);
  }
  function refreshPanel() {
    for (const c of chips) {
      const val = c.cat === 'arms' ? +c.id : c.id, active = cfg[c.cat] === val;
      const hint = active ? '' : conflictHint(c.cat, c.id, cfg);
      c.b.classList.toggle('on', active);
      c.b.classList.toggle('warn', !!hint);
      c.b.classList.toggle('dim', c.cat === 'hands' && cfg.arms === 0);
      c.sub.textContent = hint || c.part.sub;
      c.b.title = hint ? `Picking this ${hint}` : c.part.label;
    }
    if (chips.handsHint) chips.handsHint.textContent = cfg.arms === 0 ? 'needs an arm' : '';
    for (const [keyName, s] of Object.entries(sliders)) { if (Number(s.i.value) !== cfg[keyName]) s.i.value = cfg[keyName]; s.out.textContent = `${keyName === 'payload' ? cfg[keyName].toFixed(0) : cfg[keyName].toFixed(2)} ${s.unit}`; }
  }

  // ---------- control bar ----------
  for (const [id, label] of PRESET_LIST) k.button(label, () => applyPreset(id));
  const driveBtn = k.button('Test drive (Skild Brain)', toggleDrive, {primary: true});
  k.toggle('Specialist policy (quadruped-only)', false, v => {
    policy = v ? 'specialist' : 'omni'; robot.setPolicy(policy);
    if (!v && robot.state.fallen) { robot.reset(); if (!driving) { driving = true; robot.setDrive(true); } say('Skild Brain takes over: gets up and walks on the same body.'); clip('failures'); }
    else say(v ? (robot.specialistOk ? 'Specialist on: it knows this quadruped, so it works here.' : 'Specialist on: trained on one quadruped only. Try driving this body.') : 'Back to the Skild Brain: one policy for any body.');
    driveLogged = false; updateDriveBtn();
  });
  const nameInput = el('input', 'hwb-name'); Object.assign(nameInput, {type: 'text', maxLength: 24, placeholder: 'Name your robot', value: cfg.name || ''});
  nameInput.oninput = () => { nameTouched = true; };
  k.bar.append(nameInput);
  k.button('Activate', activate, {primary: true});

  function applyPreset(id) {
    const p = PRESETS[id];
    cfg = resolveConfig({...p, name: nameTouched ? nameInput.value : p.name}).config;
    if (!nameTouched) nameInput.value = p.name;
    rebuild(['torso', 'loco', 'arms', 'hands', 'head', 'battery', 'payload']);
    click(true); snapFx(true); cam.distGoal = fitDist(); cam.lastInput = k.t;
    say(`Preset: ${p.name} · ${spec.dof} DOF · ${spec.gait}`);
    clip({dog: 'limbs', humanoid: 'motors', mobile: 'payload', hexapod: 'limbs'}[id]);
    api.status(`${p.name} · ${spec.dof} DOF`);
    driveLogged = false;
  }
  function updateDriveBtn() {
    driveBtn.textContent = driving ? 'Stop test drive' : policy === 'omni' ? 'Test drive (Skild Brain)' : 'Test drive (specialist)';
  }
  function toggleDrive() {
    cam.lastInput = k.t;
    if (driving) {
      driving = false; robot.setDrive(false);
      if (!driveLogged) record('robot_drive', driveSample('stopped', robot.state.driveT));
      driveLogged = true; say('Stopped.'); api.status('Parked'); updateDriveBtn(); return;
    }
    if (robot.state.fallen) robot.reset();
    driving = true; driveLogged = false; robot.setPolicy(policy); robot.setDrive(true); updateDriveBtn();
    if (policy === 'omni') { say(`Skild Brain drives the ${bodyName()} · ${spec.gait}`); api.status(`Skild Brain · ${spec.gait}`); clip('motors'); }
    else { say(`Specialist policy drives the ${bodyName()}`); api.status('Specialist policy'); }
  }
  function activate() {
    const out = configOut(); cfg.name = out.name;
    if (!nameInput.value.trim()) nameInput.value = out.name;
    try { localStorage.setItem(STORE, JSON.stringify(out)); } catch {}
    record('robot_build', out);
    banner = {name: out.name, t: 0};
    say(`${out.name} activated · saved in this browser for the lab.`);
    click(true); snapFx(true); ['torso', 'loco', 'arms', 'hands', 'head', 'battery'].forEach(c => robot.pop(c));
    api.status('Activated'); clip('Chainsaw');
    if (!completed) { completed = true; api.complete('Robot activated · one brain, your body'); }
  }
  k.onKey(e => {
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    if (!root.isConnected) return;
    const i = '1234'.indexOf(e.key); if (i >= 0) applyPreset(PRESET_LIST[i][0]);
    if (e.key === 'd' || e.key === 'D') toggleDrive();
  });

  // ---------- frame ----------
  let lastW = 0, lastH = 0, lastOff = -1;
  rebuild(['torso', 'loco', 'arms', 'hands', 'head', 'battery', 'payload']);
  cam.dist = cam.distGoal = fitDist();
  api.status('Pick parts');

  k.frame((dt, t) => {
    robot.update(t, dt);
    if (driving && !driveLogged && policy === 'omni' && robot.state.driveT > 5) {
      driveLogged = true; bodiesDriven.add(`${cfg.torso}/${cfg.loco}/${cfg.arms}`);
      say(`Stable ${spec.gait} after ${robot.state.dist.toFixed(1)} m on this body · no retraining.`);
      record('robot_drive', driveSample('stable', robot.state.driveT));
    }
    if (driving && !driveLogged && policy === 'specialist' && robot.specialistOk && robot.state.driveT > 5) { driveLogged = true; say('The specialist works here: this is the body it was trained on.'); }
    // numbers ease toward the new spec
    for (const kk of ['mass', 'dof', 'hours', 'reach', 'stability']) shown[kk] += (spec[kk] - shown[kk]) * Math.min(1, dt * 8);
    // camera
    const e = 1 - Math.exp(-dt * 4);
    if (!drag && !driving && k.t - cam.lastInput > 6) cam.yaw += dt * .12;
    cam.dist += (cam.distGoal - cam.dist) * e;
    const mp = robot.mover.position;
    cam.target.x += (mp.x - cam.target.x) * e; cam.target.z += (mp.z - cam.target.z) * e;
    cam.target.y += (Math.max(.25, robot.info.height * .45) - cam.target.y) * e;
    const cp = Math.cos(cam.pitch);
    camera.position.set(cam.target.x + cam.dist * cp * Math.sin(cam.yaw), cam.target.y + cam.dist * Math.sin(cam.pitch), cam.target.z + cam.dist * cp * Math.cos(cam.yaw));
    camera.lookAt(cam.target);
    key.position.set(mp.x + 3.5, 6, mp.z + 4); key.target.position.set(mp.x, 0, mp.z);
    pathMat.opacity += ((driving ? .45 : 0) - pathMat.opacity) * e;
    pathRing.visible = pathMat.opacity > .01;
    for (const f of fx) { f.t += dt; const q = Math.min(1, f.t / f.dur); f.r.scale.setScalar(1 + q * f.size * 2); f.m.opacity = .9 * (1 - q); }
    fx = fx.filter(f => { if (f.t < f.dur) return true; scene.remove(f.r); f.m.dispose(); return false; });
    syncTheme();
    if (renderer) {
      const vw = Math.max(10, Math.round(k.w - PANEL)), vh = Math.max(10, Math.round(k.h)), off = vw > 720 ? 250 : 0;
      if (vw !== lastW || vh !== lastH || off !== lastOff) {
        lastW = vw; lastH = vh; lastOff = off;
        renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.setSize(vw, vh, false);
        camera.aspect = (vw + off) / vh;
        if (off) camera.setViewOffset(vw + off, vh, off, 0, vw, vh); else camera.clearViewOffset();   // keep the robot clear of the spec card
        camera.updateProjectionMatrix();
      }
      renderer.render(scene, camera);
    }
    if (toast) { toast.t += dt; if (toast.t > 4.5) toast = null; }
    if (banner) { banner.t += dt; if (banner.t > 5) banner = null; }
    draw(t);
  });

  // ---------- 2D overlay: goal, policy, spec sheet, notes, log ----------
  function pill(x, y, text, lit) {
    ctx.font = '500 12px Geist, system-ui, sans-serif';
    const w = ctx.measureText(text).width + 34;
    ctx.fillStyle = B.white; ctx.strokeStyle = lit ? B.orange : B.warm3; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(x, y, w, 26, 13); ctx.fill(); ctx.stroke();
    ctx.fillStyle = lit ? B.orange : B.cool2; ctx.beginPath(); ctx.arc(x + 14, y + 13, 4, 0, 7); ctx.fill();
    k.text(text, x + 24, y + 17, {size: 12});
    return w;
  }
  function draw(t) {
    ctx.clearRect(0, 0, k.w, k.h);
    const x0 = PANEL + 20, cardW = 268, cardX = k.w - cardW - 16, leftW = Math.max(180, cardX - x0 - 16);
    k.text('Goal: build a body, let one brain drive it.', x0, 30, {size: 15, weight: 600});
    k.label('Drag to orbit · scroll to zoom · simulated preview', x0, 48);
    const omni = policy === 'omni';
    const pw = pill(x0, 60, omni ? 'Skild Brain · one policy, any body' : 'Specialist · trained on one quadruped', omni);
    const state = robot.state.fallen ? 'fallen' : driving ? `driving · ${spec.gait}` : 'parked';
    k.label(state, x0 + pw + 10, 77, {color: robot.state.fallen ? B.orange : driving ? B.black : B.cool2});
    if (!renderer) k.text('The 3D preview needs WebGL. The spec sheet still updates.', x0, 130, {size: 13, color: B.cool2});

    // spec sheet (top right, kept above the corner video)
    const avail = k.h - 240 - 16;
    const rows = [
      ['Mass', `${shown.mass.toFixed(1)} kg${cfg.payload ? ` + ${cfg.payload} kg load` : ''}`],
      ['DOF', `${Math.round(shown.dof)} · ${spec.joints.loco} base + ${spec.joints.arms + spec.joints.hands} arm`],
      ['Battery', shown.hours >= 1 ? `≈ ${shown.hours.toFixed(1)} h` : `≈ ${Math.round(shown.hours * 60)} min`],
      ['Reach', cfg.arms ? `${shown.reach.toFixed(2)} m` : 'no arms'],
      ['Gait', spec.gait],
    ];
    const clsLines = wrap(k, spec.cls, cardW - 44, '600 12px Geist, system-ui, sans-serif').slice(0, 2);
    const fixedH = 54 + 18 + clsLines.length * 16 + 12 + 40 + 20;
    const rowH = clamp((avail - fixedH) / rows.length, 15, 20);
    const cardH = fixedH + rows.length * rowH;
    ctx.fillStyle = B.white; ctx.strokeStyle = B.warm2; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(cardX, 16, cardW, cardH, 12); ctx.fill(); ctx.stroke();
    let y = 36;
    k.label('Spec sheet · stylized', cardX + 16, y);
    y += 22;
    const nm = (nameInput.value.trim() || cfg.name || 'Unnamed robot');
    k.text(nm.length > 28 ? nm.slice(0, 27) + '…' : nm, cardX + 16, y, {size: 15, weight: 600});
    y += 18;
    k.label('Closest real-world class', cardX + 16, y); y += 8;
    ctx.fillStyle = B.warm1; ctx.beginPath(); ctx.roundRect(cardX + 12, y, cardW - 24, clsLines.length * 16 + 10, 8); ctx.fill();
    ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(cardX + 24, y + 13, 3.5, 0, 7); ctx.fill();
    clsLines.forEach((l, i) => k.text(l, cardX + 34, y + 17 + i * 16, {size: 12, weight: 600}));
    y += clsLines.length * 16 + 10 + 20;
    for (const [lab, val] of rows) {
      k.label(lab, cardX + 16, y);
      k.text(val, cardX + cardW - 16, y, {size: 12, mono: true, align: 'right', weight: 500});
      y += rowH;
    }
    y += 12;
    k.meter(cardX + 16, y, cardW - 32, shown.stability, `Stability margin · ${Math.round(shown.stability * 100)}% · ${spec.balance}`);
    y += 26;
    k.label(spec.over ? `Over rated payload · ~${spec.capacity.toFixed(0)} kg max` : `Bodies driven by one brain · ${bodiesDriven.size}`, cardX + 16, y, {color: spec.over ? B.orange : B.cool2});

    // notes (explanations for swapped parts, falls)
    if (toast) {
      const a = Math.min(1, toast.t * 6, (4.5 - toast.t) * 2), tw = Math.min(440, leftW);
      const lines = wrap(k, toast.text, tw - 32, '500 13px Geist, system-ui, sans-serif').slice(0, 3);
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = B.white; ctx.beginPath(); ctx.roundRect(x0, 100, tw, lines.length * 18 + 18, 10); ctx.fill();
      ctx.fillStyle = B.orange; ctx.fillRect(x0, 100, 3, lines.length * 18 + 18);
      lines.forEach((l, i) => k.text(l, x0 + 16, 122 + i * 18, {size: 13}));
      ctx.globalAlpha = 1;
    }
    if (banner) {
      const a = Math.min(1, banner.t * 5, (5 - banner.t) * 2), bw = Math.min(420, leftW), by = toast ? 170 : 100;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = B.orange; ctx.beginPath(); ctx.roundRect(x0, by, bw, 54, 12); ctx.fill();
      k.text(`${banner.name} activated`, x0 + 16, by + 23, {size: 14, weight: 600, color: '#121212'});
      k.text('One brain, your body. Saved for the lab room.', x0 + 16, by + 42, {size: 12, color: '#121212'});
      ctx.globalAlpha = 1;
    }

    // log, bottom-left (clear of the corner video)
    const lw = Math.max(180, k.w - 360 - x0), ly = k.h - 72;
    k.label('Log', x0, ly - 14);
    drawLog(k, log.slice(-3), x0, ly + 4, lw, 3);
    void t;
  }

  return () => {
    k.destroy();
    cleanups.forEach(f => f());
    robot?.dispose();
    fx.forEach(f => { scene.remove(f.r); f.m.dispose(); });
    if (grid) { grid.geometry.dispose(); grid.material.dispose(); }
    own.forEach(o => o.dispose?.());
    key.shadow.map?.dispose();
    if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); }
    try { actx?.close(); } catch {}
  };
}
