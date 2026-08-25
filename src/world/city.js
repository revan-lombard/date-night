/**
 * @file world/city.js
 * @responsibility Buildings, rooftop detail, lane markings and park greenery
 * placed on the rolling terrain. Streets/pavements are baked into the terrain
 * (see terrain.js); this module adds the vertical detail and returns one AABB
 * collider per building footprint. Deterministic via a fixed seed.
 *
 * Variety comes from three layers: block PLANS (1 big building, a 2-way split,
 * or a 2x2 grid with an occasional courtyard), building STYLES (shop / midrise /
 * tower, biased taller toward downtown), and per-building DETAIL (plinths,
 * cornices, setbacks, parapets, rooftop tanks/units/gardens, awnings, canopies,
 * balconies, varied emissive window patterns). Parks carve varied shapes (see
 * layout.classify) and scatter mixed trees, bushes and the odd pond.
 *
 * Perf: window quads and lane dashes (the high-count items) are drawn as single
 * InstancedMeshes; a shared unit box/cylinder geometry + a material cache keep
 * allocations and draw calls modest.
 *
 * @phase Phase 2 (revised — varied buildings, hillier terrain, richer parks).
 */

import * as THREE from 'three';
import { N, BLOCK, PARKS, terrainHeight, blockCentre, classify, ROAD_LINES, CITY_EXTENT } from './layout.js';
import { terrainNormal } from './terrain.js';

// Tight, intentional palette (dusk). 8 wall tones + roof greys + accents.
const WALLS = [0xb08968, 0x8d6a52, 0x6d7b8d, 0x9a8c7a, 0xac5f4a, 0x5f6b74, 0x7a8a99, 0x86728c];
const ROOF = [0x3a3f47, 0x4c5158, 0x565c64];
const ACCENTS = [0xd98a4a, 0xc44f3d, 0x4a7a8c, 0xcbb26a, 0x7fa06a];
const GREENS = [0x356b3a, 0x3f7a44, 0x4f7a44, 0x2f5e33];
const WIN_WARM = new THREE.Color(0xffd98a);
const WIN_COOL = new THREE.Color(0xbcd0e6);
const WIN_DIM = new THREE.Color(0x7a5f36);

// Shared geometry — scaled per instance to avoid thousands of allocations.
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const CYL6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
const CONE = new THREE.ConeGeometry(1, 1, 7);
const ICO = new THREE.IcosahedronGeometry(1, 0);
const CIRCLE = new THREE.CircleGeometry(1, 16);
const RED_LIGHT = new THREE.MeshBasicMaterial({ color: 0xff5a5a });

const matCache = new Map();
function lambert(color) {
  let m = matCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color, flatShading: true }); matCache.set(color, m); }
  return m;
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}
const pick = (rng, arr) => arr[(rng() * arr.length) | 0];
const rand = (rng, a, b) => a + (b - a) * rng();

