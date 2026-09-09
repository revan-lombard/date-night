#!/usr/bin/env node
/**
 * Mint the fingerprint for a game code:
 *
 *   npm run key -- E30G-MRPH-2016-1709-TEAM
 *
 * Paste the printed hash into GAME_KEY.hash in src/content/personal.js, print
 * the code itself on the card in the case. The code never ships in the bundle.
 */
import { hashKey, normaliseKey } from '../src/core/keyhash.js';

const code = process.argv.slice(2).join(' ').trim();
if (!code) { console.error('usage: npm run key -- XXXX-XXXX-XXXX-XXXX-XXXX'); process.exit(2); }
const norm = normaliseKey(code);
console.log(`code (as typed):   ${code}`);
console.log(`code (normalised): ${norm}  (${norm.length} chars)`);
console.log(`hash:              ${hashKey(code)}`);
