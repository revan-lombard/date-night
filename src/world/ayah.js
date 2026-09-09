/**
 * @file world/ayah.js
 * @responsibility Ayah. The story's companion (2020) — "some companions leave
 * before we're ready; their place in the story remains." The closing page of
 * "Our Story" shows her beside the couple wearing a halo, so the game does the
 * same: a low-poly black dog sitting by the door at Murphy's, halo gently
 * bobbing, tail going — waiting at the anniversary like she never left.
 *
 * Same box-and-Lambert idiom as the bushveld animals. The halo is emissive
 * (no extra light — lights added mid-game force shader recompiles).
 *
 * @phase Added in the audit pass, at the couple's request.
 */

import * as THREE from 'three';

const flat = (color) => new THREE.MeshLambertMaterial({ color, flatShading: true });

/**
 * @param {THREE.Scene} scene
 * @param {number} x @param {number} y ground height @param {number} z
 * @param {number} heading which way she faces
 */
export function createAyah(scene, x, y, z, heading = 0) {
  const coat = flat(0x17181c); // near-black, same family as the E30
  const group = new THREE.Group();

  const add = (w, h, d, px, py, pz, mat = coat, rx = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(px, py, pz);
    m.rotation.x = rx;
    m.castShadow = true;
    group.add(m);
    return m;
  };

  // Sitting pose: haunches down, chest upright, head high — a good girl.
  add(0.38, 0.30, 0.36, 0, 0.16, -0.12);          // haunches
  add(0.30, 0.46, 0.30, 0, 0.42, 0.05, coat, -0.16); // chest, leaning up
  for (const sx of [-1, 1]) add(0.08, 0.38, 0.08, sx * 0.10, 0.19, 0.17); // front legs
  add(0.24, 0.22, 0.26, 0, 0.74, 0.12);           // head
  add(0.12, 0.10, 0.16, 0, 0.69, 0.29);           // snout
  for (const sx of [-1, 1]) add(0.07, 0.14, 0.05, sx * 0.10, 0.86, 0.08); // soft ears

  // Collar — her actual one from the photos: a silver chain with the round
  // "AYAH" tag hanging at her chest.
  const silver = flat(0xc9ccd2);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.018, 6, 18), silver);
  collar.rotation.x = Math.PI / 2 - 0.16;
  collar.position.set(0, 0.60, 0.09);
  group.add(collar);
  const tag = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.008, 12), silver);
  tag.rotation.x = Math.PI / 2 - 0.16;
  tag.position.set(0, 0.54, 0.235);
  group.add(tag);
  // White patch on her chest — she had one.
  const patch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.02), flat(0xe8e2d4));
  patch.position.set(0, 0.36, 0.205);
  patch.rotation.x = -0.16;
  group.add(patch);

  // Tail, pivoted at the haunches so it can wag.
  const tailPivot = new THREE.Group();
  tailPivot.position.set(0, 0.14, -0.30);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.30), coat);
  tail.position.z = -0.13;
  tail.castShadow = true;
  tailPivot.add(tail);
  group.add(tailPivot);

  // The halo. Emissive gold, floating just above her ears.
  const haloSpin = new THREE.Group();
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.17, 0.022, 8, 28),
    new THREE.MeshLambertMaterial({
      color: 0xffe6a8,
      emissive: 0xffc24d,
      emissiveIntensity: 1.5,
    }),
  );
  halo.rotation.x = Math.PI / 2;
  haloSpin.add(halo);
  haloSpin.position.set(0, 1.04, 0.10);
  group.add(haloSpin);

  group.position.set(x, y, z);
  group.rotation.y = heading;
  scene.add(group);

  let t = Math.PI; // desync from other idle animations
  return {
    group,
    update(dt) {
      t += dt;
      tailPivot.rotation.y = Math.sin(t * 3.1) * 0.38;        // happy, unhurried
      haloSpin.position.y = 1.04 + Math.sin(t * 1.5) * 0.025; // gentle float
      haloSpin.rotation.y += dt * 0.45;                        // slow shimmer
    },
  };
}