/** Add a shared-geometry box (position is the centre). */
function box(group, x, y, z, w, h, d, mat, shadow = true) {
  const m = new THREE.Mesh(UNIT_BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  group.add(m);
  return m;
}

export function createCity(scene) {
  const group = new THREE.Group();
  const buildings = new THREE.Group(); // procedural building volumes + windows,
  group.add(buildings);                // isolated so a model kit can replace them
  const colliders = [];
  const blocks = []; // minimap descriptors (enriched with footprint w/d)
  const rng = makeRng(51966);
  const winStore = [];
  const laneStore = [];

  addLaneMarkings(laneStore);

  const mid = (N - 1) / 2;
  const maxDist = Math.hypot(mid, mid) || 1;
  for (let ix = 0; ix < N; ix++) {
    for (let iz = 0; iz < N; iz++) {
      const { x: cx, z: cz } = blockCentre(ix, iz);
      if (PARKS.has(ix + ',' + iz)) {
        blocks.push({ x: cx, z: cz, park: true, w: BLOCK, d: BLOCK });
        addPark(group, cx, cz, rng);
        continue;
      }
      const central = 1 - Math.hypot(ix - mid, iz - mid) / maxDist; // 0..1, 1=downtown
      for (const lot of planLots(cx, cz, rng)) {
        const col = addBuilding(buildings, winStore, lot.x, lot.z, lot.w, lot.d, central, rng);
        colliders.push(col);
        blocks.push({ x: lot.x, z: lot.z, park: false, w: lot.w, d: lot.d });
      }
    }
  }

  buildWindows(buildings, winStore);
  buildLanes(group, laneStore);

  scene.add(group);
  return {
    group,
    buildings, // hide this to swap in a model kit; colliders/minimap still apply
    colliders,
    minimap: { blocks, roadLines: ROAD_LINES, extent: CITY_EXTENT, block: BLOCK },
  };
}

/** Divide a block into 1..4 building lots with gaps/alleys and varied sizes. */
function planLots(cx, cz, rng) {
  const M = 2;                    // pavement margin inside the block edge
  const usable = BLOCK - 2 * M;   // ~34 m
  const lots = [];
  const roll = rng();
  if (roll < 0.34) {              // one building, not always block-filling
    lots.push({ x: cx + rand(rng, -1, 1), z: cz + rand(rng, -1, 1), w: usable * rand(rng, 0.72, 1.0), d: usable * rand(rng, 0.72, 1.0) });
  } else if (roll < 0.68) {       // two, split along an axis with an alley
    const gap = rand(rng, 2.5, 4.5);
    const along = rng() < 0.5;    // true: split along X
    const cell = (usable - gap) / 2;
    for (let k = 0; k < 2; k++) {
      const off = (k === 0 ? -1 : 1) * (cell / 2 + gap / 2);
      const w = (along ? cell : usable) * rand(rng, 0.7, 0.96);
      const d = (along ? usable : cell) * rand(rng, 0.7, 0.96);
      lots.push({ x: cx + (along ? off : 0), z: cz + (along ? 0 : off), w, d });
    }
  } else {                        // 2x2 grid, occasionally skip one (courtyard)
    const gap = rand(rng, 2.5, 4);
    const cell = (usable - gap) / 2;
    const skip = rng() < 0.5 ? ((rng() * 4) | 0) : -1;
    let k = 0;
    for (let a = 0; a < 2; a++) {
      for (let b = 0; b < 2; b++) {
        if (k++ === skip) continue;
        lots.push({
          x: cx + (a ? 1 : -1) * (cell / 2 + gap / 2),
          z: cz + (b ? 1 : -1) * (cell / 2 + gap / 2),
          w: cell * rand(rng, 0.62, 0.95),
          d: cell * rand(rng, 0.62, 0.95),
        });
      }
    }
  }
  return lots;
}

/** Min/max terrain height sampled across a footprint (corners + edges + centre). */
function groundLevels(cx, cz, w, d) {
  const hw = w / 2, hd = d / 2;
  const pts = [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, 0], [hw, 0], [-hw, 0], [0, hd], [0, -hd]];
  let mn = Infinity, mx = -Infinity;
  for (const [ox, oz] of pts) {
    const h = terrainHeight(cx + ox, cz + oz);
    if (h < mn) mn = h;
    if (h > mx) mx = h;
  }
  return { mn, mx };
}

/** Choose a style, sink a foundation below the local terrain, build the volume. */
function addBuilding(group, winStore, cx, cz, w, d, central, rng) {
  const { mn, mx } = groundLevels(cx, cz, w, d);
  const base = mn - 1.2; // foundation bottom: below every corner -> no gap on a slope
  const gy = mx;         // street reference: the highest exposed corner
  const foot = Math.min(w, d);
  const towerP = 0.08 + central * 0.34;
  const r = rng();
  let style;
  if (r < towerP && foot > 14) style = 'tower';
  else if (r < towerP + 0.52) style = 'midrise';
  else style = 'shop';
  const wall = pick(rng, WALLS);
  if (style === 'tower') addTower(group, winStore, cx, cz, base, gy, w, d, wall, rng);
  else if (style === 'midrise') addMidrise(group, winStore, cx, cz, base, gy, w, d, wall, foot, rng);
  else addShop(group, winStore, cx, cz, base, gy, w, d, wall, rng);
  return { minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 };
}

/** Queue emissive window quads on all four faces, with a varied lit pattern. */
function pushWindows(store, cx, cz, fy, w, d, h, rng) {
  const spacing = 3.0 + rng() * 1.1;
  const startY = 2.6 + rng() * 1.4;
  const litP = 0.5 + rng() * 0.42;
  const winH = 0.5 + rng() * 0.22;
  const fw = w * 0.72, sw = d * 0.72;
  for (let y = startY; y < h - 1.4; y += spacing) {
    const py = fy + y;
    const faces = [
      [cx, cz + d / 2 + 0.03, 0, fw],
      [cx, cz - d / 2 - 0.03, Math.PI, fw],
      [cx + w / 2 + 0.03, cz, Math.PI / 2, sw],
      [cx - w / 2 - 0.03, cz, -Math.PI / 2, sw],
    ];
    for (const [px, pz, ry, sx] of faces) {
      if (rng() > litP) continue; // dark floors -> pattern variety
      const t = rng();
      const tone = t < 0.7 ? WIN_WARM : (t < 0.9 ? WIN_DIM : WIN_COOL);
      store.push({ px, py, pz, ry, sx, sy: winH, tone });
    }
  }
}

