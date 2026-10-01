// TRY · Physical self-play — "Train by self-play": gen 0 is S1 (pre-trained on human data, so capped at human level).
// Self-play with one objective, "score", against recent versions of itself pushes the rating past the human-data
// ceiling and grows the skills the post names (get back up, dribble past the defender, shield, tackle). Then play the
// trained policy in simulation or on the "real" pitch (sim → real). Stylized game, not the real model.
// 3D: stand-in humanoids in Skild livery (MuJoCo Menagerie model, kinematic run / kick / fall / get-up on the real joints), one in
// an Argentina-style striped jersey with a visor, a soccer ball, white goals. "Simulation" arena: bright sim pitch with
// parallel training fields; "Real world": indoor pitch with the Skild logo on the wall.
import {kit, B, lerp, clamp, rand} from './kit.js';
import * as MJ from '../mj.js';
import {THREE, stage, lights, std, box as mbox, pitchTexture, goalFrame, soccerBall, jerseyTexture, follower, canvasTex} from '../props/ind-props.js';

const PW = 20, PH = 12, G0 = 4.2, G1 = 7.8, BR = .5, BALLR = .25, CEIL = 1400, SUB = 1 / 60, READY = 20;
const SKILLS = [{id: 'getup', name: 'Stand back up after a fall', g: 4}, {id: 'dribble', name: 'Dribble past the defender', g: 8}, {id: 'shield', name: 'Shield the ball', g: 14}, {id: 'tackle', name: 'Tackle the opponent', g: 20}];
const HUMAN = {speed: 3.2, turn: 11, control: .75, kick: 11};
// The policy is a parameter set that improves with generation (stylized, not the real model).
const pol = g => { const s = 1 - Math.exp(-g / 14); return {g, s, speed: 1.9 + 1.4 * s, turn: 3 + 6 * s, control: .15 + .8 * s, predict: s, aim: .2 + .75 * s, getUp: g >= 4, dribble: g >= 8, shield: g >= 14, tackle: g >= 20}; };
const elo = g => 1280 + 950 * (1 - Math.exp(-g / 18));
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const ARENA = {sim: {name: 'Simulation', clip: 'In simulation', fric: 1.1, noise: 0}, real: {name: 'Real world · humanoid', clip: 'Real world', fric: 1.35, noise: .6}};

