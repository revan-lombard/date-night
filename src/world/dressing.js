/**
 * @file world/dressing.js
 * @responsibility Dress the four interiors with real models — Kenney's CC0
 * Furniture / Food / Nature kits (public/models/props/*.glb). Purely visual:
 * no colliders, no gameplay anchors move. Every prop is best-effort — a
 * missing file just doesn't appear, the game never breaks.
 *
 * Placement is expressed relative to each room's centre so it survives the
 * block layout changing. Kenney kits are metric-ish; a few get a scale nudge.
 *
 * @phase Ship polish (assets pass).
 */

import * as THREE from 'three';
import { loadGLB } from '../core/assets.js';
import { terrainHeight } from './layout.js';

/** Load one prop; null when absent. Cached so repeats share the template. */
const cache = new Map();
async function prop(name) {
  if (!cache.has(name)) {
    cache.set(name, loadGLB(`models/props/${name}.glb`).then((g) => g.scene).catch(() => null));
  }
  return cache.get(name);
}

/**
 * @param {THREE.Scene} scene
 * @param {ReturnType<import('./shops.js').createShops>} shops
 */
export async function dressShops(scene, shops) {
  const group = new THREE.Group();
  scene.add(group);
  let placed = 0;

  /** Place a clone of `name` at room-relative coords. */
  async function put(name, room, dx, dz, { rotY = 0, scale = 1, y = 0 } = {}) {
    const template = await prop(name);
    if (!template) return;
    const m = template.clone(true);
    const px = room.pos.x + dx;
    const pz = room.pos.z + dz;
    m.position.set(px, (room.floorY ?? terrainHeight(px, pz)) + y, pz);
    m.rotation.y = rotY;
    m.scale.setScalar(scale);
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    group.add(m);
    placed++;
  }

  const F = shops.flower;   // florist
  const C = shops.coffee;   // Murphy's
  const T = shops.tailor;
  const H = shops.home;
  const PI = Math.PI;

  await Promise.all([
    // --- Florist: real flowers in pots along the walls, big pots at the door.
    put('pot_large', F, -6.5, -6.5), put('flower_yellowA', F, -6.5, -6.5, { scale: 1.6 }),
    put('pot_large', F, 6.5, -6.5), put('flower_redA', F, 6.5, -6.5, { scale: 1.6 }),
    put('pot_small', F, -7, 0), put('flower_purpleA', F, -7, 0, { scale: 1.4 }),
    put('pot_small', F, -7, 2.2), put('flower_yellowB', F, -7, 2.2, { scale: 1.4 }),
    put('pot_small', F, 7, 0), put('flower_purpleB', F, 7, 0, { scale: 1.4 }),
    put('pot_small', F, 7, 2.2), put('flower_yellowA', F, 7, 2.2, { scale: 1.4 }),
    put('plant_bushSmall', F, -6.8, 4.5), put('plant_bushSmall', F, 6.8, 4.5),
    put('pottedPlant', F, 3.2, 7.2), put('pottedPlant', F, -3.2, 7.2),

    // --- Murphy's: the date table gets the dinner; the bar gets the barware.
    // Date table sits at (0, +2.5) relative to the room centre.
    put('plate-dinner', C, 0.45, 2.5, { y: 0.62, scale: 0.35 }),
    put('plate-dinner', C, -0.45, 2.5, { y: 0.62, scale: 0.35 }),
    put('glass-wine', C, 0.28, 2.15, { y: 0.62, scale: 0.35 }),
    put('glass-wine', C, -0.28, 2.85, { y: 0.62, scale: 0.35 }),
    put('wine-red', C, 0, 2.9, { y: 0.62, scale: 0.35 }),
    // The two side tables get coffees + a croissant.
    put('cup-coffee', C, -4, -1, { y: 0.62, scale: 0.35 }),
    put('croissant', C, -3.7, -0.7, { y: 0.62, scale: 0.35 }),
    put('cup-coffee', C, 4.2, -0.8, { y: 0.62, scale: 0.35 }),
    // Bar along the back counter: stools, machine, tonight's cake.
    put('stoolBar', C, -2.2, 4.6, { rotY: PI }),
    put('stoolBar', C, 0.8, 4.6, { rotY: PI }),
    put('kitchenCoffeeMachine', C, -2.5, 6.6, { y: 1.2 }),
    put('cake', C, 2.2, 6.6, { y: 1.25, scale: 0.4 }),
    put('pottedPlant', C, -7.2, -6.8), put('pottedPlant', C, 7.2, -6.8),

    // --- Tailor: fitting-room furniture (the suit rail itself stays ours).
    put('rugRound', T, -3, 1.5, { scale: 1.4 }),
    put('coatRackStanding', T, 2.2, 7.2),
    put('coatRackStanding', T, -6.8, 7),
    put('bench', T, -6.8, -4, { rotY: PI / 2 }),
    put('lampRoundFloor', T, -6.9, 4.2),
    put('sideTable', T, -1, 6.8), put('lampSquareTable', T, -1, 6.8, { y: 0.5 }),

    // --- Home: the lived-in lounge across from the (procedural) bed.
    put('loungeSofa', H, -1.5, -6.6, { rotY: 0 }),
    put('tableCoffee', H, -1.5, -4.4),
    put('rugRound', H, -1.5, -4.2, { scale: 1.6 }),
    put('sideTable', H, -1.5, -1.6),
    put('televisionModern', H, -1.5, -1.6, { rotY: PI, y: 0.45 }),
    put('bookcaseOpen', H, 5.5, -7.8),
    put('lampRoundFloor', H, -7, -6.8),
    put('pottedPlant', H, 7.4, -6.9),
    put('cup-coffee', H, -1.2, -4.4, { y: 0.32, scale: 0.35 }),
  ]);

  console.info(`[dressing] placed ${placed} interior props`);
  return group;
}