function buildWindows(group, store) {
  if (!store.length) return;
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial(), store.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < store.length; i++) {
    const s = store[i];
    dummy.position.set(s.px, s.py, s.pz);
    dummy.rotation.set(0, s.ry, 0);
    dummy.scale.set(s.sx, s.sy, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    mesh.setColorAt(i, s.tone);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
}

/** Tower: 2-4 stepped tiers with cornices, a plinth and a rooftop mast. */
function addTower(group, winStore, cx, cz, base, gy, w, d, wall, rng) {
  const mat = lambert(wall);
  const tiers = 2 + ((rng() * 3) | 0);
  const plinthTop = gy + 3 + rng() * 1.5;
  box(group, cx, (base + plinthTop) / 2, cz, w + 0.6, plinthTop - base, d + 0.6, lambert(pick(rng, ROOF)));
  let fy = gy, bottom = base, bw = w, bd = d, top = gy;
  for (let t = 0; t < tiers; t++) {
    const h = 11 + rng() * 13;
    const yTop = fy + h;
    box(group, cx, (bottom + yTop) / 2, cz, bw, yTop - bottom, bd, mat);
    pushWindows(winStore, cx, cz, fy, bw, bd, h, rng);
    box(group, cx, yTop + 0.3, cz, bw + 0.6, 0.6, bd + 0.6, lambert(pick(rng, ROOF)), false); // cornice
    top = yTop; fy = yTop; bottom = yTop;
    if (t < tiers - 1) { bw *= rand(rng, 0.66, 0.8); bd *= rand(rng, 0.66, 0.8); }
  }
  addRoofDetails(group, cx, cz, top, bw, bd, rng, { units: 1 + ((rng() * 2) | 0), mast: true, tank: rng() < 0.5 });
  addStreetLevel(group, cx, cz, gy, w, d, rng);
}

/** Mid-rise: plinth + main volume, optional stepped-back crown, rich roof. */
function addMidrise(group, winStore, cx, cz, base, gy, w, d, wall, foot, rng) {
  const mat = lambert(wall);
  let h = 14 + rng() * rng() * 30;
  h = Math.min(h, foot * 3.2 + 8); // believable slenderness vs footprint
  const plinthTop = gy + 2.5 + rng() * 1.5;
  box(group, cx, (base + plinthTop) / 2, cz, w + 0.5, plinthTop - base, d + 0.5, lambert(pick(rng, ROOF)));
  box(group, cx, (base + gy + h) / 2, cz, w, gy + h - base, d, mat);
  pushWindows(winStore, cx, cz, gy, w, d, h, rng);
  if (h > 26) box(group, cx, gy + h * 0.5, cz, w + 0.3, 0.4, d + 0.3, lambert(pick(rng, ROOF)), false); // belt course
  if (rng() < 0.4) {                // stepped-back crown
    const sh = 4 + rng() * 6, sw = w * 0.7, sd = d * 0.7;
    box(group, cx, gy + h + sh / 2, cz, sw, sh, sd, mat);
    pushWindows(winStore, cx, cz, gy + h, sw, sd, sh, rng);
    box(group, cx, gy + h + sh + 0.3, cz, sw + 0.4, 0.6, sd + 0.4, lambert(pick(rng, ROOF)), false);
    addRoofDetails(group, cx, cz, gy + h + sh, sw, sd, rng, { units: 1 + ((rng() * 2) | 0), garden: rng() < 0.3 });
  } else {
    box(group, cx, gy + h + 0.4, cz, w + 0.4, 0.8, d + 0.4, lambert(pick(rng, ROOF)), false); // parapet
    addRoofDetails(group, cx, cz, gy + h, w, d, rng, { units: 1 + ((rng() * 3) | 0), tank: rng() < 0.4, garden: rng() < 0.35 });
  }
  addStreetLevel(group, cx, cz, gy, w, d, rng);
  if (rng() < 0.35) addBalconies(group, cx, cz, gy, w, d, h, rng);
}

/** Shop: short wide box, awning band, roof sign, sometimes a rooftop kiosk. */
function addShop(group, winStore, cx, cz, base, gy, w, d, wall, rng) {
  const mat = lambert(wall);
  const h = 5 + rng() * 5;
  box(group, cx, (base + gy + h) / 2, cz, w, gy + h - base, d, mat);
  pushWindows(winStore, cx, cz, gy, w, d, h, rng);
  box(group, cx, gy + 2.5, cz, w + 0.6, 0.5, d + 0.6, lambert(pick(rng, ACCENTS)), false); // awning band
  box(group, cx, gy + h + 0.25, cz, w + 0.3, 0.5, d + 0.3, lambert(pick(rng, ROOF)), false); // parapet
  const sign = box(group, cx, gy + h + 0.9, cz + d / 2, w * 0.6, 1.5, 0.3, new THREE.MeshBasicMaterial({ color: pick(rng, ACCENTS) }), false); // roof sign
  sign.receiveShadow = false;
  if (rng() < 0.5) addRoofDetails(group, cx, cz, gy + h, w, d, rng, { units: 1 });
  addStreetLevel(group, cx, cz, gy, w, d, rng);
}

/** Rooftop clutter: AC units, an optional water tank, mast light, garden patch. */
function addRoofDetails(group, cx, cz, y, w, d, rng, opts = {}) {
  const spanX = Math.max(0, w / 2 - 2), spanZ = Math.max(0, d / 2 - 2);
  const units = opts.units ?? (1 + ((rng() * 3) | 0));
  for (let i = 0; i < units; i++) {
    const uw = 1.2 + rng() * 2.4, uh = 0.8 + rng() * 1.4;
    box(group, cx + rand(rng, -1, 1) * spanX, y + uh / 2, cz + rand(rng, -1, 1) * spanZ, uw, uh, uw, lambert(pick(rng, ROOF)));
  }
  if (opts.tank) {
    const rr = 0.9 + rng() * 0.7, th = 1.4 + rng() * 1.2;
    const tank = new THREE.Mesh(CYL8, lambert(0x6a5648));
    tank.scale.set(rr * 2, th, rr * 2);
    tank.position.set(cx + rand(rng, -1, 1) * spanX, y + th / 2, cz + rand(rng, -1, 1) * spanZ);
    tank.castShadow = true;
    group.add(tank);
  }
  if (opts.mast) {
    const mast = new THREE.Mesh(CYL6, lambert(0x3a3f47));
    mast.scale.set(0.24, 4, 0.24);
    mast.position.set(cx, y + 2, cz);
    group.add(mast);
    const light = new THREE.Mesh(UNIT_BOX, RED_LIGHT);
    light.scale.set(0.4, 0.4, 0.4);
    light.position.set(cx, y + 4.1, cz);
    group.add(light);
  }
  if (opts.garden) {
    box(group, cx, y + 0.2, cz, w * 0.5, 0.3, d * 0.5, lambert(0x4f7a44), false);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(ICO, lambert(pick(rng, GREENS)));
      const s = 0.5 + rng() * 0.5;
      b.scale.set(s, s * 0.8, s);
      b.position.set(cx + rand(rng, -1, 1) * w * 0.2, y + 0.4, cz + rand(rng, -1, 1) * d * 0.2);
      group.add(b);
    }
  }
}

