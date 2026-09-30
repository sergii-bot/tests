// TRY · Series C — "Spin the flywheel": pump the four data sources Skild names (large-scale simulation, internet videos,
// teleoperation, real-world deployments) into the brain, deploy robots into the sectors from the post, and let
// deployment data keep the wheel turning. Wheel physics and numbers are a stylized game (simulated).
import {kit, B, lerp, clamp, rand} from './kit.js';

const SRC = [
  {id: 'sim', name: 'Large-scale simulation', sub: 'synthetic experience', ang: -2.36, key: '1'},
  {id: 'video', name: 'Internet videos', sub: 'human action videos', ang: -.79, key: '2'},
  {id: 'teleop', name: 'Teleoperation', sub: 'robot demos', ang: 2.36, key: '3'},
  {id: 'deploy', name: 'Real-world deployments', sub: 'field data · auto', ang: .79, auto: true},
];
// Sectors the post says deployments span (order and unlock thresholds are game rules).
const TASKS = [
  {name: 'Security', need: 8}, {name: 'Construction', need: 16}, {name: 'Delivery', need: 26},
  {name: 'Data centers', need: 36}, {name: 'Warehouses', need: 46}, {name: 'Factory assembly', need: 56},
];
// Skills the post lists for the Skild Brain, shown as capability milestones.
const SKILLS = [[14, 'cleaning'], [30, 'loading a dishwasher'], [48, 'making an egg'], [66, 'navigating slippery terrain']];
// Game rules (simulated): the wheel has friction; the brain only improves while the wheel spins faster than STALL.
const HAND_RATE = 8, IMPULSE = 1.75, FRICTION = .35, STALL = 15, SUSTAIN = 45, PER_TASK = 2, HANDS_OFF = 4, PER_ROBOT = 7;
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function mount(root, api) {
  const k = kit(root);
  const {ctx} = k;
  const clip = x => { try { api.clip?.(x); } catch (e) { /* optional */ } };
  const rec = (kind, d) => { try { api.record?.(kind, d); } catch (e) { /* optional */ } };
  let C, rpm, rot, parts, robots, log, pumping, keysHeld = new Set(), emit, last, handRate, depRate, handsOff, done, winT, unlocked, hinted, now = 0, flash, skillFlash, skillIdx, t0, runT, handN, rings, best = null, clipped = false, logT = 0;
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const say = s => { log.push(s); if (log.length > 20) log.shift(); logT = 0; };
  function reset() {
    C = 0; rpm = 0; rot = 0; parts = []; robots = []; rings = []; log = ['Hold a data source to pump data into the brain.'];
    pumping = null; keysHeld.clear(); emit = {sim: 0, video: 0, teleop: 0}; last = {sim: -99, video: -99, teleop: -99, deploy: -99};
    handRate = 0; depRate = 0; handsOff = 0; done = false; winT = 0; unlocked = 0; hinted = false; flash = 0; skillFlash = 0; skillIdx = -1; t0 = null; runT = 0; handN = {sim: 0, video: 0, teleop: 0};
    api.status('Pump data · deploy robots');
  }
  reset();

  function L() {
    const top = 88, bottom = k.h - 118, colW = clamp(k.w * .28, 240, 300), colX = k.w - colW - 20;
    const cx = (20 + colX) / 2, cy = (top + bottom) / 2 + 6;
    const R = clamp(Math.min((colX - 20) / 2 - 100, (bottom - top) / 2 - 30), 80, 190);
    // sector grid (2 × 3) sits in the top of the right column, clear of the corner clip
    const gTop = 84, gBot = Math.max(gTop + 3 * 52 + 16, k.h - 244), cw = (colW - 8) / 2, ch = (gBot - gTop - 16) / 3;
    const cards = TASKS.map((t, i) => ({x: colX + (i % 2) * (cw + 8), y: gTop + Math.floor(i / 2) * (ch + 8), w: cw, h: ch}));
    const nodes = SRC.map(s => ({x: cx + Math.cos(s.ang) * R, y: cy + Math.sin(s.ang) * R, w: 176, h: 46}));
    return {top, bottom, colX, colW, cx, cy, R, cards, nodes};
  }
  const inBox = (p, n) => Math.abs(p.x - n.x) <= n.w / 2 && Math.abs(p.y - n.y) <= n.h / 2;
  const inRect = (p, c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;
  const bez = (a, m, b, u) => [lerp(lerp(a[0], m[0], u), lerp(m[0], b[0], u), u), lerp(lerp(a[1], m[1], u), lerp(m[1], b[1], u), u)];
  const swirl = (l, i) => { const a = SRC[i].ang + .9; return [l.cx + Math.cos(a) * l.R * .55, l.cy + Math.sin(a) * l.R * .55]; };
  const slots = () => Math.min(TASKS.length * PER_TASK, Math.floor(C / PER_ROBOT));
  const robotRate = r => (.5 + C / 80) * (1 + r.task * .12);
  const depTheory = () => robots.reduce((a, r) => a + (r.p >= 1 ? robotRate(r) : 0), 0);
  const nIn = ti => robots.filter(r => r.task === ti).length;

  function deploy(ti) {
    const l = L();
    if (ti == null) { const open = TASKS.map((t, i) => i).filter(i => C >= TASKS[i].need && nIn(i) < PER_TASK); if (!open.length) return say(C < TASKS[0].need ? `Brain too weak: security unlocks at ${TASKS[0].need}%.` : 'Every unlocked sector is full. Raise capability to unlock more.'); ti = open.sort((a, b) => nIn(a) - nIn(b))[0]; }
    const t = TASKS[ti];
    if (C < t.need) { rings.push({x: l.cards[ti].x + l.cards[ti].w / 2, y: l.cards[ti].y + l.cards[ti].h / 2, t: 0, grey: true}); return say(`${t.name} unlocks at ${t.need}% capability.`); }
    if (nIn(ti) >= PER_TASK) return say(`${t.name} is full (${PER_TASK} robots).`);
    if (robots.length >= slots()) return say(`No free robot yet · next one at ${(robots.length + 1) * PER_ROBOT}% capability.`);
    const slot = nIn(ti);
    robots.push({task: ti, slot, p: 0, emit: rand(0, 1), landed: false});
    say(`Deployed a robot · ${t.name.toLowerCase()} (${robots.length} in the field)`);
    rec('series-c.deploy', {sector: t.name, capability: Math.round(C), fleet: robots.length, t: +runT.toFixed(1)});
    if (!clipped) { clipped = true; clip(0); }
  }

  k.onDown(p => {
    const l = L();
    const i = l.nodes.findIndex(n => inBox(p, n));
    if (i >= 0) { if (SRC[i].auto) say(robots.length ? `${robots.length} deployed robots feed this source automatically.` : 'Deploy robots to open this source.'); else { pumping = SRC[i].id; say(`Pumping · ${SRC[i].name.toLowerCase()}`); } return; }
    const c = l.cards.findIndex(c => inRect(p, c)); if (c >= 0) deploy(c);
  });
  k.onUp(() => { pumping = null; });
  const kd = e => { const s = SRC.find(x => x.key === e.key); if (s) keysHeld.add(s.id); if (e.key === 'd' || e.key === 'D') deploy(); };
  const ku = e => { const s = SRC.find(x => x.key === e.key); if (s) keysHeld.delete(s.id); };
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
  const blur = () => { keysHeld.clear(); pumping = null; }; window.addEventListener('blur', blur);

  k.frame((dt, t) => {
    const l = L(); now = t; logT += dt;
    flash = Math.max(0, flash - dt * 1.5); skillFlash = Math.max(0, skillFlash - dt * .7);
    // hand pumping
    const active = new Set(keysHeld); if (pumping) active.add(pumping);
    if (active.size && t0 == null) t0 = t;
    if (t0 != null && !done) runT = t - t0;
    for (const id of active) {
      emit[id] += HAND_RATE * dt; last[id] = t;
      while (emit[id] >= 1) { emit[id]--; handN[id]++; const i = SRC.findIndex(s => s.id === id); parts.push({i, a: [l.nodes[i].x, l.nodes[i].y], p: 0, sp: rand(.8, 1.1), hand: true, j: rand(-8, 8)}); }
    }
    handsOff = active.size ? 0 : handsOff + dt;
    // deployed robots: fly out, then emit deployment data
    for (const r of robots) {
      if (r.p < 1) { r.p = Math.min(1, r.p + dt * 1.4); if (r.p >= 1 && !r.landed) { r.landed = true; const [x, y] = robotPos(l, r); rings.push({x, y, t: 0}); } continue; }
      r.emit += robotRate(r) * dt;
      while (r.emit >= 1) { r.emit--; last.deploy = t; parts.push({i: 3, a: robotPos(l, r), p: -1, sp: rand(.9, 1.2), hand: false, j: rand(-8, 8)}); }
    }
    // particles: (deploy) card → node → brain, others node → brain
    let arrivedHand = 0, arrivedDep = 0;
    for (const q of parts) {
      q.p += dt * q.sp * (1 + rpm / 80);
      if (q.p >= 1 && !q.hit) { q.hit = true; rpm += IMPULSE; q.hand ? arrivedHand++ : arrivedDep++; }
    }
    parts = parts.filter(q => !q.hit);
    rings.forEach(r => r.t += dt); rings = rings.filter(r => r.t < .8);
    handRate = lerp(handRate, arrivedHand / dt, Math.min(1, dt * 1.5)); depRate = lerp(depRate, arrivedDep / dt, Math.min(1, dt * 1.5));
    rpm = Math.max(0, rpm - rpm * FRICTION * dt);
    rot += rpm / 60 * Math.PI * 2 * dt;
    // capability
    const mix = SRC.filter(s => t - last[s.id] < 6).length, mult = 1 + .12 * Math.max(0, mix - 1);
    const before = C;
    C = Math.min(100, C + .06 * Math.max(0, rpm - STALL) * mult / (1 + C / 60) * dt);
    TASKS.forEach((tk, i) => { if (before < tk.need && C >= tk.need) { unlocked = i + 1; flash = 1; say(`Unlocked · ${tk.name.toLowerCase()}. Click it to deploy.`); } });
    SKILLS.forEach(([v, s], i) => { if (before < v && C >= v) { skillIdx = i; skillFlash = 1; say(`New skill · ${s}`); } });
    if (Math.floor(before / PER_ROBOT) < Math.floor(C / PER_ROBOT) && C >= PER_ROBOT && robots.length < TASKS.length * PER_TASK) say(`Capability ${Math.floor(C)}% · a new robot is ready to deploy.`);
    // self-sustaining?
    const dSteady = depTheory() * IMPULSE / FRICTION;
    if (!done && dSteady >= SUSTAIN && active.size && !hinted) { hinted = true; say('Deployments could carry it now. Let go of every source.'); }
    if (!done && handsOff >= HANDS_OFF && dSteady >= SUSTAIN && rpm >= SUSTAIN * .9 && (C > before || C >= 100)) {
      done = true; winT = 0; const prev = best; if (best == null || runT < best) best = runT;
      say(`Self-sustaining in ${mmss(runT)}: ${robots.length} robots keep the wheel at ${Math.round(rpm)} RPM.${prev != null && runT < prev ? ' New best!' : ''}`);
      rec('series-c.run', {seconds: +runT.toFixed(1), robots: robots.length, sectors: Object.fromEntries(TASKS.map((tk, i) => [tk.name, nIn(i)]).filter(e => e[1])), handPackets: handN, capability: Math.round(C), rpm: Math.round(rpm)});
      api.complete('Series C · the flywheel spins itself'); api.status('Self-sustaining');
    }
    winT += dt;
    draw(t, l, mult, mix, dSteady);
  });

  function robotPos(l, r) { const c = l.cards[r.task]; return [c.x + c.w - 16 - (PER_TASK - 1 - r.slot) * 26, c.y + c.h - 16]; }

  function draw(t, l, mult, mix, dSteady) {
    k.clear(B.warm1);
    k.text('Goal: make the flywheel self-sustaining, so deployment data alone keeps the brain improving.', 20, 30, {size: 14, weight: 600});
    k.label('Hold a source (or keys 1–3) · click a sector to deploy (or D) · simulated', 20, 48);
    log.slice(-1).forEach(s => { ctx.globalAlpha = clamp(logT * 5, .2, 1); k.text(s, 20 + (1 - clamp(logT * 5, 0, 1)) * 8, 70, {size: 13, weight: 600, color: B.black}); ctx.globalAlpha = 1; });
    if (log.length > 1) k.text(log[log.length - 2], 20, 86, {size: 11, color: B.cool2});
    const hot = done ? 1 : clamp((rpm - STALL) / (SUSTAIN - STALL), 0, 1);
    // wheel
    ctx.strokeStyle = B.warm2; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(l.cx, l.cy, l.R, 0, 7); ctx.stroke();
    ctx.strokeStyle = `rgba(255,126,0,${.25 + hot * .75})`; ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) { const a0 = SRC[i].ang + .38, a1 = a0 + Math.PI / 2 - .76; ctx.beginPath(); ctx.arc(l.cx, l.cy, l.R, a0, a1); ctx.stroke();
      const ax = l.cx + Math.cos(a1) * l.R, ay = l.cy + Math.sin(a1) * l.R, d = a1 + Math.PI / 2;
      ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.moveTo(ax + Math.cos(d) * 8, ay + Math.sin(d) * 8); ctx.lineTo(ax + Math.cos(d + 2.4) * 8, ay + Math.sin(d + 2.4) * 8); ctx.lineTo(ax + Math.cos(d - 2.4) * 8, ay + Math.sin(d - 2.4) * 8); ctx.fill(); }
    ctx.strokeStyle = B.black; ctx.lineWidth = 2;
    for (let i = 0; i < 36; i++) { const a = rot + i / 36 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(l.cx + Math.cos(a) * (l.R - 16), l.cy + Math.sin(a) * (l.R - 16)); ctx.lineTo(l.cx + Math.cos(a) * (l.R - 10), l.cy + Math.sin(a) * (l.R - 10)); ctx.stroke(); }
    // particles
    for (const q of parts) {
      const n = l.nodes[q.i], c = [l.cx, l.cy], m = swirl(l, q.i);
      let x, y;
      if (q.p < 0) { const u = q.p + 1; [x, y] = bez(q.a, [(q.a[0] + n.x) / 2, Math.max(q.a[1], n.y) + 40], [n.x, n.y], u); }
      else [x, y] = bez([n.x, n.y], [m[0] + q.j, m[1] + q.j], c, q.p);
      ctx.fillStyle = q.hand ? B.orange : B.orange2; ctx.globalAlpha = q.p < 0 ? .75 : 1; ctx.beginPath(); ctx.arc(x, y, q.hand ? 3 : 2.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    }
    // brain
    const br = 24 + C * .3 * Math.min(1, l.R / 150) + Math.sin(t * 3) * 1.5 + skillFlash * 6;
    const g = ctx.createRadialGradient(l.cx, l.cy, br * .3, l.cx, l.cy, br * 2); g.addColorStop(0, `rgba(255,126,0,${.2 + hot * .2})`); g.addColorStop(1, 'rgba(255,126,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.cx, l.cy, br * 2, 0, 7); ctx.fill();
    ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(l.cx, l.cy, br, 0, 7); ctx.fill();
    k.text(`${Math.floor(C)}%`, l.cx, l.cy + 6, {align: 'center', mono: true, size: 18, weight: 700});
    k.label('brain capability', l.cx, l.cy + br + 18, {align: 'center'});
    if (skillIdx >= 0) { ctx.globalAlpha = .35 + .65 * skillFlash; k.text(`skill: ${SKILLS[skillIdx][1]}`, l.cx, l.cy + br + 34, {align: 'center', size: 12, weight: 600, color: B.orange2}); ctx.globalAlpha = 1; }
    // source nodes
    SRC.forEach((s, i) => {
      const n = l.nodes[i], on = s.auto ? robots.some(r => r.p >= 1) : (pumping === s.id || keysHeld.has(s.id)), sc = on && !s.auto ? .97 : 1;
      ctx.save(); ctx.translate(n.x, n.y); ctx.scale(sc, sc); ctx.translate(-n.x, -n.y);
      ctx.fillStyle = B.white; rr(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h, 10); ctx.fill();
      ctx.strokeStyle = on ? B.orange : B.warm2; ctx.lineWidth = on ? 2 : 1; ctx.stroke();
      ctx.fillStyle = on ? B.orange : B.warm3; ctx.beginPath(); ctx.arc(n.x - n.w / 2 + 14, n.y, 5 + (on ? Math.sin(t * 12) * 1.2 : 0), 0, 7); ctx.fill();
      k.text(s.name, n.x - n.w / 2 + 26, n.y - 3, {size: 12, weight: 600});
      k.label(s.auto ? `${s.sub} · ${robots.length}` : `${s.sub} · ${s.key}`, n.x - n.w / 2 + 26, n.y + 13, {size: 9, color: s.auto && robots.length ? B.orange2 : B.cool2});
      ctx.restore();
    });
    if (done) {
      const a = clamp(winT * 3, 0, 1); ctx.globalAlpha = a;
      const yy = Math.max(96, l.cy - l.R - 54);
      ctx.fillStyle = B.white; rr(l.cx - 170, yy, 340, 48, 12); ctx.fill(); ctx.strokeStyle = B.orange; ctx.lineWidth = 2; ctx.stroke();
      k.text(`Self-sustaining in ${mmss(runT)}`, l.cx, yy + 20, {align: 'center', size: 14, weight: 700});
      k.label(`best ${mmss(best)} · deployment data alone keeps it improving`, l.cx, yy + 37, {align: 'center'});
      ctx.globalAlpha = 1;
    }

    // sector grid
    k.label(`Deploy · fleet ${robots.length} / ${slots()} ready`, l.colX, 72, {color: robots.length < slots() ? B.orange2 : B.cool2});
    TASKS.forEach((tk, i) => {
      const c = l.cards[i], open = C >= tk.need, n = nIn(i), can = open && n < PER_TASK && robots.length < slots();
      ctx.fillStyle = open ? B.white : 'rgba(255,255,255,.5)'; rr(c.x, c.y, c.w, c.h, 10); ctx.fill();
      ctx.strokeStyle = can ? B.orange : B.warm2; ctx.lineWidth = can ? 1.5 + Math.sin(t * 5) * .5 : 1; ctx.stroke();
      if (flash && unlocked === i + 1) { ctx.fillStyle = `rgba(255,126,0,${flash * .18})`; rr(c.x, c.y, c.w, c.h, 10); ctx.fill(); }
      k.text(tk.name, c.x + 10, c.y + 18, {size: 12, weight: 600, color: open ? B.black : B.cool2});
      if (!open) { k.text(`at ${tk.need}%`, c.x + 10, c.y + 33, {size: 10, color: B.cool2, mono: true}); ctx.fillStyle = B.warm2; rr(c.x + 10, c.y + c.h - 12, c.w - 20, 4, 2); ctx.fill(); ctx.fillStyle = B.cool1; rr(c.x + 10, c.y + c.h - 12, (c.w - 20) * clamp(C / tk.need, 0, 1), 4, 2); ctx.fill(); }
      else { k.text(can ? 'click to deploy' : n >= PER_TASK ? 'full' : 'no robot free', c.x + 10, c.y + 33, {size: 10, color: can ? B.orange2 : B.cool2}); for (let s = 0; s < PER_TASK; s++) { const [x, y] = robotPos(l, {task: i, slot: s}); ctx.strokeStyle = B.warm3; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); rr(x - 10, y - 10, 20, 20, 6); ctx.stroke(); ctx.setLineDash([]); } }
    });
    for (const r of robots) {
      const [tx, ty] = robotPos(l, r), e = 1 - Math.pow(1 - r.p, 3), x = lerp(l.cx, tx, e), y = lerp(l.cy, ty, e) - Math.sin(r.p * Math.PI) * 60;
      ctx.fillStyle = B.black; rr(x - 9, y - 9, 18, 18, 5); ctx.fill();
      ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(x, y, 3 + (r.p >= 1 ? Math.max(0, Math.sin(t * 6 + r.slot * 2 + r.task)) * 2 : 0), 0, 7); ctx.fill();
    }
    for (const r of rings) { ctx.strokeStyle = r.grey ? `rgba(92,102,112,${1 - r.t / .8})` : `rgba(255,126,0,${1 - r.t / .8})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(r.x, r.y, 8 + r.t * 40, 0, 7); ctx.stroke(); }

    // bottom instruments (left of the corner clip)
    const y = k.h - 98;
    ctx.fillStyle = B.warm2; ctx.fillRect(20, y - 14, Math.min(k.w - 380, 700), 1);
    k.label('Flywheel', 20, y + 2);
    k.text(`${Math.round(rpm)}`, 20, y + 40, {size: 34, mono: true, weight: 600, color: done ? B.orange2 : B.black});
    k.label('RPM', 92, y + 40);
    const gw = 180, gx = 20, gy = y + 54, max = 90;
    ctx.fillStyle = B.warm2; rr(gx, gy, gw, 6, 3); ctx.fill(); ctx.fillStyle = rpm >= SUSTAIN ? B.orange : B.cool3; rr(gx, gy, Math.max(6, gw * clamp(rpm / max, 0, 1)), 6, 3); ctx.fill();
    for (const [v, s] of [[STALL, 'stall'], [SUSTAIN, 'self-sustain']]) { ctx.fillStyle = B.black; ctx.fillRect(gx + gw * v / max, gy - 3, 1.5, 12); k.label(s, gx + gw * v / max, gy + 22, {align: 'center', size: 8}); }
    const bx = 236;
    k.meter(bx, y + 12, 170, C / 100, `Capability ${Math.floor(C)}%`);
    SKILLS.forEach(([v], i) => { ctx.fillStyle = C >= v ? B.black : B.cool1; ctx.fillRect(bx + 170 * v / 100 - .5, y + 9, 1.5, 12); });
    k.label(`Data mix ${mix}/4 · ×${mult.toFixed(2)}`, bx, y + 36);
    const bar = (label, v, yy, c) => { k.label(label, bx, yy); ctx.fillStyle = B.warm2; rr(bx + 92, yy - 7, 78, 6, 3); ctx.fill(); ctx.fillStyle = c; rr(bx + 92, yy - 7, Math.max(4, 78 * clamp(v / 14, 0, 1)), 6, 3); ctx.fill(); };
    bar('By hand', handRate, y + 56, B.cool3); bar('Deployments', depRate, y + 72, B.orange);
    const sx = 426;
    if (k.w - 350 - sx > 110) {
      k.label(done ? 'Status' : 'Deploy-only', sx, y + 2);
      k.text(done ? 'Self-sustaining ✓' : `${Math.round(dSteady)} / ${SUSTAIN} RPM`, sx, y + 24, {size: 14, weight: 600, color: dSteady >= SUSTAIN ? B.orange2 : B.black});
      if (!done && dSteady >= SUSTAIN) k.text(handsOff > 0 ? `hands off ${Math.min(HANDS_OFF, handsOff).toFixed(1)}/${HANDS_OFF}s` : 'let go now', sx, y + 42, {size: 12, color: B.orange2, mono: true});
      k.label('Timer', sx, y + 62); k.text(t0 == null ? '—' : mmss(runT) + (best != null ? ` · best ${mmss(best)}` : ''), sx, y + 80, {size: 12, mono: true, color: B.cool3});
    }
  }

  k.button('Deploy a robot (D)', () => deploy(), {primary: true});
  k.button('Reset', () => reset());
  return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur); k.destroy(); };
}
