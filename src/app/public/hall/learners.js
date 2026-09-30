// LEARNERS — robots and students who walk the Research Wing, watch each paper's video, and gradually learn from it.
// A learner: walk to an exhibit → watch (progress fills; 2× faster if the visitor watches the same exhibit) → practice the skill → next.
// Robots are real MuJoCo Menagerie models (kinematic); students are simple figures. Labels float above them.
import * as THREE from '../vendor/three.module.js';
import {CSS3DObject} from '../vendor/CSS3DRenderer.js';
import * as MJ from './mj.js';

const THEME_SKILL = {
  exploration: 'Curiosity', morphology: 'Any body', locomotion: 'Agile walking', 'learning-from-video': 'Learns from video',
  dexterity: 'Dexterous hands', 'mobile-manipulation': 'Mobile manipulation', generalist: 'Generalist', hardware: 'Hardware sense',
};
const ROSTER = [
  {name: 'Go2 · learner', kind: 'go2', walk: MJ.RECIPES.go2Trot(1.1), practice: {locomotion: MJ.RECIPES.go2Parkour(), default: MJ.RECIPES.go2Trot(1.6)}, speed: 1.7},
  {name: 'G1 · learner', kind: 'g1', walk: MJ.RECIPES.humanoidWalk(1), practice: {default: MJ.RECIPES.humanoidWalk(1.5)}, speed: 1.2},
  {name: 'H1 · learner', kind: 'h1', walk: MJ.RECIPES.humanoidWalk(.9), practice: {default: MJ.RECIPES.humanoidWalk(1.4)}, speed: 1.1},
  {name: 'Maya · student', kind: 'person', color: '#5c6670', speed: 1.3},
  {name: 'Arjun · student', kind: 'person', color: '#8e8177', speed: 1.25},
];

function person(color) {
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({color, roughness: .7}), skin = new THREE.MeshStandardMaterial({color: '#c9a58a', roughness: .8});
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .75, 6, 14), mat); body.position.y = 1.0; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(.14, 18, 12), skin); head.position.y = 1.62; head.castShadow = true;
  const legs = [-1, 1].map(s => { const l = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .5, 4, 8), mat); l.position.set(s * .1, .35, 0); l.castShadow = true; g.add(l); return l; });
  g.add(body, head);
  return {group: g, update(t, moving) { legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 7 + i * Math.PI) * .5 : 0; }); head.rotation.x = moving ? 0 : -.08; }};
}

