// TRY · $100M ARR — "Deploy the fleet": drop robot units into sectors and the post's named cases. Each deployment has a
// setup phase, then earns revenue and data. Data raises the shared brain's level, which shortens every setup: deployment
// is part of the technology, not the finish line. Score = a 4-point report card against the post's numbers.
// All money, setup and data numbers are SIMULATED. From the post: $100M ARR 10 months after the first deployment,
// 60+ paying customers, $50M recognized, mobility ~10% of revenue (AMR 4%) vs ~90% manipulation, the sector list, the cases.
import {kit, B, lerp, clamp, rand} from './kit.js';

const SEC_PER_MONTH = 9, MONTHS = 10, GOAL = 100, CUST_GOAL = 60;
const P = {pool0: 3, poolRate: 6.5, lvlK: 120, burst: 6};
const MOB = {kind: 'mob', slots: 6, arr: .6, setup: 1.6, data: 1.0}, MAN = {kind: 'man', slots: 9, arr: 2.4, setup: 4.5, data: 1.6};
const TILES = [
  {name: 'Moving goods', ...MOB}, {name: 'Deliveries', ...MOB}, {name: 'Site inspection', ...MOB}, {name: 'Security', ...MOB},
  {name: 'Food prep', ...MAN}, {name: 'Warehouses', ...MAN}, {name: 'Factories', ...MAN}, {name: 'Data centers', ...MAN},
  {name: 'NVIDIA × Foxconn', sub: 'Skild Brain · dual-arm · Blackwell / GB300 tray', kind: 'man', slots: 1, arr: 10, setup: 5.8, data: 3, req: 3, caseTile: true,
    fact: 'NVIDIA × Foxconn: dual-arm · Blackwell / GB300 tray. High-precision assembly; work that changes every product cycle.'},
  {name: 'Sumitomo Wiring Systems', sub: 'S1 · wire harness, “impossible” steps', kind: 'man', slots: 1, arr: 7, setup: 4.7, data: 3, req: 2, caseTile: true,
    fact: 'Sumitomo Wiring Systems: S1 on wire-harness steps considered “impossible” to automate.'},
  {name: 'Mitsui & Co.', sub: 'S1 pilot · kitchens · 1.4M meals/day chain', kind: 'man', slots: 1, arr: 6, setup: 4.3, data: 3, req: 2, caseTile: true,
    fact: 'Mitsui & Co.: piloting S1 robots in commercial kitchens; its supply chains serve 1.4M meals a day in Japan.'},
];
const money = v => v >= 100 ? `$${v.toFixed(0)}M` : v >= 10 ? `$${v.toFixed(1)}M` : `$${v.toFixed(2)}M`;

