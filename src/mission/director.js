/**
 * @file mission/director.js
 * @responsibility Act state machine for the errand:
 *   SPAWN → CALL (↺ CALLBACK if declined) → TO_FLORIST → (buy flowers) →
 *   TO_VENUE → ARRIVE (→ DATE in Phase 4).
 * Rings the phone, then routes the player to the florist; buying the bouquet
 * (main calls flowersBought()) retargets the waypoint to the coffee shop;
 * reaching it captures the lateness value. No fail state.
 *
 * @phase Phase 3 / 3.7.
 */

const SPAWN_TO_CALL = 1.3;
const ARRIVE_RADIUS = 9;
const CALLBACK_DELAY = 2.6;

/**
 * @param {Object} deps
 * @param {*} deps.phone @param {*} deps.waypoint @param {*} deps.timer @param {*} deps.bus
 * @param {{caller:string, lines:string[], declineLines?:string[]}} deps.call
 * @param {() => {x:number, z:number}} deps.getPose
 * @param {{florist:{x:number,z:number,y:number}, coffee:{x:number,z:number,y:number}}} deps.stops
 */
export function createDirector({ phone, waypoint, timer, bus, call, getPose, stops }) {
  let act = 'SPAWN';
  let t = 0;
  let lateness = 0;
  let callDeclined = false;
  let calledBack = false;
  let callbackTimer = 0;

  waypoint.setVisible(false);
  const set = (next) => { act = next; bus.emit('act', next); };
  const beginDrive = () => {
    timer.start();
    waypoint.setTarget(stops.florist, stops.florist.y);
    waypoint.setVisible(true);
    set('TO_FLORIST');
  };

  function update(dt) {
    t += dt;
    switch (act) {
      case 'SPAWN':
        if (t >= SPAWN_TO_CALL) { phone.start(call.caller, call.lines); set('CALL'); }
        break;
      case 'CALL':
        phone.update(dt);
        if (phone.done) {
          phone.hide();
          if (phone.declined && !calledBack) {
            callDeclined = true; calledBack = true; callbackTimer = CALLBACK_DELAY;
            set('CALLBACK');
          } else {
            callDeclined = callDeclined || !!phone.declined;
            beginDrive();
          }
        }
        break;
      case 'CALLBACK':
        callbackTimer -= dt;
        if (callbackTimer <= 0) { phone.start(call.caller, call.declineLines || call.lines); set('CALL'); }
        break;
      case 'TO_FLORIST': {
        timer.tick(dt);
        const p = getPose();
        if (p && waypoint.distanceTo(p.x, p.z) <= ARRIVE_RADIUS) {
          waypoint.setVisible(false); // reached the mark — it clears, next objective shows
          set('AT_FLORIST');
        }
        break;
      }
      case 'AT_FLORIST':
        timer.tick(dt); // waiting for the player to buy the bouquet (main → flowersBought)
        break;
      case 'TO_VENUE': {
        timer.tick(dt);
        const p = getPose();
        if (p && waypoint.distanceTo(p.x, p.z) <= ARRIVE_RADIUS) {
          timer.stop();
          lateness = timer.lateness;
          waypoint.setVisible(false);
          set('ARRIVE');
        }
        break;
      }
      // ARRIVE: terminal for Phase 3 (the date hooks in at Phase 4).
    }
  }

  /** Called by main once the bouquet is bought — head to the venue. */
  function flowersBought() {
    if (act !== 'AT_FLORIST') return;
    waypoint.setTarget(stops.coffee, stops.coffee.y);
    waypoint.setVisible(true);
    set('TO_VENUE');
  }

  return {
    update,
    flowersBought,
    get act() { return act; },
    get lateness() { return lateness; },
    get callDeclined() { return callDeclined; },
  };
}
