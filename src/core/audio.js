/**
 * @file core/audio.js
 * @responsibility The whole soundscape, synthesised — no audio files (§9):
 *   - engine: two detuned sawtooths, frequency mapped to speed with a lag,
 *     low-pass filter that opens with throttle
 *   - tyre screech: band-passed noise while the rear slides
 *   - phone ringtone, UI blips, love-meter ticks, horn (double-beep)
 *   - night ambience (filtered noise) and a warm 4-chord loop for the date
 * Owns the master volume/mute. NEVER starts before a user gesture: everything
 * no-ops until unlock() is called from a click/keypress handler.
 *
 * @phase Implemented in Phase 6.
 */

/** Volume trims per voice — tuned so nothing fights the dialogue. */
const LEVELS = {
  engine: 0.14,
  screech: 0.12,
  ambience: 0.045,
  music: 0.06,
  ring: 0.2,
  blip: 0.15,
};

export function createAudio() {
  /** @type {AudioContext|null} */
  let ctx = null;
  let master = null;
  let volume = 0.8;
  let muted = false;

  // engine voice
  let engOscA = null, engOscB = null, engFilter = null, engGain = null;
  let engFreq = 60;
  // screech voice
  let screechGain = null, screechOn = false;
  // ambience / music / ring state
  let ambGain = null, ambOn = false;
  let musicTimer = 0, musicOn = false, musicStep = 0;
  let ringTimer = 0, ringOn = false;

  const applyMaster = () => { if (master) master.gain.value = muted ? 0 : volume; };

  /** Shared looping noise buffer (screech + ambience source material). */
  let noiseBuf = null;
  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    return src;
  }

  /** One soft enveloped note (music, blips, ticks). */
  function note(freq, t0, dur, peak, type = 'triangle') {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + Math.min(0.04, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0004, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Warm date loop: Cmaj7 → Am7 → Fmaj7 → G6, slow arpeggios. Data, not tape.
  const CHORDS = [
    [261.6, 329.6, 392.0, 493.9],
    [220.0, 261.6, 329.6, 392.0],
    [174.6, 220.0, 261.6, 329.6],
    [196.0, 246.9, 293.7, 329.6],
  ];

  function buildEngine() {
    engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass';
    engFilter.frequency.value = 400;
    engGain = ctx.createGain();
    engGain.gain.value = 0;
    engFilter.connect(engGain).connect(master);
    engOscA = ctx.createOscillator();
    engOscB = ctx.createOscillator();
    engOscA.type = engOscB.type = 'sawtooth';
    engOscA.connect(engFilter);
    engOscB.connect(engFilter);
    engOscA.start();
    engOscB.start();
  }

  function buildScreech() {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 1.4;
    screechGain = ctx.createGain();
    screechGain.gain.value = 0;
    const src = noise();
    src.connect(bp);
    bp.connect(screechGain).connect(master);
    src.start();
  }

  return {
    /** Create/resume the context. Call from a real user-gesture handler. */
    unlock() {
      if (!ctx) {
        try {
          ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch { return; }
        master = ctx.createGain();
        master.connect(ctx.destination);
        applyMaster();
        buildEngine();
        buildScreech();
      }
      ctx.resume?.().catch(() => {});
    },

    setVolume(v) { volume = v; applyMaster(); },
    setMuted(m) { muted = m; applyMaster(); },

    /**
     * Drive the engine note — call every update while in the car.
     * @param {number} speedRatio 0..1 of top speed
     * @param {number} throttle   0..1 (accelerator only)
     * @param {number} dt
     */
    engine(speedRatio, throttle, dt) {
      if (!engOscA) return;
      // Five fake gears: revs climb within each gear and drop on the "shift" —
      // the single cheapest way to make a synth engine feel like a real car.
      const GEARS = 5;
      const gear = Math.min(GEARS - 1, Math.floor(speedRatio * GEARS));
      const phase = speedRatio * GEARS - gear;
      const target = 58 + gear * 9 + phase * 115 + throttle * 12;
      engFreq += (target - engFreq) * Math.min(1, 6 * dt);
      engOscA.frequency.value = engFreq;
      engOscB.frequency.value = engFreq * 1.012; // detune = the growl
      engFilter.frequency.value = 320 + throttle * 2300 + speedRatio * 500;
      engGain.gain.value = LEVELS.engine * (0.55 + 0.45 * speedRatio);
    },

    /** Fade the engine out (on foot / date). Idempotent. */
    engineOff() {
      if (engGain && engGain.gain.value > 0.0001) engGain.gain.value *= 0.82;
    },

    /** Tyre screech while sliding. Idempotent per frame. */
    setScreech(on) {
      if (!screechGain || on === screechOn) return;
      screechOn = on;
      const t = ctx.currentTime;
      screechGain.gain.cancelScheduledValues(t);
      screechGain.gain.setTargetAtTime(on ? LEVELS.screech : 0, t, on ? 0.03 : 0.09);
    },

    /** Classic double-burst ringtone while the phone rings. Idempotent. */
    ring(on) {
      if (!ctx) return;
      if (on && !ringOn) {
        ringOn = true;
        const burst = () => {
          if (!ringOn) return;
          const t = ctx.currentTime;
          for (const dt0 of [0, 0.55]) {
            note(440, t + dt0, 0.4, LEVELS.ring, 'sine');
            note(480, t + dt0, 0.4, LEVELS.ring * 0.8, 'sine');
          }
        };
        burst();
        ringTimer = setInterval(burst, 2600);
      } else if (!on && ringOn) {
        ringOn = false;
        clearInterval(ringTimer);
      }
    },

    /** Short UI blip (choice picked, panel opened). */
    blip() {
      if (!ctx) return;
      note(880, ctx.currentTime, 0.07, LEVELS.blip, 'square');
    },

    /** WhatsApp-ish two-note "ding" for an incoming text. */
    ding() {
      if (!ctx) return;
      const t = ctx.currentTime;
      note(1175, t, 0.12, LEVELS.blip * 0.9, 'sine');
      note(1568, t + 0.11, 0.22, LEVELS.blip * 0.9, 'sine');
    },

    /**
     * Fetch an optional recording (her real voice on the phone). Resolves to a
     * handle with play() → duration in seconds, or null when the file is absent
     * or undecodable — the game never depends on it. Decoding is deferred until
     * play() because the AudioContext only exists after the first gesture.
     * @param {string} url
     */
    async loadClip(url) {
      try {
        const res = await fetch(url, { cache: 'force-cache' });
        const type = res.headers.get('content-type') || '';
        if (!res.ok || /text\/html/i.test(type)) return null; // dev server 404s serve index.html
        const bytes = await res.arrayBuffer();
        if (bytes.byteLength < 1000) return null;
        let buffer = null;
        return {
          /** Start playback (after unlock). Returns the clip length in seconds, 0 if unavailable. */
          play: async () => {
            if (!ctx) return 0;
            try {
              if (!buffer) buffer = await ctx.decodeAudioData(bytes.slice(0));
            } catch { return 0; }
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            const g = ctx.createGain();
            g.gain.value = 0.9;
            src.connect(g).connect(master);
            src.start();
            return buffer.duration;
          },
        };
      } catch { return null; }
    },

    /** Love-meter tick: two quick notes, up for gains, down for losses. */
    meterTick(positive) {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (positive) { note(523, t, 0.09, LEVELS.blip); note(659, t + 0.09, 0.14, LEVELS.blip); }
      else { note(392, t, 0.09, LEVELS.blip); note(311, t + 0.09, 0.16, LEVELS.blip); }
    },

    /** The E30's double-beep. */
    horn() {
      if (!ctx) return;
      const t = ctx.currentTime;
      for (const dt0 of [0, 0.18]) {
        note(392, t + dt0, 0.13, 0.22, 'square');
        note(494, t + dt0, 0.13, 0.16, 'square');
      }
    },

    /** Night hum — very quiet filtered noise bed. Idempotent. */
    ambience(on) {
      if (!ctx || on === ambOn) return;
      ambOn = on;
      if (on && !ambGain) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 380;
        ambGain = ctx.createGain();
        ambGain.gain.value = 0;
        const src = noise();
        src.connect(lp);
        lp.connect(ambGain).connect(master);
        src.start();
      }
      if (ambGain) ambGain.gain.setTargetAtTime(on ? LEVELS.ambience : 0, ctx.currentTime, 0.8);
    },

    /** Warm arpeggio loop for the dinner. Idempotent on/off. */
    dateMusic(on) {
      if (!ctx || on === musicOn) return;
      musicOn = on;
      if (!on) { clearInterval(musicTimer); return; }
      musicStep = 0;
      const bar = () => {
        if (!musicOn) return;
        const chord = CHORDS[musicStep % CHORDS.length];
        const t = ctx.currentTime + 0.05;
        chord.forEach((f, i) => {
          note(f, t + i * 0.42, 1.4, LEVELS.music);        // rising arpeggio
          if (i === 0) note(f / 2, t, 2.2, LEVELS.music * 0.8, 'sine'); // soft bass root
        });
        musicStep++;
      };
      bar();
      musicTimer = setInterval(bar, 2100);
    },
  };
}
