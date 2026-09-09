/**
 * @file ui/phone.js
 * @responsibility His phone. Two things arrive on it:
 *   • an incoming CALL — the caller card rings with two clear actions, Answer
 *     (green) and Decline (red), driven by mouse, keyboard, or controller
 *     (readMenu). Answering runs typewriter subtitles from CALL.lines (subtitles
 *     always on, §11; click / Enter skips a line) and, if a real recording was
 *     supplied, plays it and holds the call open until it finishes. Declining
 *     plays a brief "Declined" beat and ends the call.
 *   • a TEXT — a WhatsApp-styled bubble that slides in top-right for a few
 *     seconds ("Hey stranger 😊"). Purely a beat; nothing to press.
 * No audio autoplays: the recording only starts from the Answer gesture.
 *
 * @phase Ringing/Answer/Decline in the front-end shell pass; typewriter from
 * Phase 3; recording + texts in the ship pass.
 */

import { readMenu } from '../core/input.js';

const CPS = 34;          // characters per second
const LINE_HOLD = 1.1;   // seconds to hold a finished line
const END_HOLD = 1.0;    // seconds after the last line before `done`
const DECLINE_HOLD = 0.8; // seconds to show the "Declined" beat
const TEXT_SHOW = 5.2;   // seconds a text bubble stays up

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
@keyframes ph-ring{0%,100%{box-shadow:0 0 0 0 rgba(240,168,40,.55)}
  50%{box-shadow:0 0 0 12px rgba(240,168,40,0)}}
