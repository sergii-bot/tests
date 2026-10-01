import {upgradeRobot} from './lookdev.js';
// HEROES — who you walk the lab as, seen from behind (third person) or through their eyes (first person).
// Real robots are the official MuJoCo Menagerie models driven by mj.js recipes; the drone and the engineer are built here.
// Gameplay is unchanged: the hero only follows the existing player position, yaw and speed.
//   const heroes = createHeroes(THREE, scene, MJ);  await heroes.pick('g1');  heroes.update(player, dt, t);  heroes.cameraFor(player, camera)
export const HEROES = [
  {id: 'g1', name: 'Skild humanoid', role: 'Humanoid', mj: 'g1', recipe: 'humanoidWalk', eye: 1.3, dist: 3.8, rate: .9},
  {id: 'h1', name: 'Skild humanoid XL', role: 'Tall humanoid', mj: 'h1', recipe: 'humanoidWalk', eye: 1.7, dist: 4.2, rate: .8},
  {id: 'go2', name: 'Skild quadruped', role: 'Robot dog', mj: 'go2', recipe: 'go2Trot', eye: .45, dist: 2.4, rate: 1.1},
  {id: 'spot', name: 'Skild quadruped L', role: 'Quadruped', mj: 'spot', recipe: 'spotTrot', eye: .75, dist: 2.9, rate: 1},
  {id: 'drone', name: 'Scout drone', role: 'Game avatar · not a Skild product', eye: 2.3, dist: 3.0, fly: 2.2},
];

function droneMesh(THREE) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({color: '#e6ebe6', roughness: .4, metalness: .15});
  const dark = new THREE.MeshStandardMaterial({color: '#151a18', roughness: .3, metalness: .6});
  const glow = new THREE.MeshBasicMaterial({color: '#f2b640', toneMapped: false});
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.13, .26, 6, 16), white); body.rotation.z = Math.PI / 2; g.add(body);
  const cam = new THREE.Mesh(new THREE.SphereGeometry(.07, 16, 12), dark); cam.position.set(0, -.08, -.17); g.add(cam);
  const rotors = [];
  for (const [x, z] of [[.32, .32], [-.32, .32], [.32, -.32], [-.32, -.32]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(.04, .03, .46), dark); arm.position.set(x / 2, 0, z / 2); arm.rotation.y = Math.atan2(x, z); g.add(arm);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .06, 12), dark); motor.position.set(x, .02, z); g.add(motor);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.17, .012, 6, 32), white); ring.rotation.x = Math.PI / 2; ring.position.set(x, .03, z); g.add(ring);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(.3, .006, .03), new THREE.MeshStandardMaterial({color: '#2a302d', transparent: true, opacity: .55}));
    blade.position.set(x, .06, z); g.add(blade); rotors.push(blade);
  }
  const led = new THREE.Mesh(new THREE.SphereGeometry(.018, 8, 6), glow); led.position.set(0, .02, .2); g.add(led);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return {group: g, update(t, speed) { rotors.forEach((r, i) => r.rotation.y = t * (60 + i * 3)); g.rotation.x = -speed * .025; }};
}

// engineer: a clean mannequin in a white lab coat (no face, matches the soft figures in the director's stills)
function humanMesh(THREE) {
  const g = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({color: '#e3e8e3', roughness: .85});
  const pants = new THREE.MeshStandardMaterial({color: '#2b3430', roughness: .8});
  const skin = new THREE.MeshStandardMaterial({color: '#c9a58c', roughness: .7});
  const hair = new THREE.MeshStandardMaterial({color: '#1d1a17', roughness: .9});
  const limb = (r, l, m) => { const geo = new THREE.CapsuleGeometry(r, l, 4, 12); geo.translate(0, -l / 2 - r, 0); return new THREE.Mesh(geo, m); };
  const hips = new THREE.Group(); hips.position.y = .95; g.add(hips);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.19, .42, 6, 16), coat); torso.position.y = .36; torso.scale.z = .7; hips.add(torso);
  const head = new THREE.Group(); head.position.y = .78; hips.add(head);
  head.add(new THREE.Mesh(new THREE.SphereGeometry(.11, 20, 16), skin));
  const hr = new THREE.Mesh(new THREE.SphereGeometry(.115, 20, 16, 0, Math.PI * 2, 0, Math.PI * .55), hair); hr.position.y = .012; head.add(hr);
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const th = new THREE.Group(); th.position.set(s * .1, 0, 0); hips.add(th); th.add(limb(.07, .36, pants));
    const sh = new THREE.Group(); sh.position.y = -.5; th.add(sh); sh.add(limb(.06, .36, pants));
    legs.push({th, sh, s});
    const ua = new THREE.Group(); ua.position.set(s * .25, .58, 0); hips.add(ua); ua.add(limb(.055, .26, coat));
    const fa = new THREE.Group(); fa.position.y = -.38; ua.add(fa); fa.add(limb(.045, .24, coat));
    arms.push({ua, fa, s});
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return {group: g, update(t, speed, phase) {
    const a = Math.min(1, speed / 6), s = Math.sin(phase);
    for (const L of legs) { L.th.rotation.x = .5 * s * L.s * a; L.sh.rotation.x = -Math.max(0, -s * L.s) * .9 * a - .05; }
    for (const A of arms) { A.ua.rotation.x = -.4 * s * A.s * a; A.fa.rotation.x = -.3 - .2 * a; A.ua.rotation.z = A.s * .06; }
    hips.position.y = .95 + Math.abs(Math.cos(phase)) * .03 * a;
    torso.rotation.y = .08 * s * a; head.rotation.y = -.05 * s * a + Math.sin(t * .4) * .08 * (1 - a);
  }};
}

