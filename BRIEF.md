# DATE NIGHT — build brief

A short, low-poly, GTA-flavoured driving-and-dialogue game made as a personal gift for one couple.

> **How to use this document.** Drop it in the repo root as `BRIEF.md` and work through it phase by phase with Claude Code. Each phase has acceptance criteria — do not start the next phase until the current one passes them. Copy-paste prompts for each phase are at the bottom.

---

## 1. What this is

The player is **{{HUSBAND}}**. He spawns in a small low-poly city, gets a phone call from **{{WIFE}}** saying he's going to be late for date night, drives his car across town to the restaurant, and then plays through a conversation where his answers move a **love meter**. The meter decides which of three endings he gets.

Total playtime: **8–14 minutes**, one sitting, no save required mid-run.

**The emotional brief matters more than the technical one.** This is a gift, not a game jam entry. The payoff is the moment he recognises something — his actual car, the in-joke in a dialogue option, her actual voice on the phone. Every design decision below bends toward *recognition* over *challenge*.

Concretely, that means:
- **He must not be able to lose.** The drive has a timer, but running it out costs love-meter points, never a restart. There is no fail state, no game over screen, no dying.
- **The dialogue answers should be readable to him but not to a stranger.** A generic "compliment her" option is worth less than one that references their real holiday.
- **The worst ending is still a good night.** Ending C is "a nice dinner"; it is not a break-up. Nobody is receiving a gift that tells them they failed at their marriage.

---

## 2. Definition of done

- [ ] Runs at 60fps on a mid-range laptop in Chrome, no stutter during driving
- [ ] Playable start to finish with mouse + keyboard, and with a gamepad if trivial to add
- [ ] Builds to a static folder deployable to GitHub Pages / Netlify — sendable as one link
- [ ] All personal content lives in **one file** (`src/content/personal.js`) so it can be re-skinned for another couple without touching game code
- [ ] Works on a phone in landscape (touch steering), or degrades gracefully with a "best on desktop" notice
- [ ] Total download under 8 MB (no downloaded 3D assets — see §4)

---

## 3. Tech decisions

Chosen for speed of build and zero asset pipeline. Change any of these if you disagree, but change them *now*, not in phase 4.

| Decision | Choice | Why |
|---|---|---|
| Renderer | **Three.js** (latest stable, via npm) | Best-documented WebGL library; Claude Code writes it well |
| Bundler | **Vite** | Instant dev server, one-command static build |
| Language | **JavaScript + JSDoc types** | TypeScript is fine too, but JSDoc keeps the iteration loop fast |
| Physics | **None — custom arcade car model** | A rigid-body engine (cannon-es/rapier) is a week of tuning for a car that only needs to feel *fun*. Hand-rolled kinematics + AABB collision is ~120 lines and far more predictable |
| Art | **100% procedural geometry in code** | No modelling, no licensing, no loaders, no 404s. Low-poly *is* boxes and cylinders. Reconsider only if you want a specific hero car silhouette — then a single GLTF for the car only |
| Audio | **Web Audio API**, synthesised + optional recorded voice clips | See §9 — the recorded phone call is the single highest-value asset in the whole project |
| State | Plain modules + a small event bus. **No framework.** | UI is four screens; React would be more code than it saves |
| Persistence | `localStorage` for "seen intro" + best love score | Optional; the game is short enough to not need saves |

**Do not** add: multiplayer, an ECS, a level editor, a physics engine, a state-management library, or a shader pipeline. See §12.

---

## 4. The personalisation file

This is the most important file in the repo. Everything the couple would recognise goes here and **nowhere else**. Game code imports from it; game code never hardcodes a name. See `src/content/personal.js`.

Dialogue content lives in `src/content/dialogue.js` — see §8.

---

## 5. Architecture

