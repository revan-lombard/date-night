/**
 * @file mission/waypoint.js
 * @responsibility The venue destination: a tall glowing beam + ground ring so
 * it reads from across town, a distance query, and an on-screen-arrow solver
 * that points to it when it's off camera (or behind you).
 *
 * @phase Implemented in Phase 3.
 */

import * as THREE from 'three';

/**
 * @param {THREE.Scene} scene
 * @param {{x:number, z:number}} pos
 * @param {number} groundY
 */
export function createWaypoint(scene, pos, groundY = 0) {
  const group = new THREE.Group();
  group.position.set(pos.x, groundY, pos.z);

  const color = 0xff3e6c;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.3, 1.3, 70, 14, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 35;
  group.add(beam);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 3.2, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  group.add(ring);

  scene.add(group);

  const worldTop = new THREE.Vector3();
  let tx = pos.x, tz = pos.z, ty = groundY;

  return {
    group,
    get position() { return { x: tx, z: tz }; },
    setVisible(v) { group.visible = v; },
    /** Move the destination (florist -> coffee shop). */
    setTarget(p, gy) { tx = p.x; tz = p.z; ty = gy; group.position.set(tx, ty, tz); },
    distanceTo(x, z) { return Math.hypot(x - tx, z - tz); },

    /**
     * Where to draw the on-screen arrow.
     * @param {THREE.Camera} camera
     * @param {number} w @param {number} h  viewport size in px
     * @returns {{onScreen:boolean, x:number, y:number, deg:number}}
     */
    screenArrow(camera, w, h) {
      worldTop.set(tx, ty + 4, tz);
      // Camera-space z<0 means in front of the camera.
      const camZ = worldTop.clone().applyMatrix4(camera.matrixWorldInverse).z;
      const inFront = camZ < -0.1;
      const ndc = worldTop.clone().project(camera);
      let nx = ndc.x, ny = ndc.y;
      if (!inFront) { nx = -nx; ny = -ny; } // behind: mirror so the arrow still points the right way
      const onScreen = inFront && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;

      // Clamp toward the screen edge (NDC), keeping a margin.
      const m = 0.86;
      const mag = Math.max(Math.abs(nx), Math.abs(ny)) || 1;
      if (mag > m) { nx = (nx / mag) * m; ny = (ny / mag) * m; }
      return {
        onScreen,
        x: (nx * 0.5 + 0.5) * w,
        y: (-ny * 0.5 + 0.5) * h,
        deg: Math.atan2(ndc.x * (inFront ? 1 : -1), ndc.y * (inFront ? 1 : -1)) * 180 / Math.PI,
      };
    },
  };
}
