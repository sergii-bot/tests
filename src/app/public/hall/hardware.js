// HARDWARE LAB — a side room: parts racks, the robot builder bench, the teleoperation station and a test arena.
// Built away from the main hall (x ≈ 80) and reached through a door; stations reuse the TRY-stand pipeline.
import * as THREE from '../vendor/three.module.js';
import {exhibit, MAT as RM} from './robots.js';

export const HX = 80, HZ = 0, HW = 28, HD = 26; // room center, width (x), depth (z)
const S1 = 'https://assets.skild.ai/site/v1/blog/sb-812a99baf442e4fb5939/';
const yt = (id, title) => ({type: 'youtube', id, title, poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`});
const mp4 = (name, title) => ({type: 'mp4', src: S1 + name + '.mp4', poster: S1 + name + '-poster.jpg', title});

// station "releases" (same shape as releases.js entries so openTry() can mount them)
export const STATIONS = [
  {id: 'hw-builder', code: 'HW-01', kind: 'hardware', date: '2026-09-28', title: 'Robot builder', subtitle: 'Hardware Lab',
    url: 'https://www.skild.ai/blogs/omni-bodied', summary: 'Pick a torso, legs or wheels, arms, hands and sensors. Then let one brain drive the body you built.',
    points: [], videos: [yt('p43pFxCFSzY', 'Adapting to loss of limbs'), yt('BEqxERQXbMM', 'Adapting to stilts'), yt('unV-jxi-qjI', 'Locked wheels and payload'), yt('Z2chIArzLDk', 'Adapting to failed leg motors'), yt('JQAfxp-FB0I', 'Chainsaw vs. robot'), yt('gbQXrY4YRD0', 'Learning from failures')],
    try: {module: 'hw-builder', title: 'Build your robot', verb: 'Assemble', blurb: 'From a robot dog to a humanoid: snap parts together, test-drive it with the Skild Brain, then activate it in the arena.'}},
  {id: 'hw-teleop', code: 'HW-02', kind: 'hardware', date: '2026-09-28', title: 'Teleoperation lab', subtitle: 'Hardware Lab',
    url: 'https://www.skild.ai/blogs/series-c', summary: 'Drive a robot arm like a teleoperator and record demonstrations, the richest kind of robot data.',
    points: [], videos: [yt('6jSM3-2yt2s', 'Series C: a look at the past results'), mp4('coffee-prompt', 'Prompt: coffee'), mp4('pancakes-prompt', 'Prompt: pancakes'), yt('YRmjBdKKLsc', 'Learning by watching human videos')],
    try: {module: 'hw-teleop', title: 'Teleoperate a robot', verb: 'Drive the arm', blurb: 'Control the arm, finish a task and record your demo into the dataset. Then see if a pure replay survives when the scene changes.'}},
  {id: 'hw-real', code: 'HW-03', kind: 'hardware', date: '2026-09-28', title: 'Real-parts builder', subtitle: 'Hardware Lab · MuJoCo',
    url: 'https://github.com/google-deepmind/mujoco_menagerie', summary: 'Compose a robot from real parts of Skild quadruped/H1/G1, Skild quadruped L and a Skild arm, then test it in real MuJoCo physics.',
    points: [], videos: [yt('p43pFxCFSzY', 'Adapting to loss of limbs'), yt('Z2chIArzLDk', 'Adapting to failed leg motors'), yt('BEqxERQXbMM', 'Adapting to stilts')],
    try: {module: 'hw-real', title: 'Build from real parts', verb: 'Compose', blurb: 'Real meshes, masses, joints and motor limits from the official models. Your robot has to stand up in real physics. Then push it.'}},
];

export function buildHardwareLab({scene, css3d, el, M, BRAND}) {
  const g = new THREE.Group(); scene.add(g);
  const x0 = HX - HW / 2, x1 = HX + HW / 2, z0 = HZ - HD / 2, z1 = HZ + HD / 2;
  // shell
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW, HD), M.floor); floor.rotation.x = -Math.PI / 2; floor.position.set(HX, 0, HZ); floor.receiveShadow = true; g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HW, HD), M.wall); ceil.rotation.x = Math.PI / 2; ceil.position.set(HX, 7.5, HZ); g.add(ceil);
  for (const [w, x, z, ry] of [[HD, x0, HZ, Math.PI / 2], [HD, x1, HZ, -Math.PI / 2], [HW, HX, z0, 0], [HW, HX, z1, Math.PI]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 7.5), M.wall); m.position.set(x, 3.75, z); m.rotation.y = ry; m.receiveShadow = true; g.add(m);
  }
  for (let z = z0 + 3; z < z1; z += 5) { const s = new THREE.Mesh(new THREE.BoxGeometry(HW - 6, .05, .35), M.light); s.position.set(HX, 7.45, z); g.add(s); }
  // safety floor markings (orange) around the arena and the bench
  const ringAt = (x, z, r) => { const m = new THREE.Mesh(new THREE.RingGeometry(r - .06, r, 72), M.orange); m.rotation.x = -Math.PI / 2; m.position.set(x, .006, z); g.add(m); };
  const arena = {x: HX, z: z0 + 6.5, r: 4.6}; ringAt(arena.x, arena.z, arena.r); ringAt(arena.x, arena.z, arena.r - .5);

  // parts racks along the west wall: shelves full of legs, arms, heads, torsos, batteries
  const solids = [];
  const part = {
    leg: () => { const p = new THREE.Group(); const a = new THREE.Mesh(new THREE.BoxGeometry(.09, .34, .09), RM.shell), b = new THREE.Mesh(new THREE.BoxGeometry(.07, .32, .07), RM.shell), j = new THREE.Mesh(new THREE.SphereGeometry(.06, 12, 8), RM.joint); a.position.y = .17; b.position.set(.08, -.1, 0); b.rotation.z = .6; p.add(a, b, j); p.rotation.z = Math.PI / 2; return p; },
    arm: () => { const p = new THREE.Group(); const a = new THREE.Mesh(new THREE.BoxGeometry(.5, .08, .08), RM.shell), j = new THREE.Mesh(new THREE.SphereGeometry(.07, 12, 8), RM.joint); j.position.x = .25; p.add(a, j); return p; },
    head: () => { const p = new THREE.Group(); const h = new THREE.Mesh(new THREE.BoxGeometry(.24, .22, .24), RM.shell), v = new THREE.Mesh(new THREE.BoxGeometry(.2, .05, .02), RM.eye); v.position.set(0, .02, .125); p.add(h, v); return p; },
    torso: () => new THREE.Mesh(new THREE.BoxGeometry(.7, .22, .36), RM.body),
    battery: () => { const p = new THREE.Group(); const b = new THREE.Mesh(new THREE.BoxGeometry(.3, .16, .2), RM.body), s = new THREE.Mesh(new THREE.BoxGeometry(.31, .03, .21), RM.joint); s.position.y = .05; p.add(b, s); return p; },
    lidar: () => { const p = new THREE.Group(); const c = new THREE.Mesh(new THREE.CylinderGeometry(.09, .1, .12, 20), RM.body), r = new THREE.Mesh(new THREE.TorusGeometry(.095, .012, 6, 24), RM.joint); r.rotation.x = Math.PI / 2; p.add(c, r); return p; },
  };
  const kinds = Object.keys(part);
  // shelving in the Japanese-tech look: oiled walnut boards on blackened steel posts
  const walnut = new THREE.MeshPhysicalMaterial({color: '#4a2f1d', roughness: .42, clearcoat: .35, clearcoatRoughness: .4, sheen: .3});
  const steel = new THREE.MeshStandardMaterial({color: '#111312', roughness: .35, metalness: .85});
  const ledM = new THREE.MeshBasicMaterial({color: new THREE.Color(2.2, 1.7, 1.1), toneMapped: false}); // warm strip under each board
  const rackSlots = []; // filled with real robot parts later (hall.js → MJ.bodyPart)
  for (let i = 0; i < 3; i++) {
    const rz = z0 + 6 + i * 6.2, rack = new THREE.Group(); rack.position.set(x0 + 1.1, 0, rz); g.add(rack);
    for (const px of [-.8, .8]) for (const pz of [-2.6, 2.6]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.05, 4.2, .05), steel); post.position.set(px, 2.1, pz); rack.add(post); }
    for (let s = 0; s < 4; s++) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.7, .045, 5.3), walnut); shelf.castShadow = true; if (s > 0) { const led = new THREE.Mesh(new THREE.BoxGeometry(.02, .012, 5.1), ledM); led.position.set(.78, .5 + s * 1.1 - .03, 0); rack.add(led); } shelf.position.y = .5 + s * 1.1; shelf.receiveShadow = true; rack.add(shelf);
      for (let k = 0; k < 5; k++) { const p = part[kinds[(i * 4 + s + k) % kinds.length]](); p.position.set((k % 2 ? .3 : -.3), .5 + s * 1.1 + .14, -2.1 + k * 1.05); p.rotation.y = k * .7; p.traverse(o => { if (o.isMesh) o.castShadow = true; }); rack.add(p); rackSlots.push({rack: i, rackG: rack, placeholder: p, x: p.position.x, y: .5 + s * 1.1 + .025, z: p.position.z, rot: p.rotation.y}); }
    }
    { const glow = new THREE.PointLight('#ffd2a0', 9, 4, 1.8); glow.position.set(.6, 3.2, 0); rack.add(glow); } // display light
    solids.push({x0: x0, x1: x0 + 2.2, z0: rz - 2.8, z1: rz + 2.8});
    const tag = el('div', 'w-rack', `<b>${['LOCOMOTION', 'MANIPULATION', 'SENSING & POWER'][i]}</b><span>${['legs · wheels · hips', 'arms · wrists · grippers', 'heads · LiDAR · batteries'][i]}</span>`);
    css3d(tag, new THREE.Vector3(x0 + .08, 5.1, rz), Math.PI / 2, .005);
  }

  // builder bench (station HW-01): a half-built robot on an assembly table
  const bench = {x: HX - 5, z: HZ + 1};
  const table = new THREE.Mesh(new THREE.BoxGeometry(3.4, .9, 1.8), RM.light); table.position.set(bench.x, .45, bench.z); table.castShadow = table.receiveShadow = true; g.add(table);
  const wip = exhibit('quadruped'); wip.group.children[0].visible = wip.group.children[1].visible = false; wip.group.position.set(bench.x, .78, bench.z); wip.group.scale.setScalar(.9); g.add(wip.group);
  solids.push({x0: bench.x - 1.8, x1: bench.x + 1.8, z0: bench.z - 1, z1: bench.z + 1});

  // teleop station (HW-02): operator desk with monitors facing a robot arm cell
  const tele = {x: HX + 6, z: HZ + 1};
  const desk = new THREE.Mesh(new THREE.BoxGeometry(3, .78, 1.2), RM.body); desk.position.set(tele.x, .39, tele.z + 1.4); g.add(desk);
  for (let i = -1; i <= 1; i++) { const mon = new THREE.Mesh(new THREE.BoxGeometry(.9, .55, .05), M.black); mon.position.set(tele.x + i * .95, 1.15, tele.z + 1.15); mon.rotation.y = -i * .25; g.add(mon); const scr = new THREE.Mesh(new THREE.PlaneGeometry(.84, .49), new THREE.MeshBasicMaterial({color: '#1b222b', toneMapped: false})); scr.position.set(tele.x + i * .95, 1.15, tele.z + 1.12); scr.rotation.y = Math.PI - i * .25; g.add(scr); const line = new THREE.Mesh(new THREE.PlaneGeometry(.6, .02), M.orange); line.position.set(tele.x + i * .95, 1.05 + i * .04, tele.z + 1.115); line.rotation.y = Math.PI - i * .25; g.add(line); }
  const cell = exhibit('arm'); cell.group.children[0].visible = cell.group.children[1].visible = false; cell.group.position.set(tele.x, 0, tele.z - 1.2); g.add(cell.group);
  solids.push({x0: tele.x - 1.6, x1: tele.x + 1.6, z0: tele.z - 2.2, z1: tele.z + 2.1});

  // arena: the visitor's own robot (from the builder) or a demo dog
  let arenaBot = exhibit('quadruped'); arenaBot.group.position.set(arena.x, 0, arena.z); g.add(arenaBot.group);
  async function refreshArena() {
    let cfg = null; try { cfg = JSON.parse(localStorage.getItem('skild-hall:myRobot')); } catch {}
    if (!cfg) return;
    try {
      const {buildRobotMesh} = await import('./hw-robot.js');
      const bot = buildRobotMesh(THREE, cfg, BRAND, {drive: true, radius: 2.4});
      g.remove(arenaBot.group); arenaBot = {group: bot.group, update: bot.update, custom: true};
      bot.group.position.set(arena.x, 0, arena.z); g.add(bot.group);
      arenaSign.innerHTML = `<b>${escapeHtml(cfg.name || 'Your robot')}</b><span>built by you · driven by one brain</span>`;
    } catch (e) { console.warn('arena robot', e); }
  }
  const arenaSign = el('div', 'w-rack', '<b>TEST ARENA</b><span>activate a robot in the builder to see it here</span>');
  css3d(arenaSign, new THREE.Vector3(arena.x, 5.2, z0 + .08), 0, .005);
  css3d(el('div', 'w-wall', `<h1>Hardware <span>Lab</span></h1><p>Build a body · Teleoperate · Test it with one brain</p>`), new THREE.Vector3(HX, 6.3, z0 + .06), 0, .0032, 0, 0, true);

  // doors: back to the hall (south wall)
  const door = {x: HX, z: z1 - 1.2};
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.2, .12), M.black); frame.position.set(HX, 2.1, z1 - .06); g.add(frame);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.9), M.orange); hole.position.set(HX, 1.95, z1 - .13); hole.rotation.y = Math.PI; g.add(hole);
  css3d(el('div', 'w-doorsign', '← Release Hall'), new THREE.Vector3(HX, 4.6, z1 - .14), Math.PI, .005);

  const realAt = {x: HX + 6.5, z: z0 + 6.5};
  { const ped = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.15, 1, 40), RM.body); ped.position.set(realAt.x, .5, realAt.z); g.add(ped); solids.push({x0: realAt.x - 1.1, x1: realAt.x + 1.1, z0: realAt.z - 1.1, z1: realAt.z + 1.1}); }
  const stations = [
    {r: STATIONS[0], L: {stand: new THREE.Vector3(bench.x, 0, bench.z - 1.9), i: 100, side: 1, z: bench.z}},
    {r: STATIONS[1], L: {stand: new THREE.Vector3(tele.x, 0, tele.z + 2.9), i: 101, side: 1, z: tele.z}},
    {r: STATIONS[2], L: {stand: new THREE.Vector3(realAt.x, 0, realAt.z + 2), i: 102, side: 1, z: realAt.z}},
  ];
  for (const s of stations) {
    const sign = el('div', 'w-stand unlocked', `<div class="k">${s.r.code} · HARDWARE LAB</div><div class="n">${s.r.try.title}</div><div class="l">Press E</div>`);
    css3d(sign, s.L.stand.clone().add(new THREE.Vector3(0, 2.5, 0)), 0, .0055, 0, 0, true).userData.billboard = true;
    ringAt(s.L.stand.x, s.L.stand.z, 1.1);
  }

  const bounds = {x0: x0 + .6, x1: x1 - .6, z0: z0 + .6, z1: z1 - .6};
  return {
    stations, door, arena, bounds, refreshArena, rackSlots,
    blocked(x, z) { if (x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1) return true; if (Math.hypot(x - arena.x, z - arena.z) < arena.r - .2) return true; return solids.some(s => x > s.x0 && x < s.x1 && z > s.z0 && z < s.z1); },
    update(t, dt) { wip.update(t * .3); cell.update(t); arenaBot.update(t, dt); if (!arenaBot.custom) arenaBot.group.rotation.y = t * .2; },
  };
}
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
