# SKILD GAME — Look Bible (v0.1, 2026-10-01)

Source: the director's own generated stills (15 frames, shared in chat 2026-10-01).
Base: Mirror's Edge Catalyst clarity (clean architecture, readable space) **graded through the director's film look**.
Rule: we do not paste the images into the game. Every scene is rebuilt in 3D and *rendered* to match this look.

## 1. Core look in one line
Quiet, foggy, analog cinema: muted teal-green air, soft white robots, lifted blacks, heavy film grain, motion smear, one warm accent.

## 2. Palette (eyeballed from the stills; refine with a LUT later)
| Role | Hex | Where |
|---|---|---|
| Air / fog teal | #5E8A86 | sky, haze, far walls |
| Deep green shadow | #1F3A2E | grass, night lab, shadows |
| Kitchen sage | #8FA393 | interiors, cabinets |
| Robot white | #E6EBE6 | robot shells (never pure #FFF) |
| Clinical cyan-white | #CFE6E1 | fluorescent rooms, CRT |
| Dune olive | #6E5E3E | desert / slope scene |
| Warm accent amber | #F2B640 | sunrise, emissive accents, one per scene max |
| Black lift | #0E1412 | darkest pixel allowed (no true black) |

## 3. Render stack (Three.js, per frame, in this order)
1. **Lighting**: soft area lights (RectAreaLight) for fluorescent tubes, HDRI-style hemisphere fill tinted teal, low sun for exterior. Soft shadows (PCFSoft / VSM), baked AO in rooms.
2. **Materials**: PBR. Robots in satin white plastic plus brushed aluminium (roughness 0.35–0.5), glossy black visors, translucent "X-ray" shells for the manipulator scene.
3. **Atmosphere**: exponential height fog in teal, depth-based haze, light shafts on exteriors.
4. **Tonemap**: AgX/ACES filmic, low contrast, lifted shadows, highlight roll-off.
5. **Colour grade**: a 3D LUT (`.cube`) built from the stills, plus a split-tone (teal shadows, warm-neutral highs).
6. **Lens**: subtle barrel distortion, chromatic aberration at edges, vignette, halation/bloom only on lights and whites.
7. **Motion smear**: temporal ghosting / directional motion blur on moving robots (the blurred-figure look in stills 1, 3, 4).
8. **Film layer**: animated 35 mm grain (strong), slight gate weave, rare dust; optional scanline/VHS noise for "memory" moments.
9. **Graphics layer**: thin 1 px grid overlay (stills 1, 7), SKILD AI logo in white, small HUD text. Minimal, never a gamey UI.

## 4. Camera modes
- **Third-person follow** (default): 35 mm feel, low and slightly behind, heavy damping, handheld micro-shake.
- **Surveillance / CRT mode** (stills 11, 12, 15): fixed corner cams, fisheye, monitor bezel, timestamp, desaturated cyan. This is used as a scene transition and an "observer" view.
- **Photo mode**: freeze plus depth of field for screenshots and covers.

## 5. Scene set (each one rebuilt in 3D in this look)
| # | Scene | Mood ref | Gameplay |
|---|---|---|---|
| 1 | White fluorescent void lab | 2, 11 | hub / hero select |
| 2 | Sage kitchen | 3, 4, 5 | manipulation tasks (plates, cups) |
| 3 | Foggy green hills | 6, 7 | humanoid / dog walking, drone flight |
| 4 | Olive dune slope | 1 | locomotion challenge |
| 5 | Night green lab | 14 | arm + ball task |
| 6 | Golden ridge | 8 | release / end card, Skild monolith |
| 7 | White studio | 9, 10 | X-ray manipulator showcase |

## 6. Heroes
Humanoid (white shell), robot dog, quadcopter, human engineer, mobile manipulator. All of them use the same material language. Skild claims stay honest: only shown abilities are presented as real. Fantasy powers are metaphor.

## 7. Quality targets
60 FPS on this Mac at 1440p with the full stack. A "Cinema" preset (all effects) and a "Fast" preset. Assets are GLB models with real topology, not primitives.

## 8. Pipeline for assets
- **Models**: the director provides or approves robot models (C4D → GLB export). No downloads without permission.
- **Textures and HDRIs**: from the FOOTAGE library or made in C4D. Downloads only with permission.
- **LUT**: built in Resolve from the stills, exported as `.cube` and loaded by the game.
