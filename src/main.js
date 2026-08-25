/**
 * @file main.js
 * @responsibility Boot the canvas, build the scene, and run the fixed-timestep
 * loop across two modes: ON FOOT (walk the player to the car) and DRIVING.
 * Press F near the car to get in, F again (when stopped) to get out — the
 * chase and follow cameras hand off smoothly. Phase 1.5 layer on a flat ground;
 * the city, mission and date scene arrive in later phases.
 */

import * as THREE from 'three';
import Stats from 'stats.js';
import GUI from 'lil-gui';

import { createLoop } from './core/loop.js';
import { createAudio } from './core/audio.js';
import { loadSave, updateSave } from './core/save.js';
import { readInput, readMenu } from './core/input.js';
import { createMouseLook } from './core/mouselook.js';
import { createBus } from './core/bus.js';
import { loadCharacter, tryLoadCar, tryLoadPartner, tryLoadAnimations } from './core/assets.js';
import { createTerrain, terrainHeight, terrainNormal } from './world/terrain.js';
import { createCity } from './world/city.js';
import { createBushveld } from './world/bushveld.js';
import { createStreetFurniture } from './world/streetfurniture.js';
import { createShops, makeBouquet, FLOWER_BLOCK, COFFEE_BLOCK } from './world/shops.js';
import { blockCentre, BLOCK } from './world/layout.js';
import { loadCityKit, placeCityBuildings } from './world/cityKit.js';
import { createParkedCars } from './world/parkedcars.js';
import { createCollision } from './world/collision.js';
import { createVehicle, DEFAULT_HANDLING } from './car/vehicle.js';
import { createSkidMarks } from './car/skids.js';
import { createChaseCamera, DEFAULT_CHASE } from './car/camera.js';
import { createCharacter, createFallbackCharacter } from './player/character.js';
import { createPlayer } from './player/player.js';
import { createWaypoint } from './mission/waypoint.js';
import { createRoute } from './mission/route.js';
import { createTimer } from './mission/timer.js';
import { createDirector } from './mission/director.js';
import { createHUD } from './ui/hud.js';
import { createPhone } from './ui/phone.js';
import { createMenu } from './ui/menu.js';
import { createPickPanel } from './ui/pickpanel.js';
import { createDateUI } from './ui/choices.js';
import { createDateScene } from './date/scene.js';
import { createDialogue } from './date/dialogue.js';
import { createLoveMeter } from './date/meter.js';
import { NODES, START } from './content/dialogue.js';
import { CAR, PEOPLE, PLACES, CALL, FLORIST, PLAYER_HEIGHT, CHARACTERS, ENDINGS, DATE_OPENERS } from './content/personal.js';

const ENTER_DIST = 3.8; // metres — how close on foot to enter the car
const EXIT_MAX_SPEED = 2; // m/s — must be nearly stopped to get out

// --- Renderer -------------------------------------------------------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

// --- Scene + camera -------------------------------------------------------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2000);
camera.position.set(0, 4, -9);

