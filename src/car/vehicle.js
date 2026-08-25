/**
 * @file car/vehicle.js
 * @responsibility Arcade car handling (§7). Integrates forward and lateral
 * velocity in local space, damps lateral by grip, lerps steer authority by
 * speed, and applies body roll / squat. Consumes normalised input, exposes
 * position, heading and speed. No rigid-body engine.
 *
 * Model: keep world velocity (vx, vz). Each fixed step, decompose into
 * longitudinal / lateral relative to the current heading, apply engine + brake
 * to longitudinal, damp lateral by grip, turn the heading with a bicycle model,
 * then recompose. Lateral slides emerge for free: momentum lives in world space
 * while the heading rotates, and grip bleeds off the resulting sideways speed.
 *
 * @phase Implemented in Phase 1.
 */

import * as THREE from 'three';
import { buildChassis } from './chassis.js';

/**
 * Handling constants, tuned toward a weighty sim feel (MotorTown-ish) rather
 * than instant arcade snap: a straight-six pull (~6 s to 100), long coasts,
 * and a rear end that saturates and SLIDES instead of snapping back.
 * Live-editable via the dev panel.
 */
export const DEFAULT_HANDLING = {
  maxSpeed: 28,
  reverseMax: 6,
  accel: 7.5,          // ~6 s to 100 km/h with the headroom taper — an honest E30
  brake: 19,
  engineBrake: 3.5,    // lift-off coasts like a real car, not a gearbox full of sand
  steerMax: 0.55,
  steerAtTopSpeed: 0.16,
  steerRate: 4.0,
  grip: 10.0,
  driftGrip: 2.4,      // handbrake genuinely lets the rear go
  slipFalloff: 0.1,    // tyres saturate as slip grows — slides sustain, recovery is progressive
  driftSteerBoost: 1.5, // extra counter-steer authority while the rear is loose
  driftYaw: 0.13,      // slip→yaw coupling: how hard the rear keeps coming around mid-slide
  bodyRoll: 0.06,
  squat: 0.04,
};

const COLLIDE_R = 1.7; // car collision circle radius (m)

/**
 * @param {THREE.Scene} scene
 * @param {import('../content/personal.js').CAR} car
 * @param {typeof DEFAULT_HANDLING} handling  mutable; the dev panel edits it live
 * @param {{world?: {height?:(x:number,z:number)=>number, collide?:(x:number,z:number,r:number)=>{x:number,z:number,hit:boolean,nx:number,nz:number}}, onImpact?:(mag:number)=>void}} [opts]
 */
