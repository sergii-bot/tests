// Smoke test for the local room server: node tools/smoke-local.mjs (server must be running on :8787)
const URL_ = process.env.WS || 'ws://127.0.0.1:8787/ws/';
const room = 'smoke-' + Math.random().toString(36).slice(2, 8);
const wait = ms => new Promise(r => setTimeout(r, ms));
function open(id) {
  return new Promise(res => {
    const ws = new WebSocket(URL_ + room), frames = [];
    ws.onmessage = e => { try { frames.push(JSON.parse(e.data)); } catch {} };
    ws.onopen = () => { ws.send(JSON.stringify({type: 'join', playerId: id})); res({ws, frames,
      act: a => ws.send(JSON.stringify({type: 'action', action: a})),
      next: async p => { for (let i = 0; i < 200; i++) { const f = frames.find(p); if (f) return f; await wait(10); } throw Error('timeout ' + id); }}); };
  });
}
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const a = await open('alice'), b = await open('bob');
let f = await b.next(f => f.view?.players?.bob);
ok(JSON.stringify(Object.keys(f.view.players)) === '["alice","bob"]', 'two players seated');
a.act({kind: 'move', dx: .5, dz: 0, yaw: 1, _stamp: 7});
f = await b.next(f => f.view?.players.alice.x === .5); ok(f.echo === undefined, 'movement broadcast, echo only to sender');
ok((await a.next(f => f.echo === 7)).serverTime < 1e15, 'server clock');
a.frames.length = 0; a.act({kind: 'move', dx: 100, dz: 0, yaw: 0}); ok((await a.next(f => f.type === 'error')).error === 'movement', 'teleport rejected');
const extra = []; for (let i = 0; i < 3; i++) extra.push(await open('p' + i));
const s = extra[2]; await wait(50); s.frames.length = 0; s.act({kind: 'move', dx: .1, dz: 0, yaw: 0});
ok((await s.next(f => f.type === 'error')).error === 'spectators cannot act', '5th visitor spectates');
[a, b, ...extra].forEach(p => p.ws.close());
