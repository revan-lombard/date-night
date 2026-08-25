/**
 * @file core/bus.js
 * @responsibility Tiny synchronous event emitter so the mission director can
 * announce act changes ('act') without importing the UI directly.
 *
 * @phase Implemented in Phase 3.
 */

export function createBus() {
  /** @type {Map<string, Set<Function>>} */
  const listeners = new Map();
  return {
    on(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
      return () => listeners.get(event)?.delete(fn);
    },
    emit(event, ...args) {
      listeners.get(event)?.forEach((fn) => fn(...args));
    },
  };
}
