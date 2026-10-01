// TRY · One policy — "Draw the terrain": the post's scenarios (stairs, a park full of stairs, stepping stones, unstructured
// obstacles, a fire escape, tight stairs, payloads, pushes and pulls) plus your own drawn course. One humanoid policy picks
// each foothold only from what its camera sees right now: no map, no footstep plan, no "stair mode".
// 3D: a stand-in humanoid in Skild livery (MuJoCo Menagerie model, tinted black like the video robot) walks a kinematic gait on its real
// joints: footholds come from the stand's terrain logic, hip/knee/ankle pitch from a 2-link sagittal leg IK.
// Post facts used: vision + proprioception → motor commands; no terrain maps, no planning, no behavior switching;
// parks, streets, fire escapes, pallets/gaps/uneven steps; stairs just 3 cm deeper than the foot; pushes and pulls on
// stairs; carrying boxes up and down stairs.
import * as THREE from '../../vendor/three.module.js';
import {kit, B, lerp, clamp} from './kit.js';
import * as MJ from '../mj.js';
import {SETS, block, mat, person, cardboardBox, disposeTree} from '../props/loco-props.js';

const CL = 10, DX = .01, N = Math.round(CL / DX), BASE = .4, PAD = .9, FIN = CL - .7, FOOT = .21;   // FOOT = G1 foot length
const HIP = .73, TORSO = .5, PUSH_MAX = 1.2, PUSH_FALL = 1.0;
// Skild humanoid leg geometry (from g1.xml): hip-pitch axis below the pelvis, thigh vector at zero angle, shank, ankle
const HIPZ = .1027, T0X = 0, T0Z = -.3366, L1 = Math.hypot(T0X, T0Z), L2 = .30001, ANK = .053, FOOTC = .038, LMAX = L1 + L2 - .006;
const PHI_T0 = Math.atan2(T0Z, T0X), W = .8;             // W = half-width of the stair path (m)
const ease = s => s * s * (3 - 2 * s);
const snap = h => Math.round(h / .05) * .05;
const r3 = v => Math.round(v * 1000) / 1000;
const rotPhi = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];

function preset(name) {
  const g = new Array(N).fill(BASE), set = (a, b, h) => { for (let i = Math.round(a / DX); i < Math.min(N, Math.round(b / DX)); i++) g[i] = h; };
  const flight = (x, h, n, rise, tread) => { for (let i = 0; i < n; i++) { h += rise; set(x, CL, h); x += tread; } return [x, h]; };
  let x, h;
  if (name === 'stairs' || name === 'payload') { [x, h] = flight(2, BASE, 4, .16, .34); [x, h] = flight(x + .9, h, 4, -.16, .34); }
  if (name === 'push') { [x, h] = flight(1.6, BASE, 6, .15, .34); [x, h] = flight(x + 1.2, h, 6, -.15, .34); }
  if (name === 'park') { [x, h] = flight(1.4, BASE, 5, .15, .36); [x, h] = flight(x + 1.1, h, 5, -.15, .36); [x, h] = flight(x + .8, h, 3, .15, .36); }
  if (name === 'stones') { for (let s = 2.2; s < 7.6; s += .5) set(s + .25, s + .5, null); }
  if (name === 'fire') { [x, h] = flight(1.6, BASE, 4, .2, .3); [x, h] = flight(x + .7, h, 3, .2, .3); }
  if (name === 'precise') { [x, h] = flight(1.8, BASE, 5, .15, FOOT + .03); [x, h] = flight(x + .9, h, 5, -.15, FOOT + .03); }
  if (name === 'obstacles') {                             // pallets, gaps, uneven steps and clutter
    set(1.8, 2.5, BASE + .14); set(2.5, 2.68, null); set(2.68, 3.2, BASE + .28); set(3.2, 3.6, BASE + .1); set(3.9, 4.1, null);
    set(4.1, 4.5, BASE + .2); set(4.5, 4.9, BASE + .05); set(4.9, 5.3, BASE + .22); set(5.3, 5.36, BASE + .08); set(5.6, 5.66, BASE + .07);
    set(6.1, 6.6, BASE + .15); set(6.6, 6.78, null); set(7.2, 7.8, BASE + .12);
  }
  return g;
}
// scenario id → [button label, clip title substring, goal line, 3D set]
const SCEN = {
  stairs: ['Stairs', 'One Model', 'Get it up and down the stairs with vision on. Then try Blind mode.', 'outdoor'],
  park: ['Park stroll', 'stroll', 'A stroll through a park full of stairs. Cross it with vision on.', 'park'],
  stones: ['Stepping stones', 'One Model', 'Stepping stones: every foothold must be seen. Cross with vision on.', 'park'],
  obstacles: ['Obstacles', 'Unstructured', 'Pallets, gaps, uneven steps. Cross the whole mess with vision on.', 'office'],
  fire: ['Fire escape', 'Fire escape', 'Climb the fire escape: steep steps, narrow treads.', 'stairwell'],
  precise: ['Tight stairs', 'One Model', 'Treads just 3 cm deeper than the foot. Precise footwork only.', 'tight'],
  payload: ['Payload', 'payloads', 'Carry the box up and down the stairs.', 'outdoor'],
  push: ['Push / pull', 'Push', 'Drag the robot to push or pull it on the stairs. Absorb 3 and finish.', 'carpet'],
  custom: ['Your course', 'One Model', 'Draw a course with stairs and a gap. It must cross with vision on.', 'lab'],
};
const SIDS = Object.keys(SCEN);

function drawLog(k, lines, x, y, w, maxH) {              // word-wrapped log, newest line in black
  const rows = []; k.ctx.font = '500 12px Geist, system-ui, sans-serif';
  lines.forEach((l, li) => { let cur = ''; for (const wd of l.split(' ')) { const t = cur ? cur + ' ' + wd : wd; if (k.ctx.measureText(t).width > w && cur) { rows.push([cur, li]); cur = wd; } else cur = t; } rows.push([cur, li]); });
  rows.slice(-Math.max(1, Math.floor(maxH / 17))).forEach(([t, li], i) => k.text(t, x, y + i * 17, {size: 12, color: li === lines.length - 1 ? B.black : B.cool2}));
}

