#!/usr/bin/env node
// Last step of the Netlify build: says plainly what the deploy contains.
// Generation steps exit 0 whatever happens (a missing page must never cost
// a deploy), so without this a build that lost every team page looked the
// same in the log as one that didn't. Never exits non-zero for the same
// reason; the enforcing check is .github/workflows/site-health.yml, which
// tests the LIVE site and fails loudly.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIST = join(process.cwd(), 'dist');
const count = (...p) => {
  const dir = join(DIST, ...p);
  return existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).length : 0;
};
// /sitemap.xml is an index (since 6 Oct 2026); the URLs are in sitemaps/*.xml.
const sitemapDir = join(DIST, 'sitemaps');
const sectionFiles = existsSync(sitemapDir) ? readdirSync(sitemapDir).filter((f) => f.endsWith('.xml')) : [];
const locsIn = (f) => (readFileSync(join(sitemapDir, f), 'utf8').match(/<loc>/g) ?? []).length;
const urls = sectionFiles.reduce((n, f) => n + locsIn(f), 0);
for (const f of sectionFiles) console.log(`Verify: sitemap ${f}: ${locsIn(f)} URLs`);

// Floors are deliberately low -- they catch "section missing", not drift.
const checks = [
  ['sitemap.xml URLs', urls, 100],
  ['app-shell.html (SPA fallback target)', existsSync(join(DIST, 'app-shell.html')) ? 1 : 0, 1],
  ['team pages', count('football', 'teams'), 18],
  ['match pages', count('football', 'matches'), 300],
  ['player pages', count('fpl', 'players'), 300],
  ['/finance index', existsSync(join(DIST, 'finance', 'index.html')) ? 1 : 0, 1],
  ['NFL team pages', count('nfl', 'teams'), 32],
  ['NFL game pages', count('nfl', 'games'), 200],
  ['tennis ATP player pages', count('tennis', 'players', 'atp'), 100],
  ['tennis season pages', count('tennis', 'seasons', 'atp') + count('tennis', 'seasons', 'wta'), 40],
  ['tennis tournament pages', count('tennis', 'tournaments', 'atp') + count('tennis', 'tournaments', 'wta'), 100],
  ['international nation pages', count('international', 'teams'), 200],
  ['/football/local-clubs', existsSync(join(DIST, 'football', 'local-clubs', 'index.html')) ? 1 : 0, 1],
  // Flat twins (fixtures.html beside fixtures/index.html) -- without them
  // every no-slash canonical URL 301s to its slash form. See write-flat-html.
  ['flat /fixtures.html', existsSync(join(DIST, 'fixtures.html')) ? 1 : 0, 1],
  ['flat /football/teams/arsenal.html', existsSync(join(DIST, 'football', 'teams', 'arsenal.html')) ? 1 : 0, 1],
];
let problems = 0;
for (const [label, n, floor] of checks) {
  const ok = n >= floor;
  if (!ok) problems++;
  console.log(`Verify: ${ok ? 'ok     ' : 'MISSING'} ${label}: ${n}${ok ? '' : ` (expected at least ${floor})`}`);
}
console.log(problems ? `Verify: ${problems} problem(s) -- deploying anyway; see the lines above.` : 'Verify: all sections present.');
process.exit(0);
