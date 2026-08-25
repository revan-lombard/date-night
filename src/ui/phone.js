/**
 * @file ui/phone.js
 * @responsibility Incoming-call overlay. A call now *rings* first: the caller
 * card pulses with two clear actions — Answer (green) and Decline (red) —
 * driven by mouse, keyboard, or controller (readMenu). Answering runs the
 * existing typewriter subtitles from CALL.lines (subtitles always on, §11;
 * click / Enter skips a line). Declining plays a brief "Declined" beat and
 * ends the call. No audio autoplays; the recorded clip is wired in Phase 6.
 *
 * @phase Ringing/Answer/Decline added in the front-end shell pass; typewriter
 * from Phase 3; audio in Phase 6.
 */

import { readMenu } from '../core/input.js';

const CPS = 34;          // characters per second
const LINE_HOLD = 1.1;   // seconds to hold a finished line
const END_HOLD = 1.0;    // seconds after the last line before `done`
const DECLINE_HOLD = 0.8; // seconds to show the "Declined" beat

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
@media (prefers-reduced-motion:reduce){
  .ph-ava-ring,.ph-ico-ring,.ph-dot{animation:none}}
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

  const answer = () => {
    if (state !== 'ringing') return;
    state = 'talking';
    answered = true;
    li = 0; shown = 0; hold = 0;
    statusEl.textContent = 'mobile · on call';
    iconEl.classList.remove('ph-ico-ring');
    avaEl.classList.remove('ph-ava-ring');
    actionsEl.style.display = 'none';
    subEl.style.display = 'block';
    hintEl.style.display = 'block';
    subEl.textContent = '';
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

  return {
    /** @param {string} caller @param {string[]} callLines */
    start(caller, callLines) {
      lines = callLines.slice();
      li = 0; shown = 0; hold = 0; declineHold = 0;
      state = 'ringing'; done = false; answered = false; declined = false;
      swallowConfirm = false;
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
        if (hold >= LINE_HOLD + END_HOLD) done = true;
      }
    },

    hide() { state = 'idle'; root.style.display = 'none'; },
    answer, // programmatic paths (gamepad glue, tests)
    decline,
    get state() { return state; },
    get done() { return done; },
    get answered() { return answered; },
    get declined() { return declined; },
  };
}