/** Street-level entrance canopy on the +Z (street) side. */
function addStreetLevel(group, cx, cz, gy, w, d, rng) {
  const cw = Math.min(w * 0.4, 4);
  box(group, cx, gy + 2.3, cz + d / 2 + 0.4, cw, 0.3, 1.0, lambert(pick(rng, ACCENTS)), false);
}

/** Protruding balcony slabs on the front/back faces (bounded for perf). */
function addBalconies(group, cx, cz, gy, w, d, h, rng) {
  const mat = lambert(0x4c5158);
  const cols = Math.min(3, Math.max(2, (w / 5) | 0));
  const topY = Math.min(gy + h - 2, gy + 22);
  for (let y = gy + 5; y < topY; y += 4) {
    for (let c = 0; c < cols; c++) {
      const bx = cx - w / 2 + (c + 0.5) * (w / cols);
      box(group, bx, y, cz + d / 2 + 0.5, (w / cols) * 0.7, 0.3, 1.0, mat, false);
      box(group, bx, y, cz - d / 2 - 0.5, (w / cols) * 0.7, 0.3, 1.0, mat, false);
    }
  }
}

/** Dashed centre lines down every road, draped over the terrain (instanced). */
function addLaneMarkings(store) {
  const end = CITY_EXTENT;
  for (const line of ROAD_LINES) {
    for (let p = -end; p <= end; p += 6) {
      store.push({ px: line, pz: p, dir: 'z' }); // dash runs along Z
      store.push({ px: p, pz: line, dir: 'x' }); // dash runs along X
    }
  }
}

