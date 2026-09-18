#!/usr/bin/env node
// ============================================================================
// scripts/generate-sitemap.mjs
//
// Writes dist/sitemap.xml at build time, listing every canonical public
// page including the per-entity ones (players, matches, teams) that
// nothing links to densely enough for a crawler to find on its own.
// Without this, ~3,400 real pages are effectively undiscoverable.
//
// DESIGNED NOT TO HANG. The previous build-step addition (puppeteer
// prerendering) took the site's deploys down for over an hour -- not by
// failing, but by completing its work and then never exiting, because it
// left a preview server and a browser process alive. Netlify just waited.
// So, deliberately:
//   - no local server, no browser, no child processes
//   - plain fetch against Supabase's REST endpoint
//   - a hard timeout on every request (AbortController)
//   - an overall watchdog that force-exits
//   - process.exit() at the end rather than relying on the event loop
//     draining, and never a non-zero exit -- a missing sitemap must
//     never cost a deploy
// ============================================================================

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SITE_URL = (process.env.VITE_SITE_URL || 'https://footballdatashark.netlify.app').replace(/\/+$/, '');
const OUT = join(process.cwd(), 'dist', 'sitemap.xml');
const CURRENT_SEASON_ID = 13;
const PL_LEAGUE_ID = 1;
const REQUEST_TIMEOUT_MS = 20000;
const WATCHDOG_MS = 90000;

// Absolute last line of defence: if anything below somehow stalls despite
// the per-request timeouts, kill the process rather than let it hold a
// production build open indefinitely.
const watchdog = setTimeout(() => {
  console.error('Sitemap: watchdog fired -- exiting without a sitemap rather than hanging the build.');
  process.exit(0);
}, WATCHDOG_MS);
watchdog.unref();

// Routes that are genuinely public and stable. Deliberately excludes
// everything robots.txt disallows (source-data, results-data,
// data-health, tactical-roles, optimal-squad*) -- listing a page in a
// sitemap while telling crawlers not to fetch it is a contradiction
// Search Console reports as an error.
const STATIC_ROUTES = [
  '/',
  '/football',
  '/fpl/start',
  '/fixtures',
  '/table',
  '/team-strength',
  '/teams',
  '/preview',
  '/fantasy',
  '/fpl',
  '/fpl/player-points',
  '/fpl/scoring-rules',
  '/fpl/actual-matches',
  // Public as of the Data/Admin split -- the curated match archive moved
  // into Football > Discover. Source Data and Data Health stay out,
  // matching robots.txt.
  '/results-data',
  '/football/leagues-compared',
  '/football/market-efficiency',
  '/fpl/market',
  '/fpl/set-pieces',
  '/fpl/injuries',
  '/fpl/value',
  // Stage landing pages: each is a real page with its own content.
  '/football/discover',
  '/football/predict',
  '/fpl/start/discover',
  '/fpl/start/predict',
];

async function query(path) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`Sitemap: query failed (${res.status}) for ${path}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`Sitemap: query errored for ${path}: ${err?.message ?? err}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function urlEntry(loc, lastmod) {
  const parts = [`    <loc>${xmlEscape(SITE_URL + loc)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${xmlEscape(String(lastmod).slice(0, 10))}</lastmod>`);
  return `  <url>\n${parts.join('\n')}\n  </url>`;
}

async function main() {
  const entries = STATIC_ROUTES.map((r) => urlEntry(r, null));

  // Only teams with a generated page. The teams table holds 242 rows
  // across every division and European competition, but pages are
  // generated for clubs appearing in this season's EPL fixtures --
  // listing the rest would advertise URLs that render an empty shell.
  const eplFixtures = await query(
    `fixtures?select=home_team_id,away_team_id&league_id=eq.${PL_LEAGUE_ID}&season_id=eq.${CURRENT_SEASON_ID}&limit=1000`
  );
  const eplTeamIds = new Set();
  for (const f of eplFixtures ?? []) {
    eplTeamIds.add(f.home_team_id);
    eplTeamIds.add(f.away_team_id);
  }
  const teams = await query('teams?select=team_id,slug&slug=not.is.null&limit=1000');
  for (const t of teams ?? []) {
    if (eplTeamIds.size === 0 || eplTeamIds.has(t.team_id)) entries.push(urlEntry(`/football/teams/${t.slug}`));
  }

  const players = await query(`fpl_players?select=slug&season_id=eq.${CURRENT_SEASON_ID}&slug=not.is.null&limit=2000`);
  for (const p of players ?? []) entries.push(urlEntry(`/fpl/players/${p.slug}`));

  // lastmod from predicted_at where present -- a genuine freshness
  // signal tied to when that fixture's prediction was actually
  // regenerated, not the build time.
  const fixtures = await query(
    `fixtures?select=slug,predicted_at&season_id=eq.${CURRENT_SEASON_ID}&slug=not.is.null&limit=5000`
  );
  for (const f of fixtures ?? []) entries.push(urlEntry(`/football/matches/${f.slug}`, f.predicted_at));

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, xml, 'utf8');
  console.log(
    `Sitemap: wrote ${entries.length} URL(s) -- ${STATIC_ROUTES.length} static, ` +
      `${(teams ?? []).length} team(s), ${(players ?? []).length} player(s), ${(fixtures ?? []).length} match(es).`
  );
}

main()
  .catch((err) => {
    // Never fail the build over a sitemap.
    console.error('Sitemap: generation failed --', err?.message ?? err);
  })
  .finally(() => {
    clearTimeout(watchdog);
    process.exit(0);
  });
