/**
 * @file car/chassis.js
 * @responsibility Build the procedural car mesh from CAR.silhouette
 * ('hatchback' | 'sedan' | 'suv' | 'pickup' | 'sports') using flat-shaded boxes
 * and cylinders in CAR body/accent colours. Returns a group the vehicle drives,
 * plus front steer pivots and all wheels so the vehicle can animate them.
 *
 * Local frame: forward is +Z, right is +X, up is +Y. Origin at ground level
 * between the wheels, so the group can be dropped straight onto y=0.
 *
 * @phase Implemented in Phase 1.
 */

import * as THREE from 'three';

/**
 * @typedef {Object} Chassis
 * @property {THREE.Group} group        the whole car; parent applies heading/roll
 * @property {THREE.Group[]} steerPivots front-left, front-right steer pivots
 * @property {THREE.Mesh[]} wheels       all four wheel meshes (spin on local X)
 * @property {THREE.Object3D[]} lights   headlight meshes (for Phase 6 glow)
 * @property {number} length            body length in metres (camera/spawn use)
 * @property {number} width
 */

/** Per-silhouette proportions. All lengths in metres. */
const PROFILES = {
  hatchback: { len: 3.9, wid: 1.78, ride: 0.28, bodyH: 0.62, cabH: 0.66, cabFront: -0.1, cabLen: 0.42, wheelR: 0.36, wheelW: 0.26, nose: 0.9, tail: 0.55 },
  sedan:     { len: 4.6, wid: 1.82, ride: 0.26, bodyH: 0.6,  cabH: 0.6,  cabFront: 0.0,  cabLen: 0.4,  wheelR: 0.37, wheelW: 0.26, nose: 1.0, tail: 1.0 },
  suv:       { len: 4.5, wid: 1.9,  ride: 0.42, bodyH: 0.82, cabH: 0.78, cabFront: 0.0,  cabLen: 0.5,  wheelR: 0.44, wheelW: 0.3,  nose: 0.85, tail: 0.7 },
  pickup:    { len: 5.1, wid: 1.9,  ride: 0.44, bodyH: 0.72, cabH: 0.74, cabFront: 0.28, cabLen: 0.34, wheelR: 0.44, wheelW: 0.3,  nose: 0.9, tail: 1.4 },
  sports:    { len: 4.2, wid: 1.9,  ride: 0.18, bodyH: 0.5,  cabH: 0.42, cabFront: -0.05, cabLen: 0.44, wheelR: 0.38, wheelW: 0.3,  nose: 1.05, tail: 0.7 },
};

/**
 * @param {import('../content/personal.js').CAR} car  the CAR config
 * @returns {Chassis}
 */
export function buildChassis(car) {
  const p = PROFILES[car.silhouette] ?? PROFILES.hatchback;
  const group = new THREE.Group();

  const bodyMat = flatMat(car.bodyColor);
  const accentMat = flatMat(car.accentColor);
  const glassMat = flatMat(0x121826);
  const tyreMat = flatMat(0x14161a);
  const rimMat = flatMat(0x9aa3ad);

  const halfLen = p.len / 2;
  const bodyBottom = p.ride + p.wheelR * 0.15; // sill sits just above axle line

  // Lower body — the main volume.
  const body = box(p.wid, p.bodyH, p.len - 0.2, bodyMat);
  body.position.y = bodyBottom + p.bodyH / 2;
  group.add(body);

  // A slightly narrower skirt/accent strip along the sills.
  const skirt = box(p.wid + 0.02, 0.16, p.len - 0.5, accentMat);
  skirt.position.y = bodyBottom + 0.08;
  group.add(skirt);

  // Cabin — shorter box set on top, offset by silhouette.
  const cabLen = (p.len - 0.2) * p.cabLen;
  const cab = box(p.wid - 0.22, p.cabH, cabLen, bodyMat);
  cab.position.set(0, bodyBottom + p.bodyH + p.cabH / 2 - 0.02, p.cabFront * halfLen);
  group.add(cab);

  // Greenhouse (glass) — thin dark box just inside the cabin.
  const glass = box(p.wid - 0.16, p.cabH - 0.16, cabLen - 0.12, glassMat);
  glass.position.copy(cab.position);
  glass.position.y += 0.02;
  group.add(glass);

  // Pickup bed: hollow-ish tray at the rear (a low box + side walls).
  if (car.silhouette === 'pickup') {
    const bedLen = (p.len - 0.2) * 0.42;
    const bedZ = -halfLen + bedLen / 2 + 0.15;
    const bedFloor = box(p.wid - 0.16, 0.14, bedLen, accentMat);
    bedFloor.position.set(0, bodyBottom + p.bodyH - 0.05, bedZ);
    group.add(bedFloor);
    for (const sx of [-1, 1]) {
      const wall = box(0.12, 0.3, bedLen, bodyMat);
      wall.position.set(sx * (p.wid / 2 - 0.08), bodyBottom + p.bodyH + 0.1, bedZ);
      group.add(wall);
    }
  }

  // Lights.
  const lights = [];
  for (const sx of [-1, 1]) {
    const head = box(0.28, 0.16, 0.08, emissiveMat(0xfff2c8, 0.9));
    head.position.set(sx * (p.wid / 2 - 0.28), bodyBottom + p.bodyH * 0.6, halfLen - 0.06);
    group.add(head);
    lights.push(head);

    const tail = box(0.3, 0.14, 0.06, emissiveMat(0xff2a2a, 0.7));
    tail.position.set(sx * (p.wid / 2 - 0.28), bodyBottom + p.bodyH * 0.6, -halfLen + 0.05);
    group.add(tail);
  }

  // Wheels at the four corners.
  const wheelBase = p.len - p.nose - p.tail; // axle-to-axle
  const wz = wheelBase / 2;
  const wx = p.wid / 2 - p.wheelW / 2 + 0.02;

  const steerPivots = [];
  const wheels = [];
  const corners = [
    { x: wx, z: wz, front: true },
    { x: -wx, z: wz, front: true },
    { x: wx, z: -wz, front: false },
    { x: -wx, z: -wz, front: false },
  ];
  for (const c of corners) {
    const pivot = new THREE.Group();
    pivot.position.set(c.x, p.wheelR, c.z);
    group.add(pivot);

    const wheel = makeWheel(p.wheelR, p.wheelW, tyreMat, rimMat);
    pivot.add(wheel);

    wheels.push(wheel);
    if (c.front) steerPivots.push(pivot);
  }

  group.userData.wheelBase = wheelBase;
  return { group, steerPivots, wheels, lights, length: p.len, width: p.wid };
}

/** A flat-shaded Lambert box centred on its own origin. */
function box(w, h, d, material) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
}

/** A wheel: tyre cylinder laid along local X, with a lighter rim cap. */
function makeWheel(r, w, tyreMat, rimMat) {
  const wheel = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 14), tyreMat);
  tyre.rotation.z = Math.PI / 2; // Y-axis cylinder -> X-axis axle
  wheel.add(tyre);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 8), rimMat);
  rim.rotation.z = Math.PI / 2;
  wheel.add(rim);
  // Spin is applied by rotating this group on its local X.
  wheel.userData.isWheel = true;
  return wheel;
}

function flatMat(color) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true });
}

function emissiveMat(color, intensity) {
  return new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });
}