export function createHeroes(THREE, scene, MJ) {
  const root = new THREE.Group(); scene.add(root);
  let hero = HEROES[0], body = null, bot = null, phase = 0, yawS = 0, token = 0;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
  const api = {
    hero: () => hero, view: 'third', ready: false,
    async pick(id) {
      const h = HEROES.find(x => x.id === id) || HEROES[0], my = ++token; hero = h;
      root.clear(); bot?.dispose?.(); bot = null; body = null; api.ready = false;
      if (h.mj) {
        const b = await MJ.spawn(h.mj, {shared: true}); if (my !== token) { b.dispose(); return; }
        bot = b; bot.walk = MJ.RECIPES[h.recipe](h.rate); root.add(bot.group);
        bot.group.rotation.y = Math.PI / 2; // MuJoCo robots face +x; the hall's forward is -z
        upgradeRobot(THREE, bot.group);
      } else {
        body = h.id === 'drone' ? droneMesh(THREE) : humanMesh(THREE); root.add(body.group);
      }
      api.ready = true; root.visible = api.view === 'third';
    },
    toggleView() { api.view = api.view === 'third' ? 'first' : 'third'; root.visible = api.view === 'third'; return api.view; },
    update(player, dt, t) {
      const speed = Math.hypot(player.vx, player.vz);
      // body faces where you move; when standing it turns to where you look
      const want = speed > .3 ? Math.atan2(-player.vx, -player.vz) : player.yaw;
      let d = want - yawS; d = Math.atan2(Math.sin(d), Math.cos(d)); yawS += d * (1 - Math.exp(-dt * 8));
      phase += dt * (2 + speed * .9);
      const y = hero.fly ? hero.fly + Math.sin(t * 1.7) * .06 : 0;
      root.position.set(player.x, y, player.z); root.rotation.y = yawS;
      if (bot) {
        if (speed > .25) { bot.reset(); bot.walk(bot, phase / 2.2 * (hero.rate || 1)); bot.kinematics(); }
        else if (bot._idle !== true) { bot.reset(); bot.kinematics(); }
        bot._idle = speed <= .25;
      } else body?.update(t, speed, phase);
    },
    // third person: behind and above the shoulder, damped like a handheld follow cam
    cameraFor(player, camera, dt, blocked) {
      const h = hero;
      if (api.view === 'first') { camera.position.set(player.x, (h.fly || 0) + h.eye, player.z); camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ'); return; }
      const pitch = Math.max(-.6, Math.min(.9, player.pitch));
      let dist = h.dist;
      const back = (k) => tmp.set(player.x + Math.sin(player.yaw) * Math.cos(pitch) * k, 0, player.z + Math.cos(player.yaw) * Math.cos(pitch) * k);
      while (dist > .8 && blocked && blocked(back(dist).x, tmp.z)) dist -= .2; // pull in instead of going through walls
      back(dist);
      const eyeY = (h.fly || 0) + h.eye;
      const target = new THREE.Vector3(tmp.x + Math.cos(player.yaw) * .45, Math.max(.35, eyeY + .35 - Math.sin(pitch) * dist), tmp.z - Math.sin(player.yaw) * .45);
      const k = 1 - Math.exp(-dt * 7);
      if (!api._init) { camPos.copy(target); api._init = true; } else camPos.lerp(target, k);
      camLook.set(player.x - Math.sin(player.yaw) * 2, eyeY - Math.sin(pitch) * 1.2 + .1, player.z - Math.cos(player.yaw) * 2);
      camera.position.copy(camPos);
      camera.position.y += Math.sin(performance.now() / 900) * .006; // handheld breath
      camera.lookAt(camLook);
    },
  };
  return api;
}
