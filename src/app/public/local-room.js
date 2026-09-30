// In-browser room: runs the same game rules as server.mjs, so the game works with no server at all.
// It speaks the WebSocket protocol client.js already uses (join / action / reset → state / error).
import {setup, validateAction, applyAction, viewFor} from './logic.js';

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export class LocalSocket {
  static OPEN = 1;
  constructor(room) {
    this.readyState = LocalSocket.OPEN;
    this.key = 'omni:local-room:' + room;
    this.listeners = {open: [], message: [], close: []};
    const saved = store.get(this.key);
    this.seats = saved?.seats || [];
    this.state = saved?.state || setup([]);
    if (this.state.version !== 3) this.run(this.seats[0], {kind: 'migrate'});
    setTimeout(() => this.emit('open', {}), 0);
  }
  addEventListener(type, fn) { this.listeners[type]?.push(fn); }
  emit(type, e) { for (const fn of this.listeners[type]) fn(e); }
  reply(obj) { const data = JSON.stringify(obj); setTimeout(() => this.emit('message', {data}), 0); }
  run(pid, action) {
    const a = {...action, _now: Date.now()};
    const v = validateAction(this.state, pid, a);
    if (!v.ok) return v.error;
    this.state = applyAction(this.state, pid, a);
    return null;
  }
  frame(extra = {}) {
    return {type: 'state', status: 'playing', seats: this.seats, view: viewFor(this.state, this.pid), serverTime: Date.now(), ...extra};
  }
  save() { store.set(this.key, {seats: this.seats, state: this.state}); }
  send(text) {
    if (text === '__ping') { this.reply('__pong'); return; }
    let m; try { m = JSON.parse(text); } catch { return; }
    if (m.type === 'join') {
      this.pid = String(m.playerId);
      const old = this.seats[0];
      if (old && old !== this.pid && this.state.players[old]) {
        // Solo play: a new tab or session keeps the same body and progress.
        const {[old]: body, ...rest} = this.state.players;
        this.state = {...this.state, players: {[this.pid]: body, ...rest}};
        this.seats = [this.pid, ...this.seats.slice(1).filter(id => id !== this.pid)];
      } else if (!this.seats.includes(this.pid)) {
        this.seats.push(this.pid);
        this.run(this.pid, {kind: 'register'});
      }
      this.save();
      this.reply(this.frame());
      return;
    }
    if (m.type === 'reset') {
      this.state = setup(this.seats);
      this.save();
      this.reply(this.frame());
      return;
    }
    if (m.type === 'action') {
      const a = m.action && typeof m.action === 'object' ? m.action : {};
      if (a.kind === 'register' || a.kind === 'migrate') { this.reply({type: 'error', error: 'invalid action'}); return; }
      const {_stamp, _now, ...clean} = a;
      const e = this.run(this.pid, clean);
      if (e) { this.reply({type: 'error', error: e}); return; }
      this.save();
      this.reply(this.frame(_stamp !== undefined ? {echo: _stamp} : {}));
    }
  }
  close() {}
}
