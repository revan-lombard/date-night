/**
 * @file ui/pickpanel.js
 * @responsibility A small centred choice overlay — used at the florist to pick
 * which bouquet to buy. Selectable by mouse click, number keys (1–4), or
 * controller (up/down + confirm; back/Esc cancels).
 *
 * @phase Phase 3.7.
 */

import { readMenu } from '../core/input.js';

export function createPickPanel() {
  const root = document.createElement('div');
  root.style.cssText =
    'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:80;display:none;' +
    'min-width:min(460px,92vw);padding:18px 22px;border-radius:16px;font-family:system-ui,sans-serif;' +
    'background:rgba(18,20,28,.95);border:1px solid rgba(255,255,255,.14);color:#fff;box-shadow:0 12px 44px rgba(0,0,0,.6);';
  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font:800 20px system-ui,sans-serif;margin-bottom:14px;';
  root.appendChild(titleEl);
  const list = document.createElement('div');
  root.appendChild(list);
  const hint = document.createElement('div');
  hint.style.cssText = 'margin-top:10px;font:600 12px system-ui,sans-serif;opacity:.5;text-align:right;';
  hint.textContent = '1–4 / click · Esc to cancel';
  root.appendChild(hint);
  document.body.appendChild(root);

  let options = [];
  let onPick = null;
  let focus = 0;
  let open = false;
  const buttons = [];

  const paint = () => buttons.forEach((b, i) => {
    b.style.borderColor = i === focus ? '#ff5c8a' : 'transparent';
    b.style.background = i === focus ? 'rgba(255,92,138,.18)' : 'rgba(255,255,255,.06)';
  });

  function render() {
    list.innerHTML = '';
    buttons.length = 0;
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.style.cssText =
        'display:flex;align-items:center;gap:12px;width:100%;text-align:left;margin:6px 0;padding:12px 14px;' +
        'border:2px solid transparent;border-radius:10px;background:rgba(255,255,255,.06);color:#fff;' +
        'font:700 16px system-ui,sans-serif;cursor:pointer;';
      const hex = (o.color ?? 0xffffff).toString(16).padStart(6, '0');
      b.innerHTML = `<span style="width:18px;height:18px;border-radius:50%;flex:none;background:#${hex}"></span>` +
        `<span>${i + 1}. ${o.label}</span>`;
      b.addEventListener('mouseenter', () => { focus = i; paint(); });
      b.addEventListener('click', () => pick(i));
      list.appendChild(b);
      buttons.push(b);
    });
    paint();
  }

  function pick(i) {
    if (!open) return;
    const cb = onPick;
    hide();
    cb?.(i);
  }

  window.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.code === 'Escape') hide();
    else if (/^Digit[1-9]$/.test(e.code)) { const i = +e.code.slice(5) - 1; if (i < options.length) pick(i); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { focus = (focus - 1 + options.length) % options.length; paint(); }
    else if (e.code === 'ArrowDown' || e.code === 'KeyS') { focus = (focus + 1) % options.length; paint(); }
    else if (e.code === 'Enter') pick(focus);
  });

  function hide() { open = false; root.style.display = 'none'; }

  return {
    /** @param {string} title @param {{label:string,color?:number}[]} opts @param {(i:number)=>void} cb */
    open(title, opts, cb) {
      options = opts; onPick = cb; focus = 0; open = true;
      titleEl.textContent = title;
      render();
      root.style.display = 'block';
    },
    hide,
    /** Controller navigation (call each frame). */
    update() {
      if (!open) return;
      let m = null;
      try { m = readMenu(); } catch { m = null; }
      if (!m) return;
      if (m.down) { focus = (focus + 1) % options.length; paint(); }
      if (m.up) { focus = (focus - 1 + options.length) % options.length; paint(); }
      if (m.confirm) pick(focus);
      else if (m.back) hide();
    },
    get isOpen() { return open; },
  };
}