// --- Gradient sky ---------------------------------------------------------
const TOP = new THREE.Color(0x2a3a6b);
const BOTTOM = new THREE.Color(0xd98a6a);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    topColor: { value: TOP }, bottomColor: { value: BOTTOM },
    offset: { value: 120.0 }, exponent: { value: 0.7 },
  },
  vertexShader: /* glsl */ `
    varying vec3 vWorldPosition;
    void main() {
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, pow(max(h, 0.0), exponent)), 1.0);
    }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), skyMat));
scene.fog = new THREE.Fog(BOTTOM.clone().lerp(TOP, 0.4).getHex(), 120, 700);

// --- Lighting -------------------------------------------------------------
const sun = new THREE.DirectionalLight(0xffd9b3, 2.2);
sun.position.set(60, 45, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1; sun.shadow.camera.far = 250;
sun.shadow.camera.left = -80; sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xbfd0ff, 0x4a3a2a, 0.6));
const sunTarget = new THREE.Object3D();
scene.add(sunTarget);
sun.target = sunTarget;

// --- World: rolling terrain + procedural city + collision -----------------
createTerrain(scene);
const city = createCity(scene);
createStreetFurniture(scene); // sidewalk kerbs, lamp posts, traffic lights
const bushveld = createBushveld(scene);
const shops = createShops(scene); // walkable florist + coffee shop

// The florist and coffee-shop blocks are handed to the story buildings, so keep
// generated buildings/colliders off them.
const shopCentres = [blockCentre(FLOWER_BLOCK.ix, FLOWER_BLOCK.iz), blockCentre(COFFEE_BLOCK.ix, COFFEE_BLOCK.iz)];
const onShopBlock = (lot) => shopCentres.some((c) => Math.abs(lot.x - c.x) < BLOCK / 2 + 2 && Math.abs(lot.z - c.z) < BLOCK / 2 + 2);

// Kerb-side parked cars — keep the spawn, the hero car and both mission stops clear.
const parked = createParkedCars(scene, terrainHeight, {
  avoid: [
    { x: 0, z: 0, r: 14 }, // spawn intersection + the E30
    { x: shops.flower.door.x, z: shops.flower.door.z, r: 18 },
    { x: shops.coffee.door.x, z: shops.coffee.door.z, r: 18 },
  ],
});

let collision = createCollision(city.colliders.filter((c) => !onShopBlock({ x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2 })).concat(shops.colliders, parked.colliders));
/** Facade the car + player use to follow ground and bump off buildings.
 *  `collide` reads `collision` by reference so it picks up the kit rebuild. */
const world = {
  height: (x, z) => terrainHeight(x, z),
  normal: (x, z, out) => terrainNormal(x, z, out),
  collide: (x, z, r) => collision.resolveCircle(x, z, r),
};

// Mission stops: the florist first, then the coffee shop (the venue).
const FLORIST_STOP = { x: shops.flower.door.x, z: shops.flower.door.z, y: terrainHeight(shops.flower.door.x, shops.flower.door.z) };
const VENUE = { x: shops.coffee.door.x, z: shops.coffee.door.z, y: terrainHeight(shops.coffee.door.x, shops.coffee.door.z) };
const waypoint = createWaypoint(scene, FLORIST_STOP, FLORIST_STOP.y); // director retargets florist -> coffee
const route = createRoute(scene, FLORIST_STOP);
route.setVisible(false);

// --- Car + cameras --------------------------------------------------------
const handling = { ...DEFAULT_HANDLING };
// GTA-V-style chase: close behind, low, wide-ish FOV, snappy follow.
const chaseParams = { ...DEFAULT_CHASE, distance: 6.6, height: 2.5, lookAhead: 0.32, lookHeight: 1.35, stiffness: 11, baseFov: 70, maxFov: 82 };
// Over-the-shoulder follow for the on-foot player.
const personParams = { ...DEFAULT_CHASE, distance: 4.4, height: 2.1, lookAhead: 0, lookHeight: 1.5, stiffness: 12, baseFov: 62, maxFov: 62 };
if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  chaseParams.reduceMotion = true;
  personParams.reduceMotion = true;
}

const carCam = createChaseCamera(camera, handling, chaseParams);
const personCam = createChaseCamera(camera, { maxSpeed: 1 }, personParams);
const vehicle = createVehicle(scene, CAR, handling, {
  world,
  onImpact: (mag) => carCam.addShake(mag),
});
const skids = createSkidMarks(scene);

// --- Mouse-look (click canvas to lock pointer) ----------------------------
const mouse = createMouseLook(renderer.domElement);

// --- Mode + player (player is created after the model loads) --------------
let mode = 'onfoot'; // 'onfoot' | 'driving'
let player = null;

// --- Audio (§9) — synthesised soundscape, unlocked on the first gesture ----
const audio = createAudio();
let hornWasDown = false;
function playHorn() { audio.horn(); }
// Any first real interaction unlocks the context (browsers block autoplay).
for (const ev of ['pointerdown', 'keydown']) {
  window.addEventListener(ev, () => audio.unlock(), { once: true, passive: true });
}

// --- "Best on desktop" notice (§ Phase 7) — no touch controls shipped ------
if (window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(pointer: fine)').matches) {
  const note = document.createElement('div');
  note.textContent = 'Made for desktop — best played with a keyboard ♥';
  note.style.cssText =
    'position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:120;' +
    'padding:10px 18px;background:rgba(12,12,16,.92);color:#fff;border-left:3px solid #f0a828;' +
    'font:600 14px system-ui,sans-serif;max-width:92vw;text-align:center;';
  note.addEventListener('click', () => note.remove());
  document.body.appendChild(note);
}

// --- Enter / exit ---------------------------------------------------------
function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

/** Lerp between two angles along the shortest arc. */
function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function enterCar() {
  if (mode !== 'onfoot' || !player) return;
  if (dist2(player.getState(), vehicle.getState()) > ENTER_DIST) return;
  mode = 'driving';
  player.setVisible(false);
  mouse.yaw = vehicle.getState().heading; // camera starts behind the car
  carCam.adopt(camera.position); // spring smoothly from where we are
}

function exitCar() {
  if (mode !== 'driving' || !player) return;
  if (Math.abs(vehicle.getSpeed()) > EXIT_MAX_SPEED) return;
  const c = vehicle.getState();
  // Step out to the car's left side, facing the way the car faces.
  const leftX = -Math.cos(c.heading);
  const leftZ = Math.sin(c.heading);
  player.place(c.x + leftX * 2.4, c.z + leftZ * 2.4, c.heading);
  player.setVisible(true);
  mode = 'onfoot';
  mouse.yaw = c.heading; // camera behind the player as they step out
  personCam.adopt(camera.position);
}

// Enter/exit the car is edge-detected off input.enter (KeyF or gamepad Y) in
// the update loop, so keyboard and controller share one code path.
let enterWasDown = false;
let lastLook = { x: 0, y: 0 };

// --- HUD + stats ----------------------------------------------------------
const hud = createHUD(city.minimap);

// --- Mission spine (director created in init once the player exists) -------
const bus = createBus();
const timer = createTimer(120);
const phone = createPhone();
let director = null;

// Errand economy.
const FLOWER_COST = FLORIST.cost;
let money = 500;
let hasFlowers = false;
let rightFlowers = false; // did he pick her favourite? (used at the date, Phase 4)
let bouquet = null;       // procedural bouquet attached to the avatar when carrying
const pickPanel = createPickPanel();

/** Position of whatever the player currently controls (for arrival + radar). */
function activeXZ() {
  return mode === 'driving' ? vehicle.getState() : (player ? player.getState() : { x: 0, z: 0 });
}

const isDriving = () => director?.act === 'TO_FLORIST' || director?.act === 'TO_VENUE';

// --- Skip-drive (§11): someone's dad may be playing this -------------------
const SKIP_AFTER = 240; // seconds behind the wheel before the offer appears
let driveSeconds = 0;
const skipOffered = () => driveSeconds > SKIP_AFTER;
window.addEventListener('keydown', (e) => {
  if (e.code !== 'KeyK' || !skipOffered() || mode !== 'driving' || !isDriving()) return;
  const p = waypoint.position; // pop the car at the current stop — arrival fires next tick
  vehicle.reset(p.x - 5, p.z - 5, Math.atan2(5, 5));
  carCam.snap();
});
const inBounds = (p, b) => p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;

/** True when on foot at the florist counter (objective active), flowers unbought. */
function canPickFlowers() {
  if (mode !== 'onfoot' || hasFlowers || director?.act !== 'AT_FLORIST' || !player || pickPanel.isOpen) return false;
  const p = player.getState();
  return Math.hypot(p.x - shops.flower.counter.x, p.z - shops.flower.counter.z) < 3.2;
}
function openFlowerPick() {
  const opts = FLORIST.options.map((o) => ({ label: `${o.name} — R${FLOWER_COST}`, color: o.color }));
  pickPanel.open(`Pick a bouquet for ${PEOPLE.partner.name}`, opts, chooseBouquet);
}
function chooseBouquet(i) {
  const opt = FLORIST.options[i];
  if (!opt || money < FLOWER_COST) return;
  money -= FLOWER_COST;
  hasFlowers = true;
  rightFlowers = opt.name === FLORIST.favourite;
  // The carried bouquet, in the chosen colour, attached to the avatar's hand.
  bouquet = makeBouquet(opt.color);
  bouquet.position.set(0.26, 1.0, 0.28);
  if (carryParent) carryParent.add(bouquet);
  hud.setWallet(money);
  hud.setFlowers(true);
  shops.flower.highlight.visible = false;
  director.flowersBought();
}
let carryParent = null; // the avatar group the bouquet attaches to
let partnerAvatar = null; // Simone at the venue (only if public/models/partner.glb exists)
let avatar = null;        // Jonathan's character (module-scoped so the date can stage him)

// --- Phase 4: the date -----------------------------------------------------
const dateScene = createDateScene(scene, camera);
const dateUI = createDateUI();
let loveMeter = null;
let dialogue = null;
let dateActive = false;
let dateEnded = false;
let dateCountdown = 0; // seconds of arrival banner before the date begins

/** Present one dialogue node: her line, then his three choices. */
function presentNode(node, choices) {
  dateScene.setMood(node.mood ?? loveMeter.mood());
  dateScene.setShot('partner');
  dateUI.say(PEOPLE.partner.name.toUpperCase(), node.line, () => {
    dateScene.setShot('choices');
    dateUI.offer(choices.map((c) => c.text), (i) => {
      const c = choices[i];
      audio.blip();
      dateUI.meterTick(loveMeter.add(c.love), c.love);
      if (c.love) audio.meterTick(c.love > 0);
      dialogue.pick(c);
    });
  });
}

/** ARRIVE banner has played out — sit down and start the conversation. */
function startDate() {
  if (dateActive || !avatar) return;
  dateActive = true;
  hud.setBanner(null);
  hud.setPrompt(null);
  if (mode === 'driving') { mode = 'onfoot'; player?.setVisible(true); }
  // Simone: her photo avatar if provided, else a charming stand-in in her dress.
  if (!partnerAvatar) {
    partnerAvatar = createFallbackCharacter(PEOPLE.partner.dress);
    partnerAvatar.setState('idle');
    scene.add(partnerAvatar.group);
  }
  const T = shops.coffee.seat;
  player?.place(T.x + 1.55, T.z, -Math.PI / 2); // keep the logical pose in sync
  dateScene.begin({ jon: avatar, sim: partnerAvatar, table: T, floorY: shops.coffee.floorY });

  loveMeter = createLoveMeter();
  loveMeter.start({ lateness: director.lateness, hasFlowers, rightFlowers });
  dateUI.show();
  dateUI.meterSet(loveMeter.value);

  audio.dateMusic(true); // the warm loop carries the whole dinner
  dialogue = createDialogue({ nodes: NODES, start: START, onNode: presentNode, onEnd: endDate });
  const opener = !hasFlowers ? DATE_OPENERS.flowersNone
    : rightFlowers ? DATE_OPENERS.flowersRight : DATE_OPENERS.flowersWrong;
  dateUI.say(PEOPLE.partner.name.toUpperCase(), opener, () => dialogue.begin());
}

/** The conversation is done — show the ending her score earned. */
function endDate() {
  const tier = loveMeter.tier();
  const end = ENDINGS[tier];
  dateScene.setMood(tier === 'okay' ? 'neutral' : 'warm');
  dateScene.setShot('choices'); // linger on the two-shot behind the card
  // Best score across playthroughs (Phase 5).
  const prevBest = loadSave().bestLove ?? -1;
  const isBest = loveMeter.value > prevBest;
  if (isBest) updateSave({ bestLove: loveMeter.value });
  const scoreLine = `♥ ${loveMeter.value}%` +
    (isBest && prevBest >= 0 ? ' · new best!' : prevBest >= 0 ? ` · best ${prevBest}%` : '');
  const f = hud.fonts;
  dateUI.card(
    `<div style="font:700 13px ${f.cond};letter-spacing:.28em;color:${f.gold};text-transform:uppercase">17 September 2026 · Ten Years</div>` +
    `<div style="font:800 30px ${f.cond};letter-spacing:.04em;text-transform:uppercase;margin:8px 0 12px">${end.title}</div>` +
    `<div style="font:500 16px/1.6 ${f.body};max-width:560px;margin:0 auto">${end.message}</div>` +
    `<div style="font:700 14px ${f.cond};letter-spacing:.2em;color:#ff5c8a;margin-top:14px">${scoreLine}</div>` +
    `<div style="font:600 12px ${f.body};opacity:.5;margin-top:10px">(or press R)</div>`,
    () => location.reload(),
  );
  dateEnded = true;
}
window.addEventListener('keydown', (e) => { if (dateEnded && e.code === 'KeyR') location.reload(); });

bus.on('act', (a) => {
  if (a === 'CALL' || a === 'CALLBACK') { hud.setMission('Answer your phone'); hud.setLocation('LAMBTON, GERMISTON'); }
  else if (a === 'TO_FLORIST') { hud.setMission('Drive to the florist'); hud.setLocation('GERMISTON'); route.setTarget(FLORIST_STOP); shops.flower.highlight.visible = false; }
  else if (a === 'AT_FLORIST') { hud.setMission(`Buy ${PEOPLE.partner.name}'s favourite flowers`); hud.setLocation('THE FLORIST'); shops.flower.highlight.visible = true; }
  else if (a === 'TO_VENUE') { hud.setMission(`Get to ${PLACES.venue}`); hud.setLocation('GERMISTON'); route.setTarget(VENUE); shops.flower.highlight.visible = false; }
  if (a === 'ARRIVE') {
    const late = director.lateness;
    const jab = late < 0.15 ? 'Right on time. Who are you and what have you done with him?'
      : late < 0.55 ? 'A little late, but you made it.'
        : 'Twenty minutes. A personal best.';
    hud.setObjective(null);
    hud.setArrow(null);
    hud.setMission(null);
    hud.setLocation(PLACES.venue.toUpperCase());
    const f = hud.fonts;
    hud.setBanner(
      `<div style="font:700 13px ${f.cond};letter-spacing:.28em;color:${f.gold};text-transform:uppercase">Mission 01 · The Beginning</div>` +
      `<div style="font:800 34px ${f.cond};letter-spacing:.04em;text-transform:uppercase;margin:6px 0 2px">You made it</div>` +
      `<div style="font:700 16px ${f.cond};letter-spacing:.14em;color:${f.gold};text-transform:uppercase">${PLACES.venue}</div>` +
      `<div style="font:500 15px ${f.body};opacity:.85;margin-top:10px">"${jab}"</div>` +
      `<div style="font:500 12px ${f.body};opacity:.5;margin-top:8px">She's at the back table…</div>`,
    );
    dateCountdown = 3.2; // linger on the card, then sit down
  }
});