const SKEY = 'skild-hall:learners:v1';
const loadSaved = () => { try { return JSON.parse(sessionStorage.getItem(SKEY)) || {}; } catch { return {}; } };
const GAIN = {locomotion: .16, morphology: .1, generalist: .08, 'learning-from-video': .06, 'mobile-manipulation': .06, exploration: .04, dexterity: .03, hardware: .03};
// wrap a walking recipe with "clumsiness": tremor, stumbles and short steps that fade as competence grows
function clumsy(recipe, L) {
  return (b, t, dt) => {
    const c = L.competence, k = 1 - c;
    recipe(b, t * (.35 + .65 * c), dt);                                   // slow, short steps at first
    const names = Object.keys(b.jnt); let i = 0;
    for (const n of names) { if (!n || /floating|freejoint|^$/.test(n)) continue; const a = b.jnt[n]; if (a < 7 && b.data.qpos.length > 7) continue; b.data.qpos[a] += Math.sin(t * (13 + i * 1.7) + i) * .22 * k * k; i++; }
    // stumble: base sags and rolls every few seconds while competence is low
    const st = Math.max(0, Math.sin(t * 1.3 + L.seed)) ** 8 * k;
    if (b.data.qpos.length > 7) { const q = b.data.qpos; q[2] -= st * .12; q[4] += st * .25; const n = Math.hypot(q[3], q[4], q[5], q[6]) || 1; q[3] /= n; q[4] /= n; q[5] /= n; q[6] /= n; }
  };
}
export async function startLearners({scene, sceneTop, rw, getPlayer, onLearn}) {
  const saved = loadSaved();
  const save = () => { try { sessionStorage.setItem(SKEY, JSON.stringify(Object.fromEntries(learners.map(L => [L.spec.name, {competence: L.competence, skills: L.skills, watched: [...L.watched], history: L.history}])))); } catch {} };
  const ex = rw.exhibits; if (!ex.length) return {update() {}, nearest: () => null, teach() {}};
  const learners = [];
  for (const [i, spec] of ROSTER.entries()) {
    const sv = saved[spec.name] || {};
    const L = {spec, x: rw.door.x + (i - 2) * 1.6, z: rw.door.z - 4 - i, yaw: Math.PI, target: null, state: 'walk', progress: 0, skills: sv.skills || [], watched: new Set(sv.watched || []), practiceT: 0, bot: null, fig: null,
      competence: sv.competence ?? (spec.kind === 'person' ? .9 : .06), history: sv.history || [], seed: i * 1.9};
    if (spec.kind === 'person') { L.fig = person(spec.color); scene.add(L.fig.group); }
    else { try { L.bot = await MJ.spawn(spec.kind); L.walkC = clumsy(spec.walk, L); L.practiceC = {}; for (const [th, rc] of Object.entries(spec.practice)) L.practiceC[th] = clumsy(rc, L); L.bot.recipe = L.walkC; scene.add(L.bot.group); } catch (e) { console.warn('learner', e); continue; } }
    const tag = document.createElement('div'); tag.className = 'w-learner';
    L.tag = tag; L.label = new CSS3DObject(tag); L.label.scale.setScalar(.0045); sceneTop.add(L.label);
    pick(L, i * 3 % ex.length);
    learners.push(L);
  }
  function pick(L, forced) {
    let i = forced;
    if (i == null) { const unseen = ex.map((e, k) => k).filter(k => !L.watched.has(k)); i = unseen.length ? unseen[Math.floor(Math.random() * unseen.length)] : Math.floor(Math.random() * ex.length); }
    L.target = i; L.state = 'walk'; L.progress = 0;
  }
  function label(L) {
    const e = ex[L.target], p = e.p;
    const status = L.state === 'watch' ? `Watching · ${p.title.split(':')[0].slice(0, 34)} · ${Math.round(L.progress * 100)}%` : L.state === 'practice' ? `Practicing · ${THEME_SKILL[p.theme] || 'new skill'}` : `Heading to · ${p.title.split(':')[0].slice(0, 30)}`;
    L.tag.innerHTML = `<b>${L.spec.name}</b><span>${status}</span><i style="--p:${L.state === 'watch' ? L.progress : L.state === 'practice' ? 1 : 0}"></i>${L.spec.kind !== 'person' ? `<u>Walking skill ${Math.round(L.competence * 100)}%<s style="--c:${L.competence}"></s></u>` : ''}<em>${L.skills.length} skills learned${L.skills.length ? ' · ' + L.skills.slice(-2).join(' · ') : ''}</em>`;
  }
  let labelT = 0;
  return {
    learners,
    nearest(px, pz) { let b = null, bd = 2.6; for (const L of learners) { const d = Math.hypot(px - L.x, pz - L.z); if (d < bd) { bd = d; b = L; } } return b; },
    teach(L, exIndex) { if (exIndex != null && exIndex >= 0) pick(L, exIndex); },
    update(t, dt, camera) {
      const pl = getPlayer();
      labelT += dt;
      for (const L of learners) {
        const e = ex[L.target], goal = {x: e.spot.x + (e.side ? -e.side * .6 : 0), z: e.spot.z + (learners.indexOf(L) % 3 - 1) * .9};
        const dx = goal.x - L.x, dz = goal.z - L.z, d = Math.hypot(dx, dz);
        const spd = L.spec.speed * (L.spec.kind === 'person' ? 1 : .25 + .75 * L.competence);
        if (L.state === 'walk') {
          if (d > .15) { const s = Math.min(d, spd * dt); L.x += dx / d * s; L.z += dz / d * s; const ty = Math.atan2(dx, dz); L.yaw += Math.atan2(Math.sin(ty - L.yaw), Math.cos(ty - L.yaw)) * Math.min(1, dt * 6); }
          else { L.state = 'watch'; }
        } else if (L.state === 'watch') {
          const face = e.side ? (e.side < 0 ? -Math.PI / 2 : Math.PI / 2) : Math.PI; // look at the card
          L.yaw += Math.atan2(Math.sin(face - L.yaw), Math.cos(face - L.yaw)) * Math.min(1, dt * 4);
          const together = Math.hypot(pl.x - e.spot.x, pl.z - e.spot.z) < 4 ? 2 : 1;       // watching together doubles the speed
          L.progress = Math.min(1, L.progress + dt / 9 * together);
          if (L.progress >= 1) { L.state = 'practice'; L.practiceT = 0; const first = !L.watched.has(L.target); L.watched.add(L.target); const sk = THEME_SKILL[e.p.theme] || 'New skill'; if (!L.skills.includes(sk)) L.skills.push(sk);
            if (first && L.spec.kind !== 'person') { const before = L.competence; L.competence = Math.min(.97, L.competence + (GAIN[e.p.theme] || .04) * (1 - L.competence) * 1.6); L.history.push([e.p.year, e.p.title.split(':')[0], Math.round(before * 100), Math.round(L.competence * 100)]); }
            save(); onLearn?.(L, e.p); }
        } else if (L.state === 'practice') {
          L.practiceT += dt; if (L.practiceT > 4.5) pick(L);
        }
        // pose
        if (L.bot) {
          const moving = L.state === 'walk' || L.state === 'practice';
          L.bot.recipe = L.state === 'practice' ? (L.practiceC[e.p.theme] || L.practiceC.default) : moving ? L.walkC : null;
          if (!L.bot.recipe) { L.bot.reset(); L.bot.kinematics(); } else L.bot.update(t, dt);
          L.bot.group.position.set(L.x, 0, L.z); L.bot.group.rotation.y = L.yaw - Math.PI / 2; // MuJoCo forward (+x) → our heading
        } else if (L.fig) { L.fig.group.position.set(L.x, 0, L.z); L.fig.group.rotation.y = L.yaw + Math.PI; L.fig.update(t, L.state === 'walk'); if (L.state === 'practice') L.fig.group.position.y = Math.abs(Math.sin(t * 5)) * .05; }
        const h = L.spec.kind === 'go2' ? 1.2 : 2.25;
        L.label.position.set(L.x, h, L.z); L.label.rotation.y = Math.atan2(camera.position.x - L.x, camera.position.z - L.z);
      }
      if (labelT > .25) { labelT = 0; learners.forEach(label); }
    },
  };
}
