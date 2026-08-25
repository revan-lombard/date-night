/**
 * @file player/character.js
 * @responsibility Wrap a loaded rigged GLTF into a game avatar: normalise scale
 * and facing, drive an AnimationMixer with crossfaded idle/walk/run, cast
 * shadows. Also provides a procedural capsule fallback with the same API so the
 * game runs even if the model fails to load.
 *
 * The returned `group`'s +Z is the avatar's forward; callers set group.position
 * and group.rotation.y to place and aim it.
 *
 * @phase Added alongside Phase 1.5 (on-foot player).
 */

import * as THREE from 'three';

/**
 * @typedef {Object} Avatar
 * @property {THREE.Group} group           place/aim this (position + rotation.y)
 * @property {(state:'idle'|'walk'|'run')=>void} setState  crossfade to a locomotion state
 * @property {(dt:number)=>void} update     advance the animation mixer
 * @property {boolean} animated             false for the fallback capsule
 */

// RobotExpressive (and most rigs) expose these clip names; we map our three
// locomotion states onto whatever the rig actually provides.
const CLIP_ALIASES = {
  idle: ['Idle', 'idle', 'Idle_Loop', 'CharacterArmature|Idle'],
  walk: ['Walking', 'Walk', 'walk', 'CharacterArmature|Walk'],
  run: ['Running', 'Run', 'run', 'CharacterArmature|Run'],
  jump: ['Jump', 'jump', 'Jumping', 'CharacterArmature|Jump'],
};

/**
 * @param {import('three/addons/loaders/GLTFLoader.js').GLTF} gltf
 * @param {{targetHeight?: number, modelYaw?: number, skinShirt?: number,
 *   extraClips?: THREE.AnimationClip[], keepMaterials?: boolean}} [opts]
 *   extraClips: locomotion clips from a shared pack, used only if the rig ships
 *     with none of its own (Ready Player Me / Avaturn export mesh-only).
 *   keepMaterials: force-preserve the model's own materials (true = never
 *     repaint). When omitted we auto-detect: a rig that already carries texture
 *     maps (a photo-built avatar) is left untouched so its face survives.
 * @returns {Avatar}
 */
export function createCharacter(gltf, opts = {}) {
  const targetHeight = opts.targetHeight ?? 1.8;
  const modelYaw = opts.modelYaw ?? 0;
  const shirt = opts.skinShirt ?? 0x2b6ae8;

  const model = gltf.scene;
  const style = opts.style ?? 'suit';
  let textured = false;
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false; // small rig; avoids pop when the origin leaves view
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m && (m.map || m.color))) {
        // A textured/coloured material — likely a real photo-avatar. The bare
        // three.js mannequins we ship are untextured grey, so this reliably
        // distinguishes a Ready Player Me / Avaturn face from a mannequin.
        if (mats.some((m) => m && m.map)) textured = true;
      }
    }
  });
  // Repaint the grey mannequin into a clothed low-poly figure — but NEVER over a
  // photo-avatar's own textured skin/face/clothing.
  const keepMaterials = opts.keepMaterials ?? textured;
  if (!keepMaterials) clotheModel(model, shirt, style);

  // Normalise to a sensible height, feet on the ground, origin under the body.
  let box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.0001) model.scale.setScalar(targetHeight / size.y);
  box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;
  model.rotation.y = modelYaw;

  const group = new THREE.Group();
  group.add(model);

  const mixer = new THREE.AnimationMixer(model);
  // Prefer the rig's own clips; if it shipped without any (RPM/Avaturn), fall
  // back to the shared animation pack passed in via opts.extraClips.
  const ownClips = gltf.animations || [];
  const clips = ownClips.length ? ownClips : (opts.extraClips || []);
  const byName = new Map(clips.map((c) => [c.name, c]));
  // Keyword fallback so an arbitrary user-supplied rig (Mixamo, Quaternius,
  // KayKit, Ready Player Me...) still maps onto our idle/walk/run/jump.
  const KEYWORDS = { idle: ['idle', 'stand'], walk: ['walk'], run: ['run', 'jog', 'sprint'], jump: ['jump'] };
  const actionFor = (state) => {
    for (const name of CLIP_ALIASES[state]) {
      if (byName.has(name)) return mixer.clipAction(byName.get(name));
    }
    const kw = KEYWORDS[state];
    const fuzzy = clips.find((c) => kw.some((k) => c.name.toLowerCase().includes(k)));
    return fuzzy ? mixer.clipAction(fuzzy) : null;
  };
  // Universal fallback: a rig with a single unnamed clip (common with Mixamo
  // single-animation exports) still gets *some* motion rather than a T-pose.
  const universal = clips.length ? mixer.clipAction(clips[0]) : null;
  const actions = {
    idle: actionFor('idle') || universal,
    walk: actionFor('walk') || universal,
    run: actionFor('run') || actionFor('walk') || universal,
  };
  const jumpAction = actionFor('jump');
  if (jumpAction) {
    jumpAction.setLoop(THREE.LoopOnce, 1);
    jumpAction.clampWhenFinished = true;
  }

  let current = null;
  let currentKey = null;
  function setState(state) {
    if (state === currentKey) return;
    const next = actions[state] || actions.idle || actions.walk;
    if (!next) return;
    currentKey = state;
    if (next === current) return;
    next.reset().setEffectiveWeight(1).fadeIn(0.2).play();
    if (current) current.fadeOut(0.2);
    current = next;
  }
  setState('idle');

  /** Fire the jump clip once, layered over the current locomotion. */
  function jump() {
    if (!jumpAction) return;
    jumpAction.reset().setEffectiveWeight(1).fadeIn(0.05).play();
  }

  /** Scale playback of the current locomotion action (footspeed matching). */
  function setTimeScale(x) { if (current) current.timeScale = x; }

  /**
   * Put a prop in the right hand so it swings with the arm (bouquets…).
   * A counter-scaled wrapper keeps the prop's world size regardless of the
   * rig's units (RPM ≈ metres, Mixamo often cm). Returns false when the rig
   * has no hand bone — caller should fall back to a body attach.
   * @param {THREE.Object3D} prop
   */
  function holdRight(prop) {
    let hand = null;
    model.traverse((o) => {
      if (!hand && o.isBone && /^(right.?hand|hand.?r)$/i.test(o.name.replace(/[\s_.]/g, ''))) hand = o;
    });
    if (!hand) return false;
    hand.updateWorldMatrix(true, false);
    const ws = new THREE.Vector3();
    hand.getWorldScale(ws);
    const wrap = new THREE.Group();
    wrap.scale.setScalar(1 / (ws.x || 1));
    // Nestle into the palm, tilted outward the way you actually carry flowers.
    prop.position.set(0.02, 0.03, 0.05);
    prop.rotation.set(0.5, 0, -0.25);
    wrap.add(prop);
    hand.add(wrap);
    return true;
  }

  /**
   * Change what he's wearing (the tailor). On a photo-avatar we tint the
   * outfit materials (never the face); on the mannequin we re-band the
   * vertex-colour clothing with the new shirt colour.
   * @param {number} color hex
   */
  function setShirt(color) {
    if (keepMaterials) {
      model.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          if (m && /outfit|shirt|top|jacket|suit/i.test(m.name || '')) m.color.set(color);
        }
      });
    } else {
      clotheModel(model, color, style);
    }
  }

  return {
    group,
    setState,
    setTimeScale,
    jump,
    holdRight,
    setShirt,
    update: (dt) => mixer.update(dt),
    animated: true,
  };
}

