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
const SITE_URL = (process.env.VITE_SITE_URL || 'https://fixtureshark.com').replace(/\/+$/, '');
const OUT = join(process.cwd(), 'dist', 'sitemap.xml');
// The current FPL season, read from the database in main() (fpl_current_season_id(),
// docs/season-rollover.md). If that read fails the season sections are skipped.
let CURRENT_SEASON_ID = null;
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

// Since 6 Oct 2026 /sitemap.xml is a sitemap INDEX pointing at one file per
// section (dist/sitemaps/<section>.xml), so Search Console reports discovery
// and indexing separately for football, international, FPL, NFL, tennis and
// finance. Which pages get in at all is decided below, family by family
// (the indexation policy is in docs/seo-indexation.md); the section only
// decides which file a URL lands in.
const SECTIONS = ['core', 'football', 'international', 'fpl', 'nfl', 'tennis', 'finance', 'tv'];
function sectionOf(loc) {
  if (loc.endsWith('/finances')) return 'finance';   // club finance pages live under /football/teams/:slug
  const first = loc.split('/').filter(Boolean)[0] ?? '';
  if (['football', 'international', 'fpl', 'nfl', 'tennis', 'finance'].includes(first)) return first;
  if (first === 'tv-guide') return 'tv';
  if (['fixtures', 'results', 'results-data', 'table', 'teams', 'team-strength', 'preview', 'compare'].includes(first)) return 'football';
  if (first === 'fantasy') return 'fpl';
  return 'core';
}

