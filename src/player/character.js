/**
 * @file player/character.js
 * @responsibility Wrap a loaded rigged GLTF into a game avatar: normalise scale
 * and facing, drive an AnimationMixer with crossfaded idle/walk/run, cast
 * shadows — and DRESS the grey mannequin as a specific person. Clothing, skin,
 * hair and beard are painted as per-vertex colours by BONE REGION (which bone
 * owns each vertex), so sleeves stop at the wrist, the face stays skin, and a
 * dress ends at the ankle no matter the pose. Hair volume, glasses, a bow tie
 * and a necklace are small procedural meshes parented to the head / neck bones
 * so they ride along with the animation.
 *
 * Also provides a procedural capsule fallback with the same API so the game
 * runs even if the model fails to load.
 *
 * The returned `group`'s +Z is the avatar's forward; callers set group.position
 * and group.rotation.y to place and aim it.
 *
 * @phase Added alongside Phase 1.5 (on-foot player); likeness pass for ship.
 */

import * as THREE from 'three';

/**
 * @typedef {Object} Avatar
 * @property {THREE.Group} group           place/aim this (position + rotation.y)
 * @property {(state:'idle'|'walk'|'run')=>void} setState  crossfade to a locomotion state
 * @property {(dt:number)=>void} update     advance the animation mixer
 * @property {boolean} animated             false for the fallback capsule
 */

/**
 * @typedef {Object} Look  — how a person is drawn (see content/personal.js LOOKS)
 * @property {number} skin
 * @property {number} hair
 * @property {'short'|'long'|'none'} [hairStyle]
 * @property {number} [beard]        colour; omit for clean-shaven
 * @property {number} [glasses]      frame colour; omit for none
 * @property {number} [build]        x/z scale, 1 = the mannequin's slim build
 * @property {number} [necklace]     colour; omit for none
 * @property {Object} outfit         see paintOutfit()
 */

// RobotExpressive (and most rigs) expose these clip names; we map our three
// locomotion states onto whatever the rig actually provides.
const CLIP_ALIASES = {
  idle: ['Idle', 'idle', 'Idle_Loop', 'CharacterArmature|Idle'],
  walk: ['Walking', 'Walk', 'walk', 'CharacterArmature|Walk'],
  run: ['Running', 'Run', 'run', 'CharacterArmature|Run'],
  jump: ['Jump', 'jump', 'Jumping', 'CharacterArmature|Jump'],
};

const flat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/**
 * @param {import('three/addons/loaders/GLTFLoader.js').GLTF} gltf
 * @param {{targetHeight?: number, modelYaw?: number, look?: Look,
 *   extraClips?: THREE.AnimationClip[], keepMaterials?: boolean}} [opts]
 *   look: who this is — skin/hair/outfit. Omit to leave the rig as shipped.
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
  const look = opts.look ?? null;

  const model = gltf.scene;
  let textured = false;
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false; // small rig; avoids pop when the origin leaves view
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m && m.map)) textured = true; // a photo-avatar's own skin
    }
  });
  // Dress the grey mannequin as this person — but NEVER over a photo-avatar's
  // own textured face/clothing.
  const keepMaterials = opts.keepMaterials ?? textured;
  const body = (!keepMaterials && look) ? measureRig(model) : null;
  if (body) paintPerson(body, look, look.outfit);

  // Normalise to a sensible height, feet on the ground, origin under the body.
  let box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  if (size.y > 0.0001) model.scale.setScalar(targetHeight / size.y);
  box = new THREE.Box3().setFromObject(model);
  model.position.y -= box.min.y;
  model.rotation.y = modelYaw;
  // Build: the mannequin is one slim athlete; real people aren't.
  if (look?.build && look.build !== 1) { model.scale.x *= look.build; model.scale.z *= look.build; }

  const group = new THREE.Group();
  group.add(model);
  if (body) dressAccessories(body, look);

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
      if (!hand && o.isBone && /^(right.?hand|hand.?r)$/i.test(o.name.replace(/^mixamorig:?/i, '').replace(/[\s_.]/g, ''))) hand = o;
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
   * Change what he's wearing (the tailor): repaint the outfit regions only —
   * skin, hair and beard are untouched. On a photo-avatar we tint the outfit
   * materials by name instead (never the face).
   * @param {Object} outfit  see paintOutfit()
   */
  function setOutfit(outfit) {
    if (body) { paintPerson(body, look, outfit); dressAccessories(body, look, outfit); return; }
    if (!keepMaterials) return;
    const color = outfit?.jacket ?? outfit?.top;
    if (color == null) return;
    model.traverse((o) => {
      if (!o.isMesh) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m && /outfit|shirt|top|jacket|suit/i.test(m.name || '')) m.color.set(color);
      }
    });
  }

  return {
    group,
    setState,
    setTimeScale,
    jump,
    holdRight,
    setOutfit,
    /** @deprecated kept for older callers — a plain jacket colour, suit cut */
    setShirt: (color) => setOutfit({ ...(look?.outfit ?? {}), cut: 'formal', jacket: color }),
    update: (dt) => mixer.update(dt),
    animated: true,
    _body: body, // dev harness: the measured landmarks
  };
}