export function createVehicle(scene, car, handling = DEFAULT_HANDLING, opts = {}) {
  const { world, onImpact } = opts;
  const chassis = buildChassis(car);
  const wheelBase = chassis.group.userData.wheelBase || 2.6;
  const wheelR = chassis.length * 0.09; // matches chassis wheel radius closely enough for spin

  // root: position + heading (yaw). tilt: body pitch/roll (slope + squat/lean),
  // in the car's local frame so the hero GLB tilts too (it lives under tilt).
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  tilt.add(chassis.group);
  scene.add(root);


  // Start on the ground at the origin — without this the car renders 14 m under
  // the city (terrain height there) until the first update() recomputes cur.y.
  const cur = { x: 0, z: 0, y: world?.height ? world.height(0, 0) : 0, heading: 0, roll: 0, pitch: 0, steer: 0, spin: 0 };
  let prev = { ...cur };
  const _n = new THREE.Vector3(); // scratch for terrain-normal slope tilt

  let vx = 0;
  let vz = 0;
  let vLong = 0; // cached longitudinal speed (for HUD/camera/squat)
  let prevVLong = 0;
  let braking = false;   // pedal brake or handbrake while rolling — lights up the tails
  let reversing = false; // rolling backwards — pale reverse glow
  let sliding = false;   // rear stepping out — lay rubber under the back wheels

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  /** Current lateral speed in the car frame (recomputed — vLat is loop-local). */
  const vLatNow = () => vx * Math.cos(cur.heading) + vz * -Math.sin(cur.heading);
  const lerp = (a, b, t) => a + (b - a) * t;
  const approach = (a, b, rate, dt) => a + (b - a) * Math.min(1, rate * dt);

  /**
   * Advance one fixed step.
   * @param {number} dt
   * @param {import('../core/input.js').InputState} input
   */
  function update(dt, input) {
    prev = { ...cur };
    prevVLong = vLong;

    // Decompose world velocity into long/lat relative to current heading.
    const s = Math.sin(cur.heading);
    const c = Math.cos(cur.heading);
    const fwdX = s, fwdZ = c;      // forward
    const rgtX = c, rgtZ = -s;     // right
    vLong = vx * fwdX + vz * fwdZ;
    let vLat = vx * rgtX + vz * rgtZ;

    // --- Longitudinal: engine, brake, engine-braking ---
    braking = (input.throttle < 0 && vLong > 0.2) || (input.handbrake && Math.abs(vLong) > 1);
    if (input.throttle > 0) {
      // Realistic: strong pull off the line, tapering as you approach top speed.
      const headroom = Math.max(0, 1 - Math.max(0, vLong) / handling.maxSpeed);
      vLong += handling.accel * input.throttle * (0.3 + 0.7 * headroom) * dt;
    } else if (input.throttle < 0) {
      if (vLong > 0.2) {
        vLong -= handling.brake * dt; // pressing back while rolling forward = brake
      } else {
        vLong += handling.accel * input.throttle * dt; // then reverse
      }
    } else {
      const eb = handling.engineBrake * dt;
      vLong = Math.abs(vLong) <= eb ? 0 : vLong - Math.sign(vLong) * eb;
    }
    vLong = clamp(vLong, -handling.reverseMax, handling.maxSpeed);
    reversing = vLong < -0.3;

    // --- Lateral: grip damping (exponential). Handbrake loosens the rear, and
    // grip falls away as slip grows (tyre saturation) — so a slide SUSTAINS
    // and recovers progressively instead of snapping straight. ---
    const slipAbs = Math.abs(vLat);
    // Rear stays lit while you're hard on the power mid-slide — THAT is what
    // sustains a drift; lifting off hands grip back and the car straightens.
    const powerLoose = input.throttle > 0.4 && slipAbs > 2.5;
    const gBase = input.handbrake ? handling.driftGrip
      : powerLoose ? handling.driftGrip * 1.6 : handling.grip;
    const g = gBase / (1 + slipAbs * (handling.slipFalloff ?? 0));
    sliding = (input.handbrake && Math.abs(vLong) > 3) || slipAbs > 3.5; // pre-damp = the real slide
    vLat -= vLat * Math.min(1, g * dt);

    // --- Steering: wheel turns toward target; authority falls off with speed,
    // but opens back up while the rear is loose (counter-steer needs to work).
    const speedRatio = Math.min(1, Math.abs(vLong) / handling.maxSpeed);
    let steerCap = lerp(handling.steerMax, handling.steerAtTopSpeed, speedRatio);
    if (sliding) steerCap *= handling.driftSteerBoost ?? 1;
    const steerTarget = input.steer * steerCap;
    cur.steer = approach(cur.steer, steerTarget, handling.steerRate, dt);

    // --- Yaw: bicycle model. No turning at a standstill; reverse flips sign. ---
    cur.heading += (vLong / wheelBase) * Math.tan(cur.steer) * dt;
    // Slip-driven yaw: while the rear is loose, the car keeps rotating INTO
    // the slide on its own — your countersteer (bicycle term above) is what
    // catches it. That balance is the drift; lift off and grip ends it.
    if ((input.handbrake || powerLoose) && Math.abs(vLong) > 4) {
      // Sign: velocity lagging right of the nose (vLat < 0 after a left flick)
      // means the rear is stepping out to the LEFT turn — keep rotating left.
      const slipYaw = clamp(-vLat * (handling.driftYaw ?? 0), -1.0, 1.0);
      cur.heading += slipYaw * dt;
    }

    // Recompose world velocity in the SAME basis we decomposed with. Momentum
    // must live in world space: the heading just rotated, and next frame's
    // decompose against the new heading is what turns that rotation into real
    // lateral slip. (Recomposing with the new heading — the old bug — rotated
    // momentum with the car, so no amount of steering could ever break grip.)
    vx = s * vLong + c * vLat;
    vz = c * vLong - s * vLat;

    // Integrate position.
    cur.x += vx * dt;
    cur.z += vz * dt;

    // Static collision: push out of buildings and reflect velocity (§7).
    if (world?.collide) {
      const res = world.collide(cur.x, cur.z, COLLIDE_R);
      if (res.hit) {
        cur.x = res.x;
        cur.z = res.z;
        const vn = vx * res.nx + vz * res.nz;
        if (vn < 0) { // moving into the wall
          vx -= 1.35 * vn * res.nx;
          vz -= 1.35 * vn * res.nz;
          onImpact?.(Math.min(1.4, Math.abs(vn) * 0.06));
        }
      }
    }

    // Follow the ground height (visual only — handling stays planar).
    cur.y = world?.height ? world.height(cur.x, cur.z) : 0;

    // --- Visual body attitude ---
    // Terrain slope: align the body to the ground so hills read as hills.
    let slopePitch = 0;
    let slopeRoll = 0;
    if (world?.normal) {
      const n = world.normal(cur.x, cur.z, _n);
      const s2b = Math.sin(cur.heading);
      const c2b = Math.cos(cur.heading);
      const along = n.x * s2b + n.z * c2b;       // ground tilt along forward
      const side = n.x * c2b + n.z * (-s2b);     // ground tilt along right
      slopePitch = Math.atan2(along, n.y);       // nose up climbing
      slopeRoll = -Math.atan2(side, n.y);        // lean with the cross-slope
    }
    // Roll: lean outward through corners, proportional to sideways speed.
    const rollTarget = clamp(vLat / 6, -1, 1) * handling.bodyRoll + slopeRoll;
    cur.roll = approach(cur.roll, rollTarget, 8, dt);
    // Squat: nose dips under braking, lifts under acceleration; plus slope.
    const longAcc = (vLong - prevVLong) / dt;
    const pitchTarget = clamp(-longAcc / handling.accel, -1, 1) * handling.squat + slopePitch;
    cur.pitch = approach(cur.pitch, pitchTarget, 8, dt);
    // Wheel roll.
    cur.spin += (vLong * dt) / wheelR;
  }

  /**
   * Apply the interpolated pose to the meshes and return it (for the camera).
   * @param {number} alpha 0..1 between the previous and current fixed step
   */
  function render(alpha) {
    const x = lerp(prev.x, cur.x, alpha);
    const z = lerp(prev.z, cur.z, alpha);
    const y = lerp(prev.y, cur.y, alpha);
    const heading = prev.heading + shortestAngle(prev.heading, cur.heading) * alpha;
    const roll = lerp(prev.roll, cur.roll, alpha);
    const pitch = lerp(prev.pitch, cur.pitch, alpha);
    const steer = lerp(prev.steer, cur.steer, alpha);
    const spin = lerp(prev.spin, cur.spin, alpha);

    root.position.set(x, y, z);
    root.rotation.y = heading;
    tilt.rotation.z = roll;
    tilt.rotation.x = pitch;
    for (const pivot of chassis.steerPivots) pivot.rotation.y = steer;
    for (const wheel of chassis.wheels) wheel.rotation.x = spin;

    return { x, z, y, heading, speed: vLong };
  }

  /** Longitudinal speed in m/s (signed). */
  function getSpeed() { return vLong; }

  /** Light-relevant state — brake lights / reverse glow (read each render). */
  function getSignals() { return { braking, reversing }; }

  /** Skid-mark state: whether the rear is sliding, plus the rear wheels'
   *  ground positions and the direction of travel (marks follow the PATH,
   *  not the heading — that's what makes a drift arc read as a drift). */
  function getSkidInfo() {
    const s = Math.sin(cur.heading);
    const c = Math.cos(cur.heading);
    const wz = -wheelBase / 2; // rear axle
    const wx = (chassis.width || 1.8) / 2 - 0.25;
    const speed = Math.hypot(vx, vz);
    return {
      sliding,
      slip: vLatNow(), // signed lateral speed (m/s) — telemetry/tuning
      travelHeading: speed > 0.5 ? Math.atan2(vx, vz) : cur.heading,
      y: cur.y,
      rear: [
        { x: cur.x + s * wz + c * wx, z: cur.z + c * wz - s * wx },
        { x: cur.x + s * wz - c * wx, z: cur.z + c * wz + s * wx },
      ],
    };
  }

  /** Logical pose (independent of interpolation) — for radar, exit placement. */
  function getState() { return { x: cur.x, z: cur.z, heading: cur.heading }; }

  /** Drop the car at a spawn point. */
  function reset(x = 0, z = 0, heading = 0) {
    cur.x = x; cur.z = z; cur.heading = heading;
    cur.y = world?.height ? world.height(x, z) : 0;
    cur.roll = cur.pitch = cur.steer = cur.spin = 0;
    prev = { ...cur };
    vx = vz = vLong = prevVLong = 0;
  }

  return { update, render, getSpeed, getSignals, getSkidInfo, getState, reset, root, tilt, chassis, get wheelBase() { return wheelBase; } };
}

/** Shortest signed delta from a to b, in (-PI, PI]. */
function shortestAngle(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
