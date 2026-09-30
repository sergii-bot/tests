// OMNI BRAIN — local room server (replaces the Higgsfield/Cloudflare room worker).
// Zero dependencies: static files + a minimal RFC 6455 WebSocket, rooms persisted to ./data.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {setup, validateAction, applyAction, viewFor, meta} from './public/logic.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '127.0.0.1';
fs.mkdirSync(DATA, {recursive: true});

const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.m4a':'audio/mp4','.wav':'audio/wav','.ico':'image/x-icon'};

// ---------- static ----------
function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, {'content-type':'text/plain'}).end('not found'); return; }
    res.writeHead(200, {'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control':'no-cache'}).end(buf);
  });
}

// ---------- rooms ----------
const rooms = new Map();
const safeId = id => String(id).replace(/[^\w-]/g, '').slice(0, 64) || 'default';
function loadRoom(id) {
  if (rooms.has(id)) return rooms.get(id);
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(path.join(DATA, id + '.json'), 'utf8')); } catch {}
  const room = {id, seats: saved?.seats || [], state: saved?.state || setup([]), sockets: new Set()};
  if (room.state.version !== 3) run(room, room.seats[0], {kind:'migrate'});
  rooms.set(id, room);
  return room;
}
function save(room) {
  fs.writeFile(path.join(DATA, room.id + '.json'), JSON.stringify({seats: room.seats, state: room.state}), () => {});
}
// Server-authoritative action: the server clock always wins over anything the client sent.
function run(room, pid, action) {
  const a = {...action, _now: Date.now()};
  const v = validateAction(room.state, pid, a);
  if (!v.ok) return v.error;
  room.state = applyAction(room.state, pid, a);
  return null;
}
function frameFor(room, sock, extra = {}) {
  return {type:'state', status:'playing', seats: room.seats, view: viewFor(room.state, sock.pid), serverTime: Date.now(), ...extra};
}
function broadcast(room, origin, echo) {
  for (const s of room.sockets) if (s.pid) s.send(frameFor(room, s, s === origin && echo !== undefined ? {echo} : {}));
  save(room);
}
function onMessage(sock, text) {
  if (text === '__ping') { sock.sendRaw('__pong'); return; }
  let m; try { m = JSON.parse(text); } catch { return; }
  const room = sock.room;
  const err = e => sock.send({type:'error', error: e});
  if (m.type === 'join') {
    sock.pid = safeId(m.playerId);
    if (!room.seats.includes(sock.pid) && room.seats.length < meta.maxPlayers) {
      room.seats.push(sock.pid);
      run(room, sock.pid, {kind:'register'});
    }
    broadcast(room);
    return;
  }
  if (!sock.pid) return err('join');
  const seated = room.seats.includes(sock.pid);
  if (m.type === 'reset') {
    if (!seated) return err('spectators cannot reset');
    room.state = setup(room.seats);
    broadcast(room);
    return;
  }
  if (m.type === 'action') {
    if (!seated) return err('spectators cannot act');
    const a = m.action && typeof m.action === 'object' ? m.action : {};
    if (a.kind === 'register' || a.kind === 'migrate') return err('invalid action');
    const {_stamp, _now, ...clean} = a;
    const e = run(room, sock.pid, clean);
    if (e) return err(e);
    broadcast(room, sock, _stamp);
  }
}

// ---------- lab presence: see other visitors in real time ----------
const presence = new Map();
function presenceRoom(id) { if (!presence.has(id)) presence.set(id, {id, sockets: new Set()}); return presence.get(id); }
function onPresence(sock, text) {
  let m; try { m = JSON.parse(text); } catch { return; }
  if (m.t !== 'state') return;
  const num = (v, a, b) => Math.max(a, Math.min(b, Number(v) || 0));
  sock.pid = sock.pid || safeId(m.id);
  sock.state = {id: sock.pid, name: String(m.name || 'Visitor').slice(0, 24), x: num(m.x, -50, 50), z: num(m.z, -400, 50), yaw: num(m.yaw, -100, 100),
    doing: String(m.doing || '').slice(0, 60), level: num(m.level, 0, 99), at: Date.now()};
}
function presenceBroadcast(room) {
  const byId = new Map(); for (const s of room.sockets) if (s.state && (!byId.has(s.state.id) || byId.get(s.state.id).at < s.state.at)) byId.set(s.state.id, s.state);
  const peers = [...byId.values()];
  for (const s of room.sockets) s.send({t: 'peers', you: s.pid, peers});
}
setInterval(() => { for (const room of presence.values()) if (room.sockets.size) presenceBroadcast(room); }, 100);

