/**
 * @file core/input.js
 * @responsibility Poll keyboard, gamepad and touch, and expose normalised input
 * each frame: gameplay state via readInput() (throttle/steer/handbrake/horn/
 * run/jump/look/enter) and edge-triggered menu navigation via readMenu().
 * Later phases read these; nothing else touches raw events.
 *
 * @phase Implemented in Phase 1 (keyboard + gamepad), touch added in Phase 7.
 */

/**
 * @typedef {Object} InputState
 * @property {number} throttle  -1 (reverse/brake) .. +1 (accelerate)
 * @property {number} steer      -1 (right) .. +1 (left)
 * @property {boolean} handbrake true while handbrake/jump control is held (driving)
 * @property {boolean} horn      true while the horn key/button is held
 * @property {boolean} run       true while sprinting on foot (Shift / bumpers)
 * @property {boolean} jump      true while the jump control is held (Space / A, on foot)
 * @property {{x: number, y: number}} look  right analog stick, each axis -1..1
 *                                           (deadzoned); {x:0,y:0} when no gamepad
 * @property {boolean} enter     true while the get-in/out-of-vehicle control is held
 *                                           (KeyF / gamepad Y)
 */

/**
 * Edge-triggered menu navigation. Each field is true for exactly one readMenu()
 * call per discrete press, then stays false until the control is released and
 * pressed again.
 * @typedef {Object} MenuState
 * @property {boolean} up
 * @property {boolean} down
 * @property {boolean} left
 * @property {boolean} right
 * @property {boolean} confirm
 * @property {boolean} back
 * @property {boolean} pause
 */

const keys = /** @type {Record<string, boolean>} */ ({});

// Previous raw pressed-state per logical menu control, for edge detection.
// Combines keyboard + gamepad so holding a direction fires exactly once.
const menuPrev = {
  up: false,
  down: false,
  left: false,
  right: false,
  confirm: false,
  back: false,
  pause: false,
};

// Keys the browser would otherwise act on (scroll the page) while driving.
const SWALLOW = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (SWALLOW.has(e.code)) e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
// If focus is lost mid-press (alt-tab), keys would stick "down" forever, and a
// held menu control would look like a fresh press on return. Clear both.
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  for (const k in menuPrev) menuPrev[k] = false;
});

const STICK_DEADZONE = 0.12; // analog stick deadzone
const MENU_STICK = 0.5; // stick threshold for menu navigation (avoids drift)

/** Apply a symmetric deadzone. @param {number} v @param {number} [d] */
function deadzone(v, d = STICK_DEADZONE) {
  return Math.abs(v) > d ? v : 0;
}

/** First connected gamepad, or null. @returns {Gamepad | null} */
function getPad() {
  const pads = navigator.getGamepads?.();
  if (!pads) return null;
  return [...pads].find(Boolean) ?? null;
}

/**
 * Read the current normalised input. Gamepad (if present) is folded in so the
 * sticks and triggers work without any extra wiring.
 * @returns {InputState}
 */
export function readInput() {
  const up = keys['KeyW'] || keys['ArrowUp'];
  const down = keys['KeyS'] || keys['ArrowDown'];
  const left = keys['KeyA'] || keys['ArrowLeft'];
  const right = keys['KeyD'] || keys['ArrowRight'];

  let throttle = (up ? 1 : 0) - (down ? 1 : 0);
  let steer = (left ? 1 : 0) - (right ? 1 : 0);
  let handbrake = !!keys['Space'];
  let horn = !!keys['KeyH'];
  let run = !!(keys['ShiftLeft'] || keys['ShiftRight']);
  let jump = !!keys['Space'];
  let enter = !!keys['KeyF'];
  let look = { x: 0, y: 0 };

  const pad = readGamepad();
  if (pad) {
    if (Math.abs(pad.steer) > Math.abs(steer)) steer = pad.steer;
    if (Math.abs(pad.throttle) > Math.abs(throttle)) throttle = pad.throttle;
    handbrake = handbrake || pad.handbrake;
    horn = horn || pad.horn;
    run = run || pad.run;
    jump = jump || pad.jump; // gamepad A = handbrake in car / jump on foot
    enter = enter || pad.enter;
    look = pad.look;
  }

  return { throttle, steer, handbrake, horn, run, jump, look, enter };
}

/**
 * Gamepad gameplay mapping, tuned to serve both driving and on-foot.
 * @returns {{steer:number, throttle:number, handbrake:boolean, jump:boolean,
 *            horn:boolean, run:boolean, enter:boolean,
 *            look:{x:number, y:number}} | null}
 */
function readGamepad() {
  const gp = getPad();
  if (!gp) return null;

  const lx = deadzone(gp.axes[0] ?? 0); // left stick X
  const ly = deadzone(gp.axes[1] ?? 0); // left stick Y (up = negative)
  const rx = deadzone(gp.axes[2] ?? 0); // right stick X
  const ry = deadzone(gp.axes[3] ?? 0); // right stick Y

  const rt = gp.buttons[7]?.value ?? 0; // right trigger = accelerate
  const lt = gp.buttons[6]?.value ?? 0; // left trigger = brake/reverse

  // Combine stick and triggers for throttle: take whichever has more authority.
  const stickThrottle = -ly; // push stick up (negative) => forward (+)
  const triggerThrottle = rt - lt;
  const throttle =
    Math.abs(triggerThrottle) > Math.abs(stickThrottle) ? triggerThrottle : stickThrottle;

  const a = !!gp.buttons[0]?.pressed; // A / cross

  return {
    steer: -lx, // stick right (+) should steer right (-)
    throttle,
    handbrake: a, // A: handbrake when driving
    jump: a, //        jump when on foot
    horn: !!gp.buttons[2]?.pressed, // X / square
    run: !!(gp.buttons[4]?.pressed || gp.buttons[5]?.pressed), // LB / RB = sprint
    enter: !!gp.buttons[3]?.pressed, // Y / triangle = get in/out
    look: { x: rx, y: ry },
  };
}

/**
 * Read edge-triggered menu navigation. Safe to call every frame on its own
 * animation loop, independently of readInput(). Each control fires once per
 * discrete press across both keyboard and gamepad.
 * @returns {MenuState}
 */
export function readMenu() {
  const gp = getPad();
  const ax = gp ? gp.axes[0] ?? 0 : 0;
  const ay = gp ? gp.axes[1] ?? 0 : 0;

  const raw = {
    up: !!(keys['ArrowUp'] || keys['KeyW'] || gp?.buttons[12]?.pressed || ay < -MENU_STICK),
    down: !!(keys['ArrowDown'] || keys['KeyS'] || gp?.buttons[13]?.pressed || ay > MENU_STICK),
    left: !!(keys['ArrowLeft'] || keys['KeyA'] || gp?.buttons[14]?.pressed || ax < -MENU_STICK),
    right: !!(keys['ArrowRight'] || keys['KeyD'] || gp?.buttons[15]?.pressed || ax > MENU_STICK),
    confirm: !!(keys['Enter'] || keys['Space'] || gp?.buttons[0]?.pressed), // A / cross
    back: !!(keys['Escape'] || keys['Backspace'] || gp?.buttons[1]?.pressed), // B / circle
    pause: !!(keys['Escape'] || gp?.buttons[9]?.pressed), // Start
  };

  const edge = /** @type {MenuState} */ ({});
  for (const k in raw) {
    const key = /** @type {keyof MenuState} */ (k);
    edge[key] = raw[key] && !menuPrev[key];
    menuPrev[key] = raw[key];
  }
  edge.confirmHeld = raw.confirm; // level, not edge — for hold-to-fast-forward
  return edge;
}
