/**
 * @file world/shops.js
 * @responsibility The two story buildings you actually walk into: the FLORIST
 * (buy the bouquet) and the COFFEE SHOP (the date venue). Each is a hollow,
 * open-top "dollhouse" room on a city block — floor, walls with a door gap,
 * and interior props — so the third-person camera can look down into it. Wall
 * segments are returned as AABB colliders (with a gap at the door) so you can
 * drive/walk up and enter through the doorway. Also exports a procedural bouquet.
 *
 * @phase Phase 3.7 (the florist errand + walkable venues).
 */

import * as THREE from 'three';
import { blockCentre, terrainHeight } from './layout.js';

export const FLOWER_BLOCK = { ix: 3, iz: 3 }; // ~(25.5, 25.5)
export const COFFEE_BLOCK = { ix: 4, iz: 4 }; // ~(76.5, 76.5)

const SIZE = 18;      // interior footprint (m)
const WALL_H = 3.6;
const WALL_T = 0.4;
const DOOR_W = 4.2;

const flat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const basic = (c) => new THREE.MeshBasicMaterial({ color: c });

function box(group, x, y, z, w, h, d, mat, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  group.add(m);
  return m;
}

/**
 * Build a hollow room. Door gap is on the −Z (south) wall, facing the street.
 * @returns {{ colliders: object[], door: {x,z,heading}, centre: {x,z}, floorY: number, bounds: object }}
 */
function room(group, cx, cz, wallColor) {
  const floorY = terrainHeight(cx, cz);
  const h = SIZE / 2;
  // Floor slab.
  box(group, cx, floorY - 0.1, cz, SIZE, 0.2, SIZE, flat(0x6b6b70)).receiveShadow = true;
  const colliders = [];
  const wallMat = flat(wallColor);
  const wallY = floorY + WALL_H / 2;
  // North / East / West full walls.
  box(group, cx, wallY, cz + h, SIZE, WALL_H, WALL_T, wallMat);
  colliders.push({ minX: cx - h, maxX: cx + h, minZ: cz + h - WALL_T / 2, maxZ: cz + h + WALL_T / 2 });
  box(group, cx + h, wallY, cz, WALL_T, WALL_H, SIZE, wallMat);
  colliders.push({ minX: cx + h - WALL_T / 2, maxX: cx + h + WALL_T / 2, minZ: cz - h, maxZ: cz + h });
  box(group, cx - h, wallY, cz, WALL_T, WALL_H, SIZE, wallMat);
  colliders.push({ minX: cx - h - WALL_T / 2, maxX: cx - h + WALL_T / 2, minZ: cz - h, maxZ: cz + h });
  // South wall with a central door gap -> two segments.
  const seg = (SIZE - DOOR_W) / 2;
  for (const s of [-1, 1]) {
    const wx = cx + s * (DOOR_W / 2 + seg / 2);
    box(group, wx, wallY, cz - h, seg, WALL_H, WALL_T, wallMat);
    colliders.push({ minX: wx - seg / 2, maxX: wx + seg / 2, minZ: cz - h - WALL_T / 2, maxZ: cz - h + WALL_T / 2 });
  }
  // A lintel over the door so it reads as a doorway.
  box(group, cx, floorY + WALL_H - 0.3, cz - h, DOOR_W, 0.6, WALL_T, wallMat);

  return {
    colliders,
    door: { x: cx, z: cz - h - 4, heading: 0 }, // just outside, on the street side
    centre: { x: cx, z: cz },
    floorY,
    bounds: { minX: cx - h, maxX: cx + h, minZ: cz - h, maxZ: cz + h },
  };
}

/** Coloured "sign" board above the door. */
function sign(group, r, text, color) {
  const board = box(group, r.centre.x, r.floorY + WALL_H + 0.7, r.centre.z - SIZE / 2, 6, 1.1, 0.25, basic(color));
  board.castShadow = true;
  return board;
}

