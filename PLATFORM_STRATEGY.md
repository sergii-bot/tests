# Skild Lab: from a release showroom to a company platform (v0.1 · 2026-09-28)

**One sentence:** a browser lab where anyone can watch every Skild release, rebuild the robot from real parts, run the same task in real physics, and contribute signal back. Every new release ships as a new bay plus a new lab task.

## 1. Product: four rooms, one loop
| Room | What people do | Built today | Next |
|---|---|---|---|
| **Release Hall** | Watch the official video, then try the idea at a stand | 12 bays, 12 stands, cinema, research card | Auto-generated bay per release |
| **Hardware Lab** | Build a robot from **real parts**, teleoperate, test | Room, racks, builder v1 (stylized), teleop v1 | **Real-parts composer** (below) |
| **Smart Arena** | Solve lab tasks in real physics (MuJoCo) with your robot | Real models load and pose in MuJoCo WASM | Task packs, scoring, leaderboards |
| **Research Board** | See what people want robots to learn next | Feedback + opt-in episodes, live board | Clustering, export to research/product |

Loop: **video → try → build → test in physics → share data → next release answers it.**

## 2. "Build from real parts": how it works technically
1. **Parts library** is extracted from official models (MuJoCo Menagerie today: Unitree H1/G1/Go2, UR5e, Spot; later partner CAD from ABB, UR, MiR, Fetch/Zebra and any OEM that wants a showroom).
   - Each part is a body subtree with its real meshes, **real inertia and mass**, real joints (axes, ranges) and actuators, plus named **mount frames** (hip mount, shoulder mount, sensor rail).
   - Parts are stored as MJCF fragments with a small JSON descriptor: `{id, vendor, kind: leg|arm|torso|head|hand|wheel, mounts, mass, dof, torque}`.
2. **Composer** assembles a robot by attaching fragments to mount frames and generates one MJCF file in the browser. MuJoCo loads it: the result is a real physical robot with real mass and joint limits, not a picture.
3. **Validation** runs in physics: static stability, torque margins at the home pose, reach envelope, and a self-collision check. The spec sheet comes from the model, not from made-up numbers.
4. **Controller**:
   - Public build: a generic stand-in controller (PD pose hold + adaptive gait generator) that works on any leg count. It is clearly labelled "stand-in, not the Skild Brain".
   - **Brain-in-the-loop (company mode):** the sim streams observations to a Skild inference endpoint and receives actions. That's the true omni-bodied demo, "your body, our brain", run only on Skild's side and only where approved.

## 3. Lab tasks (the game)
A **task pack** is a scene plus a success metric plus a time limit, one per release:
- Omni-bodied: cut a calf mid-run, recover within 8 s.
- One-policy: stairs with 3 cm tread margin.
- S1: complete a task from one video with objects shifted L2 to L5.
- Reindustrial/NVIDIA: GB300 tray, tray shifted mid-run.
- Zebra: shift throughput.
- Self-play: beat generation N.

Scoring: success, time, energy, robustness. Leaderboards per task, with best builds shown as ghosts. Weekly **community challenges** tied to the latest release.

## 4. Release-day pipeline (repeatable, agent-assisted)
1. Post goes live → a **registry entry** (title, facts, official videos). This is already a single entry in `releases.js`.
2. **Stand brief** → stand built → **fact-check pass against the post** → browser test. This is the agent workflow we used for the current stands.
3. **Task pack** in the arena, reusing the parts and scenes.
4. `?release=<id>&present` becomes the interactive press kit on launch day. The research board shows live reactions.

## 5. Scale and ops
- **Hosting:** static CDN (the lab is static files and WASM) plus a small realtime service for presence, rooms and the research API. The original Higgsfield build used Cloudflare Durable Objects, which fits well.
- **Rooms:** public lab, event rooms (launches, investor days, conferences), private partner rooms (OEM showrooms).
- **Performance:** load models lazily per bay; a LOD/"poster" mode for weak laptops; physics only in the arena, kinematics in the hall.
- **Data and consent:** opt-in per episode, no personal data, a retention policy and a clear notice before any hosted data collection.
- **Brand and legal:** official videos stay on Skild's hosts. Partner logos and models are used with permission; Menagerie licenses are respected.

## 6. Team (lean)
A content owner per release (marketing/research), 1 sim/graphics engineer, 1 designer, and the agent pipeline for stands and fact-checks. A partner-integrations owner for the parts library.

## 7. Milestones
- **M1 (1–2 wk):** real-parts composer (Go2 legs + H1/G1 torso and arms + UR5e arm), physics validation, stand-in controller, 3 arena tasks.
- **M2 (3–4 wk):** task packs for all 12 releases, leaderboards, hosted beta with event rooms.
- **M3:** brain-in-the-loop demo mode, partner parts (ABB/UR/MiR/Fetch), release-day automation.