// --- Menu, settings, pause ------------------------------------------------
let gameStarted = false;
let masterVolume = 0.8;
let muted = false;

/** Apply settings live from the menu (and once at boot). */
function applySettings(s) {
  chaseParams.reduceMotion = !!s.reduceMotion;
  personParams.reduceMotion = !!s.reduceMotion;
  mouse.setInvertY(s.invertY);
  mouse.setSensitivity(s.mouseSensitivity ?? 1);
  masterVolume = (s.masterVolume ?? 80) / 100;
  muted = !!s.muted;
  audio.setVolume(masterVolume);
  audio.setMuted(muted);
}

const menu = createMenu({
  onStart: () => {
    gameStarted = true; menu.hide();
    hud.setMission('Get in your car');
    hud.setLocation('LAMBTON, GERMISTON · 2016');
    hud.setWallet(money); hud.setFlowers(false);
  },
  onSettingsChange: applySettings,
  onQuit: () => location.reload(), // simplest reliable "quit to title"
  version: '0.4',
});
applySettings(menu.getSettings());

function togglePause() {
  if (!gameStarted || menu.isOpen || pickPanel.isOpen || director?.act === 'ARRIVE') return;
  // During a call, Esc is "decline" (the phone owns it), not pause.
  if (director?.act === 'CALL' || director?.act === 'CALLBACK') return;
  menu.showPause();
  readMenu(); // prime edge-state so the still-held Esc/Start doesn't instantly resume
}
window.addEventListener('keydown', (e) => { if (e.code === 'Escape') togglePause(); });

