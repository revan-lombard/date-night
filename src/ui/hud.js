/**
 * @file ui/hud.js
 * @responsibility GTA V-style heads-up display, themed to match "Our Story":
 * a circular heading-up radar (bottom-left) ringed by a drive-timer arc, a
 * location name bar beneath it, a condensed speedo, cash (top-right, green), a
 * mission/objective readout (top-left), a centre interaction prompt, an
 * off-screen waypoint arrow and a mission-card banner. DOM + one canvas; no
 * Three.js.
 *
 * Coordinates use the world (x, z) plane. Radar is heading-up: the focused
 * entity sits at the centre pointing up, the world rotates around it.
 *
 * @phase Radar/prompt/speedo added in Phase 1.5; waypoint at Phase 3;
 *   re-skinned to the GTA/Our-Story look (gold-on-black) alongside the PDF pass.
 */

const RADAR_SIZE = 176;   // px (radar diameter)
const RADAR_RANGE = 90;   // metres from centre to edge
const RING = 9;           // px thickness of the timer arc ring around the radar

// --- "Our Story" / GTA V palette -------------------------------------------
const GOLD = '#f0a828';
const GOLD_HI = '#ffc24d';
const CYAN = '#36c5ff';   // GPS route / dates (matches the PDF)
const GREEN = '#6fd66f';  // cash / success
const RED = '#ff4d4d';    // late / danger
const INK = 'rgba(9,10,13,.82)';   // panel fill
const LINE = 'rgba(240,168,40,.30)'; // gold hairline border
// Condensed, uppercase-friendly stack evoking the GTA/Pricedown loading screens.
const COND = "'Arial Narrow','Roboto Condensed','Oswald',system-ui,sans-serif";
const BODY = "system-ui,'Segoe UI',Roboto,sans-serif";

/**
 * @typedef {{x:number, z:number, kind:'car'|'player'|'waypoint'}} Blip
 * @typedef {{blocks:Array<{x:number,z:number,park:boolean}>, roadLines:number[], extent:number, block:number}} Minimap
 */

