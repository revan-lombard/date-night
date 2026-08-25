/**
 * @file content/personal.js
 * @responsibility THE personalisation file. Everything the couple would
 * recognise lives here and nowhere else — game code imports from this module
 * and never hardcodes a name. Re-skin for another couple by editing only this
 * file.
 *
 * Filled from "Our Story" (Jonathan & Simone, 10 years — 2016→2026).
 * A few genuinely-private details we can't derive from the story are marked
 * `TODO(confirm)` — they read fine as-is, but only the couple can verify them.
 */

/** @typedef {'hatchback'|'sedan'|'suv'|'pickup'|'sports'} Silhouette */

export const PEOPLE = {
  player:  { name: 'Jonathan', shirt: 0x2b3ae8 },
  partner: { name: 'Simone',   dress: 0xff3e6c },
};

export const CAR = {
  label: 'the black BMW E30',         // his real first car (plate E30·GP)
  bodyColor: 0x14161a,                // near-black (pure black reads flat in the dusk lighting)
  accentColor: 0xc4162a,              // BMW roundel red
  /** @type {Silhouette} */
  silhouette: 'sedan',                // E30 is a boxy 3-series — sedan fits best
  hornSound: 'double-beep',
  // CURRENT: car.glb = the Sketchfab bmw_m3_e30_low_poly_rally export. It ships
  // TWO complete cars side by side (a red/white rally-livery M3 and a plain red
  // road car). swapInCarModel splits them into clusters and keeps modelVariant,
  // repaints via modelPaint, and spins the modelWheels nodes with the physics.
  // Nudge modelYaw / modelScale if the nose/size is ever off.
  modelYaw: 0,        // radians, rotate the model so its nose points forward (+Z)
  modelScale: 1,      // fine-tune multiplier on top of the auto-fit
  modelLength: 4.32,  // real-world length in metres (BMW E30 ≈ 4.32 m)
  modelVariant: 0,    // which car to keep when the GLB holds several (sorted by X): 0 = the plain road car
  modelPaint: { 'Material.001': 0x14161a }, // repaint the road car's red body to his near-black
  modelWheels: ['Circle004', 'Circle005'],  // node-name prefixes of the axle/wheel groups (they spin with speed)
  modelTailMats: ['Material.004', 'Material.006'], // the GLB's own tail-lamp materials — glow dim, flare on braking
};

/** Real-world player height in metres (used to scale the character model). */
export const PLAYER_HEIGHT = 1.8;

/**
 * Character models built from their real photos (see assets/photos/headshots/).
 * Make them at readyplayer.me or avaturn.me from a clear front-facing headshot,
 * then drop the exported GLBs into public/models/:
 *   • Jonathan (the on-foot player)  → public/models/character.glb
 *   • Simone   (waiting at the venue) → public/models/partner.glb
 * Photo-avatars export the mesh + skeleton but usually NO walk/run clips, so also
 * drop a shared animation pack at public/models/anims.glb (the free Ready Player
 * Me pack, or Mixamo idle/walk/run/jump). One pack drives both — every RPM
 * avatar shares the same skeleton. Any missing file falls back gracefully.
 *
 * If a dropped-in avatar faces the wrong way (stands with its back to the
 * camera), set its modelYaw to Math.PI to spin it 180°.
 */
export const CHARACTERS = {
  player:  { name: 'Jonathan', modelYaw: 0 },
  partner: { name: 'Simone',   modelYaw: 0 },
};

export const PLACES = {
  home: 'Radiokop',                  // where they live now (new home base)
  venue: "Murphy's Pub & Grill",     // where they first met, in Germiston — 2016
  venueType: 'restaurant',           // drives the interior dressing
};

export const CALL = {
  audioFile: 'assets/call.mp3',      // optional real recording; falls back to text
  lines: [
    'Babe — where are you?',
    "Don't tell me the E30 won't start again.",
    "I'm already at Murphy's. Ten years today — don't make me sit here alone.",
  ],
  // If he DECLINES the first call, she rings back — more irritated.
  declineLines: [
    'Did you just decline my call?',
    "I can literally see the ticks going blue, Jonathan.",
    'Get. In. The. Car.',
  ],
};

export const MILESTONES = {
  anniversary: '17 September 2026',                         // 10 years together
  howTheyMet: "At Murphy's Pub & Grill in Germiston, back in 2016",
  // TODO(confirm): the private in-joke only the two of them share.
  runningJoke: 'One team, one mission, one God',            // their motto — swap for the real running joke if there is one
  herFavourite: {
    food:  'a proper steak',        // TODO(confirm)
    drink: 'a glass of red',        // TODO(confirm)
    song:  'our song',              // TODO(confirm)
    // The proposal setup (18 Dec 2021, Pretoria) was dressed in SUNFLOWERS —
    // the strongest signal in "Our Story". TODO(confirm) all the same.
    flower: 'Sunflowers',
  },
};

/**
 * The florist: bouquet choices and which one is HER favourite. Picking the
 * favourite gives a warmer welcome at the date; the wrong one is a small miss.
 * Set `favourite` to exactly one of the option names.
 */
export const FLORIST = {
  cost: 150,
  options: [
    { name: 'Red Roses', color: 0xff2f55 },
    { name: 'Proteas', color: 0xff764a },
    { name: 'White Lilies', color: 0xf3f0ea },
    { name: 'Sunflowers', color: 0xffcf3f },
  ],
  favourite: 'Sunflowers', // the proposal was dressed in them — TODO(confirm)
};

/**
 * Simone's first line at the table — reacting to what he's holding. Chosen by
 * flowers state; the love deltas themselves live in date/meter.js.
 */
export const DATE_OPENERS = {
  flowersRight: `${FLORIST.favourite}. You actually remembered my favourite. Okay — sit, sit.`,
  flowersWrong: "Flowers! Not... quite my favourite, but they're lovely. Sit down, you.",
  flowersNone: 'No flowers, hey. Ten years and empty hands. Sit down anyway.',
};

// Her anniversary message — the real letter that closes "Our Story", verbatim.
const ANNIVERSARY_LETTER =
  "Ten years ago, we started this journey together — not knowing exactly where " +
  "it would lead, but knowing we wanted to do it side by side. And what a " +
  "journey it's been. Thank you for being my teammate, my best friend, and my " +
  "biggest supporter. Through every win and every challenge, you've been my " +
  "constant. I'm so proud of what we've built together and even more excited " +
  "for all that's still ahead. Here's to our story, our team, our mission. " +
  "I can't wait to keep writing the next chapters with you. I love you.";

export const ENDINGS = {
  best: { title: 'Best night in ages', message: ANNIVERSARY_LETTER },
  good: {
    title: 'A really good night',
    message:
      "Ten years, and you still know exactly how to make me laugh. Thank you for " +
      "doing this life side by side with me. Here's to the next chapter. I love you.",
  },
  okay: {
    title: 'A nice dinner',
    message:
      "It wasn't perfect — but neither were the last ten years, and I'd still " +
      "choose you every time. One team, one mission. I love you.",
  },
};
