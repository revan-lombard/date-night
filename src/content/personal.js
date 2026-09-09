/**
 * @file content/personal.js
 * @responsibility THE personalisation file. Everything the couple would
 * recognise lives here and nowhere else — game code imports from this module
 * and never hardcodes a name. Re-skin for another couple by editing only this
 * file.
 *
 * Filled from "Our Story" (Jonathan & Simone, 10 years — 2016→2026): the
 * mission pages, the dates, the places, the photos, and her letter. A few
 * genuinely-private details we can't derive from the story are marked
 * `TODO(confirm)` — they read fine as-is, but only the couple can verify them.
 */

/** @typedef {'hatchback'|'sedan'|'suv'|'pickup'|'sports'} Silhouette */

export const PEOPLE = {
  player:  { name: 'Jonathan', shirt: 0x2f3338 },
  partner: { name: 'Simone',   dress: 0x15141c },
};

/**
 * How the two of them are DRAWN — read straight off the real photographs in
 * "Our Story" (the proposal, the wedding, Ayah's page). The mannequin rig is
 * painted by body region and given hair / beard / glasses meshes from this.
 * Colours are hex; every field but skin/hair/outfit is optional.
 */
export const LOOKS = {
  player: { // Jonathan — short dark hair, full beard, sturdy build
    skin: 0xdcae88,
    hair: 0x2a1d14,
    hairStyle: 'short',
    beard: 0x231710,
    glasses: null,          // 0x2a2624 to add the dark frames from the proposal photo
    build: 1.06,
    outfit: { cut: 'casual', top: 0x2f3338, sleeves: 'long', bottom: 0x3b5a86, shoes: 0x9a9da3 }, // dark long-sleeve, jeans, grey sneakers
  },
  partner: { // Simone — long golden-blonde hair, fair, the floral dress from the poster
    skin: 0xf1d0b3,
    hair: 0xc99a5c,
    hairStyle: 'long',
    build: 1.12,
    necklace: 0xf0c060,     // the fine gold chain she wears in every photo
    outfit: {
      cut: 'dress', length: 'long', sleeves: 'short',
      base: 0x15141c, floral: [0xe0714a, 0xd9a05b, 0xc94f6a, 0xe8d4b0], // black, coral / gold / rose / cream blooms
      shoes: 0x1a1418,
    },
  },
};

export const CAR = {
  label: 'the black BMW E30',         // his real first car (plate E30·GP)
  plate: 'E30 · GP',
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
 * Optional photo-built character models. The game ships with painted likenesses
 * (LOOKS above); if you'd rather have scanned avatars, make them at
 * readyplayer.me / avaturn.me from a clear headshot and drop the GLBs in:
 *   • Jonathan (the on-foot player)  → public/models/character.glb
 *   • Simone   (waiting at the venue) → public/models/partner.glb
 * Photo-avatars export the mesh + skeleton but usually NO walk/run clips, so also
 * drop a shared animation pack at public/models/anims.glb (the free Ready Player
 * Me pack, or Mixamo idle/walk/run/jump). One pack drives both. A textured avatar
 * is never repainted — its own face survives. Any missing file falls back.
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
  homeBefore: 'Germiston',           // home base 2017 → Radiokop
  venue: "Murphy's Pub & Grill",     // where they first met — Lambton, Germiston, 2016
  venueArea: 'Lambton, Germiston',
  venueType: 'restaurant',           // drives the interior dressing
};