@keyframes ph-wiggle{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}
@keyframes ph-dots{0%{opacity:.2}20%{opacity:1}100%{opacity:.2}}
@keyframes ph-slide{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
.ph-ava-ring{animation:ph-ring 1.2s ease-out infinite}
.ph-ico-ring{animation:ph-wiggle .5s ease-in-out infinite}
.ph-dot{animation:ph-dots 1.4s infinite}
.ph-dot:nth-child(2){animation-delay:.2s}
.ph-dot:nth-child(3){animation-delay:.4s}
.ph-btn{appearance:none;border:none;border-radius:12px;cursor:pointer;color:#fff;
  font:800 17px system-ui,sans-serif;padding:12px 18px;display:flex;align-items:center;
  gap:8px;justify-content:center;flex:1;transition:transform .1s ease,filter .1s ease}
.ph-btn:hover{transform:translateY(-1px);filter:brightness(1.08)}
.ph-answer{background:#22b06a}
.ph-decline{background:#e0455a}
.ph-text{position:fixed;right:18px;top:18px;z-index:72;width:min(340px,84vw);
  background:#0b141a;color:#e9edef;border-radius:14px;padding:10px 12px 8px;
  box-shadow:0 10px 30px rgba(0,0,0,.55);font-family:system-ui,'Segoe UI',Roboto,sans-serif;
  animation:ph-slide .35s ease-out;transition:opacity .5s ease,transform .5s ease}
.ph-text-hd{display:flex;align-items:center;gap:8px;font-size:12px;color:#8696a0;margin-bottom:6px}
.ph-text-hd b{color:#25d366;font-size:13px}
.ph-text-bub{background:#005c4b;border-radius:10px 10px 10px 2px;padding:8px 10px;font-size:16px;line-height:1.35;
  position:relative;display:inline-block;max-width:100%}
.ph-text-time{font-size:11px;color:rgba(233,237,239,.6);text-align:right;margin-top:3px}
@media (prefers-reduced-motion:reduce){
  .ph-ava-ring,.ph-ico-ring,.ph-dot,.ph-text{animation:none}}
`;
  document.head.appendChild(style);
}

export function createPhone() {
  injectStyles();

  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;left:50%;top:32px;transform:translateX(-50%);z-index:70;display:none;' +
    'width:min(560px,92vw);padding:16px 20px;border-radius:16px;font-family:system-ui,sans-serif;' +
    'background:rgba(14,13,10,.93);color:#fff;box-shadow:0 10px 40px rgba(0,0,0,.6);' +
    'border:1px solid rgba(240,168,40,.22);';
  root.innerHTML =
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px">' +
    '<div id="ph-ava" class="ph-ava-ring" style="width:44px;height:44px;border-radius:50%;background:#f0a828;' +
    'color:#141007;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px"></div>' +
    '<div><div id="ph-name" style="font-weight:700;font-size:17px"></div>' +
    '<div id="ph-status" style="font-size:13px;opacity:.75"></div></div>' +
    '<div id="ph-ico" class="ph-ico-ring" style="margin-left:auto;font-size:24px">📞</div></div>' +
    // Ringing actions.
    '<div id="ph-actions" style="display:flex;gap:12px;margin-top:6px">' +
    '<button id="ph-answer" class="ph-btn ph-answer" type="button">📞 Answer' +
    '<span style="display:block;font-size:11px;font-weight:600;opacity:.75;margin-top:2px">Enter · Ⓐ</span></button>' +
    '<button id="ph-decline" class="ph-btn ph-decline" type="button">✗ Decline' +
    '<span style="display:block;font-size:11px;font-weight:600;opacity:.75;margin-top:2px">Esc · Ⓑ</span></button></div>' +
    // Subtitles (shown after Answer).
    '<div id="ph-sub" style="display:none;font-size:18px;line-height:1.4;min-height:2.6em"></div>' +
    '<div id="ph-hint" style="display:none;text-align:right;font-size:12px;opacity:.5;margin-top:6px">click / Enter to continue</div>';
  document.body.appendChild(root);

  const nameEl = root.querySelector('#ph-name');
  const avaEl = root.querySelector('#ph-ava');
  const statusEl = root.querySelector('#ph-status');
  const iconEl = root.querySelector('#ph-ico');
  const actionsEl = root.querySelector('#ph-actions');
  const subEl = root.querySelector('#ph-sub');
  const hintEl = root.querySelector('#ph-hint');
  const answerBtn = root.querySelector('#ph-answer');
  const declineBtn = root.querySelector('#ph-decline');

  let lines = [];
  let li = 0;              // line index
  let shown = 0;           // characters revealed of current line
  let hold = 0;            // seconds left holding a finished line
  let declineHold = 0;     // seconds elapsed in the "Declined" beat
  let state = 'idle';      // 'idle' | 'ringing' | 'talking' | 'declined'
  let done = false;
  let answered = false;
  let declined = false;
  let swallowConfirm = false; // eat the confirm edge that answered via a key
  let onAnswer = null;     // () => Promise<number>|number — starts a recording, returns its length
  let talkT = 0;           // seconds since answering
  let minTalk = 0;         // hold the call open at least this long (the recording)

  const answer = () => {
    if (state !== 'ringing') return;
    state = 'talking';
    answered = true;
    li = 0; shown = 0; hold = 0; talkT = 0; minTalk = 0;
    statusEl.textContent = 'mobile · on call';
    iconEl.classList.remove('ph-ico-ring');
    avaEl.classList.remove('ph-ava-ring');
    actionsEl.style.display = 'none';
    subEl.style.display = 'block';
    hintEl.style.display = 'block';
    subEl.textContent = '';
    if (onAnswer) {
      try {
        Promise.resolve(onAnswer()).then((d) => { if (d > 0) minTalk = d + 0.4; }).catch(() => {});
      } catch { /* the recording is optional */ }
    }
  };
  const decline = () => {
    if (state !== 'ringing') return;
    state = 'declined';
    declined = true;
    declineHold = 0;
    statusEl.textContent = 'Declined';
    iconEl.textContent = '✗';
    iconEl.classList.remove('ph-ico-ring');
    avaEl.classList.remove('ph-ava-ring');
    actionsEl.style.display = 'none';
  };
  const skip = () => {
    if (state !== 'talking') return;
    if (shown < (lines[li]?.length ?? 0)) shown = lines[li].length; // finish the line
    else hold = 0; // advance immediately
  };

  // Mouse.
  answerBtn.addEventListener('click', answer);
  declineBtn.addEventListener('click', decline);
  root.addEventListener('click', (e) => {
    if (e.target === answerBtn || e.target === declineBtn) return;
    skip();
  });
  // Keyboard (ringing only; talking uses readMenu.confirm so a single keypress
  // that answers can't also skip line one). Guarded so double-calls are safe.
  window.addEventListener('keydown', (e) => {
    if (state !== 'ringing') return;
    if (e.code === 'Enter' || e.code === 'KeyA') { answer(); swallowConfirm = true; }
    else if (e.code === 'Escape') { decline(); }
  });

  // --- Texts (WhatsApp bubbles) ---
  /** @type {Array<{el: HTMLElement, t: number}>} */
  const texts = [];
  const timeNow = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  return {
    /**
     * @param {string} caller @param {string[]} callLines
     * @param {(() => Promise<number>|number)=} startClip  plays her recording on Answer;
     *   resolves to the clip length so the call stays open until she's finished
     */
    start(caller, callLines, startClip) {
      lines = callLines.slice();
      li = 0; shown = 0; hold = 0; declineHold = 0;
      state = 'ringing'; done = false; answered = false; declined = false;
      swallowConfirm = false;
      onAnswer = startClip || null;
      nameEl.textContent = caller;
      avaEl.textContent = (caller || '?').trim().charAt(0).toUpperCase();
      avaEl.classList.add('ph-ava-ring');
      iconEl.textContent = '📞';
      iconEl.classList.add('ph-ico-ring');
      statusEl.innerHTML = 'mobile · incoming call<span class="ph-dot">.</span>' +
        '<span class="ph-dot">.</span><span class="ph-dot">.</span>';
      actionsEl.style.display = 'flex';
      subEl.style.display = 'none';
      subEl.textContent = '';
      hintEl.style.display = 'none';
      root.style.display = 'block';
      // Free the cursor — mouse-look holds pointer lock, which would hide the
      // pointer and make Answer/Decline unclickable (keys still work anyway).
      document.exitPointerLock?.();
    },

    /** Age the text bubbles — call every update tick, whatever the call is doing. */
    tickTexts(dt) {
      for (let i = texts.length - 1; i >= 0; i--) {
        const tx = texts[i];
        tx.t += dt;
        if (tx.t > TEXT_SHOW && !tx.fading) { tx.fading = true; tx.el.style.opacity = '0'; tx.el.style.transform = 'translateX(30px)'; }
        if (tx.t > TEXT_SHOW + 0.6) { tx.el.remove(); texts.splice(i, 1); restack(); }
      }
    },

    update(dt) {
      if (state === 'idle' || done) return;

      let m = null;
      try { m = readMenu?.(); } catch { m = null; }

      if (state === 'ringing') {
        if (m?.confirm) answer();
        else if (m?.back) decline();
        return;
      }

      if (state === 'declined') {
        declineHold += dt;
        if (declineHold >= DECLINE_HOLD) done = true;
        return;
      }

      // talking: controller/keyboard skip via readMenu.confirm.
      talkT += dt;
      if (m?.confirm) { if (swallowConfirm) swallowConfirm = false; else skip(); }

      const line = lines[li] ?? '';
      if (shown < line.length) {
        shown = Math.min(line.length, shown + CPS * dt);
        subEl.textContent = line.slice(0, Math.floor(shown));
      } else if (hold < LINE_HOLD) {
        hold += dt;
      } else if (li < lines.length - 1) {
        li++; shown = 0; hold = 0;
        subEl.textContent = '';
      } else {
        hold += dt;
        // With a recording, keep her on the line until she's actually finished.
        if (hold >= LINE_HOLD + END_HOLD && talkT >= minTalk) done = true;
      }
    },

    /**
     * A text from her — WhatsApp bubble, top-right, gone after a few seconds.
     * Several stack. Purely presentational.
     * @param {string} from @param {string} message
     */
    text(from, message) {
      const el = document.createElement('div');
      el.className = 'ph-text';
      el.innerHTML =
        `<div class="ph-text-hd"><span style="width:22px;height:22px;border-radius:50%;background:#f0a828;color:#141007;` +
        `display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:12px">${(from || '?').charAt(0)}</span>` +
        `<b>${from}</b><span>· WhatsApp</span></div>` +
        `<div class="ph-text-bub">${message}<div class="ph-text-time">${timeNow()} ✓✓</div></div>`;
      document.body.appendChild(el);
      texts.push({ el, t: 0 });
      restack();
    },

    hide() { state = 'idle'; root.style.display = 'none'; },
    answer, // programmatic paths (gamepad glue, tests)
    decline,
    get state() { return state; },
    get done() { return done; },
    get answered() { return answered; },
    get declined() { return declined; },
  };

  /** Stack live bubbles top-down under the corner. */
  function restack() {
    let top = 18;
    for (const tx of texts) { tx.el.style.top = top + 'px'; top += tx.el.offsetHeight + 8; }
  }
}
