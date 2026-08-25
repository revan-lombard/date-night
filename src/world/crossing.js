/**
 * @file world/crossing.js
 * @responsibility The random road event: a small herd of impala picks the
 * worst possible moment to cross the street ahead of the car — very Germiston-
 * meets-the-bushveld. They walk a straight line across the road and despawn on
 * the far side. A blast of the HORN (or barrelling in close) makes them leap
 * and hurry. Purely visual: no colliders, no fail state — it's a beat of life,
 * not an obstacle course. (Deliberately impala, not a dog: Ayah is a memorial.)
 *
 * @phase Ship polish (the "something random" beat).
 */

import * as THREE from 'three';

const flat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/** Builds one impala; kept simple and cheap (~10 boxes). */
function impala() {
  const g = new THREE.Group();
  const coat = flat(0x9c6a3f);
  const cream = flat(0xd9c7a9);
  const horn = flat(0x3d3126);
  const add = (w, h, d, x, y, z, mat = coat) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  add(0.42, 0.42, 0.85, 0, 0.72, 0);            // body
  add(0.4, 0.14, 0.5, 0, 0.5, 0.05, cream);      // belly band
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(0.09, 0.5, 0.09, sx * 0.14, 0.25, sz * 0.3);
  add(0.2, 0.22, 0.3, 0, 1.06, 0.5);             // neck
  add(0.18, 0.24, 0.3, 0, 1.26, 0.62);           // head
  for (const sx of [-1, 1]) add(0.05, 0.32, 0.05, sx * 0.08, 1.5, 0.55, horn); // lyre horns
  add(0.06, 0.06, 0.22, 0, 0.78, -0.5);          // tail
  return g;
}

/**
 * @param {THREE.Scene} scene
 */
export function createCrossing(scene) {
  const group = new THREE.Group();
  scene.add(group);

  /** @type {{m: THREE.Group, u: number, speed: number, lane: number, hop: number}[]} */
  let herd = [];
  let from = null, to = null;
  let active = false;

  return {
    get active() { return active; },

    /**
     * Send a herd across the road.
     * @param {{x:number,z:number}} point   centre of the crossing, on the road
     * @param {{x:number,z:number}} dir     unit direction OF TRAVEL of the road
     * @param {(x:number,z:number)=>number} heightAt ground sampler
     */
    trigger(point, dir, heightAt) {
      if (active) return;
      active = true;
      // They cross PERPENDICULAR to the road, ~26 m kerb to kerb.
      const px = -dir.z, pz = dir.x;
      from = { x: point.x - px * 13, z: point.z - pz * 13 };
      to = { x: point.x + px * 13, z: point.z + pz * 13 };
      const n = 5 + ((point.x * 7 + point.z * 13) % 3 | 0); // 5-7, deterministic
      herd = [];
      for (let i = 0; i < n; i++) {
        const m = impala();
        const lane = (i - n / 2) * 1.4 + ((i * 37) % 10) / 12; // staggered along the road axis
        m.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
        group.add(m);
        herd.push({ m, u: -0.06 - i * 0.05, speed: 0.055 + ((i * 53) % 10) / 400, lane, hop: 0 });
      }
      this._heightAt = heightAt;
    },

    /** The horn (or a near-miss) sends them leaping for the far kerb. */
    scatter() {
      for (const a of herd) { a.speed = Math.min(0.22, a.speed * 3); a.hop = Math.max(a.hop, 0.9); }
    },

    /** @param {number} dt @param {{x:number,z:number}|null} car for near-miss scatter */
    update(dt, car) {
      if (!active) return;
      const dirX = to.x - from.x, dirZ = to.z - from.z;
      let alive = 0;
      for (const a of herd) {
        a.u += a.speed * dt * 1.9;
        if (a.u > 1.08) { a.m.visible = false; continue; }
        alive++;
        const x = from.x + dirX * a.u + (dirZ / 26) * a.lane * -1;
        const z = from.z + dirZ * a.u + (dirX / 26) * a.lane;
        a.hop = Math.max(0, a.hop - dt * 1.6);
        const y = (this._heightAt ? this._heightAt(x, z) : 0) + 0.1
          + Math.abs(Math.sin(a.u * 60 + a.lane)) * 0.06        // gait bob
          + Math.sin(Math.min(1, a.hop) * Math.PI) * 0.5 * (a.hop > 0 ? 1 : 0); // pronk!
        a.m.position.set(x, y, z);
        // Near-miss: a car within 6 m sends that side of the herd leaping.
        if (car && Math.hypot(car.x - x, car.z - z) < 6 && a.hop <= 0) {
          a.speed = Math.min(0.22, a.speed * 2.5);
          a.hop = 1;
        }
      }
      if (!alive) {
        for (const a of herd) a.m.removeFromParent();
        herd = [];
        active = false;
      }
    },
  };
}
