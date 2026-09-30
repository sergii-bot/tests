# OMNI / Shared Intelligence

Current iteration: see campaign-v2.md for the authored story and replacement hands-on training mechanics. Existing style and platform profile remain unchanged.

## 1. Profile
Mode S: complete compact browser experience, not a robotics simulator. Time: real time. Space: continuous first-person 3D. Agency: embodied learning engineer. Conflict: system challenges. Content: authored three-zone world. Outcome: finite warehouse deployment, then free exploration. Players: 1–4 online co-op sharing skills and progress. Session: 10–15 minutes. Engagement: discovery and mastery. Desktop and mobile web; keyboard/mouse, touch, gamepad; English strings data. Target 60fps, <=80 draw calls on mobile, DPR <=1.5. Roughly 20 robot actors and 100000 simulated points, rendered through instancing. Worst case: warehouse fleet, four operators, particle simulation.
Networking: platform room protocol; authoritative pure rules for training and position deltas; room clock rate-limits movement; local prediction and remote interpolation. Late joins become operators up to four. State persists across refresh; extra visitors spectate. Shared progress, individual bodies and positions. No hidden player information. No chat or camera upload.

## 2. Laws
Patterns: record then reproduce ordered tasks; reward only inside the precision window; transfer prerequisites; adapt before advancing damaged locomotion. Short loop: approach, interact, observe, record/reward. Medium loop: complete an experiment and transfer a capability. Long loop: lab -> hills -> simulation -> warehouse. Uncertainty: precision execution (seconds), next embodiment reveal (minutes), teammate coordination (session). All progress actions visibly animate robot/particles and update shared skill ledger. Errors cost only retry time, not learned skills.

## 3. Concept
The player feels a quiet breakthrough in shared intelligence because each small learned gesture reappears in a different robot body, while collaborators make the same world more capable.
Load-bearing pillars: aesthetics and interaction. Mechanics turn cinematic scientific calibration into purposeful actions; story supplies the progression from clumsy arm to autonomous fleet; aesthetics makes milestones physical through ghost replays; technology shares outcomes and operator presence.
Players: four equal engineers. Goals: teach six experiments and deploy warehouse. Actions: move, look, interact, record, reward, adapt, transfer, invite, reset. Rules: proximity and prerequisites enforced on server. Resources: learned capabilities and successful demonstrations. Conflict: ordered sequences and timing. Boundaries: one persistent named room, reset by seated player. Outcome: autonomous fleet and hillside outro. Tension: safety -> precision -> terrain -> loss of limb -> large-scale release.
Session/game curve: arrival 5, one-video 3, precision 6, hills 4, parkour 7, adaptation 6, simulation 8, warehouse 9, hillside 2. Hook: black sensor-headed humanoid materializes from a point cloud beside the entry platform.

## 4. System
|Verb|Objects and response|Consequence|
|Move/look|lab stations, hill obstacles, warehouse lanes|proximity unlocks interaction; operators see each other|
|Interact (strong)|kitchen steps advance, arm grip aligns, dog traverses checkpoint, server deploys|ordered progress and embodiment transfers|
|Record|kitchen demonstration starts; active recording stores three ordered steps|single demonstration unlocks robot replay|
|Reward (strong)|precision window locks earbuds, parkour success trains gait, task replay confirms|shared Brain XP and skill mastery|
|Adapt|damaged dog switches to three-leg gait; jammed wheels unlock recovery|fault tolerance unlocks finale|
|Invite/reset|room link shares exact session; reset clears training for everyone|co-op session lifecycle|
Positive loop: learned skills unlock bodies; counterweight: each new body tests a different verb. No losing state; failed trials reset locally while keeping skills. Recovery always exists. All objective state, positions, steps, owners, score and prerequisites public; timing target is publicly displayed; no secrets. Controls available in pause/help. Physical key codes WASD/E/R/Space/Q, mouse look, touch stick/look and action buttons, gamepad axes/A/X/Y/B.

## 5. Prototype question and test contract
Question: do ordered demonstrations and well-timed reinforcement distinguish mastery from button spam, while allowing cooperative progress?
Disposable rules model iterations: v1 rewards every click (contrast fails), v2 checks recorded sequence (timing still decorative), v3 records sequence and validates precision phase server-side (reference succeeds, patternless fails). Two valid routes: kitchen then dexterity, or dexterity then kitchen; dog course can be trained by either teammate. Comeback: discard one failed run, replay and retain previous capabilities. Static threshold checks before production. Rendering budget verified during assembly; not claimed measured until smoke runs. Prototype outputs recorded separately.

## Style formula
Cinematic scientific visualization with soft filmic surfaces and fine analog grain; slender articulated mechanical silhouettes, restrained geometry, and hairline calibration marks. Environments use muted teal and sage, robots use near-black graphite against pale fog, interactive targets use white, and the shared Brain alone carries a cool blue accent. Diffused overhead light, dense atmospheric haze, and quiet archival mood. Clear silhouettes and proximity labels preserve readability in a free first-person 3D perspective, with three-quarter views for model studies.

Style is explicit in user references, approval inherited from brief. Engine geometry will be an atmospheric stylized approximation, not photographic reconstruction. All robotic mechanisms are rigid articulated procedural assemblies, not skinned human characters. No claim of actual ML, camera recording, or 100000 physically simulated robots: server-room visualization uses 100000 points.
