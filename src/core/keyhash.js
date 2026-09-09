/**
 * @file core/keyhash.js
 * @responsibility Normalise and hash a game code so the shipped bundle never
 * carries the code itself — only its fingerprint. Case-insensitive; dashes and
 * spaces are ignored, so "e30g mrph…" and "E30G-MRPH-…" both redeem.
 *
 * Plain JS (no WebCrypto) so the same function runs in the browser AND in
 * `scripts/key.mjs` under Node to mint a new fingerprint.
 */

/** Uppercase alphanumerics only. */
export function normaliseKey(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Two independent 32-bit hashes (FNV-1a and a djb2 variant), each run over the
 * normalised code with a fixed salt, concatenated as 16 hex chars.
 * Not cryptography — a gift needs "can't read it off the page", not Fort Knox.
 * @param {string} raw
 */
export function hashKey(raw) {
  const s = 'date-night|' + normaliseKey(raw);
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    fnv ^= c;
    fnv = Math.imul(fnv, 0x01000193) >>> 0;
    djb = (Math.imul(djb, 33) ^ c) >>> 0;
  }
  return fnv.toString(16).padStart(8, '0') + djb.toString(16).padStart(8, '0');
}
