/**
 * @file date/scene.js
 * @responsibility Stage the dinner inside the café that already exists in the
 * world: place the two characters at the date table, light them with a warm
 * key + a candle, and run a two-shot cinematic camera (over-the-shoulder on
 * Simone while she speaks; a wider side two-shot while Jonathan chooses).
 * Mood ('warm'|'neutral'|'cool') tints the key light — the meter, embodied.
 *
 * The scene borrows the game's ONE camera while active; the chase cams adopt
 * it back when (if) the date ever releases it. No second render pass.
 *
 * @phase Implemented in Phase 4.
 */

import * as THREE from 'three';

const FOV = 44; // shallow, intimate — the drive uses 70+

const MOOD_COLORS = {
  warm: new THREE.Color(0xffc98a),
  neutral: new THREE.Color(0xffe8cf),
  cool: new THREE.Color(0xa8c4e8),
};

/**
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 */
export function createDateScene(scene, camera) {
  // The rig stays in the scene from boot with its lights at zero intensity.
  // Toggling lights in/out of the graph changes the light COUNT, which forces
  // three.js to recompile every material's shader mid-game — a hard multi-
  // second stall on integrated GPUs. Intensity is free; visibility is not.
  const rig = new THREE.Group();
  scene.add(rig);

  // Warm key over the table (no shadows — §10 keeps one shadow light).
  const KEY_INTENSITY = 30;
  const key = new THREE.PointLight(MOOD_COLORS.neutral, 0, 16, 1.8);
  rig.add(key);
  // Candle: a tiny emissive stub + its own faint glow.
  const candle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.04, 0.14, 6),
    new THREE.MeshLambertMaterial({ color: 0xfff2d0, emissive: 0xffb44d, emissiveIntensity: 1.2 }),
  );
  candle.visible = false; // the mesh is cheap to toggle; only lights are not
  rig.add(candle);
  const glow = new THREE.PointLight(0xffa040, 0, 4, 2);
  rig.add(glow);

  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  const moodColor = MOOD_COLORS.neutral.clone();

  let shots = null;   // { partner: {pos, look}, choices: {pos, look} }
  let active = false;
  let snap = true;    // first update after begin() teleports the camera

  // Walk-in state: Ayah leads him from the door to the table, then they sit.
  const SEAT_SINK = 0.42;  // the table hides the legs; sunk torsos read seated
  const WALK_TIME = 4.2;   // seconds, door → table
  let walkin = null;       // { t, jon, ayahGroup, from, jonTo, ayahTo, onSeated }
  let jonRef = null;

  return {
    /**
     * Stage the date with a walk-in: Simone is already seated; Ayah trots from
     * the door to the table and Jonathan follows; both settle, then onSeated
     * fires (main starts the dialogue there). Mixers stay owned by the caller.
     * @param {Object} p
     * @param {{group: THREE.Object3D, setState?: Function}} p.jon
     * @param {{group: THREE.Object3D, setState?: Function}} p.sim
     * @param {THREE.Object3D} p.ayahGroup  the halo dog, borrowed for the night
     * @param {{x:number, z:number}} p.table @param {number} p.floorY
     * @param {{x:number, z:number}} p.door  the café doorway (inside edge)
     * @param {() => void} p.onSeated
     */
    begin({ jon, sim, ayahGroup, table, floorY, door, onSeated }) {
      jonRef = jon;
      // Simone is already at her seat (west chair), facing his empty one.
      sim.group.position.set(table.x - 0.95, floorY - SEAT_SINK, table.z);
      sim.group.rotation.y = Math.PI / 2;
      sim.setState?.('idle');

      key.position.set(table.x, floorY + 2.7, table.z);
      candle.position.set(table.x, floorY + 0.68, table.z);
      glow.position.set(table.x, floorY + 0.95, table.z);
      key.intensity = KEY_INTENSITY;
      candle.visible = true;

      const seatedHead = floorY + 1.06;
      shots = {
        // Over Jonathan's right shoulder, looking at her (both seated now).
        partner: {
          pos: new THREE.Vector3(table.x + 2.3, floorY + 1.35, table.z - 1.15),
          look: new THREE.Vector3(table.x - 0.95, seatedHead, table.z),
        },
        // Side-on two-shot from the south while he weighs his answer.
        choices: {
          pos: new THREE.Vector3(table.x + 0.45, floorY + 1.3, table.z - 3.4),
          look: new THREE.Vector3(table.x + 0.2, floorY + 0.95, table.z),
        },
        // Watching the two of them come in from the door.
        walkin: {
          pos: new THREE.Vector3(table.x + 2.6, floorY + 1.7, table.z + 1.6),
          look: new THREE.Vector3(door.x, floorY + 0.9, door.z),
        },
      };

      // Start the pair just inside the doorway; Ayah a stride ahead.
      const from = new THREE.Vector3(door.x, floorY, door.z);
      jon.group.position.copy(from);
      jon.group.position.z -= 0.3;
      jon.setState?.('walk');
      ayahGroup.position.set(door.x + 0.5, floorY, door.z + 0.8);
      walkin = {
        t: 0,
        jon, ayahGroup, onSeated,
        floorY,
        from,
        jonTo: new THREE.Vector3(table.x + 0.95, floorY, table.z),   // his chair
        ayahTo: new THREE.Vector3(table.x - 2.1, floorY, table.z - 1.25), // curls up at Simone's side, out of the shot line
      };

      wantPos.copy(shots.walkin.pos);
      wantLook.copy(shots.walkin.look);
      active = true;
      snap = true;
      camera.fov = FOV;
      camera.updateProjectionMatrix();
    },

    /** Swap between the two framings. @param {'partner'|'choices'} name */
    setShot(name) {
      if (!shots) return;
      const s = shots[name] ?? shots.partner;
      wantPos.copy(s.pos);
      wantLook.copy(s.look);
    },

    /** @param {'warm'|'neutral'|'cool'} mood */
    setMood(mood) {
      moodColor.copy(MOOD_COLORS[mood] ?? MOOD_COLORS.neutral);
    },

    /** Advance the walk-in on the FIXED timestep (deterministic, pausable) —
     *  call from the update loop while the date is active. */
    tick(dt) {
      if (!active || !walkin) return;
      {
        walkin.t += dt;
        const u = Math.min(1, walkin.t / WALK_TIME);
        const ease = u * u * (3 - 2 * u);
        const w = walkin;
        // Ayah leads by ~15% of the path, with a happy little trot-bounce.
        const uA = Math.min(1, ease * 1.18);
        w.ayahGroup.position.lerpVectors(
          new THREE.Vector3(w.from.x + 0.5, w.floorY, w.from.z + 0.8), w.ayahTo, uA);
        w.ayahGroup.position.y = w.floorY + (uA < 1 ? Math.abs(Math.sin(walkin.t * 9)) * 0.06 : 0);
        w.ayahGroup.rotation.y = Math.atan2(w.ayahTo.x - w.from.x, w.ayahTo.z - w.from.z) + (uA >= 1 ? 1.2 : 0);
        // Jonathan walks a stride behind.
        const uJ = Math.max(0, Math.min(1, (ease - 0.08) / 0.92));
        w.jon.group.position.lerpVectors(w.from, w.jonTo, uJ);
        w.jon.group.rotation.y = Math.atan2(w.jonTo.x - w.from.x, w.jonTo.z - w.from.z);
        if (u >= 1) {
          // Take the seat: sink behind the table, face her, settle.
          w.jon.group.position.set(w.jonTo.x, w.floorY - SEAT_SINK, w.jonTo.z);
          w.jon.group.rotation.y = -Math.PI / 2;
          w.jon.setState?.('idle');
          wantPos.copy(shots.partner.pos);
          wantLook.copy(shots.partner.look);
          const done = w.onSeated;
          walkin = null;
          done?.();
        }
      }
    },

    /** Ease the camera + light each render while the date owns the frame. */
    update(frameDt) {
      if (!active) return;
      const t = snap ? 1 : 1 - Math.exp(-3.2 * frameDt);
      snap = false;
      camPos.lerp(wantPos, t);
      camLook.lerp(wantLook, t);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      key.color.lerp(moodColor, 1 - Math.exp(-2.5 * frameDt));
      // Candle flicker — cheap life.
      glow.intensity = 2.6 + Math.sin(performance.now() * 0.011) * 0.5 + Math.sin(performance.now() * 0.027) * 0.3;
    },

    end() {
      active = false;
      key.intensity = 0;
      glow.intensity = 0;
      candle.visible = false;
    },
  };
}