export default function mount(root, api) {
  const k = kit(root); const {ctx} = k;
  const clip = m => api.clip?.(m), record = (kind, d) => api.record?.(kind, d);
  let phase = 'train', training = false, gen = 0, ff = 8, M = null, completed = false, ceilingGen = null, arena = 'sim', recordedGen = 0;
  const curve = [{g: 0, e: elo(0)}], pop = {}, keys = new Set(), trail = [];
  const best = {latest: null, base: null};                    // best goal difference per opponent type
  let kickReq = false, intro = 1;
  const log = ['Gen 0 = S1, pre-trained on human data. Press ▶ Run self-play.'];
  const say = s => { log.push(s); if (log.length > 6) log.shift(); };
  const unlocked = () => SKILLS.filter(s => gen >= s.g).map(s => s.id);

  // ---- match / physics
  const mkBot = (x, h) => ({x, y: PH / 2, h, vx: 0, vy: 0, cd: 0, moveT: 0, side: 1, down: 0, fallCd: 0, tag: '', tagT: 0});
  function kickoff(m) {
    m.bots[0] = mkBot(5, 0); m.bots[1] = mkBot(15, Math.PI);
    m.ball = {x: PW / 2, y: PH / 2, vx: m.mode === 'train' ? rand(-1.5, 1.5) : 0, vy: m.mode === 'train' ? rand(-2, 2) : 0};
    trail.length = 0;
  }
  function newMatch(mode, opp = 'latest') {
    // self-play opponent: one of the last few versions of the current policy ("recent versions of itself")
    const oppG = mode === 'train' ? Math.max(0, gen - 1 - Math.floor(rand() * Math.min(gen, 5))) : opp === 'base' ? 0 : gen;
    M = {mode, opp, arena: mode === 'train' ? 'sim' : arena, bots: [], ball: null, pols: mode === 'train' ? [pol(gen), pol(oppG)] : [null, pol(oppG)], oppG, score: [0, 0], t: 0, pause: mode === 'play' ? 1.2 : 0, len: mode === 'train' ? 7 : 60, falls: 0, flash: 0};
    kickoff(M);
  }
  const front = b => [b.x + Math.cos(b.h) * (BR + BALLR + .02), b.y + Math.sin(b.h) * (BR + BALLR + .02)];
  const near = (b, ball) => { const f = front(b); return Math.hypot(f[0] - ball.x, f[1] - ball.y) < .55; };
  const tag = (b, s) => { b.tag = s; b.tagT = .6; };
  function kick(b, ball, ang, pow) { if (b.cd > 0 || b.down > 0 || !near(b, ball)) return false; ball.vx = Math.cos(ang) * pow + b.vx * .3; ball.vy = Math.sin(ang) * pow + b.vy * .3; b.cd = .45; return true; }
  function carry(b, ball, c, dt) {
    if (b.cd > 0 || b.down > 0) return; const f = front(b), dx = f[0] - ball.x, dy = f[1] - ball.y;
    if (Math.hypot(dx, dy) < .45 + c * .3) { ball.vx += (dx * 16 * c + (b.vx - ball.vx) * 7 * c) * dt; ball.vy += (dy * 16 * c + (b.vy - ball.vy) * 7 * c) * dt; }
  }
  function ai(b, o, ball, P, dir, dt, t) {
    const gx = dir > 0 ? PW + .3 : -.3, gy = PH / 2, toG = Math.atan2(gy - b.y, gx - b.x), dG = Math.hypot(gx - b.x, gy - b.y);
    const wob = Math.sin(t * 2.3 + dir) * (1 - P.s) * .6;
    const od = Math.hypot(o.x - b.x, o.y - b.y), toO = Math.atan2(o.y - b.y, o.x - b.x);
    if (near(b, ball)) {
      const face = Math.abs(angDiff(toG, b.h)), range = 6.5 + 1.5 * P.aim;
      const aimY = gy + (P.aim > .6 ? (o.y > gy ? -1.1 : 1.1) : 0) + (rand() - .5) * (1 - P.aim) * 4;
      if (dG < range && face < .22 + .1 * P.aim) { kick(b, ball, Math.atan2(aimY - b.y, gx - b.x), 10 + 4 * P.aim); return [toG, P.speed]; }
      if (!P.dribble) { if (face < 1) kick(b, ball, toG + (rand() - .5) * .9, 7); return [toG + wob, P.speed]; }
      let aim = toG, spd = P.speed * (.8 + .15 * P.control);
      const wall = b.y < 1.6 ? 1 : b.y > PH - 1.6 ? -1 : 0;
      if (wall) aim = Math.atan2(gy - b.y + wall * 2, (gx - b.x) * .6);
      const block = Math.cos(angDiff(toO, toG)) > .7;
      if (P.dribble && b.moveT < -1.2 && od < 1.8 && block) { b.moveT = .55; b.side = ((o.x - b.x) * -Math.sin(toG) + (o.y - b.y) * Math.cos(toG)) > 0 ? -1 : 1; tag(b, 'dribble'); }
      if (b.moveT > 0) { aim = toG + b.side * (b.moveT > .3 ? -.45 : .7); carry(b, ball, 1, dt); }
      else if (P.shield && od < 1.5 && !block && o.down <= 0) {   // keep the body between the opponent and the ball
        const away = toO + Math.PI; aim = toG + clamp(angDiff(away, toG), -.9, .9); spd *= .75; carry(b, ball, 1, dt); if (b.tagT <= 0) tag(b, 'shield');
      }
      return [aim, spd];
    }
    if (P.tackle && b.cd <= 0 && near(o, ball) && Math.hypot(ball.x - b.x, ball.y - b.y) < 1.05) {   // poke the ball away
      const pa = toG + (rand() - .5) * .8; ball.vx = Math.cos(pa) * 6.5; ball.vy = Math.sin(pa) * 6.5; b.cd = .6; o.cd = Math.max(o.cd, .5); tag(b, 'tackle');
      if (M.mode === 'play') say(`Gen ${P.g} tackles you.`);
    }
    const T = Math.min(1.2, Math.hypot(ball.x - b.x, ball.y - b.y) / P.speed) * P.predict, lead = (1 - Math.exp(-1.1 * T)) / 1.1;
    const px = clamp(ball.x + ball.vx * lead, 0, PW), py = clamp(ball.y + ball.vy * lead, 0, PH), ag = Math.atan2(gy - py, gx - px), ca = Math.cos(ag), sa = Math.sin(ag);
    let tx = px - ca * .7, ty = py - sa * .7;
    if ((b.x - px) * ca + (b.y - py) * sa > -.2) { const sd = ((b.x - px) * -sa + (b.y - py) * ca) >= 0 ? 1 : -1; tx = px - ca * 1.1 - sa * sd * 1.1; ty = py - sa * 1.1 + ca * sd * 1.1; }
    return [Math.atan2(ty - b.y, tx - b.x) + wob, P.speed * clamp(Math.hypot(tx - b.x, ty - b.y) * 1.5, .4, 1)];
  }
  function step(m, dt, t) {
    const ball = m.ball, A = ARENA[m.arena];
    m.bots.forEach((b, i) => {
      const o = m.bots[1 - i], dir = i === 0 ? 1 : -1, P = m.pols[i];
      b.cd -= dt; b.moveT -= dt; b.fallCd -= dt; b.tagT = Math.max(0, b.tagT - dt);
      if (b.down > 0) {                                       // fallen: no control until it gets back up
        b.down -= dt; const f = Math.exp(-6 * dt); b.vx *= f; b.vy *= f;
        if (b.down <= 0 && P?.getUp) tag(b, 'back up');
      } else if (!P) { // the visitor
        let dx = 0, dy = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) dy--; if (keys.has('KeyS') || keys.has('ArrowDown')) dy++;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) dx--; if (keys.has('KeyD') || keys.has('ArrowRight')) dx++;
        const mv = dx || dy, des = mv ? Math.atan2(dy, dx) : b.h;
        b.h += clamp(angDiff(des, b.h), -HUMAN.turn * dt, HUMAN.turn * dt);
        const s = mv ? HUMAN.speed / Math.hypot(dx, dy) : 0;
        b.vx = lerp(b.vx, dx * s, Math.min(1, dt * 10)); b.vy = lerp(b.vy, dy * s, Math.min(1, dt * 10));
        if (kickReq) { kick(b, ball, b.h, HUMAN.kick); kickReq = false; }
        carry(b, ball, HUMAN.control, dt);
      } else {
        const [des, spd] = ai(b, o, ball, P, dir, dt, t + i);
        const d = angDiff(des, b.h), tr = P.turn;
        b.h += clamp(d, -tr * dt, tr * dt);
        const fwd = spd * clamp(Math.cos(d), .15, 1);
        b.vx = lerp(b.vx, Math.cos(b.h) * fwd, Math.min(1, dt * 8)); b.vy = lerp(b.vy, Math.sin(b.h) * fwd, Math.min(1, dt * 8));
        if (P.dribble) carry(b, ball, P.control, dt);
      }
      b.x = clamp(b.x + b.vx * dt, BR, PW - BR); b.y = clamp(b.y + b.vy * dt, BR, PH - BR);
    });
    const [a, c] = m.bots, dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
    if (d < BR * 2) {
      const push = (BR * 2 - d) / 2; a.x -= dx / d * push; a.y -= dy / d * push; c.x += dx / d * push; c.y += dy / d * push;
      const rel = Math.hypot(a.vx - c.vx, a.vy - c.vy);
      if (rel > 1.6) m.bots.forEach((b, i) => {                // hard contact can knock a young policy over
        const P = m.pols[i]; if (!P || b.down > 0 || b.fallCd > 0) return;
        if (rand() < (1 - P.s) * .55) { b.down = P.getUp ? .6 : 2.2; b.fallCd = 1.6; m.falls++; tag(b, 'fell'); if (m.mode === 'play') say(P.getUp ? `Gen ${P.g} falls and gets straight back up.` : `Gen ${P.g} falls and struggles to get up.`); }
      });
    }
    const f = Math.exp(-A.fric * dt); ball.vx *= f; ball.vy *= f;
    if (A.noise) { ball.vx += (rand() - .5) * A.noise * dt * 6; ball.vy += (rand() - .5) * A.noise * dt * 6; }
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    for (const b of rand() < .5 ? m.bots : [m.bots[1], m.bots[0]]) {
      const bx = ball.x - b.x, by = ball.y - b.y, bd = Math.hypot(bx, by) || 1e-6, R = BR + BALLR;
      if (bd < R) { const nx = bx / bd, ny = by / bd; ball.x = b.x + nx * R; ball.y = b.y + ny * R; const rel = (ball.vx - b.vx) * nx + (ball.vy - b.vy) * ny; if (rel < 0) { ball.vx -= 1.5 * rel * nx; ball.vy -= 1.5 * rel * ny; } }
    }
    if (ball.y < BALLR) { ball.y = BALLR; ball.vy = Math.abs(ball.vy) * .7; } if (ball.y > PH - BALLR) { ball.y = PH - BALLR; ball.vy = -Math.abs(ball.vy) * .7; }
    const mouth = ball.y > G0 && ball.y < G1;
    if (ball.x < BALLR && !mouth) { ball.x = BALLR; ball.vx = Math.abs(ball.vx) * .7; }
    if (ball.x > PW - BALLR && !mouth) { ball.x = PW - BALLR; ball.vx = -Math.abs(ball.vx) * .7; }
    if (ball.x < -.3 || ball.x > PW + .3) { const side = ball.x > PW ? 0 : 1; m.score[side]++; goal(m, side); }
  }
  function goal(m, side) {
    if (m.mode === 'play') { say(side === 0 ? `Goal! You score. ${m.score[0]}–${m.score[1]}` : `Policy scores. ${m.score[0]}–${m.score[1]}`); m.pause = 1.1; m.flash = 1; }
    kickoff(m);
  }
  function recordTraining() {
    if (gen === recordedGen) return; recordedGen = gen;
    record('self_play_training', {generations: gen, rating: Math.round(curve[curve.length - 1].e), ceiling_passed_at_gen: ceilingGen, skills: unlocked(), curve: curve.slice(-200).map(c => [c.g, Math.round(c.e)])});
  }
  function finishGen() {
    const [s0, s1] = M.score, prev = curve[curve.length - 1].e;
    gen++; const e = Math.max(prev + 2, elo(gen) + rand(-14, 14)); curve.push({g: gen, e});
    say(`Gen ${gen - 1} vs recent gen ${M.oppG}: ${s0}–${s1} · rating ${Math.round(e)}`);
    if (ceilingGen == null && e >= CEIL) { ceilingGen = gen; say('Self-play passes the human-data ceiling.'); }
    for (const s of SKILLS) if (gen === s.g) { pop[s.id] = 1; say(`New skill from self-play: ${s.name} (gen ${gen}, simulated)`); }
    if (gen === READY) { say(`Gen ${READY}: ready. Play it (Play vs latest).`); recordTraining(); }
    api.status(`Self-play · gen ${gen}`);
    newMatch('train');
  }
  function stopTraining() { training = false; trainBtn.textContent = '▶ Run self-play'; }
  function toggleTrain() {
    if (phase !== 'train') { phase = 'train'; newMatch('train'); }
    training = !training; trainBtn.textContent = training ? '❚❚ Pause self-play' : '▶ Run self-play';
    if (training) { intro = Math.min(intro, .99); clip(ARENA.sim.clip); } else recordTraining();
    if (training && !M) newMatch('train');
    api.status(training ? `Self-play · gen ${gen}` : 'Paused');
  }
  function startPlay(opp) {
    if (training) recordTraining();
    stopTraining(); phase = 'play'; intro = 0; newMatch('play', opp); keys.clear();
    document.activeElement?.blur?.();
    clip(ARENA[arena].clip);
    const who = opp === 'base' ? 'S1 base (gen 0, human-data level)' : `your gen ${gen} policy`;
    say(`${ARENA[arena].name}: you vs ${who}. First to 3 or 60 s.${opp === 'latest' && gen < READY ? ` Train ${READY}+ gens for the real test.` : ''}`);
    api.status(`Match vs gen ${M.oppG}`);
  }
  function endMatch() {
    phase = 'over'; const [y, p] = M.score, g = M.oppG, diff = y - p;
    say(y > p ? `You win ${y}–${p} against gen ${g}.` : y < p ? `Gen ${g} wins ${p}–${y}.` : `Draw ${y}–${p}.`);
    const slot = M.opp === 'base' ? 'base' : 'latest';
    if (M.opp === 'base' || g >= READY) { const b = best[slot]; if (!b || diff > b.diff) best[slot] = {diff, y, p, g}; }
    record('self_play_match', {opponent: M.opp === 'base' ? 's1_base' : 'latest', opponent_gen: g, arena: M.arena, you: y, policy: p, duration_s: +M.t.toFixed(1), policy_falls: M.falls, trained_gens: gen, skills: unlocked()});
    if (!completed && M.opp === 'latest' && g >= READY) { completed = true; api.complete(`Trained ${g} gens · match played`); say('Self-play took it past human data. That is the idea.'); }
    else api.status('Match over');
  }

  const onDown = e => {
    if (!['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) return;
    if (phase !== 'play' || (e.target && /INPUT|TEXTAREA/.test(e.target.tagName))) return; e.preventDefault(); if (e.code === 'Space') kickReq = true; else keys.add(e.code);
  };
  const onUp = e => { keys.delete(e.code); if (phase === 'play' && e.code === 'Space') e.preventDefault(); };
  addEventListener('keydown', onDown); addEventListener('keyup', onUp);
  newMatch('train');

  // =====================================================================================================
  // 3D pitch (1 sim unit = SC metres; x → X, y → Z; the camera looks from the +Z touchline)
  const SC = .5, WXp = x => (x - PW / 2) * SC, WZp = y => (y - PH / 2) * SC;
  const PR = () => ({px: 16, py: 40, pw: k.w - 356, ph: k.h - 144});
  const S = stage(k, {bg: '#dfe6ec', fov: 38, near: .05, far: 200});
  const {scene} = S, tv = new THREE.Vector3(), tp = {x: 0, y: 0, ok: true};
  let dead = false, g1Err = '', orbitDrag = null, camUser = false;
  const Lt = lights(scene, {hemi: ['#ffffff', '#6a6f58', 1.15], sun: ['#ffffff', 1.8], at: [4, 10, 6], box: 8});
  Object.assign(S.orbit, {target: new THREE.Vector3(0, .4, 0), yaw: 0, pitch: .78, dist: 11, minD: 4, maxD: 30, minP: .2, maxP: 1.45});
  const pitchTex = {sim: pitchTexture({light: '#5cbf4e', darkG: '#51b044'}), real: pitchTexture({light: '#3f8a3c', darkG: '#397f36'})};
  const pitchM = new THREE.MeshStandardMaterial({map: pitchTex.sim, roughness: .95});
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry((PW + 2) * SC, (PH + 2) * SC), pitchM); pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; scene.add(pitch);
  for (const [x, r] of [[0, 0], [PW, Math.PI]]) { const gf = goalFrame((G1 - G0) * SC, 1.0, .45); gf.position.set(WXp(x), 0, WZp(PH / 2)); gf.rotation.y = r; scene.add(gf); }
  // Simulation arena: bright sim floor with a grid and parallel training fields
  const simG = new THREE.Group(); scene.add(simG);
  const simFloor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), std('#e9edf0', {r: .9})); simFloor.rotation.x = -Math.PI / 2; simFloor.position.y = -.01; simFloor.receiveShadow = true; simG.add(simFloor);
  const grid = new THREE.GridHelper(120, 120, '#b9c2ca', '#cdd4da'); grid.position.y = -.005; simG.add(grid);
  const ENVS = [[-12.5, -8], [0, -8], [12.5, -8], [-12.5, 0], [12.5, 0]];
  const envs = ENVS.map(([x, z], i) => { const g = new THREE.Group(); g.position.set(x, 0, z); simG.add(g);
    const pm = new THREE.Mesh(new THREE.PlaneGeometry((PW + 2) * SC, (PH + 2) * SC), pitchM); pm.rotation.x = -Math.PI / 2; pm.receiveShadow = true; g.add(pm);
    for (const [gx, r] of [[0, 0], [PW, Math.PI]]) { const gf = goalFrame((G1 - G0) * SC, 1.0, .45); gf.position.set(WXp(gx), 0, 0); gf.rotation.y = r; g.add(gf); }
    const eb = soccerBall(); g.add(eb); return {g, ball: eb, ph: i * 1.7, clones: []}; });
  // Real world arena: indoor hall, Skild wordmark on the wall
  const realG = new THREE.Group(); scene.add(realG); realG.visible = false;
  const rf = new THREE.Mesh(new THREE.PlaneGeometry(40, 30), std('#55595e', {r: .9})); rf.rotation.x = -Math.PI / 2; rf.position.y = -.01; rf.receiveShadow = true; realG.add(rf);
  const wallM = std('#d9dcdf', {r: .9}); mbox(24, 6, .2, wallM, 0, 3, -5.2, realG, false); mbox(.2, 6, 14, wallM, -9, 3, 1.6, realG, false); mbox(.2, 6, 14, wallM, 9, 3, 1.6, realG, false);
  mbox(24, .9, .22, std('#2b2f35', {r: .8}), 0, .45, -5.1, realG, false);
  for (const x of [-6, -2, 2, 6]) mbox(2.6, .06, .5, std('#ffffff', {e: '#ffffff', ei: 1.2}), x, 5.2, -1, realG, false);
  const logoTex = canvasTex(1024, 320, (c, w, h) => { c.fillStyle = '#d9dcdf'; c.fillRect(0, 0, w, h); });
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.75), new THREE.MeshStandardMaterial({map: logoTex, roughness: .8})); logo.position.set(0, 2.7, -5.08); realG.add(logo);
  const img = new Image(); img.onload = () => { if (dead) return; const cv = logoTex.image, c = cv.getContext('2d'); c.fillStyle = '#d9dcdf'; c.fillRect(0, 0, cv.width, cv.height); const w = 820, h = w * (img.height || 40) / (img.width || 134); try { c.drawImage(img, (cv.width - w) / 2, (cv.height - h) / 2, w, h); } catch {} logoTex.needsUpdate = true; };
  img.src = new URL('../../assets/brand/skild-wordmark.svg', import.meta.url).href; // relative to this module, so it also works under /tests/ on Pages
  // ball + training trail
  const ball = soccerBall(); scene.add(ball);
  const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(60 * 3), 3));
  const trailLine = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({color: '#ff7e00', transparent: true, opacity: .6})); trailLine.frustumCulled = false; scene.add(trailLine);
  const ringG = new THREE.RingGeometry(.34, .42, 40); ringG.rotateX(-Math.PI / 2);
  const rings = [0, 1].map(() => { const m = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({color: '#ff7e00', transparent: true, opacity: .9, depthWrite: false})); m.position.y = .02; scene.add(m); return m; });
  // two real G1s: #0 in the Argentina-style jersey, both with a black visor
  const g1s = [null, null], holders = [0, 1].map(() => { const h = new THREE.Group(); scene.add(h); return h; });
  const anim = [0, 1].map(() => ({ph: 0, fall: 0, kick: 1, prevCd: 0}));
  const jerseyM = new THREE.MeshStandardMaterial({map: jerseyTexture(), roughness: .8, side: THREE.DoubleSide});
  const visorM = new THREE.MeshStandardMaterial({color: '#050506', roughness: .12, metalness: .6});
  const follows = [];
  function dress(bot, jersey) {
    const f = follower(bot, {body: 'torso_link'}); follows.push(f);
    if (jersey) { const g = new THREE.CylinderGeometry(1, 1, 1, 28, 1, true); g.rotateX(Math.PI / 2); const m = new THREE.Mesh(g, jerseyM); m.scale.set(.094, .128, .3); m.position.set(.006, 0, .165); m.castShadow = true; f.add(m); }
    const v = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), visorM); v.scale.set(.05, .068, .052); v.position.set(.052, 0, .405); f.add(v);
  }
  Promise.all([MJ.spawn('g1', {tint: '#1b1c1f'}), MJ.spawn('g1', {tint: '#1b1c1f'})]).then(bs => {
    if (dead) { bs.forEach(b => b.dispose()); return; }
    bs.forEach((b, i) => { b.meshes.forEach(m => { m.material.roughness = .5; m.material.metalness = .35; }); dress(b, i === 0); g1s[i] = b; holders[i].add(b.group); });
    // parallel training fields: clones share geometry and copy the drivers' link matrices every frame
    envs.forEach(e => [0, 1].forEach(i => { const c = g1s[i].group.clone(); e.g.add(c); const src = [], dst = []; g1s[i].group.traverse(o => { if (!o.matrixAutoUpdate) src.push(o); }); c.traverse(o => { if (!o.matrixAutoUpdate) dst.push(o); }); e.clones.push({c, src, dst}); }));
  }).catch(e => { g1Err = 'G1 model failed to load'; console.warn(e); });
  const J = (b, n, v) => b.set(n, v);
  function pose(b, a, spd, dt) {
    b.reset();
    const v = clamp(spd / 1.6, 0, 1), A = .12 + .5 * v; a.ph += dt * (4 + 7 * v) * (v > .04 ? 1 : 0);
    const s = Math.sin(a.ph), c = Math.cos(a.ph);
    for (const [side, sg] of [['left', 1], ['right', -1]]) {
      const hip = -A * s * sg - .12 - .15 * v, knee = .25 + .3 * v + (A * 1.6) * Math.max(0, -c * sg);
      J(b, `${side}_hip_pitch_joint`, hip); J(b, `${side}_knee_joint`, knee); J(b, `${side}_ankle_pitch_joint`, clamp(-(hip + knee) * .55, -.8, .5));
      J(b, `${side}_shoulder_pitch_joint`, A * 1.1 * s * sg + .1); J(b, `${side}_elbow_joint`, .9 + .4 * v); J(b, `${side}_shoulder_roll_joint`, sg * .18);
    }
    J(b, 'waist_pitch_joint', .08 + .15 * v);
    if (a.kick < 1) { const u = a.kick, hip = u < .3 ? .55 * u / .3 : .55 - 2.1 * Math.sin(Math.PI * (u - .3) / .7) - .55 * (u - .3) / .7; J(b, 'right_hip_pitch_joint', hip); J(b, 'right_knee_joint', .2 + 1.1 * Math.sin(Math.PI * u)); J(b, 'right_ankle_pitch_joint', .2); J(b, 'left_knee_joint', .45); J(b, 'left_hip_pitch_joint', -.35); J(b, 'left_shoulder_pitch_joint', -.6); }
    b.data.qpos[2] = .79 - .03 - .05 * v - (a.kick < 1 ? .03 : 0);
    b.kinematics();
  }
  const ballQ = new THREE.Quaternion(), qa = new THREE.Quaternion(), ax = new THREE.Vector3();
  function upd3D(dt, t) {
    const real = M && M.arena === 'real';
    simG.visible = !real; realG.visible = real; pitchM.map = real ? pitchTex.real : pitchTex.sim;
    scene.background.set(real ? '#3a3e43' : '#dfe6ec'); Lt.hemi.intensity = real ? .9 : 1.15;
    if (!M) return;
    const fast = phase === 'train' && training ? Math.max(1, ff * .5) : 1;
    M.bots.forEach((b, i) => {
      const a = anim[i], h = holders[i], bot = g1s[i];
      if (b.cd > a.prevCd + .2 && b.cd >= .44) a.kick = 0; a.prevCd = b.cd; a.kick = Math.min(1, a.kick + dt * fast / .38);
      a.fall = b.down > 0 ? Math.min(1, a.fall + dt * 5) : Math.max(0, a.fall - dt * (M.pols[i] && M.pols[i].getUp ? 3.5 : 2));
      h.position.set(WXp(b.x), 0, WZp(b.y)); h.rotation.y = -b.h;
      const f = a.fall * a.fall * (3 - 2 * a.fall);
      if (bot) { pose(bot, a, Math.hypot(b.vx, b.vy) * SC * (a.fall > .1 ? 0 : 1), dt * fast); follows[i]?.sync(); bot.group.rotation.z = -f * Math.PI / 2 * .96; bot.group.position.set(-f * .62, f * .13, 0); }
      const P = M.pols[i]; rings[i].position.set(WXp(b.x), .02, WZp(b.y)); rings[i].material.color.set(!P || (M.mode === 'train' && i === 0) ? '#ff7e00' : '#9aa3ab');
    });
    const bl = M.ball, sp = Math.hypot(bl.vx, bl.vy) * SC;
    ball.position.set(WXp(bl.x), .11, WZp(bl.y));
    if (sp > 1e-3) { ax.set(bl.vy, 0, -bl.vx).normalize(); qa.setFromAxisAngle(ax, -sp * dt * fast / .11); ballQ.premultiply(qa); ball.quaternion.copy(ballQ); }
    const arr = trailGeo.attributes.position.array, n = phase === 'train' ? Math.min(60, trail.length) : 0;
    for (let i = 0; i < n; i++) { arr[i * 3] = WXp(trail[i][0]); arr[i * 3 + 1] = .05; arr[i * 3 + 2] = WZp(trail[i][1]); }
    trailGeo.attributes.position.needsUpdate = true; trailGeo.setDrawRange(0, n > 1 ? n : 0);
    // parallel envs (sim only): cloned G1s chase their own ball
    if (!real) envs.forEach(e => {
      const u = t * .5 + e.ph, bx = Math.sin(u) * 3.2, bz = Math.sin(u * 1.7) * 1.8; e.ball.position.set(bx, .11, bz);
      e.clones.forEach(({c, src, dst}, j) => { for (let q = 0; q < src.length && q < dst.length; q++) dst[q].matrix.copy(src[q].matrix); const ang = u * 1.3 + j * Math.PI; c.position.set(bx + Math.cos(ang) * .8 - (j ? -1 : 1) * .4, 0, bz + Math.sin(ang) * .5); c.rotation.set(0, -Math.atan2(bz - c.position.z, bx - c.position.x), 0); });
    });
    // camera: broadcast view, follows the ball a little; free orbit only while training
    const pr = PR(), tanF = Math.tan(S.cam.fov * Math.PI / 360), o = S.orbit;
    if (!camUser || phase === 'play') { const d = Math.max((PW + 3) * SC * k.h / (pr.pw * 2 * tanF), (PH * SC * Math.sin(o.pitch) + 2.2) * k.h / (pr.ph * 2 * tanF)); o.dist = lerp(o.dist, clamp(d, o.minD, o.maxD), Math.min(1, dt * 4)); if (phase === 'play') { o.yaw = lerp(o.yaw, 0, Math.min(1, dt * 4)); o.pitch = lerp(o.pitch, .78, Math.min(1, dt * 4)); } }
    o.target.x = lerp(o.target.x, phase === 'play' ? WXp(bl.x) * .3 : 0, Math.min(1, dt * 2));
  }
  k.onDown(p => { const pr = PR(); if (phase !== 'play' && p.x > pr.px && p.x < pr.px + pr.pw && p.y > pr.py && p.y < pr.py + pr.ph) { orbitDrag = {x: p.x, y: p.y}; camUser = true; } });
  k.onMove(p => { if (orbitDrag) { S.drag(p.x - orbitDrag.x, p.y - orbitDrag.y); orbitDrag = {x: p.x, y: p.y}; } });
  k.onUp(() => { orbitDrag = null; });

  k.frame((dt, t) => {
    for (const s of SKILLS) if (pop[s.id]) pop[s.id] = Math.max(0, pop[s.id] - dt * .8);
    if (intro < 1) intro = Math.max(0, intro - dt * 3);
    if (phase === 'train' && training && M) {
      const n = Math.min(40, Math.max(1, Math.round(ff * dt / SUB)));
      for (let i = 0; i < n; i++) { step(M, SUB, t); M.t += SUB; if (i % 3 === 0) { trail.push([M.ball.x, M.ball.y]); if (trail.length > 60) trail.shift(); } }
      if (M.t >= M.len) finishGen();
    } else if (phase === 'play') {
      M.flash = Math.max(0, M.flash - dt * 1.5);
      if (M.pause > 0) M.pause -= dt;
      else { step(M, dt, t); M.t += dt; }
      if (M.score[0] >= 3 || M.score[1] >= 3 || M.t >= M.len) endMatch();
    }
    upd3D(dt, t);
    const pr = PR(); S.render(pr.px + pr.pw / 2, pr.py + pr.ph / 2 + 10);
    draw(t);
  });

  // ---- drawing
  function fit(s, w) { ctx.font = '500 12px Geist, system-ui, sans-serif'; if (ctx.measureText(s).width <= w) return s; while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
  function draw(t) {
    ctx.clearRect(0, 0, k.w, k.h);
    ctx.fillStyle = B.warm1; ctx.fillRect(0, 0, k.w, 40); ctx.fillRect(0, k.h - 104, k.w - 340, 104);
    k.text(`Goal: train ≥ ${READY} generations of self-play, then play a match against your latest policy.`, 16, 26, {size: 14, weight: 600});
    const {px, py, pw, ph} = PR(), real = M && M.arena === 'real';
    ctx.strokeStyle = B.warm2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 14); ctx.stroke();
    const lab = M && M.mode === 'play' ? `${ARENA[M.arena].name} · 3D · Skild humanoid (MuJoCo model) · stylized` : 'Self-play in simulation · 3D · Skild humanoid · stylized';
    ctx.fillStyle = 'rgba(18,18,18,.55)'; ctx.beginPath(); ctx.roundRect(px + 8, py + 8, Math.min(pw - 250, 380), 22, 11); ctx.fill();
    k.label(fit(lab, Math.min(pw - 270, 360)), px + 18, py + 23, {color: '#FFFFFF'});
    void real;
    if (M) {
      const sc = (x, y, h) => S.project(tv.set((x - PW / 2) * SC, h, (y - PH / 2) * SC), tp);
      M.bots.forEach((b, i) => {
        const P = M.pols[i], top = sc(b.x, b.y, b.down > 0 ? .5 : 1.55), bot = sc(b.x, b.y, 0);
        if (b.tagT > 0 && top.ok) k.label(b.tag, top.x, top.y - 6, {align: 'center', color: b.tag === 'fell' ? '#FFFFFF' : B.orange, weight: 700});
        if (bot.ok) { const t2 = !P ? 'YOU' : `GEN ${P.g}`; ctx.font = '600 9px "Geist Mono", ui-monospace, monospace'; const tw = ctx.measureText(t2).width + 10; ctx.fillStyle = !P ? B.orange : 'rgba(18,18,18,.7)'; ctx.beginPath(); ctx.roundRect(bot.x - tw / 2, bot.y + 8, tw, 14, 7); ctx.fill(); k.text(t2, bot.x, bot.y + 18, {align: 'center', size: 9, mono: true, weight: 600, color: !P ? '#121212' : '#FFFFFF'}); }
        if (b.down > 0 && top.ok) { ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(top.x, top.y + 14, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(b.down / 2.2, 0, 1)); ctx.stroke(); }
      });
      const left = M.mode === 'train' ? `GEN ${M.pols[0].g}` : 'YOU', right = `GEN ${M.pols[1].g}`;
      const sub = M.mode === 'train' ? (training ? `objective: score · current vs recent version · ×${ff} fast-forward · drag to orbit` : 'paused · press ▶ Run self-play') : `${Math.max(0, Math.ceil(M.len - M.t))} s left · first to 3 · WASD / arrows · Space kicks`;
      const cx = px + pw / 2; ctx.fillStyle = '#121212'; ctx.beginPath(); ctx.roundRect(cx - 110, py + 10, 220, 28, 14); ctx.fill();
      k.text(left, cx - 40, py + 29, {align: 'right', size: 11, mono: true, color: M.mode === 'train' ? B.orange : '#FFFFFF', weight: 600});
      k.text(`${M.score[0]} : ${M.score[1]}`, cx, py + 30, {align: 'center', size: 15, weight: 700, color: '#FFFFFF'});
      k.text(right, cx + 40, py + 29, {size: 11, mono: true, color: M.mode === 'train' ? '#B5B9BA' : B.orange, weight: 600});
      ctx.fillStyle = 'rgba(18,18,18,.55)'; ctx.font = '500 10px "Geist Mono", monospace'; const sw = ctx.measureText(sub.toUpperCase()).width + 20; ctx.beginPath(); ctx.roundRect(cx - sw / 2, py + ph - 24, sw, 18, 9); ctx.fill();
      k.label(sub, cx, py + ph - 11, {align: 'center', color: '#FFFFFF'});
      if (M.flash) { ctx.fillStyle = `rgba(255,126,0,${M.flash * .12})`; ctx.fillRect(px, py, pw, ph); }
      if (M.mode === 'play' && M.pause > 0 && phase === 'play') k.text(M.t < .01 && !M.score[0] && !M.score[1] ? 'Kick-off' : 'Goal!', cx, py + ph / 2 - 30, {align: 'center', size: 30, weight: 700, color: '#FFFFFF'});
      if (phase === 'over') {
        const [y, p] = M.score, win = y > p, g = M.oppG;
        ctx.fillStyle = B.warm1; ctx.globalAlpha = .9; ctx.beginPath(); ctx.roundRect(px + 40, py + ph / 2 - 60, pw - 80, 120, 14); ctx.fill(); ctx.globalAlpha = 1;
        k.text(win ? `You win ${y}–${p}` : y < p ? `Gen ${g} wins ${p}–${y}` : `Draw ${y}–${p}`, cx, py + ph / 2 - 6, {align: 'center', size: 30, weight: 700, color: win ? B.black : B.orange});
        const msg = M.opp === 'base' ? 'That was S1 before self-play: human-data level. Now try your latest.' : g >= READY ? 'Nobody showed it those skills. It found them by playing itself.' : `Train to ${READY}+ generations, then play again.`;
        k.text(msg, cx, py + ph / 2 + 22, {align: 'center', size: 14, color: B.cool2});
        const bl2 = best.latest; if (bl2) k.text(`Your best vs gen ≥ ${READY}: ${bl2.y}–${bl2.p}`, cx, py + ph / 2 + 44, {align: 'center', size: 12, mono: true, color: B.black});
      }
    }
    if (!g1s[0]) { ctx.fillStyle = 'rgba(18,18,18,.6)'; ctx.beginPath(); ctx.roundRect(px + 14, py + ph - 60, 300, 26, 8); ctx.fill(); k.text(g1Err || 'Loading Skild humanoid (MuJoCo Menagerie)…', px + 26, py + ph - 42, {size: 12, weight: 600, color: '#FFFFFF'}); }
    if (intro > 0 && gen === 0 && phase === 'train') {        // lineage card before the first run
      ctx.globalAlpha = intro; const cw = Math.min(520, pw - 40), chh = 176, cx0 = px + (pw - cw) / 2, cy0 = py + 52;
      ctx.fillStyle = 'rgba(255,255,255,.97)'; ctx.strokeStyle = B.warm2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(cx0, cy0, cw, chh, 14); ctx.fill(); ctx.stroke();
      k.label('Why self-play · from the post', cx0 + 20, cy0 + 26);
      ['Gen 0 is S1, pre-trained on human data, so it tops out at human level.', 'Self-play: one objective, “score”. It plays recent versions of itself.', 'AlphaGo learned from human games. AlphaGo Zero learned by self-play', 'and beat it 100–0 after three days.', 'Skild: 140 years of simulated play in Isaac Sim, then a real humanoid.']
        .forEach((l, i) => k.text(l, cx0 + 20, cy0 + 52 + i * 21, {size: 13, color: i === 1 ? B.black : B.cool3, weight: i === 1 ? 600 : 400}));
      k.text('Press ▶ Run self-play', cx0 + 20, cy0 + chh - 12, {size: 12, weight: 700, color: B.orange2});
      ctx.globalAlpha = 1;
    }
    // right panel: kept above the bottom-right video corner (k.h - 240)
    const rx = k.w - 316, ry = 40, rw = 300, rh = Math.max(200, k.h - 240 - ry);
    ctx.fillStyle = B.white; ctx.strokeStyle = B.warm2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(rx, ry, rw, rh, 14); ctx.fill(); ctx.stroke();
    k.label('Rating · Elo-like · simulated', rx + 14, ry + 20);
    const cxL = rx + 34, cy0 = ry + 30, cw = rw - 50, ch = clamp(rh - 200, 40, 170), gMax = Math.max(30, gen + 3), e0 = 1200, e1 = Math.max(2300, curve[curve.length - 1].e + 100);
    const CX = g => cxL + g / gMax * cw, CY = e => cy0 + ch - (e - e0) / (e1 - e0) * ch;
    ctx.strokeStyle = B.warm2; ctx.lineWidth = 1; ctx.strokeRect(cxL, cy0, cw, ch);
    for (const e of ch > 80 ? [1400, 1800, 2200] : [1400, 2200]) k.text(String(e), cxL - 4, CY(e) + 3, {size: 9, mono: true, color: B.cool1, align: 'right'});
    ctx.setLineDash([5, 4]); ctx.strokeStyle = B.cool2; ctx.beginPath(); ctx.moveTo(cxL, CY(CEIL)); ctx.lineTo(cxL + cw, CY(CEIL)); ctx.stroke(); ctx.setLineDash([]);
    k.label('human-data ceiling', cxL + cw - 4, CY(CEIL) - 4, {align: 'right'});
    ctx.strokeStyle = B.orange; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath(); curve.forEach((c, i) => i ? ctx.lineTo(CX(c.g), CY(c.e)) : ctx.moveTo(CX(c.g), CY(c.e))); ctx.stroke();
    const lastC = curve[curve.length - 1]; ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(CX(lastC.g), CY(lastC.e), 4 + (training ? Math.sin(t * 8) * 1.2 : 0), 0, 7); ctx.fill();
    k.label('gen 0 · S1', cxL, cy0 + ch + 12, {color: B.cool1}); k.label(`gen ${gMax}`, cxL + cw, cy0 + ch + 12, {align: 'right', color: B.cool1});
    let y = cy0 + ch + 38;
    k.label('Generation', rx + 14, y - 8); k.text(String(gen), rx + 14, y + 16, {size: 24, weight: 700});
    k.label('Rating', rx + 110, y - 8); k.text(String(Math.round(lastC.e)), rx + 110, y + 16, {size: 20, weight: 700, color: lastC.e >= CEIL ? B.orange : B.black});
    k.meter(rx + 196, y + 8, 90, gen / READY, gen >= READY ? 'ready ✓' : `${gen}/${READY}`);
    y += 34;
    k.label('Skills from self-play · simulated', rx + 14, y);
    SKILLS.forEach((s, i) => {
      const on = gen >= s.g, yy = y + 8 + i * 23, pp = pop[s.id] || 0;
      if (yy + 20 > ry + rh - 4) return;
      ctx.fillStyle = on ? B.orange : B.warm1; ctx.strokeStyle = on ? B.orange : B.warm2; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(rx + 14 - pp * 4, yy - pp * 2, rw - 28 + pp * 8, 19 + pp * 4, 10); ctx.fill(); ctx.stroke();
      k.text(`${on ? '✓' : '○'}  ${s.name}`, rx + 24, yy + 14, {size: 12, weight: 600, color: on ? B.black : B.cool2});
      k.label(on ? 'on' : `gen ${s.g}`, rx + rw - 24, yy + 14, {align: 'right', color: on ? B.black : B.cool1});
    });
    y += 8 + SKILLS.length * 23 + 18;
    if (y + 40 < ry + rh) {
      const P = pol(gen);
      [['Speed', (P.speed - 1.9) / 1.4], ['Ball control', P.control]].forEach(([n, v], i) => k.meter(rx + 14 + i * 140, y + 10, 126, v, n));
    }
    // log + scoreboard strip (bottom left, clear of the video corner)
    const ly = k.h - 86, bx = px + pw - 232, lw = bx - px - 16;
    k.label('Log', px, ly);
    log.slice(-3).forEach((l, i, a) => k.text(fit(l, lw), px, ly + 20 + i * 17, {size: 12, color: i === a.length - 1 ? B.black : B.cool2}));
    {
      k.label('Best results', bx, ly);
      const f = b => b ? `${b.y}–${b.p}${b.diff > 0 ? ' win' : b.diff < 0 ? ' loss' : ' draw'}` : '—';
      k.text(`vs S1 base: ${f(best.base)}`, bx, ly + 20, {size: 12, mono: true, color: B.cool3});
      k.text(`vs gen ≥ ${READY}: ${f(best.latest)}`, bx, ly + 37, {size: 12, mono: true, color: best.latest ? B.black : B.cool3});
      if (completed) { ctx.fillStyle = B.orange; ctx.beginPath(); ctx.roundRect(bx, ly + 46, 230, 24, 12); ctx.fill(); k.text('✓ Beyond human data · match played', bx + 115, ly + 62, {align: 'center', size: 11, weight: 700}); }
    }
  }

  const trainBtn = k.button('▶ Run self-play', toggleTrain, {primary: true});
  k.button('Play vs latest (WASD · Space)', () => startPlay('latest'));
  k.button('Play vs S1 base', () => startPlay('base'));
  const arenaBtn = k.button('Match: Simulation', () => {
    arena = arena === 'sim' ? 'real' : 'sim'; arenaBtn.textContent = 'Match: ' + (arena === 'sim' ? 'Simulation' : 'Real world'); arenaBtn.classList.toggle('on', arena === 'real');
    clip(ARENA[arena].clip); say(arena === 'real' ? 'Next match: sim → real. The trained policy on a humanoid (stylized).' : 'Next match: in simulation.');
  });
  k.slider('Fast-forward ×', 2, 16, ff, v => { ff = v; }, 1);
  k.button('Reset training', () => { recordTraining(); gen = 0; recordedGen = 0; curve.length = 1; ceilingGen = null; stopTraining(); phase = 'train'; newMatch('train'); say('Back to gen 0 (S1 base).'); api.status('Ready'); });
  api.status('Ready to train');
  return () => { dead = true; removeEventListener('keydown', onDown); removeEventListener('keyup', onUp); g1s.forEach(b => b && b.dispose()); S.dispose(); k.destroy(); };
}
