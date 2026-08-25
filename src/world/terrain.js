/**
 * @file world/terrain.js
 * @responsibility The single rolling ground mesh. It undulates everywhere (the
 * map is never flat) and the streets/pavements/parks are baked in as vertex
 * colours, so roads follow the hills with no separate plane to clip. Exposes
 * the height sampler + normal (re-used from layout) for the car and player.
 *
 * @phase Phase 2 (revised — hilly city).
 */

import * as THREE from 'three';
import { terrainHeight, classify } from './layout.js';

export { terrainHeight };

const COLORS = {
  road: new THREE.Color(0x2b2f36),
  pavement: new THREE.Color(0x8f959e),
  park: new THREE.Color(0x3f7a44),
  country: new THREE.Color(0x9a8f52), // dry bushveld savanna (khaki-gold)
};

/** Approximate surface normal via finite differences (for slope-leaning). */
export function terrainNormal(x, z, out = new THREE.Vector3()) {
  const e = 1.5;
  out.set(
    terrainHeight(x - e, z) - terrainHeight(x + e, z),
    2 * e,
    terrainHeight(x, z - e) - terrainHeight(x, z + e),
  ).normalize();
  return out;
}

/**
 * Build the terrain mesh and add it to the scene.
 * @param {THREE.Scene} scene
 */
export function createTerrain(scene) {
  const SIZE = 1600;
  const SEG = 320; // ~5 m cells — crisp enough for 13 m roads at low-poly
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    c.copy(COLORS[classify(x, z)] || COLORS.country);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
