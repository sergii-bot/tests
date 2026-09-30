# OMNI BRAIN v3 — embodied workshop and living demonstrations

## Profile / unchanged contracts
Mode-S iteration of the existing 1–4 player first-person game. Reuse original approved STYLE FORMULA in plan.md and all platform/room contracts. No new paid image/video generations; produce editable rigid mechanical geometry. Preserve existing six-lesson campaign and saved shared skills.

## Experience
The player feels like a robotics engineer visiting a working laboratory because parts can be picked up and physically installed, bodies emerge module by module, and robots perform legible multi-step everyday tasks while the player walks around them.

## Source-grounded scope
Read on 2026-09-15:
- https://www.skild.ai/blogs/s1 — explicitly demonstrates plant potting, pancake cooking, pour-over coffee and kit assembly; examples of errors and recovery. Research reference image how2prompt.jpg shows rail-mounted black grippers, workbench, eggs, bowl, mug, spatula and waste bin. Still image does NOT prove a fried-egg sequence.
- https://www.skild.ai/blogs/omni-bodied — different bodies, broken legs, jammed wheels, changed geometry and adaptation.
- https://www.skild.ai/blogs/one-policy-all-scenarios — vision and joint feedback, stairs, gaps, uneven surfaces and payloads.
- https://www.skild.ai/blogs/learning-by-watching — observational learning and embodiment gap.
- https://www.skild.ai/blogs/skild-zebra — warehouse coordination across quadrupeds, humanoids, tabletop arms and mobile manipulators.
Game interpretation: assembly of whole robot bodies is an authored engineering fantasy inspired by omni-bodied transfer, not a claimed Skild assembly product. Fried eggs are the user's requested fictional demo, not an asserted exact S1 rollout. All behaviour is animation/game rules, not live ML.

## Main addition A: physical warehouse workshop
Open from the start through a separate workshop destination, without bypassing the original warehouse-finale prerequisites. Staging: assembly stand (110,18), bins frame (103,18), leg (103,22), arm (117,18), sensor (117,22), Brain (110,25). Walk within range, E picks one part, carry it visibly, return to stand and E installs the next required module. G returns an unwanted part to storage.
Dog recipe: frame, four leg modules, sensor, Brain. Humanoid: frame, two legs, two arms, sensor, Brain. Seven physical installations each. Wrong modules refused without consuming them. One shared assembly, concurrent collection by collaborators. Pick type at the stand; recipe cannot silently change after assembly starts. Completed bodies persist on parking positions and perform an activation gait. Recipes may be repeated as replacement units; keep at most one active built body of each type to bound rendering.
Visible effects: rack silhouettes, visible held object, installed subassemblies, completion pulse and movement from stand to parking pad. No menu-only instant crafting.

## Main addition B: watch a robot cook an egg
Dedicated low open-framed kitchen bench in the lab, around (-11,8). The player can approach from the front and sides. Dual articulated manipulators, egg tray, stove, pan and handle, waste bowl, spatula, serving plate. Server-synchronized 48s cycle: reach -> lift -> crack -> egg falls -> white sets/steam -> spatula scoops -> transfer to plate -> ready. Whole shell, two cracked halves, white and yolk, tool pose, cookware and visible transfer each track the timeline. E restarts the demonstration from the start for the room. No full-screen video or screenshot substitutes for the 3D episode.
A small stage label identifies the current action; gameplay remains first-person and freely navigable. Optional reference links explain source inspiration, without presenting research claims as live model functionality.

## Additional showcase corners
Compact animated pour-over coffee and plant repotting stations, based on explicitly listed S1 task categories. They are observational environment scenes, not additional six-stage campaign gates. Prioritize clear props and action legibility over broad but fake feature coverage.

## Controls / co-op / state
New state workshop {recipe,installed,built}, kitchenShow {started}, player.carry. Server validates all positions, part categories, one carried item, recipe order, action rate, and destination. Migrate version-2 states preserving all lessons; initialize new fields. Client input, 3D scene and localized UI delegate through one exhibits extension without rewriting the existing campaign. Spectators retain no action rights.

## Assets extension
- Existing robot-kit: two modular build rigs and dual kitchen arms; visible component groups and carried part.
- Existing world-kit: open-frame benches, metal racks, loose limbs/sensor modules, assembly pad, stove, pan, egg shell halves, yolk, plate, spatula, coffee dripper, plant/pot.
- Existing calibration UI: compact recipe/part display, in-world labels, current cooking beat.
Muted food-specific yolk/coffee accents are intentional exceptions to the environmental teal/sage palette. No bright decorative or marketing colours.

## Acceptance thresholds
Two full recipes complete by validated physical movement/pick/install routes. Wrong-part, double-pick, remote install, premature activation, simultaneous last-part races refused safely. Co-op actors can contribute to the same body. Cooking timeline has distinct geometric states at t=3,8,15,27,35 seconds; egg moves from pan to plate, not simply disappears. Shared start timestamp aligns peers. Existing 27 tests remain green. New geometry batched to keep total draw calls <=80. Target 60fps remains unverified until measured; no claim from menu-idle frame rate. Desktop and 390x844 layouts must not block existing controls. Rereadability and first-person visibility checked in screenshots.