let startWasDown = false;
function pollPauseButton() {
  const pads = navigator.getGamepads?.();
  const gp = pads ? [...pads].find(Boolean) : null;
  const down = !!gp?.buttons?.[9]?.pressed;
  if (down && !startWasDown && !menu.isOpen) togglePause();
  startWasDown = down;
}

const stats = new Stats();
stats.showPanel(0);
document.getElementById('stats-container').appendChild(stats.dom);
stats.dom.style.position = 'static';

buildDevPanel();

// --- Resize ---------------------------------------------------------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Boot: load the character, place the player beside the car, then run ---
async function init() {
  // Shared locomotion pack (idle/walk/run/jump) for photo-avatars that export
  // without their own clips. One pack drives both Jonathan and Simone.
  const animPack = await tryLoadAnimations();
  const animClips = animPack?.animations || [];

  // Player = Jonathan (rigged, animated), with a procedural fallback on failure.
  try {
    const gltf = await loadCharacter();
    avatar = createCharacter(gltf, {
      targetHeight: PLAYER_HEIGHT,
      modelYaw: CHARACTERS.player.modelYaw,
      skinShirt: PEOPLE.player.shirt,
      extraClips: animClips,
    });
  } catch (err) {
    console.warn('[assets] character model failed to load, using fallback', err);
    avatar = createFallbackCharacter(PEOPLE.player.shirt);
  }
  player = createPlayer(scene, avatar, { world });

  // Spawn beside the car, facing it, so the opening frames read as "walk to it".
  const c = vehicle.getState();
  const spawnX = c.x - 2.6, spawnZ = c.z + 0.5;
  const faceCar = Math.atan2(c.x - spawnX, c.z - spawnZ);
  player.place(spawnX, spawnZ, faceCar);
  mouse.yaw = faceCar; // camera starts behind the player, looking at the car

  // Optional hero car model (drop public/models/car.glb in to enable).
  const carGltf = await tryLoadCar();
  if (carGltf) swapInCarModel(carGltf);

  // Partner = Simone, waiting at the date venue. Only spawned if her photo-built
  // GLB is present (public/models/partner.glb); otherwise the venue is empty
  // until the date scene provides a stand-in. She stands at the table, facing
  // the door so she "looks up" when Jonathan arrives.
  const partnerGltf = await tryLoadPartner();
  if (partnerGltf) {
    partnerAvatar = createCharacter(partnerGltf, {
      targetHeight: PLAYER_HEIGHT * 0.94, // a touch shorter than Jonathan
      modelYaw: CHARACTERS.partner.modelYaw,
      skinShirt: PEOPLE.partner.dress,
      extraClips: animClips,
    });
    const seat = shops.coffee.seat;
    const sy = terrainHeight(seat.x, seat.z);
    const faceDoor = Math.atan2(shops.coffee.door.x - seat.x, shops.coffee.door.z - seat.z);
    partnerAvatar.group.position.set(seat.x, sy, seat.z);
    partnerAvatar.group.rotation.y = faceDoor;
    partnerAvatar.setState('idle');
    scene.add(partnerAvatar.group);
  }

  // Swap the procedural boxes for the CC0 Kenney city models (grid unchanged).
  const kit = await loadCityKit();
  if (kit) {
    city.buildings.visible = false;
    const placed = placeCityBuildings(scene, city.minimap.blocks, kit, terrainHeight, onShopBlock);
    // Rebuild collision: kit buildings + the shop walls (removes invisible walls).
    collision = createCollision(placed.colliders.concat(shops.colliders, parked.colliders));
  }

  // Mission director: SPAWN → CALL → DRIVE → ARRIVE.
  director = createDirector({
    phone, waypoint, timer, bus,
    call: { caller: PEOPLE.partner.name, lines: CALL.lines, declineLines: CALL.declineLines },
    getPose: activeXZ,
    stops: { florist: FLORIST_STOP, coffee: VENUE },
  });

  carryParent = avatar.group; // the bouquet attaches here once bought

  hud.setVisible(false); // kept hidden behind the title until the game starts
  menu.showTitle(); // present the start menu over the live dusk scene
  loop.start();
}

