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

  return {
    /**
     * Stage the date. Avatars are positioned here; animation mixers stay
     * owned by the caller (tick their update(dt) while the date runs).
     * @param {Object} p
     * @param {{group: THREE.Object3D}} p.jon      the player avatar
     * @param {{group: THREE.Object3D}} p.sim      Simone's avatar (or stand-in)
     * @param {{x:number, z:number}} p.table       date-table centre
     * @param {number} p.floorY                    café floor height
     */
    begin({ jon, sim, table, floorY }) {
      // Face each other across the table (chairs sit east/west of it).
      jon.group.position.set(table.x + 1.55, floorY, table.z);
      jon.group.rotation.y = -Math.PI / 2; // facing west, toward her
      sim.group.position.set(table.x - 1.55, floorY, table.z);
      sim.group.rotation.y = Math.PI / 2;  // facing east, toward him

      key.position.set(table.x, floorY + 2.7, table.z);
      candle.position.set(table.x, floorY + 0.68, table.z);
      glow.position.set(table.x, floorY + 0.95, table.z);
      key.intensity = KEY_INTENSITY;
      candle.visible = true;

      const headY = floorY + 1.5;
      shots = {
        // Over Jonathan's right shoulder, looking at her.
        partner: {
          pos: new THREE.Vector3(table.x + 2.7, floorY + 1.62, table.z - 1.35),
          look: new THREE.Vector3(table.x - 1.55, headY - 0.06, table.z),
        },
        // Side-on two-shot from the south while he weighs his answer.
        choices: {
          pos: new THREE.Vector3(table.x + 0.5, floorY + 1.52, table.z - 3.9),
          look: new THREE.Vector3(table.x + 0.25, floorY + 1.18, table.z),
        },
      };
      wantPos.copy(shots.partner.pos);
      wantLook.copy(shots.partner.look);
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
