/**
 * @file world/layout.js
 * @responsibility Single source of truth for the world's shape, shared by the
 * terrain mesh, the city props, and the minimap so they always agree:
 *   - terrainHeight(x,z): rolling HILLS everywhere (never flat) — big hills +
 *     medium + fine noise, gentle enough to drive over the city, wilder far out
 *   - classify(x,z): 'road' | 'pavement' | 'park' | 'country'
 *   - the block grid constants and the seeded set of park blocks (with varied
 *     park sub-shapes so greenery isn't just identical squares)
 *
 * @phase Phase 2 (revised — hillier city, varied parks).
 */

export const N = 6;         // blocks per axis
export const BLOCK = 38;    // block footprint (m)
export const ROAD = 13;     // road width (m)
export const PITCH = BLOCK + ROAD;
export const HALF = ((N - 1) * PITCH) / 2;
export const CITY_EXTENT = HALF + PITCH / 2 + ROAD; // outer edge of the streets

/** Road centre-lines on each axis (between and around the blocks). */
export const ROAD_LINES = Array.from({ length: N + 1 }, (_, k) => k * PITCH - HALF - PITCH / 2);

/** Clamped smoothstep 0..1. */
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * Rolling hills everywhere. Long-wavelength terms (bounded amplitude*frequency)
 * keep the in-city gradient gentle (~<=12% worst case), layered with medium and
 * fine noise for texture. An outer envelope grows big hills/valleys only beyond
 * the city edge, so the horizon reads dramatic while the streets stay drivable.
 */
export function terrainHeight(x, z) {
  // Consistently rolling hills everywhere. Several octaves along DIFFERENT axes
  // (x-only, z-only, and two diagonals) at incommensurate frequencies, so their
  // gradients rarely cancel — no dead-flat patches, San-Francisco style, yet
  // gentle enough to drive.
  let h =
    Math.sin(x * 0.014 + 0.3) * Math.cos(z * 0.012 - 0.5) * 7.0 +
    Math.sin((x * 0.85 + z * 0.53) * 0.012 + 1.1) * 5.0 +   // diagonal ridge
    Math.cos((-x * 0.40 + z * 0.90) * 0.017 - 0.7) * 4.0 +  // cross-diagonal
    Math.sin(x * 0.026 + 2.0) * 2.5 +                       // x undulation
    Math.cos(z * 0.023 + 0.9) * 2.5 +                       // z undulation
    Math.sin((x - z) * 0.038 + 1.7) * 1.1 +                 // fine diagonal
    Math.sin((x + z) * 0.047) * 0.6;                        // fine detail
  // Broad tilt so neighbourhoods sit at different base elevations.
  h += Math.sin(x * 0.006) * Math.cos(z * 0.0055) * 4.0;
  // Dramatic hills/valleys that ramp up only beyond the streets.
  const r = Math.hypot(x, z);
  const outer = smoothstep(CITY_EXTENT, CITY_EXTENT + 260, r);
  if (outer > 0) {
    h += outer * (
      Math.sin(x * 0.0021 - 1.4) * Math.cos(z * 0.0023 + 0.6) * 22.0 +
      Math.sin(r * 0.006) * 7.0
    );
  }
  return h;
}

const nearRoad = (v) => ROAD_LINES.some((line) => Math.abs(v - line) <= ROAD / 2);

/** Block index (0..N-1) for a coordinate, or -1 if not over a block column. */
function blockIndex(v) {
  const i = Math.round((v + HALF) / PITCH);
  if (i < 0 || i >= N) return -1;
  return Math.abs((i * PITCH - HALF) - v) <= BLOCK / 2 ? i : -1;
}

/** Deterministic set of park blocks ("bx,bz"). */
export const PARKS = (() => {
  let s = 20260821 >>> 0;
  const rng = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
  const set = new Set();
  for (let ix = 0; ix < N; ix++) {
    for (let iz = 0; iz < N; iz++) {
      if (rng() < 0.16) set.add(ix + ',' + iz);
    }
  }
  return set;
})();

/** Deterministic park sub-shape kind (0=full, 1=L, 2=inset lawn, 3=round). */
function parkKind(bx, bz) {
  const h = ((bx * 73856093) ^ (bz * 19349663) ^ 0x9e3779b9) >>> 0;
  return h % 4;
}

/** Is a point inside the carved park shape? u,v are offsets from block centre. */
function inParkShape(bx, bz, u, v) {
  switch (parkKind(bx, bz)) {
    case 1: return !(u > 3 && v > 3);                        // L-shape: plaza in a corner
    case 2: return Math.max(Math.abs(u), Math.abs(v)) < 13;  // inset lawn, paved surround
    case 3: return (u * u + v * v) < 15 * 15;                // round lawn
    default: return true;                                    // full block
  }
}

/** What is at this world point? */
export function classify(x, z) {
  if (Math.abs(x) > CITY_EXTENT || Math.abs(z) > CITY_EXTENT) return 'country';
  if (nearRoad(x) || nearRoad(z)) return 'road';
  const bx = blockIndex(x);
  const bz = blockIndex(z);
  if (bx < 0 || bz < 0) return 'road'; // gaps read as road
  if (PARKS.has(bx + ',' + bz)) {
    const cx = bx * PITCH - HALF;
    const cz = bz * PITCH - HALF;
    return inParkShape(bx, bz, x - cx, z - cz) ? 'park' : 'pavement';
  }
  return 'pavement';
}

/** World-space centre of a block. */
export function blockCentre(ix, iz) {
  return { x: ix * PITCH - HALF, z: iz * PITCH - HALF };
}