export const CALL = {
  // Optional real recording of her reading `lines` — drop it at public/audio/call.mp3
  // (mp3 / m4a / ogg all fine). The subtitles still type out; the text fallback
  // is what plays when the file is absent.
  audioFile: 'audio/call.mp3',
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

/**
 * WhatsApp beats — short texts from her that land at moments in the night.
 * Keyed by the mission act they arrive on. "Hey stranger 😊" is the exact
 * message she sent him on 18 May 2016 — the one that started all of this.
 */
export const TEXTS = {
  TO_FLORIST: [
    'Hey stranger 😊',
    "Ten years since I first sent you that. Still works, hey.",
  ],
  TO_VENUE: [
    "Table at the back. Same one. Hurry up x",
  ],
};

export const MILESTONES = {
  anniversary: '17 September 2026',                         // 10 years together — and 3 years married, same date
  official: '17 September 2016',                            // "Relationship status: official"
  wedding: '17 September 2023',                             // La Bita Events, Pretoria
  howTheyMet: "At Murphy's Pub & Grill in Lambton, Germiston, back in 2016",
  firstText: 'Hey stranger 😊',                             // 18 May 2016, WhatsApp
  firstDate: 'Suicide Squad at NuMetro, Bedford Centre',   // 26 September 2016
  proposal: { date: '18 December 2021', place: 'Pretoria', sign: 'Forever starts today', flowers: 'Sunflowers' },
  motto: 'One team. One mission. One God.',                 // it's on the poster — their line
  verse: 'As for me and my house, we will serve the Lord. — Joshua 24:15',
  // TODO(confirm): a private in-joke only the two of them share, if there is one
  // beyond the motto. The motto IS the highest-value line in the game right now.
  runningJoke: 'One team, one mission, one God',
  herFavourite: {
    food:  'a proper steak',        // TODO(confirm)
    drink: 'a glass of red',        // TODO(confirm)
    song:  'our song',              // TODO(confirm)
    // The proposal setup (18 Dec 2021, Pretoria) was dressed in SUNFLOWERS —
    // the strongest signal in "Our Story". TODO(confirm) all the same.
    flower: 'Sunflowers',
  },
  trips: ['Pilanesberg', 'Durban', 'Ballito', 'Marloth Park', 'Cape Town'],
  future: [ // Mission 6 — the quests in progress, with the PDF's progress bars
    { label: 'Buy own home', progress: 0.74 },
    { label: 'Start a family', progress: 0.45 },
    { label: 'Career growth', progress: 0.68 },
  ],
};

/**
 * The tailor: tonight's suit. Pure style — the outfit goes onto his avatar
 * and that's what he wears to dinner. No wrong answers at a fitting.
 * `outfit` is what the character painter receives (see player/character.js).
 */
export const SUITS = {
  options: [
    { name: 'The wedding tux — black, bow tie', color: 0x161719,
      outfit: { cut: 'formal', jacket: 0x161719, shirt: 0xf4f1ea, tie: 0x0c0c0f, bottom: 0x14151a, shoes: 0x111114 } },
    { name: 'Midnight navy, black tie',         color: 0x22304e,
      outfit: { cut: 'formal', jacket: 0x22304e, shirt: 0xf4f1ea, tie: 0x0c0c0f, bottom: 0x1c2540, shoes: 0x111114 } },
    { name: 'Charcoal, open collar',            color: 0x41464e,
      outfit: { cut: 'formal', jacket: 0x41464e, shirt: 0xf4f1ea, tie: null, bottom: 0x33373e, shoes: 0x2a2320 } },
    { name: 'Bold burgundy — feeling brave',    color: 0x5e2230,
      outfit: { cut: 'formal', jacket: 0x5e2230, shirt: 0xf4f1ea, tie: 0x0c0c0f, bottom: 0x1a1b1f, shoes: 0x111114 } },
  ],
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
  flowersRight: `${FLORIST.favourite}. Like the day you asked. You actually remembered. Okay — sit, sit.`,
  flowersWrong: "Flowers! Not... quite my favourite, but they're lovely. Sit down, you.",
  flowersNone: 'No flowers, hey. Ten years and empty hands. Sit down anyway.',
};

// Her anniversary message — the real letter that closes "Our Story", verbatim.
export const LETTER = {
  heading: 'Happy Anniversary',
  sub: 'To my partner in everything',
  paragraphs: [
    "Ten years ago, we started this journey together — not knowing exactly where " +
    "it would lead, but knowing we wanted to do it side by side. And what a " +
    "journey it's been.",
    "Thank you for being my teammate, my best friend, and my biggest supporter. " +
    "Through every win and every challenge, you've been my constant. I'm so proud " +
    "of what we've built together and even more excited for all that's still ahead.",
    "Here's to our story, our team, our mission. I can't wait to keep writing the " +
    "next chapters with you.",
  ],
  signoff: 'I love you.',
  from: 'Simone',
};

export const ENDINGS = {
  best: {
    title: 'Best night in ages',
    message:
      "Ten years, three of them married, and you still know every single answer. " +
      "Same table, same boy from Murphy's. Take me home, husband.",
  },
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
      "choose you every time. One team, one mission. Take me home.",
  },
};

