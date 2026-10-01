// Presence relay for the Skild AI Robotics Lab, same protocol as src/app/server.mjs (/presence/<room>):
//   client -> {t:'state', id, name, x, z, yaw, doing, level, hero}   (about 8×/s)
//   server -> {t:'peers', you, peers:[...]}                         (10×/s while anyone is connected)
// One Durable Object per room keeps the sockets. Only names, positions and the chosen robot pass through;
// nothing is stored. Allowed origins: the GitHub Pages site and local development.
const ORIGINS = [/^https:\/\/sergii-bot\.github\.io$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

export default {
  async fetch(req, env) {
    const url = new URL(req.url), m = url.pathname.match(/^\/presence\/([\w-]{1,40})$/);
    if (!m) return new Response('Skild lab presence relay', {status: 200});
    const origin = req.headers.get('Origin') || '';
    if (!ORIGINS.some(r => r.test(origin))) return new Response('forbidden origin', {status: 403});
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', {status: 426});
    return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
  },
};

const num = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
const safeId = s => String(s || '').replace(/[^\w-]/g, '').slice(0, 24) || 'anon';
const HEROES = new Set(['g1', 'h1', 'go2', 'spot', 'drone']);

export class PresenceRoom {
  constructor(state) { this.sockets = new Map(); this.timer = null; }
  async fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    server.accept();
    const sock = {ws: server, pid: null, state: null};
    this.sockets.set(server, sock);
    server.addEventListener('message', e => {
      if (typeof e.data !== 'string' || e.data.length > 2000) return;
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t !== 'state') return;
      sock.pid = sock.pid || safeId(m.id);
      sock.state = {id: sock.pid, name: String(m.name || 'Visitor').slice(0, 24), x: num(m.x, -130, 130), z: num(m.z, -400, 60), yaw: num(m.yaw, -100, 100),
        doing: String(m.doing || '').slice(0, 60), level: num(m.level, 0, 99), hero: HEROES.has(m.hero) ? m.hero : 'g1', at: Date.now()};
    });
    const drop = () => { this.sockets.delete(server); this.broadcast(); if (!this.sockets.size) { clearInterval(this.timer); this.timer = null; } };
    server.addEventListener('close', drop); server.addEventListener('error', drop);
    if (!this.timer) this.timer = setInterval(() => this.broadcast(), 100);
    return new Response(null, {status: 101, webSocket: client});
  }
  broadcast() {
    const byId = new Map(), now = Date.now();
    for (const s of this.sockets.values()) if (s.state && now - s.state.at < 10000 && (!byId.has(s.state.id) || byId.get(s.state.id).at < s.state.at)) byId.set(s.state.id, s.state);
    const peers = [...byId.values()];
    for (const s of this.sockets.values()) { try { s.ws.send(JSON.stringify({t: 'peers', you: s.pid, peers})); } catch {} }
  }
}
