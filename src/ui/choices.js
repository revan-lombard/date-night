/**
 * @file ui/choices.js
 * @responsibility The date's screen furniture: cinematic letterbox bars, a
 * speaker plate + typewriter subtitle, up to three choice buttons (click,
 * 1–3, arrows + Enter — same conventions as the flower pick panel), and the
 * animated LOVE meter with floating +/- ticks. ≥16px text throughout (§11).
 *
 * Presentation only: no graph logic, no love math. main.js drives it:
 *   say(name, line, done) → offer(labels, cb) → meterTick(value, delta) → …
 *
 * Controller: keyboard + pad both come through readMenu() (confirm advances /
 * picks, up/down move focus) — poll update() once per frame while the date is
 * on screen. Number keys 1–3 stay as the direct keyboard shortcut.
 *
 * @phase Implemented in Phase 4; controller nav in the ship polish.
 */

import { readMenu } from '../core/input.js';

const COND = "'Arial Narrow','Roboto Condensed','Oswald',system-ui,sans-serif";
const BODY = "system-ui,'Segoe UI',Roboto,sans-serif";
const GOLD = '#f0a828';
const PINK = '#ff5c8a';
const INK = 'rgba(12,12,16,.88)';
const CPS = 34; // typewriter characters per second

export function createDateUI() {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:70;display:none;pointer-events:none;font-family:' + BODY + ';';
  document.body.appendChild(root);

  // Letterbox bars — instant "this is a scene now" framing.
  for (const side of ['top:0', 'bottom:0']) {
    const bar = document.createElement('div');
    bar.style.cssText = `position:absolute;left:0;right:0;${side};height:9vh;background:#000;`;
    root.appendChild(bar);
  }

  // --- LOVE meter (top centre, under the letterbox) ---
  const meterWrap = document.createElement('div');
  meterWrap.style.cssText =
    'position:absolute;left:50%;top:calc(9vh + 14px);transform:translateX(-50%);width:min(320px,60vw);text-align:center;';
  meterWrap.innerHTML =
    `<div style="font:700 13px ${COND};letter-spacing:.3em;color:${PINK};text-transform:uppercase;text-shadow:0 1px 4px #000">♥ Love</div>`;
  const track = document.createElement('div');
  track.style.cssText =
    'margin-top:5px;height:10px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);border-radius:6px;overflow:hidden;';
  const fill = document.createElement('div');
  fill.style.cssText =
    `height:100%;width:50%;background:linear-gradient(90deg,#c2304a,${PINK});border-radius:6px;transition:width .55s cubic-bezier(.2,.9,.3,1.2);`;
  track.appendChild(fill);
  meterWrap.appendChild(track);
  root.appendChild(meterWrap);

  /** Floating +N / −N tick beside the meter. */
  function floatDelta(delta) {
    if (!delta) return;
    const el = document.createElement('div');
    el.textContent = (delta > 0 ? '+' : '') + delta;
    el.style.cssText =
      `position:absolute;left:calc(100% + 12px);top:-4px;font:800 20px ${COND};` +
      `color:${delta > 0 ? '#7be08a' : '#ff5d5d'};text-shadow:0 1px 4px #000;` +
      'transition:transform 1.1s ease-out,opacity 1.1s ease-out;white-space:nowrap;';
    meterWrap.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'translateY(-26px)'; el.style.opacity = '0'; });
    setTimeout(() => el.remove(), 1200);
  }

  // --- Ending card (title + her message; Phase 5 grows this into cards.js) ---
  const cardEl = document.createElement('div');
  cardEl.style.cssText =
    'position:absolute;left:50%;top:45%;transform:translate(-50%,-50%);display:none;text-align:center;' +
    `padding:26px 38px;background:${INK};border-top:3px solid ${GOLD};border-bottom:3px solid ${GOLD};` +
    'color:#fff;box-shadow:0 8px 30px rgba(0,0,0,.6);max-width:84vw;pointer-events:auto;';
  root.appendChild(cardEl);

  // --- Bottom panel: speaker + line + choices ---
  const panel = document.createElement('div');
  panel.style.cssText =
    'position:absolute;left:50%;bottom:calc(9vh + 18px);transform:translateX(-50%);' +
    `width:min(720px,92vw);pointer-events:auto;`;
  root.appendChild(panel);

  const plate = document.createElement('div');
  plate.style.cssText =
    `display:inline-block;padding:4px 14px;background:${GOLD};color:#141414;` +
    `font:800 15px ${COND};letter-spacing:.22em;text-transform:uppercase;`;
  panel.appendChild(plate);

  const lineBox = document.createElement('div');
  lineBox.style.cssText =
    `padding:14px 18px;background:${INK};border-left:3px solid ${GOLD};color:#fff;` +
    `font:500 19px/1.45 ${BODY};min-height:52px;text-shadow:0 1px 2px #000;`;
  panel.appendChild(lineBox);

  const cue = document.createElement('span'); // blinking "line finished" cue
  cue.textContent = ' ▸';
  cue.style.cssText = `color:${GOLD};animation:dn-blink 1s step-end infinite;`;
  const style = document.createElement('style');
  style.textContent = '@keyframes dn-blink{50%{opacity:0}}';
  document.head.appendChild(style);

  const list = document.createElement('div');
  list.style.cssText = 'margin-top:10px;display:none;flex-direction:column;gap:6px;';
  panel.appendChild(list);

  const hint = document.createElement('div');
  hint.style.cssText = `margin-top:6px;text-align:right;font:600 12px ${BODY};color:rgba(255,255,255,.45);`;
  panel.appendChild(hint);

  // --- typewriter state ---
  let fullText = '';
  let shown = 0;        // characters revealed
  let typing = false;
  let lineDone = null;  // callback once the player advances past the line
  // --- choices state ---
  let options = [];
  let onPick = null;
  let focus = 0;
  const buttons = [];
  let visible = false;

  const paint = () => buttons.forEach((b, i) => {
    b.style.borderColor = i === focus ? PINK : 'transparent';
    b.style.background = i === focus ? 'rgba(120,32,58,.88)' : 'rgba(10,10,14,.82)';
  });

  function renderChoices() {
    list.innerHTML = '';
    buttons.length = 0;
    options.forEach((text, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText =
        'text-align:left;width:100%;padding:11px 14px;border:2px solid transparent;' +
        `background:rgba(10,10,14,.82);color:#fff;font:700 17px ${BODY};cursor:pointer;text-shadow:0 1px 2px #000;`;
      b.textContent = `${i + 1}. ${text}`;
      b.addEventListener('mouseenter', () => { focus = i; paint(); });
      b.addEventListener('click', (e) => { e.stopPropagation(); pick(i); });
      list.appendChild(b);
      buttons.push(b);
    });
    paint();
  }

  function pick(i) {
    if (!onPick || i >= options.length) return;
    const cb = onPick;
    onPick = null;
    list.style.display = 'none';
    hint.textContent = '';
    cb(i);
  }

  /** Complete the typewriter, or advance past a finished line. */
  function progressLine() {
    if (typing) { shown = fullText.length; typing = false; paintLine(); return; }
    if (lineDone) { const cb = lineDone; lineDone = null; cue.remove(); cb(); }
  }

  function paintLine() {
    lineBox.textContent = fullText.slice(0, Math.floor(shown));
    if (!typing && lineDone) lineBox.appendChild(cue);
  }

  // Direct number keys only — arrows/W/S/Enter/Space and the whole gamepad
  // come through readMenu() in update(), so a press can't double-fire.
  window.addEventListener('keydown', (e) => {
    if (!visible || !onPick) return;
    if (/^Digit[1-3]$/.test(e.code)) pick(+e.code.slice(5) - 1);
  });
  panel.addEventListener('click', () => { if (!onPick) progressLine(); });

  let cardShown = false;
  let replayCb = null;

  return {
    show() { visible = true; root.style.display = 'block'; },
    hide() { visible = false; root.style.display = 'none'; },

    /** Typewrite a spoken line; `done` fires when the player advances past it. */
    say(name, text, done) {
      plate.textContent = name;
      plate.style.background = GOLD;
      fullText = text;
      shown = 0;
      typing = true;
      lineDone = done;
      list.style.display = 'none';
      hint.textContent = 'Space / Ⓐ / click to continue';
      paintLine();
    },

    /** Offer up to three choices; `cb(i)` on pick. */
    offer(labels, cb) {
      options = labels;
      onPick = cb;
      focus = 0;
      renderChoices();
      list.style.display = 'flex';
      hint.textContent = '1–3 / stick + Ⓐ / click';
    },

    /** Set the meter without a tick (initial seed). */
    meterSet(value) { fill.style.width = value + '%'; },

    /** Animate the meter to a new value with a floating delta. */
    meterTick(value, delta) { fill.style.width = value + '%'; floatDelta(delta); },

    /** Advance the typewriter — call each render with frame dt. */
    tick(dt) {
      if (!typing) return;
      shown = Math.min(fullText.length, shown + CPS * dt);
      if (shown >= fullText.length) typing = false;
      paintLine();
    },

    /** Keyboard/controller navigation — poll once per frame while visible.
     *  (Safe alongside menu/phone/pick panels: only one is ever active.) */
    update() {
      if (!visible) return;
      let m = null;
      try { m = readMenu?.(); } catch { m = null; }
      if (!m) return;
      if (cardShown) {
        if (m.confirm && replayCb) replayCb();
        return;
      }
      if (onPick) {
        if (m.up) { focus = (focus - 1 + options.length) % options.length; paint(); }
        if (m.down) { focus = (focus + 1) % options.length; paint(); }
        if (m.confirm) pick(focus);
      } else if (m.confirm) {
        progressLine();
      }
    },

    /** Swap the dialogue furniture for a centred ending card.
     *  @param {string} html @param {(() => void)=} onAction adds an action button
     *  @param {string} [label] the button's label */
    card(html, onAction, label = '↻  Relive the night') {
      panel.style.display = 'none';
      meterWrap.style.display = 'none';
      cardShown = true;
      replayCb = onAction ?? null;
      cardEl.innerHTML = html;
      if (onAction) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText =
          `margin-top:18px;padding:10px 26px;border:none;background:${GOLD};color:#141414;` +
          `font:800 15px ${COND};letter-spacing:.18em;text-transform:uppercase;cursor:pointer;`;
        b.addEventListener('click', onAction);
        cardEl.appendChild(b);
      }
      cardEl.style.display = 'block';
    },

    /** Test hooks: finish/advance the line, pick a choice, inspect state. */
    progressLine,
    choose: pick,
    get awaitingChoice() { return !!onPick; },
    get typing() { return typing; },
  };
}
