// Rules-level playthrough: build a dog and a humanoid in the workshop. node tools/playthrough-workshop.mjs
import {setup, validateAction, applyAction} from '../public/logic.js';
let s = setup(['me']), now = 1e6;
const act = a => { now += 250; const x = {...a, _now: now}; const v = validateAction(s, 'me', x); if (!v.ok) throw Error(JSON.stringify(a) + ' → ' + v.error); s = applyAction(s, 'me', x); };
const walkTo = (tx, tz) => { for (let i = 0; i < 2000; i++) { const p = s.players.me, dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz); if (d < .3) return; const k = Math.min(.9, d) / d; act({kind: 'move', dx: dx * k, dz: dz * k, yaw: 0}); } throw Error('stuck'); };
const BINS = {frame: [103, 18], leg: [103, 22], arm: [117, 18], sensor: [117, 22], brain: [117, 26]}, STAND = [110, 18];
const RECIPES = {dog: ['frame', 'leg', 'leg', 'leg', 'leg', 'sensor', 'brain'], humanoid: ['frame', 'leg', 'leg', 'arm', 'arm', 'sensor', 'brain']};
act({kind: 'travel', zone: 'workshop'});
for (const body of ['dog', 'humanoid']) {
  walkTo(...STAND); act({kind: 'selectBody', body});
  for (const part of RECIPES[body]) { walkTo(...BINS[part]); act({kind: 'takePart', part}); walkTo(...STAND); act({kind: 'installPart'}); }
  console.log('PASS built', body, JSON.stringify(s.workshop.built));
}
walkTo(-11, 10); act({kind: 'cookRestart'}); console.log('PASS kitchen show restarted at', s.kitchenShow.started > 0);