// --- Loop -----------------------------------------------------------------
let lastRender = performance.now();

function stepUpdate(dt, input) {
  lastLook = input.look || lastLook;
  pickPanel.update(); // controller nav for the bouquet picker
  const frozen = director?.act === 'ARRIVE' || menu?.isOpen || pickPanel.isOpen;
  if (!frozen) {
    // F rising edge: choose flowers at the counter, else get in / out of the car.
    if (input.enter && !enterWasDown) {
      if (canPickFlowers()) openFlowerPick();
      else (mode === 'onfoot' ? enterCar : exitCar)();
    }
    if (mode === 'driving') {
      vehicle.update(dt, input);
      const skid = vehicle.getSkidInfo();
      skids.drop(skid); // lays rubber only while sliding
      audio.engine(Math.abs(vehicle.getSpeed()) / handling.maxSpeed, Math.max(0, input.throttle), dt);
      audio.setScreech(skid.sliding);
      if (input.horn && !hornWasDown) playHorn();
      hornWasDown = input.horn;
    } else if (player) {
      player.update(dt, input, mouse.yaw);
      hornWasDown = false;
    }
  }
  if (mode !== 'driving') { audio.engineOff(); audio.setScreech(false); }
  if (mode === 'driving' && isDriving() && !menu.isOpen) driveSeconds += dt; // fuels the skip-drive offer
  // Ringtone while she's calling; night hum once the game is running.
  audio.ring((director?.act === 'CALL' || director?.act === 'CALLBACK') && phone.state === 'ringing');
  audio.ambience(gameStarted && !menu.isOpen);
  enterWasDown = input.enter;
  // Arrival banner → the date, after a beat.
  if (director?.act === 'ARRIVE' && !dateActive && !menu.isOpen) {
    dateCountdown -= dt;
    if (dateCountdown <= 0) startDate();
  }
  if (dateActive) avatar?.update(dt); // Jonathan's idle keeps breathing at the table
  bushveld.update(dt); // animals wander even behind the menu — a living backdrop
  partnerAvatar?.update(dt); // Simone's idle plays whenever she's in the scene
  // Don't advance the story while the menu/pause screen is up (no call behind
  // the title, no timer ticking while paused).
  if (director && !menu.isOpen) director.update(dt);
}

