# Date Night — *Our Story*

A short, low-poly, GTA-flavoured driving-and-dialogue game, made as a
10-year-anniversary gift for Jonathan & Simone (17 September 2026).

Get in the black E30, answer her call, buy the right flowers, get to
Murphy's on time, and say the things only you would know to say.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # static build in dist/ (relative paths — hosts anywhere)
```

**Controls:** WASD drive/walk · Space handbrake/jump · F enter/exit/interact ·
H horn · mouse free-look · Esc pause · 1–3 dialogue choices · gamepad supported.

## Status

| Phase | State |
|---|---|
| 0–3 Skeleton → car → city → mission | ✅ done |
| 4 The date (dialogue, meter, moods) | ✅ done |
| 5 Endings, save, replay | ✅ done |
| 6 Audio (synth engine, screech, ring, date loop) | ✅ done |
| 7 Ship | ⬜ deploy + (optional) touch controls |

## Finishing touches only you can do

Everything personal lives in **`src/content/personal.js`** — search `TODO(confirm)`:

1. **The running joke** (`MILESTONES.runningJoke`, and q4 in
   `src/content/dialogue.js`) — the single highest-value line in the game.
2. **Her favourites** — food, drink, song, and especially **flower**
   (`FLORIST.favourite` gates the bouquet bonus; Proteas is a guess).
3. **Simone's avatar** — make one from a photo at readyplayer.me and drop it
   in as `public/models/partner.glb` (plus the free RPM animation pack as
   `public/models/anims.glb`). The pink stand-in retires itself automatically.
4. **The call recording** — secretly record her reading the three lines in
   `CALL.lines`, save as `assets/call.mp3`. The text fallback already works.
5. Read the ending messages in `ENDINGS` out loud once — they're adapted from
   the real letter; make them yours.

## Deploying

`vite.config.js` uses relative paths, so `dist/` works on GitHub Pages,
Netlify, or any static host. Test the public link on the actual laptop it
will be played on before the night.
