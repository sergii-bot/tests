// CINEMA LOOK — the director's film grade as a post pipeline (see LOOK_BIBLE.md).
// scene → HDR target (MSAA) → bloom/halation (¼ res) → grade pass (filmic tonemap, lifted blacks, teal split-tone,
// chromatic aberration, barrel, vignette, motion smear via previous frame) → screen.
// Alpha is kept, so the CSS3D screens behind the canvas still show through their holes.
// A DOM overlay adds 35 mm grain, gate weave and the thin grid on top of everything (WebGL and CSS layers alike).
//   const cine = createCinema(THREE, renderer); cine.render(scene, camera, dt);  cine.setSize(w, h);  cine.enabled = false;
export function createCinema(THREE, renderer) {
  const opt = {type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace, depthBuffer: true};
  const hdr = new THREE.WebGLRenderTarget(1, 1, {...opt, samples: 4});
  const lo = () => new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, depthBuffer: false});
  const bA = lo(), bB = lo();
  const prev = [new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, depthBuffer: false}), new THREE.WebGLRenderTarget(1, 1, {type: THREE.HalfFloatType, depthBuffer: false})];
  let pi = 0;

  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  const qScene = new THREE.Scene(); qScene.add(quad);
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
  const mat = (fs, uniforms) => new THREE.ShaderMaterial({vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, toneMapped: false});

  const bright = mat(`varying vec2 vUv; uniform sampler2D t; uniform float thr;
    void main(){ vec4 c = texture2D(t, vUv); float l = dot(c.rgb, vec3(.2126,.7152,.0722)); gl_FragColor = vec4(c.rgb * smoothstep(thr, thr + .6, l), 1.); }`,
    {t: {value: null}, thr: {value: 2.2}});
  const blur = mat(`varying vec2 vUv; uniform sampler2D t; uniform vec2 d;
    void main(){ vec3 s = texture2D(t, vUv).rgb * .227;
      s += (texture2D(t, vUv + d * 1.385).rgb + texture2D(t, vUv - d * 1.385).rgb) * .316;
      s += (texture2D(t, vUv + d * 3.231).rgb + texture2D(t, vUv - d * 3.231).rgb) * .07;
      gl_FragColor = vec4(s, 1.); }`, {t: {value: null}, d: {value: new THREE.Vector2()}});

  // the grade: every number here is a look decision from the director's stills
  const grade = mat(`varying vec2 vUv;
    uniform sampler2D t, bloom, prev; uniform float exposure, smear, ca, barrel, vig, bloomK, time, on;
    uniform vec3 shadowTint, highTint, liftC;
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
    void main(){
      vec2 p = vUv - .5; float r2 = dot(p, p);
      vec2 uv = .5 + p * (1. + barrel * r2);                     // lens barrel
      vec2 off = p * ca * r2;                                     // chromatic aberration grows to the edges
      vec4 c = texture2D(t, uv);
      vec3 col = vec3(texture2D(t, uv + off).r, c.g, texture2D(t, uv - off).b);
      vec3 b = texture2D(bloom, uv).rgb;
      col += b * bloomK * vec3(1., .93, .82);                     // halation: warm-white glow on lights and robot shells
      col = aces(col * exposure);
      float l = dot(col, vec3(.2126, .7152, .0722));
      col = mix(col, vec3(l), .08);                               // muted, filmic saturation
      col *= mix(shadowTint, highTint, smoothstep(.0, .75, l));   // split tone: teal-green shadows, neutral-warm highs
      col = liftC + col * (1. - liftC);                           // lifted blacks: no pure black anywhere
      col = mix(col, col * col * (3. - 2. * col), .75); // denser, filmic mid contrast           // soft S for a print feel
      col *= 1. - vig * smoothstep(.12, .62, r2 * 1.6);           // vignette
      vec3 pr = texture2D(prev, vUv).rgb;
      col = mix(col, pr, smear);                                  // motion smear: moving shapes leave a soft ghost
      vec3 outc = mix(aces(c.rgb * exposure), col, on);
      gl_FragColor = vec4(outc, c.a);
    }`, {t: {value: null}, bloom: {value: null}, prev: {value: null}, exposure: {value: 1.2}, smear: {value: .25}, ca: {value: .003},
    barrel: {value: .03}, vig: {value: .35}, bloomK: {value: .06}, time: {value: 0}, on: {value: 1},
    shadowTint: {value: new THREE.Color(.9, 1.0, .97)}, highTint: {value: new THREE.Color(1.0, .99, .95)}, liftC: {value: new THREE.Color(.018, .026, .024)}});
  const toScreen = mat(`varying vec2 vUv; uniform sampler2D t;
    vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
    void main(){ vec4 c = texture2D(t, vUv); gl_FragColor = vec4(toSRGB(max(c.rgb, 0.)), c.a); }`, {t: {value: null}});

  function pass(material, target) { quad.material = material; renderer.setRenderTarget(target); renderer.render(qScene, quadCam); }

  // DOM film layer: grain + gate weave + thin grid, over WebGL and CSS3D alike
  const film = document.createElement('div'); film.className = 'film-layer';
  const gc = document.createElement('canvas'); gc.width = gc.height = 192; film.append(gc);
  const grid = document.createElement('div'); grid.className = 'film-grid'; film.append(grid);
  document.body.append(film);
  const gx = gc.getContext('2d'), img = gx.createImageData(192, 192);
  const tiles = Array.from({length: 6}, () => {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { const v = (Math.random() + Math.random() + Math.random()) * 85; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    gx.putImageData(img, 0, 0); return `url(${gc.toDataURL()})`;
  });
  let ti = 0;
  function grain() { film.style.backgroundImage = tiles[ti = (ti + 1) % tiles.length]; film.style.backgroundPosition = `${(Math.random() * 192) | 0}px ${(Math.random() * 192) | 0}px`; }

  let w = 1, h = 1, frameN = 0;
  const api = {
    enabled: true, grade, film,
    setSize(W, H) {
      const pr = renderer.getPixelRatio(); w = Math.max(1, Math.round(W * pr)); h = Math.max(1, Math.round(H * pr));
      hdr.setSize(w, h); prev[0].setSize(w, h); prev[1].setSize(w, h);
      const bw = Math.max(1, w >> 2), bh = Math.max(1, h >> 2); bA.setSize(bw, bh); bB.setSize(bw, bh);
    },
    set(o) { for (const k in o) if (grade.uniforms[k]) { const u = grade.uniforms[k], v = o[k]; if (u.value?.isColor) u.value.setRGB(...v); else u.value = v; } },
    render(scene, camera, dt = 1 / 60) {
      frameN++;
      if (!api.enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); film.hidden = true; frameN = 0; return; }
      film.hidden = false;
      const tm = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(hdr); renderer.clear(); renderer.render(scene, camera);
      bright.uniforms.t.value = hdr.texture; pass(bright, bA);
      for (let i = 0; i < 2; i++) {
        blur.uniforms.t.value = bA.texture; blur.uniforms.d.value.set(1 / bA.width * (1 + i), 0); pass(blur, bB);
        blur.uniforms.t.value = bB.texture; blur.uniforms.d.value.set(0, 1 / bA.height * (1 + i)); pass(blur, bA);
      }
      const out = prev[pi], last = prev[1 - pi]; pi = 1 - pi;
      // smear is frame-rate independent: same ghost length at 30 and 144 fps
      const s0 = api.smear ?? .12; grade.uniforms.smear.value = frameN < 3 ? 0 : Math.pow(s0, Math.min(3, dt * 60));
      grade.uniforms.t.value = hdr.texture; grade.uniforms.bloom.value = bA.texture; grade.uniforms.prev.value = last.texture;
      grade.uniforms.time.value += dt;
      pass(grade, out);
      toScreen.uniforms.t.value = out.texture; renderer.setClearColor(0, 0); pass(toScreen, null);
      renderer.toneMapping = tm;
      // grain removed at the director's request (the grain() tiles stay available)
    },
  };
  return api;
}
