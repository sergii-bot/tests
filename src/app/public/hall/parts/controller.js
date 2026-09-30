// STAND-IN CONTROLLER (not the Skild Brain).
// A generic, hand-written controller that works on any composed body from composer.js:
//   - PD hold around the 'home' keyframe (torque motors get PD torques clipped to the ORIGINAL actuator limits;
//     position servos get a target and use their ORIGINAL gains),
//   - height and attitude feedback through each leg's measured "crouch" direction (leg length vs joints),
//   - a simple open-loop gait generator: trot for 4 legs, tripod for 6, stepping for 2.
// It is here so a composed robot can stand and walk in the lab; it is deliberately simple and is NOT the Skild
// Brain. In company mode the same step() slot is where observations go out to a Skild inference endpoint.
//
//   const ctl = makeController(model, data, spec);
//   each physics step:  ctl.step(model.opt.timestep, {vx: 0.3, yaw: 0, gait: true}); mj.mj_step(model, data);
//   cmd: {vx m/s, yaw rad/s, gait bool (default: on when vx/yaw != 0), height m (absolute base height target),
//         freq Hz, stepHeight m, kpScale}
export const CONTROLLER_LABEL = 'stand-in controller (not the Skild Brain)';

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function makeController(model, data, spec, opts = {}) {
  const jointId = {};
  {
    const s = new TextDecoder().decode(model.names);
    for (let j = 0; j < model.njnt; j++) { const a = model.name_jntadr[j]; jointId[s.slice(a, s.indexOf('\0', a))] = j; }
  }
  const info = Object.fromEntries(spec.joints.map(j => [j.name, j]));
  // actuators -> joint addresses and type
  const acts = [];
  for (let a = 0; a < model.nu; a++) {
    const j = model.actuator_trnid[a * 2], nm = spec.actuators[a].joint, ji = info[nm] || {};
    const motor = model.actuator_biastype[a] === 0;
    const lo = model.actuator_ctrllimited[a] ? model.actuator_ctrlrange[a * 2] : -Infinity;
    const hi = model.actuator_ctrllimited[a] ? model.actuator_ctrlrange[a * 2 + 1] : Infinity;
    const tmax = motor ? Math.max(Math.abs(lo), Math.abs(hi)) : (ji.torque || 100);
    const kp = motor ? clamp(tmax * (opts.kpPerNm ?? 4), 5, 600) : 0;
    const jlo = model.jnt_range[j * 2], jhi = model.jnt_range[j * 2 + 1];
    acts.push({a, j, q: model.jnt_qposadr[j], d: model.jnt_dofadr[j], motor, lo, hi, kp, kd: kp * 0.035,
      home: ji.home ?? 0, jlo, jhi, name: nm, role: ji.role});
  }
  const actByJoint = Object.fromEntries(acts.map(x => [x.name, x]));
  const legs = spec.legs.map(l => {
    const byRole = {};
    for (const j of l.joints) (byRole[j.role] ||= []).push(j.name);
    const st = l.stance;
    // tripod / trot / biped phase offsets
    let phase = 0;
    if (spec.gait === 'trot') phase = (l.end === 'F') === (l.side === 'L') ? 0 : Math.PI;
    else if (spec.gait === 'tripod') phase = ({FL: 0, MR: 0, RL: 0, FR: 1, ML: 1, RR: 1}[l.end + l.side] ?? 0) * Math.PI;
    else if (spec.gait === 'step') phase = l.side === 'L' ? 0 : Math.PI;
    return {...l, byRole, phase, crouch: st.crouch, cg: st.crouchGain, cfx: st.crouchFootGain || 0, swing: st.swing, sg: st.swingGain,
      x: l.pos[0], y: l.pos[1] + (st.foot ? st.foot[1] : 0), humanoid: l.family === 'humanoid'};
  });
  const biped = spec.gait === 'step';
  const B = {ankle: 0.9, hip: 0.4, com: 2, comD: 0.4, cp: 0.5, cpY: -1.5, vel: 0.1, ...(opts.balance || {})};
  // contact primitives of each leg's last body = the foot (support polygon for the COM loop)
  const bodyId = {};
  {
    const s = new TextDecoder().decode(model.names);
    for (let b = 0; b < model.nbody; b++) { const a = model.name_bodyadr[b]; bodyId[s.slice(a, s.indexOf('\0', a))] = b; }
  }
  const footGeoms = [];
  for (const l of spec.legs) {
    const fb = bodyId[l.prefix + l.footBody];
    for (let g = 0; g < model.ngeom; g++) if (model.geom_bodyid[g] === fb && (model.geom_contype[g] || model.geom_conaffinity[g]) && model.geom_type[g] !== 7) footGeoms.push(g);
  }
  const rootB = bodyId[spec.rootBody];
  let comPrev = null;
  const legDrop = spec.legs.length ? spec.legs.reduce((a, l) => a + l.stance.drop, 0) / spec.legs.length : 0.3;
  const off = new Float64Array(model.njnt); // per-joint target offsets (rad)
  let t = 0, phi = 0, hInt = 0, gaitBlend = 0, vF = 0;
  const hHome = spec.baseHeight - 0.015;

  function addRole(leg, dirMap, amount) {
    for (const [role, k] of Object.entries(dirMap)) for (const n of leg.byRole[role] || []) off[jointId[n]] += k * amount;
  }

  function step(dt, cmd = {}) {
    t += dt;
    off.fill(0);
    const q = data.qpos, v = data.qvel;
    const w = q[3], x = q[4], y = q[5], z = q[6];
    const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
    const pitch = Math.asin(clamp(2 * (w * y - z * x), -1, 1));
    const wx = v[3], wy = v[4]; // body-frame angular rates
    const h = q[2];
    const hT = cmd.height ?? hHome;
    // bipeds: the stand-in only steps in place (forward walking is not stable with this simple controller)
    const vx = biped && !opts.experimentalBipedWalk ? 0 : (cmd.vx || 0), yaw = biped && !opts.experimentalBipedWalk ? 0 : (cmd.yaw || 0);
    const gaitOn = cmd.gait ?? (Math.abs(cmd.vx || 0) > 1e-3 || Math.abs(cmd.yaw || 0) > 1e-3);
    gaitBlend = clamp(gaitBlend + (gaitOn ? dt : -dt) / 0.5, 0, 1);
    const freq = cmd.freq || (biped ? 2.0 : 2.2 * Math.sqrt(0.29 / legDrop));
    // COM relative to the centre of the feet, in the heading frame (bipeds balance on it)
    let ex = 0, ey = 0, evx = 0, evy = 0;
    if (biped && footGeoms.length) {
      let fx = 0, fy = 0; for (const g of footGeoms) { fx += data.geom_xpos[g * 3]; fy += data.geom_xpos[g * 3 + 1]; }
      fx /= footGeoms.length; fy /= footGeoms.length;
      const cx = data.subtree_com[rootB * 3], cy = data.subtree_com[rootB * 3 + 1];
      const yawA = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)), c = Math.cos(yawA), sn = Math.sin(yawA);
      const dx = cx - fx, dy = cy - fy; ex = c * dx + sn * dy; ey = -sn * dx + c * dy;
      if (comPrev) { evx = (ex - comPrev[0]) / dt; evy = (ey - comPrev[1]) / dt; }
      comPrev = [ex, ey];
    }
    phi += 2 * Math.PI * freq * dt;
    // height loop (PI), limited
    const eh = hT - h; hInt = clamp(hInt + eh * dt, -0.1, 0.1);
    const dH = clamp(1.0 * eh + 3.0 * hInt, -0.08, 0.08);
    // forward-speed feedback on the stride (Raibert-style), body velocity in the heading frame
    const yawB = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
    const vBody = Math.cos(yawB) * v[0] + Math.sin(yawB) * v[1];
    vF += (vBody - vF) * Math.min(1, dt / 0.3);
    const vxEff = vx + (gaitOn ? (opts.kv ?? 1.0) * clamp(vx - vF, -0.5, 0.5) : 0);
    const stepH = (cmd.stepHeight ?? (biped ? 0.035 * legDrop : clamp(0.2 * legDrop, 0.03, 0.1))) * gaitBlend;
    for (const L of legs) {
      // leg-length change wanted (m, + = longer): height + attitude levelling + gait lift
      let dLen = dH + 0.8 * (L.x * pitch - L.y * roll) + 0.08 * (L.x * wy - L.y * wx);
      const s = Math.sin(phi + L.phase);
      if (stepH > 0 && s > 0) dLen -= stepH * s;
      // stride: forward during swing, back during stance (foot x relative to home, m)
      const S = clamp((vxEff - yaw * L.y) / (2 * freq), -0.25, 0.25) * gaitBlend;
      let dx = -0.5 * S * Math.cos(phi + L.phase);
      // bipeds: swing foot goes toward the capture point (COM offset + velocity * sqrt(h/g)) to catch drift
      if (biped && s > 0) dx += B.cp * gaitBlend * s * clamp(ex + evx * Math.sqrt(h / 9.81), -0.12, 0.12);
      const c = L.cg ? clamp(dLen / L.cg, -0.6, 0.6) : 0;
      if (c) addRole(L, L.crouch, c);
      // swing term also cancels the fore-aft foot shift that the crouch/lift causes (measured per leg)
      if (L.sg) addRole(L, L.swing, clamp((dx - L.cfx * c) / L.sg, -0.5, 0.5));
      if (L.humanoid) {
        // ankle / hip strategy for bipeds: pitch through the ankles, roll through hip roll + ankle roll
        for (const n of L.byRole.ankle_pitch || []) off[jointId[n]] += B.ankle * (pitch + 0.1 * wy) + B.com * (ex + B.vel * (vF - vx)) + B.comD * evx;
        for (const n of L.byRole.hip_pitch || []) off[jointId[n]] += B.hip * (pitch + 0.1 * wy);
        for (const n of L.byRole.ankle_roll || []) off[jointId[n]] -= 0.5 * roll + 0.05 * wx;
        for (const n of L.byRole.hip_abd || []) off[jointId[n]] -= (0.6 * roll + 0.06 * wx) + (biped ? 0.05 * gaitBlend * Math.sin(phi + L.phase) * (L.side === 'L' ? 1 : -1) : 0)
          // lateral capture point: swing hip abducts toward where the COM is heading (hip_abd + = foot outward-left)
          + (biped && s > 0 ? B.cpY * gaitBlend * s * clamp((ey + evy * Math.sqrt(h / 9.81)) / Math.max(0.3, legDrop), -0.15, 0.15) : 0);
      }
    }
    const kps = cmd.kpScale ?? opts.kpScale ?? 1;
    for (const A of acts) {
      const target = clamp(A.home + off[A.j], A.jlo, A.jhi);
      if (A.motor) {
        const u = kps * A.kp * (target - q[A.q]) - Math.sqrt(kps) * A.kd * v[A.d];
        data.ctrl[A.a] = clamp(u, A.lo, A.hi);
      } else data.ctrl[A.a] = clamp(target, A.lo, A.hi);
    }
    return {t, phase: phi % (2 * Math.PI), height: h, roll, pitch, gait: gaitBlend};
  }
  return {step, label: CONTROLLER_LABEL, gait: spec.gait, acts, actByJoint};
}
