/**
 * @file ui/redeem.js
 * @responsibility The "redeem your code" screen — the first thing he sees, the
 * way a digital game asks for the key from its case. Five boxes of four
 * characters; typing anywhere fills them and auto-advances, Backspace steps
 * back, paste fills the lot, Enter redeems. The code is checked against a
 * fingerprint only (core/keyhash.js), then remembered in the save so the
 * screen never comes back on that laptop. Wrong code: a shake and a message.
 *
 * Styled like the title menu (ink, gold, condensed caps) over the live dusk
 * city. Needs a keyboard — you can't type a 20-character code on a pad.
 *
 * @phase Ship pass (the game case).
 */

import { createLogo } from './logo.js';
import { hashKey, normaliseKey } from '../core/keyhash.js';

const COND = "'Arial Narrow','Roboto Condensed','Oswald',system-ui,sans-serif";
const BODY = "system-ui,'Segoe UI',Roboto,sans-serif";
const MONO = "'Cascadia Mono','Consolas','JetBrains Mono',ui-monospace,monospace";
const GOLD = '#f0a828';
const isEnter = (e) => e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.keyCode === 13;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
.rd-root{position:fixed;inset:0;z-index:95;display:none;align-items:center;justify-content:center;
  background:radial-gradient(ellipse at 50% 30%,rgba(26,18,10,.55),rgba(8,7,9,.92) 70%);font-family:${BODY};color:#ece6d6}
.rd-panel{width:min(640px,94vw);padding:26px 30px 28px;background:rgba(12,11,13,.9);border-top:3px solid ${GOLD};
  border-bottom:3px solid ${GOLD};box-shadow:0 14px 60px rgba(0,0,0,.7);text-align:center}
.rd-prod{font:700 12px ${COND};letter-spacing:.34em;text-transform:uppercase;color:${GOLD};margin:12px 0 2px}
.rd-title{font:800 30px ${COND};letter-spacing:.06em;text-transform:uppercase;color:#fff;margin:4px 0 6px}
.rd-hint{font:500 15px/1.5 ${BODY};color:#cfc7b6;margin:0 0 20px}
.rd-boxes{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.rd-box{width:88px;height:54px;border:2px solid rgba(240,168,40,.35);background:rgba(255,255,255,.04);border-radius:4px;
  font:700 24px ${MONO};letter-spacing:.14em;color:#fff;text-align:center;text-transform:uppercase;outline:none;
  transition:border-color .12s,background .12s;caret-color:${GOLD}}
.rd-box:focus{border-color:${GOLD};background:rgba(240,168,40,.08)}
.rd-box.is-full{border-color:rgba(240,168,40,.7)}
.rd-dash{align-self:center;color:rgba(240,168,40,.6);font:700 22px ${MONO}}
.rd-msg{min-height:22px;margin-top:14px;font:600 14px ${BODY};color:#ff5d5d;opacity:0;transition:opacity .2s}
.rd-msg.is-on{opacity:1}
.rd-btn{margin-top:14px;padding:12px 34px;border:none;background:${GOLD};color:#141414;font:800 15px ${COND};
  letter-spacing:.2em;text-transform:uppercase;cursor:pointer;transition:filter .12s,transform .1s}
.rd-btn:hover{filter:brightness(1.08)}
.rd-btn:disabled{opacity:.45;cursor:default}
.rd-foot{margin-top:16px;font:600 11.5px ${BODY};color:rgba(236,230,214,.45);letter-spacing:.04em}
@keyframes rd-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-9px)}40%,80%{transform:translateX(9px)}}
.rd-panel.is-shake{animation:rd-shake .45s ease}
.rd-panel.is-ok{border-color:#7be08a}
.rd-panel.is-ok .rd-box{border-color:#7be08a;color:#7be08a}
@media (prefers-reduced-motion:reduce){.rd-panel.is-shake{animation:none}}
`;
  document.head.appendChild(s);
}

/**
 * @param {Object} cfg  content/personal.js GAME_KEY
 */
export function createRedeem(cfg) {
  injectStyles();
  const root = document.createElement('div');
  root.className = 'rd-root';
  const panel = document.createElement('div');
  panel.className = 'rd-panel';
  root.appendChild(panel);
  document.body.appendChild(root);

  panel.appendChild(createLogo({ compact: true }));
  panel.insertAdjacentHTML('beforeend',
    `<div class="rd-prod">${cfg.product}</div>` +
    `<div class="rd-title">${cfg.title}</div>` +
    `<div class="rd-hint">${cfg.hint}</div>`);

  const boxesEl = document.createElement('div');
  boxesEl.className = 'rd-boxes';
  panel.appendChild(boxesEl);
  /** @type {HTMLInputElement[]} */
  const boxes = [];
  for (let i = 0; i < cfg.groups; i++) {
    if (i) { const d = document.createElement('span'); d.className = 'rd-dash'; d.textContent = '–'; boxesEl.appendChild(d); }
    const inp = document.createElement('input');
    inp.className = 'rd-box';
    inp.type = 'text';
    inp.maxLength = cfg.groupLen;
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.setAttribute('aria-label', `Code group ${i + 1}`);
    boxesEl.appendChild(inp);
    boxes.push(inp);
  }

  const msg = document.createElement('div');
  msg.className = 'rd-msg';
  panel.appendChild(msg);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rd-btn';
  btn.textContent = 'Redeem';
  btn.disabled = true;
  panel.appendChild(btn);
  panel.insertAdjacentHTML('beforeend', `<div class="rd-foot">Letters and numbers only · dashes are optional · Enter to redeem</div>`);

  let open = false;
  let onDone = null;
  const value = () => boxes.map((b) => normaliseKey(b.value)).join('');
  const total = cfg.groups * cfg.groupLen;

  function refresh() {
    for (const b of boxes) b.classList.toggle('is-full', normaliseKey(b.value).length === cfg.groupLen);
    btn.disabled = value().length !== total;
  }
  /** Distribute a normalised string across the boxes from `start`. */
  function fill(str, start = 0) {
    let s = normaliseKey(str);
    for (let i = start; i < boxes.length && s.length; i++) {
      boxes[i].value = s.slice(0, cfg.groupLen);
      s = s.slice(cfg.groupLen);
    }
    const next = boxes.findIndex((b) => normaliseKey(b.value).length < cfg.groupLen);
    (next >= 0 ? boxes[next] : boxes[boxes.length - 1]).focus();
    refresh();
  }
  function fail() {
    msg.textContent = cfg.wrong;
    msg.classList.add('is-on');
    panel.classList.remove('is-shake');
    void panel.offsetWidth; // restart the animation
    panel.classList.add('is-shake');
    for (const b of boxes) b.value = ''; // start clean — no half-edited groups
    refresh();
    boxes[0].focus();
  }
  function redeem() {
    if (value().length !== total) return;
    if (hashKey(value()) !== cfg.hash) { fail(); return; }
    msg.classList.remove('is-on');
    panel.classList.add('is-ok');
    btn.textContent = 'Redeemed ✓';
    btn.disabled = true;
    setTimeout(() => { hide(); onDone?.(); }, 650);
  }

  boxes.forEach((b, i) => {
    b.addEventListener('input', () => {
      const clean = normaliseKey(b.value);
      if (clean.length > cfg.groupLen) { fill(clean, i); return; }
      b.value = clean;
      if (clean.length === cfg.groupLen && i < boxes.length - 1) boxes[i + 1].focus();
      msg.classList.remove('is-on');
      refresh();
    });
    b.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !b.value && i > 0) { boxes[i - 1].focus(); boxes[i - 1].value = boxes[i - 1].value.slice(0, -1); refresh(); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' && i > 0 && b.selectionStart === 0) boxes[i - 1].focus();
      else if (e.key === 'ArrowRight' && i < boxes.length - 1 && b.selectionStart === b.value.length) boxes[i + 1].focus();
      else if (isEnter(e)) redeem();
      e.stopPropagation(); // never reach the game's own key handlers
    });
    b.addEventListener('paste', (e) => {
      e.preventDefault();
      fill((e.clipboardData || window.clipboardData).getData('text'), 0);
    });
  });
  btn.addEventListener('click', redeem);
  const nextBox = () => boxes.find((b) => normaliseKey(b.value).length < cfg.groupLen) || boxes[boxes.length - 1];
  // Clicking anywhere that isn't a box or the button puts the cursor back.
  root.addEventListener('mousedown', (e) => {
    if (boxes.includes(e.target) || e.target === btn) return;
    setTimeout(() => nextBox().focus(), 0);
  });
  // And typing anywhere while the screen is up lands in the boxes — he should
  // never have to hunt for a cursor. (Captured before the game's own handlers.)
  window.addEventListener('keydown', (e) => {
    if (!open || boxes.includes(document.activeElement)) return;
    if (isEnter(e)) { redeem(); e.stopPropagation(); return; }
    if (/^[a-z0-9]$/i.test(e.key)) {
      const b = nextBox();
      b.focus();
      b.value = normaliseKey(b.value + e.key);
      b.dispatchEvent(new Event('input'));
      e.preventDefault();
    }
    e.stopPropagation();
  }, true);

  function show(done) {
    onDone = done;
    open = true;
    root.style.display = 'flex';
    for (const b of boxes) b.value = '';
    panel.classList.remove('is-ok', 'is-shake');
    btn.textContent = 'Redeem';
    refresh();
    setTimeout(() => boxes[0].focus(), 50);
  }
  function hide() { open = false; root.style.display = 'none'; }

  return { show, hide, get isOpen() { return open; }, _redeem: (code) => { fill(code, 0); redeem(); } };
}
