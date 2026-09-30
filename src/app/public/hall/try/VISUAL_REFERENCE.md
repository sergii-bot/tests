# Visual reference: what the official Skild videos actually show

Compiled by the lead on 2026-09-28 from the official posters and thumbnails of every clip in `hall/releases.js`. Stands must look like this. If it's a skateboard, show a skateboard. If it's a factory, show a factory. A tennis ball is a tennis ball.

## Robots in the videos → what to use in the game
| In the video | Use in the game |
|---|---|
| Black slim humanoid (round head, sometimes a visor; in one clip wears a skild.ai t-shirt) | Unitree **G1** (MuJoCo model `g1`), tinted black |
| Grey quadruped with a boxy head (Go2-like) | Unitree **Go2** (`go2`) |
| Wheel-legged quadruped (wheels at the feet) | Go2 legs + a wheel at each foot (procedural) |
| Two silver cobots with black joints (UR-style) on a table | 2× **UR5e** (`ur5e`) |
| **S1 rig**: two black 6–7 DOF arms mounted left and right on a **white vertical column** (head/camera mast on top), on a wooden table, often in front of a **green wall**; also in a busy lab with desks | Procedural rig (column + two dark arms) or 2× UR5e tinted black on a white mast |
| Humanoid soccer players, one wearing an **Argentina (light-blue/white striped) jersey**, visor face | G1 + jersey stripes on the torso |

## Per release, per clip
**Skild Brain (SKD-01):** a black humanoid in a skild.ai t-shirt outdoors in Pittsburgh with the yellow bridge.

**One policy (SKD-02):** a black humanoid in every clip.
- Outdoor **concrete stairs with a metal handrail** beside a **brick building**.
- A park with stairs.
- **Unstructured obstacles**: stacked **wooden pallets** in an empty office floor with big windows.
- **Fire escape**: an indoor **stairwell with black railings**.
- **Carrying a cardboard box** up and down stairs.
- **Push/pull**: a person pulls the robot with a strap, on a **red carpet** with pallets.

**Parkour (showcase):** the humanoid jumps onto and between **stacked plyo boxes / wooden crates**, and does fire-escape stairs. For the paper: a small quadruped on boxes and gaps.

**Omni-bodied (SKD-03):**
- A grey quadruped on **office carpet tiles** with "Adapting…" on screen, missing a lower leg.
- A **wheel-legged** robot on **grass with fallen leaves** (failed leg motors).
- A **chainsaw** cutting a quadruped's leg (a person's boot in frame).
- "**Trial 3**" on a **red carpet** by pleated curtains: the robot standing upright on hind legs (learning from failures).
- A wheel-legged robot on an outdoor **brick patio** carrying a payload (locked wheels + payload).
- A quadruped on **long thin stilts** in a **café with chairs and tables**.

**Learning by watching (SKD-04):** a black humanoid with hands doing kitchen and table tasks, split-screen with the human demo.

**Series C (SKD-05):** a man hands an object to a black humanoid at a table with bowls and trays.

**Reindustrial (SKD-07):**
- GTC: **two UR-style silver cobots on a black workbench assembling an NVIDIA server tray**, with screwdrivers, a busbar and screws.
- An overhead view of the same with a PCB tray, tools and a **screwdriver bit**.

**Zebra (SKD-08):** a warehouse with tall **shelving**, **AMRs** with totes, neon path lines.

**S1 (SKD-09):**
- The intro shows a black gripper and a potted plant.
- Seen tasks:
  - **lab cup**: a blue test-tube rack, test tubes, beakers with **yellow liquid**, an orange cup;
  - **flakes**: a gripper sprinkling **cereal/corn flakes** on a wooden table;
  - **bandage on elbow**: the arm applies a **band-aid to a human forearm/elbow**;
  - **lift a pack**: two arms lift a **backpack/bag**;
  - **cable loop**: two arms route a **cable** on a table with small black clips;
  - **re-tie a ribbon**: two arms tie a **red ribbon on a black gift box**;
  - **hold a syringe**: a gripper holds a **syringe** over a white stand.
- Prompts are **egocentric human-hand videos** (first-person, hands only).
- Long-horizon tasks:
  - **pancakes**: an induction hob, a pan, a batter bottle, a spatula, a plate;
  - **coffee**: a pour-over dripper, a kettle, a cup, beans;
  - **kitting**: small parts into a **blue grid tray** / organiser;
  - **potting**: a **terracotta pot**, a plant, a soil bag, a small shovel, a basket.
- Robustness:
  - pancakes under perturbation (objects slid away);
  - coffee with a **lighting change**;
  - **blue juice** (objects swapped: a hand in frame).
- **Skateboard wheel**: a **skateboard deck and a wheel** on the table; the robot fits the wheel.
- **Cup instead of watering can**: the egocentric prompt shows a **watering can** and a plant; the robot uses a cup.
- **Top off the juice**: a glass of **orange juice** nearly full, and a juice jug.
- **Demo correction**: an **egg** (the prompt drops it) and a **tennis ball** (the posters are dark; use a yellow-green felt tennis ball).
- **First attempt**: two UR-style arms over a **black mat** with a **white bowl** and a small block.

**100M ARR (SKD-10):** a mosaic of deployment clips under a big "100M ARR" title.

**Self-play (SKD-11):**
- A **humanoid with a visor in an Argentina jersey** (real world).
- A **simulated green pitch with white goals**, many humanoids.
- An indoor pitch with a **soccer ball** and the Skild logo on the wall.

## Rules for stands
- Scene, props and robot type must match the clip the stand is about, as listed above. When you pick a mode, call `api.clip()` with that exact clip.
- Prefer a 3D view (three.js, see hw-real.js / hw-teleop.js for how a stand hosts a WebGLRenderer). Use the real MuJoCo robots via `hall/mj.js` (`MJ.spawn('ur5e'|'g1'|'go2'|'h1'|'spot')`, kinematic recipes) or `hall/parts/loader.js` (`spawnComposed`, real physics) where the video robot matches.
- Keep the honesty labels: simulated / stylized / stand-in controller.
