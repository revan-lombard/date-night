/**
 * @file world/cityKit.js
 * @responsibility Load Kenney's CC0 low-poly city building models and place one
 * per building lot on the procedural grid — replacing the procedural boxes with
 * proper models while every game system (collision, GPS road-graph, minimap,
 * terrain) keeps working off the same grid. Falls back gracefully (returns null)
 * if the models aren't present.
 *
 * Models: public/models/city/*.glb (Kenney Starter-Kit-City-Builder, CC0).
 *
 * @phase Polish pass.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const BASE = import.meta.env.BASE_URL;
const loader = new GLTFLoader();
const BUILDINGS = ['building-small-a', 'building-small-b', 'building-small-c', 'building-small-d', 'building-garage'];

function load(path) {
  return new Promise((res, rej) => loader.load(BASE + path, res, undefined, rej));
}

/**
 * @returns {Promise<Array<{scene:THREE.Object3D, size:THREE.Vector3, base:number}>|null>}
 */
export async function loadCityKit() {
  try {
    const models = [];
    for (const name of BUILDINGS) {
      const gltf = await load(`models/city/${name}.glb`);
      const scene = gltf.scene;
      scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      models.push({ scene, size, base: box.min.y });
    }
    return models;
  } catch (e) {
    console.warn('[cityKit] models unavailable, keeping procedural buildings', e);
    return null;
  }
}

/**
 * Place a kit building on every non-park lot, scaled to its footprint and set on
 * the terrain. Deterministic. Returns the group (already added to the scene).
 * @param {THREE.Scene} scene
 * @param {Array<{x:number,z:number,park:boolean,w:number,d:number}>} lots  minimap.blocks
 * @param {Array<{scene:THREE.Object3D, size:THREE.Vector3, base:number}>} kit
 * @param {(x:number,z:number)=>number} heightAt  terrain height sampler
 */
export function placeCityBuildings(scene, lots, kit, heightAt, exclude) {
  const group = new THREE.Group();
  const colliders = []; // accurate AABBs matching the placed models (no invisible walls)
  let s = 0x1a2b3c >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };

  for (const lot of lots) {
    if (lot.park) continue;
    if (exclude && exclude(lot)) continue; // leave shop blocks for the story buildings
    const m = kit[(rng() * kit.length) | 0];
    const inst = m.scene.clone(true);
    // These are small Kenney houses/shops — keep them believable (cap the
    // footprint) rather than stretching one to fill a whole 30 m lot.
    const target = Math.min(lot.w, lot.d, 14) * (0.8 + rng() * 0.15);
    const sc = target / Math.max(m.size.x, m.size.z, 0.001);
    inst.scale.setScalar(sc);
    // Sit on the lowest footprint corner (minus a little) so hills never float it.
    const hw = target / 2;
    let gy = Infinity;
    for (const [ox, oz] of [[0, 0], [hw, hw], [-hw, hw], [hw, -hw], [-hw, -hw]]) {
      gy = Math.min(gy, heightAt(lot.x + ox, lot.z + oz));
    }
    inst.position.set(lot.x, gy - m.base * sc - 0.3, lot.z);
    const r4 = (rng() * 4) | 0;
    inst.rotation.y = r4 * (Math.PI / 2);
    group.add(inst);

    // Collider matches the actual footprint (swap X/Z for 90°/270° rotations).
    let fx = m.size.x * sc, fz = m.size.z * sc;
    if (r4 % 2 === 1) { const t = fx; fx = fz; fz = t; }
    colliders.push({ minX: lot.x - fx / 2, maxX: lot.x + fx / 2, minZ: lot.z - fz / 2, maxZ: lot.z + fz / 2 });
  }
  scene.add(group);
  return { group, colliders };
}
