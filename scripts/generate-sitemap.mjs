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
import { fetchFinanceBulk, buildFinanceSite } from './lib/financeStatic.mjs';

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
// Everything gathered so far. The watchdog writes THIS rather than
// nothing: before 2026-09-25 it exited without a file, so one slow
// Supabase response cost the whole sitemap (live /sitemap.xml was 404).
const entries = [];

function writeSitemap(label) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, xml, 'utf8');
  console.log(`Sitemap: wrote ${entries.length} URL(s) [${label}]`);
}

const watchdog = setTimeout(() => {
  console.error('Sitemap: watchdog fired -- writing what was gathered rather than nothing.');
  try { writeSitemap('PARTIAL: watchdog'); } catch (err) { console.error('Sitemap: partial write failed --', err?.message ?? err); }
  process.exit(0);
}, WATCHDOG_MS);
watchdog.unref();

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

/** PostgREST caps a response at 1,000 rows WITHOUT saying it truncated, so
 * a single "limit=5000" quietly returns 1,000. Before 2026-09-25 that cut
 * the match, scout and gameweek sections of this sitemap short. Pages
 * explicitly; returns null only if the very first page fails. */
async function queryAll(path, pageSize = 1000) {
  const out = [];
  for (let offset = 0; offset <= 200000; offset += pageSize) {
    const sep = path.includes('?') ? '&' : '?';
    const page = await query(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    if (page == null) return out.length > 0 ? out : null;
    out.push(...page);
    if (page.length < pageSize) return out;
  }
  console.error('Sitemap: pagination guard tripped for', path);
  return out;
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
  let staticPaths = [];
  let mod = null;
  try {
    const entry = join(process.cwd(), 'dist-ssr', 'entry-server.js');
    mod = await import(entry);
    staticPaths = (mod.STATIC_ROUTES ?? []).map((r) => r.path);
  } catch (err) {
    console.error('Sitemap: could not read static routes from the SSR bundle --', err?.message ?? err);
  }
  for (const r of new Set(staticPaths)) entries.push(urlEntry(r, null));
  // Written immediately: from here on a slow database can shrink the
  // sitemap but can no longer remove it.
  writeSitemap('static routes only');

  // All independent -- fetched together, so total time is the slowest
  // request rather than the sum of a dozen serial ones.
  const [gwRows, scouts, eplFixtures, teams, players, fixtures, finance] = await Promise.all([
    queryAll(`fpl_player_gameweeks?select=fpl_event_id&season_id=eq.${CURRENT_SEASON_ID}&total_points=gt.0`),
    queryAll('player_identity?select=slug&order=slug.asc'),
    queryAll(`fixtures?select=home_team_id,away_team_id&league_id=eq.${PL_LEAGUE_ID}&season_id=eq.${CURRENT_SEASON_ID}`),
    queryAll('teams?select=team_id,slug&slug=not.is.null'),
    queryAll(`fpl_players?select=slug&season_id=eq.${CURRENT_SEASON_ID}&slug=not.is.null`),
    queryAll(`fixtures?select=slug,predicted_at&season_id=eq.${CURRENT_SEASON_ID}&slug=not.is.null&order=fixture_id.asc`),
    mod ? fetchFinanceBulk(query).catch((err) => { console.error('Sitemap: finance fetch failed --', err?.message ?? err); return null; }) : null,
  ]);

  const counts = {};
  const played = [...new Set((gwRows ?? []).map((r) => r.fpl_event_id))].sort((a, b) => a - b);
  for (const gw of played) entries.push(urlEntry(`/fpl/team-of-the-week/gw${gw}`, null));
  counts.gameweeks = played.length;

  counts.scout = 0;
  for (const p of scouts ?? []) if (p.slug) { entries.push(urlEntry(`/fpl/player-scout/${p.slug}`, null)); counts.scout++; }

  const eplTeamIds = new Set();
  for (const f of eplFixtures ?? []) { eplTeamIds.add(f.home_team_id); eplTeamIds.add(f.away_team_id); }
  counts.teams = 0;
  for (const t of teams ?? []) {
    if (eplTeamIds.size === 0 || eplTeamIds.has(t.team_id)) { entries.push(urlEntry(`/football/teams/${t.slug}`)); counts.teams++; }
  }

  for (const p of players ?? []) entries.push(urlEntry(`/fpl/players/${p.slug}`));
  counts.players = (players ?? []).length;
  for (const f of fixtures ?? []) entries.push(urlEntry(`/football/matches/${f.slug}`, f.predicted_at));
  counts.matches = (fixtures ?? []).length;

  counts.finance = 0;
  if (mod && finance) {
    try {
      const site = buildFinanceSite(finance, mod);
      for (const s of site.sitemap) entries.push(urlEntry(s.path, s.lastmod));
      counts.finance = site.sitemap.length;
      const latest = site.sitemap.map((s) => s.lastmod).filter(Boolean).sort().pop() ?? null;
      if (!staticPaths.includes('/finance')) entries.push(urlEntry('/finance', latest));
      if (!staticPaths.includes('/finance/compare')) entries.push(urlEntry('/finance/compare', latest));
    } catch (err) {
      console.error('Sitemap: finance pages skipped --', err?.message ?? err);
    }
  }

  writeSitemap(`complete -- ${staticPaths.length} static, ${JSON.stringify(counts)}`);
  const empty = Object.entries(counts).filter(([, n]) => n === 0).map(([k]) => k);
  if (empty.length) console.error(`Sitemap: WARNING -- no URLs for: ${empty.join(', ')}. Check the Supabase queries above.`);
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