function stepRender(alpha, frameDt) {
  hud.setVisible(gameStarted && !menu.isOpen && !dateActive); // no HUD behind menus or the dinner
  mouse.applyStick(lastLook.x, lastLook.y, frameDt); // right-stick free-look
  pollPauseButton();
  if (dateActive) { // the date owns the camera and the frame
    dateScene.update(frameDt);
    dateUI.tick(frameDt);
    renderer.render(scene, camera);
    return;
  }
  const carState = vehicle.getState();
  heroLights?.update(vehicle.getSignals());
  skids.update(frameDt);
  if (mode === 'driving') {
    const pose = vehicle.render(alpha);
    // Free-look with the mouse; the camera eases back behind the car while moving.
    if (Math.abs(vehicle.getSpeed()) > 2.5) {
      mouse.yaw = lerpAngle(mouse.yaw, pose.heading, 1 - Math.exp(-2.2 * frameDt));
    }
    carCam.update(pose, frameDt, mouse.yaw, mouse.pitch);
    sunTarget.position.set(pose.x, pose.y || 0, pose.z);
    hud.setSpeed(Math.abs(vehicle.getSpeed()) * 3.6, true);
    hud.setPrompt(
      Math.abs(vehicle.getSpeed()) <= EXIT_MAX_SPEED ? 'F|get out'
        : skipOffered() && isDriving() ? 'K|skip the drive' : null,
    );
    hud.updateRadar({ x: pose.x, z: pose.z, heading: pose.heading }, waypointBlips());
  } else if (player) {
    vehicle.render(1); // keep the parked car's mesh in sync
    const pose = player.render(alpha);
    // Inside a shop (open-top room): tip the camera down a little so the walls
    // don't clip — but keep it a gentle over-the-shoulder, not top-down.
    const inside = inBounds(pose, shops.flower.bounds) || inBounds(pose, shops.coffee.bounds);
    personCam.update(pose, frameDt, mouse.yaw, inside ? Math.max(mouse.pitch, 0.5) : mouse.pitch);
    sunTarget.position.set(pose.x, pose.y || 0, pose.z);
    hud.setSpeed(0, false);
    if (canPickFlowers()) hud.setPrompt('F|choose the flowers');
    else hud.setPrompt(dist2(pose, carState) <= ENTER_DIST ? `F|get in ${CAR.label}` : null);
    hud.updateRadar(
      { x: pose.x, z: pose.z, heading: pose.heading },
      [{ x: carState.x, z: carState.z, kind: 'car' }, ...waypointBlips()],
    );
  }

  // Objective HUD: timer always while on the errand; route/arrow only on a leg.
  if (isDriving()) {
    const p = activeXZ();
    hud.setObjective({ remaining: timer.remaining, lateness: timer.lateness, distance: waypoint.distanceTo(p.x, p.z) });
    hud.setArrow(waypoint.screenArrow(camera, window.innerWidth, window.innerHeight));
    route.update(p);
    route.setVisible(true);
    hud.setRoute(route.points);
  } else if (director?.act === 'AT_FLORIST') {
    hud.setObjective({ remaining: timer.remaining, lateness: timer.lateness, distance: null });
    hud.setArrow(null);
    route.setVisible(false);
    hud.setRoute(null);
  } else if (director?.act !== 'ARRIVE') {
    hud.setObjective(null);
    hud.setArrow(null);
    route.setVisible(false);
    hud.setRoute(null);
  }

  renderer.render(scene, camera);
}

/** Waypoint blip for the radar — the current destination (florist or venue). */
function waypointBlips() {
  if (!isDriving()) return [];
  const p = waypoint.position;
  return [{ x: p.x, z: p.z, kind: 'waypoint' }];
}

const loop = createLoop({
  update: (dt) => stepUpdate(dt, readInput()),
  render: (alpha) => {
    stats.begin();
    const now = performance.now();
    const frameDt = Math.min(0.1, (now - lastRender) / 1000);
    lastRender = now;
    stepRender(alpha, frameDt);
    stats.end();
  },
});

// Dev-only harness: the automation browser tab runs visibility:hidden, so
// requestAnimationFrame is paused and nothing moves. This lets a test driver
// advance the sim deterministically and render a frame on demand.
if (import.meta.env.DEV) {
  const BASE = { throttle: 0, steer: 0, handbrake: false, horn: false, run: false, jump: false };
  window.__DN = {
    get _vehicle() { return vehicle; },
    get _scene() { return scene; },
    get _THREE() { return THREE; },
    get _camera() { return camera; },
    get _mouse() { return mouse; },
    get _cams() { return { carCam, personCam }; },
    get _stops() { return { florist: FLORIST_STOP, venue: VENUE }; },
    get _phone() { return phone; },
    get _audio() { return audio; },
    step(frames = 60, input = {}) {
      const inp = { ...BASE, ...input };
      for (let i = 0; i < frames; i++) stepUpdate(1 / 60, inp);
      stepRender(1, 1 / 60);
    },
    // Fast-forward without rendering (for long test drives), then render once.
    sim(frames = 60, input = {}) {
      const inp = { ...BASE, ...input };
      for (let i = 0; i < frames; i++) stepUpdate(1 / 60, inp);
    },
    render() { stepRender(1, 1 / 60); },
    enter: () => enterCar(),
    exit: () => exitCar(),
    get mode() { return mode; },
    get act() { return director?.act; },
    get lateness() { return director?.lateness; },
    get timeLeft() { return timer.remaining; },
    get carSpeed() { return vehicle.getSpeed(); },
    get carState() { return vehicle.getState(); },
    get playerState() { return player?.getState(); },
    // Fast-forward through the phone call (skips the typewriter waiting).
    settleCall() { for (let i = 0; i < 4000 && director?.act === 'CALL'; i++) stepUpdate(1 / 60, BASE); },
    // Teleport the car (test only).
    teleport(x, z, h = 0) { vehicle.reset(x, z, h); carCam.snap(); },
    placePlayer(x, z, h = 0) { player?.place(x, z, h); },
    pickFlower(i) { chooseBouquet(i); },
    get flowerCounter() { return shops.flower.counter; },
    get money() { return money; },
    get hasFlowers() { return hasFlowers; },
    get rightFlowers() { return rightFlowers; },
    // Dismiss the start menu and begin play (test only).
    startGame() { gameStarted = true; menu.hide(); },
    get menuOpen() { return menu.isOpen; },
    // --- Phase 4 date hooks (test only) ---
    get dateActive() { return dateActive; },
    get dateEnded() { return dateEnded; },
    get love() { return loveMeter?.value; },
    get dateNode() { return dialogue?.id; },
    get awaitingChoice() { return dateUI.awaitingChoice; },
    // Finish the typewriter / advance past a finished line, then render.
    dateAdvance() { dateUI.progressLine(); stepRender(1, 1 / 60); },
    dateChoose(i) { dateUI.choose(i); stepRender(1, 1 / 60); },
  };
}