/**
 * The credits roll — "Our Story", mission by mission, exactly as her PDF tells
 * it. `photo` names a file in public/photos/ (optional). Shown after the drive
 * home, before her letter.
 */
export const STORY = [
  { tag: 'Mission 01', title: 'The Beginning', when: 'Lambton, Germiston · 2016',
    text: "Murphy's Pub & Grill. Objective: meet your future co-op partner. Neither player knows what's coming…" },
  { tag: 'Side quest accepted', title: '"Hey stranger 😊"', when: '18 May 2016',
    text: "A WhatsApp. Then an invite to her sister's 21st. Then a note: would he be her date to the Matric Dance? Something is happening…" },
  { tag: 'Mission 02', title: 'First Date', when: '17 · 26 September 2016',
    text: 'Relationship status: official. Nine days later, Suicide Squad at NuMetro, Bedford Centre. Mission complete. +500 XP.' },
  { tag: 'Chapter complete', title: 'First Adventure', when: 'Pilanesberg',
    text: 'Matric Dance. Simone matriculated. The first road trip in the E30. A lion at sunrise. Exploration achievement unlocked.' },
  { tag: 'Milestones unlocked', title: 'First Kiss · "I Love You"', when: '',
    text: 'The beginning of something real. Three little words. Everything changed.' },
  { tag: 'Mission 3', title: 'Establish Home Base', when: 'Germiston · 2017',
    text: 'Living together. Adventures. Ups & downs. Growing together. "As for me and my house, we will serve the Lord." — Joshua 24:15' },
  { tag: 'Companion unlocked', title: 'Ayah', when: 'September 2020', photo: 'ayah.jpg',
    text: 'Party size: 3. Some companions leave before we\'re ready. Their place in the story remains.' },
  { tag: 'Explorer achievement', title: 'Our Adventures Together', when: 'Map: expanding',
    text: 'Pilanesberg · Durban · Ballito · Marloth Park · Cape Town. The world is big, and our story is still growing.' },
  { tag: 'Mission 4 · Major mission', title: 'The Proposal', when: '18 December 2021 · Pretoria', photo: 'proposal.jpg',
    text: 'Sunflowers, candles, a letterboard: FOREVER STARTS TODAY. Achievement unlocked: She said yes.' },
  { tag: 'Mission 5', title: 'Marriage Mode Unlocked', when: '17 September 2023 · La Bita Events, Pretoria', photo: 'wedding.jpg',
    text: 'Co-op partner: permanent. Status: married ❤' },
  { tag: 'New home base unlocked', title: 'Radiokop', when: '',
    text: 'New location. New chapter. Same team. Same mission.' },
  { tag: 'Mission 6', title: 'The Future', when: 'Quests in progress', bars: true,
    text: '' },
];

/**
 * The GAME CODE printed on the card inside the case. The first screen asks for
 * it, console-style; once redeemed it's remembered on that machine.
 * Only the code's fingerprint ships — mint one for a new code with
 *   npm run key -- XXXX-XXXX-XXXX-XXXX-XXXX
 * Current code: E30G-MRPH-2016-1709-TEAM  (E30·GP, Murphy's, 2016, 17/09, one team)
 */
export const GAME_KEY = {
  hash: '679b52c7c71c5acd',
  groups: 5,      // XXXX-XXXX-XXXX-XXXX-XXXX
  groupLen: 4,
  title: 'Redeem your code',
  hint: 'Enter the 20-character code from the card inside your game case.',
  product: 'Our Story · Anniversary Edition',
  wrong: "That code isn't valid. Check the card and try again.",
};

export const CREDITS = {
  // Who made this, for the last card. TODO(confirm) — put your name how you'd like it read.
  madeBy: 'Revan',
  dedication: 'For Jonathan & Simone · 10 years · 17 September 2026',
  thanks: [
    'Story, photos and the letter — Simone',
    'City, furniture and food kits — Kenney (CC0)',
    'BMW E30 low-poly model — Sketchfab community',
    'Built with three.js + Vite',
  ],
  ayah: 'In loving memory of Ayah 🐾 · 2020',
};