/** Dashes laid ON the road surface — oriented to the terrain normal so they
 *  follow the slope instead of floating flat. */
function buildLanes(group, store) {
  const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // in XZ, +Y up
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xdad0b0 }), store.length);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const n = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitan = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const WID = 0.4, LEN = 2.4;
  for (let i = 0; i < store.length; i++) {
    const s = store[i];
    terrainNormal(s.px, s.pz, n);
    dir.set(s.dir === 'z' ? 0 : 1, 0, s.dir === 'z' ? 1 : 0);
    // Project the road direction onto the slope plane -> length axis (Z-local).
    tangent.copy(dir).addScaledVector(n, -dir.dot(n)).normalize();
    bitan.copy(n).cross(tangent).normalize();            // width axis (X-local)
    basis.makeBasis(bitan, n, tangent);
    pos.set(s.px, terrainHeight(s.px, s.pz), s.pz).addScaledVector(n, 0.06);
    scl.set(WID, 1, LEN);
    m.compose(pos, new THREE.Quaternion().setFromRotationMatrix(basis), scl);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

/** Varied greenery for a park block: mixed trees/bushes + an optional pond. */
function addPark(group, cx, cz, rng) {
  const trunkMat = lambert(0x5b4630);
  const half = BLOCK / 2 - 2;
  let pond = null;
  if (rng() < 0.45) {
    const pr = 3 + rng() * 3;
    const px = cx + rand(rng, -1, 1) * half * 0.4;
    const pz = cz + rand(rng, -1, 1) * half * 0.4;
    if (classify(px, pz) === 'park') {
      const water = new THREE.Mesh(CIRCLE, new THREE.MeshLambertMaterial({ color: 0x2f5a6b, flatShading: true }));
      water.rotation.x = -Math.PI / 2;
      water.scale.set(pr, pr, 1);
      water.position.set(px, terrainHeight(px, pz) + 0.08, pz);
      water.receiveShadow = true;
      group.add(water);
      pond = { px, pz, pr };
    }
  }
  const n = 8 + ((rng() * 8) | 0);
  for (let i = 0; i < n; i++) {
    const px = cx + rand(rng, -half, half);
    const pz = cz + rand(rng, -half, half);
    if (classify(px, pz) !== 'park') continue; // keep greenery on the carved lawn only
    if (pond && Math.hypot(px - pond.px, pz - pond.pz) < pond.pr + 1.5) continue;
    const gy = terrainHeight(px, pz);
    if (rng() < 0.2) { // low bush
      const s = 0.6 + rng() * 0.8;
      const b = new THREE.Mesh(ICO, lambert(pick(rng, GREENS)));
      b.scale.set(s, s * 0.8, s);
      b.position.set(px, gy + s * 0.5, pz);
      b.castShadow = true;
      group.add(b);
      continue;
    }
    const scale = 0.7 + rng() * 1.1;
    const th = 1.2 * scale + rng() * 0.6;
    const trunk = new THREE.Mesh(CYL6, trunkMat);
    trunk.scale.set(0.24 * scale, th, 0.24 * scale);
    trunk.position.set(px, gy + th / 2, pz);
    trunk.castShadow = true;
    group.add(trunk);
    if (rng() < 0.5) { // conifer
      const lh = 2.6 * scale + rng(), lr = 1.2 * scale;
      const c = new THREE.Mesh(CONE, lambert(pick(rng, GREENS)));
      c.scale.set(lr, lh, lr);
      c.position.set(px, gy + th + lh / 2 - 0.2, pz);
      c.castShadow = true;
      group.add(c);
    } else { // round crown
      const lr = 1.3 * scale + rng() * 0.5;
      const l = new THREE.Mesh(ICO, lambert(pick(rng, GREENS)));
      l.scale.set(lr, lr * 0.9, lr);
      l.position.set(px, gy + th + lr * 0.6, pz);
      l.castShadow = true;
      group.add(l);
    }
  }
}