// --------------------------------------------------------------------------
/** Hero-car light rig (emissive tails + headlight cone); null until the GLB loads. */
let heroLights = null;

/** Use a supplied GLB as the car body: keep one variant when the file holds
 *  several cars, normalise size/orientation, repaint, rig the wheels into the
 *  physics spin, add lights, and hide the procedural chassis. */
function swapInCarModel(gltf) {
  const model = gltf.scene;
  model.rotation.y = CAR.modelYaw ?? 0; // orient nose to +Z if needed
  keepCarVariant(model, CAR.modelVariant ?? 0); // some exports ship 2+ cars side by side
  cullStrayMeshes(model); // drop far-flung junk that would wreck the bounding box
  paintCarModel(model, CAR.modelPaint); // e.g. showroom red -> his actual black
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const autoFit = (CAR.modelLength || vehicle.chassis.length || 4) / Math.max(size.z, size.x, 0.001);
  model.scale.setScalar(autoFit * (CAR.modelScale ?? 1));
  const box2 = new THREE.Box3().setFromObject(model);
  // Centre the body on the car pivot in X/Z (many GLBs have an off-centre origin,
  // which would otherwise park the car beside where you're sitting), and rest the
  // wheels on the ground in Y.
  const centre = new THREE.Vector3();
  box2.getCenter(centre);
  model.position.x -= centre.x;
  model.position.z -= centre.z;
  model.position.y -= box2.min.y;
  model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  vehicle.chassis.group.visible = false;
  vehicle.tilt.add(model); // under tilt so the car pitches/rolls with the slope
  rigModelWheels(model, CAR.modelWheels); // wheel groups spin with the physics
  heroLights = buildHeroLights(model);    // head/tail glow + brake response
  console.info('[assets] using hero car model from public/models/car.glb');
}

/**
 * Some showroom-style GLBs (this rally export included) contain SEVERAL complete
 * cars parked side by side. Left alone, the auto-fit scales to the combined
 * bounding box and the recentre parks the pivot between them. Detect the case —
 * top-level nodes split into well-separated X clusters that BOTH contain a
 * car-sized mesh — and keep only the requested variant (clusters sorted by X).
 * @param {THREE.Object3D} model
 * @param {number} variant index of the car to keep, in ascending-X order
 */
function keepCarVariant(model, variant) {
  // Walk down single-child wrapper chains (Sketchfab_Scene > … > SceneRootNode).
  let root = model;
  while (root.children.length === 1) root = root.children[0];
  if (root.children.length < 2) return;

  model.updateWorldMatrix(true, true);
  const nodes = [];
  for (const child of root.children) {
    const b = new THREE.Box3().setFromObject(child);
    if (!isFinite(b.min.x)) continue;
    const c = new THREE.Vector3();
    const s = new THREE.Vector3();
    b.getCenter(c);
    b.getSize(s);
    nodes.push({ child, x: c.x, maxDim: Math.max(s.x, s.y, s.z) });
  }
  if (nodes.length < 2) return;

  // Largest gap along X splits the clusters; a real split is a decent fraction
  // of the total span (two cars parked apart), not just panel spacing.
  nodes.sort((a, b) => a.x - b.x);
  const span = nodes[nodes.length - 1].x - nodes[0].x;
  let gapAt = -1;
  let gap = 0;
  for (let i = 1; i < nodes.length; i++) {
    const g = nodes[i].x - nodes[i - 1].x;
    if (g > gap) { gap = g; gapAt = i; }
  }
  if (span <= 0.001 || gap < span * 0.35) return; // one car — nothing to do

  const clusters = [nodes.slice(0, gapAt), nodes.slice(gapAt)];
  // Only treat it as a duplicate-car export if BOTH sides hold a body-sized mesh.
  const bodySize = Math.max(...nodes.map((n) => n.maxDim));
  if (!clusters.every((cl) => Math.max(...cl.map((n) => n.maxDim)) > bodySize * 0.6)) return;

  const keep = clusters[Math.min(variant, clusters.length - 1)];
  const keepSet = new Set(keep.map((n) => n.child));
  let dropped = 0;
  for (const n of nodes) {
    if (!keepSet.has(n.child)) { n.child.removeFromParent(); dropped++; }
  }
  console.info(`[assets] car GLB held ${clusters.length} cars — kept variant ${variant}, dropped ${dropped} node(s)`);
}

/**
 * Recolour named materials (e.g. the showroom body paint -> his real colour).
 * @param {THREE.Object3D} model
 * @param {Record<string, number>|undefined} paint material name -> hex colour
 */
function paintCarModel(model, paint) {
  if (!paint) return;
  const done = new Set();
  model.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    for (const mat of Array.isArray(o.material) ? o.material : [o.material]) {
      if (paint[mat.name] === undefined || done.has(mat)) continue;
      mat.color.setHex(paint[mat.name]);
      done.add(mat);
    }
  });
}

/**
 * Give the hero GLB spinning wheels: wrap each named wheel/axle group in a
 * pivot at its own centre (in the car's frame) and hand the pivots to the same
 * array the vehicle already animates for the procedural chassis.
 * @param {THREE.Object3D} model already parented under vehicle.tilt
 * @param {string[]|undefined} prefixes node-name prefixes of the wheel groups
 */
function rigModelWheels(model, prefixes) {
  if (!prefixes?.length) return;
  model.updateWorldMatrix(true, true);
  const targets = [];
  model.traverse((o) => {
    if (prefixes.some((p) => o.name.startsWith(p))) targets.push(o);
  });
  for (const node of targets) {
    const centre = new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.position.copy(vehicle.tilt.worldToLocal(centre));
    vehicle.tilt.add(pivot);
    pivot.attach(node); // keeps the node's world transform; pivot axes = car axes
    vehicle.chassis.wheels.push(pivot); // vehicle.render() spins these on local X
  }
  if (targets.length) console.info(`[assets] rigged ${targets.length} wheel group(s) for spin`);
}

