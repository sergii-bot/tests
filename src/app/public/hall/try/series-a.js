// TRY · Series A — "Break the data barrier": bespoke brains (one per robot) vs one shared brain for every body.
// Post (Jul 2024): robots today are "vertically designed" for specific applications; Skild's one model generalizes across
// embodiments, scenarios and tasks (manipulation, locomotion, navigation) by training on data at scale.
// The post names NO data types and gives NO numbers for the model: only "an unparalleled scale of data".
// So the packets are neutral data tokens, and every number in the game (80% goal, +25% transfer, per-token gains, packet
// counts) is an illustrative GAME RULE, not a Skild result. The post has no demo footage: robots and skill bars are stylized.
// Real numbers used (Why it matters / Backers tabs), as the post words them: $300M, $1.5B, 9 Jul 2024, 1.7M, 2.1M by 2030.
import {kit, B, lerp, clamp, rand} from './kit.js';
import {INVESTORS} from '../investors.js';

const ROBOTS = [
  {id: 'quad', name: 'Quadruped', tags: 'locomotion'},
  {id: 'human', name: 'Humanoid', tags: 'vision · dexterity'},
  {id: 'arm', name: 'Tabletop arm', tags: 'manipulation'},
  {id: 'mm', name: 'Mobile manipulator', tags: 'navigation'},
];
const DATA = [
  {id: 't1', name: 'Token 1', sub: 'illustrative', gain: .08, key: '1'},
  {id: 't2', name: 'Token 2', sub: 'illustrative', gain: .07, key: '2'},
  {id: 't3', name: 'Token 3', sub: 'illustrative', gain: .10, key: '3'},
  {id: 't4', name: 'Token 4', sub: 'illustrative', gain: .09, key: '4'},
];
const GOAL = .8, TRANSFER = .25, N = ROBOTS.length;           // GAME RULE (not from the post): +25% skill per token for every extra body
const AVG = DATA.reduce((a, d) => a + d.gain, 0) / DATA.length;
const NEED_BESPOKE = N * Math.ceil(GOAL / AVG);                  // every body learns alone
const NEED_BRAIN = Math.ceil(GOAL / (AVG * (1 + TRANSFER * (N - 1)))); // every packet trains every body
const SCALE_CAP = NEED_BESPOKE;                                  // only sets where the qualitative Scale meter ends ("unparalleled")
const pct = v => Math.round(v * 100);
const sm = u => u * u * (3 - 2 * u);

// Backers exactly as the post names them (round A only), from investors.js. Amazon's two funds are shown separately.
const LEADS = INVESTORS.filter(v => v.lead?.includes('A')).map(v => v.name);
const OTHERS = INVESTORS.filter(v => v.rounds.includes('A') && !v.lead?.includes('A')).flatMap(v => v.name.includes(' & ') ? v.name.split(' & ') : [v.name]);
// Only the Sequoia line is quoted (verified, under 15 words). The rest are paraphrases of the post.
const NOTES = {
  'Sequoia': '\u201CA GPT-3 moment is coming to the world of robotics.\u201D Stephanie Zhan, Sequoia (quote from the post).',
  'Lightspeed': 'Paraphrase: Raviraj Jain calls Skild a one-of-a-kind company that could redefine what machines can do.',
  'Coatue': 'Paraphrase: Sri Viswanath sees a truly scalable approach to foundation models for robot manipulation and locomotion.',
  'Felicis': 'Paraphrase: Aydin Senkut says Felicis has backed robotics for over 15 years and finds Skild the most visionary robotics company it has seen.',
  'Amazon Industrial Innovation Fund': 'Paraphrase: Franziska Bossart says Skild is applying its techniques to commercial, industrial and consumer use cases.',
};
const SECTORS = ['Healthcare', 'Construction', 'Warehousing', 'Manufacturing'], DANGER = ['Oil rigs', 'Machine rooms'];

