# Real-parts composer (M1)

Robots here are built from **real parts** cut from the official MuJoCo Menagerie models (Unitree Go2, H1 and G1,
Boston Dynamics Spot, Universal Robots UR5e). The original files in `models/menagerie/` are never modified.
Every part keeps its original meshes, inertials, joint axes and ranges, default classes and actuators. The
composed robot is one MJCF file that the official MuJoCo WASM loads as a real physical model.

| file | what it does |
|---|---|
| `extract.mjs` | Node, run once: `node hall/parts/extract.mjs`. Cuts the Menagerie models into parts and measures numbers with MuJoCo. Writes `parts.json`. |
| `parts.json` | The parts library: per-robot shared data (`sources`) and the part descriptors (`parts`). |
| `xml.js` | Small MJCF parser and serializer with no DOM, so it runs in both the browser and Node. |
| `composer.js` | `compose(config, lib)` returns `{xml, files, spec}`. Runs in both the browser and Node. |
| `controller.js` | `makeController(model, data, spec)` returns `{step(dt, cmd)}`. This is a **stand-in controller, not the Skild Brain**. |
| `loader.js` | Browser loader. It composes the robot, writes only the needed meshes into MEMFS, loads the model, builds a three.js group and runs the controller. |
| `validate.mjs` | Headless check in Node: `node hall/parts/validate.mjs [logDir]`. |

## Part descriptor (`parts.json` → `parts[]`)

```jsonc
{
  "id": "go2_leg",                 // unique part id
  "vendor": "Unitree",
  "kind": "leg",                   // torso | leg | arm   (later: head | hand | wheel)
  "label": "Unitree Go2 leg",
  "source": "go2",                 // key into sources{} and models/manifest.json
  "sourceFile": "menagerie/unitree_go2/go2.xml",
  "mountType": "hip",              // torso: root · leg: hip · arm: shoulder | top_plate
  "mass": 2.071,                   // kg, from the compiled original model
  "dof": 3,
  "joints": [{"name": "FL_hip_joint", "role": "hip_abd", "range": [-1.0472, 1.0472], "home": 0, "torque": 23.7}],
  "mirror": ["FL", "FR", "RL", "RR"], // variants you can mount. Each one is cut from the original body (Go2 uses its real
                                     // mirrored thigh/calf meshes), so a "mirror" is always a real part, never a scale -1 trick
  "variants": {
    "FL": {
      "root": "FL_hip",            // original body name
      "origin": {"pos": [...], "quat": [...]}, // where it sat on the original robot
      "joints": [...], "bodies": [...],
      "xml": "<body name=\"{P}FL_hip\" childclass=\"go2__go2\">…</body>",   // MJCF fragment
      "actuatorXml": "<motor class=\"go2__abduction\" name=\"{P}FL_hip\" joint=\"{P}FL_hip_joint\"/>…",
      "excludeWithMount": ["fl_uleg"],     // (optional) original <contact><exclude> pairs with the mount body
      "stance": {"drop": 0.288, "foot": [x, y], "crouch": {"hip_pitch": 1, "knee": -2}, "crouchGain": -0.339,
                 "crouchFootGain": 0.0016, "swing": {"hip_pitch": -1}, "swingGain": 0.266}  // legs only, measured
    }
  },
  "stance": {"drop": 0.288, "crouchGain": -0.339},  // legs: hip → lowest foot point at home (m)
  "reach": 0.968,                  // arms: max distance from the first joint to the tip over the joint ranges (sampled)
  "baseQuat": [0, 0, 0, -1],       // UR5e: the base yaw from the original file
  "meshes": ["go2__hip_0", ...], "files": ["assets/hip_0.obj", ...]
}
```

Torsos also carry mount frames. All of them are in the frame of the named torso body:

* `leg_mounts.quad | biped | hex`: each entry is `{pos, quat, body, end: F|M|R, side: L|R, from}`. Mounts taken
  from the original robot say so in `from` (for example `go2.xml FL_hip`). Derived layouts also say how they were
  derived. The hexapod mounts keep the original hip y/z and spread x.
* `arm_mounts`: shoulder frames from the original humanoid (`h1.xml left_shoulder_pitch_link`).
* `top_mount`: the top plate. Spot uses the official Spot Arm mount point from `spot_arm.xml`. Go2, H1 and G1 use
  a point measured on the top of the visual mesh.