```
src/
  main.js                 boot, canvas, resize, master loop
  core/
    loop.js               fixed-timestep update + render
    bus.js                tiny event emitter
    input.js              keyboard / gamepad / touch → normalised input state
    audio.js              synth + sample playback, master mute
    save.js               localStorage wrapper (never throws)
  world/
    city.js               procedural block grid, roads, instanced buildings
    props.js              lamps, bins, trees, parked cars (instanced)
    sky.js                gradient sky, sun, fog
    collision.js          static AABB grid + broadphase query
  car/
    vehicle.js            arcade handling model (see §7)
    chassis.js            procedural car mesh from CAR.silhouette
    camera.js             chase camera with lag + look-ahead
  mission/
    director.js           act state machine: SPAWN → CALL → DRIVE → ARRIVE → DATE → ENDING
    waypoint.js           destination marker, distance, on-screen arrow
    timer.js              soft timer, produces a lateness value 0..1
  date/
    scene.js              interior: table, two characters, warm lighting
    dialogue.js           runs the dialogue graph, applies love deltas
    meter.js              love meter state + thresholds
  ui/
    hud.js                speed, timer, waypoint arrow
    phone.js              phone-call overlay with subtitles
    choices.js            dialogue choice buttons
    cards.js              title, ending, credits
  content/
    personal.js           ← all personal content
    dialogue.js           ← the conversation graph
```

Keep every file under ~250 lines. If one grows past that, split it.

---

## 6. Build phases

Work strictly in order. Each phase ends with a manual test that a human runs in the browser.

### Phase 0 — Skeleton
Vite project, Three.js scene, gradient sky, ground plane, orbit camera, stats overlay, fixed-timestep loop.
**Done when:** `npm run dev` shows a lit ground plane at a steady 60fps and the window resizes cleanly.

### Phase 1 — The car
Procedural chassis from `CAR.silhouette`. Arcade handling (§7). Chase camera. Flat infinite ground, no collision yet.
**Done when:** driving feels good with nothing else on screen. **Do not proceed until this is true** — if the car is dull to drive, the whole middle of the game is dull. Spend real time on this phase.

### Phase 2 — The city
6×6 block grid, roads with markings, instanced buildings of varied height/colour, pavements, street furniture. Static AABB collision so the car bumps off buildings instead of driving through them. Fog to hide the world edge.
**Done when:** you can drive a lap of the city at 60fps and cannot escape or clip through the map.

### Phase 3 — Mission spine
`director.js` state machine. Spawn outside the house. Phone-call overlay with subtitles and typewriter text (audio in phase 6). Waypoint marker at the venue, on-screen arrow, distance readout, soft timer.
**Done when:** you can play SPAWN → CALL → DRIVE → ARRIVE end to end and the timer produces a lateness value.

### Phase 4 — The date
Interior scene, two low-poly characters at a table, warm key light, shallow camera. Dialogue engine reads the graph, shows 3 choices, applies love deltas, animates the meter. Six questions.
**Done when:** you can play the full conversation, the meter moves sensibly, and lateness from phase 3 carries into the starting value.

### Phase 5 — Endings and framing
Title card, three ending cards, credits with the personal message. Replay button.
**Done when:** all three endings are reachable by playing deliberately well, averagely, or badly.

### Phase 6 — Audio and polish
Engine note tied to speed, tyre chirp, indicator tick, phone ring, UI blips, ambient night hum. Real recorded call if available. Camera shake, headlight glow, mild bloom.
**Done when:** muting the audio makes the game feel noticeably worse.

### Phase 7 — Ship
Touch controls, "best on desktop" notice, build, deploy, test the public link on a phone and on someone else's laptop.

---

## 7. Car handling — the spec that matters most

Arcade, not simulation. Target feel: *heavy but eager*. Numbers are starting points; tune by feel.

```
maxSpeed          28 m/s        (~100 km/h, reads fast at this scale)
reverseMax         8 m/s
accel             14 m/s²
brake             26 m/s²
engineBrake        6 m/s²       when no input
steerMax          0.55 rad      at standstill
steerAtTopSpeed   0.16 rad      lerp by speed — this alone makes it feel like a car
steerRate          4.0 /s       how fast the wheel turns
grip              12.0          lateral velocity damping
driftGrip          5.0          when handbrake held
bodyRoll          0.06 rad      visual lean into corners
squat             0.04          nose dip under braking
```

- Integrate in **local space**: forward velocity and lateral velocity separately, then damp lateral by grip. This gives believable slides for ~30 lines.
- **Chase camera:** position lags the car with a spring, look-at point leads it by `velocity * 0.35`. FOV widens from 60° to 72° between standstill and top speed — this does more for the sense of speed than any particle effect.
- Collision response: reflect velocity off the AABB normal, scale by 0.35, add a small camera shake. Never stop the car dead.
- Add a **horn** on a key. It costs nothing and every single player presses it.

---

## 8. Dialogue system

A graph of nodes in `src/content/dialogue.js`. Data only — no logic in the content file.

