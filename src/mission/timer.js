/**
 * @file mission/timer.js
 * @responsibility Soft drive timer. Counts up once the drive begins and
 * produces a lateness value 0..1 (0 = on time, 1 = fully late) that the date's
 * love meter will consume. Running past the budget just pins lateness at 1 —
 * there is no fail state (§1, §8).
 *
 * @phase Implemented in Phase 3.
 */

/** @param {number} [budget] seconds of grace before you're fully "late" */
export function createTimer(budget = 80) {
  let elapsed = 0;
  let running = false;

  return {
    start() { elapsed = 0; running = true; },
    stop() { running = false; },
    tick(dt) { if (running) elapsed += dt; },
    get running() { return running; },
    get elapsed() { return elapsed; },
    get remaining() { return Math.max(0, budget - elapsed); },
    /** 0 when on time, ramping to 1 at the budget and pinned there after. */
    get lateness() { return Math.max(0, Math.min(1, elapsed / budget)); },
    budget,
  };
}
