/**
 * @file core/save.js
 * @responsibility localStorage wrapper that never throws (private mode, quota,
 * disabled storage all degrade to no-op). Persists only the best love score
 * and whether the intro has been seen. The game is short enough to need no
 * mid-run save.
 *
 * @phase Implemented in Phase 5.
 */

const KEY = 'date-night.v1';

/** @typedef {{bestLove?: number, seenIntro?: boolean}} SaveData */

/** @returns {SaveData} whatever survived — always an object, never a throw */
export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    const data = raw ? JSON.parse(raw) : {};
    return typeof data === 'object' && data !== null ? data : {};
  } catch {
    return {};
  }
}

/** Merge a patch into the save. Silently no-ops when storage is unavailable.
 *  @param {SaveData} patch */
export function updateSave(patch) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...loadSave(), ...patch }));
  } catch { /* private mode / quota — the game just won't remember */ }
}
