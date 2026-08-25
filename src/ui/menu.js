/**
 * @file ui/menu.js
 * @responsibility The front-end shell: a full-screen dusk overlay that serves
 * both the title menu (Start / Settings / Credits) and the in-game pause menu
 * (Resume / Settings / Quit to Title). Owns the settings model — reduce motion,
 * invert-Y, mouse sensitivity, sprint toggle, master volume, mute — persisting
 * it to localStorage and pushing live changes to the game. Navigable by mouse,
 * keyboard and controller: keyboard + pad come through readMenu() (polled from
 * our own rAF loop), mouse via hover/click wired directly on each control.
 *
 * @phase Front-end shell (start menu / pause / credits / settings).
 */

import { readMenu } from '../core/input.js';
import { createLogo } from './logo.js';
import { PEOPLE, PLACES, MILESTONES } from '../content/personal.js';

const STORAGE_KEY = 'datenight.settings';

/**
 * @typedef {Object} Settings
 * @property {boolean} reduceMotion   disable FOV shift / camera shake / menu anims
 * @property {boolean} invertY        invert vertical mouse/stick look
 * @property {number}  mouseSensitivity  look sensitivity, 0.5 .. 2.0
 * @property {boolean} sprintToggle   sprint is a toggle rather than hold
 * @property {number}  masterVolume   0 .. 100
 * @property {boolean} muted          mute all audio
 */

/** @type {Settings} */
const DEFAULTS = {
  reduceMotion: false,
  invertY: false,
  mouseSensitivity: 1.0,
  sprintToggle: false,
  masterVolume: 80,
  muted: false,
};

/**
 * @typedef {Object} MenuHandle
 * @property {() => void} showTitle
 * @property {() => void} showPause
 * @property {() => void} hide
 * @property {boolean} isOpen
 * @property {() => Settings} getSettings
 */

/**
 * @param {Object} opts
 * @param {() => void} opts.onStart               start a fresh game
 * @param {(s: Settings) => void} opts.onSettingsChange  live settings updates
 * @param {Partial<Settings>} [opts.settings]     caller-supplied overrides
 * @param {() => void} [opts.onQuit]              Quit-to-Title from the pause menu
 * @param {string} [opts.version]                 shown on the credits screen
 * @returns {MenuHandle}
 */
