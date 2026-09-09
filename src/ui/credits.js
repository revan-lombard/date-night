/**
 * @file ui/credits.js
 * @responsibility The closing sequence, after the drive home:
 *   1. "Our Story" rolls — every mission card from her PDF, in order, with the
 *      real photographs, scrolling up like film credits (wheel / stick to
 *      nudge, hold Space or Ⓐ to fast-forward, Enter to skip to the end).
 *   2. Her letter — the real one, word for word, centred, hers to him.
 *   3. The credits card — who made it, and for whom — with Relive the night.
 * DOM only; no Three.js. Styled to the PDF: gold on ink, condensed caps,
 * cyan dates, neon-outline hearts.
 *
 * @phase Ship pass.
 */

import { readMenu } from '../core/input.js';

const COND = "'Arial Narrow','Roboto Condensed','Oswald',system-ui,sans-serif";
const BODY = "system-ui,'Segoe UI',Roboto,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const GOLD = '#f0a828';
const CYAN = '#36c5ff';
const PINK = '#ff5c8a';
const BASE = import.meta.env.BASE_URL;

const SCROLL_SPEED = 46;   // px/s at rest
const FAST_MULT = 4;       // while Space / Ⓐ is held

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
.cr-root{position:fixed;inset:0;z-index:80;background:#0b0a0c;color:#ece6d6;font-family:${BODY};display:none;overflow:hidden}
.cr-root::before{content:'';position:absolute;inset:0;background:
  radial-gradient(ellipse at 50% 110%,rgba(240,120,30,.28),transparent 60%),
  radial-gradient(ellipse at 50% -20%,rgba(240,168,40,.12),transparent 55%);pointer-events:none}
.cr-roll{position:absolute;left:50%;top:0;transform:translateX(-50%);width:min(680px,92vw);will-change:transform}
.cr-hdr{text-align:center;padding-top:22vh;margin-bottom:12vh}
.cr-hdr .cr-eyebrow{font:700 14px ${COND};letter-spacing:.34em;color:${GOLD};text-transform:uppercase}
.cr-hdr h1{font:800 clamp(56px,11vw,104px)/0.95 ${COND};letter-spacing:.02em;margin:10px 0 8px;text-transform:uppercase;
  background:linear-gradient(180deg,#fff2d0,#e9c27a 55%,#b98a3a);-webkit-background-clip:text;background-clip:text;color:transparent}
.cr-hdr .cr-motto{font:italic 600 22px ${SERIF};color:${GOLD}}
.cr-card{margin:0 auto 9vh;padding:22px 26px;background:rgba(14,12,14,.86);border:1px solid rgba(240,168,40,.28);
  border-radius:6px;box-shadow:0 10px 40px rgba(0,0,0,.5);position:relative}
.cr-card::after{content:'♡';position:absolute;right:16px;top:12px;color:${GOLD};opacity:.55;font-size:18px}
.cr-tag{font:700 12.5px ${COND};letter-spacing:.3em;color:${GOLD};text-transform:uppercase}
.cr-title{font:800 34px/1.05 ${COND};letter-spacing:.03em;text-transform:uppercase;margin:6px 0 4px;color:#fff}
.cr-when{font:700 14px ${COND};letter-spacing:.14em;color:${CYAN};text-transform:uppercase;margin-bottom:10px}
.cr-text{font:500 16.5px/1.55 ${BODY};color:#e6dfd0}
.cr-photo{display:block;width:100%;border-radius:4px;margin:14px 0 4px;border:1px solid rgba(240,168,40,.35);box-shadow:0 8px 24px rgba(0,0,0,.5)}
.cr-bar{display:flex;align-items:center;gap:14px;margin:12px 0;font:600 17px ${BODY}}
.cr-bar span{flex:0 0 190px}
.cr-bar i{flex:1;height:10px;background:rgba(255,255,255,.12);border-radius:6px;overflow:hidden;display:block}
.cr-bar i b{display:block;height:100%;background:linear-gradient(90deg,#ff9a2e,${GOLD});border-radius:6px}
.cr-stat{text-align:center;padding:6vh 0 2vh}
.cr-stat .a{font:800 40px ${COND};letter-spacing:.04em;text-transform:uppercase;color:#fff}
.cr-stat .b{font:800 30px ${COND};letter-spacing:.06em;text-transform:uppercase;color:${GOLD};margin-top:4px}
.cr-stat .c{font:800 26px ${COND};letter-spacing:.08em;text-transform:uppercase;color:#7be08a;margin-top:6px}
.cr-stat .d{font:700 14px ${COND};letter-spacing:.3em;text-transform:uppercase;color:${GOLD};margin-top:22px}
.cr-stat .e{font:800 44px ${COND};letter-spacing:.1em;text-transform:uppercase;margin-top:6px}
.cr-hearts{font-size:22px;letter-spacing:4px;color:${PINK};margin-top:14px}
.cr-hint{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);font:600 12px ${BODY};color:rgba(236,230,214,.5);white-space:nowrap}
.cr-page{position:absolute;inset:0;display:none;align-items:center;justify-content:center;padding:24px}
.cr-letter{width:min(640px,90vw);max-height:88vh;overflow:auto;padding:34px 40px;background:rgba(14,12,14,.9);
  border-top:3px solid ${GOLD};border-bottom:3px solid ${GOLD};box-shadow:0 12px 50px rgba(0,0,0,.6);text-align:center}
.cr-letter .h{font:italic 700 clamp(40px,7vw,58px) ${SERIF};color:${GOLD};line-height:1.05}
.cr-letter .h::after{content:' ♡'}
.cr-letter .s{font:700 13px ${COND};letter-spacing:.34em;text-transform:uppercase;color:#ece6d6;margin:10px 0 22px}
.cr-letter p{font:500 17.5px/1.6 ${BODY};color:#efe9dc;margin:0 0 16px}
.cr-letter .sign{font:italic 700 36px ${SERIF};color:${GOLD};margin-top:8px}
.cr-letter .from{font:700 13px ${COND};letter-spacing:.3em;text-transform:uppercase;opacity:.75;margin-top:6px}
.cr-btn{margin-top:22px;padding:11px 28px;border:none;background:${GOLD};color:#141414;font:800 15px ${COND};
  letter-spacing:.18em;text-transform:uppercase;cursor:pointer}
.cr-btn:hover{filter:brightness(1.08)}
.cr-final .ded{font:800 30px ${COND};letter-spacing:.06em;text-transform:uppercase;color:#fff;margin-bottom:14px}
.cr-final .line{font:500 15.5px/1.7 ${BODY};color:#e6dfd0}
.cr-final .by{font:700 13px ${COND};letter-spacing:.3em;text-transform:uppercase;color:${GOLD};margin-top:22px}
.cr-final .name{font:800 26px ${COND};letter-spacing:.06em;text-transform:uppercase;margin-top:4px}
.cr-final .ayah{font:italic 500 15px ${SERIF};color:${GOLD};margin-top:18px;opacity:.9}
@media (prefers-reduced-motion:reduce){.cr-root::before{display:none}}
`;
  document.head.appendChild(s);
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/**
 * @param {Object} deps
 * @param {Array<Object>} deps.story    content/personal.js STORY
 * @param {Object} deps.letter          content/personal.js LETTER
 * @param {Object} deps.credits         content/personal.js CREDITS
 * @param {Object} deps.milestones      content/personal.js MILESTONES (future bars, motto)
 * @param {{name:string}} deps.partner  @param {{name:string}} deps.player
 */
export function createCredits({ story, letter, credits, milestones, partner, player }) {
  injectStyles();
  const root = document.createElement('div');
  root.className = 'cr-root';
  document.body.appendChild(root);

  // --- 1. the roll ---
  const roll = document.createElement('div');
  roll.className = 'cr-roll';
  let html =
    `<div class="cr-hdr"><div class="cr-eyebrow">${esc(player.name)} &amp; ${esc(partner.name)}</div>` +
    `<h1>Our<br>Story</h1><div class="cr-motto">${esc(milestones.motto)}</div></div>`;
  for (const s of story) {
    html += `<div class="cr-card"><div class="cr-tag">${esc(s.tag)}</div><div class="cr-title">${s.title}</div>`;
    if (s.when) html += `<div class="cr-when">${esc(s.when)}</div>`;
    if (s.text) html += `<div class="cr-text">${esc(s.text)}</div>`;
    if (s.bars) {
      for (const q of milestones.future) {
        html += `<div class="cr-bar"><span>${esc(q.label)}</span><i><b style="width:${Math.round(q.progress * 100)}%"></b></i></div>`;
      }
    }
    if (s.photo) html += `<img class="cr-photo" alt="" src="${BASE}photos/${s.photo}" loading="eager">`;
    html += '</div>';
  }
  html +=
    `<div class="cr-stat"><div class="a">10 years together</div><div class="b">3 years of marriage</div>` +
    `<div class="c">Mission accomplished ✓</div><div class="d">Campaign status: ongoing</div><div class="e">To be continued</div>` +
    `<div class="cr-hearts">${'♥'.repeat(10)}</div>` +
    `<div class="cr-motto" style="margin-top:18px;font:italic 600 22px ${SERIF};color:${GOLD}">${esc(milestones.motto)}</div></div>` +
    `<div style="height:55vh"></div>`;
  roll.innerHTML = html;
  root.appendChild(roll);

  const hint = document.createElement('div');
  hint.className = 'cr-hint';
  hint.textContent = 'scroll or hold Space / Ⓐ to hurry · Enter skips';
  root.appendChild(hint);

  // --- 2. the letter ---
  const letterPage = document.createElement('div');
  letterPage.className = 'cr-page';
  letterPage.innerHTML =
    `<div class="cr-letter"><div class="h">${esc(letter.heading)}</div><div class="s">${esc(letter.sub)}</div>` +
    letter.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('') +
    `<div class="sign">${esc(letter.signoff)}</div><div class="from">— ${esc(letter.from)}</div>` +
    `<button class="cr-btn" type="button" id="cr-next">Continue</button></div>`;
  root.appendChild(letterPage);

  // --- 3. credits card ---
  const finalPage = document.createElement('div');
  finalPage.className = 'cr-page';
  finalPage.innerHTML =
    `<div class="cr-letter cr-final"><div class="cr-tag">Credits</div><div class="ded">${esc(credits.dedication)}</div>` +
    credits.thanks.map((l) => `<div class="line">${esc(l)}</div>`).join('') +
    `<div class="by">Made with love by</div><div class="name">${esc(credits.madeBy)}</div>` +
    `<div class="ayah">${esc(credits.ayah)}</div>` +
    `<button class="cr-btn" type="button" id="cr-replay">↻  Relive the night</button>` +
    `<div style="font:600 12px ${BODY};opacity:.5;margin-top:10px">(R also replays)</div></div>`;
  root.appendChild(finalPage);

  let stage = 0;      // 0 hidden · 1 roll · 2 letter · 3 credits
  let y = 0;          // roll offset (px)
  let fast = false;
  let onDone = null;
  let last = 0;
  let wheelV = 0;

  const rollEnd = () => Math.max(0, roll.scrollHeight - (window.innerHeight || root.clientHeight || 720) * 0.55);

  function setStage(n) {
    stage = n;
    roll.style.display = n === 1 ? 'block' : 'none';
    hint.style.display = n === 1 ? 'block' : 'none';
    letterPage.style.display = n === 2 ? 'flex' : 'none';
    finalPage.style.display = n === 3 ? 'flex' : 'none';
    readMenu(); // swallow the edge that got us here
  }
  const advance = () => {
    if (stage === 1) { if (y < rollEnd() - 4) { y = rollEnd(); roll.style.transform = `translate(-50%,${-y}px)`; } else setStage(2); }
    else if (stage === 2) setStage(3);
    else if (stage === 3) onDone?.();
  };

  let enterEdge = false; // Enter skips the roll to its end (Space/Ⓐ only hurry it)
  root.addEventListener('wheel', (e) => { if (stage === 1) { wheelV += e.deltaY * 0.9; e.preventDefault(); } }, { passive: false });
  root.addEventListener('click', (e) => { if (stage === 1 && e.target === root) fast = !fast; });
  letterPage.querySelector('#cr-next').addEventListener('click', () => setStage(3));
  finalPage.querySelector('#cr-replay').addEventListener('click', () => onDone?.());
  window.addEventListener('keydown', (e) => {
    if (!stage) return;
    if (e.code === 'Enter' && stage === 1) enterEdge = true;
    if (e.code === 'KeyR' && stage === 3) onDone?.();
  });

  return {
    /** Begin the sequence. `done` fires from the final card's Relive button. */
    show(done) {
      onDone = done;
      y = 0;
      root.style.display = 'block';
      roll.style.transform = 'translate(-50%,0)';
      last = performance.now();
      setStage(1);
    },
    hide() { stage = 0; root.style.display = 'none'; },
    /** Poll once per frame while active: scroll the roll, read pad/keys. */
    update() {
      if (!stage) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      let m = null;
      try { m = readMenu?.(); } catch { m = null; }
      if (stage === 1) {
        const atEnd = y >= rollEnd() - 4;
        if (enterEdge) { enterEdge = false; if (!atEnd) y = rollEnd(); else { setStage(2); return; } }
        const held = fast || !!m?.confirmHeld;
        y += SCROLL_SPEED * (held ? FAST_MULT : 1) * dt + wheelV * dt * 6;
        wheelV *= Math.exp(-6 * dt);
        if (m?.down) y += 120;
        if (m?.up) y -= 120;
        y = Math.max(0, Math.min(rollEnd(), y));
        roll.style.transform = `translate(-50%,${-y}px)`;
        if (m?.confirm && atEnd) setStage(2);
        else if (atEnd) hint.textContent = 'Enter / Space / Ⓐ to continue';
      } else if (m?.confirm) {
        advance();
      }
    },
    get active() { return stage > 0; },
  };
}