/** @param {Minimap} [minimap] static city layout drawn on the radar */
export function createHUD(minimap) {
  const root = document.createElement('div');
  root.style.cssText = `position:fixed;inset:0;pointer-events:none;z-index:50;font-family:${BODY};`;
  document.body.appendChild(root);

  const R = RADAR_SIZE / 2;

  // --- Radar (bottom-left), circular, GTA V style ---
  const radarWrap = document.createElement('div');
  radarWrap.style.cssText =
    `position:absolute;left:22px;bottom:22px;width:${RADAR_SIZE}px;height:${RADAR_SIZE}px;`;
  root.appendChild(radarWrap);

  // Timer arc ring — sits just outside the radar circle (like GTA's health arc).
  const ringSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const RS = RADAR_SIZE + RING * 2 + 6;
  ringSVG.setAttribute('width', String(RS));
  ringSVG.setAttribute('height', String(RS));
  ringSVG.style.cssText = `position:absolute;left:${-RING - 3}px;top:${-RING - 3}px;pointer-events:none;`;
  const rc = RS / 2;
  const rr = R + RING / 2 + 2;
  const circ = 2 * Math.PI * rr;
  const mkRing = (color, opacity, dash) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', String(rc)); c.setAttribute('cy', String(rc));
    c.setAttribute('r', String(rr));
    c.setAttribute('fill', 'none');
    c.setAttribute('stroke', color);
    c.setAttribute('stroke-width', String(RING));
    c.setAttribute('opacity', String(opacity));
    c.setAttribute('stroke-linecap', 'round');
    // start the arc at the bottom, sweeping clockwise (GTA-like)
    c.setAttribute('transform', `rotate(90 ${rc} ${rc})`);
    if (dash) { c.setAttribute('stroke-dasharray', String(circ)); c.setAttribute('stroke-dashoffset', '0'); }
    ringSVG.appendChild(c);
    return c;
  };
  mkRing('rgba(0,0,0,.55)', 1, false);       // track
  const timerArc = mkRing(GOLD, 0.95, true); // filled portion
  radarWrap.appendChild(ringSVG);

  // The map canvas, clipped to a circle with a dark rim.
  const radarDisc = document.createElement('div');
  radarDisc.style.cssText =
    `position:absolute;left:0;top:0;width:${RADAR_SIZE}px;height:${RADAR_SIZE}px;` +
    'border-radius:50%;overflow:hidden;box-shadow:0 6px 20px rgba(0,0,0,.6);' +
    'border:2px solid rgba(0,0,0,.7);';
  const canvas = document.createElement('canvas');
  canvas.width = RADAR_SIZE;
  canvas.height = RADAR_SIZE;
  radarDisc.appendChild(canvas);
  radarWrap.appendChild(radarDisc);
  const ctx = canvas.getContext('2d');
  let routePoints = null; // GPS route polyline (world space) drawn on the radar

  // --- Location name bar (below the radar), GTA street-name style ---
  const locBar = document.createElement('div');
  locBar.style.cssText =
    `position:absolute;left:22px;bottom:${22 - 4}px;transform:translateY(100%);` +
    `min-width:${RADAR_SIZE}px;max-width:${RADAR_SIZE + 40}px;box-sizing:border-box;` +
    `margin-top:6px;padding:4px 12px;background:${INK};border-left:3px solid ${GOLD};` +
    `color:${GOLD_HI};font-family:${COND};text-transform:uppercase;` +
    'letter-spacing:.06em;font-size:16px;font-weight:700;line-height:1.25;display:none;' +
    'text-shadow:0 1px 3px rgba(0,0,0,.9);white-space:nowrap;';
  locBar.innerHTML =
    '<span id="hud-loc"></span>' +
    `<span id="hud-dist" style="color:#d9d4c8;font-size:13px;margin-left:8px;opacity:.85"></span>`;
  radarWrap.appendChild(locBar);
  const locEl = locBar.querySelector('#hud-loc');
  const distEl = locBar.querySelector('#hud-dist');

  // --- Speedometer: condensed chip above the radar (driving only) ---
  const speedo = document.createElement('div');
  speedo.style.cssText =
    `position:absolute;left:22px;bottom:${22 + RADAR_SIZE + 12}px;width:${RADAR_SIZE}px;` +
    `box-sizing:border-box;padding:3px 12px;background:${INK};border-left:3px solid ${GOLD};` +
    'color:#fff;text-align:right;line-height:1;display:flex;align-items:baseline;' +
    'justify-content:flex-end;gap:6px;';
  speedo.innerHTML =
    `<span id="hud-kmh" style="font:800 30px ${COND};letter-spacing:.01em">0</span>` +
    `<span style="font:600 13px ${COND};letter-spacing:.1em;opacity:.8">KM/H</span>`;
  root.appendChild(speedo);
  const kmhEl = speedo.querySelector('#hud-kmh');

  // --- Controls help, above the speed block ---
  const controls = document.createElement('div');
  controls.style.cssText =
    `position:absolute;left:22px;bottom:${22 + RADAR_SIZE + 12 + 40}px;width:${RADAR_SIZE}px;` +
    `box-sizing:border-box;padding:7px 10px;background:${INK};border-left:3px solid rgba(240,168,40,.5);` +
    `color:#d5d0c4;font:600 10.5px ${BODY};line-height:1.55;letter-spacing:.01em;`;
  const key = (k) => `<b style="color:${GOLD_HI}">${k}</b>`;
  controls.innerHTML =
    `${key('WASD')} drive · ${key('Shift')} sprint<br>` +
    `${key('Space')} jump / handbrake<br>` +
    `${key('F')} in&nbsp;/&nbsp;out · ${key('H')} horn<br>` +
    `${key('Mouse')} look · ${key('Esc')} pause`;
  root.appendChild(controls);

  // --- Cash (top-right), GTA green ---
  const cash = document.createElement('div');
  cash.style.cssText =
    'position:absolute;right:22px;top:16px;display:none;align-items:baseline;gap:8px;' +
    `font-family:${COND};text-shadow:0 2px 5px rgba(0,0,0,.85);`;
  cash.innerHTML =
    `<span id="hud-flowers" title="No flowers yet" style="font-family:${BODY};font-size:20px;opacity:.35">💐</span>` +
    `<span id="hud-cash" style="color:${GREEN};font-size:34px;font-weight:800;letter-spacing:.01em;` +
    'font-variant-numeric:tabular-nums">R500</span>';
  root.appendChild(cash);
  const cashEl = cash.querySelector('#hud-cash');
  const flowersEl = cash.querySelector('#hud-flowers');

  // --- Interaction prompt (centre, low) ---
  const prompt = document.createElement('div');
  prompt.style.cssText =
    'position:absolute;left:50%;bottom:22%;transform:translateX(-50%);' +
    `padding:9px 16px;background:${INK};border:1px solid ${LINE};color:#fff;` +
    `font:600 17px ${BODY};letter-spacing:.01em;display:none;` +
    'box-shadow:0 3px 14px rgba(0,0,0,.55);white-space:nowrap;';
  root.appendChild(prompt);

  // --- Mission panel (top-left): objective + drive timer, GTA style ---
  const missionBox = document.createElement('div');
  missionBox.style.cssText =
    `position:absolute;left:22px;top:16px;min-width:200px;max-width:280px;padding:8px 14px;` +
    `background:${INK};border-left:3px solid ${GOLD};color:#fff;font-family:${BODY};` +
    'box-shadow:0 3px 14px rgba(0,0,0,.45);display:none;';
  missionBox.innerHTML =
    `<div style="font:700 11px ${COND};letter-spacing:.22em;color:${GOLD}">OBJECTIVE</div>` +
    '<div id="hud-mission" style="display:flex;align-items:center;gap:8px;margin-top:3px">' +
    `<span style="width:9px;height:9px;background:${GOLD};display:inline-block;flex:0 0 auto;` +
    'transform:rotate(45deg)"></span>' +
    `<span id="hud-mission-t" style="font:600 16px ${BODY};line-height:1.25"></span></div>` +
    `<div id="hud-timer" style="font:800 28px ${COND};margin-top:5px;line-height:1;display:none;` +
    'font-variant-numeric:tabular-nums"></div>';
  root.appendChild(missionBox);
  const missionEl = missionBox.querySelector('#hud-mission-t');
  const timerEl = missionBox.querySelector('#hud-timer');

  // --- Off-screen waypoint arrow ---
  const arrow = document.createElement('div');
  arrow.textContent = '▲';
  arrow.style.cssText =
    `position:absolute;color:${GOLD};font-size:30px;line-height:1;display:none;` +
    'text-shadow:0 2px 6px rgba(0,0,0,.7);transform-origin:50% 50%;will-change:transform,left,top;';
  root.appendChild(arrow);

  // --- Centre banner (mission-card style, from the PDF) ---
  const banner = document.createElement('div');
  banner.style.cssText =
    'position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);text-align:center;display:none;' +
    `padding:22px 34px;background:${INK};border:1px solid ${LINE};` +
    'border-top:3px solid ' + GOLD + ';border-bottom:3px solid ' + GOLD + ';' +
    `color:#fff;font-family:${BODY};line-height:1.35;box-shadow:0 8px 30px rgba(0,0,0,.6);max-width:80vw;`;
  root.appendChild(banner);

  function keycap(k) {
    return `<span style="display:inline-block;min-width:22px;padding:2px 8px;margin:0 2px;` +
      `background:${GOLD};color:#141414;font-weight:800;font-family:${COND};text-align:center">${k}</span>`;
  }

  // reused timer/distance state so setObjective can paint the arc
  let lastTimeFrac = 1;
  let visible = true;

  return {
    /** Show/hide the whole HUD (hidden behind the title/pause menu). */
    setVisible(v) {
      if (v === visible) return; // guard: only touch the DOM on change
      visible = v;
      root.style.display = v ? 'block' : 'none';
    },

    /** @param {number} kmh @param {boolean} visible */
    setSpeed(kmh, visible) {
      speedo.style.display = visible ? 'flex' : 'none';
      if (visible) kmhEl.textContent = String(Math.max(0, Math.round(kmh)));
    },

    /** @param {string|null} text  e.g. "F|get in the E30" ("key|label") */
    setPrompt(text) {
      if (!text) { prompt.style.display = 'none'; return; }
      const [k, label] = text.split('|');
      prompt.innerHTML = `Press ${keycap(k)} to ${label}`;
      prompt.style.display = 'block';
    },

    /**
     * @param {{x:number,z:number,heading:number}} self  entity at radar centre
     * @param {Blip[]} blips  other entities to plot
     */
    updateRadar(self, blips) {
      drawRadar(ctx, self, blips, minimap, routePoints);
    },

    /** Set the GPS route polyline (world-space points), or null to clear. */
    setRoute(points) { routePoints = points; },

    /** Current objective title (top-left panel), or hide when null. */
    setMission(text) {
      if (!text) { missionBox.style.display = 'none'; return; }
      missionBox.style.display = 'block';
      missionEl.textContent = text;
    },

    /** Location/street name shown beneath the radar (GTA-style), or hide. */
    setLocation(name) {
      if (!name) { locBar.style.display = 'none'; return; }
      locBar.style.display = 'block';
      locEl.textContent = name;
    },

    /** Player cash (top-right, GTA green). */
    setWallet(amount) {
      cash.style.display = 'flex';
      cashEl.textContent = 'R' + Math.round(amount);
    },
    /** Flowers-in-hand indicator. */
    setFlowers(has) {
      flowersEl.style.opacity = has ? '1' : '0.35';
      flowersEl.title = has ? 'Flowers ✓' : 'No flowers yet';
    },

    /** Drive timer (mission panel + arc ring) and distance (location bar). */
    setObjective(info) {
      if (!info) {
        timerEl.style.display = 'none';
        distEl.textContent = '';
        timerArc.setAttribute('stroke-dashoffset', String(circ)); // empty ring
        return;
      }
      timerEl.style.display = 'block';
      const s = Math.max(0, Math.ceil(info.remaining));
      timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      const col = info.lateness >= 1 ? RED : info.lateness > 0.6 ? GOLD_HI : '#fff';
      timerEl.style.color = col;
      distEl.textContent = info.distance == null ? '' : (info.remaining <= 0 ? 'LATE — GO!' : `${Math.round(info.distance)} m`);
      // Arc drains as lateness climbs (1 = full, 0 = out of time).
      lastTimeFrac = Math.max(0, Math.min(1, 1 - (info.lateness ?? 0)));
      timerArc.setAttribute('stroke', info.lateness >= 1 ? RED : GOLD);
      timerArc.setAttribute('stroke-dashoffset', String(circ * (1 - lastTimeFrac)));
    },

    /** Position/rotate the off-screen arrow, or hide when on-screen/null. */
    setArrow(a) {
      if (!a || a.onScreen) { arrow.style.display = 'none'; return; }
      arrow.style.display = 'block';
      arrow.style.left = `${a.x}px`;
      arrow.style.top = `${a.y}px`;
      arrow.style.transform = `translate(-50%,-50%) rotate(${a.deg}deg)`;
    },

    /** Centre banner message (HTML), or hide when null. */
    setBanner(html) {
      if (!html) { banner.style.display = 'none'; return; }
      banner.innerHTML = html;
      banner.style.display = 'block';
    },

    /** Expose fonts so callers can style banner HTML consistently. */
    fonts: { cond: COND, body: BODY, gold: GOLD, cyan: CYAN },
  };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number,z:number,heading:number}} self
 * @param {Blip[]} blips
 * @param {Minimap} [minimap]
 */
