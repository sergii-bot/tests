# OMNI BRAIN — The Return of Motion

## Scope / profile
Iteration on existing mode-S 1–4-player first-person co-op game. Preserve the three zones, assets and style formula in plan.md. English title with Russian-first interface and English language toggle. No new paid media generation. Output: updated existing URL, custom-source archive, tests and measured performance report. Not a real ML-training product.

## Story and experience
A quiet storm erased the motor policies of a remote robotics research station. Its common memory core survived. The player is a returning learning engineer, guided by archived notes from the absent night team. Restore the station by teaching manipulators to handle fragile energy cells, dogs to survey the disconnected proving ground, and a humanoid to safely hand over a recovered core. Finale: the warehouse network resumes coordinated work; the ending log reveals that the core preserved the team's successful demonstrations, not a fixed map of bodies.
Experience formula: the player feels like a patient robotics engineer because they demonstrate, inspect failures, adjust a policy and see previously clumsy machines repeat the learned behaviour independently. A capability is visible motion, not only an XP counter.

## Three acts / six experiments
Act 1 — Hands remember (lab). 1: record a gripper demonstration: move a mechanical effector to a source, grip a fragile cell, carry it to a receiver, release. Actual x/z control; sample path stored in authoritative state. Robot replays the recorded path. 2: manually align two earbuds with fine sockets; each pick-and-place tests position, not a timing bar.
Act 2 — A body learns the world (hills). 3: walk a four-waypoint survey while a quadruped follows; reward checkpoints. Toggle onboard camera as optional inspection mode, never replace the engineer permanently. 4: parkour: choose a gait policy for stairs/gap/landing, run a trial, observe success/failure, reinforce. A bad policy causes a visible failed trajectory and retry; incorrect rewards do not unlock skills. 5: disable a leg, choose a compensation strategy, observe a three-leg gait, reward stable redistribution.
Act 3 — Knowledge changes bodies (lab -> warehouse). 6: deploy accumulated knowledge to the humanoid, lead it to a marked handover position, offer a receiver target, then reinforce safe handover. At final warehouse terminal deploy all six capabilities and see arms, dog and humanoid operate. Optional continued exploration after finale.

## Verbs, consequences and information
- Demonstrate: control gripper x/z with arrows or drag pad while WASD remains engineer movement. Source and target locations visible in both 3D and 2D workbench. E grips/releases; R records; Space approves replay. Dropping outside receiver reports positional error and keeps previously learned capabilities.
- Observe: body pose, predicted path, error magnitude, successful demonstration count and confidence visible. Feedback must change robot pose or trajectory.
- Lead: walk to successive physical markers; dog/humanoid follows the demonstrator, other operators see the same leader and progress.
- Hypothesize/test: select balance/reach/soft landing, E begins a visible attempt, Space reinforces only after it finishes and only if correct.
- Diagnose/adapt: Q disables a joint, choose redistribution rather than extra speed/ignoring fault, E replans, Space rewards observed compensation.
- Share: named robot labels and operator count, copyable room URL, reconnect, shared skills. Fourth slot available, fifth spectator.
All relevant state public. Server owns prerequisites, step order, in-range positions, rig bounds, min action durations, trial outcomes, XP uniqueness, training ownership and seat permissions. Clients animate and predict only presentation.

## Loop / rhythm / routes
Seconds: choose an informative correction -> see outcome. Minutes: demonstrate -> reproduce -> generalize on another robot. Session: restore a station with friends. Uncertainty: execution precision, choosing an appropriate gait, discovery of the next archived message. Curves: 4,6,3,7,5,8,9,2. Safety first: counter task has free retries. Alternative start orders: manipulation then earbuds or vice versa. No permanent failure or loss of past skills; recovery from three failed trials remains possible.

## Prototype and exit tests
Rules model tests: bad target placement fails while recorded source-target path succeeds; random reward spam cannot complete; gait mismatch produces a visible failure and retry; wrong compensation cannot complete; humanoid cannot complete before a nearby handover. Two complete start-order routes, reconnect and observer refusal. Before/after render metrics must be measured, not inferred from draw-call count.

## Visual additions / asset manifest extension
Existing procedural robot-kit: gripper effector mapping, cells/earbuds, socket targets, confidence state, replay motion, explicit damaged joint, waypoint-following humanoid and dog. Existing world-kit: handover beacon, robot identity plates. Existing calibration UI: workbench pad, telemetry, learning journal, act introductions. All reuse the exact existing STYLE FORMULA.

## Performance strategy
Diagnose draw submission, fill cost, compositor overhead and frame scheduler independently. Eliminate continuously generated SVG filter grain and backdrop blur during gameplay; cap default DPR to 1, render on demand behind menu; simplify repeated grass and unneeded hidden geometry; use low-cost fog-compatible materials where appearance is preserved. Add user-selectable graphics scale and reduced effects. Report real numbers and environment; do not claim performance gate passed if it fails.
