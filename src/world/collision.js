/**
 * @file world/collision.js
 * @responsibility Static AABB collision. A uniform spatial-hash broadphase over
 * building footprints and a circle-vs-AABB resolve the car and player call each
 * step. Resolve pushes the entity out along the least-penetration axis and
 * returns a surface normal so callers can reflect velocity (§7) — it never
 * stops motion dead.
 *
 * @phase Phase 2.
 */

const CELL = 60; // broadphase cell size (m) — a bit larger than a city block

/**
 * @param {Array<{minX:number,maxX:number,minZ:number,maxZ:number}>} boxes
 */
export function createCollision(boxes) {
  /** @type {Map<string, number[]>} cellKey -> collider indices */
  const grid = new Map();
  const key = (cx, cz) => cx + ',' + cz;

  boxes.forEach((b, i) => {
    const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
    const z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cz = z0; cz <= z1; cz++) {
        const k = key(cx, cz);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
  });

  /**
   * Resolve a circle of radius r at (x,z) against nearby boxes.
   * @returns {{x:number, z:number, hit:boolean, nx:number, nz:number}}
   */
  function resolveCircle(x, z, r) {
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    let hit = false;
    let nx = 0, nz = 0;

    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        const idxs = grid.get(key(gx, gz));
        if (!idxs) continue;
        for (const i of idxs) {
          const b = boxes[i];
          // Closest point on the (expanded) AABB to the circle centre.
          const px = Math.max(b.minX, Math.min(x, b.maxX));
          const pz = Math.max(b.minZ, Math.min(z, b.maxZ));
          const dx = x - px;
          const dz = z - pz;
          const d2 = dx * dx + dz * dz;
          if (d2 < r * r) {
            hit = true;
            if (d2 > 1e-6) {
              const d = Math.sqrt(d2);
              const push = r - d;
              x += (dx / d) * push;
              z += (dz / d) * push;
              nx += dx / d;
              nz += dz / d;
            } else {
              // Centre inside the box: push out along least-penetration axis.
              const toLeft = x - b.minX, toRight = b.maxX - x;
              const toDown = z - b.minZ, toUp = b.maxZ - z;
              const mx = Math.min(toLeft, toRight);
              const mz = Math.min(toDown, toUp);
              if (mx < mz) {
                const s = toLeft < toRight ? -1 : 1;
                x = (s < 0 ? b.minX : b.maxX) + s * r;
                nx += s;
              } else {
                const s = toDown < toUp ? -1 : 1;
                z = (s < 0 ? b.minZ : b.maxZ) + s * r;
                nz += s;
              }
            }
          }
        }
      }
    }

    const len = Math.hypot(nx, nz) || 1;
    return { x, z, hit, nx: nx / len, nz: nz / len };
  }

  return { resolveCircle };
}
