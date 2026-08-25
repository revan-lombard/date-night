/**
 * @file world/bushveld.js
 * @responsibility Dress the countryside beyond the city as South African
 * bushveld: scattered flat-topped acacias, bushes, dry grass tufts and rocks,
 * plus small herds of low-poly animals (impala, zebra, giraffe, elephant) that
 * gently wander. Everything is instanced (a handful of draw calls total) and
 * only placed where classify() says 'country', so nothing lands on roads/city.
 *
 * @phase Polish pass.
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { terrainHeight, classify, CITY_EXTENT } from './layout.js';

const RING_MIN = CITY_EXTENT + 18;
const RING_MAX = 620;

function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

const flat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** Pick `n` country points in the ring. @returns {{x,z,y,rot,scale}[]} */
function scatter(rng, n, sMin, sMax) {
  const out = [];
  let guard = 0;
  while (out.length < n && guard++ < n * 12) {
    const a = rng() * Math.PI * 2;
    const r = RING_MIN + rng() * (RING_MAX - RING_MIN);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (classify(x, z) !== 'country') continue;
    out.push({ x, z, y: terrainHeight(x, z), rot: rng() * Math.PI * 2, scale: sMin + rng() * (sMax - sMin) });
  }
  return out;
}

/** Fill an InstancedMesh from placement records. */
function fillInstances(mesh, placements, yOffset = 0) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  placements.forEach((pl, i) => {
    e.set(0, pl.rot, 0);
    q.setFromEuler(e);
    s.set(pl.scale, pl.scale, pl.scale);
    p.set(pl.x, pl.y + yOffset, pl.z);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

// --- Animal geometries (merged to one mesh per species; facing +Z) ---------
function quadruped({ bodyL, bodyW, bodyH, legLen, legT, neckLen, neckW, headL, headW, headH, neckAngle, extras = [] }) {
  const parts = [];
  const bodyCY = legLen + bodyH / 2;
  parts.push(box(bodyW, bodyH, bodyL, 0, bodyCY, 0));
  const lx = bodyW / 2 - legT / 2;
  const lz = bodyL / 2 - legT;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(legT, legLen, legT, sx * lx, legLen / 2, sz * lz));
  // Neck: tilt forward from the body's front.
  const neck = new THREE.BoxGeometry(neckW, neckLen, neckW);
  neck.rotateX(-neckAngle);
  const nY = bodyCY + bodyH / 2 + (neckLen / 2) * Math.cos(neckAngle) - 0.05;
  const nZ = bodyL / 2 - 0.1 + (neckLen / 2) * Math.sin(neckAngle);
  neck.translate(0, nY, nZ);
  parts.push(neck);
  const hY = nY + (neckLen / 2) * Math.cos(neckAngle);
  const hZ = nZ + (neckLen / 2) * Math.sin(neckAngle) + headL / 2 - 0.05;
  parts.push(box(headW, headH, headL, 0, hY, hZ));
  for (const ex of extras) parts.push(ex(hY, hZ, bodyCY));
  return mergeGeometries(parts, false);
}

function impalaGeo() {
  const horn = (side) => (hY, hZ) => box(0.05, 0.5, 0.05, side * 0.09, hY + 0.35, hZ).translate(0, 0, 0);
  return quadruped({ bodyL: 1.05, bodyW: 0.42, bodyH: 0.52, legLen: 0.72, legT: 0.1, neckLen: 0.55, neckW: 0.18, headL: 0.38, headW: 0.2, headH: 0.24, neckAngle: 0.5, extras: [horn(-1), horn(1)] });
}
function zebraGeo() {
  return quadruped({ bodyL: 1.25, bodyW: 0.5, bodyH: 0.62, legLen: 0.82, legT: 0.12, neckLen: 0.6, neckW: 0.22, headL: 0.46, headW: 0.24, headH: 0.28, neckAngle: 0.55 });
}
function giraffeGeo() {
  const ossicone = (side) => (hY, hZ) => box(0.06, 0.3, 0.06, side * 0.07, hY + 0.2, hZ);
  return quadruped({ bodyL: 1.5, bodyW: 0.6, bodyH: 0.8, legLen: 2.2, legT: 0.16, neckLen: 2.6, neckW: 0.28, headL: 0.5, headW: 0.26, headH: 0.3, neckAngle: 0.42, extras: [ossicone(-1), ossicone(1)] });
}
function elephantGeo() {
  const parts = [];
  const legLen = 1.5, bodyH = 1.7, bodyL = 3.0, bodyW = 1.5;
  const bodyCY = legLen + bodyH / 2;
  parts.push(box(bodyW, bodyH, bodyL, 0, bodyCY, 0));
  const lx = bodyW / 2 - 0.22, lz = bodyL / 2 - 0.35;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.4, legLen, 0.4, sx * lx, legLen / 2, sz * lz));
  const head = box(1.1, 1.2, 1.0, 0, bodyCY + 0.3, bodyL / 2 + 0.3);
  parts.push(head);
  for (const sx of [-1, 1]) parts.push(box(0.12, 0.9, 0.7, sx * 0.62, bodyCY + 0.4, bodyL / 2 + 0.25)); // ears
  const trunk = new THREE.BoxGeometry(0.3, 1.3, 0.3);
  trunk.rotateX(0.5);
  trunk.translate(0, bodyCY - 0.2, bodyL / 2 + 0.9);
  parts.push(trunk);
  return mergeGeometries(parts, false);
}

