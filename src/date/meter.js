/**
 * @file date/meter.js
 * @responsibility Love state + thresholds (§8). Pure numbers, no DOM — the
 * date UI animates whatever this reports. Starting love is 50, seeded by how
 * the drive went (lateness) and what he's holding (the flowers), then each
 * dialogue choice applies its delta. Clamped 0–100.
 *
 * Thresholds: ≥ 90 → 'best', ≥ 62 → 'good', else 'okay'. (Raised from the
 * brief's 82/58 when the conversation grew from six beats to ten — playing
 * "averagely" now lands squarely in 'good', deliberately well in 'best'.)
 *
 * @phase Implemented in Phase 4.
 */

const START_LOVE = 50;
export const THRESHOLDS = { best: 90, good: 62 };
const FLOWERS_RIGHT = +8; // her actual favourite — he knows her
const FLOWERS_WRONG = +2; // flowers are flowers
const FLOWERS_NONE = -6;  // ten years and empty hands

const clamp = (v) => Math.max(0, Math.min(100, v));

export function createLoveMeter() {
  let love = START_LOVE;

  return {
    /**
     * Seed the meter from the errand. Returns the applied events so the UI
     * can tick them one by one.
     * @param {{lateness?: number, hasFlowers?: boolean, rightFlowers?: boolean}} p
     * @returns {{delta:number, why:'late'|'flowers-right'|'flowers-wrong'|'flowers-none'}[]}
     */
    start({ lateness = 0, hasFlowers = false, rightFlowers = false } = {}) {
      love = START_LOVE;
      const events = [];
      const latePenalty = -Math.round(lateness * 12); // §8
      if (latePenalty < 0) events.push({ delta: latePenalty, why: 'late' });
      events.push(
        !hasFlowers
          ? { delta: FLOWERS_NONE, why: 'flowers-none' }
          : rightFlowers
            ? { delta: FLOWERS_RIGHT, why: 'flowers-right' }
            : { delta: FLOWERS_WRONG, why: 'flowers-wrong' },
      );
      for (const e of events) love = clamp(love + e.delta);
      return events;
    },

    /** Apply a choice delta; returns the new value. */
    add(delta) {
      love = clamp(love + delta);
      return love;
    },

    get value() { return love; },

    /** Which ending this score earns (§8). */
    tier() { return love >= THRESHOLDS.best ? 'best' : love >= THRESHOLDS.good ? 'good' : 'okay'; },

    /** Ambient mood for the value — used when a node doesn't set its own. */
    mood() { return love >= 70 ? 'warm' : love >= 45 ? 'neutral' : 'cool'; },
  };
}
