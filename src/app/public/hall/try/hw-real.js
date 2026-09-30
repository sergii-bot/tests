// TRY · HW-03 — Real-parts builder: compose a robot from real parts (Unitree Go2/H1/G1, Boston Dynamics Spot, UR5e),
// load it into MuJoCo, and test it in real physics with a stand-in controller (not the Skild Brain). Specs come from the model.
import * as THREE from '../../vendor/three.module.js';
import {kit, B} from './kit.js';
import {spawnComposed} from '../parts/loader.js';

const TORSOS = [['go2_base', 'Unitree Go2 body'], ['spot_body', 'Boston Dynamics Spot body'], ['h1_torso', 'Unitree H1 torso'], ['g1_torso', 'Unitree G1 torso']];
const LEGS = [['go2_leg', 'Unitree Go2 leg'], ['spot_leg', 'Spot leg'], ['h1_leg', 'Unitree H1 leg'], ['g1_leg', 'Unitree G1 leg']];
const LAYOUTS = [['quad', '4 legs'], ['hex', '6 legs'], ['biped', '2 legs']];
const ARMS = [['none', 'No arm'], ['ur5e_arm', 'UR5e arm on top plate'], ['h1_arm', 'Unitree H1 arms (L+R)'], ['g1_arm', 'Unitree G1 arms (L+R)']];
const PRESETS = {
  'Unitree Go2': {torso: 'go2_base', leg: 'go2_leg', layout: 'quad', arm: 'none'},
  'Boston Dynamics Spot': {torso: 'spot_body', leg: 'spot_leg', layout: 'quad', arm: 'none'},
  'Unitree H1': {torso: 'h1_torso', leg: 'h1_leg', layout: 'biped', arm: 'h1_arm'},
  'Unitree G1': {torso: 'g1_torso', leg: 'g1_leg', layout: 'biped', arm: 'g1_arm'},
  'Go2 + UR5e': {torso: 'go2_base', leg: 'go2_leg', layout: 'quad', arm: 'ur5e_arm'},
  'Go2 hexapod': {torso: 'go2_base', leg: 'go2_leg', layout: 'hex', arm: 'none'},
};
const HUMAN = t => t === 'h1_torso' || t === 'g1_torso';
function check(c) {
  const bipedLeg = c.leg === 'h1_leg' || c.leg === 'g1_leg';
  if (c.layout === 'biped' && !bipedLeg) return 'Biped layout needs H1 or G1 legs.';
  if (c.layout !== 'biped' && bipedLeg) return 'H1/G1 legs are humanoid legs: use the 2-leg layout.';
  if (c.layout === 'biped' && !HUMAN(c.torso)) return 'Two legs need a humanoid torso (H1 or G1).';
  if ((c.arm === 'h1_arm' || c.arm === 'g1_arm') && !HUMAN(c.torso)) return 'Shoulder arms mount on a humanoid torso. Use the UR5e on a top plate instead.';
  return null;
}
function toConfig(c) {
  const cfg = {torso: c.torso, legs: {part: c.leg, layout: c.layout}, arms: []};
  if (c.arm === 'ur5e_arm') { cfg.arms.push({part: 'ur5e_arm', mount: 'top'}); cfg.armPose = 'stow'; }
  if (c.arm === 'h1_arm' || c.arm === 'g1_arm') cfg.arms.push({part: c.arm, mount: 'L'}, {part: c.arm, mount: 'R'});
  return cfg;
}