export function createMenu(opts) {
  const settings = loadSettings(opts.settings);
  const version = opts.version || '';

  injectStyles();

  const overlay = document.createElement('div');
  overlay.className = 'dn-menu';
  overlay.style.display = 'none';

  const panel = document.createElement('div');
  panel.className = 'dn-menu-panel';
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  let open = false;
  let screen = 'title';        // 'title' | 'pause' | 'settings' | 'credits'
  let returnScreen = 'title';  // where Back / Esc goes from settings & credits
  let focusIndex = 0;
  let rafId = 0;
  /** @type {Array<{focusEl:HTMLElement, activate?:()=>void, adjust?:(d:number)=>void}>} */
  let controls = [];

  applyReduceClass();

  // --- settings model -------------------------------------------------------

  function pushSettings() {
    saveSettings(settings);
    applyReduceClass();
    try { opts.onSettingsChange?.({ ...settings }); } catch { /* never break the menu */ }
  }
  function applyReduceClass() {
    overlay.classList.toggle('dn-reduce', !!settings.reduceMotion);
  }

  // --- focus / navigation ---------------------------------------------------

  function setFocus(i) {
    if (!controls.length) return;
    focusIndex = (i + controls.length) % controls.length;
    controls.forEach((c, idx) => c.focusEl.classList.toggle('is-focus', idx === focusIndex));
  }
  const move = (d) => setFocus(focusIndex + d);
  const adjust = (d) => controls[focusIndex]?.adjust?.(d);
  const activate = () => controls[focusIndex]?.activate?.();

  function goBack() {
    if (screen === 'settings' || screen === 'credits') render(returnScreen);
    else if (screen === 'pause') resume();
    // title: nothing to go back to.
  }

  // --- input loop (keyboard + controller via readMenu) ----------------------

  function tick() {
    if (!open) { rafId = 0; return; }
    let m = null;
    try { m = readMenu?.(); } catch { m = null; }
    if (m) {
      if (m.up) move(-1);
      if (m.down) move(1);
      if (m.left) adjust(-1);
      if (m.right) adjust(1);
      if (m.confirm) activate();
      if (m.back) goBack();
      if (m.pause && screen === 'pause') resume();
    }
    rafId = requestAnimationFrame(tick);
  }
  function startLoop() { if (!rafId) rafId = requestAnimationFrame(tick); }

  // --- control builders -----------------------------------------------------

  /** @param {string} label @param {()=>void} onClick @param {string} [variant] */
  function button(label, onClick, variant = '') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `dn-btn ${variant}`.trim();
    el.textContent = label;
    const c = { focusEl: el, activate: onClick };
    el.addEventListener('mouseenter', () => setFocus(controls.indexOf(c)));
    el.addEventListener('click', onClick);
    controls.push(c);
    return el;
  }

  /** A settings toggle row (label + On/Off pill). @param {keyof Settings} key */
  function toggleRow(key, label) {
    const row = document.createElement('div');
    row.className = 'dn-row';
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'dn-toggle';
    const paint = () => {
      const on = !!settings[key];
      pill.textContent = on ? 'On' : 'Off';
      pill.classList.toggle('is-on', on);
    };
    const flip = () => { settings[key] = !settings[key]; paint(); pushSettings(); };
    const set = (on) => { if (!!settings[key] !== on) flip(); };
    paint();
    row.innerHTML = `<span class="dn-row-label">${label}</span>`;
    row.appendChild(pill);
    const c = { focusEl: row, activate: flip, adjust: (d) => set(d > 0) };
    row.addEventListener('mouseenter', () => setFocus(controls.indexOf(c)));
    pill.addEventListener('click', flip);
    controls.push(c);
    return row;
  }

  /**
   * A settings slider row. @param {keyof Settings} key
   * @param {(v:number)=>string} fmt value readout formatter
   */
  function sliderRow(key, label, min, max, step, fmt) {
    const row = document.createElement('div');
    row.className = 'dn-row';
    row.innerHTML = `<span class="dn-row-label">${label}</span>`;
    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'dn-range';
    range.min = String(min); range.max = String(max); range.step = String(step);
    range.value = String(settings[key]);
    const out = document.createElement('span');
    out.className = 'dn-val';
    const paint = () => { out.textContent = fmt(Number(settings[key])); };
    const commit = (v) => {
      settings[key] = clamp(round(v, step), min, max);
      range.value = String(settings[key]); paint(); pushSettings();
    };
    paint();
    row.appendChild(range);
    row.appendChild(out);
    const c = { focusEl: row, adjust: (d) => commit(Number(settings[key]) + d * step) };
    row.addEventListener('mouseenter', () => setFocus(controls.indexOf(c)));
    range.addEventListener('input', () => commit(Number(range.value)));
    range.addEventListener('mousedown', () => setFocus(controls.indexOf(c)));
    controls.push(c);
    return row;
  }

  // --- screens --------------------------------------------------------------

  function render(next) {
    screen = next;
    panel.innerHTML = '';
    controls = [];
    if (next === 'title') renderTitle();
    else if (next === 'pause') renderPause();
    else if (next === 'settings') renderSettings();
    else if (next === 'credits') renderCredits();
    setFocus(0);
  }

  function heading(text) {
    const h = document.createElement('div');
    h.className = 'dn-heading';
    h.textContent = text;
    panel.appendChild(h);
  }

  function renderTitle() {
    panel.appendChild(createLogo());
    const tag = document.createElement('div');
    tag.className = 'dn-tag';
    tag.textContent = 'ONE TEAM · ONE MISSION · ONE GOD';
    panel.appendChild(tag);
    const col = column();
    col.appendChild(button('Start Game', () => { hide(); try { opts.onStart?.(); } catch { /* ignore */ } }, 'dn-primary'));
    col.appendChild(button('Settings', () => { returnScreen = 'title'; render('settings'); }));
    col.appendChild(button('Credits', () => { returnScreen = 'title'; render('credits'); }));
    panel.appendChild(col);
    const press = document.createElement('div');
    press.className = 'dn-press';
    press.textContent = 'PRESS START TO CONTINUE';
    panel.appendChild(press);
  }

  function renderPause() {
    panel.appendChild(createLogo({ compact: true }));
    heading('Paused');
    const col = column();
    col.appendChild(button('Resume', resume, 'dn-primary'));
    col.appendChild(button('Settings', () => { returnScreen = 'pause'; render('settings'); }));
    col.appendChild(button('Quit to Title', () => { try { opts.onQuit?.(); } catch { /* ignore */ } render('title'); }));
    panel.appendChild(col);
  }

  function renderSettings() {
    heading('Settings');
    const list = document.createElement('div');
    list.className = 'dn-list';
    list.appendChild(toggleRow('reduceMotion', 'Reduce motion'));
    list.appendChild(toggleRow('invertY', 'Invert look (Y)'));
    list.appendChild(sliderRow('mouseSensitivity', 'Look sensitivity', 0.5, 2.0, 0.1, (v) => `${v.toFixed(1)}x`));
    list.appendChild(toggleRow('sprintToggle', 'Sprint is a toggle'));
    list.appendChild(sliderRow('masterVolume', 'Master volume', 0, 100, 5, (v) => `${Math.round(v)}%`));
    list.appendChild(toggleRow('muted', 'Mute audio'));
    panel.appendChild(list);
    const col = column();
    col.appendChild(button('Back', goBack));
    panel.appendChild(col);
  }

  function renderCredits() {
    heading('Credits');
    const list = document.createElement('div');
    list.className = 'dn-credits';
    const lines = [
      'OUR STORY',
      'Ten years · ' + (MILESTONES?.anniversary || ''),
      `Met at ${PLACES?.venue || ''}`,
      'Made with Three.js · Built with Claude Code',
      '',
      `For ${PEOPLE.partner.name} & ${PEOPLE.player.name}`,
    ];
    if (version) lines.push('', `v${version}`);
    list.innerHTML = lines
      .map((l) => l === '' ? '<div class="dn-cr-gap"></div>'
        : `<div class="dn-cr-line${l.startsWith('For ') ? ' dn-cr-love' : ''}">${l}</div>`)
      .join('');
    panel.appendChild(list);
    const col = column();
    col.appendChild(button('Back', goBack));
    panel.appendChild(col);
  }

  function column() {
    const c = document.createElement('div');
    c.className = 'dn-col';
    return c;
  }

  // --- public API -----------------------------------------------------------

  function showTitle() { open = true; overlay.style.display = 'flex'; render('title'); startLoop(); }
  function showPause() { open = true; overlay.style.display = 'flex'; render('pause'); startLoop(); }
  function hide() { open = false; overlay.style.display = 'none'; if (rafId) cancelAnimationFrame(rafId); rafId = 0; }
  function resume() { hide(); }

  return {
    showTitle,
    showPause,
    hide,
    get isOpen() { return open; },
    getSettings() { return { ...settings }; },
  };
}