function writeSitemap(label) {
  const seen = new Set();
  const bySection = new Map(SECTIONS.map((k) => [k, []]));
  for (const e of entries) {
    if (seen.has(e.loc)) continue;   // a page listed by two families goes in once
    seen.add(e.loc);
    bySection.get(sectionOf(e.loc)).push(e.xml);
  }
  const dir = join(dirname(OUT), 'sitemaps');
  mkdirSync(dir, { recursive: true });
  const index = [];
  const counts = [];
  for (const [section, xmls] of bySection) {
    if (xmls.length === 0) continue;
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${xmls.join('\n')}\n</urlset>\n`;
    writeFileSync(join(dir, `${section}.xml`), xml, 'utf8');
    index.push(`  <sitemap>\n    <loc>${SITE_URL}/sitemaps/${section}.xml</loc>\n  </sitemap>`);
    counts.push(`${section} ${xmls.length}`);
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${index.join('\n')}\n</sitemapindex>\n`;
  writeFileSync(OUT, xml, 'utf8');
  console.log(`Sitemap: wrote ${seen.size} URL(s) in ${index.length} file(s) [${label}]: ${counts.join(', ')}`);
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
    let page = await query(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    // One retry for a transient error. A page that still fails returns null
    // for the WHOLE query: until 6 Oct the rows before the failure came back
    // as if complete, so (with oldest-first ordering) the current season was
    // what silently went missing. null makes the caller skip the section and
    // verify-dist's minimum page counts fail the build instead.
    if (page == null) page = await query(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    if (page == null) {
      console.error(`Sitemap: page at offset ${offset} failed twice for ${path} -- discarding the partial result.`);
      return null;
    }
    out.push(...page);
    if (page.length < pageSize) return out;
  }
  console.error('Sitemap: pagination guard tripped for', path, '-- discarding the result.');
  return null;
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function urlEntry(loc, lastmod) {
  const parts = [`    <loc>${xmlEscape(SITE_URL + loc)}</loc>`];
  if (lastmod) parts.push(`    <lastmod>${xmlEscape(String(lastmod).slice(0, 10))}</lastmod>`);
  return { loc, xml: `  <url>\n${parts.join('\n')}\n  </url>` };
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
  CURRENT_SEASON_ID = await query('rpc/fpl_current_season_id');
  const [gwRows, scouts, eplFixtures, teams, players, fixtures, finance, leagueRefs, leagueSeasons, clubSeasons] = await Promise.all([
    queryAll(`fpl_player_gameweeks?select=fpl_event_id&season_id=eq.${CURRENT_SEASON_ID}&total_points=gt.0`),
    queryAll('player_identity?select=slug&order=slug.asc'),
    queryAll(`fixtures?select=home_team_id,away_team_id&league_id=eq.${PL_LEAGUE_ID}&season_id=eq.${CURRENT_SEASON_ID}`),
    queryAll('teams?select=team_id,slug&slug=not.is.null'),
    queryAll(`fpl_players?select=slug&season_id=eq.${CURRENT_SEASON_ID}&slug=not.is.null`),
    // Premier League only: generate-static writes match pages for league 1
    // alone. Every other league's match URL is served by the bare SPA shell
    // (generic title, no canonical, empty body), and listing ~4,000 of those
    // told Google most of the sitemap was thin duplicates. Widen this in the
    // same change that generates those pages.
    queryAll(`fixtures?select=slug,predicted_at&league_id=eq.${PL_LEAGUE_ID}&season_id=eq.${CURRENT_SEASON_ID}&slug=not.is.null&order=fixture_id.asc`),
    mod ? fetchFinanceBulk(query).catch((err) => { console.error('Sitemap: finance fetch failed --', err?.message ?? err); return null; }) : null,
    query('leagues?select=league_id,code,slug&competition_type=eq.league&slug=not.is.null'),
    queryAll('league_season_summary?select=league_id,start_year&order=league_id.asc,start_year.asc'),
    queryAll('team_season_summary?select=team_id,league_id,start_year&league_id=lte.5&order=league_id.asc,season_id.asc,team_id.asc'),
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

  // League histories and league seasons (/football/leagues/...).
  counts.leagueSeasons = 0;
  if (mod?.leagueSeasonPagePath && leagueRefs && leagueSeasons) {
    const byId = new Map(leagueRefs.map((l) => [l.league_id, l]));
    const withSeasons = new Set();
    for (const s of leagueSeasons) {
      const l = byId.get(s.league_id);
      if (!l) continue;
      withSeasons.add(l);
      entries.push(urlEntry(mod.leagueSeasonPagePath(l, s.start_year), null));
      counts.leagueSeasons++;
    }
    for (const l of withSeasons) entries.push(urlEntry(mod.leaguePagePath(l), null));
    for (const l of withSeasons) entries.push(urlEntry(`/football/records/${l.slug}`, null));
    for (const l of withSeasons) if (l.slug !== 'premier-league') entries.push(urlEntry(`/football/history/trends/${l.slug}`, null));
  }

  // Club seasons, English leagues only (the ones generated as static pages).
  counts.clubSeasons = 0;
  if (mod?.clubSeasonPagePath && leagueRefs && clubSeasons && teams) {
    const codeById = new Map(leagueRefs.map((l) => [l.league_id, l.code]));
    const slugById = new Map(teams.map((t) => [t.team_id, t.slug]));
    for (const r of clubSeasons) {
      const code = codeById.get(r.league_id);
      const slug = slugById.get(r.team_id);
      if (!code || !slug) continue;
      entries.push(urlEntry(mod.clubSeasonPagePath(slug, code, r.start_year), null));
      counts.clubSeasons++;
    }
  }

  // NFL: hub, stage and list pages are static routes; plus one page per
  // season (its story) and the 32 team pages. Player pages are client-only
  // and stay out (low page count).
  counts.nfl = 0;
  if (mod?.nflTeamPath) {
    const [nflTeams, nflLatest] = await Promise.all([
      query('nfl_teams?select=slug&order=slug.asc'),
      query('nfl_standings?select=season&order=season.desc&limit=1'),
    ]);
    const latest = nflLatest?.[0]?.season;
    for (const p of ['/nfl/fixtures', '/nfl/table', '/nfl/teams', '/nfl/seasons', '/nfl/player-projections', '/nfl/match-projections', '/nfl/players', '/nfl/fixture-heat-map', '/nfl/scoring-rules', '/nfl/road-trips', '/nfl/pick-my-team', '/football/local-clubs']) {
      if (!staticPaths.includes(p)) { entries.push(urlEntry(p, null)); counts.nfl++; }
    }
    if (latest != null) for (const season of mod.nflSeasonRange(latest)) { entries.push(urlEntry(mod.nflSeasonPath(season), null)); counts.nfl++; }
    for (const t of nflTeams ?? []) { entries.push(urlEntry(mod.nflTeamPath(t.slug), null)); counts.nfl++; }
    // Game pages: the latest season's schedule (the ones the static build writes).
    const gameSeason = (await query('nfl_games?select=season&order=season.desc&limit=1'))?.[0]?.season;
    if (gameSeason != null && mod.nflGamePath) {
      // lastmod: the game day once a score is in (the page's last material
      // change); none before the game, when only the market line moves.
      const ids = (await query(`nfl_games?select=game_id,gameday,home_score&season=eq.${gameSeason}&order=game_id.asc&limit=1000`)) ?? [];
      for (const g of ids) { entries.push(urlEntry(mod.nflGamePath(g.game_id), g.home_score != null ? g.gameday : null)); counts.nfl++; }
    }
  }

  // Tennis: the three list pages (hub and stage are static routes), a page per
  // tour-year, and players with 50+ matches in the tour's last three seasons
  // (the ones the static build writes; the rest are noindex).
  counts.tennis = 0;
  if (mod?.tennisSeasonPath) {
    for (const p of ['/tennis/results', '/tennis/players', '/tennis/seasons', '/tennis/tournaments', '/tennis/tv-guide', '/tennis/head-to-head']) {
      if (!staticPaths.includes(p)) { entries.push(urlEntry(p, null)); counts.tennis++; }
    }
    for (const tour of ['ATP', 'WTA']) {
      const latest = (await query(`tennis_matches?select=year&tour=eq.${tour}&order=match_date.desc&limit=1`))?.[0]?.year;
      if (latest != null) for (const y of mod.tennisYears(tour, latest)) { entries.push(urlEntry(mod.tennisSeasonPath(tour, y), null)); counts.tennis++; }
      const players = (await query(`tennis_players?select=slug&tour=eq.${tour}&recent_matches=gte.${mod.TENNIS_STATIC_PLAYER_MIN}&order=slug.asc`)) ?? [];
      for (const p of players) { entries.push(urlEntry(mod.tennisPlayerPath(tour, p.slug), null)); counts.tennis++; }
      // Phase 3: every tournament, and the Grand Slam, Tour Finals and 1000 editions (the static ones).
      const events = (await query(`tennis_events?select=slug&tour=eq.${tour}&order=slug.asc&limit=1000`)) ?? [];
      for (const e of events) { entries.push(urlEntry(mod.tennisEventPath(tour, e.slug), null)); counts.tennis++; }
      const big = (await query(`tennis_editions?select=event_slug,year&tour=eq.${tour}&level_rank=lte.3&order=event_slug.asc,year.asc&limit=1000`)) ?? [];
      for (const e of big) { entries.push(urlEntry(mod.tennisEditionPath(tour, e.event_slug, e.year), null)); counts.tennis++; }
    }
  }

  // International: every tournament and edition, and nations with 30+ games
  // (the pages generate-static writes heads for; smaller nations are thin and
  // stay out). lastmod: the date of the latest game on the page.
  counts.international = 0;
  if (mod?.intlTeamHead) {
    const [teams, editions] = await Promise.all([
      queryAll(`intl_team_summary?select=team,slug,played,won,first_match,last_match,elo,elo_rank&played=gte.${mod.INTL_STATIC_TEAM_MIN_GAMES}&order=slug.asc`),
      queryAll('intl_edition_summary?select=competition,label,winner,runner_up,last_match&order=competition.asc,season_start.asc'),
    ]);
    const byComp = new Map(mod.INTL_TOURNAMENTS.map((t) => [t.competition, t]));
    for (const t of teams ?? []) { entries.push(urlEntry(mod.intlTeamHead(t).path, t.last_match)); counts.international++; }
    for (const t of mod.INTL_TOURNAMENTS) {
      const last = (editions ?? []).filter((e) => e.competition === t.competition).map((e) => e.last_match).filter(Boolean).sort().pop() ?? null;
      entries.push(urlEntry(mod.intlTournamentHead(t).path, last)); counts.international++;
    }
    for (const e of editions ?? []) {
      const t = byComp.get(e.competition);
      if (t) { entries.push(urlEntry(mod.intlEditionHead(t, e).path, e.last_match)); counts.international++; }
    }
  }

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
