/**
 * @file car/camera.js
 * @responsibility Chase camera: position lags the car on a spring, look-at leads
 * it by velocity * lookAhead, FOV widens 60deg->72deg with speed (§7). Replaces
 * the Phase-0 orbit camera. Honours a reduce-motion flag (§11) and exposes a
 * shake hook the collision system will call in Phase 2.
 *
 * @phase Implemented in Phase 1.
 */

import * as THREE from 'three';

/** Live-editable chase-camera parameters. */
export const DEFAULT_CHASE = {
  distance: 8.5,     // metres behind the car
  height: 3.6,       // metres above ground
  lookAhead: 0.35,   // look-at leads the car by speed * this (§7)
  lookHeight: 1.2,   // aim a little above the road
  stiffness: 9.0,    // spring rate; higher = snappier follow
  baseFov: 60,
  maxFov: 72,
  reduceMotion: false,
};

/**
 * @param {THREE.PerspectiveCamera} camera
 * @param {{maxSpeed: number}} handling  read for the speed->FOV mapping
 * @param {typeof DEFAULT_CHASE} params   mutable; edited live by the dev panel
 */
export function createChaseCamera(camera, handling, params = DEFAULT_CHASE) {
  const camPos = new THREE.Vector3();
  const desired = new THREE.Vector3();
  const lookAt = new THREE.Vector3();
  const shakeOffset = new THREE.Vector3();
  let shake = 0;
  let initialised = false;

  /**
   * @param {{x:number, z:number, y?:number, heading:number, speed:number}} pose interpolated pose
   * @param {number} frameDt  real seconds since the last render (spring uses wall time)
   * @param {number} [orbitYaw]  direction the camera looks along (defaults to pose.heading)
   * @param {number} [pitch]     vertical orbit; higher = more over-the-shoulder / top-down
   */
  function update(pose, frameDt, orbitYaw = pose.heading, pitch = 0.28) {
    const s = Math.sin(orbitYaw);
    const c = Math.cos(orbitYaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const groundY = pose.y || 0; // follow terrain elevation

    // Desired camera orbits behind by yaw, lifted by pitch.
    desired.set(
      pose.x - s * cp * params.distance,
      groundY + params.height + sp * params.distance,
      pose.z - c * cp * params.distance,
    );

    if (!initialised) {
      camPos.copy(desired);
      initialised = true;
    } else {
      // Critically-ish damped spring via frame-rate-independent smoothing.
      const t = 1 - Math.exp(-params.stiffness * frameDt);
      camPos.lerp(desired, t);
    }

    // Camera shake decays over ~0.4s; skipped under reduce-motion.
    shakeOffset.set(0, 0, 0);
    if (shake > 0.0001 && !params.reduceMotion) {
      shakeOffset.set(
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake,
        (Math.random() - 0.5) * shake,
      );
      shake = Math.max(0, shake - frameDt * shake * 6);
    } else {
      shake = 0;
    }

    camera.position.copy(camPos).add(shakeOffset);

    // Look-at leads the car along its heading, scaled by speed.
    const lead = pose.speed * params.lookAhead;
    lookAt.set(
      pose.x + s * lead,
      groundY + params.lookHeight,
      pose.z + c * lead,
    );
    camera.lookAt(lookAt);

    // FOV widens with speed — the cheapest, strongest sense of speed (§7).
    const targetFov = params.reduceMotion
      ? params.baseFov
      : THREE.MathUtils.lerp(
          params.baseFov,
          params.maxFov,
          Math.min(1, Math.abs(pose.speed) / handling.maxSpeed),
        );
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, 1 - Math.exp(-6 * frameDt));
      camera.updateProjectionMatrix();
    }
  }

  /** Kick the camera — collision response calls this in Phase 2. */
  function addShake(magnitude) {
    shake = Math.max(shake, magnitude);
  }

  /** Snap behind the car without a spring lerp (after a reset/teleport). */
  function snap() { initialised = false; }

  /**
   * Seed the internal spring position (e.g. the other camera's current spot) so
   * this camera springs smoothly from there instead of hard-cutting. Used when
   * switching between the on-foot and driving cameras.
   * @param {THREE.Vector3} position
   */
  function adopt(position) {
    camPos.copy(position);
    initialised = true;
  }

  return { update, addShake, snap, adopt };
}
