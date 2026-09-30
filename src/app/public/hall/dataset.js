// Player dataset: every TRY session becomes an "episode" the visitor collected.
// Stored in this browser only (localStorage). Nothing is sent anywhere; the visitor can export it as JSON.
// Stands can add rich samples with api.record(kind, data), e.g. a demo trajectory or a drawn terrain.
const KEY = 'skild-hall:dataset:v1';
const MAX_EPISODES = 400, MAX_SAMPLES = 60;

function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {episodes: []}; } catch { return {episodes: []}; } }
const db = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { db.episodes.splice(0, Math.ceil(db.episodes.length / 4)); try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} } };
const listeners = new Set();
const emit = () => listeners.forEach(f => f(stats()));

export function onChange(fn) { listeners.add(fn); fn(stats()); return () => listeners.delete(fn); }

export function stats() {
  const frames = db.episodes.reduce((a, e) => a + e.frames, 0);
  const releases = new Set(db.episodes.map(e => e.release)).size;
  const seconds = db.episodes.reduce((a, e) => a + e.seconds, 0);
  // "Brain level" of the visitor's own shared brain: grows with diverse data (more stands = more embodiments/tasks)
  const level = Math.floor(Math.log2(1 + frames / 40) + releases * 0.5);
  return {episodes: db.episodes.length, frames, releases, seconds: Math.round(seconds), level};
}

export function startEpisode(release) {
  const ep = {id: Math.random().toString(36).slice(2, 10), release: release.id, code: release.code, stand: release.try.title,
    started: new Date().toISOString(), seconds: 0, frames: 0, inputs: {pointer: 0, drag: 0, key: 0}, completed: false, samples: []};
  const t0 = performance.now();
  return {
    ep,
    input(kind) { ep.frames++; ep.inputs[kind] = (ep.inputs[kind] || 0) + 1; },
    record(kind, data) { if (ep.samples.length < MAX_SAMPLES) ep.samples.push({t: +((performance.now() - t0) / 1000).toFixed(2), kind, data}); ep.frames += 5; },
    complete() { ep.completed = true; },
    end() {
      ep.seconds = +((performance.now() - t0) / 1000).toFixed(1);
      if (ep.frames > 0 || ep.completed) { db.episodes.push(ep); if (db.episodes.length > MAX_EPISODES) db.episodes.shift(); save(); emit(); }
      return ep;
    },
  };
}

export function byRelease() {
  const m = new Map();
  for (const e of db.episodes) { const r = m.get(e.release) || {release: e.release, code: e.code, stand: e.stand, episodes: 0, frames: 0, completed: 0, seconds: 0}; r.episodes++; r.frames += e.frames; r.seconds += e.seconds; if (e.completed) r.completed++; m.set(e.release, r); }
  return [...m.values()];
}

export function exportJSON() {
  const blob = new Blob([JSON.stringify({format: 'skild-release-hall/player-dataset@1', exported: new Date().toISOString(), ...stats(), episodes: db.episodes}, null, 2)], {type: 'application/json'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `skild-hall-dataset-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function clear() { db.episodes = []; save(); emit(); }