// --- Likeness: measuring the rig -------------------------------------------

/** Bone-name → body region. Names are matched with the "mixamorig:" prefix stripped. */
const REGION_OF = [
  [/^(left|right)?hand/i, 'hand'],
  [/^(left|right)forearm$/i, 'forearm'],
  [/^(left|right)arm$/i, 'upperarm'],
  [/^(left|right)shoulder$/i, 'torso'],
  [/^(hips|spine\d?)$/i, 'torso'],
  [/^neck$/i, 'neck'],
  [/^(head|headtop_end|(left|right)eye)$/i, 'head'],
  [/^(left|right)upleg$/i, 'thigh'],
  [/^(left|right)leg$/i, 'shin'],
  [/^(left|right)(foot|toebase|toe_end)$/i, 'foot'],
];
const regionOfBone = (name) => {
  const n = name.replace(/^mixamorig:?/i, '').replace(/[\s.]/g, '');
  for (const [re, region] of REGION_OF) if (re.test(n)) return region;
  return 'torso';
};

/**
 * Read the rig once: for every skinned vertex, its dominant bone's region and
 * position in mesh space; plus the landmark bone positions we paint against.
 * Everything is in the SkinnedMesh's local (bind) space so it's pose-proof.
 * @returns {null | {meshes: Array<{mesh: THREE.SkinnedMesh, regions: Uint8Array, pos: THREE.BufferAttribute,
 *   shoulderT: Float32Array, shinT: Float32Array}>, marks: Object, headBone: THREE.Bone|null, neckBone: THREE.Bone|null}}
 */
