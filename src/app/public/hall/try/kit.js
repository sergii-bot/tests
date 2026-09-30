// Shared kit for TRY stands. Each stand module does:
//   export default function mount(root, api) { const k = kit(root); ...; return () => k.destroy(); }
// api = {release, brand, complete(text), status(text)}
// complete() marks the stand as done (it lights up in the hall). Call it when the visitor "gets it".
import {BRAND} from '../releases.js';
export const B = BRAND;

export function kit(root, {controls = true} = {}) {
  root.classList.add('try-kit');
  const wrap = document.createElement('div'); wrap.className = 'try-canvas';
  const canvas = document.createElement('canvas'); wrap.append(canvas);
  const bar = document.createElement('div'); bar.className = 'try-controls';
  root.append(wrap); if (controls) root.append(bar);
  const ctx = canvas.getContext('2d');
  // guard: a negative radius throws in canvas and would kill the stand's frame loop
  { const arc = ctx.arc.bind(ctx), ell = ctx.ellipse.bind(ctx); ctx.arc = (x, y, r, a0, a1, ccw) => arc(x, y, Math.max(0, r || 0), a0, a1, ccw); ctx.ellipse = (x, y, rx, ry, ro, a0, a1, ccw) => ell(x, y, Math.max(0, rx || 0), Math.max(0, ry || 0), ro, a0, a1, ccw); }
  const s = {canvas, ctx, w: 0, h: 0, dpr: 1, t: 0, dt: 0, pointer: {x: 0, y: 0, down: false}, bar};
  let frameFns = [], raf = 0, last = performance.now(), dead = false;
  const listeners = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); listeners.push(() => el.removeEventListener(ev, fn, o)); };

  function resize() {
    const r = wrap.getBoundingClientRect();
    s.dpr = Math.min(2, devicePixelRatio || 1); s.w = Math.max(10, r.width); s.h = Math.max(10, r.height);
    canvas.width = Math.round(s.w * s.dpr); canvas.height = Math.round(s.h * s.dpr);
    canvas.style.width = s.w + 'px'; canvas.style.height = s.h + 'px';
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  }
  const ro = new ResizeObserver(resize); ro.observe(wrap); resize();

  function loop(now) {
    if (dead) return;
    s.dt = Math.min(0.05, (now - last) / 1000); last = now; s.t += s.dt;
    ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    for (const fn of frameFns) fn(s.dt, s.t);
    raf = requestAnimationFrame(loop);
  }
  raf = requestAnimationFrame(loop);

  const pos = e => { const r = canvas.getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; };
  const handlers = {down: [], move: [], up: []};
  on(canvas, 'pointerdown', e => { canvas.setPointerCapture(e.pointerId); Object.assign(s.pointer, pos(e), {down: true}); handlers.down.forEach(f => f(s.pointer, e)); });
  on(canvas, 'pointermove', e => { Object.assign(s.pointer, pos(e)); handlers.move.forEach(f => f(s.pointer, e)); });
  on(canvas, 'pointerup', e => { Object.assign(s.pointer, pos(e), {down: false}); handlers.up.forEach(f => f(s.pointer, e)); });

  Object.assign(s, {
    frame(fn) { frameFns.push(fn); },
    onDown(fn) { handlers.down.push(fn); }, onMove(fn) { handlers.move.push(fn); }, onUp(fn) { handlers.up.push(fn); },
    onKey(fn) { on(window, 'keydown', fn); },
    clear(color = B.warm1) { ctx.fillStyle = color; ctx.fillRect(0, 0, s.w, s.h); },
    grid(step = 32, color = 'rgba(18,18,18,.06)') { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); for (let x = 0; x < s.w; x += step) { ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, s.h); } for (let y = 0; y < s.h; y += step) { ctx.moveTo(0, y + .5); ctx.lineTo(s.w, y + .5); } ctx.stroke(); },
    text(str, x, y, {size = 13, color = B.black, align = 'left', mono = false, weight = 500, base = 'alphabetic'} = {}) { ctx.font = `${weight} ${size}px ${mono ? '"Geist Mono", ui-monospace, monospace' : 'Geist, system-ui, sans-serif'}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(str, x, y); },
    label(str, x, y, o = {}) { s.text(String(str).toUpperCase(), x, y, {size: 10, mono: true, color: B.cool2, weight: 500, ...o}); },
    button(label, fn, {primary = false} = {}) { const b = document.createElement('button'); b.className = 'try-btn' + (primary ? ' primary' : ''); b.textContent = label; b.onclick = fn; bar.append(b); return b; },
    slider(label, min, max, value, fn, step = 1) { const l = document.createElement('label'); l.className = 'try-slider'; const span = document.createElement('span'); const i = document.createElement('input'); Object.assign(i, {type: 'range', min, max, step, value}); const out = document.createElement('b'); const upd = () => { out.textContent = i.value; fn(Number(i.value)); }; i.oninput = upd; span.textContent = label; l.append(span, i, out); bar.append(l); out.textContent = value; return i; },
    toggle(label, value, fn) { const b = s.button(label + (value ? ' · ON' : ' · OFF'), () => { value = !value; b.textContent = label + (value ? ' · ON' : ' · OFF'); b.classList.toggle('on', value); fn(value); }); b.classList.toggle('on', value); return b; },
    meter(x, y, w, v, label) { ctx.fillStyle = B.warm2; ctx.fillRect(x, y, w, 6); ctx.fillStyle = B.orange; ctx.fillRect(x, y, w * Math.max(0, Math.min(1, v)), 6); if (label) s.label(label, x, y - 6); },
    destroy() { dead = true; cancelAnimationFrame(raf); ro.disconnect(); listeners.forEach(f => f()); root.replaceChildren(); root.classList.remove('try-kit'); },
  });
  return s;
}

// Small math helpers shared by stands.
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