**Rules for the engine:**
- `love` deltas apply immediately with an animated meter tick and a small sound.
- Starting love: **50**. Lateness penalty: `-Math.round(lateness * 12)` applied before the first question, shown as a one-line jab from her ("Twenty minutes. A personal best.").
- Clamp 0–100. Thresholds: **≥ 82 → best**, **≥ 58 → good**, else **okay**.
- Nodes may set `mood` ('warm' | 'neutral' | 'cool') that shifts the interior light temperature and her posture. Cheap, and it makes the meter feel embodied rather than numeric.
- No timers on choices. This is a gift, not a QTE.

**Writing guidance for the six questions** — mix these types, and make the high-value answer the one that requires actually knowing her:
1. An opener about the drink/food she'd order him
2. The date/anniversary question
3. A memory: how they met, or a specific trip
4. The running joke — the highest-scoring option should be the one only he would pick
5. A soft vulnerable question ("are you happy?") where the *worst* option is deflecting with a joke
6. A forward-looking one: something they've been planning

---

## 9. Audio

- **Engine:** two detuned sawtooth oscillators, frequency mapped to speed with a slight lag, low-pass filter opening with throttle. ~25 lines, sounds convincingly like a car.
- **The phone call is the best asset in this project.** If you can secretly record {{WIFE}} reading the three call lines on her phone, do it. A real voice at 40 seconds in will land harder than everything else combined. Build the text fallback first so the game works without it.
- UI blips, meter ticks, a doorbell/ambience for the restaurant, a single warm music loop for the date scene.
- Always ship a mute toggle, and never autoplay audio before a click (browsers block it).

---

## 10. Art direction

- **Flat-shaded low poly**: `MeshLambertMaterial` with `flatShading: true`, no textures anywhere.
- Palette: pick 8 colours and use only those. A tight palette is what makes procedural geometry look intentional rather than programmer-art.
- Time of day: **dusk**. Warm sun low on the horizon, long shadows, blue fog. It flatters simple geometry, motivates headlights, and matches "date night".
- Buildings: instanced boxes, 3–8 storeys, window rows as emissive quads. Vary height and colour by seeded noise so the city is the same every run.
- Characters: capsule + box shapes, no faces or two-dot faces. Do not attempt realistic faces — a stylised blank reads as charming, an almost-face reads as unsettling.
- One shadow-casting directional light plus ambient. Not four lights.

---

## 11. Comfort and accessibility

- FOV shift and camera shake both need a **Reduce motion** toggle (also respect `prefers-reduced-motion`).
- Subtitles on by default, always. Never audio-only information.
- A **Skip drive** option that appears if the player has been driving over 4 minutes — someone's dad may be playing this.
- Minimum 16px text, high contrast on all UI. The dialogue choices must be readable on a laptop from across a room.

---

## 12. Scope guardrails — do not build

Explicitly out of scope. If a phase seems to need one of these, the phase is wrong.

- Pedestrians, traffic AI, police, wanted levels
- Any second mission, side activity, or collectible
- An open world larger than the 6×6 grid
- Character customisation, an inventory, a map screen
- A physics engine, an ECS, a shader graph, a level editor
- Multiplayer or any networking
- Realistic faces or facial animation
- A tutorial — the controls are WASD and a text prompt

---

## 13. Delivery

- `npm run build` → `dist/` → deploy to GitHub Pages or Netlify drop.
- Test the public URL on a phone and on a laptop that isn't yours before sending it.
- Send it as a link with **no explanation**, or with one line: *"press play"*. The discovery is the gift.

---

## 15. Fill these in before phase 4

| Placeholder | Needed by | Notes |
|---|---|---|
| `{{HUSBAND}}` / `{{WIFE}}` | Phase 3 | First names as she'd actually say them |
| `{{CAR_MAKE_MODEL}}` + colours | Phase 1 | His real car. Get the colour right — this is the first "oh!" |
| `{{RESTAURANT_NAME}}` | Phase 3 | Where they actually go |
| `{{ANNIVERSARY}}` | Phase 4 | And what the correct answer sounds like in his words |
| `{{RUNNING_JOKE}}` | Phase 4 | The single highest-value line in the game |
| Her favourite food / drink / song | Phase 4 | Used across three questions |
| Call recording | Phase 6 | Optional, transformative |
| Personal ending message | Phase 5 | Write this last, write it properly |
