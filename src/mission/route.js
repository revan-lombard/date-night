/**
 * @file mission/route.js
 * @responsibility GTA-style GPS route to the venue: a shortest path over the
 * road-grid intersections (BFS), drawn both as a glowing ribbon on the road and
 * as a polyline the minimap renders. Recomputed from the car's live position.
 *
 * @phase Phase 3.5 (polish).
 */

import * as THREE from 'three';
import { ROAD_LINES, terrainHeight } from '../world/layout.js';

const ROUTE_COLOR = 0x39c0ff; // GPS blue, distinct from the pink destination

/**
 * @param {THREE.Scene} scene
 * @param {{x:number, z:number}} target  the venue
 */
export function createRoute(scene, target) {
  // --- Intersection graph ---
  const L = ROAD_LINES.length;
  const nodeAt = (i, j) => ({ i, j, x: ROAD_LINES[i], z: ROAD_LINES[j] });
  const inBounds = (i, j) => i >= 0 && j >= 0 && i < L && j < L;

  function nearestNode(x, z) {
    let bi = 0, bj = 0, best = Infinity;
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < L; j++) {
        const d = Math.hypot(ROAD_LINES[i] - x, ROAD_LINES[j] - z);
        if (d < best) { best = d; bi = i; bj = j; }
      }
    }
    return { i: bi, j: bj };
  }

  function bfs(start, goal) {
    const key = (i, j) => i * L + j;
    const prev = new Map();
    const seen = new Set([key(start.i, start.j)]);
    const q = [start];
    while (q.length) {
      const n = q.shift();
      if (n.i === goal.i && n.j === goal.j) break;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = n.i + di, nj = n.j + dj;
        if (!inBounds(ni, nj) || seen.has(key(ni, nj))) continue;
        seen.add(key(ni, nj));
        prev.set(key(ni, nj), n);
        q.push({ i: ni, j: nj });
      }
    }
    const path = [];
    let cur = goal;
    while (cur) {
      path.unshift(nodeAt(cur.i, cur.j));
      cur = prev.get(key(cur.i, cur.j));
      if (cur && cur.i === start.i && cur.j === start.j) { path.unshift(nodeAt(cur.i, cur.j)); break; }
    }
    return path;
  }

  let goal = { x: target.x, z: target.z };
  let goalNode = nearestNode(goal.x, goal.z);

  // --- On-road ribbon mesh (rebuilt only when the node path changes) ---
  const ribbon = new THREE.Mesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial({ color: ROUTE_COLOR, transparent: true, opacity: 0.55, depthWrite: false }),
  );
  ribbon.renderOrder = 2;
  scene.add(ribbon);

  /** @type {Array<{x:number,z:number}>} world-space polyline for the minimap */
  let points = [];
  let lastSig = '';

  function computePath(start) {
    const s = nearestNode(start.x, start.z);
    const nodes = bfs(s, goalNode);
    // Prepend the live start and append the exact destination for a clean line.
    return [{ x: start.x, z: start.z }, ...nodes.map((n) => ({ x: n.x, z: n.z })), { x: goal.x, z: goal.z }];
  }

  function rebuildRibbon(path) {
    const HALF_W = 1.6;
    const verts = [];
    const pushSeg = (ax, az, bx, bz) => {
      const dx = bx - ax, dz = bz - az;
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len * HALF_W, nz = dx / len * HALF_W; // perpendicular
      const steps = Math.max(1, Math.round(len / 3));
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        const p0x = ax + dx * t0, p0z = az + dz * t0;
        const p1x = ax + dx * t1, p1z = az + dz * t1;
        const y = (x, z) => terrainHeight(x, z) + 0.18;
        // two triangles per sub-step
        const a = [p0x + nx, y(p0x, p0z), p0z + nz];
        const b = [p0x - nx, y(p0x, p0z), p0z - nz];
        const c = [p1x + nx, y(p1x, p1z), p1z + nz];
        const d = [p1x - nx, y(p1x, p1z), p1z - nz];
        verts.push(...a, ...b, ...c, ...b, ...d, ...c);
      }
    };
    for (let k = 0; k < path.length - 1; k++) pushSeg(path[k].x, path[k].z, path[k + 1].x, path[k + 1].z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    ribbon.geometry.dispose();
    ribbon.geometry = geo;
  }

  return {
    /** Recompute from the current start position (call each frame while driving). */
    update(start) {
      points = computePath(start);
      const sig = points.map((p) => `${p.x | 0},${p.z | 0}`).join(';');
      if (sig !== lastSig) { rebuildRibbon(points); lastSig = sig; }
    },
    get points() { return points; },
    setVisible(v) { ribbon.visible = v; },
    /** Retarget the route (florist -> coffee shop). */
    setTarget(p) { goal = { x: p.x, z: p.z }; goalNode = nearestNode(p.x, p.z); lastSig = ''; },
  };
}
