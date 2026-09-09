# Date Night — *Our Story*

A short, low-poly, GTA-flavoured driving-and-dialogue game, made as a
10-year-anniversary gift for Jonathan & Simone (17 September 2026 — ten years
together, three of them married, same date).

Get ready at home in Radiokop, answer her call, pick up the tux, buy the right
flowers, get to Murphy's in Lambton on time, say the things only you would know
to say, drive her home — and then watch *Our Story* roll.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ (relative paths — hosts anywhere)
npm run preview    # serve the built dist/ locally to check it
```

**Controls:** WASD drive/walk · Space handbrake/jump · F enter/exit/interact ·
H horn · V first-person · mouse free-look · Esc pause · 1–3 dialogue choices ·
gamepad supported throughout (Ⓐ confirm, R3 camera, Back skips a long drive).

## Status

| Phase | State |
|---|---|
| 0–3 Skeleton → car → city → mission | ✅ done |
| 4 The date (ten beats, meter, moods) | ✅ done |
| 5 Endings, epilogue drive home, *Our Story* credits, her letter | ✅ done |
| 6 Audio (synth engine, screech, ring, texts, date loop; optional real call) | ✅ done |
| 7 Ship | ✅ builds clean (≈6.5 MB) · repo private with a public-link switch · ⬜ test on the actual laptop |

## What's in the night

- **Home** — a walk-in gallery of their real photographs (the proposal, the
  wedding, Ayah), *One team. One mission. One God.* over the mirror, Joshua
  24:15 over the wardrobe. The black E30 waits at the kerb.
- **The call** — Simone rings; decline it and she rings back, less patient.
- **The tailor** — four suits; the first is the wedding tux, bow tie included.
  He wears whatever he picks for the rest of the night.
- **WhatsApps on the road** — *"Hey stranger 😊"*, the exact text from 18 May 2016.
- **The florist** — Sunflowers are the right answer (the proposal was dressed in them).
- **The impala crossing**, **Ayah** with her halo waiting at Murphy's door.
- **Dinner** — ten beats: today's date, Murphy's, the WhatsApp, Suicide Squad
  at NuMetro Bedford, Pilanesberg, the motto, *Forever starts today*, "are you
  happy", Ayah, the future. Three endings; the worst is still a nice dinner.
- **The drive home** with Simone in the passenger seat, the campaign card,
  then *Our Story* as a credits roll — every mission from her PDF with the
  photos — then her letter, word for word, then the makers.

## The game case

The first screen asks for a **game code**, console-style, before the title.
The code is remembered on that machine once redeemed (add `?redeemed` to the
URL to skip it when testing, or clear site data to see it again).

- Current code: **`E30G-MRPH-2016-1709-TEAM`** (E30·GP, Murphy's, 2016, 17/09, one team).
  Dashes and case don't matter when typing it.
- Only the code's fingerprint ships in the bundle (`GAME_KEY.hash`). To change
  the code: `npm run key -- NEW-CODE-HERE`, paste the hash into `GAME_KEY` in
  `src/content/personal.js`, redeploy.
- **Print the card:** open `extras/game-code-card.html` in Chrome → Print →
  100% scale, colour, background graphics on. Two 118 × 176 mm cards per sheet,
  cut on the dashed line — one for the case, one spare.

## The characters

Jonathan and Simone are painted onto a rigged mannequin **by body region** from
`LOOKS` in `src/content/personal.js`: skin, hair, beard, sleeves, dress, shoes,
plus procedural hair, beard, glasses, bow tie and necklace meshes riding the
head and neck bones. Colours were read off the real photographs. Tweak a hex
there and it changes everywhere (walk-in, dinner, the car).

Prefer scanned avatars? Drop Ready Player Me / Avaturn exports in as
`public/models/character.glb` and `public/models/partner.glb` (plus a shared
`public/models/anims.glb` clip pack). A textured avatar is never repainted.

## Finishing touches only you can do

Everything personal lives in **`src/content/personal.js`** — search `TODO(confirm)`:

1. **Her favourites** — food, drink, song (`MILESTONES.herFavourite`), and the
   **flower** (`FLORIST.favourite`, currently Sunflowers).
2. **A private running joke**, if there's one beyond the motto (`MILESTONES.runningJoke`).
3. **Your name** on the credits card (`CREDITS.madeBy`).
4. **The call recording** — record Simone reading the three lines in
   `CALL.lines` and save it as **`public/audio/call.mp3`**. It plays when he
   answers; the subtitles still type out; the call stays open until she's done.
   Without the file the text-only call plays as before.
5. **Glasses** — Jonathan wears them in the proposal photo, not at the wedding.
   Set `LOOKS.player.glasses = 0x2a2624` to add them.
6. Read the two non-best `ENDINGS` out loud once. The letter in `LETTER` is hers verbatim.

## Assets

City buildings, interior furniture, food and flowers are from
[Kenney](https://kenney.nl) (Furniture, Food, Nature, City kits) — CC0.
The BMW E30 is a Sketchfab low-poly model (`reference-models/` keeps the
original); check its licence page before publishing anywhere public.
Photographs are the couple's own, from *Our Story*. Everything else is
procedural three.js.

## Deploying — the private/public switch

The source lives at **github.com/revan-lombard/date-night** and stays
**private** (it holds their photographs). GitHub's free plan only serves Pages
from a public repo, so the link is switched on just for the window they play:

```bash
npm run site:up      # repo → public, Pages on, build + deploy, prints the URL
npm run site:down    # Pages off, repo → private
```

Both need the `gh` CLI signed in (it is, on this machine). The URL is
<https://revan-lombard.github.io/date-night/>. Test it on the actual laptop
before the night, then send it with no explanation, or one line: *press start*.

Alternatives if you'd rather not toggle: GitHub Pro (Pages from a private
repo), or `npm run zip` and drag `date-night-dist.zip` onto Netlify Drop.
