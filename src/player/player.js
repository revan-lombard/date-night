/**
 * @file player/player.js
 * @responsibility On-foot player controller. Tank-style movement (W/S walk,
 * A/D turn, Shift sprint) consistent with the car controls, drives the avatar's
 * locomotion animation, and exposes an interpolated pose for the follow camera.
 *
 * Shares the heading convention with the car: forward = (sin h, cos h), and
 * steer +1 (A / left) increases heading.
 *
 * @phase Added alongside Phase 1.5 (on-foot player).
 */

import * as THREE from 'three';

const WALK = 3.6;    // m/s
const RUN = 6.4;     // m/s
const TURN = 3.0;    // rad/s
const JUMP_V = 5.0;  // m/s initial upward velocity
const GRAVITY = 16;  // m/s^2

const PLAYER_R = 0.5; // collision circle radius (m)

/**
 * @param {THREE.Scene} scene
 * @param {import('./character.js').Avatar} avatar
 * @param {{world?: {height?:(x:number,z:number)=>number, collide?:(x:number,z:number,r:number)=>{x:number,z:number,hit:boolean}}}} [opts]
 */
export function createPlayer(scene, avatar, opts = {}) {
  const { world } = opts;
  scene.add(avatar.group);

  const cur = { x: 0, z: 0, heading: 0, y: 0, stretch: 1 }; // y = jump offset; stretch = squash/stretch
  let prev = { ...cur };
  let speed = 0;      // current planar speed magnitude (m/s), for camera/animation
  let yVel = 0;
  let grounded = true;

  const groundAt = (x, z) => (world?.height ? world.height(x, z) : 0);

  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /**
   * @param {number} dt
   * @param {import('../core/input.js').InputState} input
   * @param {number} [orbitYaw]  camera yaw; movement is relative to it (GTA-style)
   */
  function update(dt, input, orbitYaw = 0) {
    prev = { ...cur };

    // Camera-relative move vector: W/S = forward/back, A/D = left/right.
    // Looking along +orbitYaw, screen-right is (−cos, sin); the (cos,−sin) basis
    // below is its negative, so the right axis must be +steer (A−D), not −steer.
    const mf = input.throttle;   // forward axis
    const mr = input.steer;      // right axis in the (cos,−sin) basis used below
    const moving = mf !== 0 || mr !== 0;
    const running = input.run && moving;
    const moveSpeed = running ? RUN : WALK;

    let backpedal = false;
    if (moving) {
      // Direction in world space relative to where the camera looks.
      let dirX = Math.sin(orbitYaw) * mf + Math.cos(orbitYaw) * mr;
      let dirZ = Math.cos(orbitYaw) * mf - Math.sin(orbitYaw) * mr;
      const len = Math.hypot(dirX, dirZ) || 1;
      dirX /= len; dirZ /= len;
      cur.x += dirX * moveSpeed * dt;
      cur.z += dirZ * moveSpeed * dt;
      speed = moveSpeed;
      // Mostly-backward input (S) backpedals: keep facing forward (camera dir).
      backpedal = mf < -0.05 && Math.abs(mf) >= Math.abs(mr);
      const faceTarget = backpedal ? orbitYaw : Math.atan2(dirX, dirZ);
      cur.heading += shortestAngle(cur.heading, faceTarget) * Math.min(1, 12 * dt);
    } else {
      speed = 0;
    }

    // Collide with buildings (planar).
    if (world?.collide) {
      const res = world.collide(cur.x, cur.z, PLAYER_R);
      if (res.hit) { cur.x = res.x; cur.z = res.z; }
    }

    // Jump + gravity. You can still steer/move in the air.
    if (input.jump && grounded) {
      yVel = JUMP_V;
      grounded = false;
      cur.stretch = 0.8;   // anticipation squash at take-off
      avatar.jump();       // fires a Jump clip if the rig has one
    }
    const wasAir = !grounded;
    if (!grounded) {
      yVel -= GRAVITY * dt;
      cur.y += yVel * dt;
      if (cur.y <= 0) { cur.y = 0; yVel = 0; grounded = true; }
    }
    const justLanded = wasAir && grounded;

    // Procedural squash & stretch so the jump reads even without a jump clip:
    // stretch tall while rising/falling fast, squash on take-off and landing.
    let stretchTarget = 1;
    if (!grounded) stretchTarget = clamp(1 + yVel * 0.03, 0.85, 1.16);
    else if (justLanded) stretchTarget = 0.8;
    cur.stretch += (stretchTarget - cur.stretch) * Math.min(1, 16 * dt);

    // Locomotion animation.
    if (grounded) avatar.setState(moving ? (running && !backpedal ? 'run' : 'walk') : 'idle');
    // Footspeed match; backpedal plays the walk clip in reverse.
    const ts = !moving ? 1 : backpedal ? -(speed / WALK) : speed / (running ? RUN : WALK);
    avatar.setTimeScale?.(ts);

    avatar.update(dt);
  }

  /** Apply the interpolated pose to the avatar and return it (for the camera). */
  function render(alpha) {
    const x = lerp(prev.x, cur.x, alpha);
    const z = lerp(prev.z, cur.z, alpha);
    const jumpY = lerp(prev.y, cur.y, alpha);
    const y = groundAt(x, z) + jumpY; // terrain height + jump arc
    const heading = prev.heading + shortestAngle(prev.heading, cur.heading) * alpha;
    avatar.group.position.set(x, y, z);
    avatar.group.rotation.y = heading;
    // Squash & stretch (volume-preserving: widen as it flattens).
    const st = lerp(prev.stretch, cur.stretch, alpha);
    const sxz = 1 / Math.sqrt(st);
    avatar.group.scale.set(sxz, st, sxz);
    return { x, z, y, heading, speed };
  }

  function setVisible(v) { avatar.group.visible = v; }

  /** Place the player (e.g. beside the car on exit). */
  function place(x, z, heading) {
    cur.x = x; cur.z = z; cur.heading = heading; cur.y = 0; cur.stretch = 1;
    prev = { ...cur };
    speed = 0; yVel = 0; grounded = true;
    avatar.setState('idle');
    avatar.setTimeScale?.(1);
    avatar.group.position.set(x, groundAt(x, z), z);
    avatar.group.rotation.y = heading;
    avatar.group.scale.set(1, 1, 1);
  }

  function getState() { return { x: cur.x, z: cur.z, y: cur.y, heading: cur.heading, speed, grounded, stretch: cur.stretch }; }

  return { update, render, setVisible, place, getState };
}

/** Shortest signed delta from a to b, in (-PI, PI]. */
function shortestAngle(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