function drawRadar(ctx, self, blips, minimap, routePoints) {
  const R = RADAR_SIZE / 2;
  const scale = R / RADAR_RANGE;
  ctx.clearRect(0, 0, RADAR_SIZE, RADAR_SIZE);

  const cos = Math.cos(self.heading);
  const sin = Math.sin(self.heading);
  // Project a world point to heading-up radar screen coords.
  const project = (x, z) => {
    const dx = x - self.x;
    const dz = z - self.z;
    const rx = dz * sin - dx * cos;   // along self.right
    const ry = dx * sin + dz * cos;   // along self.forward
    return [R + rx * scale, R - ry * scale]; // up = -y
  };

  // Base: countryside green; the city grid is drawn on top.
  ctx.fillStyle = '#2c4429';
  ctx.fillRect(0, 0, RADAR_SIZE, RADAR_SIZE);

  if (minimap) drawCity(ctx, minimap, project, scale);

  // GPS route polyline (GTA-style cyan) over the streets.
  if (routePoints && routePoints.length > 1) {
    ctx.strokeStyle = CYAN;
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    routePoints.forEach((p, i) => {
      const [sx, sy] = project(p.x, p.z);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    });
    ctx.stroke();
  }

  for (const b of blips) {
    const [sx, sy] = project(b.x, b.z);
    let px = sx, py = sy;
    const dx = sx - R, dy = sy - R;
    const dist = Math.hypot(dx, dy);
    if (b.kind === 'waypoint') {
      // Pin to the circle edge in the destination's direction (stable marker).
      const lim = R - 8;
      if (dist > lim) { const k = lim / dist; px = R + dx * k; py = R + dy * k; }
    } else if (dist > R - 5) {
      continue; // outside the circular radar
    }
    ctx.beginPath();
    if (b.kind === 'car') {
      ctx.fillStyle = GOLD;
      ctx.arc(px, py, 5, 0, Math.PI * 2);
    } else if (b.kind === 'waypoint') {
      // GTA destination flag: a small diamond.
      ctx.fillStyle = CYAN;
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.PI / 4);
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
    } else {
      ctx.fillStyle = '#8fd0ff';
      ctx.arc(px, py, 4, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // Self as an up-pointing triangle in the centre (GTA player blip, gold).
  ctx.fillStyle = GOLD_HI;
  ctx.strokeStyle = 'rgba(0,0,0,.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(R, R - 9);
  ctx.lineTo(R - 7, R + 7);
  ctx.lineTo(R + 7, R + 7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Draw the city grid (dark streets + light blocks) heading-up. */
function drawCity(ctx, minimap, project, scale) {
  const { blocks, extent, block } = minimap;
  const quad = (corners, fill) => {
    ctx.beginPath();
    corners.forEach(([x, z], i) => {
      const [sx, sy] = project(x, z);
      if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    });
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  // The whole district reads as asphalt; blocks sit on top, leaving streets.
  quad([[-extent, -extent], [extent, -extent], [extent, extent], [-extent, extent]], '#1c1f24');
  for (const b of blocks) {
    const hw = (b.w ?? block) / 2; // honour per-block footprint size if given
    const hd = (b.d ?? block) / 2;
    quad(
      [[b.x - hw, b.z - hd], [b.x + hw, b.z - hd], [b.x + hw, b.z + hd], [b.x - hw, b.z + hd]],
      b.park ? '#365f39' : '#6b7280',
    );
  }
}