/**
 * Head/tail lights for the hero car, placed off its fitted bounding box:
 * warm emissive headlight blocks + a single spotlight pool on the road, and
 * red tail blocks that flare on braking / go pale in reverse (it's dusk — the
 * car should read as "lights on").
 * @param {THREE.Object3D} model already parented under vehicle.tilt
 */
function buildHeroLights(model) {
  const box = new THREE.Box3().setFromObject(model);
  const centre = vehicle.tilt.worldToLocal(box.getCenter(new THREE.Vector3()));
  const size = box.getSize(new THREE.Vector3());
  const halfW = size.x / 2;
  const noseZ = centre.z + size.z / 2;
  const tailZ = centre.z - size.z / 2;
  const rig = new THREE.Group();

  const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2c8, emissive: 0xfff2c8, emissiveIntensity: 1.0, flatShading: true });
  const tailMat = new THREE.MeshLambertMaterial({ color: 0x750d0d, emissive: 0xff2a2a, emissiveIntensity: 0.35, flatShading: true });
  for (const sx of [-1, 1]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.13, 0.06), headMat);
    head.position.set(sx * (halfW - 0.32), 0.62, noseZ - 0.02);
    rig.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.05), tailMat);
    tail.position.set(sx * (halfW - 0.26), 0.64, tailZ + 0.02);
    rig.add(tail);
  }

  // One wide spotlight for both beams — a pool of warm light on the tar ahead.
  const beam = new THREE.SpotLight(0xffe6b8, 60, 40, 0.55, 0.65, 1.4);
  beam.position.set(0, 0.7, noseZ);
  beam.target.position.set(0, -0.4, noseZ + 16);
  rig.add(beam);
  rig.add(beam.target);

  vehicle.tilt.add(rig);
  return {
    /** @param {{braking:boolean, reversing:boolean}} signals */
    update({ braking, reversing }) {
      tailMat.emissive.setHex(reversing ? 0xffe9d0 : 0xff2a2a);
      tailMat.emissiveIntensity = braking ? 1.6 : reversing ? 1.0 : 0.35;
    },
  };
}

/**
 * Remove outlier meshes sitting far from the model's main cluster. Some exported
 * GLBs (e.g. Sketchfab rips) carry stray geometry tens of units away; left in, it
 * dominates the bounding box, so the auto-fit shrinks the real car and the recentre
 * shoves it off to one side. We keep the dense cluster around the median centre and
 * drop anything past a robust distance threshold (median + generous margin).
 * @param {THREE.Object3D} model
 */
function cullStrayMeshes(model) {
  model.updateWorldMatrix(true, true);
  const parts = [];
  model.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const b = new THREE.Box3().setFromObject(o);
    if (!isFinite(b.min.x)) return;
    const c = new THREE.Vector3();
    b.getCenter(c);
    parts.push({ o, c });
  });
  if (parts.length < 6) return; // too few to reason about; leave it alone
  const median = (vals) => { const a = vals.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  const m = new THREE.Vector3(
    median(parts.map((p) => p.c.x)),
    median(parts.map((p) => p.c.y)),
    median(parts.map((p) => p.c.z)),
  );
  const dists = parts.map((p) => p.c.distanceTo(m));
  const medD = median(dists) || 1;
  const thresh = Math.max(medD * 8, 3); // strays are ~50-70; car parts a few units
  let culled = 0;
  for (const p of parts) {
    if (p.c.distanceTo(m) > thresh) { p.o.removeFromParent(); culled++; }
  }
  if (culled) console.info(`[assets] culled ${culled} stray car mesh(es)`);
}

/** Dev tuning panel — every handling + camera constant. */
function buildDevPanel() {
  const gui = new GUI({ title: 'Tuning' });
  const h = gui.addFolder('Handling');
  h.add(handling, 'maxSpeed', 5, 60, 0.5);
  h.add(handling, 'reverseMax', 2, 20, 0.5);
  h.add(handling, 'accel', 2, 40, 0.5);
  h.add(handling, 'brake', 5, 60, 0.5);
  h.add(handling, 'engineBrake', 0, 20, 0.5);
  h.add(handling, 'steerMax', 0.1, 1.0, 0.01);
  h.add(handling, 'steerAtTopSpeed', 0.02, 0.5, 0.01);
  h.add(handling, 'steerRate', 0.5, 12, 0.1);
  h.add(handling, 'grip', 1, 30, 0.5);
  h.add(handling, 'driftGrip', 0.5, 20, 0.5);
  h.add(handling, 'bodyRoll', 0, 0.2, 0.005);
  h.add(handling, 'squat', 0, 0.15, 0.005);

  const cam = gui.addFolder('Drive camera');
  cam.add(chaseParams, 'distance', 3, 20, 0.1);
  cam.add(chaseParams, 'height', 1, 12, 0.1);
  cam.add(chaseParams, 'lookAhead', 0, 1.0, 0.01);
  cam.add(chaseParams, 'stiffness', 1, 20, 0.5);
  cam.add(chaseParams, 'baseFov', 40, 80, 1);
  cam.add(chaseParams, 'maxFov', 50, 100, 1);
  cam.add(chaseParams, 'reduceMotion').name('reduce motion');
  cam.close();

  gui.add({ reset: () => { vehicle.reset(0, 0, 0); carCam.snap(); } }, 'reset').name('Reset car');
  gui.close();
}

// Kick off asset loading + the loop (deferred so `loop` above is defined).
init();