// ---------- research pool: feedback + episodes visitors CHOOSE to contribute (stored locally in ./data) ----------
const RESEARCH = path.join(DATA, 'research'); fs.mkdirSync(RESEARCH, {recursive: true});
function readBody(req, limit = 256 * 1024) { return new Promise((res, rej) => { let n = 0, b = []; req.on('data', c => { n += c.length; if (n > limit) { rej(new Error('too large')); req.destroy(); } else b.push(c); }); req.on('end', () => { try { res(JSON.parse(Buffer.concat(b).toString('utf8') || '{}')); } catch (e) { rej(e); } }); }); }
function appendLine(file, obj) { fs.appendFile(path.join(RESEARCH, file), JSON.stringify(obj) + '\n', () => {}); }
function readLines(file) { try { return fs.readFileSync(path.join(RESEARCH, file), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } }
async function api(req, res) {
  const url = new URL(req.url, 'http://x'), send = (code, obj) => res.writeHead(code, {'content-type': 'application/json'}).end(JSON.stringify(obj));
  try {
    if (req.method === 'POST' && url.pathname === '/api/feedback') { const b = await readBody(req); appendLine('feedback.jsonl', {at: new Date().toISOString(), release: safeId(b.release), useful: Number(b.useful) || 0, next: String(b.next || '').slice(0, 40), note: String(b.note || '').slice(0, 500)}); return send(200, {ok: true}); }
    if (req.method === 'POST' && url.pathname === '/api/contribute') { const b = await readBody(req); const ep = b.episode || {}; appendLine('episodes.jsonl', {at: new Date().toISOString(), release: safeId(ep.release), frames: Number(ep.frames) || 0, seconds: Number(ep.seconds) || 0, completed: !!ep.completed, samples: Array.isArray(ep.samples) ? ep.samples.slice(0, 60) : []}); return send(200, {ok: true}); }
    if (req.method === 'GET' && url.pathname === '/api/research') {
      const fb = readLines('feedback.jsonl'), eps = readLines('episodes.jsonl'), by = {};
      for (const e of eps) { const r = by[e.release] ||= {episodes: 0, frames: 0, completed: 0, samples: 0, useful: 0, votes: 0, next: {}}; r.episodes++; r.frames += e.frames; r.completed += e.completed ? 1 : 0; r.samples += e.samples.length; }
      for (const f of fb) { const r = by[f.release] ||= {episodes: 0, frames: 0, completed: 0, samples: 0, useful: 0, votes: 0, next: {}}; r.useful += f.useful; r.votes++; if (f.next) r.next[f.next] = (r.next[f.next] || 0) + 1; }
      const notes = fb.filter(f => f.note).slice(-30).reverse();
      return send(200, {releases: by, totals: {episodes: eps.length, feedback: fb.length}, notes});
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/crowd/')) { const id = safeId(url.pathname.split('/').pop()); return send(200, {release: id, samples: readLines('episodes.jsonl').filter(e => e.release === id).flatMap(e => e.samples).slice(-400)}); }
    send(404, {error: 'not found'});
  } catch (e) { send(400, {error: String(e.message || e)}); }
}

// ---------- minimal WebSocket ----------
function upgrade(req, socket) {
  const m = new URL(req.url, 'http://x').pathname.match(/^\/(ws|presence)\/([^/]+)$/);
  const key = req.headers['sec-websocket-key'];
  if (!m || !key) { socket.destroy(); return; }
  const kind = m[1], roomId = safeId(decodeURIComponent(m[2]));
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  const sock = {kind, room: kind === 'ws' ? loadRoom(roomId) : presenceRoom(roomId), pid: null,
    sendRaw: t => writeFrame(socket, 0x1, Buffer.from(t)), send: o => writeFrame(socket, 0x1, Buffer.from(JSON.stringify(o)))};
  sock.room.sockets.add(sock);
  let buf = Buffer.alloc(0), parts = [];
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const need = off + (masked ? 4 : 0) + len;
      if (buf.length < need) return;
      let payload = buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) { const mask = buf.subarray(off, off + 4); payload = Buffer.from(payload.map((b, i) => b ^ mask[i & 3])); }
      buf = buf.subarray(need);
      if (op === 0x8) { writeFrame(socket, 0x8, Buffer.alloc(0)); socket.end(); return; }
      if (op === 0x9) { writeFrame(socket, 0xA, payload); continue; }
      if (op === 0x1 || op === 0x2 || op === 0x0) {
        parts.push(payload);
        if (fin) { const text = Buffer.concat(parts).toString('utf8'); parts = []; try { (sock.kind === 'presence' ? onPresence : onMessage)(sock, text); } catch (e) { console.error(e); } }
      }
    }
  });
  const drop = () => { sock.room.sockets.delete(sock); if (sock.kind === 'presence') presenceBroadcast(sock.room); };
  socket.on('close', drop); socket.on('error', drop);
}
function writeFrame(socket, op, payload) {
  if (socket.destroyed) return;
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); return h; })();
  socket.write(Buffer.concat([head, payload]));
}

const server = http.createServer((req, res) => req.url.startsWith('/api/') ? api(req, res) : serveStatic(req, res));
server.on('upgrade', upgrade);
server.listen(PORT, HOST, () => console.log(`OMNI BRAIN local server → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/?room=local`));
