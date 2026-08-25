/**
 * @file core/loop.js
 * @responsibility Fixed-timestep update + variable-rate render.
 *
 * The simulation advances in fixed steps (default 1/60 s) so car handling and
 * collision are deterministic and frame-rate independent, while rendering runs
 * once per animation frame with an interpolation alpha for smoothness.
 */

/** @typedef {(dt: number) => void} UpdateFn a single fixed step, dt in seconds */
/** @typedef {(alpha: number) => void} RenderFn alpha is 0..1 between steps */

/**
 * Create a fixed-timestep game loop.
 *
 * @param {Object} opts
 * @param {UpdateFn} opts.update  called zero or more times per frame, fixed dt
 * @param {RenderFn} opts.render  called once per frame
 * @param {number} [opts.step=1/60]  fixed simulation step in seconds
 * @param {number} [opts.maxSubSteps=5]  cap to avoid the spiral of death
 * @returns {{ start(): void, stop(): void, running: boolean }}
 */
export function createLoop({ update, render, step = 1 / 60, maxSubSteps = 5 }) {
  let running = false;
  let rafId = 0;
  let last = 0;
  let accumulator = 0;

  function frame(nowMs) {
    if (!running) return;
    rafId = requestAnimationFrame(frame);

    // Seconds since last frame, clamped so a background tab (huge gap) or a
    // stall never dumps hundreds of steps into the accumulator at once.
    let frameTime = (nowMs - last) / 1000;
    last = nowMs;
    if (frameTime > step * maxSubSteps) frameTime = step * maxSubSteps;

    accumulator += frameTime;

    let steps = 0;
    while (accumulator >= step && steps < maxSubSteps) {
      update(step);
      accumulator -= step;
      steps++;
    }

    render(accumulator / step);
  }

  return {
    get running() { return running; },
    start() {
      if (running) return;
      running = true;
      // performance.now() keeps us on the same clock as rAF timestamps.
      last = performance.now();
      accumulator = 0;
      rafId = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(rafId);
    },
  };
}
