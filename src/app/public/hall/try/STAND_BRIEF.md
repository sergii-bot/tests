# TRY stand brief (read fully before writing a stand)

You are building an interactive "TRY" stand for the **Skild AI Release Hall**, a walkable 3D gallery in the browser. Each Skild release has a pavilion. The visitor reads the plaque, watches the official video, then walks to the TRY stand and **plays with the idea for 1–3 minutes**. The stand must make the release's core idea *felt by doing*, not by reading.

## Files
- Your stand: `hall/try/<module>.js`. The module id is `try.module` in `hall/releases.js`.
- Read `hall/releases.js` (the entry for your release: summary, points, videos), `hall/try/kit.js` (toolkit) and `hall/try/s1.js` (**the reference stand**: match its quality, structure and look).
- Do NOT edit any other file. If you think kit.js needs something, put a local helper in your own file.

## Contract
```js
import {kit, B, lerp, clamp, rand} from './kit.js';
export default function mount(root, api) {
  const k = kit(root);            // canvas that fills the stand + a control bar
  // k.frame((dt, t) => {...})    per-frame update + draw (2D canvas ctx = k.ctx, size k.w × k.h in CSS px)
  // k.onDown/onMove/onUp(p => {}) pointer; k.onKey(e => {}) keys
  // k.button(label, fn, {primary}), k.slider(label, min, max, value, fn, step), k.toggle(label, value, fn)
  // k.text(str, x, y, {size, color, align, mono, weight}), k.label(str, x, y), k.meter(x, y, w, v, label), k.clear(color), k.grid()
  // api.status('short text')      status pill (top right)
  // api.complete('short text')    call ONCE when the visitor has genuinely done the thing (not on open)
  return () => k.destroy();
}
```
- The canvas resizes with the window (k.w, k.h change), so lay out from k.w/k.h every frame and never hard-code the size. Minimum is about 900×520.
- 2D canvas only. No new libraries, no network requests except drawing official poster images already listed in releases.js (`new Image()` + `drawImage` is fine; never read pixels back).
- Keep it self-contained, ~200–400 lines, and without console errors.

## Design rules (Skild brand)
- Palette from `B`: warm1 background, white panels, black/ink text, **orange (#FF7E00) is the only accent**, used for "the brain / active / success". Cool greys for secondary info. Light theme like skild.ai.
- Type: Geist (sans) for text, Geist Mono UPPERCASE small labels (`k.label`). Clean, minimal, lots of air, rounded rects (radius 8–14), thin 1–2px lines.
- The layout should read like a precise instrument or lab UI. Include a clear **goal line** at the top-left of the canvas ("Goal: …"), a live **metric** (meter or number), and a short **log** of what just happened (like s1.js).
- All copy is in English, short and plain. Make no claims beyond the release post; use its facts and numbers only.

## Interactivity bar
- The visitor must have **agency**: drawing, dragging, clicking in the scene, keys, sliders. Not just "press play".
- Show a **before/after or with/without contrast** that proves the release's point (e.g. bespoke vs one brain, no prompt vs prompt).
- Give feedback within 100 ms of every input. Animate smoothly with dt. Nothing should snap.
- Completion: call `api.complete()` when the core insight has been experienced (e.g. adapted after a break, beat the clock, trained ≥ N generations and scored). Also show a clear success state in the canvas.

## Honesty
It is a stylized game, not a simulation of the real model. Label anything simulated as simulated where that matters. Never show a capability the post doesn't claim.

## Verify before you finish
Run `/opt/homebrew/bin/node --check hall/try/<module>.js` from the `public` folder. Re-read your file once for runtime errors: undefined vars, wrong kit API names. You cannot open a browser; the lead will test in one.

## Hard rules
- Work only in this project folder. No downloads, no uploads, no publishing, no git commands.
- Do not modify releases.js, kit.js, hall.js, hall.css or other stands.

## v2 additions (2026-09-28)
- `api.clip(indexOrName)` switches the "Real robot · official video" corner clip to the matching entry in `release.videos` (by index, or a substring of its title/file name, e.g. `api.clip('coffee')`). Call it when the visitor picks a task or scenario, so the real robot doing *that* thing plays in the corner.
- `api.record(kind, data)` adds a rich sample to the **player dataset** (kept in the visitor's browser, exportable as JSON). Record meaningful, compact data: a demo trajectory (≤200 points, rounded to 3 decimals), a drawn terrain profile, a body config and the chosen gait, match results, deployment decisions. Record at natural moments (end of a demo, end of a run), not every frame.
- The corner clip covers roughly the **bottom-right 340×230 px** of the stand. Keep critical UI out of that area, or make sure it survives being covered (the visitor can minimize the clip).
