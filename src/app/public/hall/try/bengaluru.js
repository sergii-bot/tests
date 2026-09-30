// TRY · Bengaluru — "Around the clock": hand one training run between Skild's teams so it follows the working day around the world.
// Post (Feb 2026): first office outside the US, in Bengaluru, joining established teams in California and Pennsylvania,
// one tightly integrated engineering org across West Coast, East Coast and India. The hand-off game is a stylized take.
import {kit, B, lerp, clamp, rand} from './kit.js';

const OFFICES = [
  {name: 'Pennsylvania', region: 'US East Coast team', tz: 'ET', off: -5, lon: -80.0, lat: 40.4, key: '1'},
  {name: 'California', region: 'US West Coast team', tz: 'PT', off: -8, lon: -122.2, lat: 37.6, key: '2'},
  {name: 'Bengaluru', region: 'India · first office outside the US', tz: 'IST', off: 5.5, lon: 77.6, lat: 13.0, key: '3'},
];
// Workstreams the post names for the teams (each shift picks one up in this game).
const WORK = ['perception & control policies', 'evaluation & deployment infra', 'large-scale data pipelines', 'feedback loops from deployments', 'in-context learning research'];
const START = 8, END = 20, DAY_S = 60, LAT0 = 78, LAT1 = -56, DECL = 10 * Math.PI / 180; // stylized 08–20 local shifts, standard time
const LAND = [
  [[-168,66],[-162,70],[-150,71],[-128,70],[-110,73],[-95,72],[-82,73],[-78,66],[-64,60],[-56,52],[-66,45],[-70,42],[-76,38],[-76,35],[-81,31],[-80,26],[-82,27],[-85,30],[-90,29],[-97,27],[-97,21],[-91,19],[-87,21],[-88,16],[-83,10],[-79,8],[-83,8],[-92,14],[-100,17],[-106,23],[-112,30],[-115,32],[-118,34],[-121,36],[-124,40],[-124,46],[-127,50],[-133,55],[-140,59],[-150,60],[-158,57],[-165,55],[-160,60],[-166,62]],
  [[-73,78],[-60,82],[-30,83],[-20,76],[-22,70],[-40,65],[-44,60],[-50,62],[-54,67],[-58,75]],
  [[-24,64],[-22,66],[-15,66.5],[-13,65],[-18,63.5]],
  [[-80,9],[-75,11],[-72,12],[-62,11],[-52,5],[-50,0],[-44,-2],[-35,-6],[-37,-12],[-39,-18],[-41,-22],[-48,-26],[-53,-34],[-58,-38],[-62,-40],[-65,-45],[-68,-50],[-69,-55],[-74,-52],[-73,-44],[-72,-35],[-71,-28],[-70,-18],[-76,-14],[-81,-6],[-80,-1],[-78,3]],
  [[-9,37],[-9,43],[-1,44],[-2,47],[-4,48],[2,51],[5,53],[8,54],[8,57],[10,59],[5,59],[5,62],[12,66],[18,70],[26,71],[32,70],[40,67],[44,68],[44,46],[40,44],[30,46],[28,41],[26,40],[23,36],[20,40],[16,38],[12,41],[10,44],[6,43],[3,43],[0,39],[-5,36]],
  [[-5,50],[1,51],[2,53],[-1,55],[-2,57],[-4,58.5],[-6,57],[-5,55],[-3,54],[-4,52]],
  [[-10,52],[-6,52],[-6,55],[-8,55],[-10,54]],
  [[-17,21],[-16,28],[-10,31],[-6,35],[10,37],[11,33],[20,31],[32,31],[35,28],[39,20],[43,12],[51,12],[48,5],[42,-1],[40,-10],[40,-16],[35,-24],[32,-29],[27,-34],[20,-35],[18,-32],[15,-27],[12,-18],[13,-10],[9,-1],[9,4],[5,6],[-2,5],[-8,4],[-13,8],[-17,13]],
  [[44,-25],[47,-25],[50,-16],[49,-12],[44,-16]],
  [[26,40],[36,36],[36,33],[35,30],[39,22],[43,13],[45,13],[52,16],[56,18],[59,22],[56,25],[52,24],[50,27],[48,30],[53,27],[57,26],[62,25],[67,25],[70,21],[73,17],[75,12],[77,8],[80,10],[80,15],[85,20],[89,22],[92,22],[94,17],[98,16],[98,8],[100,6],[103,1.5],[104,3],[101,7],[103,11],[106,9],[109,12],[108,17],[106,20],[110,21],[117,23],[121,28],[122,31],[120,35],[122,37],[119,39],[122,40],[126,38],[126,35],[129,35],[129,40],[131,43],[138,46],[141,52],[137,54],[141,59],[150,59],[156,57],[163,60],[160,62],[170,65],[180,66],[180,70],[160,70],[140,72],[113,74],[105,78],[90,76],[80,73],[70,73],[66,70],[60,69],[44,68],[40,67],[44,46],[40,44],[36,41],[29,41]],
  [[130,31],[132,34],[136,35],[140,36],[141,39],[142,42],[141,45],[139,42],[137,37],[133,35],[130,33]],
  [[109,1],[110,-2],[114,-4],[117,-1],[119,1],[117,7],[113,4]],
  [[95,5],[98,4],[104,-2],[106,-6],[102,-4],[98,0]],
  [[131,-1],[141,-3],[148,-6],[150,-10],[143,-9],[138,-8],[134,-4]],
  [[114,-22],[114,-26],[115,-34],[118,-35],[124,-33],[131,-31],[135,-34],[138,-35],[140,-38],[146,-39],[150,-37],[153,-31],[153,-25],[149,-21],[146,-19],[145,-15],[142,-11],[141,-17],[136,-12],[132,-11],[129,-15],[125,-14],[122,-18],[118,-20]],
  [[172,-34],[178,-38],[176,-41],[172,-44],[167,-46],[171,-41],[174,-39]],
];
const inPoly = (x, y, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const DOTS = [];
for (let lat = LAT0 - 1.25; lat > LAT1; lat -= 2.5) for (let lon = -178.75; lon < 180; lon += 2.5) if (LAND.some(p => inPoly(lon, lat, p))) DOTS.push({lon, lat, s: Math.sin(lat * Math.PI / 180), c: Math.cos(lat * Math.PI / 180)});

const localH = (o, utc) => ((utc + o.off) % 24 + 24) % 24;
const working = (o, utc) => { const h = localH(o, utc); return h >= START && h < END; };
const untilOpen = (o, utc) => working(o, utc) ? 0 : ((START - localH(o, utc)) % 24 + 24) % 24;
const hhmm = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

export default function mount(root, api) {
  const k = kit(root);
  const {ctx} = k;
  const clip = x => { try { api.clip?.(x); } catch (e) { /* optional */ } };
  const rec = (kind, d) => { try { api.record?.(kind, d); } catch (e) { /* optional */ } };
  let route = [], pops = [], sparks = [], streak = 0, bestStreak = 0, best = null, clipped = false, workI = 0;
  const fit = (s, w, size = 12, weight = 400) => { ctx.font = `${weight} ${size}px Geist, system-ui, sans-serif`; if (w <= 20 || ctx.measureText(s).width <= w) return s; while (s.length > 1 && ctx.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; };
  let utc, holder, stalled, running, ff, handoffs, drops, trained, baseline, elapsed, cleanStart, bins, flight, drag, reject, done, winT, log, received;
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); };
  const shiftId = i => Math.floor((10 + (elapsed || 0) + OFFICES[i].off - START) / 24); // which local working day it is
  const say = s => { log.push(s); if (log.length > 20) log.shift(); };
  let lastStatus = ''; const status = s => { if (s !== lastStatus) { lastStatus = s; api.status(s); } };
  function reset() {
    utc = 10; holder = 2; stalled = false; running = false; ff = false; handoffs = 0; drops = 0; trained = 0; baseline = 0; elapsed = 0; cleanStart = 0;
    bins = new Array(96).fill(0); received = new Set(['2:' + shiftId(2)]); flight = null; drag = null; reject = null; done = false; winT = 0;
    route = []; pops = []; sparks = []; streak = 0; workI = 0;
    log = ['The run starts in Bengaluru. Press Start, then hand it on before the shift ends.'];
    status('Ready · 10:00 UTC');
  }
  reset();

  function L() {
    const top = 62, colW = clamp(k.w * .27, 230, 290), colX = k.w - colW - 20, aw = colX - 40, ah = k.h - 252;
    const mw = Math.min(aw, ah * 360 / (LAT0 - LAT1)), mh = mw * (LAT0 - LAT1) / 360, mx = 20 + (aw - mw) / 2, my = top;
    const ch = 64, cards = OFFICES.map((o, i) => ({x: colX, y: top + i * (ch + 8), w: colW, h: ch}));
    return {top, colW, colX, mw, mh, mx, my, cards, tlX: 76, tlW: Math.max(160, Math.min(colX - 96, k.w - 360 - 76)), tlY: my + mh + 50};
  }
  const proj = (l, lon, lat) => [l.mx + (lon + 180) / 360 * l.mw, l.my + (LAT0 - lat) / (LAT0 - LAT1) * l.mh];
  const opos = (l, i) => proj(l, OFFICES[i].lon, OFFICES[i].lat);
  const arc = (l, a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]); const m = [(a[0] + b[0]) / 2, Math.max(l.my + 6, (a[1] + b[1]) / 2 - d * .28 - 14)]; return u => [lerp(lerp(a[0], m[0], u), lerp(m[0], b[0], u), u), lerp(lerp(a[1], m[1], u), lerp(m[1], b[1], u), u)]; };
  const tokenPos = l => flight ? arc(l, opos(l, flight.from), opos(l, flight.to))(1 - Math.pow(1 - flight.p, 3)) : opos(l, holder);

  function start() { if (!running) { running = true; startBtn.textContent = 'Pause'; say('Clock running. The day/night line sweeps west.'); if (!clipped) { clipped = true; clip(0); } } }
  function pop(i, text, strong) {
    const l = L(), [x, y] = opos(l, i); pops.push({x, y: y - 18, t: 0, text, strong});
    for (let j = 0; j < (strong ? 18 : 10); j++) { const a = rand(0, 6.28), v = rand(40, 110); sparks.push({x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0}); }
  }
  function handTo(i) {
    start();
    if (flight) return;
    const o = OFFICES[i];
    if (i === holder) { say(stalled ? `${o.name} is off-hours. Pick an office that is awake.` : `The run is already in ${o.name}.`); return; }
    if (!working(o, utc)) { reject = {i, t: 1}; say(`${o.name} is off-hours (${hhmm(localH(o, utc))} local). Opens in ${untilOpen(o, utc).toFixed(1)} h.`); return; }
    flight = {from: holder, to: i, p: 0};
    const left = END - localH(OFFICES[holder], utc), clutch = !stalled && working(OFFICES[holder], utc) && left < 1.5;
    if (route.length < 30) route.push({from: OFFICES[holder].name, to: o.name, utc: +utc.toFixed(2), stalled, clutch});
    if (stalled) { streak = 0; say(`Restarted in ${o.name}. The run sat idle for a while.`); pop(i, 'restart', false); }
    else if (received.has(i + ':' + shiftId(i))) say(`${o.name} already had the run this shift. It counts once per shift.`);
    else {
      handoffs++; streak++; bestStreak = Math.max(bestStreak, streak);
      const w = WORK[workI++ % WORK.length];
      say(`Handoff #${handoffs} ${OFFICES[holder].name} → ${o.name} · picks up ${w}`);
      pop(i, clutch ? 'Clutch handoff!' : `+1 handoff · streak ${streak}`, clutch);
    }
    received.add(i + ':' + shiftId(i));
    holder = i; stalled = false;
  }
  function officeAt(p) {
    const l = L(); const c = l.cards.findIndex(c => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
    if (c >= 0) return c;
    let best = -1, bd = 34; OFFICES.forEach((o, i) => { const [x, y] = opos(l, i); const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } }); return best;
  }
  k.onDown(p => {
    const l = L(), [tx, ty] = tokenPos(l);
    if (!flight && Math.hypot(p.x - tx, p.y - ty) < 20) { drag = {x: p.x, y: p.y}; start(); return; }
    const i = officeAt(p); if (i >= 0) handTo(i);
  });
  k.onMove(p => { if (drag) { drag.x = p.x; drag.y = p.y; } });
  k.onUp(p => { if (!drag) return; const i = officeAt(p); drag = null; if (i >= 0 && i !== holder) handTo(i); else if (i < 0) say('Drop the run on an office.'); });
  k.onKey(e => { const i = OFFICES.findIndex(o => o.key === e.key); if (i >= 0) handTo(i); if (e.key === 'f' || e.key === 'F') ffBtn.click(); });

  k.frame((dt, t) => {
    const l = L();
    if (reject) { reject.t -= dt * 1.5; if (reject.t <= 0) reject = null; }
    if (flight) { flight.p += dt * 1.6; if (flight.p >= 1) flight = null; }
    if (running && !done) {
      const dh = 24 / DAY_S * (ff ? 4 : 1) * dt;
      utc = (utc + dh) % 24; elapsed += dh;
      if (!stalled && working(OFFICES[holder], utc)) trained += dh;
      if (working(OFFICES[0], utc)) baseline += dh;
      if (!stalled && !flight && !working(OFFICES[holder], utc)) {
        stalled = true; drops++; cleanStart = elapsed; streak = 0;
        say(`Dropped: ${OFFICES[holder].name}'s shift ended with the run. Hand it to an office that is awake.`);
        status('Run stalled');
      }
      bins[Math.floor(utc * 4) % 96] = stalled ? -1 : holder + 1;
      if (!stalled) status(`${hhmm(Math.floor(utc))} UTC · run in ${OFFICES[holder].name}`);
      if ((elapsed - cleanStart >= 24 && handoffs >= 2) || handoffs >= 6) {
        done = true; winT = 0; if (ff) ffBtn.click();
        const prev = best; if (best == null || trained > best) best = trained;
        say(`${handoffs} handoffs, ${drops} dropped. ${trained.toFixed(1)} brain-hours vs ${baseline.toFixed(1)} for one team${prev != null && trained > prev ? ' · new best' : ''}.`);
        rec('bengaluru.run', {handoffs, drops, trainedH: +trained.toFixed(2), oneTeamH: +baseline.toFixed(2), elapsedH: +elapsed.toFixed(2), bestStreak, route});
        api.complete('Bengaluru · the run never sleeps'); api.status('Around the clock ✓');
      }
    }
    winT += dt;
    pops.forEach(p => p.t += dt); pops = pops.filter(p => p.t < 1.5);
    sparks.forEach(s => { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 1 - dt * 3; s.vy *= 1 - dt * 3; }); sparks = sparks.filter(s => s.t < .7);
    draw(t, l);
  });

  function draw(t, l) {
    k.clear(B.warm1);
    k.text('Goal: keep one training run going for a full 24 h. Hand it to an office that is awake before the shift ends.', 20, 30, {size: 14, weight: 600});
    k.label('Drag the orange run token (or click a team, keys 1–3) · shifts 08:00–20:00 local, stylized', 20, 48);
    // map panel
    ctx.save(); ctx.fillStyle = B.white; rr(l.mx, l.my, l.mw, l.mh, 12); ctx.fill(); ctx.clip();
    const sunLon = (12 - utc) * 15, sd = Math.sin(DECL), cd = Math.cos(DECL), rad = Math.PI / 180;
    ctx.fillStyle = 'rgba(27,34,43,.09)'; ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 3) { const lat = Math.atan(-Math.cos((lon - sunLon) * rad) / Math.tan(DECL)) / rad; const [x, y] = proj(l, lon, lat); lon === -180 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.lineTo(l.mx + l.mw, l.my + l.mh + 2); ctx.lineTo(l.mx, l.my + l.mh + 2); ctx.closePath(); ctx.fill();
    const r = Math.max(1.1, l.mw / 144 * .3);
    for (const d of DOTS) { const lit = d.s * sd + d.c * cd * Math.cos((d.lon - sunLon) * rad) > 0; const [x, y] = proj(l, d.lon, d.lat); ctx.fillStyle = lit ? B.warm3 : B.cool2; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
    const [sx] = proj(l, ((sunLon + 540) % 360) - 180, 0);
    ctx.strokeStyle = B.cool2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, l.my + 14, 6, 0, 7); ctx.stroke();
    for (let a = 0; a < 8; a++) { const q = a / 8 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(sx + Math.cos(q) * 9, l.my + 14 + Math.sin(q) * 9); ctx.lineTo(sx + Math.cos(q) * 12, l.my + 14 + Math.sin(q) * 12); ctx.stroke(); }
    // routes
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
      const path = arc(l, opos(l, i), opos(l, j)), live = (i === holder && working(OFFICES[j], utc)) || (j === holder && working(OFFICES[i], utc));
      ctx.strokeStyle = live ? 'rgba(255,126,0,.55)' : 'rgba(18,18,18,.12)'; ctx.lineWidth = live ? 1.5 : 1; ctx.setLineDash([4, 5]); ctx.beginPath();
      for (let u = 0; u <= 1.001; u += .04) { const [x, y] = path(u); u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); ctx.setLineDash([]);
    }
    // offices
    OFFICES.forEach((o, i) => {
      const [x, y] = opos(l, i), w = working(o, utc), h = i === holder;
      if (w) { ctx.fillStyle = 'rgba(255,126,0,.12)'; ctx.beginPath(); ctx.arc(x, y, 16 + Math.sin(t * 3 + i) * 2, 0, 7); ctx.fill(); }
      ctx.fillStyle = w ? B.black : B.white; ctx.strokeStyle = w ? B.black : B.cool2; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.stroke();
      if (reject?.i === i) { ctx.strokeStyle = `rgba(18,18,18,${reject.t})`; ctx.beginPath(); ctx.arc(x, y, 14 + (1 - reject.t) * 16, 0, 7); ctx.stroke(); }
      const right = i !== 1, lx = x + (right ? 12 : -12);
      k.text(o.name, lx, y - 8, {size: 12, weight: 600, align: right ? 'left' : 'right'});
      k.text(`${hhmm(localH(o, utc))} ${o.tz}`, lx, y + 20, {size: 10, mono: true, color: w ? B.black : B.cool2, align: right ? 'left' : 'right'});
    });
    ctx.restore();
    ctx.strokeStyle = B.warm2; ctx.lineWidth = 1; rr(l.mx, l.my, l.mw, l.mh, 12); ctx.stroke();
    // hint under the map
    const ho = OFFICES[holder], others = OFFICES.map((o, i) => i).filter(i => i !== holder);
    const awake = others.filter(i => working(OFFICES[i], utc)), hy = l.my + l.mh + 24;
    let hint;
    if (done) hint = 'The run never slept. Three time zones, one integrated team.';
    else if (stalled) hint = awake.length ? `Stalled. ${awake.map(i => OFFICES[i].name).join(' and ')} ${awake.length > 1 ? 'are' : 'is'} awake: hand it over.` : `Stalled. Next office opens in ${Math.min(...others.map(i => untilOpen(OFFICES[i], utc))).toFixed(1)} h.`;
    else { const left = END - localH(ho, utc); hint = awake.length ? `${ho.name} shift ends in ${left.toFixed(1)} h · ${awake.map(i => OFFICES[i].name).join(' and ')} ${awake.length > 1 ? 'are' : 'is'} awake` : `${ho.name} shift ends in ${left.toFixed(1)} h · next office opens in ${Math.min(...others.map(i => untilOpen(OFFICES[i], utc))).toFixed(1)} h`; }
    const urgent = !done && !stalled && END - localH(ho, utc) < 1.5 && awake.length;
    k.text(fit(hint, k.w - 380, 13, urgent || stalled ? 600 : 400), 20, hy, {size: 13, weight: urgent || stalled ? 600 : 400, color: urgent ? B.orange2 : B.black});

    // timeline (UTC)
    const {tlX, tlW, tlY} = l, x = h => tlX + h / 24 * tlW;
    k.label('24 h · UTC', 20, tlY - 12);
    [0, 6, 12, 18, 24].forEach(h => k.label(String(h).padStart(2, '0'), x(h), tlY - 12, {align: 'center', size: 9}));
    OFFICES.forEach((o, i) => {
      const y = tlY + i * 16; k.label(o.tz, 20, y + 9, {size: 9});
      ctx.fillStyle = B.warm2; rr(tlX, y, tlW, 10, 3); ctx.fill();
      const s0 = ((START - o.off) % 24 + 24) % 24; ctx.fillStyle = working(o, utc) ? B.cool3 : B.cool1;
      for (const [a, b] of s0 + 12 <= 24 ? [[s0, s0 + 12]] : [[s0, 24], [0, s0 - 12]]) { rr(x(a), y, x(b) - x(a), 10, 3); ctx.fill(); }
    });
    const ry = tlY + 3 * 16 + 2; k.label('Run', 20, ry + 9, {size: 9});
    ctx.fillStyle = B.warm2; rr(tlX, ry, tlW, 10, 3); ctx.fill();
    bins.forEach((v, i) => { if (!v) return; ctx.fillStyle = v < 0 ? B.cool2 : B.orange; ctx.fillRect(x(i / 4), ry, tlW / 96 + .5, 10); });
    ctx.fillStyle = B.black; ctx.fillRect(x(utc) - .75, tlY - 4, 1.5, 3 * 16 + 18);
    log.slice(-2).forEach((s, i, a) => k.text(fit(s, k.w - 380), 20, ry + 34 + i * 17, {size: 12, color: i === a.length - 1 ? B.black : B.cool2}));

    // office cards
    OFFICES.forEach((o, i) => {
      const c = l.cards[i], w = working(o, utc), h = i === holder, lh = localH(o, utc);
      ctx.fillStyle = B.white; rr(c.x, c.y, c.w, c.h, 12); ctx.fill();
      ctx.strokeStyle = h && !stalled ? B.orange : B.warm2; ctx.lineWidth = h && !stalled ? 2 : 1; ctx.stroke();
      k.text(o.name, c.x + 14, c.y + 21, {size: 14, weight: 600});
      k.label(o.region, c.x + 14, c.y + 35, {size: 9});
      k.text(hhmm(lh), c.x + c.w - 14, c.y + 24, {align: 'right', mono: true, size: 18, weight: 600, color: w ? B.black : B.cool2});
      k.label(w ? (h ? (stalled ? 'working' : 'training · holds the run') : 'working · can take it') : `off-hours · opens in ${untilOpen(o, utc).toFixed(1)} h`, c.x + 14, c.y + c.h - 12, {size: 9, color: h && !stalled ? B.orange2 : w ? B.black : B.cool2});
      ctx.fillStyle = B.warm2; rr(c.x + 14, c.y + 42, c.w - 28, 4, 2); ctx.fill();
      if (w) { ctx.fillStyle = h && !stalled ? B.orange : B.cool3; rr(c.x + 14, c.y + 42, (c.w - 28) * (lh - START) / (END - START), 4, 2); ctx.fill(); }
    });
    // score box: over the South Pacific, inside the map (stays clear of the corner clip)
    const sbw = Math.min(176, l.mw * .3), sbh = 66, sbx = l.mx + 10, sby = l.my + l.mh - sbh - 10, mult = baseline > .5 ? trained / baseline : 0;
    ctx.fillStyle = 'rgba(255,255,255,.94)'; rr(sbx, sby, sbw, sbh, 10); ctx.fill(); ctx.strokeStyle = B.warm2; ctx.lineWidth = 1; ctx.stroke();
    k.label('Brain-hours · simulated', sbx + 10, sby + 15, {size: 9});
    k.text(trained.toFixed(1), sbx + 10, sby + 40, {size: 22, mono: true, weight: 600, color: B.orange2});
    k.text(`vs ${baseline.toFixed(1)}`, sbx + 10 + ctx.measureText(trained.toFixed(1)).width + 8, sby + 40, {size: 12, mono: true, color: B.cool3});
    k.label(fit(`${mult ? '×' + mult.toFixed(2) + ' vs 1 team · ' : ''}${handoffs} hand · ${drops} drop${best != null ? ' · best ' + best.toFixed(1) : ''}`, sbw - 20, 9), sbx + 10, sby + 56, {size: 9});
    // work queue: what the teams picked up
    const wy = l.cards[2].y + l.cards[2].h + 22;
    if (wy + 40 < k.h - 236) {
      k.label('Workstreams picked up', l.colX, wy);
      WORK.slice(0, Math.min(WORK.length, Math.floor((k.h - 236 - wy - 6) / 16))).forEach((w, i) => { const got = i < workI; k.text(fit(`${got ? '✓' : '·'} ${w}`, l.colW, 12), l.colX, wy + 18 + i * 16, {size: 12, color: got ? B.black : B.cool2, weight: got ? 600 : 400}); });
    }
    if (done) {
      const a = clamp(winT * 3, 0, 1), w = Math.min(360, l.mw - 40), bx = l.mx + l.mw / 2 - w / 2, by = l.my + l.mh - 70;
      ctx.globalAlpha = a; ctx.fillStyle = B.white; rr(bx, by, w, 54, 12); ctx.fill(); ctx.strokeStyle = B.orange; ctx.lineWidth = 2; ctx.stroke();
      k.text('Around the clock', bx + w / 2, by + 22, {align: 'center', size: 15, weight: 700});
      k.label(`Pennsylvania · California · Bengaluru · ${handoffs} handoffs`, bx + w / 2, by + 40, {align: 'center'});
      ctx.globalAlpha = 1;
    }
    if (drag) { const a = opos(l, holder), b = [drag.x, drag.y], path = arc(l, a, b); ctx.strokeStyle = B.orange; ctx.lineWidth = 2.5; ctx.beginPath(); for (let u = 0; u <= 1.001; u += .04) { const [x, y] = path(u); u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); }
    // token
    const [tx, ty] = drag ? [drag.x, drag.y] : tokenPos(l);
    ctx.fillStyle = stalled ? B.cool1 : B.orange; ctx.beginPath(); ctx.arc(tx, ty, 11, 0, 7); ctx.fill();
    if (!stalled) { ctx.strokeStyle = B.black; ctx.lineWidth = 2; ctx.beginPath(); const a = running ? t * 4 : 0; ctx.arc(tx, ty, 15, a, a + 2.2); ctx.stroke(); }
    k.text(stalled ? '||' : 'RUN', tx, ty + 3, {align: 'center', mono: true, size: 7, weight: 700});
    for (const s2 of sparks) { ctx.fillStyle = `rgba(255,126,0,${1 - s2.t / .7})`; ctx.beginPath(); ctx.arc(s2.x, s2.y, 2.2, 0, 7); ctx.fill(); }
    for (const p of pops) { ctx.globalAlpha = clamp(1.5 - p.t, 0, 1); k.text(p.text, p.x, p.y - p.t * 24, {align: 'center', size: p.strong ? 14 : 12, weight: 700, color: p.strong ? B.orange2 : B.black}); ctx.globalAlpha = 1; }
  }

  const startBtn = k.button('Start', () => { if (running) { running = false; startBtn.textContent = 'Resume'; say('Paused.'); } else start(); }, {primary: true});
  const ffBtn = k.toggle('Fast-forward 4×', false, v => { ff = v; });
  k.button('Reset', () => { const wasFF = ff; reset(); startBtn.textContent = 'Start'; if (wasFF) ffBtn.click(); });
  return () => k.destroy();
}