/**
 * @param {THREE.Scene} scene
 * @returns {{ update: (dt:number)=>void }}
 */
export function createBushveld(scene) {
  const group = new THREE.Group();
  const rng = makeRng(0x5afe);

  // --- Static flora (instanced) ---
  const trees = scatter(rng, 170, 0.8, 1.7);
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.22, 2.6, 6).translate(0, 1.3, 0);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, flat(0x5b4a34), trees.length);
  fillInstances(trunkMesh, trees);
  const canopyGeo = new THREE.ConeGeometry(3.2, 1.5, 8).translate(0, 3.3, 0); // flat-topped umbrella
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, flat(0x6f7a3e), trees.length);
  fillInstances(canopyMesh, trees);
  group.add(trunkMesh, canopyMesh);

  const bushes = scatter(rng, 240, 0.6, 1.6);
  const bushMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.9, 0).translate(0, 0.7, 0), flat(0x6b7436), bushes.length);
  fillInstances(bushMesh, bushes);
  group.add(bushMesh);

  const grass = scatter(rng, 340, 0.6, 1.4);
  const grassMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.32, 0.7, 4).translate(0, 0.35, 0), flat(0xc2b46a), grass.length);
  fillInstances(grassMesh, grass);
  group.add(grassMesh);

  const rocks = scatter(rng, 120, 0.5, 1.8);
  const rockMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.6, 0).scale(1, 0.6, 1).translate(0, 0.3, 0), flat(0x7a756b), rocks.length);
  fillInstances(rockMesh, rocks);
  group.add(rockMesh);

  // --- Animals (instanced per species, gentle wander) ---
  const species = [
    { geo: impalaGeo(), color: 0xb07a4a, count: 24, herds: 4, spread: 20, speed: 1.3 },
    { geo: zebraGeo(), color: 0xdad3c4, count: 12, herds: 3, spread: 22, speed: 1.1 },
    { geo: giraffeGeo(), color: 0xc9a24a, count: 8, herds: 3, spread: 26, speed: 0.8 },
    { geo: elephantGeo(), color: 0x7d8084, count: 5, herds: 2, spread: 24, speed: 0.6 },
  ];
  /** @type {{mesh:THREE.InstancedMesh, herd:any[]}[]} */
  const animals = [];
  for (const sp of species) {
    const mesh = new THREE.InstancedMesh(sp.geo, flat(sp.color), sp.count);
    mesh.castShadow = true;
    const herd = [];
    const per = Math.ceil(sp.count / sp.herds);
    for (let h = 0; h < sp.herds && herd.length < sp.count; h++) {
      const c = scatter(rng, 1, 0, 0)[0]; // a country herd centre
      for (let k = 0; k < per && herd.length < sp.count; k++) {
        herd.push({
          x: c.x + (rng() - 0.5) * sp.spread,
          z: c.z + (rng() - 0.5) * sp.spread,
          heading: rng() * Math.PI * 2,
          speed: sp.speed * (0.6 + rng() * 0.6),
          phase: rng() * 6.28, turn: 0,
        });
      }
    }
    group.add(mesh);
    animals.push({ mesh, herd });
  }

  scene.add(group);

  // Dev: expose a herd centre so tests can teleport to the animals.
  if (import.meta.env.DEV) window.__herds = animals.map((a) => a.herd[0]);

  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _e = new THREE.Euler();
  const _s = new THREE.Vector3(1, 1, 1);
  const _p = new THREE.Vector3();

  function update(dt) {
    for (const { mesh, herd } of animals) {
      for (let i = 0; i < herd.length; i++) {
        const a = herd[i];
        a.turn -= dt;
        if (a.turn <= 0) { a.heading += (Math.random() - 0.5) * 1.2; a.turn = 1.5 + Math.random() * 3; }
        a.x += Math.sin(a.heading) * a.speed * dt;
        a.z += Math.cos(a.heading) * a.speed * dt;
        const r = Math.hypot(a.x, a.z);
        if (r < RING_MIN || r > RING_MAX) a.heading += Math.PI; // stay in the bush
        a.phase += dt * 4;
        const y = terrainHeight(a.x, a.z) + Math.abs(Math.sin(a.phase)) * 0.04;
        _e.set(0, a.heading, 0);
        _q.setFromEuler(_e);
        _p.set(a.x, y, a.z);
        mesh.setMatrixAt(i, _m.compose(_p, _q, _s));
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  return { update };
}