function measureRig(model) {
  model.updateMatrixWorld(true);
  /** @type {THREE.SkinnedMesh[]} */
  const skinned = [];
  model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton) skinned.push(o); });
  if (!skinned.length) return null;
  const ref = skinned[0];
  const bones = ref.skeleton.bones;
  const find = (re) => bones.find((b) => re.test(b.name.replace(/^mixamorig:?/i, '').replace(/[\s.]/g, ''))) || null;
  // A bone's rest position IN THE GEOMETRY'S SPACE is the translation of its
  // bind matrix (the inverse of the skeleton's inverse-bind matrix). Reading it
  // this way is unit-proof: Mixamo rigs keep bones in centimetres under a 0.01
  // armature while the mesh is in metres, so world→local would be 100× off.
  const bindOf = (bone) => {
    const i = bones.indexOf(bone);
    return i < 0 ? null : new THREE.Matrix4().copy(ref.skeleton.boneInverses[i]).invert();
  };
  const local = (bone) => (bone ? new THREE.Vector3().setFromMatrixPosition(bindOf(bone)) : null);
  const headBone = find(/^head$/i);
  const marks = {
    head: local(headBone),
    headTop: local(find(/^headtop_end$/i)),
    eyeL: local(find(/^lefteye$/i)),
    eyeR: local(find(/^righteye$/i)),
    neck: local(find(/^neck$/i)),
    shoulderL: local(find(/^leftarm$/i)),
    shoulderR: local(find(/^rightarm$/i)),
    elbowL: local(find(/^leftforearm$/i)),
    elbowR: local(find(/^rightforearm$/i)),
    kneeL: local(find(/^leftleg$/i)),
    kneeR: local(find(/^rightleg$/i)),
    ankleL: local(find(/^leftfoot$/i)),
    ankleR: local(find(/^rightfoot$/i)),
    spineTop: local(find(/^spine2$/i)),
  };
  // Eye line: prefer eye bones; else guess from the head bone + top.
  if (!marks.eyeL || !marks.eyeR) {
    const top = marks.headTop?.y ?? (marks.head?.y ?? 1.6) + 0.2;
    const y = (marks.head?.y ?? 1.5) + (top - (marks.head?.y ?? 1.5)) * 0.55;
    marks.eyeL = new THREE.Vector3(0.03, y, (marks.head?.z ?? 0) + 0.08);
    marks.eyeR = new THREE.Vector3(-0.03, y, (marks.head?.z ?? 0) + 0.08);
  }
  marks.eyeY = (marks.eyeL.y + marks.eyeR.y) / 2;
  marks.headTopY = marks.headTop?.y ?? marks.eyeY + 0.11;
  marks.H = Math.max(0.06, marks.headTopY - marks.eyeY); // eye→crown: the head's ruler

  const meshes = [];
  const headPts = [];
  for (const mesh of skinned) {
    const geo = mesh.geometry.clone(); // rig clones SHARE geometry — paint our own copy
    mesh.geometry = geo;
    const pos = geo.attributes.position;
    const si = geo.attributes.skinIndex;
    const sw = geo.attributes.skinWeight;
    const n = pos.count;
    const regions = new Uint8Array(n);
    const shoulderT = new Float32Array(n); // 0 at the shoulder → 1 at the elbow (upper arm)
    const shinT = new Float32Array(n);     // 0 at the knee → 1 at the ankle (shin)
    const regionIndex = { torso: 0, upperarm: 1, forearm: 2, hand: 3, neck: 4, head: 5, thigh: 6, shin: 7, foot: 8 };
    const boneRegion = mesh.skeleton.bones.map((b) => regionIndex[regionOfBone(b.name)] ?? 0);
    const boneSide = mesh.skeleton.bones.map((b) => (/left/i.test(b.name) ? 'L' : 'R'));
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      // Dominant bone = the largest of the four weights.
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) {
        const w = sw.getComponent(i, k);
        if (w > bw) { bw = w; best = si.getComponent(i, k); }
      }
      const r = boneRegion[best] ?? 0;
      regions[i] = r;
      p.fromBufferAttribute(pos, i);
      if (r === 5) headPts.push(p.clone());
      const side = boneSide[best];
      if (r === 1) shoulderT[i] = segT(p, marks['shoulder' + side], marks['elbow' + side]);
      if (r === 7) shinT[i] = segT(p, marks['knee' + side], marks['ankle' + side]);
    }
    meshes.push({ mesh, regions, pos, shoulderT, shinT });
  }
  // Head box (mesh space) for front/back and ear decisions.
  const hb = new THREE.Box3().setFromPoints(headPts.length ? headPts : [marks.eyeL, marks.eyeR]);
  marks.headBox = hb;
  marks.headCentre = hb.getCenter(new THREE.Vector3());
  return { meshes, marks, headBone, neckBone: find(/^neck$/i), ref, ibm: (bone) => { const i = bones.indexOf(bone); return i < 0 ? null : ref.skeleton.boneInverses[i]; } };
}

/** Parameter of p projected on segment a→b, clamped 0..1 (0.5 if unknown). */
function segT(p, a, b) {
  if (!a || !b) return 0.5;
  const ab = new THREE.Vector3().subVectors(b, a);
  const len2 = ab.lengthSq() || 1;
  return THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, a).dot(ab) / len2, 0, 1);
}

// --- Likeness: painting -------------------------------------------------------

const REGION = { torso: 0, upperarm: 1, forearm: 2, hand: 3, neck: 4, head: 5, thigh: 6, shin: 7, foot: 8 };

/**
 * Paint skin, hair, beard and the outfit onto every skinned mesh.
 *
 * outfit: { cut: 'casual'|'formal'|'dress',
 *   top, sleeves: 'long'|'short'|'none',          // casual: tee / long-sleeve
 *   jacket, shirt, tie,                            // formal: suit over a shirt
 *   base, floral: number[], length: 'long'|'knee', // dress
 *   bottom, shoes }
 */
