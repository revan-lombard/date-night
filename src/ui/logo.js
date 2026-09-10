/**
 * @file ui/logo.js
 * @responsibility The OUR STORY wordmark — a reusable, self-contained element the
 * menu embeds, styled after the PDF's title screen (and GTA V loading art):
 * stacked condensed uppercase words in a cream→gold faceted fill on a dark
 * ground, with a small gold heart/dusk-sun motif. Pure inline SVG + CSS (no
 * images, no external fonts), so it stays crisp at any size.
 *
 * @phase Front-end shell; re-skinned to "Our Story" (gold-on-black) with the PDF.
 */

// Palette (kept local so the wordmark reads the same wherever it is embedded).
const CREAM = '#efe6d2';
const GOLD = '#f0a828';
const AMBER = '#c8791f';
const BROWN = '#5a3512';
const NIGHT = '#120d08';

let uid = 0; // unique gradient/clip ids so multiple logos can coexist.

/**
 * Build the OUR STORY wordmark as a standalone element.
 * @param {{ compact?: boolean }} [opts] compact trims padding for the pause header.
 * @returns {HTMLDivElement}
 */
export function createLogo(opts = {}) {
  const id = `dn${++uid}`;
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'width:100%;max-width:560px;margin:0 auto;user-select:none;line-height:0;' +
    (opts.compact ? '' : 'filter:drop-shadow(0 10px 28px rgba(240,168,40,.28));');
  wrap.innerHTML = svgMarkup(id);
  return wrap;
}

/**
 * The wordmark as an HTML string (for callers that build markup by hand).
 * @param {{ compact?: boolean }} [opts]
 * @returns {string}
 */
export function logoHTML(opts = {}) {
  const id = `dn${++uid}`;
  const style = 'width:100%;max-width:560px;margin:0 auto;user-select:none;line-height:0;' +
    (opts.compact ? '' : 'filter:drop-shadow(0 10px 28px rgba(240,168,40,.28));');
  return `<div style="${style}">${svgMarkup(id)}</div>`;
}

/** @param {string} id @returns {string} */
function svgMarkup(id) {
  // Condensed heavy stack, close to the PDF's distressed poster type.
  const FONT = "'Arial Narrow','Roboto Condensed','Oswald',system-ui,sans-serif";
  const words = (fill, stroke, sw, extra = '') => `
    <text x="260" y="104" text-anchor="middle" font-family="${FONT}"
      font-size="120" font-weight="900" letter-spacing="8"
      fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw}"` : ''} ${extra}>OUR</text>
    <text x="260" y="216" text-anchor="middle" font-family="${FONT}"
      font-size="120" font-weight="900" letter-spacing="2"
      fill="${fill}" ${stroke ? `stroke="${stroke}" stroke-width="${sw}"` : ''} ${extra}>STORY</text>`;

  // Faceted low-poly slabs over the gradient fake the flat poster look.
  const facets =
    `<polygon points="0,0 520,0 520,60 0,100" fill="#ffffff" opacity="0.12"/>` +
    `<polygon points="0,100 520,60 520,130 0,160" fill="${GOLD}" opacity="0.18"/>` +
    `<polygon points="0,160 520,130 520,240 0,240" fill="${BROWN}" opacity="0.30"/>` +
    `<polygon points="60,0 210,0 120,240 0,240 0,120" fill="#ffffff" opacity="0.05"/>`;

  return `
<svg viewBox="0 0 520 240" width="100%" role="img"
     aria-label="OUR STORY" style="overflow:visible;display:block">
  <defs>
    <linearGradient id="${id}g" x1="0" y1="0" x2="0.1" y2="1">
      <stop offset="0" stop-color="${CREAM}"/>
      <stop offset="0.5" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${AMBER}"/>
    </linearGradient>
    <radialGradient id="${id}sun" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#ffe6b0"/>
      <stop offset="0.55" stop-color="${GOLD}"/>
      <stop offset="1" stop-color="${AMBER}"/>
    </radialGradient>
    <clipPath id="${id}clip">${words('#fff')}</clipPath>
  </defs>

  <!-- Faceted gradient fill, revealed only through the letterforms. -->
  <g clip-path="url(#${id}clip)">
    <rect x="0" y="0" width="520" height="240" fill="url(#${id}g)"/>
    ${facets}
  </g>

  <!-- Crisp outline so the mark holds up on any background. -->
  <g fill="none">${words('none', NIGHT, 2, 'opacity="0.5"')}</g>
</svg>`;
}
