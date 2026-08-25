/**
 * @file world/streetfurniture.js
 * @responsibility Street dressing along the road grid: raised sidewalk kerbs
 * around each block (conforming to the terrain slope), lamp posts down every
 * road (emissive heads for the dusk glow), and traffic lights at the interior
 * intersections. Everything is instanced — a handful of draw calls — and sits
 * on the terrain via height/normal sampling.
 *
 * @phase Polish pass (Motor-Town-style detail).
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, BLOCK, ROAD, PITCH, HALF, ROAD_LINES, CITY_EXTENT, blockCentre, terrainHeight, classify } from './layout.js';
import { terrainNormal } from './terrain.js';

const flat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const glow = (c, i = 1) => new THREE.MeshBasicMaterial({ color: c });

/** Orientation that lays a unit-XZ box on the slope, long axis along `dir`. */
function slopeBasis(px, pz, dir, n, out) {
  terrainNormal(px, pz, n);
  const t = dir.clone().addScaledVector(n, -dir.dot(n)).normalize(); // length axis
  const b = n.clone().cross(t).normalize();                          // width axis
  return out.makeBasis(b, n, t);
}

export function createStreetFurniture(scene) {
  const group = new THREE.Group();
  buildKerbs(group);
  buildLamps(group);
  buildTrafficLights(group);
  scene.add(group);
  return group;
}

// --- Sidewalk kerbs around every block -------------------------------------
function buildKerbs(group) {
  const segs = [];
  const half = BLOCK / 2 + 0.4; // just outside the block, at the road edge
  const K = 4;                  // segments per edge (follows the slope)
  for (let ix = 0; ix < N; ix++) {
    for (let iz = 0; iz < N; iz++) {
      const { x: cx, z: cz } = blockCentre(ix, iz);
      const segLen = BLOCK / K + 0.4;
      for (let e = 0; e < K; e++) {
        const t = -BLOCK / 2 + BLOCK / (2 * K) + e * (BLOCK / K);
        segs.push({ x: cx + t, z: cz - half, dir: new THREE.Vector3(1, 0, 0), len: segLen }); // N edge
        segs.push({ x: cx + t, z: cz + half, dir: new THREE.Vector3(1, 0, 0), len: segLen }); // S edge
        segs.push({ x: cx - half, z: cz + t, dir: new THREE.Vector3(0, 0, 1), len: segLen }); // W edge
        segs.push({ x: cx + half, z: cz + t, dir: new THREE.Vector3(0, 0, 1), len: segLen }); // E edge
      }
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mesh = new THREE.InstancedMesh(geo, flat(0xbdbdb4), segs.length);
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const n = new THREE.Vector3();
  const b = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    slopeBasis(seg.x, seg.z, seg.dir, n, b);
    q.setFromRotationMatrix(b);
    p.set(seg.x, terrainHeight(seg.x, seg.z), seg.z).addScaledVector(n, 0.12);
    s.set(0.35, 0.28, seg.len); // width, height, length
    mesh.setMatrixAt(i, m.compose(p, q, s));
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

// --- Lamp posts down every road --------------------------------------------
function buildLamps(group) {
  const POLE_H = 5.2;
  const off = ROAD / 2 + 0.9; // sit on the pavement, clear of the road
  const spots = [];
  const onPavement = (x, z) => classify(x, z) === 'pavement';
  for (const line of ROAD_LINES) {
    for (let p = -CITY_EXTENT; p <= CITY_EXTENT; p += 44) {
      const cand = [
        { x: line - off, z: p, face: 1 },
        { x: line + off, z: p, face: -1 },
        { x: p, z: line - off, face: 1, axis: 'x' },
        { x: p, z: line + off, face: -1, axis: 'x' },
      ];
      // Only keep lamps that land on a sidewalk (never in a road/intersection).
      for (const c of cand) if (onPavement(c.x, c.z)) spots.push(c);
    }
  }
  // Pole + arm merged (grey), plus an emissive head instanced at the arm tip.
  const pole = new THREE.CylinderGeometry(0.09, 0.12, POLE_H, 6).translate(0, POLE_H / 2, 0);
  const arm = new THREE.BoxGeometry(0.1, 0.1, 1.1).translate(0, POLE_H - 0.15, 0.55);
  const poleGeo = mergeGeometries([pole, arm], false);
  const poleMesh = new THREE.InstancedMesh(poleGeo, flat(0x30343b), spots.length);
  poleMesh.castShadow = true;
  const headGeo = new THREE.BoxGeometry(0.34, 0.18, 0.5);
  const headMesh = new THREE.InstancedMesh(headGeo, glow(0xffdca0), spots.length);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i];
    // Face the arm toward the road: rotate so +Z (arm) points inward.
    const yaw = sp.axis === 'x'
      ? (sp.face > 0 ? -Math.PI / 2 : Math.PI / 2)
      : (sp.face > 0 ? 0 : Math.PI);
    e.set(0, yaw, 0); q.setFromEuler(e);
    const gy = terrainHeight(sp.x, sp.z);
    p.set(sp.x, gy, sp.z);
    poleMesh.setMatrixAt(i, m.compose(p, q, one));
    // Head at the arm tip (1.1 out along local +Z, near the top).
    p.set(sp.x + Math.sin(yaw) * 1.05, gy + 5.0, sp.z + Math.cos(yaw) * 1.05);
    headMesh.setMatrixAt(i, m.compose(p, q, one));
  }
  poleMesh.instanceMatrix.needsUpdate = true;
  headMesh.instanceMatrix.needsUpdate = true;
  group.add(poleMesh, headMesh);
}

// --- Traffic lights at interior intersections ------------------------------
function buildTrafficLights(group) {
  const spots = [];
  for (let i = 1; i < ROAD_LINES.length - 1; i++) {
    for (let j = 1; j < ROAD_LINES.length - 1; j++) {
      spots.push({ x: ROAD_LINES[i] - (ROAD / 2 + 0.5), z: ROAD_LINES[j] - (ROAD / 2 + 0.5) });
    }
  }
  const POLE_H = 3.6;
  const pole = new THREE.CylinderGeometry(0.08, 0.1, POLE_H, 6).translate(0, POLE_H / 2, 0);
  const housing = new THREE.BoxGeometry(0.34, 0.9, 0.24).translate(0, POLE_H + 0.35, 0);
  const bodyGeo = mergeGeometries([pole, housing], false);
  const bodyMesh = new THREE.InstancedMesh(bodyGeo, flat(0x2b2e33), spots.length);
  bodyMesh.castShadow = true;

  const dotGeo = new THREE.CircleGeometry(0.09, 10);
  const mk = (color) => new THREE.InstancedMesh(dotGeo, glow(color), spots.length);
  const red = mk(0xff3b30);
  const amber = mk(0xffb02e);
  const green = mk(0x33d158);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i];
    const gy = terrainHeight(sp.x, sp.z);
    p.set(sp.x, gy, sp.z);
    bodyMesh.setMatrixAt(i, m.compose(p, q, one));
    const zf = 0.13; // dots on the +Z face
    for (const [mesh, yy] of [[red, POLE_H + 0.6], [amber, POLE_H + 0.35], [green, POLE_H + 0.1]]) {
      p.set(sp.x, gy + yy, sp.z + zf);
      mesh.setMatrixAt(i, m.compose(p, q, one));
    }
  }
  for (const mesh of [bodyMesh, red, amber, green]) mesh.instanceMatrix.needsUpdate = true;
  group.add(bodyMesh, red, amber, green);
}