Names inside fragments use the `{P}` placeholder, which the composer replaces with the instance prefix (`t_`,
`leg0_`, `arm1_`). Class, material and mesh names get the source robot key as a namespace (`go2__knee`), so two
Go2 legs share one class tree and one set of meshes. Parts from different vendors never collide.

`sources[key]` holds what is shared per robot: `defaults` (the class tree), `materials`, `meshes` (name → file
path inside the model dir) and `option`.

## Composer

```js
import {compose} from './composer.js';
const {xml, files, spec} = compose({
  name: 'go2_ur5e',
  torso: 'go2_base',
  legs: {part: 'go2_leg', layout: 'quad'},   // 'quad' | 'hex' | 'biped' (default: biped for L/R legs, quad otherwise)
  // or a list of legs: [{part: 'go2_leg', mount: 'FL', variant: 'FL'}, ...]
  arms: [{part: 'ur5e_arm', mount: 'top'}],  // shoulder arms: mount 'L' / 'R' on a humanoid torso
  armPose: 'stow',                           // 'home' (original key) | 'stow' (folded UR5e, lower CoM)
}, lib);
```

The output MJCF contains:

* a `<freejoint name="root">` on the torso;
* a floor, a light, a skybox;
* every part's bodies with their original inertials, meshes and collision primitives;
* the original actuators for every joint. Actuator classes are kept, so the original ctrl, force and gain limits carry over;
* the original contact excludes;
* a `home` keyframe. It uses the source robots' home poses. G1 legs use a slightly bent stance, noted in
  `homeNote`, because the original `stand` key has straight legs. Base height comes from the measured leg drop.

`files` is `{robotKey: ['assets/…']}`: only the mesh files this build uses. The XML refers to them as
`<robotKey>/assets/…` relative to the XML file, so write the XML to `/m/<name>.xml` and the meshes to
`/m/<robotKey>/<file>`. This is the same layout `hall/mj.js` uses, so the two can share one MEMFS.

`spec` is the spec sheet data: `mass`, `dof`, `baseHeight`, `legs[]` (prefix, mount, variant, joints, stance),
`arms[]`, `joints[]` in qpos order with role, range and torque, `actuators[]`, `home`, `sources[]` (credits) and
`gait`.

## Controller: stand-in, not the Skild Brain

`makeController(model, data, spec).step(dt, cmd)` writes `data.ctrl`. Call it before every `mj_step`.

* PD hold around `home`. Torque motors (Go2, H1) get a PD torque clipped to the original ctrlrange. Position
  servos (Spot, G1, UR5e) get a target and use their original gains.
* Height PI and attitude levelling go through each leg's measured crouch direction. Bipeds also get ankle,
  hip and COM-over-feet balance and capture-point foot placement.
* The gait generator runs trot for 4 legs, tripod for 6 legs and stepping for 2 legs. Its inputs are
  `cmd = {vx, yaw, gait, height, freq, stepHeight, kpScale}`. Bipeds only step in place: forward walking is not
  stable with this controller.

## Adding a part (partner guide)

1. Put the partner's MJCF, with its meshes, under `models/<vendor_robot>/` and add an entry to
   `models/manifest.json` (`dir`, `xml`, `files`). The model needs real inertials, joint ranges and actuators.
   Each actuator must name its joint directly. Tendon or site transmissions are not supported yet.
2. In `extract.mjs`:
   * add the robot to `SOURCES` (`vendor`, `label`, `xml`, `family`, and optionally `homeFrom` or `homeOverride`);
   * add the part to `PARTS`:
     * a leg or arm is `{id, kind, source, label, mountType, variants: {code: '<original body name>'}}`;
     * a torso is `{id, kind: 'torso', source, label, root, cut: [limb bodies to remove], legMounts, armMounts?, topMount?}`.
   * If the joint names don't follow the Unitree, Spot or UR patterns, extend `roleOf()` so that hip, knee and
     ankle roles are found. The controller needs these roles.
3. Run `node hall/parts/extract.mjs`. Masses, torque limits, stance drop, reach and top plate are measured
   from the compiled model, not typed in.
4. Add a build to `BUILDS` in `validate.mjs` and run it. The build has to load, stay above the height
   threshold with no NaN, and show `same` in the joint and actuator parameter column.
5. Keep the license: Menagerie models keep their per-model `LICENSE`. Partner parts need written permission.
