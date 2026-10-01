// LOOKDEV — photo-real surfaces and image-based light for the lab (Poly Haven CC0 scans + HDRI, assets/tex, assets/hdri).
// The HDRI lights every PBR material (soft reflections on robot shells, glossy floor); scanned textures replace flat colours.
//   await installLookdev(THREE, renderer, scene, {floor, wall}, robotRoots)
const TEX = '../assets/tex/', HDRI = '../assets/hdri/';

// minimal Radiance .hdr (RGBE, RLE) reader → Float32 RGBA DataTexture
function parseHDR(THREE, buf) {
  const u8 = new Uint8Array(buf); let p = 0;
  const line = () => { let s = ''; while (p < u8.length && u8[p] !== 10) s += String.fromCharCode(u8[p++]); p++; return s; };
  let l, w = 0, h = 0;
  while ((l = line()) !== '' || !w) { const m = /^-Y (\d+) \+X (\d+)/.exec(l); if (m) { h = +m[1]; w = +m[2]; break; } if (p >= u8.length) throw new Error('bad hdr'); }
  const out = new Float32Array(w * h * 4), scan = new Uint8Array(w * 4);
  for (let y = 0; y < h; y++) {
    if (u8[p] === 2 && u8[p + 1] === 2 && !(u8[p + 2] & 0x80)) {
      p += 4;
      for (let c = 0; c < 4; c++) for (let x = 0; x < w;) {
        let n = u8[p++];
        if (n > 128) { n -= 128; const v = u8[p++]; while (n--) scan[(x++) * 4 + c] = v; } else while (n--) scan[(x++) * 4 + c] = u8[p++];
      }
    } else { for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) scan[x * 4 + c] = u8[p++]; }
    for (let x = 0; x < w; x++) {
      const e = scan[x * 4 + 3], f = e ? Math.pow(2, e - 136) : 0, o = (y * w + x) * 4;
      out[o] = scan[x * 4] * f; out[o + 1] = scan[x * 4 + 1] * f; out[o + 2] = scan[x * 4 + 2] * f; out[o + 3] = 1;
    }
  }
  const t = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.FloatType);
  t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.LinearSRGBColorSpace; t.flipY = true; t.needsUpdate = true;
  return t;
}

export async function loadEnv(THREE, renderer, name) {
  const tex = parseHDR(THREE, await (await fetch(HDRI + name)).arrayBuffer());
  const pm = new THREE.PMREMGenerator(renderer); const rt = pm.fromEquirectangular(tex); tex.dispose(); pm.dispose();
  return rt.texture;
}

function scan(THREE, renderer, name, repeat) {
  const L = new THREE.TextureLoader(), an = renderer.capabilities.getMaxAnisotropy();
  const one = (m, srgb, mat, slot) => { const t = L.load(`${TEX}${name}_${m}_2k.jpg`, () => { if (mat) { mat[slot] = t; mat.needsUpdate = true; } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); t.anisotropy = an; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return mat => { one('nor_gl', false, mat, 'normalMap'); one('rough', false, mat, 'roughnessMap'); }; // maps attach on load: a missing file never turns a surface black
}

export async function installLookdev(THREE, renderer, scene, M, {hallLen = 200, hallW = 30} = {}) {
  // floor: polished concrete, slightly glossy so lights and robots reflect softly
  scan(THREE, renderer, 'concrete_floor_02', [hallW / 2.5, hallLen / 2.5])(M.floor); // relief + gloss of the scan, not its dirt
  M.floor.normalScale = new THREE.Vector2(.15, .15); M.floor.envMapIntensity = .5; M.floor.needsUpdate = true; // smooth studio floor (Miele reference)
  // walls: fine plaster scan, matte
  scan(THREE, renderer, 'plastered_wall_04', [hallLen / 6, 7.5 / 6])(M.wall); M.wall.roughness = 1;
  M.wall.normalScale = new THREE.Vector2(.5, .5); M.wall.envMapIntensity = .6; M.wall.needsUpdate = true;
  scene.environment = await loadEnv(THREE, renderer, 'studio_small_09_2k.hdr');
  // intensity is set per theme by hall.js applyTheme (dark studio .12, light showroom .85)
}

// robot shells: satin plastic + clearcoat; dark parts become anodised metal (matches stills 9, 10, 11)
export function upgradeRobot(THREE, root) {
  const done = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.material || o.material.isMeshBasicMaterial || o.userData.decal || o.material.transparent) return; // decals keep their own (transparent) material
    const src = o.material; if (done.has(src)) { o.material = done.get(src); return; }
    const c = src.color || new THREE.Color(1, 1, 1), l = c.r * .3 + c.g * .59 + c.b * .11;
    const m = new THREE.MeshPhysicalMaterial({color: c.clone(), map: src.map || null,
      roughness: l > .5 ? .38 : .28, metalness: l > .5 ? 0 : .65, clearcoat: l > .5 ? .35 : .15, clearcoatRoughness: .35, envMapIntensity: .9});
    done.set(src, m); o.material = m; o.castShadow = o.receiveShadow = true;
  });
}