function paintPerson(body, look, outfit) {
  const { marks } = body;
  const skin = new THREE.Color(look.skin ?? 0xd9a066);
  const hair = new THREE.Color(look.hair ?? 0x2e1c12);
  const beard = look.beard != null ? new THREE.Color(look.beard) : null;
  const eye = new THREE.Color(0x1a1410);
  const shoes = new THREE.Color(outfit?.shoes ?? 0x1b1d24);
  const cut = outfit?.cut ?? 'casual';
  const top = new THREE.Color(outfit?.jacket ?? outfit?.top ?? outfit?.base ?? 0x2b3ae8);
  const shirt = new THREE.Color(outfit?.shirt ?? 0xf4f1ea);
  const tie = new THREE.Color(outfit?.tie ?? 0x141414);
  const bottom = new THREE.Color(outfit?.bottom ?? (cut === 'formal' ? 0x1a1b1f : 0x3b5a86));
  const floral = (outfit?.floral ?? []).map((c) => new THREE.Color(c));
  const sleeves = outfit?.sleeves ?? (cut === 'dress' ? 'short' : cut === 'formal' ? 'long' : 'long');
  const longHair = (look.hairStyle ?? 'short') === 'long';
  const H = marks.H;
  const eyeY = marks.eyeY;
  const hc = marks.headCentre;
  const headHalfW = (marks.headBox.max.x - marks.headBox.min.x) / 2 || 0.08;
  const shoulderY = ((marks.shoulderL?.y ?? 1.45) + (marks.shoulderR?.y ?? 1.45)) / 2;
  const torsoZ = marks.spineTop?.z ?? 0;
  const eyeR2 = (0.09 * H) ** 2;

  const p = new THREE.Vector3();
  const c = new THREE.Color();
  for (const { mesh, regions, pos, shoulderT, shinT } of body.meshes) {
    const n = pos.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(pos, i);
      const r = regions[i];
      c.copy(skin);
      switch (r) {
        case REGION.head: {
          const front = p.z > hc.z + 0.015;
          const back = p.z < hc.z - 0.02;
          const side = Math.abs(p.x) > headHalfW * 0.72;
          const ear = side && p.y > eyeY - 0.25 * H && p.y < eyeY + 0.35 * H && !back;
          const hairline = front ? eyeY + 0.62 * H : eyeY + 0.22 * H;
          let isHair = !ear && (p.y > hairline || (back && p.y > eyeY - 0.45 * H));
          if ((look.hairStyle ?? 'short') === 'none') isHair = false;
          if (isHair) c.copy(hair);
          else if (beard && p.y < eyeY - 0.62 * H && p.y > eyeY - 1.45 * H && p.z > hc.z - 0.03 && !side) c.copy(beard);
          // Two-dot eyes (§10: stylised, never an almost-face).
          if (!isHair && (p.distanceToSquared(marks.eyeL) < eyeR2 || p.distanceToSquared(marks.eyeR) < eyeR2) && p.z > hc.z) c.copy(eye);
          break;
        }
        case REGION.neck:
          // Long hair falls down the back of the neck.
          if (longHair && p.z < torsoZ + 0.01) c.copy(hair);
          break;
        case REGION.torso: {
          if (cut === 'dress') c.copy(pickFloral(top, floral, p));
          else if (cut === 'formal') {
            // The shirt shows in a V from the collar to mid-chest; the bow tie
            // is a separate mesh at the collar (or, open-collar, just the V).
            const V_DEPTH = 0.28;
            const chest = p.y > shoulderY - V_DEPTH && p.z > torsoZ + 0.02;
            const v = Math.max(0, (p.y - (shoulderY - V_DEPTH)) / V_DEPTH); // 0 at the point → 1 at the collar
            c.copy(chest && Math.abs(p.x) < 0.018 + v * 0.06 ? shirt : top);
          } else c.copy(top);
          // Long hair over the shoulders and down the back.
          if (longHair && p.y > shoulderY - 0.28 && (p.z < torsoZ - 0.02 ? Math.abs(p.x) < 0.16 : Math.abs(p.x) > 0.045 && Math.abs(p.x) < 0.13 && p.y > shoulderY - 0.16)) c.copy(hair);
          break;
        }
        case REGION.upperarm:
          if (sleeves === 'long' || (sleeves === 'short' && shoulderT[i] < 0.42)) c.copy(cut === 'dress' ? pickFloral(top, floral, p) : top);
          break;
        case REGION.forearm:
          if (sleeves === 'long') c.copy(top);
          break;
        case REGION.hand:
          break; // skin
        case REGION.thigh:
          c.copy(cut === 'dress' ? pickFloral(top, floral, p) : bottom);
          break;
        case REGION.shin:
          if (cut === 'dress') { if ((outfit?.length ?? 'long') === 'long' && shinT[i] < 0.78) c.copy(pickFloral(top, floral, p)); }
          else c.copy(bottom);
          break;
        case REGION.foot:
          c.copy(shoes);
          break;
        default:
          c.copy(top);
      }
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    mesh.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!mesh.material?.vertexColors) mesh.material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    mesh.castShadow = true;
  }
}

