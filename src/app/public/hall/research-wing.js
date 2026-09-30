// RESEARCH WING — the research the Skild Brain grew out of (Pathak Lab, CMU), one exhibit per paper, chronological.
// Exhibit = official teaser (from the lab's site) + card; E opens details with links and "try it" on the matching stand.
import * as THREE from '../vendor/three.module.js';

export const RX = -80, RW = 20; // wing center x, width
export async function buildResearchWing({scene, css3d, el, esc, M}) {
  let PAPERS = [], LAB = {name: 'Pathak Lab · CMU Robotics Institute', url: 'https://pathak22.github.io/'};
  try { ({PAPERS, LAB} = await import('./research.js')); } catch (e) { console.warn('research.js not ready', e); }
  const g = new THREE.Group(); scene.add(g);
  const SP = 7, n = Math.max(2, Math.ceil(PAPERS.length / 2)), len = n * SP + 22, z1 = 13, z0 = z1 - len, x0 = RX - RW / 2, x1 = RX + RW / 2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(RW, len), M.floor); floor.rotation.x = -Math.PI / 2; floor.position.set(RX, 0, (z0 + z1) / 2); floor.receiveShadow = true; g.add(floor);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(RW, len), M.wall); ceil.rotation.x = Math.PI / 2; ceil.position.set(RX, 7.5, (z0 + z1) / 2); g.add(ceil);
  for (const [w, x, z, ry] of [[len, x0, (z0 + z1) / 2, Math.PI / 2], [len, x1, (z0 + z1) / 2, -Math.PI / 2], [RW, RX, z0, 0], [RW, RX, z1, Math.PI]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 7.5), M.wall); m.position.set(x, 3.75, z); m.rotation.y = ry; g.add(m); }
  for (let z = z1 - 4; z > z0; z -= 9) { const s = new THREE.Mesh(new THREE.BoxGeometry(RW - 5, .05, .3), M.light); s.position.set(RX, 7.45, z); g.add(s); }
  const spine = new THREE.Mesh(new THREE.PlaneGeometry(.06, len - 10), M.orange); spine.rotation.x = -Math.PI / 2; spine.position.set(RX, .005, (z0 + z1) / 2 - 3); g.add(spine);

  css3d(el('div', 'w-wall', `<h1>Research <span>Wing</span></h1><p>${esc(LAB.name)} · the ideas behind the Skild Brain · ${PAPERS[0]?.year || ''} → ${PAPERS.at(-1)?.year || ''}</p>`), new THREE.Vector3(RX, 6.2, z0 + .06), 0, .0034, 0, 0, true);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.2, .12), M.black); frame.position.set(RX, 2.1, z1 - .06); g.add(frame);
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 3.9), M.orange); hole.position.set(RX, 1.95, z1 - .13); hole.rotation.y = Math.PI; g.add(hole);
  css3d(el('div', 'w-doorsign', '← Release Hall'), new THREE.Vector3(RX, 4.6, z1 - .14), Math.PI, .005);

  const solids = [];
  const exhibits = PAPERS.map((p, i) => {
    const side = i % 2 === 0 ? -1 : 1, z = z1 - 10 - Math.floor(i / 2) * SP, wx = side * (RW / 2 - .08) + RX;
    const media = p.media?.type === 'mp4'
      ? `<video muted loop playsinline preload="none" data-src="${esc(p.media.teaser)}"></video>`
      : `<img loading="lazy" src="${esc(p.media?.teaser || '')}" alt="">`;
    const card = el('div', 'w-paper', `<div class="pm">${media}</div><div class="pb"><div class="pv"><b>${esc(String(p.year))}</b> · ${esc(p.venue)}${p.award ? ` · <em>${esc(p.award)}</em>` : ''}</div><h4>${esc(p.title)}</h4><div class="pa">${esc(p.authors)}</div><p>${esc(p.idea)}</p>${p.robot ? `<div class="pr">Robot: ${esc(p.robot)}</div>` : ''}${p.skild?.release ? `<div class="ps">→ In Skild: ${esc(p.skild.why || p.skild.release)}</div>` : ''}<div class="pk">Press E · links${p.skild?.release ? ' · try it' : ''}</div></div>`);
    css3d(card, new THREE.Vector3(wx, 3.4, z), side < 0 ? Math.PI / 2 : -Math.PI / 2, .0046);
    const video = card.querySelector('video');
    return {p, side, z, spot: {x: RX + side * (RW / 2 - 4), z}, video, playing: false};
  });

  const bounds = {x0: x0 + .6, x1: x1 - .6, z0: z0 + .6, z1: z1 - .6};
  return {
    exhibits, door: {x: RX, z: z1 - 1.2}, bounds, count: PAPERS.length, lab: LAB,
    blocked(x, z) { return x < bounds.x0 || x > bounds.x1 || z < bounds.z0 || z > bounds.z1 || solids.some(s => Math.abs(x - s.x) < s.r && Math.abs(z - s.z) < .5); },
    nearest(px, pz) { let best = null, bd = 4.2; for (const e of exhibits) { const d = Math.hypot(px - e.spot.x, pz - e.spot.z); if (d < bd) { bd = d; best = e; } } return best; },
    update(px, pz) { // play only the teaser video nearest to the visitor
      let near = null, nd = 12; for (const e of exhibits) { if (!e.video) continue; const d = Math.hypot(px - e.spot.x, pz - e.spot.z); if (d < nd) { nd = d; near = e; } }
      for (const e of exhibits) { if (!e.video) continue; const want = e === near; if (want && !e.playing) { if (!e.video.src) e.video.src = e.video.dataset.src; e.video.play().catch(() => {}); e.playing = true; } else if (!want && e.playing) { e.video.pause(); e.playing = false; } }
    },
  };
}