export default function mount(root, api) {
  const k = kit(root);
  const {ctx} = k;
  const clip = x => api.clip?.(x), record = (kind, d) => api.record?.(kind, d);
  const RP = 340, BOTTOM = 126, VID = 240;          // right panel = video-corner width; panel content stays above k.h - VID
  let m, playing = false, speed = 1, ffTo = null, drag = null, press = null, hoverTile = -1, won = false, doneOnce = false, ended = false, lastTick = -1, winMonth = 0;
  let log = [], parts = [], rects = [], shownArr = 0, shownLevel = 1, winFlash = 0, bestStars = null;
  const fx = TILES.map(() => ({shake: 0, flash: 0, acc: 0}));
  const say = s => { log.push(s); if (log.length > 30) log.shift(); };

  function reset() {
    if (m && m.deps.length && !ended) recordRun('restart');
    m = {t: 0, pool: P.pool0, data: 0, deps: [], arr: 0, mob: 0, rec: 0, hist: [{t: 0, arr: 0}], moves: []};
    playing = false; ffTo = null; won = false; ended = false; parts = []; shownArr = 0; shownLevel = 1; winFlash = 0;
    log = ['Drag a robot unit onto a sector (or click a tile), then press Play.'];
    if (bPlay) bPlay.textContent = 'Play ▶';
    api.status('Month 0 · ready');
  }
  const level = () => 1 + 4 * (1 - Math.exp(-m.data / P.lvlK));
  const used = ti => m.deps.filter(d => d.ti === ti).length;
  const liveN = ti => m.deps.filter(d => d.ti === ti && d.live).length;
  const liveAll = () => m.deps.filter(d => d.live).length;
  const mobShare = () => m.arr > 0 ? m.mob / m.arr : 0;
  const checks = () => [
    ['$100M ARR by month 10', won],
    [`${CUST_GOAL}+ live customers`, liveAll() >= CUST_GOAL],
    ['Mobility ≈ 10% of revenue (5–15%)', m.arr > 0 && mobShare() >= .05 && mobShare() <= .15],
    ['All 3 post cases live', [8, 9, 10].every(i => liveN(i) > 0)],
  ];
  function recordRun(why) {
    const c = checks();
    record('arr_run', {end: why, month: +m.t.toFixed(2), arr_m: +m.arr.toFixed(1), won, month_100m: won ? +winMonth.toFixed(2) : null, live_customers: liveAll(), signed: m.deps.length,
      recognized_m: +m.rec.toFixed(1), mobility_pct: Math.round(mobShare() * 100), brain_level: +level().toFixed(2), stars: c.filter(x => x[1]).length,
      cases_live: [8, 9, 10].filter(i => liveN(i) > 0).map(i => TILES[i].name), deploys: m.moves.slice(0, 200)});
  }
  function why(ti) {
    const T = TILES[ti];
    if (m.t >= MONTHS) return 'The 10 months are over. Restart to try again.';
    if (m.pool < 1) return 'No robot units ready. More arrive every month.';
    if (used(ti) >= T.slots) return `${T.name} is fully deployed. Spread to another sector.`;
    if (T.req && level() < T.req) return `${T.name} needs brain level ${T.req}. Feed it more data first.`;
    return null;
  }
  function deploy(ti) {
    const r = why(ti), T = TILES[ti];
    if (r) { fx[ti].shake = 1; say(r); if (T.caseTile) say(T.fact); return; }
    m.pool -= 1; m.deps.push({ti, prog: 0, live: false, age: 0}); fx[ti].flash = .6; m.moves.push([+m.t.toFixed(2), ti]);
    if (T.caseTile) { say(T.fact); clip('hidden pillar'); record('arr_case', {case: T.name, month: +m.t.toFixed(2), brain_level: +level().toFixed(2)}); }
    else say(`${T.name} · customer ${used(ti)} signed · setup ~${(T.setup / level()).toFixed(1)} mo`);
  }
  function step(dt) {                       // dt in months
    m.t = Math.min(MONTHS, m.t + dt); m.pool += P.poolRate * dt; m.rec += m.arr / 12 * dt;
    const L = level(); const live = new Map();
    for (const d of m.deps) {
      const T = TILES[d.ti];
      if (!d.live) {
        d.prog += dt * L / T.setup;
        if (d.prog >= 1) { d.live = true; d.prog = 1; fx[d.ti].flash = 1; const first = liveN(d.ti) === 1; if (first) m.data += P.burst; say(`${T.name} is live${first ? ' · new task data for the brain' : ''}`); for (let i = 0; i < (first ? 10 : 4); i++) spawnPart(d.ti); }
      } else { d.age += dt; live.set(d.ti, (live.get(d.ti) || 0) + 1); }
    }
    for (const [ti, n] of live) { const rate = TILES[ti].data * Math.sqrt(n); m.data += rate * dt; fx[ti].acc += rate * dt * 5; while (fx[ti].acc > 1) { fx[ti].acc--; spawnPart(ti); } }
    const before = Math.floor(L), after = level();
    if (Math.floor(after) > before) say(`Brain level ${Math.floor(after)} · every setup gets faster`);
    m.arr = 0; m.mob = 0;
    for (const d of m.deps) if (d.live) { const T = TILES[d.ti], v = T.arr * Math.min(1, .5 + .5 * d.age / 1.5); m.arr += v; if (T.kind === 'mob') m.mob += v; }
    if (m.t - m.hist.at(-1).t >= .05) m.hist.push({t: m.t, arr: m.arr});
    if (!won && m.arr >= GOAL) {
      won = true; winFlash = 1; winMonth = m.t; say(`$100M ARR at month ${m.t.toFixed(1)}. Deployment is part of the technology.`);
      if (!doneOnce) { doneOnce = true; api.complete(`$100M ARR · month ${m.t.toFixed(1)}`); } else api.status(`$100M ARR · month ${m.t.toFixed(1)}`);
    }
    if (m.t >= MONTHS && !ended) {
      ended = true; playing = false; ffTo = null; bPlay.textContent = 'Play ▶';
      const stars = checks().filter(x => x[1]).length; if (bestStars == null || stars > bestStars) bestStars = stars;
      recordRun('month10');
      say(won ? `Month 10 · report card ${stars}/4.` : `Month 10 · ${money(m.arr)} ARR. Deploy earlier and wider to spin the flywheel.`);
      api.status(`Month 10 · ${money(m.arr)} · ${stars}/4`);
    }
  }
  function spawnPart(ti) { const r = rects[ti]; if (!r) return; parts.push({x: r.x + rand(10, r.w - 10), y: r.y + rand(10, r.h - 10), t: 0, d: rand(.7, 1.1), bend: rand(-60, 60)}); if (parts.length > 160) parts.shift(); }

  // ---------- layout (everything left of the right panel; the panel's lower part is left to the video corner) ----------
  function layout() {
    const bx = 16, by = 66, bw = k.w - RP - 32, bh = k.h - by - BOTTOM - 10, gap = 10;
    const rh = (bh - gap * 2) / 3, cw = (bw - gap * 3) / 4, cw3 = (bw - gap * 2) / 3;
    rects = TILES.map((T, i) => i < 8 ? {x: bx + (i % 4) * (cw + gap), y: by + Math.floor(i / 4) * (rh + gap), w: cw, h: rh} : {x: bx + (i - 8) * (cw3 + gap), y: by + 2 * (rh + gap), w: cw3, h: rh});
    const ty = k.h - BOTTOM + 8;
    return {tray: {x: 16, y: ty, w: 196, h: BOTTOM - 20}, tl: {x: 228, y: ty, w: bw - 212, h: BOTTOM - 20}};
  }
  let L0 = layout();
  const inR = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  const tileAt = p => rects.findIndex(r => inR(p, r));
  const tlMonth = p => clamp((p.x - L0.tl.x - 12) / (L0.tl.w - 24), 0, 1) * MONTHS;

  k.onDown(p => {
    if (inR(p, L0.tray)) { if (m.pool >= 1) drag = {x: p.x, y: p.y}; else say('No robot units ready. More arrive every month.'); return; }
    if (inR(p, {x: L0.tl.x, y: L0.tl.y + L0.tl.h - 34, w: L0.tl.w, h: 34})) { const target = tlMonth(p); if (target > m.t + .02 && m.t < MONTHS) { ffTo = target; say(`Fast-forward to month ${target.toFixed(1)}`); } else if (target < m.t) say('Time only runs forward. Restart to replay.'); return; }
    const ti = tileAt(p); if (ti >= 0) press = {ti, x: p.x, y: p.y};
  });
  k.onMove(p => { if (drag) { drag.x = p.x; drag.y = p.y; } hoverTile = tileAt(p); if (press && Math.hypot(p.x - press.x, p.y - press.y) > 8) press = null; });
  k.onUp(p => {
    if (drag) { const ti = tileAt(p); if (ti >= 0) deploy(ti); drag = null; }
    else if (press) { const ti = tileAt(p); if (ti === press.ti) deploy(ti); }
    press = null;
  });
  k.onKey(e => { if (e.key === ' ' && e.target === document.body) { e.preventDefault(); togglePlay(); } });

  k.frame((dt, t) => {
    L0 = layout();
    if (m.t < MONTHS && (playing || ffTo != null)) {
      let months = ffTo != null ? Math.min(ffTo - m.t, dt * 1.1) : dt * speed / SEC_PER_MONTH;
      while (months > 1e-6) { const s = Math.min(.01, months); step(s); months -= s; }
      if (ffTo != null && m.t >= ffTo - 1e-4) ffTo = null;
      if (m.t < MONTHS && !won && Math.floor(m.t * 10) !== lastTick) { lastTick = Math.floor(m.t * 10); api.status(`Month ${m.t.toFixed(1)} · ${money(m.arr)} ARR`); }
    }
    fx.forEach(f => { f.shake = Math.max(0, f.shake - dt * 3); f.flash = Math.max(0, f.flash - dt * 1.4); });
    shownArr = lerp(shownArr, m.arr, Math.min(1, dt * 6)); shownLevel = lerp(shownLevel, level(), Math.min(1, dt * 4));
    winFlash = Math.max(0, winFlash - dt * .15);
    draw(t, dt);
  });

  function rr(x, y, w, h, r, fill, stroke, lw = 1) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); } }
  function fit(s, w, size = 12, weight = 400, mono = false) { ctx.font = `${weight} ${size}px ${mono ? '"Geist Mono", ui-monospace, monospace' : 'Geist, system-ui, sans-serif'}`; if (ctx.measureText(s).width <= w) return s; while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
  function unit(x, y, s, fill = B.black) { rr(x - s / 2, y - s * .38, s, s * .76, s * .2, fill); ctx.fillStyle = B.orange; ctx.fillRect(x + s * .28, y - s * .2, s * .08, s * .4); }
  function checklist(x, y, w, rowH = 18) {
    checks().forEach(([l, ok], i) => {
      ctx.fillStyle = ok ? B.orange : B.warm2; ctx.beginPath(); ctx.arc(x + 6, y + i * rowH - 4, 6, 0, 7); ctx.fill();
      if (ok) k.text('✓', x + 6, y + i * rowH, {align: 'center', size: 9, weight: 700});
      k.text(fit(l, w - 20), x + 18, y + i * rowH, {size: 12, color: ok ? B.black : B.cool2, weight: ok ? 600 : 400});
    });
  }

  function draw(t, dt) {
    k.clear(B.warm1);
    const L = level(), px = k.w - RP, lw = k.w - RP - 32;
    // header: goal + latest event
    k.text(fit('Goal: $100M ARR within 10 months of the first deployment. Bonus: match the post’s mix.', lw, 15, 600), 18, 28, {size: 15, weight: 600});
    ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(22, 44, 3, 0, 7); ctx.fill();
    k.text(fit(log[log.length - 1] || '', lw - 12), 30, 48, {size: 12, color: B.black});

    // tiles
    TILES.forEach((T, i) => {
      const r = rects[i], sx = Math.sin(t * 60) * fx[i].shake * 4, locked = T.req && L < T.req, full = used(i) >= T.slots;
      const target = drag && hoverTile === i, ok = target && !why(i);
      const x = r.x + sx, y = r.y;
      rr(x, y, r.w, r.h, 12, locked ? B.warm1 : B.white, ok ? B.orange : target ? B.cool2 : fx[i].flash > 0 ? `rgba(255,126,0,${fx[i].flash})` : B.warm2, ok || fx[i].flash > .1 ? 2 : 1);
      if (!drag && hoverTile === i && !locked && !full) rr(x, y, r.w, r.h, 12, null, B.cool1, 1);
      const pad = 12, cw = r.w - pad * 2;
      k.label(T.caseTile ? 'Case · post' : T.kind === 'mob' ? 'Mobility' : 'Manipulation', x + pad, y + 18, {color: T.caseTile ? B.orange2 : B.cool2, size: 9});
      k.label(locked ? `Needs brain L${T.req}` : `$${T.arr}M/cust`, x + r.w - pad, y + 18, {align: 'right', size: 9, color: locked ? B.black : B.cool3});
      k.text(fit(T.name, cw, 13, 600), x + pad, y + 36, {size: 13, weight: 600, color: locked ? B.cool2 : B.black});
      const setupTxt = `Setup ${(T.setup / L).toFixed(1)} mo`;
      if (T.caseTile) k.text(fit(T.sub, cw, 11), x + pad, y + 53, {size: 11, color: B.cool3});
      else { k.text(setupTxt, x + pad, y + 54, {size: 10, mono: true, color: B.cool3}); if (r.w > 150) k.label(`${liveN(i)}/${T.slots} live`, x + r.w - pad, y + 54, {align: 'right', size: 9, color: liveN(i) ? B.orange2 : B.cool2}); }
      const ss = Math.min(16, (cw - (T.slots - 1) * 4) / T.slots), deps = m.deps.filter(d => d.ti === i), sly = y + r.h - pad - ss;
      for (let s = 0; s < T.slots; s++) {
        const d = deps[s], X = x + pad + s * (ss + 4);
        rr(X, sly, ss, ss, 4, d?.live ? B.orange : B.warm1, d ? (d.live ? B.orange : B.cool2) : B.warm3, 1);
        if (d && !d.live) { ctx.fillStyle = B.cool1; ctx.fillRect(X + 1, sly + ss - 1 - (ss - 2) * d.prog, ss - 2, (ss - 2) * d.prog); }
      }
      if (T.caseTile) k.text(fit(deps[0] ? (deps[0].live ? 'Live · earning' : `Setting up · ${Math.round(deps[0].prog * 100)}%`) : setupTxt, cw - ss - 8, 10, 400, true), x + pad + ss + 8, sly + ss - 3, {size: 10, mono: true, color: deps[0]?.live ? B.orange2 : B.cool3});
    });

    // right panel (content above k.h - VID)
    const lim = k.h - VID;
    ctx.fillStyle = B.white; ctx.fillRect(px, 0, RP, k.h); ctx.fillStyle = B.warm2; ctx.fillRect(px, 0, 1, k.h);
    const x0 = px + 20, w0 = RP - 40;
    k.label('ARR · simulated', x0, 26);
    k.text(money(shownArr), x0, 62, {mono: true, size: 34, weight: 600, color: won ? B.orange2 : B.black});
    k.meter(x0, 80, w0, shownArr / GOAL); k.label(won ? `Goal reached · month ${winMonth.toFixed(1)}` : `${Math.min(100, Math.round(shownArr))}% of $100M`, x0 + w0, 98, {align: 'right', size: 9, color: won ? B.orange2 : B.cool2});
    const cols = [x0, x0 + 104, x0 + 196], live = liveAll();
    k.label('Customers', cols[0], 120); k.text(`${live}`, cols[0], 144, {mono: true, size: 20, weight: 600, color: live >= CUST_GOAL ? B.orange2 : B.black}); k.label(`/ ${CUST_GOAL}+ · ${m.deps.length} signed`, cols[0] + 32, 144, {size: 8});
    k.label('Month', cols[1], 120); k.text(`${m.t.toFixed(1)}`, cols[1], 144, {mono: true, size: 20, weight: 600}); k.label('/ 10', cols[1] + 46, 144, {size: 8});
    k.label('Recognized', cols[2], 120); k.text(money(m.rec), cols[2], 144, {mono: true, size: 16, weight: 600}); k.label('post: $50M', cols[2], 158, {size: 8, color: B.orange2});
    // brain
    const bcx = x0 + 24, bcy = 190, br = 20;
    ctx.fillStyle = B.black; ctx.beginPath(); ctx.arc(bcx, bcy, br, 0, 7); ctx.fill();
    ctx.strokeStyle = B.warm2; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(bcx, bcy, br + 6, 0, 7); ctx.stroke();
    ctx.strokeStyle = B.orange; ctx.beginPath(); ctx.arc(bcx, bcy, br + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ((shownLevel - 1) / 4)); ctx.stroke();
    const pulse = .5 + .5 * Math.sin(t * 3);
    ctx.fillStyle = `rgba(255,126,0,${.25 + .25 * pulse})`; ctx.beginPath(); ctx.arc(bcx, bcy, br * .55, 0, 7); ctx.fill();
    k.text(`L${shownLevel.toFixed(1)}`, bcx, bcy + 4, {align: 'center', mono: true, size: 12, weight: 600, color: B.white});
    k.label('Shared brain · one base model', bcx + 38, bcy - 12);
    k.text(`Setup time ÷${L.toFixed(1)} everywhere`, bcx + 38, bcy + 6, {size: 13, weight: 600});
    k.text(`data ${m.data.toFixed(0)} · from every live deployment`, bcx + 38, bcy + 22, {size: 11, color: B.cool2});
    // data particles (tile → brain)
    parts.forEach(q => q.t += dt / q.d); parts = parts.filter(q => q.t < 1);
    parts.forEach(q => { const e = q.t * q.t, mx = (q.x + bcx) / 2, my = Math.min(q.y, bcy) - 40 + q.bend; const x = (1 - e) ** 2 * q.x + 2 * (1 - e) * e * mx + e * e * bcx, y = (1 - e) ** 2 * q.y + 2 * (1 - e) * e * my + e * e * bcy; ctx.fillStyle = `rgba(255,126,0,${.9 - q.t * .5})`; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); });
    // revenue mix vs the post
    const my0 = 234, ms = mobShare();
    k.label('Revenue mix · yours vs post', x0, my0);
    rr(x0, my0 + 8, w0, 12, 6, B.warm2);
    if (m.arr > 0) { ctx.save(); ctx.beginPath(); ctx.roundRect(x0, my0 + 8, w0, 12, 6); ctx.clip(); ctx.fillStyle = B.cool1; ctx.fillRect(x0, my0 + 8, w0 * ms, 12); ctx.fillStyle = B.black; ctx.fillRect(x0 + w0 * ms, my0 + 8, w0 * (1 - ms), 12); ctx.restore(); }
    ctx.fillStyle = B.orange; ctx.fillRect(x0 + w0 * .1 - 1, my0 + 3, 2, 22); ctx.fillStyle = B.orange2; ctx.fillRect(x0 + w0 * .04 - 1, my0 + 5, 1, 18);
    k.text(fit(m.arr > 0 ? `Mobility ${Math.round(ms * 100)}% · Manipulation ${Math.round((1 - ms) * 100)}% · post: 10% (AMR 4%) · ~90%` : 'No revenue yet · post: mobility 10% (AMR 4%) · manipulation ~90%', w0, 11), x0, my0 + 38, {size: 11, color: B.ink});
    let y = my0 + 66;
    if (y + 72 < lim) { k.label(`Report card${bestStars != null ? ` · best ${bestStars}/4` : ''}`, x0, y); checklist(x0, y + 20, w0); y += 20 + 4 * 18 + 10; }
    if (y + 56 < lim) { ctx.fillStyle = B.warm2; ctx.fillRect(x0, y, w0, 1); log.slice(-3).forEach((l, i, a) => k.text(fit(l, w0), x0, y + 18 + i * 17, {size: 12, color: i === a.length - 1 ? B.black : B.cool2})); }

    // unit tray
    const tr = L0.tray;
    rr(tr.x, tr.y, tr.w, tr.h, 12, B.white, drag ? B.orange : B.warm2, drag ? 2 : 1);
    k.label('Robot units · drag out', tr.x + 12, tr.y + 18);
    const ready = Math.floor(m.pool), ucols = 6, s = 20;
    for (let i = 0; i < Math.min(12, ready); i++) unit(tr.x + 22 + (i % ucols) * 28, tr.y + 38 + Math.floor(i / ucols) * 24, s, drag && i === ready - 1 ? B.cool1 : B.black);
    if (!ready) k.text('Next unit arriving…', tr.x + 12, tr.y + 44, {size: 12, color: B.cool2});
    const frac = m.pool - ready;
    k.text(`${ready} ready${ready > 12 ? ` (+${ready - 12})` : ''}`, tr.x + 12, tr.y + tr.h - 12, {mono: true, size: 12, weight: 600});
    k.meter(tr.x + 100, tr.y + tr.h - 18, tr.w - 112, frac); k.label(`+${P.poolRate} / month`, tr.x + tr.w - 12, tr.y + tr.h - 26, {align: 'right', size: 8});

    // timeline + ARR curve
    const tl = L0.tl, gx = tl.x + 12, gw = tl.w - 24, gy = tl.y + 22, gh = tl.h - 62, ymax = Math.max(120, ...m.hist.map(h => h.arr));
    rr(tl.x, tl.y, tl.w, tl.h, 12, B.white, B.warm2);
    k.label('ARR over time · simulated · click ahead to fast-forward', tl.x + 12, tl.y + 16);
    const gyv = v => gy + gh - v / ymax * gh;
    ctx.strokeStyle = B.warm3; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, gyv(GOAL)); ctx.lineTo(gx + gw, gyv(GOAL)); ctx.stroke(); ctx.setLineDash([]);
    k.label('$100M', gx + gw, gyv(GOAL) - 4, {align: 'right', size: 9, color: B.black});
    ctx.strokeStyle = B.orange; ctx.lineWidth = 2; ctx.beginPath();
    m.hist.forEach((h, i) => { const X = gx + h.t / MONTHS * gw, Y = gyv(h.arr); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
    ctx.lineTo(gx + m.t / MONTHS * gw, gyv(m.arr)); ctx.stroke();
    const sy2 = tl.y + tl.h - 22;
    ctx.fillStyle = B.warm2; ctx.fillRect(gx, sy2, gw, 4); ctx.fillStyle = B.black; ctx.fillRect(gx, sy2, gw * m.t / MONTHS, 4);
    for (let i = 0; i <= MONTHS; i++) { const X = gx + i / MONTHS * gw; ctx.fillStyle = B.cool1; ctx.fillRect(X - .5, sy2 - 4, 1, 12); k.label(`M${i}`, X, sy2 + 18, {align: 'center', size: 8, color: i <= m.t ? B.black : B.cool2}); }
    if (ffTo != null) { const X = gx + ffTo / MONTHS * gw; ctx.strokeStyle = B.orange; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X, sy2 - 8); ctx.lineTo(X, sy2 + 10); ctx.stroke(); ctx.setLineDash([]); }
    const hx = gx + gw * m.t / MONTHS;
    ctx.fillStyle = B.orange; ctx.beginPath(); ctx.arc(hx, sy2 + 2, 7, 0, 7); ctx.fill(); ctx.fillStyle = B.white; ctx.beginPath(); ctx.arc(hx, sy2 + 2, 3, 0, 7); ctx.fill();
    if (!playing && ffTo == null && m.t < MONTHS) { const msg = fit(m.t === 0 ? 'Paused · press Play, or click ahead on the timeline' : 'Paused · press Play', gw - 20, 12, 600); rr(gx + gw / 2 - ctx.measureText(msg).width / 2 - 10, gy + gh / 2 - 14, ctx.measureText(msg).width + 20, 22, 11, B.black); k.text(msg, gx + gw / 2, gy + gh / 2 + 1, {align: 'center', size: 12, weight: 600, color: B.white}); }

    // drag ghost
    if (drag) { ctx.globalAlpha = .9; unit(drag.x, drag.y, 26); ctx.globalAlpha = 1; if (hoverTile >= 0) { const r = why(hoverTile); k.text(r ? fit(r, 260) : `Deploy to ${TILES[hoverTile].name}`, drag.x + 18, drag.y - 16, {size: 12, weight: 600, color: r ? B.cool3 : B.orange2}); } }

    // result card: goal hit (fades) or month 10 (stays) — always inside the tile area, left of the video corner
    if (winFlash > 0 || ended) {
      const bw = Math.min(460, k.w - RP - 60), bh = ended ? 168 : 96, bx = (k.w - RP) / 2 - bw / 2, by = rects[4].y + rects[4].h / 2 - bh / 2;
      ctx.globalAlpha = ended ? 1 : Math.min(1, winFlash * 3);
      rr(bx, by, bw, bh, 14, 'rgba(255,255,255,.97)', won ? B.orange : B.warm3, won ? 2 : 1.5);
      const stars = checks().filter(x => x[1]).length;
      k.label(ended ? `Month 10 · report card ${stars}/4 · simulated` : 'Simulated · goal reached', bx + 20, by + 26, {color: won ? B.orange2 : B.cool2});
      k.text(won ? `$100M ARR at month ${winMonth.toFixed(1)}` : `${money(m.arr)} ARR. Not yet $100M.`, bx + 20, by + 52, {size: 19, weight: 600});
      if (ended) checklist(bx + 20, by + 82, bw - 40, 19);
      else k.text(fit('Every deployment fed the brain, and the brain made the next one faster.', bw - 40), bx + 20, by + 76, {size: 12, color: B.cool3});
      ctx.globalAlpha = 1;
    }
  }

  function togglePlay() {
    if (m.t >= MONTHS) { say('The 10 months are over. Restart to try again.'); return; }
    playing = !playing; bPlay.textContent = playing ? 'Pause ❚❚' : 'Play ▶';
    if (playing && !m.deps.length) say('Tip: deploy a few units first. Nothing earns until it is live.');
  }
  let bPlay = null;
  reset();
  bPlay = k.button('Play ▶', togglePlay, {primary: true});
  const bSpeed = k.button('Speed 1×', () => { speed = speed === 1 ? 2 : 1; bSpeed.textContent = `Speed ${speed}×`; bSpeed.classList.toggle('on', speed === 2); });
  k.button('Restart', () => { reset(); });
  return () => k.destroy();
}
