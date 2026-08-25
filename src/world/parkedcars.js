/**
 * @file world/parkedcars.js
 * @responsibility Kerb-side parked cars, so the streets read as lived-in rather
 * than post-apocalyptic. Reuses the procedural chassis builder (cheap boxes,
 * matches the city's look) with a muted paint palette and every silhouette in
 * the catalogue. Deterministic seeded placement along the road grid: never in
 * an intersection, never near the spawn or the mission stops, never on top of
 * each other. Returns AABB colliders so you clip a mirror if you cut it fine.
 *
 * @phase Polish pass alongside the hero-car work.
 */

import * as THREE from 'three';
import { buildChassis } from '../car/chassis.js';
import { ROAD_LINES, ROAD, CITY_EXTENT } from './layout.js';

/** Street palette — SA suburbia: whites, silvers, and the odd bold one. */
const PAINT = [0xd8d8d4, 0xb8bcc0, 0x7b8087, 0x3a3f45, 0x8c1f28, 0x2a4d69, 0x9c8455, 0xe0d6c2];
const ACCENT = [0x24262a, 0x3a3f45, 0x565d66];
const SILHOUETTES = ['hatchback', 'sedan', 'suv', 'pickup', 'sports'];

const KERB_IN = 2.0;   // metres from the kerb line to the car's centre
const CLEAR_XING = 11; // keep clear of intersection centres
const SPACING = 8;     // min distance between parked cars
const DECK = 0.1;      // road deck sits this far above the terrain height

/**
 * @param {THREE.Scene} scene
 * @param {(x:number, z:number) => number} heightAt terrain height sampler
 * @param {{avoid?: {x:number, z:number, r?:number}[], count?: number, seed?: number}} [opts]
 * @returns {{group: THREE.Group, colliders: {minX:number,maxX:number,minZ:number,maxZ:number}[]}}
 */
export function createParkedCars(scene, heightAt, opts = {}) {
  const { avoid = [], count = 18, seed = 0xd47e } = opts;
  let s = seed >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
  const pick = (arr) => arr[(rng() * arr.length) | 0];

  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const placed = [];

  let attempts = 0;
  while (placed.length < count && attempts++ < count * 30) {
    // A random road line, a random spot along it, on a random kerb side.
    const alongZ = rng() < 0.5;                       // road runs along the Z axis?
    const line = pick(ROAD_LINES);                    // the road's centre-line
    const t = (rng() * 2 - 1) * (CITY_EXTENT - ROAD); // position along the road
    const side = rng() < 0.5 ? -1 : 1;
    const kerb = side * (ROAD / 2 - KERB_IN);
    const x = alongZ ? line + kerb : t;
    const z = alongZ ? t : line + kerb;

    // Not inside an intersection (near a crossing line on the OTHER axis).
    const cross = alongZ ? z : x;
    if (ROAD_LINES.some((l) => Math.abs(cross - l) < CLEAR_XING)) continue;
    // Not near the spawn / mission stops / other parked cars.
    if (avoid.some((a) => Math.hypot(x - a.x, z - a.z) < (a.r ?? 14))) continue;
    if (placed.some((p) => Math.hypot(x - p.x, z - p.z) < SPACING)) continue;

    const silhouette = pick(SILHOUETTES);
    const chassis = buildChassis({ silhouette, bodyColor: pick(PAINT), accentColor: pick(ACCENT) });
    // Nose along the road; right-hand traffic-side flip so both kerbs look right.
    const heading = (alongZ ? 0 : Math.PI / 2) + (side > 0 ? Math.PI : 0) + (rng() - 0.5) * 0.05;
    chassis.group.position.set(x, heightAt(x, z) + DECK, z);
    chassis.group.rotation.y = heading;
    group.add(chassis.group);

    const hx = alongZ ? chassis.width / 2 + 0.2 : chassis.length / 2 + 0.3;
    const hz = alongZ ? chassis.length / 2 + 0.3 : chassis.width / 2 + 0.2;
    colliders.push({ minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz });
    placed.push({ x, z });
  }

  console.info(`[world] parked ${placed.length} cars along the kerbs`);
  return { group, colliders };
}
