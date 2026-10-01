// HARDWARE LAB — "Japanese tech" dressing from the director's references:
// charred-wood slat walls, a glowing green glass-block wall with foliage behind it, a coffered concrete ceiling,
// glossy dark-green terrazzo, paper lanterns, ferns, and leaf-dappled light on the floor.
// Pure dressing: the lab's layout, stations, collisions and CSS signs are untouched (everything sits behind them).
export function dressJapanLab(THREE, scene, {HX, HZ, HW, HD}) {
  const g = new THREE.Group(); scene.add(g);
  const x0 = HX - HW / 2, x1 = HX + HW / 2, z0 = HZ - HD / 2, z1 = HZ + HD / 2, H = 7.0;
  const inst = (geo, mat, n, fn, shadow = false) => { const m = new THREE.InstancedMesh(geo, mat, n), o = new THREE.Object3D(); for (let i = 0; i < n; i++) { fn(o, i, m); o.updateMatrix(); m.setMatrixAt(i, o.matrix); } m.receiveShadow = true; m.castShadow = shadow; g.add(m); return m; };
  const canvasTex = (w, h, draw, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();

  // floor: dark green terrazzo, polished (reflects the glass wall and lanterns)
  const terr = canvasTex(1024, 1024, (x, w, h) => {
    x.fillStyle = '#0f2a22'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const r = rnd() * 2.6 + .4; x.fillStyle = ['#1d4436', '#0a1d17', '#2c5a48', '#c9d6cf'][rnd() < .03 ? 3 : (rnd() * 3) | 0]; x.globalAlpha = .55; x.beginPath(); x.arc(rnd() * w, rnd() * h, r, 0, 7); x.fill(); }
    x.globalAlpha = 1;
  });
  terr.wrapS = terr.wrapT = THREE.RepeatWrapping; terr.repeat.set(HW / 4, HD / 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HW, HD), new THREE.MeshPhysicalMaterial({map: terr, roughness: .38, clearcoat: .4, clearcoatRoughness: .4, envMapIntensity: 1.2}));
  floor.rotation.x = -Math.PI / 2; floor.position.set(HX, .002, HZ); floor.receiveShadow = true; g.add(floor);

  // charred-wood slats (shou sugi ban) on the west, north and south walls
  const wood = canvasTex(256, 1024, (x, w, h) => { x.fillStyle = '#0c0d0c'; x.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { x.strokeStyle = rnd() < .5 ? '#191a18' : '#050505'; x.lineWidth = rnd() * 3 + 1; x.beginPath(); const xx = rnd() * w; x.moveTo(xx, 0); x.bezierCurveTo(xx + 8, h * .3, xx - 8, h * .6, xx + rnd() * 6, h); x.stroke(); } });
  const slatM = new THREE.MeshStandardMaterial({map: wood, roughness: .82, metalness: 0});
  const SW = .14, gap = .02;
  const wallSlats = (ax, a, b, fixed, inward) => { const n = Math.floor((b - a) / (SW + gap)); return inst(new THREE.BoxGeometry(ax === 'z' ? SW : .05, H, ax === 'z' ? .05 : SW), slatM, n, (o, i) => { const t = a + (i + .5) * (SW + gap); if (ax === 'z') o.position.set(t, H / 2, fixed + inward * .03); else o.position.set(fixed + inward * .03, H / 2, t); }); };
  wallSlats('x', z0, z1, x0, 1);            // west
  wallSlats('z', x0, x1, z0, 1);            // north
  wallSlats('z', x0, HX - 1.8, z1, -1);     // south, left of the door
  wallSlats('z', HX + 1.8, x1, z1, -1);     // south, right of the door

  // east wall: glass blocks with green light and foliage behind them
  const foliage = canvasTex(512, 512, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#6fae7d'); gr.addColorStop(1, '#1f4a33'); x.fillStyle = gr; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) { x.fillStyle = `hsla(${100 + rnd() * 40}, ${35 + rnd() * 30}%, ${18 + rnd() * 35}%, .55)`; x.beginPath(); x.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 22, 3 + rnd() * 9, rnd() * 3, 0, 7); x.fill(); }
  });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(HD, H), new THREE.MeshBasicMaterial({map: foliage, toneMapped: true, color: new THREE.Color(2.0, 2.3, 2.0)}));
  back.position.set(x1 - .01, H / 2, HZ); back.rotation.y = -Math.PI / 2; g.add(back);
  const B = .3, cols = Math.floor(HD / B), rows = Math.floor(H / B);
  // pressed-glass relief: a wavy height field per block → normal map (the rippled blocks of the references)
  const ripple = (() => { const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N), hgt = (u, v) => Math.sin(u * 9.4 + Math.sin(v * 5.1) * 1.7) * .5 + Math.sin(v * 11.3 + Math.cos(u * 4.3) * 2.1) * .35 + Math.sin((u + v) * 23) * .08;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const u = i / N, v = j / N, e = 1 / N, dx = (hgt(u + e, v) - hgt(u - e, v)) * 6, dy = (hgt(u, v + e) - hgt(u, v - e)) * 6, edge = Math.min(u, v, 1 - u, 1 - v) < .06 ? 1 : 0, o = (j * N + i) * 4;
      im.data[o] = 128 + Math.max(-127, Math.min(127, (-dx + (edge && u < .5 ? -2 : edge && u > .5 ? 2 : 0)) * 60)); im.data[o + 1] = 128 + Math.max(-127, Math.min(127, (-dy + (edge && v < .5 ? -2 : edge && v > .5 ? 2 : 0)) * 60)); im.data[o + 2] = 255; im.data[o + 3] = 255; }
    x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; return t; })();
  const glassM = new THREE.MeshPhysicalMaterial({color: '#cdeedd', roughness: .08, metalness: 0, transmission: .92, thickness: .09, ior: 1.5, normalMap: ripple, normalScale: new THREE.Vector2(.9, .9), clearcoat: 1, clearcoatRoughness: .05, attenuationColor: new THREE.Color('#7fc79b'), attenuationDistance: .25, envMapIntensity: 1.3});
  inst(new THREE.BoxGeometry(.1, B - .025, B - .025), glassM, cols * rows, (o, i) => o.position.set(x1 - .12, (Math.floor(i / cols) + .5) * B, z0 + (i % cols + .5) * B + (HD - cols * B) / 2));
  inst(new THREE.BoxGeometry(.06, .02, HD), new THREE.MeshStandardMaterial({color: '#20302a', roughness: .6}), rows + 1, (o, i) => o.position.set(x1 - .12, i * B, HZ));
  const wash = new THREE.PointLight('#9fd8b0', 70, 22, 1.4); wash.position.set(x1 - 3, 6.2, HZ); g.add(wash);

  // coffered concrete ceiling
  const conc = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#4a4b48'; x.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${rnd() < .5 ? '20,20,20' : '120,118,112'},${rnd() * .18})`; x.fillRect(rnd() * w, rnd() * h, rnd() * 4, rnd() * 4); } });
  const concM = new THREE.MeshStandardMaterial({map: conc, roughness: .95});
  const lid = new THREE.Mesh(new THREE.PlaneGeometry(HW, HD), concM); lid.rotation.x = Math.PI / 2; lid.position.set(HX, H, HZ); g.add(lid);
  const C = 2.6, nx = Math.floor(HW / C), nz = Math.floor(HD / C);
  inst(new THREE.BoxGeometry(.35, .6, HD), concM, nx + 1, (o, i) => o.position.set(x0 + i * HW / nx, H - .3, HZ));
  inst(new THREE.BoxGeometry(HW, .6, .35), concM, nz + 1, (o, i) => o.position.set(HX, H - .3, z0 + i * HD / nz));

  // paper lanterns (warm cubes on the floor), each a small warm light
  const paper = new THREE.MeshBasicMaterial({color: new THREE.Color(1.5, 1.2, .8), toneMapped: false});
  const lanterns = [[x0 + 1.2, z0 + 1.2], [x0 + 1.2, z1 - 1.2], [x1 - 1.4, z0 + 1.4], [x1 - 1.4, z1 - 1.4], [HX - 3.2, z1 - 1.3], [HX + 3.2, z1 - 1.3]];
  inst(new THREE.BoxGeometry(.34, .62, .34), paper, lanterns.length, (o, i) => o.position.set(lanterns[i][0], .31, lanterns[i][1]));
  inst(new THREE.BoxGeometry(.38, .03, .38), new THREE.MeshStandardMaterial({color: '#1a120c', roughness: .6}), lanterns.length * 2, (o, i) => o.position.set(lanterns[i >> 1][0], i & 1 ? .63 : .015, lanterns[i >> 1][1]));
  // two real lights stand in for all six lanterns (each extra light costs every material in the scene)
  for (const [x, z] of [[HX - 3.2, z1 - 1.3], [x1 - 1.4, z0 + 1.4]]) { const l = new THREE.PointLight('#ffc98a', 22, 9, 1.8); l.position.set(x, .7, z); g.add(l); }

  // ferns: fronds as alpha-cut planes, clustered along the glass wall and in the corners
  const frond = canvasTex(256, 512, (x, w, h) => {
    x.clearRect(0, 0, w, h); x.strokeStyle = '#2f5a2a'; x.lineWidth = 4; x.beginPath(); x.moveTo(w / 2, h); x.quadraticCurveTo(w / 2 + 10, h / 2, w / 2, 8); x.stroke();
    for (let y = 26; y < h - 8; y += 7) { const len = Math.max(6, (1 - Math.abs(y / h - .55) * 1.7) * w * .47);
      for (const s of [-1, 1]) { // each pinna: a row of small lobes, lighter at the tip
        for (let k = 0; k < len; k += 5) { const t = k / len; x.fillStyle = `hsl(${100 + rnd() * 22}, ${45 + rnd() * 15}%, ${18 + t * 18 + rnd() * 8}%)`; x.beginPath(); x.ellipse(w / 2 + s * (k + 3), y - t * 10, 3.4 * (1 - t * .6), 2.4, s * .5, 0, 7); x.fill(); } } }
    x.strokeStyle = '#7fa25a'; x.lineWidth = 2; x.beginPath(); x.moveTo(w / 2, h); x.quadraticCurveTo(w / 2 + 10, h / 2, w / 2, 8); x.stroke();
  });
  const frondM = new THREE.MeshStandardMaterial({map: frond, alphaTest: .45, side: THREE.DoubleSide, roughness: .7});
  const clumps = [[x1 - 1.1, z0 + 4], [x1 - 1.1, HZ - 3], [x1 - 1.1, HZ + 4.5], [x1 - 1.1, z1 - 4], [x0 + 1.1, z0 + 3.2], [x0 + 1.1, z1 - 3.2]];
  const frondGeo = new THREE.PlaneGeometry(.5, 1.25); frondGeo.translate(0, .62, 0);
  inst(frondGeo, frondM, clumps.length * 22, (o, i) => { const [cx, cz] = clumps[(i / 22) | 0], a = (i % 22) / 22 * Math.PI * 2 + rnd() * .4; o.position.set(cx + Math.cos(a) * .12, 0, cz + Math.sin(a) * .12); o.rotation.set(0, -a + Math.PI / 2, 0); o.rotateX(.55 + rnd() * .5); o.scale.setScalar(.8 + rnd() * .7); }, true);

  // leaf-dappled skylight: a spotlight projecting a canopy pattern through the coffers
  const leaves = canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(255,244,220,${.35 + rnd() * .6})`; x.beginPath(); x.ellipse(rnd() * w, rnd() * h, 4 + rnd() * 16, 3 + rnd() * 9, rnd() * 3, 0, 7); x.fill(); } x.filter = 'blur(2px)'; x.drawImage(x.canvas, 0, 0); });
  const sky = new THREE.SpotLight('#fff1d8', 900, 30, .62, .35, 1.2);
  sky.position.set(HX + 2, H + 6, HZ - 1); sky.target.position.set(HX - 1, 0, HZ + 1); sky.map = leaves; sky.castShadow = true; sky.shadow.mapSize.set(1024, 1024); sky.shadow.bias = -.0004;
  g.add(sky, sky.target);
  // warm work lights over the bench and the teleop desk, soft fill under the coffers
  for (const [x, z] of [[HX - 5, HZ + 1], [HX + 6, HZ + 2], [HX, z0 + 6.5]]) { const w = new THREE.SpotLight('#ffe2b8', 320, 14, .7, .7, 1.3); w.position.set(x, H - .7, z); w.target.position.set(x, 0, z); g.add(w, w.target); }
  const fill = new THREE.PointLight('#d9cbb4', 60, 30, 1); fill.position.set(HX, H - 1.2, HZ); g.add(fill);
  return {group: g};
}