/** A floral print: mostly the base, with blossoms scattered by a position hash. */
function pickFloral(base, floral, p) {
  if (!floral.length) return base;
  // Quantise to ~6 cm cells so neighbouring vertices share a bloom (patches,
  // not confetti), then hash the cell.
  const cx = Math.floor(p.x / 0.06), cy = Math.floor(p.y / 0.06), cz = Math.floor(p.z / 0.06);
  const h = Math.sin(cx * 127.1 + cy * 311.7 + cz * 74.7) * 43758.5453;
  const u = h - Math.floor(h);
  return u < 0.16 ? floral[Math.floor(u / 0.16 * floral.length) % floral.length] : base;
}

// --- Likeness: accessories ------------------------------------------------------

/**
 * Hair volume, glasses, beard shadow, bow tie, necklace — small flat-shaded
 * meshes parented to the head / neck bones through an axis-corrected, counter-
 * scaled wrapper, so "+Y up, +Z forward, metres" holds in their local space.
 */
function dressAccessories(body, look, outfit = look.outfit) {
  const { marks, headBone, neckBone } = body;
  if (!headBone) return;
  // Rebuild from scratch (the tailor swaps the bow tie in).
  for (const bone of [headBone, neckBone]) {
    if (!bone) continue;
    for (const ch of [...bone.children]) if (ch.userData.dnAccessory) bone.remove(ch);
  }
  // The inverse-bind matrix maps geometry space → bone space, so a wrapper
  // built from it (offset to the anchor point) lets children be authored in
  // the geometry's own metres / axes and still ride the bone through the anim.
  const anchor = (bone, at) => {
    const ibm = bone ? body.ibm(bone) : null;
    if (!ibm) return null;
    const wrap = new THREE.Group();
    wrap.userData.dnAccessory = true;
    const m = new THREE.Matrix4().copy(ibm).multiply(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z));
    m.decompose(wrap.position, wrap.quaternion, wrap.scale);
    bone.add(wrap);
    return wrap;
  };

  const H = marks.H;
  const hb = marks.headBox;
  const hw = (hb.max.x - hb.min.x) || 0.16;
  const hd = (hb.max.z - hb.min.z) || 0.2;
  const eyeC = new THREE.Vector3().addVectors(marks.eyeL, marks.eyeR).multiplyScalar(0.5);
  // The dome sits with its rim on the hairline (~0.6 H above the eyes) and its
  // centre a touch behind the head's centre — a fringe, not a helmet.
  const crown = new THREE.Vector3(marks.headCentre.x, marks.eyeY + 0.62 * H, marks.headCentre.z - 0.012);

  // Hair cap: a low-poly dome sitting on the painted scalp for real volume.
  const style = look.hairStyle ?? 'short';
  if (style !== 'none') {
    const head = anchor(headBone, crown);
    if (head) {
      const hairMat = flat(look.hair ?? 0x2e1c12);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 7, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
      cap.scale.set(hw * 0.53, (hb.max.y - crown.y) * 1.05, hd * 0.54);
      cap.castShadow = true;
      head.add(cap);
      if (style === 'long') {
        // Two falls over the shoulders and a curtain down the back — long hair
        // that reads from every angle without swallowing the face.
        const fall = (x, z, len) => {
          const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, len, 3, 8), hairMat);
          m.position.set(x, -len / 2 - 0.03, z);
          m.castShadow = true;
          head.add(m);
        };
        fall(hw * 0.5, 0.0, 0.26);
        fall(-hw * 0.5, 0.0, 0.26);
        // Strands down the back, longest in the middle — volume, not a board.
        for (const [x, len] of [[-hw * 0.34, 0.28], [-hw * 0.12, 0.34], [hw * 0.12, 0.34], [hw * 0.34, 0.28]]) {
          fall(x, -hd * 0.36, len);
        }
      }
    }
  }

  // Glasses: two rings, a bridge and temples, on the face plane.
  if (look.glasses != null) {
    const face = anchor(headBone, new THREE.Vector3(eyeC.x, eyeC.y, hb.max.z + 0.006));
    if (face) {
      const fm = flat(look.glasses);
      const half = Math.abs(marks.eyeL.x - marks.eyeR.x) / 2 || 0.032;
      for (const s of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(half * 0.82, 0.004, 6, 16), fm);
        ring.position.x = s * half;
        face.add(ring);
        const temple = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, hd * 0.75), fm);
        temple.position.set(s * (half * 1.75), half * 0.25, -hd * 0.38);
        face.add(temple);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(half * 0.5, 0.006, 0.006), fm);
      face.add(bridge);
    }
  }

  // Beard volume: the front-lower shell of the head, a shade proud of the skin,
  // from just under the mouth around the jaw to the chin.
  if (look.beard != null) {
    const chin = anchor(headBone, new THREE.Vector3(marks.headCentre.x, marks.eyeY - 0.55 * H, marks.headCentre.z + 0.005));
    if (chin) {
      const bm = flat(look.beard);
      // phi 0..π = the +Z (front) half; theta from the equator down to near the pole.
      const jaw = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI, Math.PI * 0.5, Math.PI * 0.42), bm);
      jaw.scale.set(hw * 0.49, H * 0.62, hd * 0.5);
      jaw.castShadow = true;
      chin.add(jaw);
    }
  }

  // Neck: bow tie for the formal cut, a fine chain otherwise / for her.
  // Sits on the front of the throat, just above the collarbone.
  const neckAt = new THREE.Vector3(marks.neck?.x ?? 0, (marks.neck?.y ?? 1.5) + 0.015, (marks.neck?.z ?? 0) + 0.105);
  if ((outfit?.cut ?? 'casual') === 'formal' && outfit?.tie != null) {
    const collar = anchor(neckBone ?? headBone, neckAt);
    if (collar) {
      const tm = flat(outfit.tie);
      for (const s of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.032, 0.02), tm);
        wing.position.set(s * 0.036, 0, 0);
        wing.rotation.z = s * 0.12;
        collar.add(wing);
      }
      collar.add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.024), tm));
    }
  } else if (look.necklace != null) {
    const collar = anchor(neckBone ?? headBone, new THREE.Vector3(neckAt.x, neckAt.y - 0.06, neckAt.z - 0.015));
    if (collar) {
      const chain = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.003, 5, 20, Math.PI * 1.2), flat(look.necklace));
      chain.rotation.x = Math.PI / 2 + 0.35;
      chain.rotation.z = Math.PI;
      collar.add(chain);
      const pendant = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.02, 0.005), flat(look.necklace));
      pendant.position.set(0, -0.03, 0.02);
      collar.add(pendant);
    }
  }
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
    setOutfit: (o) => { const col = o?.jacket ?? o?.top ?? o?.base; if (col != null) bodyMat.color.set(col); },
    setShirt: (col) => bodyMat.color.set(col),
    update: (dt) => {
      // A subtle bob when moving; a slow breathe when idle.
      t += dt * (key === 'run' ? 14 : key === 'walk' ? 9 : 2);
      inner.position.y = key === 'idle' ? Math.sin(t) * 0.01 : Math.abs(Math.sin(t)) * 0.06;
    },
    animated: false,
  };
}
