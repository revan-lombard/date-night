#!/usr/bin/env node
/**
 * Flip the public test link on and off.
 *
 *   npm run site:up    → repo public, GitHub Pages enabled (Actions build),
 *                        workflow dispatched, prints the URL when it's live
 *   npm run site:down  → Pages removed, repo private again
 *
 * Why: the free GitHub plan only serves Pages from PUBLIC repos, and the repo
 * holds the couple's photographs. So the source stays private except for the
 * window in which they're actually playing. Needs the `gh` CLI signed in.
 */
import { execSync } from 'node:child_process';

const REPO = process.env.DN_REPO || 'revan-lombard/date-night';
const cmd = process.argv[2];
const sh = (c, opts = {}) => execSync(c, { stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8', ...opts });
const api = (path, extra = '') => sh(`gh api ${extra} repos/${REPO}/${path}`, { quiet: true });

function up() {
  console.log(`→ making ${REPO} public`);
  sh(`gh repo edit ${REPO} --visibility public --accept-visibility-change-consequences`);
  console.log('→ enabling GitHub Pages (Actions build)');
  try { api('pages', '-X POST -f build_type=workflow'); } catch { /* already enabled */ }
  console.log('→ building + deploying');
  sh(`gh workflow run deploy.yml --repo ${REPO}`);
  // Wait for the run to finish.
  let url = null;
  for (let i = 0; i < 60 && !url; i++) {
    execSync('node -e "setTimeout(()=>{},5000)"');
    const runs = JSON.parse(sh(`gh run list --repo ${REPO} --workflow deploy.yml --limit 1 --json status,conclusion,url`, { quiet: true }));
    const r = runs[0];
    if (!r) continue;
    process.stdout.write(`   ${r.status}${r.conclusion ? ' · ' + r.conclusion : ''}\r`);
    if (r.status === 'completed') {
      if (r.conclusion !== 'success') { console.error(`\nDeploy failed — see ${r.url}`); process.exit(1); }
      url = JSON.parse(api('pages')).html_url;
    }
  }
  console.log(`\n✓ live: ${url}\n  (run "npm run site:down" when they're done)`);
}

function down() {
  console.log('→ removing the Pages site');
  try { api('pages', '-X DELETE'); } catch { /* already gone */ }
  console.log(`→ making ${REPO} private`);
  sh(`gh repo edit ${REPO} --visibility private --accept-visibility-change-consequences`);
  console.log('✓ private. The link is dark until the next "npm run site:up".');
}

if (cmd === 'up') up();
else if (cmd === 'down') down();
else { console.error('usage: node scripts/site.mjs up|down'); process.exit(2); }