export default function mount(root, api) {
  const k = kit(root);
  const {ctx} = k;
  const clip = m => api.clip?.(m), record = (kind, d) => api.record?.(kind, d);
  let ground = preset('clear'), sid = 'custom', brush = 'ground', blind = false, drawing = null, edits = 0, strokeChanged = false, carry = false;
  let steps = 0, falls = 0, runBlind = false, completed = false, log = ['Pick a scenario below, or draw ground with the mouse.'], waitT = 0, flash = 0, seen = [];
  let grab = null, absorbed = 0, runPushes = 0, pendingPush = null, runT = 0, runAbsorbStart = 0;
  let setId = 'lab', terrainDirty = true, setDirty = true, dead = false, camMode = 'wide';
  const medals = {};                                    // scenario → best time (s), vision on
  let R;
  const say = s => { log.push(s); if (log.length > 30) log.shift(); };

  // ---- terrain queries ----
  const gi = x => clamp(Math.floor(x / DX), 0, N - 1);
  const gAt = x => ground[gi(x)];
  function foothold(x) {                                // flat, solid patch under the foot, or null
    let lo = 1e9, hi = -1e9;
    for (let i = gi(x - FOOT / 2); i <= gi(x + FOOT / 2 - DX / 2); i++) { const h = ground[i]; if (h == null) return null; lo = Math.min(lo, h); hi = Math.max(hi, h); }
    return hi - lo <= .021 ? hi : null;
  }
  const maxBetween = (a, b) => { let m = -1e9; for (let i = gi(Math.min(a, b)); i <= gi(Math.max(a, b)); i++) if (ground[i] != null) m = Math.max(m, ground[i]); return m; };
  function analyse() {
    const ris = [];
    for (let i = 0; i < N - 1; i++) { const a = ground[i], b = ground[i + 1]; if (a != null && b != null && Math.abs(b - a) >= .08 && Math.abs(b - a) <= .33) ris.push([i * DX, Math.sign(b - a)]); }
    let stairs = false; for (let i = 1; i < ris.length; i++) { const d = ris[i][0] - ris[i - 1][0]; if (ris[i][1] === ris[i - 1][1] && d >= .15 && d <= .8) stairs = true; }
    let gap = false, run = 0; for (let i = 0; i < N; i++) { run = ground[i] == null ? run + 1 : 0; if (run * DX >= .1) gap = true; }
    return {stairs, gap};
  }
  const profile = () => { const out = []; for (let i = 0; i < N; i += 10) out.push(ground[i] == null ? null : r3(ground[i])); return out; };

  function restart(msg) {
    const y = ground[0];
    R = {feet: [{x: .22, y}, {x: .5, y}], st: 1, sw: null, pel: {x: .42, y: y + HIP}, mode: 'walk', fallT: 0, fallKind: '', doneT: 0, phase: 0, push: 0, off: 0};
    runBlind = blind; seen = []; runPushes = 0; runT = 0; grab = null; pendingPush = null; runAbsorbStart = absorbed; fall0 = null;
    if (msg) say(msg);
  }

  const head = () => ({x: R.pel.x + .04, y: R.pel.y + TORSO + .08});
  const cone = () => { const h = head(); return [h.x + .15, h.x + 1.9]; };

  function chooseStep() {                              // one step at a time, from what is in view right now
    const S = R.feet[R.st], F = R.feet[1 - R.st], ideal = clamp(.36 + R.off * 1.2, .18, .56);
    if (blind) return {x: S.x + ideal, y: S.y, apex: S.y + .09, why: 'Blind step · assumes flat ground'};
    const [c0, c1] = cone(); let best = null;
    for (let x = S.x + .16; x <= S.x + .58; x += .01) {
      if (x < c0 || x > c1 || x > CL - .1) continue;
      const fh = foothold(x); if (fh == null) continue;
      const dy = fh - S.y; if (dy > .32 || dy < -.42) continue;
      const top = Math.max(maxBetween(F.x, x), S.y, fh); if (top - Math.max(S.y, fh) > .36) continue;
      let gapBelow = false; for (let i = gi(S.x + .08); i < gi(x - .08); i++) if (ground[i] == null) gapBelow = true;
      const L = x - S.x, sc = Math.abs(L - ideal) + .6 * Math.abs(dy);
      if (!best || sc < best.sc) best = {x, y: fh, apex: top + .1, sc, why: Math.abs(R.off) > .05 ? 'Corrective step · caught the push' : dy > .07 ? `Step up +${dy.toFixed(2)} m` : dy < -.07 ? `Step down ${dy.toFixed(2)} m` : gapBelow ? `Step over a ${(L - FOOT).toFixed(2)} m gap` : 'Step · flat'};
    }
    return best;
  }

  function fall(why, kind2) { R.mode = 'fall'; R.fallT = 0; R.fallKind = kind2; falls++; flash = 1; say(why); api.status(blind ? 'Fell · no vision' : 'Fell'); endRun('fell'); }
  function endRun(result) {
    record('terrain_run', {scenario: sid, vision: !runBlind, payload: carry, result, time_s: +runT.toFixed(1), steps, pushes: runPushes, profile: profile()});
  }
  function push(v) {                                     // the visitor shoves (+) or pulls (−) the torso
    if (!R || R.mode === 'fall' || R.mode === 'done') return;
    v = clamp(v, -PUSH_MAX, PUSH_MAX); R.push = v; runPushes++; flash = .4;
    if (Math.abs(v) > PUSH_FALL) { say(`${v > 0 ? 'Push' : 'Pull'} of ${Math.abs(v).toFixed(1)} m/s · too strong`); fall('Knocked over · even people fall at that', 'trip'); return; }
    pendingPush = {t: 0}; say(`${v > 0 ? 'Push' : 'Pull'} · ${Math.abs(v).toFixed(1)} m/s`);
    if (R.sw && R.sw.t < .5 && !blind) { const n = chooseStep(); if (n) { R.sw.to = {x: n.x, y: n.y}; R.sw.apex = Math.max(n.apex, R.sw.from.y + .08); } }
  }

  function update(dt) {
    if (R.mode === 'fall') { R.fallT += dt; if (R.fallT > 1.9) restart('Restart from the start'); return; }
    if (R.mode === 'done') { R.doneT += dt; if (R.doneT > 3.2) restart('Walking the course again'); return; }
    runT += dt;
    R.off += R.push * dt; R.push *= Math.exp(-dt * 3); R.off *= Math.exp(-dt * .6);
    if (pendingPush) { pendingPush.t += dt; if (pendingPush.t > 1.4) { pendingPush = null; absorbed++; say(`Footing corrected · ${absorbed} absorbed`); } }
    const S = R.feet[R.st];
    if (!R.sw && Math.max(R.feet[0].x, R.feet[1].x) > FIN) { finish(); return; }
    if (!R.sw) {
      waitT -= dt; if (R.mode === 'wait' && waitT > 0) return;
      const tgt = chooseStep();
      if (!tgt) { if (R.mode !== 'wait') { say('No safe foothold in view · waiting'); api.status('Waiting · nothing safe in view'); } R.mode = 'wait'; waitT = .25; }
      else {
        if (R.mode === 'wait') api.status('Walking');
        R.mode = 'walk'; const F = R.feet[1 - R.st], L = tgt.x - F.x;
        R.sw = {from: {...F}, to: {x: tgt.x, y: tgt.y}, apex: Math.max(tgt.apex, F.y + .08), t: 0, dur: (.32 + .3 * L + .5 * Math.abs(tgt.y - S.y)) * (carry ? 1.18 : 1), why: tgt.why};
      }
    }
    if (R.sw) {
      const w = R.sw; w.t = Math.min(1, w.t + dt / w.dur);
      if (!blind && w.t < .6) {                            // it keeps looking: re-plan this one step if the ground changed
        const fh = foothold(w.to.x);
        if (fh == null || Math.abs(fh - w.to.y) > .02) { const n = chooseStep(); if (n) { w.to = {x: n.x, y: n.y}; w.apex = Math.max(n.apex, w.from.y + .08); say('Ground changed in view · new foothold'); } }
      }
      const F = R.feet[1 - R.st], t = w.t;
      F.x = lerp(w.from.x, w.to.x, ease(clamp((t - .12) / .66, 0, 1)));
      F.y = t < .35 ? lerp(w.from.y, w.apex, ease(t / .35)) : t < .7 ? w.apex : lerp(w.apex, w.to.y, ease((t - .7) / .3));
      if (blind) { const g = gAt(F.x); if (g != null && g > F.y + .03 && t > .15 && t < .95) { fall('Toe hit a riser it could not see · trip', 'trip'); return; } }
      if (t >= 1) {
        const real = foothold(w.to.x) ?? (gAt(w.to.x) == null ? null : maxBetween(w.to.x - .08, w.to.x + .08));
        if (real == null) { F.y = w.to.y; fall(blind ? 'Stepped into a gap it could not see' : 'Foothold vanished · fell', 'gap'); return; }
        if (w.to.y - real > .12) { F.y = real; fall('Missed the step down · stumble', 'trip'); return; }
        F.y = real; R.st = 1 - R.st; R.sw = null; steps++; say(w.why); R.off *= .35;
      }
    }
    const S2 = R.feet[R.st], Fo = R.feet[1 - R.st], sp = R.sw ? ease(R.sw.t) : 0;
    const tx = (R.sw ? S2.x + lerp(-.08, .1, sp) : (S2.x + Fo.x) / 2 + .02) + R.off;
    const ty = Math.min(S2.y, R.sw ? Math.min(R.sw.to.y, R.sw.from.y) + .12 : Fo.y) + HIP + (R.sw ? Math.sin(sp * Math.PI) * .025 : 0);
    R.pel.x = lerp(R.pel.x, tx, 1 - Math.exp(-dt * 9)); R.pel.y = lerp(R.pel.y, Math.max(ty, S2.y + .5), 1 - Math.exp(-dt * 9));
    R.phase += dt * (R.sw ? 1 / R.sw.dur : 0);
  }

  function finish() {
    R.mode = 'done'; R.doneT = 0; const a = analyse(), t = +runT.toFixed(1);
    const missing = runBlind ? ['vision on for the whole run'] : sid === 'custom' ? [!a.stairs && 'a stair set', !a.gap && 'a gap', !edits && 'a stroke of your own'].filter(Boolean) : sid === 'push' && absorbedRun() < 3 ? [`${3 - absorbedRun()} more push${3 - absorbedRun() > 1 ? 'es' : ''} absorbed`] : [];
    endRun(missing.length ? 'cleared_partial' : 'cleared');
    if (!missing.length) {
      const prev = medals[sid], nb = prev === undefined || t < prev; if (nb) medals[sid] = t; flash = .5;
      say(`${SCEN[sid][0]} cleared in ${t} s${nb && prev !== undefined ? ' · new best' : ''} · no map, no plan`);
      api.status(`${SCEN[sid][0]} · ${t} s`);
      const n = Object.keys(medals).length;
      if (n >= 3 && !completed) { completed = true; api.complete('One policy · 3 scenarios, one network'); say('Three different scenarios, one network, zero mode switches.'); }
    } else { say(`Crossed. Still needed: ${missing.join(', ')}`); api.status('Crossed · not counted yet'); }
  }
  const absorbedRun = () => absorbed - runAbsorbStart;

  // =====================================================================================================
  // 3D: WebGL view under the kit's 2D overlay (panel, goal, log, medals stay 2D)
  // =====================================================================================================
  const PW = 250;
  const wrap = root.querySelector('.try-canvas');
  const gl = document.createElement('canvas'); gl.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  wrap.prepend?.(gl); k.canvas.style.position = 'relative'; k.canvas.style.zIndex = 1;
  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({canvas: gl, antialias: true}); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.outputColorSpace = THREE.SRGBColorSpace; }
  catch (e) { renderer = null; console.warn('one-policy: WebGL unavailable', e); }
  const scene3 = new THREE.Scene(), cam = new THREE.PerspectiveCamera(38, 1.5, .05, 80);
  const hemi = new THREE.HemisphereLight('#ffffff', '#8e8177', 1.2), sun = new THREE.DirectionalLight('#ffffff', 1.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, {left: -4, right: 4, top: 4, bottom: -4, near: .5, far: 20});
  scene3.add(hemi, sun, sun.target);
  const setG = new THREE.Group(), terrG = new THREE.Group(); scene3.add(setG, terrG);
  // vision frustum (translucent pyramid from the head) + the terrain strip it sees
  const fr = {pos: new Float32Array(15)};
  const frGeo = new THREE.BufferGeometry(); frGeo.setAttribute('position', new THREE.BufferAttribute(fr.pos, 3)); frGeo.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 1]);
  const frMat = new THREE.MeshBasicMaterial({color: '#FF7E00', transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide});
  const frMesh = new THREE.Mesh(frGeo, frMat); frMesh.frustumCulled = false; frMesh.renderOrder = 5;
  const frLGeo = new THREE.BufferGeometry(); frLGeo.setAttribute('position', new THREE.BufferAttribute(fr.pos, 3)); frLGeo.setIndex([0, 1, 0, 2, 0, 3, 0, 4, 1, 2, 2, 3, 3, 4, 4, 1]);
  const frLMat = new THREE.LineBasicMaterial({color: '#FF7E00', transparent: true, opacity: .55});
  const frLine = new THREE.LineSegments(frLGeo, frLMat); frLine.frustumCulled = false;
  const SQ = 240, sq = new Float32Array(SQ * 12), sqGeo = new THREE.BufferGeometry();
  { const idx = []; for (let i = 0; i < SQ; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3); sqGeo.setIndex(idx); }
  sqGeo.setAttribute('position', new THREE.BufferAttribute(sq, 3));
  const sqMesh = new THREE.Mesh(sqGeo, new THREE.MeshBasicMaterial({color: '#FF7E00', transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide})); sqMesh.frustumCulled = false;
  const target = new THREE.Mesh(new THREE.BoxGeometry(FOOT, .006, .12), new THREE.MeshBasicMaterial({color: '#FF7E00'}));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(.018, 12, 8), new THREE.MeshBasicMaterial({color: '#FF7E00'}));
  scene3.add(frMesh, frLine, sqMesh, target, eye);
  const box3 = cardboardBox(.34, .26, .3); box3.visible = false; scene3.add(box3);
  const human = person({shirt: '#46505a', pants: '#23262a'}); human.visible = false; scene3.add(human);
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, 1, 6), mat('#e0a21a')); strap.visible = false; scene3.add(strap);
  let bot = null, bodyId = {}, lastPose = null, fall0 = null;
  MJ.spawn('g1', {tint: '#1c1e22'}).then(b => {
    if (dead) { b.dispose(); return; }
    bot = b; scene3.add(bot.group);
    for (let i = 0; i < bot.model.nbody; i++) bodyId[bot.bodyName(i)] = i;
    for (const m of bot.meshes) { m.material.metalness = .35; m.material.roughness = .42; }
    say('Stand-in humanoid loaded · MuJoCo model, kinematic gait');
  }).catch(e => { console.warn('one-policy: G1 load failed', e); say('Could not load the humanoid model'); });

  const tY = x => { const g = gAt(x); return g == null ? null : g - BASE; };   // three-y of the terrain at x
  function smoothTerrain(x) {                              // for rails: running max, then average
    let s = 0, n = 0; for (let d = -.3; d <= .3; d += .05) { let m = -1e9; for (let e = -.15; e <= .15; e += .05) { const g = gAt(clamp(x + d + e, 0, CL - DX)); if (g != null) m = Math.max(m, g); } if (m > -1e8) { s += m; n++; } }
    return n ? s / n - BASE : 0;
  }
  function buildSet() {
    disposeTree(setG); setG.clear();
    const S = SETS[setId]; scene3.background = new THREE.Color(S.bg); scene3.fog = new THREE.Fog(S.bg, 14, 40);
    hemi.color.set(S.hemi[0]); hemi.groundColor.set(S.hemi[1]); hemi.intensity = S.hemi[2]; sun.intensity = S.sun;
    const gm = S.ground();                                  // floor outside the course and beside the path
    setG.add(block(-30, -.02, -30, 0, 0, 30, gm), block(CL, -.02, -30, CL + 30, 0, 30, gm), block(0, -.02, W, CL, 0, 30, gm), block(0, -.02, -30, CL, 0, -W, gm));
    const c = {span: [0, CL], terrainAt: tY, rail: (z, step) => { const out = []; for (let x = .2; x <= CL - .2 + 1e-6; x += step) out.push(new THREE.Vector3(x, smoothTerrain(x), z)); return out; }};
    S.build(setG, c); setDirty = false;
  }
  function buildTerrain() {
    disposeTree(terrG); terrG.clear();
    const S = SETS[setId], pm = S.path(), gm = S.ground(), grass = S.embank?.();
    const pit = mat(setId === 'park' && sid === 'stones' ? '#2f5d73' : '#1d2126', {rough: setId === 'park' ? .2 : .9});
    terrG.add(block(-.02, -.5, -W, CL + .02, -.45, W, pit));
    for (let i = 0; i < N;) {
      const h = ground[i]; let j = i + 1; while (j < N && ground[j] === h) j++;
      if (h != null) {
        const x0 = i * DX, x1 = j * DX, y1 = h - BASE, flat = S.palletPath && Math.abs(h - BASE) < 1e-6;
        const top = flat ? gm : pm.top, side = flat ? gm : pm.side;
        terrG.add(block(x0, -.45, -W, x1, y1, W, [side, side, top, side, side, side]));
        const prev = i > 0 ? ground[i - 1] : BASE, next = j < N ? ground[j] : BASE;
        if (prev == null || prev < h - .02) terrG.add(block(x0, y1 - .025, -W, x0 + .035, y1 + .003, W, pm.nose));
        if (next == null || next < h - .02) terrG.add(block(x1 - .035, y1 - .025, -W, x1, y1 + .003, W, pm.nose));
        if (grass) { terrG.add(block(x0, -.45, -W - 4, x1, y1 - .03, -W, grass)); terrG.add(block(x0, -.45, W, x1, y1 - .03, W + 4, grass)); }
      }
      i = j;
    }
    const fin = mat('#FF7E00', {rough: .6}), fy = tY(FIN) ?? 0;
    terrG.add(block(FIN - .02, fy, -W, FIN + .02, fy + .004, W, fin));
    const post = block(FIN - .02, fy, -W - .05, FIN + .02, fy + 1.6, -W + .01, mat(medals[sid] !== undefined ? '#FF7E00' : '#1a1a1a')); terrG.add(post);
    terrG.add(block(FIN + .02, fy + 1.3, -W - .04, FIN + .4, fy + 1.58, -W, fin));
    terrainDirty = false;
  }

  // ---- G1 pose from the 2D gait state: pelvis + 2-link sagittal leg IK + arm swing ----
  const jointVals = {};
  function legIK(px, pz, beta, fx, fz, side) {
    const [hx, hz] = rotPhi(0, -HIPZ, -beta), ax = fx - FOOTC - (px + hx), az = fz + ANK - (pz + hz);
    const [vx, vz] = rotPhi(ax, az, beta), d = clamp(Math.hypot(vx, vz), .2, LMAX), phA = Math.atan2(vz, vx);
    const al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)), ga = Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
    const phT = phA + al, phS = phT - (Math.PI - ga), th = PHI_T0 - phT, tk = Math.max(0, -Math.PI / 2 - th - phS);
    jointVals[`${side}_hip_pitch_joint`] = th; jointVals[`${side}_knee_joint`] = tk; jointVals[`${side}_ankle_pitch_joint`] = clamp(-(th + tk + beta), -.87, .52);
  }
  const P3 = {x: 0, z: 0, beta: 0};
  function pose3d() {
    if (!bot) return;
    const q = bot.data.qpos;
    bot.reset();
    let px, pz, beta;
    if (R.mode === 'fall' && lastPose) {
      if (!fall0) { const S = R.feet[R.st]; fall0 = {px: lastPose.x, pz: lastPose.z, beta: lastPose.beta, fx: S.x, fz: S.y - BASE}; }
      const f = ease(clamp(R.fallT / .7, 0, 1)), th = f * 1.35, [rx, rz] = rotPhi(fall0.px - fall0.fx, fall0.pz - fall0.fz, -th);
      px = fall0.fx + rx; pz = fall0.fz + rz - (R.fallKind === 'gap' ? Math.pow(R.fallT, 2) * 2.2 : 0); beta = fall0.beta + th;
      Object.assign(jointVals, lastPose.j);
    } else {
      fall0 = null;
      beta = clamp(R.off * 1.2 + R.push * .15, -.35, .35) * .45 + (carry ? -.04 : .03);
      px = R.pel.x; pz = R.pel.y - BASE;
      for (const F of R.feet) { const ax = F.x - FOOTC - px, lim = LMAX * LMAX - ax * ax; if (lim > 0) pz = Math.min(pz, F.y - BASE + ANK + Math.sqrt(lim) + HIPZ - .004); }
      legIK(px, pz, beta, R.feet[0].x, R.feet[0].y - BASE, 'left'); legIK(px, pz, beta, R.feet[1].x, R.feet[1].y - BASE, 'right');
      const swing = Math.sin(R.phase * Math.PI) * (R.st ? 1 : -1);
      for (const [side, sg] of [['left', 1], ['right', -1]]) {
        if (carry) { jointVals[`${side}_shoulder_pitch_joint`] = -1.05; jointVals[`${side}_shoulder_roll_joint`] = sg * .12; jointVals[`${side}_elbow_joint`] = .55; }
        else { jointVals[`${side}_shoulder_pitch_joint`] = .15 + sg * swing * .38; jointVals[`${side}_shoulder_roll_joint`] = sg * .16; jointVals[`${side}_elbow_joint`] = 1.05; }
      }
      lastPose = {x: px, z: pz, beta, j: {...jointVals}};
    }
    q[0] = px; q[1] = 0; q[2] = pz; q[3] = Math.cos(beta / 2); q[4] = 0; q[5] = Math.sin(beta / 2); q[6] = 0;
    for (const [n, v] of Object.entries(jointVals)) bot.set(n, v);
    bot.kinematics();
    Object.assign(P3, {x: px, z: pz, beta});
  }
  const mjPos = (name, off = [0, 0, 0]) => {             // body point (MuJoCo frame) → three.js vector
    const b = bodyId[name]; if (b === undefined || !bot) return null; const p = bot.data.xpos, m = bot.data.xmat, o = b * 3, r = b * 9;
    const x = p[o] + m[r] * off[0] + m[r + 1] * off[1] + m[r + 2] * off[2], y = p[o + 1] + m[r + 3] * off[0] + m[r + 4] * off[1] + m[r + 5] * off[2], z = p[o + 2] + m[r + 6] * off[0] + m[r + 7] * off[1] + m[r + 8] * off[2];
    return new THREE.Vector3(x, z, -y);
  };
  const head3 = () => mjPos('torso_link', [.075, 0, .42]) || new THREE.Vector3(R.pel.x + .06, R.pel.y - BASE + .55, 0);

  function update3d(dt, t) {
    if (terrainDirty) buildTerrain();
    if (setDirty) buildSet();
    pose3d();
    const hd = head3(), [c0, c1] = cone(), on = !blind && R.mode !== 'fall';
    const gy = x => tY(clamp(x, 0, CL - DX)) ?? -.45, P = fr.pos;
    const put = (i, x, y, z) => { P[i * 3] = x; P[i * 3 + 1] = y; P[i * 3 + 2] = z; };
    put(0, hd.x, hd.y, hd.z); put(1, c0, gy(c0), -.22); put(2, c0, gy(c0), .22); put(3, c1, gy(c1), .62); put(4, c1, gy(c1), -.62);
    frGeo.attributes.position.needsUpdate = true; frLGeo.attributes.position.needsUpdate = true;
    frMat.opacity = on ? .12 : .03; frLMat.opacity = on ? .6 : .18; frMat.color.set(on ? '#FF7E00' : '#9aa0a6'); frLMat.color.set(on ? '#FF7E00' : '#9aa0a6');
    eye.position.copy(mjPos('torso_link', [.1, 0, .43]) || hd); eye.material.color.set(on ? '#FF7E00' : '#3a3f45'); eye.visible = !!bot;
    let nq = 0;                                            // orange strips on the treads in view
    if (on) for (let i = gi(c0); i < gi(c1) && nq < SQ;) {
      const h = ground[i]; let j = i + 1; while (j < gi(c1) && ground[j] === h) j++;
      if (h != null) { const x0 = i * DX, x1 = j * DX, y = h - BASE + .004, zz = lerp(.22, .62, clamp(((x0 + x1) / 2 - c0) / (c1 - c0), 0, 1)), o = nq * 12;
        sq.set([x0, y, -zz, x1, y, -zz, x1, y, zz, x0, y, zz], o); nq++; }
      i = j;
    }
    sqGeo.setDrawRange(0, nq * 6); sqGeo.attributes.position.needsUpdate = true; sqMesh.visible = nq > 0;
    target.visible = !!(R.sw && !blind && R.mode !== 'fall'); if (target.visible) target.position.set(R.sw.to.x, R.sw.to.y - BASE + .004, 0);
    // payload box between the hands
    box3.visible = carry && !!bot;
    if (box3.visible) { const a = mjPos('left_wrist_yaw_link', [.06, 0, 0]), b = mjPos('right_wrist_yaw_link', [.06, 0, 0]); if (a && b) { box3.position.copy(a).add(b).multiplyScalar(.5); box3.position.x += .1; box3.position.y -= .02; box3.rotation.z = -P3.beta; } }
    // push / pull: a person with a strap, walking behind the robot on the red carpet
    const showHuman = sid === 'push' && setId === 'carpet';
    human.visible = strap.visible = showHuman && !!bot;
    if (human.visible) {
      const hx = P3.x - 1.05, hy = tY(clamp(hx, 0, CL - DX)) ?? 0, dragV = grab ? clamp((grab.x - grab.x0) / Math.max(1, pxPerM()) * 1.1, -PUSH_MAX, PUSH_MAX) : 0;
      human.position.set(hx, hy, -.45); human.pose(clamp(-dragV * .45 - R.push * .3, -.5, .45) - .1, .9 + Math.max(0, -dragV) * .5, R.phase * Math.PI);
      human.updateMatrixWorld(true);
      const a = human.hand(), b = mjPos('pelvis', [-.08, 0, .05]) || a;
      const d = new THREE.Vector3().subVectors(b, a); strap.position.copy(a).addScaledVector(d, .5); strap.scale.set(1, Math.max(.01, d.length()), 1);
      strap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    }
    // camera: side-follow (slightly from behind and above), or a wide view of the whole course for drawing
    const vw = Math.max(10, k.w - PW), vh = Math.max(10, k.h); cam.aspect = vw / vh;
    const gyR = tY(clamp(P3.x, 0, CL - DX)) ?? 0;
    const follow = {x: P3.x + .7, y: gyR + .7, dist: 3.5}, wide = {x: CL / 2, y: .55, dist: (CL / 2 + .6) / (Math.tan(19 * Math.PI / 180) * cam.aspect)};
    const want = camMode === 'wide' ? wide : follow, cs = camS;
    if (!drawing) { const a = 1 - Math.exp(-dt * 3); cs.x = lerp(cs.x, want.x, a); cs.y = lerp(cs.y, want.y, a); cs.dist = lerp(cs.dist, want.dist, a); }
    cam.position.set(cs.x - .55, cs.y + .42 + cs.dist * .12, cs.dist); cam.lookAt(cs.x, cs.y, 0); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    sun.position.set(cs.x - 2, 6, 4); sun.target.position.set(cs.x, 0, 0); sun.target.updateMatrixWorld();
    if (renderer) {
      const pr = renderer.getPixelRatio(); if (gl.width !== Math.round(k.w * pr) || gl.height !== Math.round(k.h * pr)) renderer.setSize(k.w, k.h, false);
      renderer.setScissorTest(true); renderer.setViewport(PW, 0, vw, vh); renderer.setScissor(PW, 0, vw, vh); renderer.render(scene3, cam);
    }
    void t;
  }
  const camS = {x: CL / 2, y: .55, dist: 9};
  const toScreen = (x, y, z = 0) => { const v = new THREE.Vector3(x, y, z).project(cam); return [PW + (v.x + 1) / 2 * (k.w - PW), (1 - v.y) / 2 * k.h]; };
  const pxPerM = () => { const y = P3.z + .2; return Math.abs(toScreen(P3.x + .5, y)[0] - toScreen(P3.x - .5, y)[0]); };
  const ray = new THREE.Raycaster(), zPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hitV = new THREE.Vector3();
  function W3(p) {                                          // pointer → course coords {x, y} on the robot's plane
    ray.setFromCamera(new THREE.Vector2((p.x - PW) / (k.w - PW) * 2 - 1, -(p.y / k.h) * 2 + 1), cam);
    if (!ray.ray.intersectPlane(zPlane, hitV)) return null; return {x: hitV.x, y: hitV.y + BASE};
  }

  function paint(a, b) {
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), lockF = R.feet.map(f => f.x);
    const extra = brush === 'gap' ? .05 : 0;
    for (let i = gi(x0 - extra); i <= gi(x1 + extra); i++) {
      const cx = (i + .5) * DX; if (cx < PAD || cx > CL || lockF.some(f => Math.abs(f - cx) < .13)) continue;
      const u = x1 - x0 < 1e-6 ? 1 : (cx - a.x) / (b.x - a.x), h = brush === 'gap' ? null : snap(clamp(lerp(a.y, b.y, clamp(u, 0, 1)), .1, 2.4));
      if (ground[i] !== h) { ground[i] = h; strokeChanged = true; terrainDirty = true; }
    }
  }
  const onBot = p => {
    if (!R || R.mode === 'fall' || !bot) return false;
    const [x, yF] = toScreen(P3.x, P3.z - .6), [, yH] = toScreen(P3.x, P3.z + .6);
    return Math.abs(p.x - x) < Math.max(26, pxPerM() * .28) && p.y > yH - 10 && p.y < yF + 10;
  };
  k.onDown(p => {
    if (p.x < PW) return;
    if (onBot(p)) { grab = {x0: p.x, x: p.x}; return; }
    const w = W3(p); if (!w) return;
    drawing = w; strokeChanged = false; paint(drawing, drawing);
  });
  k.onMove(p => { if (grab) { grab.x = p.x; return; } if (!drawing) return; const w = W3(p); if (!w) return; paint(drawing, w); drawing = w; });
  k.onUp(() => {
    if (grab) { const v = (grab.x - grab.x0) / Math.max(1, pxPerM()) * 1.1; grab = null; if (Math.abs(v) > .15) push(v); return; }
    if (!drawing) return; drawing = null;
    if (strokeChanged) {
      edits++; setDirty = true; if (sid !== 'custom') { sid = 'custom'; markScen(); }
      const a = analyse(); say(`You drew terrain${a.stairs ? ' · stairs ✓' : ''}${a.gap ? ' · gap ✓' : ''}`);
    }
  });

  k.frame((dt, t) => { flash = Math.max(0, flash - dt * 1.5); update(dt); update3d(dt, t); draw(t); });

  const pill = (x, y, w, h, fill = B.white, a = .88) => { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(12, h / 2)); ctx.fill(); ctx.restore(); };
  const tw = (s, size = 13, weight = 500, mono = false) => { ctx.font = `${weight} ${size}px ${mono ? '"Geist Mono", ui-monospace, monospace' : 'Geist, system-ui, sans-serif'}`; return ctx.measureText(s).width; };

  function draw(t) {
    ctx.clearRect(0, 0, k.w, k.h);
    const x0 = PW + 16, a = analyse(), s = pxPerM();
    if (!renderer) { ctx.fillStyle = B.warm1; ctx.fillRect(PW, 0, k.w - PW, k.h); k.text('3D view unavailable (WebGL is off in this browser)', x0, 90, {size: 13, color: B.cool2}); }
    const goal = `Goal: ${SCEN[sid][2]}`, sub = `3D · simulated · stand-in humanoid in Skild livery (MuJoCo model), kinematic gait · drag to draw ${brush === 'gap' ? 'gaps' : 'ground'} · drag the robot to push or pull`;
    pill(x0 - 10, 10, Math.min(k.w - x0 - 8, Math.max(tw(goal, 15, 600), tw(sub.toUpperCase(), 10, 500, true)) + 22), 48);
    k.text(goal, x0, 30, {size: 15, weight: 600}); k.label(sub, x0, 48);
    if (!bot) k.text('Loading Skild humanoid · MuJoCo Menagerie…', x0, 80, {size: 12, mono: true, color: B.cool2});
    if (grab) {                                            // push / pull arrow
      const [bx, by] = toScreen(P3.x, P3.z + .15), v = clamp((grab.x - grab.x0) / Math.max(1, s) * 1.1, -PUSH_MAX, PUSH_MAX), ex = bx + v / 1.1 * s;
      ctx.strokeStyle = Math.abs(v) > PUSH_FALL ? B.black : B.orange; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, by); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ex, by); ctx.lineTo(ex - Math.sign(v) * 8, by - 6); ctx.moveTo(ex, by); ctx.lineTo(ex - Math.sign(v) * 8, by + 6); ctx.stroke();
      const lab = `${v >= 0 ? 'push' : 'pull'} ${Math.abs(v).toFixed(1)} m/s${Math.abs(v) > PUSH_FALL ? ' · too hard' : ''}`;
      pill(bx - tw(lab, 12, 600, true) / 2 - 8, by - 30, tw(lab, 12, 600, true) + 16, 22);
      k.text(lab, bx, by - 14, {align: 'center', size: 12, mono: true, weight: 600});
    }
    if (R.mode === 'wait') { const [wx, wy] = toScreen(P3.x, P3.z + .8), lab = 'No safe foothold in view'; pill(wx - tw(lab, 12, 500, true) / 2 - 8, wy - 18, tw(lab, 12, 500, true) + 16, 24); k.text(lab, wx, wy - 2, {align: 'center', size: 12, color: B.cool2, mono: true}); }
    if (flash > 0) { ctx.fillStyle = `rgba(46,58,71,${flash * .14})`; ctx.fillRect(PW, 0, k.w - PW, k.h); }
    { const rx = k.w - 16, lab = `${runT.toFixed(1)} s`; pill(rx - 96, 12, 96, medals[sid] !== undefined ? 44 : 26);
      k.text(lab, rx - 8, 30, {align: 'right', size: 13, mono: true, weight: 600});
      if (medals[sid] !== undefined) k.text(`best ${medals[sid]} s`, rx - 8, 48, {align: 'right', size: 11, mono: true, color: B.orange}); }
    if (R.mode === 'done' && medals[sid] !== undefined) { const cx = PW + (k.w - PW) / 2, lab = 'Cleared · one step at a time, no map'; pill(cx - tw(lab, 18, 600) / 2 - 16, 72, tw(lab, 18, 600) + 32, 36); k.text(lab, cx, 97, {align: 'center', size: 18, weight: 600, color: B.orange}); }

    // ---- medal strip (bottom of the scene, left of the video corner) ----
    const mw = Math.max(200, k.w - 360 - x0); ctx.font = '500 12px Geist, system-ui, sans-serif';
    const chipsL = SIDS.map(id => { const m = medals[id]; const lab = SCEN[id][0] + (m !== undefined ? ` · ${m} s` : ''); return {id, m, lab, w: ctx.measureText(lab).width + 34}; });
    let rows = 1, cxm = x0; for (const c of chipsL) { if (cxm + c.w > x0 + mw && cxm > x0) { rows++; cxm = x0; } cxm += c.w + 6; }
    const my = k.h - 16 - rows * 30 - 14, ml = `Scenarios cleared with vision · ${Object.keys(medals).length}/${SIDS.length}${completed ? '' : ' · 3 to finish'}`;
    pill(x0 - 8, my - 14, tw(ml.toUpperCase(), 10, 500, true) + 16, 20);
    k.label(ml, x0, my);
    let cx = x0, cy = my + 10;
    for (const c of chipsL) {
      if (cx + c.w > x0 + mw && cx > x0) { cx = x0; cy += 30; }
      ctx.fillStyle = c.id === sid ? B.black : B.white; ctx.strokeStyle = c.id === sid ? B.black : B.warm3; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(cx, cy, c.w, 24, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = c.m !== undefined ? B.orange : B.warm2; ctx.beginPath(); ctx.arc(cx + 13, cy + 12, 4, 0, 7); ctx.fill();
      k.text(c.lab, cx + 23, cy + 16, {size: 12, color: c.id === sid ? B.white : B.black});
      cx += c.w + 6;
    }

    // ---- left panel ----
    const x = 18, iw = PW - 36;
    ctx.fillStyle = B.white; ctx.fillRect(0, 0, PW, k.h); ctx.fillStyle = B.warm2; ctx.fillRect(PW, 0, 1, k.h);
    k.label('One policy · vision + joints', x, 28);
    k.text(blind ? 'Blind · joints only' : 'Vision on', x, 52, {size: 16, weight: 600, color: blind ? B.black : B.orange});
    k.label('What it sees right now', x, 80);
    ctx.fillStyle = B.warm1; ctx.beginPath(); ctx.roundRect(x, 88, iw, 64, 8); ctx.fill();
    { const [c0, c1] = cone(); seen = []; for (let xx = c0; xx <= c1; xx += DX * 2) seen.push([xx, xx < CL ? gAt(xx) : null]); }
    if (!blind) { const S = R.feet[R.st], bw = iw / Math.max(1, seen.length);
      seen.forEach(([, g], i) => { if (g == null) { ctx.fillStyle = B.cool1; ctx.fillRect(x + i * bw, 146, bw, 2); return; } const v = clamp((g - S.y) / 1.2 + .35, .03, 1); ctx.fillStyle = 'rgba(255,126,0,.75)'; ctx.fillRect(x + i * bw, 150 - v * 56, bw + .3, v * 56); }); }
    else k.text('camera off', x + iw / 2, 125, {align: 'center', size: 12, mono: true, color: B.cool2});
    const row = (lab, val, y, hot) => { k.label(lab, x, y); k.text(String(val), x + iw, y, {align: 'right', size: 14, weight: 600, mono: true, color: hot ? B.orange : B.black}); };
    row('Footsteps planned ahead', 0, 180, true); row('Maps built', 0, 200, true); row('Mode switches', 0, 220, true);
    row('Steps taken', steps, 244); row('Falls', falls, 264); row('Pushes absorbed', absorbed, 284);
    let ly = 312;
    if (sid === 'custom') {
      k.label('Your course', x, ly);
      [[a.stairs, 'A stair set'], [a.gap, 'A gap'], [edits > 0, 'Drawn by you'], [!runBlind, 'Vision on all run']].forEach(([ok, lab], i) => {
        const y = ly + 18 + i * 18; ctx.fillStyle = ok ? B.orange : B.warm2; ctx.beginPath(); ctx.roundRect(x, y - 10, 12, 12, 3); ctx.fill();
        k.text(lab, x + 20, y, {size: 12, color: ok ? B.black : B.cool2});
      });
      ly += 96;
    } else if (sid === 'push') { k.label('Pushes this run', x, ly); k.meter(x, ly + 10, iw, absorbedRun() / 3); ly += 34; }
    k.label('Log', x, ly);
    drawLog(k, log.slice(-8), x, ly + 20, iw, k.h - ly - 26);
    void t;
  }

  function markScen() { scenBtns.forEach(b => b.classList.toggle('on', b.dataset.id === sid)); }
  const setCam = m => { camMode = m; camBtn.textContent = 'View: ' + (m === 'wide' ? 'whole course' : 'follow'); camBtn.classList.toggle('on', m === 'wide'); };
  const load = id => () => {
    sid = id; ground = preset(id === 'custom' ? 'clear' : id); edits = 0; setCarry(id === 'payload');
    setId = SCEN[id][3]; terrainDirty = setDirty = true; setCam(id === 'custom' ? 'wide' : 'follow');
    restart(`Scenario: ${SCEN[id][0]}`); markScen(); api.status(SCEN[id][0]); clip(SCEN[id][1]);
  };
  const scenBtns = SIDS.map(id => { const b = k.button(SCEN[id][0], load(id)); b.dataset.id = id; return b; });
  const bb = k.button('Brush: ground', () => { brush = brush === 'ground' ? 'gap' : 'ground'; bb.textContent = 'Brush: ' + brush; bb.classList.toggle('on', brush === 'gap'); });
  const setCarry = v => { carry = v; carryBtn.classList.toggle('on', v); carryBtn.textContent = 'Carry box' + (v ? ' · ON' : ' · OFF'); };
  const carryBtn = k.button('Carry box · OFF', () => { setCarry(!carry); say(carry ? 'Carrying a box · same policy' : 'Box put down'); });
  k.toggle('Blind mode (joints only)', false, v => { blind = v; if (v) runBlind = true; say(v ? 'Vision off · it only feels its joints' : 'Vision on · it reacts to what it sees'); });
  const camBtn = k.button('View: whole course', () => setCam(camMode === 'wide' ? 'follow' : 'wide'));
  k.button('Restart run', () => restart('Run restarted'), {primary: true});
  restart(); markScen(); setCam('wide'); api.status('Pick a scenario');
  return () => {
    dead = true;
    if (bot) { scene3.remove(bot.group); disposeTree(bot.group); bot.dispose(); bot = null; }
    disposeTree(scene3);
    if (renderer) { renderer.dispose(); renderer.forceContextLoss?.(); }
    k.destroy();
  };
}
