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
// Static routes come from the SSR bundle's own registry (routeMeta.ts),
// not a second hand-maintained list here. Those two lists agreed only
// because they were kept in step by hand -- exactly the drift that put
// "Browse" in the nav after the hubs had moved to "Discover". The
// sitemap runs after build:ssr in the chain, so the bundle exists.

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
  let staticPaths = [];
  let mod = null;
  try {
    const entry = join(process.cwd(), 'dist-ssr', 'entry-server.js');
    mod = await import(entry);
    staticPaths = (mod.STATIC_ROUTES ?? []).map((r) => r.path);
  } catch (err) {
    // A sitemap with only entity pages beats no sitemap, so this
    // degrades rather than aborting.
    console.error('Sitemap: could not read static routes from the SSR bundle --', err?.message ?? err);
  }
  const entries = staticPaths.map((r) => urlEntry(r, null));

  // One URL per completed gameweek. These are stable -- gameweek 4's
  // team of the week never changes once played -- so they accumulate
  // rather than overwrite, unlike the single page they replaced.
  // Uses the same REST helper as everything else here rather than a
  // Supabase client -- this script deliberately has no client, so it can
  // run with only a URL and anon key.
  let gameweekCount = 0;
  try {
    const gwRows = await query(
      `fpl_player_gameweeks?select=fpl_event_id,total_points&season_id=eq.${CURRENT_SEASON_ID}&total_points=gt.0&limit=20000`
    );
    // A gameweek counts only once somebody has scored: FPL creates rows
    // for an upcoming week with zeros, and listing those would advertise
    // a page showing an XI of blanks.
    const played = new Set((gwRows ?? []).map((r) => r.fpl_event_id));
    for (const gw of [...played].sort((a, b) => a - b)) {
      entries.push(urlEntry(`/fpl/team-of-the-week/gw${gw}`, null));
      gameweekCount++;
    }
  } catch (err) {
    console.error('Sitemap: could not list completed gameweeks --', err?.message ?? err);
  }

  // Player Scout: one URL per player with real history, including those
  // who have left the league and have no other page here.
  let scoutCount = 0;
  try {
    const players = await query('player_identity?select=slug&order=slug.asc&limit=5000');
    for (const p of players ?? []) {
      if (!p.slug) continue;
      entries.push(urlEntry(`/fpl/player-scout/${p.slug}`, null));
      scoutCount++;
    }
  } catch (err) {
    console.error('Sitemap: could not list players --', err?.message ?? err);
  }

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

  // Club finance pages: every team with published accounts (not only the
  // Premier League), lastmod = its latest filing date. Same bulk module as
  // static generation, so the sitemap and the pages cannot disagree.
  let financeCount = 0;
  if (mod) {
    try {
      const bulk = await fetchFinanceBulk(query);
      if (bulk) {
        const site = buildFinanceSite(bulk, mod);
        for (const s of site.sitemap) entries.push(urlEntry(s.path, s.lastmod));
        financeCount = site.sitemap.length;
        const latest = site.sitemap.map((s) => s.lastmod).filter(Boolean).sort().pop() ?? null;
        if (!staticPaths.includes('/finance')) entries.push(urlEntry('/finance', latest));
      }
    } catch (err) {
      console.error('Sitemap: finance pages skipped --', err?.message ?? err);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join('\n')}\n</urlset>\n`;

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, xml, 'utf8');
  console.log(
    `Sitemap: wrote ${entries.length} URL(s) -- ${staticPaths.length} static, ${gameweekCount} gameweek, ${scoutCount} scout, ` +
      `${(teams ?? []).length} team(s), ${(players ?? []).length} player(s), ${(fixtures ?? []).length} match(es), ${financeCount} club finance page(s).`
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
