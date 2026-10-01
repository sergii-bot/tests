// Real-time presence: other visitors in the lab, as avatars with a name tag and what they're doing.
// Talks to server.mjs (/presence/<room>) locally, or to the Cloudflare relay in presence-config.js on GitHub Pages.
// Each visitor appears as the robot they picked (makeBody), with a name tag. No relay: it quietly stays offline.
import * as THREE from '../vendor/three.module.js';
import {CSS3DObject} from '../vendor/CSS3DRenderer.js';
import {PRESENCE_URL} from './presence-config.js';

const COLORS = ['#ff7e00', '#2e3a47', '#8e8177', '#5c6670', '#f97316', '#1b222b'];
const hash = s => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function startPresence({scene, sceneTop, room = 'lab', getState, onCount, makeBody}) {
  // one id per browser (shared by all its tabs), so you never see yourself from another tab
  const id = (() => { try { let v = localStorage.getItem('skild-hall:uid'); if (!v) { v = Math.random().toString(36).slice(2, 10); localStorage.setItem('skild-hall:uid', v); } return v; } catch { return Math.random().toString(36).slice(2, 10); } })();
  const peers = new Map();
  let ws = null, retry = 0, sendT = 0;

  function avatar(p) {
    const g = new THREE.Group(), col = COLORS[hash(p.id) % COLORS.length];
    const mat = new THREE.MeshStandardMaterial({color: col, roughness: .5, metalness: .2});
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.28, .34, 1.15, 20), mat); body.position.y = .78; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 20, 14), new THREE.MeshStandardMaterial({color: '#161616', roughness: .4})); head.position.y = 1.6;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(.3, .07, .08), new THREE.MeshBasicMaterial({color: '#ffb366', toneMapped: false})); visor.position.set(0, 1.62, -.21);
    const ring = new THREE.Mesh(new THREE.RingGeometry(.45, .5, 32), new THREE.MeshBasicMaterial({color: col, toneMapped: false})); ring.rotation.x = -Math.PI / 2; ring.position.y = .01;
    g.add(body, head, visor, ring); scene.add(g);
    const tag = document.createElement('div'); tag.className = 'w-peer';
    const label = new CSS3DObject(tag); label.scale.setScalar(.005); sceneTop.add(label);
    const a = {g, label, tag, x: p.x, z: p.z, yaw: p.yaw, hero: null, body: null, ring, stand: [body, head, visor], speed: 0};
    return a;
  }

  function connect() {
    if (location.protocol === 'file:' || new URLSearchParams(location.search).has('debug')) return; // test sessions stay invisible
    // local server.mjs serves both the game and the relay; GitHub Pages is static, so it needs the Cloudflare relay
    const base = PRESENCE_URL ? PRESENCE_URL.replace(/\/$/, '') : /github\.io$/.test(location.hostname) ? '' : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
    if (!base) return;
    try { ws = new WebSocket(`${base}/presence/${encodeURIComponent(room)}`); } catch { return; }
    ws.onopen = () => { retry = 0; };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t !== 'peers') return;
      const seen = new Set();
      for (const p of m.peers) {
        if (p.id === id) continue; seen.add(p.id);
        let a = peers.get(p.id); if (!a) { a = avatar(p); peers.set(p.id, a); }
        Object.assign(a, {tx: p.x, tz: p.z, tyaw: p.yaw, name: p.name, doing: p.doing, level: p.level});
        if (makeBody && p.hero && p.hero !== a.hero) { // swap the stand-in capsule for their robot
          a.hero = p.hero; const want = p.hero;
          makeBody(want).then(b => { if (a.hero !== want || !peers.has(p.id)) { b.dispose?.(); return; } a.body?.dispose?.(); a.body?.group.removeFromParent(); a.body = b; a.g.add(b.group); for (const m of a.stand) m.visible = false; }).catch(() => {});
        }
        a.tag.innerHTML = `<b>${esc(p.name)}</b>${p.doing ? `<span>${esc(p.doing)}</span>` : ''}${p.level ? `<i>L${p.level}</i>` : ''}`;
      }
      for (const [pid, a] of peers) if (!seen.has(pid)) { a.body?.dispose?.(); scene.remove(a.g); sceneTop.remove(a.label); peers.delete(pid); }
      onCount?.(peers.size + 1);
    };
    ws.onclose = () => { ws = null; for (const [pid, a] of peers) { a.body?.dispose?.(); scene.remove(a.g); sceneTop.remove(a.label); peers.delete(pid); } onCount?.(1); if (retry < 6) setTimeout(connect, 1000 * 2 ** retry++); };
    ws.onerror = () => {};
  }
  connect();
  // send on a timer (not in the render loop) so a background tab still shows up for others
  setInterval(() => { if (ws?.readyState === 1) ws.send(JSON.stringify({t: 'state', id, ...getState()})); }, 120);

  return {
    id,
    update(dt, camera) {
      const k = 1 - Math.exp(-dt * 10);
      for (const a of peers.values()) {
        const ox = a.x, oz = a.z;
        a.x += (a.tx - a.x) * k; a.z += (a.tz - a.z) * k; a.yaw += (a.tyaw - a.yaw) * k;
        a.g.position.set(a.x, 0, a.z); a.g.rotation.y = a.yaw;
        a.speed += (Math.hypot(a.x - ox, a.z - oz) / Math.max(dt, 1e-3) - a.speed) * Math.min(1, dt * 6);
        a.body?.update(performance.now() / 1000, a.speed, dt);
        a.label.position.set(a.x, 2.35, a.z);
        a.label.rotation.y = Math.atan2(camera.position.x - a.x, camera.position.z - a.z);
      }
    },
  };
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
