/**
 * @file world/frames.js
 * @responsibility The photographs on their walls. Real pictures from "Our
 * Story" (public/photos/*.jpg) hung as framed prints inside the home, plus a
 * painted sign of their motto and the verse over the door — the first thing he
 * sees when the game opens is the two of them on the wall. Purely visual: no
 * colliders, nothing moves. A missing photo just leaves the frame off.
 *
 * Text signs are canvas textures (no font files, no external CSS): the game's
 * gold-on-ink look, rendered once at boot.
 *
 * @phase Ship pass (personalisation).
 */

import * as THREE from 'three';

const BASE = import.meta.env.BASE_URL;
const loader = new THREE.TextureLoader();

function loadPhoto(name) {
  return new Promise((res) => {
    loader.load(`${BASE}photos/${name}`, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; res(t); }, undefined, () => res(null));
  });
}

/**
 * A framed print: dark frame, cream mount, the photo inset. `w` is the frame's
 * outer width in metres; height follows the photo's aspect.
 * @param {THREE.Texture} tex
 */
function makeFrame(tex, w) {
  const img = tex.image;
  const aspect = img && img.width ? img.height / img.width : 0.7;
  const h = w * aspect;
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), new THREE.MeshLambertMaterial({ color: 0x2a2320, flatShading: true }));
  frame.castShadow = true;
  g.add(frame);
  const mount = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.92, h * 0.9), new THREE.MeshLambertMaterial({ color: 0xece6d6 }));
  mount.position.z = 0.027;
  g.add(mount);
  const photo = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.84, h * 0.8), new THREE.MeshBasicMaterial({ map: tex }));
  photo.position.z = 0.03;
  g.add(photo);
  return g;
}

/**
 * A wall sign painted onto a canvas: big condensed headline, optional small line.
 * @param {string} title @param {string} [sub] @param {number} [w] metres
 */
function makeSign(title, sub, w = 2.4, opts = {}) {
  const cw = 1024, ch = sub ? 384 : 256;
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const x = cv.getContext('2d');
  x.fillStyle = opts.bg ?? '#141216';
  x.fillRect(0, 0, cw, ch);
  x.strokeStyle = 'rgba(240,168,40,.55)';
  x.lineWidth = 6;
  x.strokeRect(14, 14, cw - 28, ch - 28);
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = opts.fg ?? '#f0a828';
  x.font = `800 ${opts.size ?? 96}px 'Arial Narrow','Roboto Condensed','Oswald',system-ui,sans-serif`;
  x.fillText(title.toUpperCase(), cw / 2, sub ? ch * 0.38 : ch / 2, cw - 80);
  if (sub) {
    x.fillStyle = '#ece6d6';
    x.font = `italic 500 ${opts.subSize ?? 40}px Georgia,'Times New Roman',serif`;
    x.fillText(sub, cw / 2, ch * 0.74, cw - 100);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const h = w * (ch / cw);
  const g = new THREE.Group();
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.04), new THREE.MeshLambertMaterial({ color: 0x1a1618, flatShading: true }));
  g.add(board);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  face.position.z = 0.021;
  g.add(face);
  return g;
}

/**
 * Hang the photos and signs. Positions are room-relative; each room here is an
 * 18 m box with walls at ±9 and the door in the −Z wall.
 * @param {THREE.Scene} scene
 * @param {ReturnType<import('./shops.js').createShops>} shops
 * @param {{motto: string, verse: string}} words
 */
export async function hangFrames(scene, shops, words) {
  const group = new THREE.Group();
  scene.add(group);
  const H = shops.home;
  const C = shops.coffee;
  const WALL = 9 - 0.2 - 0.03; // just proud of the inner wall face

  /** Place an object flat on a wall of `room`. side: 'N'|'E'|'W' */
  const onWall = (obj, room, side, along, y) => {
    const cx = room.pos.x, cz = room.pos.z, fy = room.floorY;
    if (side === 'N') { obj.position.set(cx + along, fy + y, cz + WALL); obj.rotation.y = Math.PI; }
    else if (side === 'E') { obj.position.set(cx + WALL, fy + y, cz + along); obj.rotation.y = -Math.PI / 2; }
    else if (side === 'W') { obj.position.set(cx - WALL, fy + y, cz + along); obj.rotation.y = Math.PI / 2; }
    group.add(obj);
  };

  const [wedding, proposal, hug, ayah, ayahPup, poster, murphys] = await Promise.all(
    ['wedding.jpg', 'proposal.jpg', 'wedding-hug.jpg', 'ayah.jpg', 'ayah-puppy.jpg', 'poster.jpg', 'murphys.jpg'].map(loadPhoto),
  );

  // HOME — the gallery wall over the sofa (north), the wedding above the bed
  // (east), and the poster + motto by the mirror (west).
  if (wedding) onWall(makeFrame(wedding, 2.6), H, 'E', 3.0, 2.3);        // over the headboard
  if (hug) onWall(makeFrame(hug, 0.9), H, 'E', 0.6, 2.2);
  if (proposal) onWall(makeFrame(proposal, 1.9), H, 'N', 2.2, 2.2);      // over the sofa wall
  if (ayah) onWall(makeFrame(ayah, 1.6), H, 'N', 5.2, 2.15);
  if (ayahPup) onWall(makeFrame(ayahPup, 0.7), H, 'N', 7.2, 2.05);
  if (poster) onWall(makeFrame(poster, 1.3), H, 'W', 2.6, 2.1);          // her poster, framed
  onWall(makeSign(words.motto, null, 2.6, { size: 88 }), H, 'W', -1.0, 2.9); // above the mirror
  onWall(makeSign('As for me and my house', words.verse, 3.2, { size: 72, subSize: 44 }), H, 'N', -3.0, 3.1); // over the wardrobe

  // MURPHY'S — the sign above the bar, and the "where it started" photo.
  onWall(makeSign("Murphy's", 'Pub & Grill · Lambton, Germiston · est. before you two', 3.6, { size: 110, subSize: 40, bg: '#1d1410', fg: '#e0a458' }), C, 'N', 0, 2.8);
  if (murphys) onWall(makeFrame(murphys, 1.6), C, 'E', -3.5, 2.1);
  if (hug) onWall(makeFrame(hug, 0.8), C, 'W', 2.5, 2.1); // the regulars' wall

  return group;
}