export default function mount(root, api) {
  const k = kit(root);
  const {ctx} = k;
  const clip = x => { try { api.clip?.(x); } catch (e) { /* optional */ } };
  const rec = (kind, d) => { try { api.record?.(kind, d); } catch (e) { /* optional */ } };
  const fresh = () => ({skill: Array(N).fill(0), shown: Array(N).fill(0), used: 0, by: Object.fromEntries(DATA.map(d => [d.id, 0])), hit: Array(N).fill(false), t0: null});
  let S = {bespoke: fresh(), brain: fresh()};
  let mode = 'bespoke', drag = null, hover = null, flights = [], pulses = [], bursts = [], pops = [], confetti = [], bounce = Array(N).fill(0);
  let log = ['Mode A · Bespoke: every robot has its own small brain.'];
  let brainGlow = 0, bespokeTried = false, done = false, winT = 0, hintedBespoke = false, hintedAll = false, completed = false, now = 0, logT = 0;
  const recorded = {bespoke: false, brain: false};
  api.status('Mode A · Bespoke');

  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const inRect = (p, c) => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;
  const say = s => { log.push(s); if (log.length > 20) log.shift(); logT = 0; };

  // Layout: robot cards left, data dock as a row at the top, brain in the middle-left (bottom-right stays free for the clip).
  function L() {
    const top = 66, bottom = k.h - 112;
    const lw = clamp(k.w * .34, 280, 390), rx = 20 + lw + 24, rw = k.w - rx - 20;
    const ch = (bottom - top - 10 * (N - 1)) / N;
    const cards = ROBOTS.map((r, i) => ({x: 20, y: top + i * (ch + 10), w: lw, h: ch}));
    const cw = (rw - 10 * (DATA.length - 1)) / DATA.length;
    const chips = DATA.map((d, i) => ({x: rx + i * (cw + 10), y: top + 16, w: cw, h: 50}));
    const logY = top + 90, zoneTop = logY + 52;
    const R = clamp(Math.min(rw - 120, bottom - zoneTop - 60) * .24, 30, 66);
    const cx = Math.min(rx + rw / 2, k.w - 340 - R - 30), cy = clamp((zoneTop + bottom) / 2, zoneTop + R + 10, k.h - 250 - R * .2);
    return {top, bottom, lw, rx, rw, cards, cx: Math.max(rx + R + 40, cx), cy, R, chips, logY};
  }
  const port = c => [c.x + c.w - 22, c.y + c.h / 2];
  const curve = (a, b, lift) => { const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - lift]; return u => [lerp(lerp(a[0], m[0], u), lerp(m[0], b[0], u), u), lerp(lerp(a[1], m[1], u), lerp(m[1], b[1], u), u)]; };

  function targetAt(p) {
    const l = L();
    const onBrain = Math.hypot(p.x - l.cx, p.y - l.cy) < l.R + 26;
    const i = l.cards.findIndex(c => inRect(p, c));
    if (mode === 'bespoke') return i >= 0 ? {kind: 'robot', i} : onBrain ? {kind: 'nothing'} : null;
    return onBrain || i >= 0 ? {kind: 'brain', via: i} : null;
  }
  function autoTarget() {
    if (mode === 'brain') return {kind: 'brain', via: -1};
    const s = S.bespoke.skill; let i = 0; s.forEach((v, j) => { if (v < s[i]) i = j; }); return {kind: 'robot', i};
  }
  function send(d, x, y, tg) {
    if (tg.kind === 'nothing') { say('There is no shared brain in bespoke mode. Pick one robot.'); return; }
    const l = L(), st = S[mode];
    const to = tg.kind === 'robot' ? port(l.cards[tg.i]) : [l.cx, l.cy];
    flights.push({d, tg, path: curve([x, y], to, 60), p: 0, m: mode});
    if (st.t0 == null) st.t0 = now;
    st.used++; st.by[d.id]++;
    if (mode === 'bespoke' && S.bespoke.used >= 4 && !bespokeTried) { bespokeTried = true; say('Feel it? Each packet helped one robot. Now try Mode B · One brain.'); }
  }

  k.onDown(p => {
    const l = L(); const i = l.chips.findIndex(c => inRect(p, c));
    if (i >= 0) { drag = {d: DATA[i], x: p.x, y: p.y, sx: p.x, sy: p.y}; return; }
    const r = l.cards.findIndex(c => inRect(p, c));
    if (r >= 0) { bounce[r] = .5; say(mode === 'bespoke' ? `Drag a data packet onto the ${ROBOTS[r].name.toLowerCase()}.` : 'One-brain mode: drop data into the orange brain (or any robot).'); }
  });
  k.onMove(p => { if (drag) { drag.x = p.x; drag.y = p.y; hover = targetAt(p); } });
  k.onUp(p => {
    if (!drag) return;
    const moved = Math.hypot(p.x - drag.sx, p.y - drag.sy) > 6;
    const tg = moved ? targetAt(p) : autoTarget();
    if (tg) send(drag.d, p.x, p.y, tg); else say(`Missed. Drop it on ${mode === 'bespoke' ? 'a robot' : 'the brain'}.`);
    drag = null; hover = null;
  });
  k.onKey(e => { const d = DATA.find(x => x.key === e.key); if (!d) return; const c = L().chips[DATA.indexOf(d)]; send(d, c.x + 20, c.y + c.h / 2, autoTarget()); });

  function setMode(m) {
    mode = m; flights = []; pulses = [];
    modeBtns.a.classList.toggle('on', m === 'bespoke'); modeBtns.b.classList.toggle('on', m === 'brain');
    if (m === 'brain') { say('Mode B · One brain: every packet trains the same model.'); if (!bespokeTried && !hintedBespoke) { hintedBespoke = true; say('Tip: try a few packets in Bespoke mode first to feel the contrast.'); } }
    else say('Mode A · Bespoke: every robot has its own small brain.');
    api.status(m === 'brain' ? 'Mode B · One brain' : 'Mode A · Bespoke');
    clip(0);
  }
  function reached(m, i) {
    const st = S[m]; if (st.hit[i]) return; st.hit[i] = true; bounce[i] = 1;
    const c = L().cards[i]; pops.push({x: c.x + c.w - 60, y: c.y + 18, t: 0, s: '80% ✓'});
    if (m === 'bespoke') say(`${ROBOTS[i].name} reached 80%, on its own data only.`);
  }
  function finishRun(m) {
    if (recorded[m]) return; recorded[m] = true; const st = S[m];
    rec('series-a.run', {mode: m, packets: st.used, bySource: st.by, seconds: +(now - (st.t0 ?? now)).toFixed(1), benchmark: m === 'brain' ? NEED_BRAIN : NEED_BESPOKE});
  }

  k.frame((dt, t) => {
    const l = L(); now = t; logT += dt;
    brainGlow = Math.max(0, brainGlow - dt * 1.6);
    for (const f of flights) {
      f.p += dt * 2.4;
      if (f.p >= 1 && !f.hit) {
        f.hit = true; const st = S[f.m];
        if (f.tg.kind === 'robot') {
          const i = f.tg.i, before = st.skill[i]; st.skill[i] = Math.min(1, before + f.d.gain);
          bursts.push({x: port(l.cards[i])[0], y: port(l.cards[i])[1], r: 0}); bounce[i] = Math.max(bounce[i], .35);
          say(`${f.d.name} → ${ROBOTS[i].name.toLowerCase()} · +${pct(st.skill[i] - before)}% · only this robot`);
          if (st.skill[i] >= GOAL - 1e-6) reached(f.m, i);
        } else {
          brainGlow = 1; bursts.push({x: l.cx, y: l.cy, r: l.R * .6});
          const g = f.d.gain * (1 + TRANSFER * (N - 1));
          ROBOTS.forEach((r, i) => pulses.push({i, p: -i * .06, g, m: f.m}));
          say(`${f.d.name} → one brain · all ${N} robots +${pct(g)}% (incl. transfer)`);
        }
      }
    }
    flights = flights.filter(f => !f.hit);
    for (const q of pulses) {
      q.p += dt * 1.7;
      if (q.p >= 1 && !q.hit) { q.hit = true; const st = S[q.m]; st.skill[q.i] = Math.min(1, st.skill[q.i] + q.g); const pp = port(l.cards[q.i]); bursts.push({x: pp[0], y: pp[1], r: 0}); bounce[q.i] = Math.max(bounce[q.i], .35); if (st.skill[q.i] >= GOAL - 1e-6) reached(q.m, q.i); }
    }
    pulses = pulses.filter(q => !q.hit);
    for (const b of bursts) b.r += dt * 70;
    bursts = bursts.filter(b => b.r < 46);
    pops.forEach(p => p.t += dt); pops = pops.filter(p => p.t < 1.4);
    confetti.forEach(c => { c.vy += 260 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.va * dt; c.t += dt; }); confetti = confetti.filter(c => c.t < 2.2);
    bounce = bounce.map(v => Math.max(0, v - dt * 2.5));
    for (const m of ['bespoke', 'brain']) S[m].shown = S[m].shown.map((v, i) => lerp(v, S[m].skill[i], Math.min(1, dt * 6)));
    if (S.bespoke.skill.every(v => v >= GOAL - 1e-6)) finishRun('bespoke');
    if (!done && S.brain.skill.every(v => v >= GOAL - 1e-6)) {
      finishRun('brain');
      if (bespokeTried) {
        done = true; winT = 0;
        say(`All ${N} robots at 80% with ${S.brain.used} packets. Bespoke needs ~${NEED_BESPOKE}.`);
        for (let i = 0; i < 60; i++) confetti.push({x: l.cx, y: l.cy, vx: rand(-220, 220), vy: rand(-320, -80), a: rand(0, 6), va: rand(-8, 8), t: 0, c: i % 3 ? B.orange : B.black});
        if (!completed) { completed = true; api.complete('Series A · one brain, every body'); }
      } else if (!hintedAll) { hintedAll = true; say('One brain got there. Now feel the bespoke way: switch to Mode A and feed a robot.'); }
    }
    winT += dt;
    draw(t, l);
  });

  function glyph(id, x, y, s, q, t, i) {
    const wob = 1 - q, ph = t * (1 + q * 4) + i * 1.7, sw = Math.sin(ph) * (.15 + q * .85);
    ctx.save(); ctx.translate(x + Math.sin(t * 19 + i * 3) * wob * s * .04, y - bounce[i] * 6); ctx.rotate(Math.sin(t * 7 + i) * wob * .12);
    ctx.lineCap = ctx.lineJoin = 'round'; ctx.strokeStyle = B.black; ctx.fillStyle = B.black;
    const hot = q >= GOAL ? B.orange : B.cool2;
    const line = (a, b, w, c = B.black) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
    if (id === 'quad') {
      [-.26, -.1, .1, .26].forEach((lx, j) => { const a = (j % 2 ? 1 : -1) * sw * .12 * s; line([lx * s, 0], [lx * s + a * .6, s * .15], 3); line([lx * s + a * .6, s * .15], [lx * s + a, s * .3], 3); });
      rr(-s * .34, -s * .14, s * .64, s * .17, 5); ctx.fill();
      ctx.fillStyle = hot; ctx.beginPath(); ctx.arc(s * .36, -s * .12, s * .07, 0, 7); ctx.fill();
    } else if (id === 'human') {
      const hip = [0, s * .04], sh = [0, -s * .2];
      for (const d of [-1, 1]) { const a = d * sw * .12 * s; line(hip, [d * s * .06 + a, s * .34], 3.5); line(sh, [d * s * .15 - a * .6, s * .0], 3); }
      line(sh, hip, 5);
      ctx.fillStyle = B.black; ctx.beginPath(); ctx.arc(0, -s * .31, s * .08, 0, 7); ctx.fill();
      ctx.fillStyle = hot; rr(-s * .05, -s * .33, s * .1, s * .03, 2); ctx.fill();
    } else if (id === 'arm') {
      ctx.fillStyle = B.black; rr(-s * .2, s * .26, s * .4, s * .07, 3); ctx.fill();
      const a1 = -Math.PI / 2 + .45 + sw * .35, a2 = a1 + 1.25 + Math.sin(ph * 1.3) * .3 * (.2 + q);
      const p0 = [0, s * .26], p1 = [Math.cos(a1) * s * .32, s * .26 + Math.sin(a1) * s * .32], p2 = [p1[0] + Math.cos(a2) * s * .26, p1[1] + Math.sin(a2) * s * .26];
      line(p0, p1, 5); line(p1, p2, 4, B.cool3);
      const g = .35 + Math.sin(ph * 2) * .15;
      line(p2, [p2[0] + Math.cos(a2 + g) * s * .08, p2[1] + Math.sin(a2 + g) * s * .08], 2.5); line(p2, [p2[0] + Math.cos(a2 - g) * s * .08, p2[1] + Math.sin(a2 - g) * s * .08], 2.5);
      ctx.fillStyle = hot; ctx.beginPath(); ctx.arc(p1[0], p1[1], s * .045, 0, 7); ctx.fill();
    } else {
      ctx.translate(Math.sin(ph * .5) * s * .05 * q, 0);
      ctx.fillStyle = B.black; rr(-s * .3, s * .06, s * .6, s * .15, 4); ctx.fill();
      ctx.fillStyle = B.cool3; for (const d of [-1, 1]) { ctx.beginPath(); ctx.arc(d * s * .18, s * .25, s * .06, 0, 7); ctx.fill(); }
      const m = [-s * .12, -s * .2]; line([-s * .12, s * .06], m, 4);
      const a = -.25 + sw * .35, e = [m[0] + Math.cos(a) * s * .3, m[1] + Math.sin(a) * s * .3];
      line(m, e, 3.5, B.cool3);
      ctx.fillStyle = hot; ctx.beginPath(); ctx.arc(e[0], e[1], s * .045, 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  function packet(d, x, y, a = 1) {
    ctx.globalAlpha = a; ctx.fillStyle = B.orange; rr(x - 12, y - 12, 24, 24, 6); ctx.fill();
    k.text(d.name[0], x, y + 4, {align: 'center', mono: true, size: 12, weight: 700, color: B.black}); ctx.globalAlpha = 1;
  }

  function draw(t, l) {
    k.clear(B.warm1);
    const st = S[mode];
    k.text('Goal: bring all four robots to 80% skill. Try it the bespoke way, then with one brain.', 20, 30, {size: 14, weight: 600});
    k.label(mode === 'bespoke' ? 'Mode A · Bespoke · one brain per robot' : 'Mode B · One brain · shared by every body', 20, 50, {color: mode === 'brain' ? B.orange2 : B.cool2});

    // center: shared brain or its absence
    if (mode === 'brain') {
      l.cards.forEach((c, i) => {
        const path = curve(port(c), [l.cx, l.cy], 0);
        ctx.strokeStyle = S.brain.skill[i] >= GOAL ? B.orangeSoft : B.warm3; ctx.lineWidth = 1.5; ctx.beginPath();
        for (let u = 0; u <= 1.001; u += .05) { const [x, y] = path(u); u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
      });
      for (const q of pulses) { if (q.p < 0) continue; const [x, y] = curve([l.cx, l.cy], port(l.cards[q.i]), 0)(clamp(q.p, 0, 1)); ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); }
      const R = l.R * (1 + brainGlow * .08 + Math.sin(t * 2) * .015);
      const g = ctx.createRadialGradient(l.cx, l.cy, R * .2, l.cx, l.cy, R * 1.6); g.addColorStop(0, 'rgba(255,126,0,.28)'); g.addColorStop(1, 'rgba(255,126,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(l.cx, l.cy, R * 1.6, 0, 7); ctx.fill();
      ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(l.cx, l.cy, R, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(18,18,18,.25)'; ctx.lineWidth = 1.5;
      for (let j = 0; j < 3; j++) { ctx.beginPath(); ctx.arc(l.cx, l.cy, R * (.35 + j * .2), t * (.4 + j * .2) + j, t * (.4 + j * .2) + j + 3.6); ctx.stroke(); }
      k.text('ONE BRAIN', l.cx, l.cy + 4, {align: 'center', mono: true, size: 12, weight: 700, color: B.black});
      k.label(`${N} bodies · +${pct(TRANSFER)}% transfer each`, l.cx, l.cy + l.R + 28, {align: 'center'});
      if (hover?.kind === 'brain') { ctx.strokeStyle = B.black; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(l.cx, l.cy, R + 14, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    } else {
      ctx.strokeStyle = B.warm3; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.arc(l.cx, l.cy, l.R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      k.text('No shared brain', l.cx, l.cy + 5, {align: 'center', size: 14, color: B.cool2});
      k.label(`${N} robots · ${N} separate programs`, l.cx, l.cy + l.R + 28, {align: 'center'});
      k.label('data does not transfer', l.cx, l.cy + l.R + 44, {align: 'center'});
    }

    // robot cards
    l.cards.forEach((c, i) => {
      const q = st.shown[i], hot = hover && ((hover.kind === 'robot' && hover.i === i) || (hover.kind === 'brain' && hover.via === i));
      ctx.fillStyle = B.white; rr(c.x, c.y, c.w, c.h, 12); ctx.fill();
      ctx.strokeStyle = hot || bounce[i] > .6 ? B.orange : B.warm2; ctx.lineWidth = hot ? 2 : 1; ctx.stroke();
      glyph(ROBOTS[i].id, c.x + 46, c.y + c.h / 2 - 2, Math.min(c.h * .82, 66), q, t, i);
      const tx = c.x + 92, bw = c.w - 92 - 64, by = c.y + c.h * .7;
      k.text(ROBOTS[i].name, tx, c.y + c.h * .36, {size: 14, weight: 600});
      k.label(ROBOTS[i].tags, tx, c.y + c.h * .36 + 15);
      ctx.fillStyle = B.warm2; rr(tx, by, bw, 8, 4); ctx.fill();
      ctx.fillStyle = q >= GOAL - .005 ? B.orange : B.cool3; rr(tx, by, Math.max(8, bw * q), 8, 4); ctx.fill();
      ctx.fillStyle = B.black; ctx.fillRect(tx + bw * GOAL, by - 4, 1.5, 16);
      k.text(`${pct(q)}%`, tx + bw + 8, by + 8, {mono: true, size: 12, weight: 600, color: q >= GOAL - .005 ? B.orange2 : B.black});
      const [px, py] = port(c);
      if (mode === 'bespoke') { ctx.fillStyle = B.cool2; ctx.beginPath(); ctx.arc(px, py - c.h * .18, 8, 0, 7); ctx.fill(); ctx.fillStyle = B.white; ctx.beginPath(); ctx.arc(px, py - c.h * .18, 3, 0, 7); ctx.fill(); k.label('own', px, py - c.h * .18 + 20, {align: 'center', size: 8}); }
      else { ctx.strokeStyle = B.orange; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, 5, 0, 7); ctx.stroke(); }
    });

    // dock (top row)
    k.label('Data packets · drag, click, or keys 1–4 · the kinds of data Skild trains on', l.rx, l.top + 8);
    l.chips.forEach((c, i) => {
      const d = DATA[i], on = drag?.d === d;
      ctx.fillStyle = B.white; rr(c.x, c.y - (on ? 2 : 0), c.w, c.h, 12); ctx.fill(); ctx.strokeStyle = on ? B.orange : B.warm2; ctx.lineWidth = on ? 2 : 1; ctx.stroke();
      packet(d, c.x + 22, c.y + c.h / 2);
      k.text(d.name, c.x + 42, c.y + 22, {size: 13, weight: 600}); k.label(d.sub, c.x + 42, c.y + 38, {size: 9});
      k.text(d.key, c.x + c.w - 10, c.y + 16, {align: 'right', mono: true, size: 10, color: B.cool2});
      const n = st.by[d.id]; if (n) k.text(`×${n}`, c.x + c.w - 10, c.y + c.h - 8, {align: 'right', mono: true, size: 10, color: B.orange2, weight: 600});
    });
    // log under the dock
    k.label('Log', l.rx, l.logY);
    log.slice(-3).forEach((s, i, a) => { const last = i === a.length - 1; ctx.globalAlpha = last ? clamp(logT * 5, .2, 1) : 1; k.text(s, l.rx + (last ? (1 - clamp(logT * 5, 0, 1)) * 8 : 0), l.logY + 18 + i * 17, {size: 12, color: last ? B.black : B.cool2, weight: last ? 600 : 400}); ctx.globalAlpha = 1; });

    // packets in the air
    for (const f of flights) { const [x, y] = f.path(Math.min(1, f.p)); packet(f.d, x, y, 1 - Math.max(0, f.p - .85) * 4); }
    for (const b of bursts) { ctx.strokeStyle = `rgba(255,126,0,${1 - b.r / 46})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.stroke(); }
    for (const p of pops) { ctx.globalAlpha = clamp(1.4 - p.t, 0, 1); k.text(p.s, p.x, p.y - p.t * 22, {mono: true, size: 13, weight: 700, color: B.orange2}); ctx.globalAlpha = 1; }
    if (drag) { packet(drag.d, drag.x, drag.y); if (!hover) k.label(mode === 'bespoke' ? 'drop on one robot' : 'drop into the brain', drag.x + 18, drag.y - 14); }

    // bottom-left: contrast counter (kept left of the corner clip)
    const y = k.h - 92;
    ctx.fillStyle = B.warm2; ctx.fillRect(20, y - 16, Math.min(k.w - 380, 620), 1);
    k.label('Data needed to reach 80% on all robots · simulated', 20, y);
    const at = m => S[m].skill.filter(v => v >= GOAL - 1e-6).length;
    k.text(`${NEED_BESPOKE}`, 20, y + 40, {size: 34, mono: true, weight: 600, color: mode === 'bespoke' ? B.black : B.cool2});
    k.label('bespoke packets', 20, y + 58); k.text(`you: ${S.bespoke.used} used · ${at('bespoke')}/${N} at 80%`, 20, y + 76, {size: 12, color: B.cool2});
    k.text('vs', 186, y + 36, {size: 14, color: B.cool2});
    k.text(`${NEED_BRAIN}`, 220, y + 40, {size: 34, mono: true, weight: 600, color: B.orange});
    k.label('one-brain packets', 220, y + 58); k.text(`you: ${S.brain.used} used · ${at('brain')}/${N} at 80%`, 220, y + 76, {size: 12, color: B.cool2});
    const fx = 420;
    if (k.w - 360 - fx > 170) {
      k.label('Series A · Jul 2024', fx, y);
      ['$300M at a $1.5B valuation', 'Founded in 2023', 'One model: manipulation,', 'locomotion, navigation'].forEach((s, i) => k.text(s, fx, y + 20 + i * 16, {size: 12, color: i ? B.cool3 : B.black, weight: i ? 400 : 600}));
    }

    if (done && mode === 'brain') {
      const a = clamp(winT * 3, 0, 1), w = Math.min(320, l.rw - 20), x = clamp(l.cx - w / 2, l.rx, k.w - w - 20), yy = l.cy - 31;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x + w / 2, yy + 31); ctx.scale(.9 + .1 * a, .9 + .1 * a); ctx.translate(-(x + w / 2), -(yy + 31));
      ctx.fillStyle = B.white; rr(x, yy, w, 62, 12); ctx.fill(); ctx.strokeStyle = B.orange; ctx.lineWidth = 2; ctx.stroke();
      k.text('One brain. Every body.', x + w / 2, yy + 26, {align: 'center', size: 16, weight: 700});
      k.text(`${S.brain.used} packets vs ~${NEED_BESPOKE} the bespoke way`, x + w / 2, yy + 46, {align: 'center', size: 12, color: B.cool3});
      ctx.restore();
    }
    for (const c of confetti) { ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.globalAlpha = clamp(2.2 - c.t, 0, 1); ctx.fillStyle = c.c; ctx.fillRect(-3, -1.5, 6, 3); ctx.restore(); }
  }

  const modeBtns = {a: k.button('Mode A · Bespoke', () => setMode('bespoke')), b: k.button('Mode B · One brain', () => setMode('brain'), {primary: true})};
  modeBtns.a.classList.add('on'); modeBtns.b.classList.remove('primary');
  k.button('Reset', () => { S = {bespoke: fresh(), brain: fresh()}; flights = []; pulses = []; bursts = []; pops = []; confetti = []; done = false; bespokeTried = false; hintedBespoke = false; hintedAll = false; recorded.bespoke = recorded.brain = false; log = []; setMode('bespoke'); });
  return () => k.destroy();
}