// --- persistence (never throws) ---------------------------------------------

/** @param {Partial<Settings>} [override] @returns {Settings} */
function loadSettings(override) {
  let stored = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) stored = JSON.parse(raw) || {};
  } catch { stored = {}; }
  const merged = { ...DEFAULTS, ...stored, ...(override || {}) };
  // Coerce & clamp so a hand-edited store can't feed the game garbage.
  return {
    reduceMotion: !!merged.reduceMotion,
    invertY: !!merged.invertY,
    mouseSensitivity: clamp(Number(merged.mouseSensitivity) || 1.0, 0.5, 2.0),
    sprintToggle: !!merged.sprintToggle,
    masterVolume: clamp(Math.round(Number(merged.masterVolume)) || 0, 0, 100),
    muted: !!merged.muted,
  };
}

/** @param {Settings} s */
function saveSettings(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}

// --- helpers ----------------------------------------------------------------

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, step) => Math.round(v / step) * step;

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const cond = "'Arial Narrow','Roboto Condensed','Oswald',system-ui,sans-serif";
  const css = `
.dn-menu{position:fixed;inset:0;z-index:120;display:flex;align-items:center;justify-content:center;
  font-family:system-ui,Segoe UI,Roboto,sans-serif;color:#ece7db;padding:24px;box-sizing:border-box;
  background:
    radial-gradient(120% 80% at 50% 108%, rgba(240,168,40,.30), rgba(240,168,40,0) 55%),
    radial-gradient(90% 55% at 50% 100%, rgba(200,90,20,.25), rgba(200,90,20,0) 60%),
    linear-gradient(180deg, rgba(10,9,6,.66) 0%, rgba(18,16,11,.42) 45%, rgba(26,20,12,.34) 72%, rgba(36,23,8,.30) 100%);
  animation:dn-fade .35s ease both;}
.dn-menu.dn-reduce{animation:none}
@media (prefers-reduced-motion:reduce){.dn-menu{animation:none}}
.dn-menu-panel{width:min(560px,100%);max-height:100%;overflow:auto;display:flex;flex-direction:column;
  align-items:stretch;gap:16px;text-align:center;
  padding:30px 28px;box-sizing:border-box;
  background:rgba(8,7,5,.55);backdrop-filter:blur(5px);
  border:1px solid rgba(240,168,40,.22);box-shadow:0 20px 70px rgba(0,0,0,.6);}
.dn-tag{font-family:${cond};font-size:16px;color:#f0a828;text-transform:uppercase;
  letter-spacing:.28em;font-weight:700;margin-top:-2px;opacity:.95}
.dn-press{font-family:${cond};font-size:14px;color:#efe6d2;text-transform:uppercase;
  letter-spacing:.34em;opacity:.7;margin-top:2px;animation:dn-blink 1.6s steps(1) infinite}
.dn-reduce .dn-press{animation:none}
.dn-heading{font-family:${cond};font-size:30px;font-weight:800;letter-spacing:.14em;
  text-transform:uppercase;color:#f0a828}
.dn-col{display:flex;flex-direction:column;gap:10px}
.dn-btn{position:relative;appearance:none;border:0;border-left:3px solid rgba(240,168,40,.35);
  cursor:pointer;overflow:hidden;text-transform:uppercase;letter-spacing:.14em;
  font:700 20px ${cond};color:#ece7db;padding:14px 22px;text-align:left;
  background:rgba(20,17,11,.66);transition:color .12s ease,border-color .12s ease;}
.dn-btn::before{content:'';position:absolute;inset:0;background:#f0a828;
  transform:scaleX(0);transform-origin:left;transition:transform .16s ease;z-index:-1}
.dn-btn:hover,.dn-btn.is-focus{color:#141007;border-left-color:#ffc24d}
.dn-btn:hover::before,.dn-btn.is-focus::before{transform:scaleX(1)}
.dn-btn.dn-primary{background:rgba(240,168,40,.16);border-left-color:#f0a828;color:#ffd98a}
.dn-btn.dn-primary:hover,.dn-btn.dn-primary.is-focus{color:#141007}
.dn-btn.is-focus:focus{outline:none}
.dn-reduce .dn-btn,.dn-reduce .dn-btn::before{transition:none}
.dn-list{display:flex;flex-direction:column;gap:8px}
.dn-row{display:flex;align-items:center;gap:14px;padding:12px 16px;
  border-left:3px solid transparent;background:rgba(20,17,11,.55);text-align:left}
.dn-row.is-focus{border-left-color:#f0a828;background:rgba(240,168,40,.14)}
.dn-row-label{flex:1;font-size:17px;font-weight:600;color:#ece7db}
.dn-toggle{min-width:64px;font:700 14px ${cond};letter-spacing:.12em;text-transform:uppercase;
  cursor:pointer;color:#ece7db;padding:8px 14px;
  border:2px solid rgba(240,168,40,.35);background:rgba(20,17,11,.5)}
.dn-toggle.is-on{background:#f0a828;border-color:#f0a828;color:#141007}
.dn-range{width:180px;max-width:46vw;accent-color:#f0a828;height:26px;cursor:pointer}
.dn-val{min-width:48px;text-align:right;font-weight:700;font-variant-numeric:tabular-nums;color:#f0a828}
.dn-credits{display:flex;flex-direction:column;gap:6px;font-size:17px;line-height:1.5;color:#d8d2c4}
.dn-cr-gap{height:10px}
.dn-cr-line{opacity:.92}
.dn-cr-love{font-family:${cond};font-weight:800;font-size:22px;letter-spacing:.06em;color:#ffc24d}
@keyframes dn-fade{from{opacity:0}to{opacity:1}}
@keyframes dn-blink{0%,60%{opacity:.7}61%,100%{opacity:.15}}
`;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
