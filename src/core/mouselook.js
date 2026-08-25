/**
 * @file core/mouselook.js
 * @responsibility GTA-style free-look. Click the canvas to lock the pointer;
 * mouse X orbits the camera yaw, mouse Y tilts the pitch. The right analog stick
 * feeds in via applyStick(). Sensitivity and invert-Y come from settings.
 *
 * @phase Added with the GTA control pass; extended in the polish pass.
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const BASE_SENS = 0.0024;
const PITCH_MIN = 0.05;
const PITCH_MAX = 1.05;

/**
 * @param {HTMLElement} el  the canvas to lock the pointer to
 * @param {{sens?: number}} [opts]
 */
export function createMouseLook(el, opts = {}) {
  let mult = 1;
  let sens = opts.sens ?? BASE_SENS;
  let invertY = false;
  let yaw = 0;
  let pitch = 0.16; // low, behind-the-car GTA-V framing (not high/top-down)
  let locked = false;

  el.addEventListener('click', () => {
    if (!locked) el.requestPointerLock?.();
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === el;
  });
  document.addEventListener('mousemove', (e) => {
    if (!locked) return;
    yaw -= e.movementX * sens;
    pitch = clamp(pitch + (invertY ? -1 : 1) * e.movementY * sens, PITCH_MIN, PITCH_MAX);
  });

  return {
    get yaw() { return yaw; },
    set yaw(v) { yaw = v; },
    get pitch() { return pitch; },
    get locked() { return locked; },

    /** Feed the right analog stick (each −1..1) once per frame. */
    applyStick(x, y, dt) {
      if (x) yaw -= x * 2.6 * dt;
      if (y) pitch = clamp(pitch + (invertY ? -1 : 1) * y * 1.8 * dt, PITCH_MIN, PITCH_MAX);
    },

    /** @param {number} m  sensitivity multiplier (0.5–2.0) */
    setSensitivity(m) { mult = m; sens = BASE_SENS * m; },
    setInvertY(v) { invertY = !!v; },
  };
}
