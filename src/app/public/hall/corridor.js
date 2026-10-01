// CORRIDOR — dressing for the main hall in the director's two references (layout and gameplay untouched):
//   dark  = black product studio: near-black room, pools of spotlight on each robot and stand, floor fading to black
//   light = bright showroom: the whole ceiling is a glowing light-box grid, cool white walls, blue-grey carpet,
//           stands become light pillars with vertical LED strips
// Shared: wall panels with seams, glossy/matte floor lit by the studio HDRI.
export function dressCorridor(THREE, renderer, scene, {hallLen, hallMid, wallX, hallW, ceil, bays, stands}) {
  const seamM = new THREE.MeshStandardMaterial({roughness: .7});
  const panelM = new THREE.MeshStandardMaterial({roughness: .45, metalness: .05});
  const gridM = new THREE.MeshStandardMaterial({roughness: .5, metalness: .4});
  const glowM = new THREE.MeshBasicMaterial({toneMapped: false}); // HDR white: the post pass blooms it
  const ledM = new THREE.MeshBasicMaterial({toneMapped: false});
  const z0 = hallMid - hallLen / 2;
  const all = [];
  const inst = (geo, mat, n, fn) => { const m = new THREE.InstancedMesh(geo, mat, n), o = new THREE.Object3D(); for (let i = 0; i < n; i++) { fn(o, i); o.updateMatrix(); m.setMatrixAt(i, o.matrix); } m.receiveShadow = true; scene.add(m); all.push(m); return m; };

  // wall panels: 1.6 m plates 2 cm off the wall, thin seams; no columns (they covered the plaques)
  const PW = 1.6, nP = Math.floor(hallLen / PW);
  for (const s of [-1, 1]) {
    inst(new THREE.BoxGeometry(.02, ceil - .3, PW - .03), panelM, nP, (o, i) => o.position.set(s * (wallX - .015), (ceil - .3) / 2 + .15, z0 + PW * (i + .5)));
    inst(new THREE.BoxGeometry(.025, ceil, .025), seamM, nP, (o, i) => o.position.set(s * (wallX - .01), ceil / 2, z0 + PW * i));
    inst(new THREE.BoxGeometry(.04, .14, hallLen), seamM, 1, o => o.position.set(s * (wallX - .03), .07, hallMid));
  }

  // ceiling: a light-box grid (light theme glows, dark theme is a black grid)
  const T = 2.4, nx = Math.ceil(hallW / T), nz = Math.ceil(hallLen / T);
  const box = inst(new THREE.BoxGeometry(T - .1, .02, T - .1), glowM, nx * nz, (o, i) => o.position.set(-hallW / 2 + T * ((i % nx) + .5), ceil - .02, z0 + T * (Math.floor(i / nx) + .5)));
  inst(new THREE.BoxGeometry(.1, .08, hallLen), gridM, nx + 1, (o, i) => o.position.set(-hallW / 2 + i * T, ceil - .04, hallMid));
  inst(new THREE.BoxGeometry(hallW, .08, .1), gridM, nz + 1, (o, i) => o.position.set(0, ceil - .04, z0 + i * T));

  // LED strips on every TRY stand (the light pillars of the showroom reference)
  const strips = [];
  for (const st of stands) for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; strips.push([st.x + Math.cos(a) * 1.11, st.z + Math.sin(a) * 1.11, a]); }
  inst(new THREE.BoxGeometry(.035, .96, .035), ledM, strips.length, (o, i) => { o.position.set(strips[i][0], .53, strips[i][1]); o.rotation.y = -strips[i][2]; });

  // dark theme: a small pool of spotlights that jumps to the bays around the player (robot + stand per bay)
  const spots = [];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.SpotLight('#fff3e2', 0, 20, .5, .85, 1.5); sp.position.set(0, ceil - .3, 0); scene.add(sp, sp.target); spots.push(sp);
  }
  const targets = bays.flatMap(b => [b.robot, b.stand]);
  // the hero gets its own soft key light from above-front, like a product shot
  const key = new THREE.SpotLight('#fff6ec', 0, 14, .5, .8, 1.5); key.castShadow = true; key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -.0005;
  scene.add(key, key.target);

  let n = 0, mode = 'dark';

  const THEMES = {
    dark: {panel: '#0c0d0d', seam: '#030303', grid: '#060606', glow: [.24, .25, .26], led: [1.2, 1.15, 1.05], spot: 480},
    light: {panel: '#b4bac0', seam: '#7d848a', grid: '#6f767c', glow: [1.1, 1.13, 1.17], led: [2.0, 2.05, 2.1], spot: 0},
  };
  const api = {
    setLit(on) { for (const s of spots) s.visible = on; key.visible = on; }, // whole lights off outside the hall (no shading, no shadow map)
    setTheme(t) {
      mode = t; const c = THEMES[t] || THEMES.dark;
      panelM.color.set(c.panel); seamM.color.set(c.seam); gridM.color.set(c.grid); glowM.color.setRGB(...c.glow); ledM.color.setRGB(...c.led);
      for (const s of spots) s.intensity = c.spot; key.intensity = c.spot * .4; key.castShadow = c.spot > 0;
    },
    update(x, z, yaw = 0) {
      key.position.set(x - Math.sin(yaw) * 2.2, ceil - .4, z - Math.cos(yaw) * 2.2); key.target.position.set(x, .9, z);
      if (mode === 'dark' && n++ % 20 === 0) { // nearest bays get the spot pools
        const near = targets.map(p => [p, Math.hypot(p.x - x, p.z - z)]).sort((a, b) => a[1] - b[1]).slice(0, spots.length);
        near.forEach(([p], i) => { spots[i].position.set(p.x * .8, ceil - .3, p.z); spots[i].target.position.set(p.x, 0, p.z); });
      }
      // reflections come from the studio HDRI (lookdev.js): a live cube capture cost 6 extra scene renders,
      // stuttered while walking and reflected the hero itself
    },
  };
  void box;
  return api;
}