/**
 * Recolour a plain (grey) rig into a clothed low-poly figure using per-vertex
 * colours banded by bind-pose height: shoes / trousers / shirt+sleeves / skin.
 * Swaps to a flat-shaded vertex-colour material so it matches the game's look.
 * Two styles until the photo-avatars arrive:
 *   'suit'  — shoes, charcoal trousers, jacket in `primary`, skin, dark hair
 *   'dress' — heels, bare legs, dress in `primary`, skin, long dark hair
 * @param {THREE.Object3D} model @param {number} primary @param {'suit'|'dress'} [style]
 */
function clotheModel(model, primary, style = 'suit') {
  const skin = new THREE.Color(0xd9a066);
  const main = new THREE.Color(primary);
  const bands = style === 'dress'
    ? [ // her: heels / legs / the dress / skin / hair
      { to: 0.045, c: new THREE.Color(0x241f26) },
      { to: 0.42, c: skin },
      { to: 0.80, c: main },
      { to: 0.915, c: skin },
      { to: Infinity, c: new THREE.Color(0x2e1c12) },
    ]
    : [ // him: shoes / trousers / jacket / skin / hair
      { to: 0.055, c: new THREE.Color(0x1b1d24) },
      { to: 0.50, c: new THREE.Color(0x2a2d36) },
      { to: 0.82, c: main },
      { to: 0.925, c: skin },
      { to: Infinity, c: new THREE.Color(0x3a2a1c) },
    ];
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    // Rig clones (SkeletonUtils) SHARE geometry — write colours to our own
    // copy, or dressing Simone repaints Jonathan too (ask me how I know).
    const geo = o.geometry.clone();
    o.geometry = geo;
    geo.computeBoundingBox();
    const { min, max } = geo.boundingBox;
    const h = max.y - min.y || 1;
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const ny = (pos.getY(i) - min.y) / h; // 0 feet .. 1 head
      const band = bands.find((b) => ny < b.to) ?? bands[bands.length - 1];
      col[i * 3] = band.c.r; col[i * 3 + 1] = band.c.g; col[i * 3 + 2] = band.c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    o.castShadow = true;
  });
}

/**
 * Procedural stand-in avatar (capsule body + box head) matching the game's
 * low-poly look. Same API as createCharacter; setState just adds a walk bob.
 * @param {number} shirtColor
 * @returns {Avatar}
 */
export function createFallbackCharacter(shirtColor = 0x2b3ae8) {
  const group = new THREE.Group();
  const inner = new THREE.Group();
  group.add(inner);

  const bodyMat = new THREE.MeshLambertMaterial({ color: shirtColor, flatShading: true });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a066, flatShading: true });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.7, 4, 10), bodyMat);
  body.position.y = 0.85;
  body.castShadow = true;
  inner.add(body);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.34), skinMat);
  head.position.y = 1.5;
  head.castShadow = true;
  inner.add(head);

  let t = 0;
  let key = 'idle';
  return {
    group,
    setState: (state) => { key = state; },
    setTimeScale: () => {},
    jump: () => {}, // vertical arc is driven by the player controller
    update: (dt) => {
      // A subtle bob when moving; a slow breathe when idle.
      t += dt * (key === 'run' ? 14 : key === 'walk' ? 9 : 2);
      inner.position.y = key === 'idle' ? Math.sin(t) * 0.01 : Math.abs(Math.sin(t)) * 0.06;
    },
    animated: false,
  };
}