export default function mount(root, api) {
  const k = kit(root);
  const wrap = root.querySelector('.try-canvas');
  // WebGL preview under the kit's 2D overlay
  const gl = document.createElement('canvas'); gl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  wrap.prepend(gl); k.canvas.style.position = 'relative'; k.canvas.style.zIndex = 1; k.canvas.style.pointerEvents = 'none';
  const renderer = new THREE.WebGLRenderer({canvas: gl, antialias: true}); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 1, .02, 60);
  const hemi = new THREE.HemisphereLight('#ffffff', '#8e8177', 1.3), sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(2, 4, 2.5); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {left: -3, right: 3, top: 3, bottom: -3}); scene.add(hemi, sun);
  const floorMat = new THREE.MeshStandardMaterial({color: B.warm2, roughness: .9}); const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(40, 80, B.warm3, B.warm3); grid.material.transparent = true; grid.material.opacity = .35; grid.position.y = .002; scene.add(grid);
  let orbit = {yaw: .7, pitch: .32, dist: 2.6}, drag = null;
  gl.addEventListener('pointerdown', e => { drag = {x: e.clientX, y: e.clientY}; gl.setPointerCapture(e.pointerId); });
  gl.addEventListener('pointermove', e => { if (!drag) return; orbit.yaw -= (e.clientX - drag.x) * .006; orbit.pitch = Math.max(.05, Math.min(1.2, orbit.pitch + (e.clientY - drag.y) * .005)); drag = {x: e.clientX, y: e.clientY}; });
  gl.addEventListener('pointerup', () => drag = null);
  gl.addEventListener('wheel', e => { e.preventDefault(); orbit.dist = Math.max(1, Math.min(8, orbit.dist * (1 + e.deltaY * .001))); }, {passive: false});

  // side panel (HTML)
  const panel = document.createElement('div'); panel.className = 'hwr-panel'; wrap.append(panel);
  const sel = (label, opts, key) => `<label><span>${label}</span><select data-k="${key}">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`;
  panel.innerHTML = `<p class="hk">Real parts · MuJoCo Menagerie</p>${sel('Torso', TORSOS, 'torso')}${sel('Legs', LEGS, 'leg')}${sel('Layout', LAYOUTS, 'layout')}${sel('Arms', ARMS, 'arm')}<div class="hwr-msg"></div><div class="hwr-spec"></div><p class="hwr-note">Controller: stand-in (PD + gait generator), not the Skild Brain. Mass, joints and actuator limits come from the official models.</p>`;
  const cfg = {...PRESETS['Unitree Go2']};
  const syncSelects = () => panel.querySelectorAll('select').forEach(s => { s.value = cfg[s.dataset.k]; });
  panel.querySelectorAll('select').forEach(s => s.onchange = () => { cfg[s.dataset.k] = s.value; assemble(); });
  const msg = panel.querySelector('.hwr-msg'), specBox = panel.querySelector('.hwr-spec');

  let bot = null, busy = false, vx = 0, t0 = 0, startH = 0, fell = false, stoodT = 0, completed = false, pushes = 0, log = [];
  const say = s => { log.push(s); if (log.length > 5) log.shift(); };
  async function assemble() {
    const err = check(cfg); msg.textContent = err || ''; msg.classList.toggle('err', !!err); if (err || busy) return;
    busy = true; api.status('Composing · loading real meshes');
    try {
      const nb = await spawnComposed(toConfig(cfg), {THREE});
      if (bot) { scene.remove(bot.group); bot.dispose(); }
      bot = nb; scene.add(bot.group); fell = false; stoodT = 0; pushes = 0; vx = 0; speed.value = 0;
      startH = bot.data.qpos[2]; t0 = performance.now();
      const s = bot.spec || {};
      specBox.innerHTML = `<div><b>${(s.mass ?? 0).toFixed(1)} kg</b><span>mass (from model)</span></div><div><b>${s.dof ?? '–'}</b><span>actuated DOF</span></div><div><b>${Array.isArray(s.legs) ? s.legs.length : (s.legs ?? '–')}</b><span>legs</span></div><div><b>${Array.isArray(s.arms) ? s.arms.length : (s.arms ?? 0)}</b><span>arms</span></div><div class="src">${(s.sources || []).map(x => typeof x === 'string' ? x : x.label || x.id).join(' · ')}</div>`;
      say(`Composed ${TORSOS.find(x => x[0] === cfg.torso)[1]} + ${LAYOUTS.find(x => x[0] === cfg.layout)[1]} (${LEGS.find(x => x[0] === cfg.leg)[1]})${cfg.arm !== 'none' ? ' + ' + ARMS.find(x => x[0] === cfg.arm)[1] : ''}`);
      api.record('real_build', {config: toConfig(cfg), mass: s.mass, dof: s.dof});
      try { localStorage.setItem('skild-hall:realRobot', JSON.stringify(toConfig(cfg))); } catch {}
      api.status('Standing · real physics'); api.clip(cfg.layout === 'biped' ? 'failed leg motors' : 'limbs');
    } catch (e) { msg.textContent = 'Could not compose: ' + (e.message || e); msg.classList.add('err'); console.warn(e); }
    busy = false;
  }

  Object.keys(PRESETS).forEach(name => k.button(name, () => { Object.assign(cfg, PRESETS[name]); syncSelects(); assemble(); }));
  const speed = k.slider('Walk (vx m/s)', 0, .4, 0, v => { vx = v; }, .02);
  k.button('Push it ↯', () => { if (!bot) return; const q = bot.data.qvel; q[1] += (Math.random() < .5 ? -1 : 1) * .9; q[0] += .3; pushes++; say('Pushed sideways · watch it recover (or fall)'); }, {primary: true});
  k.button('Reset', () => { if (bot) { bot.reset(); fell = false; startH = bot.data.qpos[2]; say('Reset to home pose'); } });

  let last = performance.now();
  k.frame((dt, t) => {
    // background + camera
    renderer.setClearColor(B.warm1); floorMat.color.set(B.warm2);
    const w = k.w, h = k.h; if (gl.width !== Math.round(w * renderer.getPixelRatio())) renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    let cx = 0, cy = .4, cz = 0;
    if (bot) {
      bot.update(Math.min(dt, 1 / 30), {vx, yaw: 0});
      const q = bot.data.qpos; const mx = q[0], my = q[1], mz = q[2]; cx = mx; cz = -my; cy = Math.max(.25, mz * .8);
      const tilt = Math.acos(Math.min(1, Math.abs(1 - 2 * (q[4] * q[4] + q[5] * q[5])))) * 180 / Math.PI;
      if (!fell && (mz < startH * .55 || tilt > 55)) { fell = true; say('It fell. The stand-in controller can’t recover like a learned policy.'); api.status('Fell · press Reset'); }
      if (!fell) { stoodT += dt; if (stoodT > 5 && !completed) { completed = true; api.complete('Real-parts robot stands in MuJoCo'); } }
      sun.position.set(cx + 2, 4, cz + 2.5); sun.target.position.set(cx, 0, cz); sun.target.updateMatrixWorld();
      // overlay (2D)
      k.ctx.clearRect(0, 0, w, h);
      k.text('Goal: compose a robot from real parts and keep it standing in real physics for 5 s. Then push it.', 16, 24, {size: 14, weight: 600});
      k.label(`MuJoCo · ${Math.round((performance.now() - t0) / 1000)} s · height ${mz.toFixed(2)} m · tilt ${tilt.toFixed(0)}° · ${pushes} pushes`, 16, 44);
      log.slice(-3).forEach((l, i) => k.text(l, 16, h - 54 + i * 16, {size: 12, color: i === Math.min(2, log.length - 1) ? B.black : B.cool2}));
    } else { k.ctx.clearRect(0, 0, w, h); k.text('Loading real parts…', 16, 24, {size: 14, weight: 600}); }
    const c = Math.cos(orbit.pitch); cam.position.set(cx + Math.sin(orbit.yaw) * orbit.dist * c, cy + Math.sin(orbit.pitch) * orbit.dist, cz + Math.cos(orbit.yaw) * orbit.dist * c); cam.lookAt(cx, cy, cz);
    renderer.render(scene, cam);
    void last;
  });
  syncSelects(); assemble();
  return () => { if (bot) bot.dispose(); renderer.dispose(); renderer.forceContextLoss?.(); k.destroy(); };
}
