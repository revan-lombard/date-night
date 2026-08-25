/**
 * @file car/skids.js
 * @responsibility Rubber on the road. A fixed pool of flat dark quads laid
 * under the rear wheels while the car slides (handbrake or a real lateral
 * break-away). Each mark fades out over a few seconds and the pool recycles
 * oldest-first, so cost is bounded no matter how lairy the driving gets.
 *
 * Marks are laid as segments between successive drop points per wheel, so a
 * drift draws two continuous arcs that follow the car's PATH (not its heading).
 *
 * @phase Polish pass alongside the hero-car work.
 */

import * as THREE from 'three';

const TTL = 7;          // seconds a mark stays visible
const MIN_SEG = 0.5;    // metres of travel before the next segment is laid
const MAX_SEG = 3;      // teleport guard — longer gaps just restart the trail
const WIDTH = 0.3;      // tyre-ish width
const OPACITY = 0.65;

/**
 * @param {THREE.Scene} scene
 * @param {number} max pooled quad count (240 ≈ two long drifts on screen)
 */
export function createSkidMarks(scene, max = 240) {
  // Unit quad on XZ, length along Z; scaled per segment.
  const geo = new THREE.PlaneGeometry(WIDTH, 1);
  geo.rotateX(-Math.PI / 2);

  const group = new THREE.Group();
  scene.add(group);

  /** @type {{mesh: THREE.Mesh, life: number}[]} */
  const pool = [];
  for (let i = 0; i < max; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x0b0b0d,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2, // float just above the tar, no z-fighting
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    group.add(mesh);
    pool.push({ mesh, life: 0 });
  }
  let next = 0; // ring index — overwrites the oldest when the pool wraps

  /** Last drop point per rear wheel, or null when the slide broke off. */
  const last = [null, null];

  /** Lay one faded quad from a to b. */
  function segment(a, b, y) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    const slot = pool[next];
    next = (next + 1) % pool.length;
    slot.life = TTL;
    slot.mesh.visible = true;
    // The road deck sits ~0.10 m above the terrain height the car tracks —
    // lay marks just above the DECK, or they vanish under the tar.
    slot.mesh.position.set((a.x + b.x) / 2, y + 0.13, (a.z + b.z) / 2);
    slot.mesh.rotation.y = Math.atan2(dx, dz);
    slot.mesh.scale.set(1, 1, len + 0.12); // slight overlap hides the joins
    slot.mesh.material.opacity = OPACITY;
  }

  return {
    /**
     * Feed every fixed step while driving.
     * @param {ReturnType<import('./vehicle.js').createVehicle>['getSkidInfo']} info
     */
    drop(info) {
      if (!info.sliding) { last[0] = last[1] = null; return; }
      for (let i = 0; i < 2; i++) {
        const p = info.rear[i];
        const prev = last[i];
        if (!prev) { last[i] = { ...p }; continue; }
        const d = Math.hypot(p.x - prev.x, p.z - prev.z);
        if (d < MIN_SEG) continue;
        if (d < MAX_SEG) segment(prev, p, info.y);
        last[i] = { ...p };
      }
    },

    /** Fade the pool; call once per render with the frame dt. */
    update(dt) {
      for (const s of pool) {
        if (!s.life) continue;
        s.life = Math.max(0, s.life - dt);
        const t = s.life / TTL;
        s.mesh.material.opacity = OPACITY * t * t; // ease-out fade
        if (!s.life) s.mesh.visible = false;
      }
    },
  };
}