function buildFlowerShop(group, colliders, cx, cz) {
  const r = room(group, cx, cz, 0xdfe3ea);
  colliders.push(...r.colliders);
  sign(group, r, 'FLOWERS', 0xff5c8a);
  // Awning stripe over the door.
  box(group, cx, r.floorY + 2.6, cz - SIZE / 2 - 0.5, DOOR_W + 2, 0.3, 1.2, flat(0xff5c8a));
  // Counter near the back.
  const counterZ = cz + SIZE / 2 - 3;
  box(group, cx, r.floorY + 0.6, counterZ, 6, 1.2, 1.2, flat(0x7a5a3a));
  // Flower buckets / shelves along the sides — rows of little blossoms.
  const rng = seeded(707);
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    const bx = cx + side * (SIZE / 2 - 1.6);
    const bz = cz - SIZE / 2 + 2 + (i >> 1) * 2.2;
    box(group, bx, r.floorY + 0.35, bz, 0.9, 0.7, 0.9, flat(0x4a5a3a)); // bucket
    for (let f = 0; f < 5; f++) {
      const blossom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), flat(FLOWER_COLORS[(rng() * FLOWER_COLORS.length) | 0]));
      blossom.position.set(bx + (rng() - 0.5) * 0.6, r.floorY + 0.8 + rng() * 0.5, bz + (rng() - 0.5) * 0.6);
      group.add(blossom);
    }
  }
  // Highlight beam over the counter (shown while the "buy flowers" objective is up).
  const highlight = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 6, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xff5c8a, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
  );
  highlight.position.set(cx, r.floorY + 3, counterZ - 1.4);
  highlight.visible = false;
  group.add(highlight);
  return { pos: r.centre, door: r.door, counter: { x: cx, z: counterZ - 1.4 }, bounds: r.bounds, floorY: r.floorY, highlight };
}

function buildCoffeeShop(group, colliders, cx, cz) {
  const r = room(group, cx, cz, 0x6d5647);
  colliders.push(...r.colliders);
  sign(group, r, 'CAFE', 0xe0a458);
  box(group, cx, r.floorY + 2.6, cz - SIZE / 2 - 0.5, DOOR_W + 2, 0.3, 1.2, flat(0x3a2a1f)); // awning
  // Counter along the back.
  box(group, cx, r.floorY + 0.6, cz + SIZE / 2 - 2.5, 8, 1.2, 1.4, flat(0x4a352a));
  // A couple of tables with chairs (warm interior; the date happens here).
  const tableAt = (tx, tz) => {
    box(group, tx, r.floorY + 0.55, tz, 1.3, 0.12, 1.3, flat(0x6b4a33)); // top
    box(group, tx, r.floorY + 0.27, tz, 0.15, 0.55, 0.15, flat(0x4a352a)); // leg
    for (const [ox, oz] of [[-0.95, 0], [0.95, 0]]) {
      box(group, tx + ox, r.floorY + 0.3, tz + oz, 0.5, 0.6, 0.5, flat(0x7a5a3a)); // chair
    }
  };
  tableAt(cx - 4, cz - 1);
  tableAt(cx + 4, cz - 1);
  tableAt(cx, cz + 2.5); // the date table
  return { pos: r.centre, door: r.door, seat: { x: cx, z: cz + 2.5 }, bounds: r.bounds, floorY: r.floorY };
}

const FLOWER_COLORS = [0xff5c8a, 0xffd23f, 0xff764a, 0xb56cff, 0xff3e6c, 0xffffff];

function seeded(s) {
  let v = s >>> 0;
  return () => { v = (v * 1664525 + 1013904223) >>> 0; return v / 0xffffffff; };
}

/**
 * @param {THREE.Scene} scene
 * @returns {{ group: THREE.Group, colliders: object[], flower: object, coffee: object }}
 */
export function createShops(scene) {
  const group = new THREE.Group();
  const colliders = [];
  const fc = blockCentre(FLOWER_BLOCK.ix, FLOWER_BLOCK.iz);
  const cc = blockCentre(COFFEE_BLOCK.ix, COFFEE_BLOCK.iz);
  const flower = buildFlowerShop(group, colliders, fc.x, fc.z);
  const coffee = buildCoffeeShop(group, colliders, cc.x, cc.z);
  scene.add(group);
  return { group, colliders, flower, coffee };
}

/** A small procedural bouquet (wrap + stems + blossoms) in the chosen colour. */
export function makeBouquet(color = 0xff5c8a) {
  const g = new THREE.Group();
  const wrap = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 6), flat(0xdad0b0));
  wrap.rotation.x = Math.PI;
  g.add(wrap);
  const blossomMat = flat(color);
  const rng = seeded(99);
  for (let i = 0; i < 9; i++) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 4), flat(0x3a6b3a));
    const a = (i / 9) * Math.PI * 2;
    const rad = 0.02 + (i % 3) * 0.05;
    stem.position.set(Math.cos(a) * rad, 0.28, Math.sin(a) * rad);
    stem.rotation.z = Math.cos(a) * 0.25;
    stem.rotation.x = Math.sin(a) * 0.25;
    g.add(stem);
    const blossom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 0), blossomMat);
    blossom.position.set(Math.cos(a) * rad * 1.6, 0.5, Math.sin(a) * rad * 1.6);
    g.add(blossom);
  }
  return g;
}
