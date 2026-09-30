# Skild AI Release Hall + OMNI BRAIN (local build)

**Release Hall** (`/hall/`): a walkable gallery with one pavilion per Skild release. Each pavilion has a plaque, the official video and a TRY stand. To add a new release, see `RELEASE_PLAYBOOK.md`.
**OMNI BRAIN** (`/`): the co-op robot-learning simulation, ported from Higgsfield on 2026-09-28.

Source: the director's own Higgsfield project export `OMNI-BRAIN-v3-project.zip` (kept in `inbox/`).

## Run
Double-click **Start Skild Release Hall.command**, or run `node src/app/server.mjs` and open http://127.0.0.1:8787/hall/ (the simulation is at http://127.0.0.1:8787/?room=local)
- **Local mode (default):** the game rules run inside the browser (`public/local-room.js`). Movement is instant and progress is saved in the browser. The server only serves files.
- **Co-op:** add `&online` to the URL. Then rooms run on `server.mjs`, with up to 4 players plus spectators.
- **Debug:** add `&debug`. This exposes `window.__omni()` (the input and pause state).
- **English only:** the RU toggle has been removed.

## What changed vs Higgsfield
- `src/app/server.mjs` is new. It is a zero-dependency Node server with static files, WebSocket rooms, a server-authoritative clock and spectators, and it saves progress to `src/app/data/<room>.json`. It replaces the Higgsfield/Cloudflare room worker, which was not in the export.
- Favicon and OG image were moved from the Higgsfield CDN into `public/assets/`. The game now works offline.
- No Higgsfield login.
- `tools/smoke-local.mjs` is a multiplayer smoke test (5 checks). `tools/playthrough-workshop.mjs` builds a dog and a humanoid through the rules.

## Privacy
Server listens on 127.0.0.1 only. Nothing is published. Friends can join only if the director decides to host it (see TODO).

## TODO
- Performance: the workshop ran at 14–23 FPS in Higgsfield's tests. Target is 60 FPS.
- Hosting for friends (director's decision).
- Music-video direction.
