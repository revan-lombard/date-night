/**
 * @file core/assets.js
 * @responsibility Load external 3D models (GLTF/GLB) with graceful fallback.
 * Files live in `public/models/` so Vite serves them in dev and copies them to
 * `dist/` on build. Paths are resolved against BASE_URL so the game works from
 * any sub-path (GitHub Pages project sites, Netlify, etc.).
 *
 * @phase Added alongside Phase 1.5 (on-foot player + optional car model).
 */

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const gltfLoader = new GLTFLoader();
const BASE = import.meta.env.BASE_URL; // e.g. './' per vite.config

/**
 * Load a GLB under public/, relative to the deploy base.
 * @param {string} path e.g. 'models/character.glb'
 * @returns {Promise<import('three/addons/loaders/GLTFLoader.js').GLTF>}
 */
export function loadGLB(path) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(BASE + path, resolve, undefined, reject);
  });
}

/** The on-foot player model (rigged, animated). Required. */
export function loadCharacter() {
  return loadGLB('models/character.glb');
}

/** Load any GLB, returning null instead of throwing when the file is absent. */
async function tryLoadGLB(path) {
  try {
    return await loadGLB(path);
  } catch {
    return null;
  }
}

/**
 * Optional hero car model. Drop a `public/models/car.glb` in to use it; if it's
 * absent the game falls back to the procedural chassis. Never throws.
 * @returns {Promise<import('three/addons/loaders/GLTFLoader.js').GLTF | null>}
 */
export function tryLoadCar() {
  return tryLoadGLB('models/car.glb');
}

/**
 * Optional partner (Simone) model, e.g. a Ready Player Me / Avaturn avatar built
 * from a photo. Drop a `public/models/partner.glb` in to use it. Absent → null
 * and she simply isn't spawned (until the date scene provides a stand-in).
 * @returns {Promise<import('three/addons/loaders/GLTFLoader.js').GLTF | null>}
 */
export function tryLoadPartner() {
  return tryLoadGLB('models/partner.glb');
}

/**
 * Optional shared animation pack. Photo-avatar exporters (Ready Player Me,
 * Avaturn) ship the mesh + skeleton but usually NO locomotion clips — the rig
 * would stand frozen. Drop a `public/models/anims.glb` containing idle / walk /
 * run / jump (e.g. the free RPM animation pack, or Mixamo clips) and its clips
 * are applied to any clipless avatar. Because every RPM avatar shares one
 * skeleton, a single pack drives BOTH Jonathan and Simone.
 * @returns {Promise<import('three/addons/loaders/GLTFLoader.js').GLTF | null>}
 */
export function tryLoadAnimations() {
  return tryLoadGLB('models/anims.glb');
}
