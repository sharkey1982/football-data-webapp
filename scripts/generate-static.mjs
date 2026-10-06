#!/usr/bin/env node
// ============================================================================
// scripts/generate-static.mjs
//
// Writes real, content-bearing HTML for the canonical entity pages, so a
// crawler (or anything that doesn't run JavaScript -- AI retrieval,
// link-preview fetchers) receives the actual numbers rather than an
// empty <div id="root">.
//
// Replaces the removed puppeteer prerenderer. That one booted a real
// browser per page and waited for each page's own network requests:
// ~2-4s each, which cannot cover ~1,240 entity pages inside a
// 15-minute build. This queries Supabase ONCE in bulk, then renders each
// page with renderToString from injected data -- milliseconds per page.
//
// SAME ANTI-HANG DISCIPLINE AS THE SITEMAP. The prerenderer didn't fail,
// it finished its work and never exited, holding deploys down for over
// an hour. So: no server, no browser, no child processes, hard timeout
// on every request, an overall watchdog, an unconditional process.exit(),
// and never a non-zero exit -- missing static HTML must never cost a
// deploy, since the SPA still works without it.
//
// Scope note: currently match pages only. Player pages need
// per-player projection rows (a much larger fetch) and are a deliberate
// follow-on, so that build integration -- the part that broke last time
// -- is proven on the simpler case first.
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fetchFinanceBulk, buildFinanceSite } from './lib/financeStatic.mjs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DIST = join(process.cwd(), 'dist');
const SHELL = join(DIST, 'index.html');
const ENTRY = join(process.cwd(), 'dist-ssr', 'entry-server.js');
// The current FPL season, read from the database in main() (fpl_current_season_id(),
// docs/season-rollover.md). If that read fails the season pages are skipped.
let SEASON_ID = null;
const EPL_LEAGUE_ID = 1;
const MODEL_VERSION = 'leaguewide_v6';
const POSITION_LABELS = { 1: 'Goalkeeper', 2: 'Defender', 3: 'Midfielder', 4: 'Forward' };
// Tennis rivalry pages: the most-played pairs per tour (see writeTennisPages).
const TENNIS_H2H_PAIRS_PER_TOUR = 30;
const TENNIS_H2H_MIN_MEETINGS = 8;
const REQUEST_TIMEOUT_MS = 20000;
const WATCHDOG_MS = 240000;
const STARTED_AT = Date.now();

const watchdog = setTimeout(() => {
  console.error('Static: watchdog fired -- exiting rather than hanging the build.');
  process.exit(0);
}, WATCHDOG_MS);
watchdog.unref();

async function query(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`Static: query failed (${res.status}) for ${path}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error(`Static: query errored for ${path}: ${err?.message ?? err}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Paginated variant. PostgREST caps a plain select at 1000 rows and
 * returns no indication that it truncated -- so a single query() over
 * the ~7,200 projection rows would silently generate correct-looking
 * pages with most gameweeks missing. Pages through explicitly instead,
 * stopping when a short page comes back. */
async function queryAll(path, pageSize = 1000) {
  const out = [];
  for (let offset = 0; ; offset += pageSize) {
    const sep = path.includes('?') ? '&' : '?';
    let page = await query(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    // One retry for a transient error. A page that still fails returns null
    // for the WHOLE query: until 6 Oct the rows before the failure came back
    // as if complete, so (with oldest-first ordering) the current season was
    // what silently went missing. null makes the caller skip the section and
    // verify-dist's minimum page counts fail the build instead.
    if (page == null) page = await query(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    if (page == null) {
      console.error(`Static: page at offset ${offset} failed twice for ${path} -- discarding the partial result.`);
      return null;
    }
    out.push(...page);
    if (page.length < pageSize) return out;
    // Guard against an unbounded loop if the server ever ignores offset.
    if (offset > 200000) {
      console.error('Static: pagination guard tripped -- discarding the result.');
      return null;
    }
  }
}

async function main() {
  if (!existsSync(SHELL) || !existsSync(ENTRY)) {
    console.warn('Static: missing dist/index.html or dist-ssr/entry-server.js -- skipping.');
    return;
  }

  const { renderMatchPage, renderPlayerPage, renderTeamPage, renderStaticRouteHead, STATIC_ROUTES, buildDocument, projectionDetail, PROJECTION_DETAIL_COLUMNS, teamChances } = await import(ENTRY);
  const shell = readFileSync(SHELL, 'utf8');

  // ---- Static routes: correct head tags per page --------------------
  // These are interactive pages that fetch on mount, so the BODY stays
  // client-rendered. The head does not have to be: before this, all 26
  // fell back to the SPA shell with an identical title and no
  // description, while the sitemap advertised them as distinct URLs.
  // Identical titles across a sitemap reads as duplicate content.
  let staticWritten = 0;
  for (const meta of STATIC_ROUTES) {
    try {
      const page = renderStaticRouteHead(meta);
      const dir = meta.path === '/' ? DIST : join(DIST, ...meta.path.split('/').filter(Boolean));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
      staticWritten++;
    } catch (err) {
      console.error(`Static: failed head for ${meta.path}: ${err?.message ?? err}`);
    }
  }
  console.log(`Static: wrote head tags for ${staticWritten} static route(s).`);


  // ---- Per-gameweek Team of the Week -------------------------------
  // These are in the sitemap but were getting no head tags, so every
  // one served the generic shell -- the same duplicate-title problem
  // the static routes had. They need the database (to know which
  // gameweeks exist), so they sit below the credentials guard but are
  // written the same way.
  async function writeGameweekPages() {
    const played = await pending.gameweeks;
    const weeks = [...new Set((played ?? []).map((r) => r.fpl_event_id))].sort((a, b) => a - b);
    let n = 0;
    for (const gw of weeks) {
      try {
        const page = renderStaticRouteHead({
          path: `/fpl/team-of-the-week/gw${gw}`,
          title: `FPL team of the week \u2014 gameweek ${gw}`,
          description: `The highest-scoring valid Fantasy Premier League XI of gameweek ${gw}, who else scored, and how the model's own picks compared.`,
          crumbs: [{ name: 'Fantasy Premier League', path: '/fpl/start' }],
        });
        const dir = join(DIST, 'fpl', 'team-of-the-week', `gw${gw}`);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
        n++;
      } catch (err) {
        console.error(`Static: failed gameweek ${gw}: ${err?.message ?? err}`);
      }
    }
    console.log(`Static: wrote head tags for ${n} gameweek page(s).`);
  }

  // Entity pages need the database; head tags above do not, which is
  // why they run first. A build without credentials should still fix
  // the duplicate-title problem rather than skipping everything.
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('Static: no Supabase credentials -- head tags written, entity pages skipped.');
    return;
  }

  // Every bulk fetch starts NOW, concurrently, and each section awaits
  // only the one it needs. Serially, a dozen requests with 20s timeouts
  // could outlast the 240s watchdog on a slow Supabase day, and the
  // watchdog discards everything not yet written -- which is how the
  // team and finance pages can vanish from a deploy that still succeeds.
  SEASON_ID = await query('rpc/fpl_current_season_id');
  const pending = {
    gameweeks: queryAll(`fpl_player_gameweeks?select=fpl_event_id,total_points&season_id=eq.${SEASON_ID}&total_points=gt.0`),
    scouts: queryAll('player_identity?select=slug,canonical_name&order=slug.asc'),
    finance: fetchFinanceBulk(queryAll).catch((err) => { console.error(`Static: finance fetch failed: ${err?.message ?? err}`); return null; }),
    teams: queryAll('teams?select=team_id,display_name,slug'),
    fits: queryAll('model_fit_runs?select=fit_run_id,rho'),
    fixtures: queryAll(
      `fixtures?select=fixture_id,slug,kickoff_date,status,matchweek,home_team_id,away_team_id,predicted_home_goals,predicted_away_goals,predicted_at,prediction_fit_run_id,reported_home_goals,reported_away_goals` +
        `&league_id=eq.${EPL_LEAGUE_ID}&season_id=eq.${SEASON_ID}&slug=not.is.null`
    ),
    matches: queryAll(
      `matches?select=match_id,home_team_id,away_team_id,match_date,full_time_home_goals,full_time_away_goals` +
        `&league_id=eq.${EPL_LEAGUE_ID}&season_id=eq.${SEASON_ID}`
    ),
    players: queryAll(
      `fpl_players?select=fpl_player_id,slug,web_name,first_name,second_name,element_type,now_cost,canonical_team_id&season_id=eq.${SEASON_ID}&slug=not.is.null`
    ),
    projections: queryAll(
      `fpl_player_projections?select=fixture_id,fpl_player_id,expected_fpl_points,expected_minutes,generated_at,model_version,${PROJECTION_DETAIL_COLUMNS}&model_version=eq.${MODEL_VERSION}&scenario_key=eq.baseline`
    ),
    actuals: queryAll(`fpl_player_gameweeks?select=fpl_fixture_id,fpl_player_id,total_points&season_id=eq.${SEASON_ID}`),
    ratings: queryAll('team_ratings?select=team_id,attack_strength,defence_strength,is_estimated,fit_run_id'),
    overrides: queryAll('team_strength_manual_override?select=team_id,attack_adjustment,defence_adjustment'),
    acceptedFits: queryAll('model_fit_runs?select=fit_run_id,league_id,fitted_at,status&status=eq.accepted&order=fitted_at.desc'),
    // History hub (Premier League): the latest season's size fixes the comparison group.
    historyLatest: query('team_season_summary?select=clubs,start_year&league_id=eq.1&order=start_year.desc&limit=1'),
    // Market line beside the model on match pages.
    marketLatest: queryAll('fixture_market_latest?select=fixture_id,market_home,market_draw,market_away,captured_at'),
    marketRecord: query(`model_vs_market_by_league?select=matches,from_date,model_log_loss,market_log_loss&league_id=eq.${EPL_LEAGUE_ID}`),
    // League and league-season pages (/football/leagues/...).
    leagueRefs: query('leagues?select=league_id,code,name,slug,countries(name)&competition_type=eq.league'),
    eraNames: queryAll('league_season_display_names?select=league_id,season_id,name&order=league_id.asc,season_id.asc'),
  };

  await writeGameweekPages();

  // ---- Player Scout pages ------------------------------------------
  // One per player who actually played, across every imported season.
  // These are the only pages a DEPARTED player has -- their per-season
  // slug disappeared with them -- so they're also the ones with no
  // other route into the site.
  async function writePlayerScoutPages() {
    const players = await pending.scouts;
    let n = 0;
    for (const p of players ?? []) {
      if (!p.slug) continue;
      try {
        const page = renderStaticRouteHead({
          path: `/fpl/player-scout/${p.slug}`,
          title: `${p.canonical_name} \u2014 FPL career record`,
          description: `${p.canonical_name}'s season-by-season Fantasy Premier League record: points, price, goals, assists and form.`,
          crumbs: [{ name: 'Fantasy Premier League', path: '/fpl/start' }],
        });
        const dir = join(DIST, 'fpl', 'player-scout', p.slug);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
        n++;
      } catch (err) {
        console.error(`Static: failed scout page ${p.slug}: ${err?.message ?? err}`);
      }
    }
    console.log(`Static: wrote head tags for ${n} player scout page(s).`);
  }

  await writePlayerScoutPages();

  // ---- International: nation, tournament and edition pages (head only) -----
  // The bodies load in the browser; what the static file gives crawlers is
  // the right title, description, canonical and breadcrumb for each URL
  // (before 6 Oct 2026 these were bare app-shell pages, absent from the
  // sitemap). Same rule as the sitemap: nations with 30+ games, every
  // tournament, every edition. Titles come from src/lib/intlSeo.ts, which
  // the pages use too.
  async function writeIntlPages() {
    const entry = await import(ENTRY);
    if (!entry.intlTeamHead) return;
    // Every view read once (~120 requests in all); each page's data is then
    // cut out by src/lib/intlStatic.ts with the browser loaders' filters.
    const enc = (cols) => cols.replace(/\s+/g, '');
    const [teams, editions, matches, fixtures, totals, pairs, goals, squads, squadPlayers, groupOdds, stages, groups] = await Promise.all([
      queryAll(`intl_team_summary?select=${enc(entry.INTL_TEAM_COLUMNS)}&order=slug.asc`),
      queryAll(`intl_edition_summary?select=${enc(entry.INTL_EDITION_COLUMNS)}&order=competition.asc,season_start.asc`),
      queryAll(`intl_matches?select=${enc(entry.INTL_MATCH_COLUMNS)}&order=match_key.asc`),
      queryAll(`intl_fixtures?select=${enc(entry.INTL_FIXTURE_COLUMNS)}&order=fixture_key.asc`),
      queryAll(`intl_team_competition_totals?select=${entry.INTL_BULK_TOTAL_COLUMNS}&order=team.asc,competition.asc`),
      queryAll(`intl_pair_records?select=${entry.INTL_BULK_PAIR_COLUMNS}&order=team_a.asc,team_b.asc`),
      queryAll(`intl_goals?select=${entry.INTL_BULK_GOAL_COLUMNS}&order=match_key.asc,seq.asc`),
      queryAll(`intl_squads?select=${enc(entry.INTL_SQUAD_COLUMNS)}&order=slug.asc`),
      queryAll(`intl_squad_players?select=slug,${enc(entry.INTL_SQUAD_PLAYER_COLUMNS)}&order=slug.asc,list.asc,seq.asc`),
      queryAll(`intl_group_odds?select=${enc(entry.INTL_GROUP_ODDS_COLUMNS)}&order=edition_key.asc,group_label.asc,slug.asc`),
      queryAll(`intl_stages?select=${entry.INTL_BULK_STAGE_COLUMNS}&order=stage_key.asc`),
      queryAll(`intl_groups?select=${entry.INTL_BULK_GROUP_COLUMNS}&order=group_key.asc`),
    ]);
    // Full pages need every view; if any read failed, fall back to head-only
    // pages (title, description, canonical) rather than half-filled ones.
    const full = [teams, editions, matches, fixtures, totals, pairs, goals, squads, squadPlayers, groupOdds, stages, groups].every((x) => x != null);
    const bulk = full ? { teams, editions, matches, fixtures, totals, pairs, goals, squads, squadPlayers, groupOdds, stages, groups } : null;
    if (!full) console.error('Static: an international view failed to load -- writing head-only international pages.');
    const writeHtml = (path, page) => {
      const dir = join(DIST, ...path.split('/').filter(Boolean));
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
    };
    let n = 0;
    let rendered = 0;
    for (const t of (teams ?? []).filter((x) => x.played >= entry.INTL_STATIC_TEAM_MIN_GAMES)) {
      const head = entry.intlTeamHead(t);
      try {
        const data = bulk ? entry.intlTeamFromBulk(bulk, t.slug) : null;
        if (data) { writeHtml(head.path, entry.renderIntlTeamPage(data)); rendered++; } else writeHtml(head.path, renderStaticRouteHead(head));
        n++;
      } catch (err) {
        console.error(`Static: failed intl team ${t.slug}: ${err?.message ?? err}`);
        try { writeHtml(head.path, renderStaticRouteHead(head)); n++; } catch { /* keep going */ }
      }
    }
    const byComp = new Map(entry.INTL_TOURNAMENTS.map((t) => [t.competition, t]));
    for (const t of entry.INTL_TOURNAMENTS) {
      try { const head = entry.intlTournamentHead(t); writeHtml(head.path, renderStaticRouteHead(head)); n++; } catch (err) { console.error(`Static: failed intl tournament ${t.slug}: ${err?.message ?? err}`); }
    }
    for (const e of editions ?? []) {
      const t = byComp.get(e.competition);
      if (!t) continue;
      const head = entry.intlEditionHead(t, e);
      try {
        const data = bulk ? entry.intlEditionFromBulk(bulk, t.slug, e.label) : null;
        const page = data ? entry.renderIntlEditionPage(data) : null;
        if (page) { writeHtml(head.path, page); rendered++; } else writeHtml(head.path, renderStaticRouteHead(head));
        n++;
      } catch (err) {
        console.error(`Static: failed intl edition ${e.competition} ${e.label}: ${err?.message ?? err}`);
        try { writeHtml(head.path, renderStaticRouteHead(head)); n++; } catch { /* keep going */ }
      }
    }
    console.log(`Static: wrote ${n} international page(s), ${rendered} fully rendered (${(teams ?? []).length} nations read, ${(editions ?? []).length} editions).`);
  }

  await writeIntlPages();

  // ---- Club finance pages --------------------------------------------------
  // Generated for EVERY team with published accounts -- not only the Premier
  // League -- from five requests in total however many clubs there are (see
  // scripts/lib/financeStatic.mjs). Runs BEFORE the team pages, which need to
  // know which clubs have accounts (for their Finances link), and so that the
  // team block's early exit on missing fixture data cannot take these down.
  async function writeFinancePages() {
    const bulk = await pending.finance;
    if (!bulk) {
      console.warn('Static: finance data unavailable -- skipping finance pages.');
      return new Set();
    }
    const entry = await import(ENTRY);
    const site = buildFinanceSite(bulk, entry);
    let n = 0;
    for (const club of site.clubs) {
      try {
        const page = entry.renderTeamFinancePage(club.team.slug, club);
        const dir = join(DIST, 'football', 'teams', club.team.slug, 'finances');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
        n++;
      } catch (err) {
        console.error(`Static: failed finance page ${club.team.slug}: ${err?.message ?? err}`);
      }
    }
    try {
      const page = entry.renderFinanceComparePage(site.clubs);
      mkdirSync(join(DIST, 'finance', 'compare'), { recursive: true });
      writeFileSync(join(DIST, 'finance', 'compare', 'index.html'), buildDocument(shell, page), 'utf8');
    } catch (err) {
      console.error(`Static: failed /finance/compare: ${err?.message ?? err}`);
    }
    try {
      const page = entry.renderFinanceIndexPage(site.index);
      mkdirSync(join(DIST, 'finance'), { recursive: true });
      writeFileSync(join(DIST, 'finance', 'index.html'), buildDocument(shell, page), 'utf8');
    } catch (err) {
      console.error(`Static: failed /finance index: ${err?.message ?? err}`);
    }
    console.log(`Static: wrote ${n} club finance page(s) and the /finance index.`);
    return site.teamIds;
  }

  // ---- History hub -----------------------------------------------------------
  // Written after the static-route loop (which gave it head tags only), so
  // the full server-rendered page replaces that file: the numbers are in the
  // HTML for crawlers. Any failure leaves the head-only page in place.
  async function writeHistoryHub() {
    try {
      const latest = await pending.historyLatest;
      const clubs = latest?.[0]?.clubs ?? 20;
      const group = `${clubs}x${2 * (clubs - 1)}`;
      const [reliability, leaders] = await Promise.all([
        queryAll(`league_table_reliability?select=matches_played,seasons,rank_correlation,mean_abs_position_change,same_position_share&league_id=eq.1&comparable_group=eq.${group}&order=matches_played.asc`),
        query(`rpc/history_what_happened_next?p_league_id=1&p_matches_played=10&p_position_min=1&p_position_max=1&p_comparable_group=${group}`),
      ]);
      if (!reliability || reliability.length === 0 || !leaders) {
        console.warn('Static: history data unavailable -- history hub keeps head tags only.');
        return;
      }
      const entry = await import(ENTRY);
      const page = entry.renderHistoryHubPage({
        leagueCode: 'E0',
        comparableGroup: group,
        reliability,
        leadersAfter10: { champions: leaders.filter((r) => r.champion).length, teamSeasons: leaders.length },
      });
      const dir = join(DIST, 'football', 'history');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
      console.log('Static: wrote the history hub.');
    } catch (err) {
      console.error(`Static: failed /football/history: ${err?.message ?? err}`);
    }
  }
  await writeHistoryHub();

  // ---- Leagues, league histories and league seasons --------------------------
  // /football/leagues, /football/leagues/:league and every league-season:
  // full server-rendered pages (table, story, fingerprint) from four bulk
  // queries. Any failure leaves the SPA shell, which still works.
  let leagueBulk = null;
  async function writeLeaguePages() {
    try {
      const { assembleLeaguePages, SUMMARY_SELECT, TABLE_COLUMNS, renderLeaguesPage, renderLeagueIndexPage, renderLeagueSeasonPage } = await import(ENTRY);
      const [leagues, summaries, tables, eraNames, teams] = await Promise.all([
        pending.leagueRefs,
        queryAll(`league_season_summary?select=${SUMMARY_SELECT.replace(/\s+/g, '')}&order=league_id.asc,season_id.asc`),
        queryAll(`team_season_summary?select=${TABLE_COLUMNS.replace(/\s+/g, '')}&order=league_id.asc,season_id.asc,team_id.asc`),
        pending.eraNames,
        pending.teams,
      ]);
      if (!leagues || !summaries || !tables || !teams) {
        console.warn('Static: league data unavailable -- league pages stay client-rendered.');
        return;
      }
      const built = assembleLeaguePages({ leagues, summaries, tables, eraNames: eraNames ?? [], teams });
      leagueBulk = { leagues, summaries, tables, eraNames: eraNames ?? [], teams, built };
      const write = (path, page) => {
        const dir = join(DIST, ...path.split('/').filter(Boolean));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
      };
      write('/football/leagues', renderLeaguesPage(built.list));
      let n = 0;
      for (const { index, seasons } of built.leagues) {
        try {
          const page = renderLeagueIndexPage(index);
          write(new URL(page.canonical).pathname, page);
          n++;
        } catch (err) {
          console.error(`Static: failed league ${index.league.slug}: ${err?.message ?? err}`);
        }
        for (const season of seasons) {
          try {
            if (season.rows.length === 0) continue;
            const page = renderLeagueSeasonPage(season);
            write(new URL(page.canonical).pathname, page);
            n++;
          } catch (err) {
            console.error(`Static: failed league season ${season.league.slug} ${season.season.start_year}: ${err?.message ?? err}`);
          }
        }
      }
      console.log(`Static: wrote /football/leagues and ${n} league and league-season page(s).`);
    } catch (err) {
      console.error(`Static: failed league pages: ${err?.message ?? err}`);
    }
  }
  await writeLeaguePages();

  // ---- NFL -------------------------------------------------------------------
  // Fixtures & Results, League Table, Your Team (+ 32 team pages), Past seasons
  // (+ one page per season, with its story) and Scoring Rules: ~65 pages from
  // a few bulk queries. The hub, stage pages, TV Guide, Player Scout and Fixture
  // Heat Map get head tags only (STATIC_ROUTES); player pages are client-only.
  // Any failure leaves the SPA shell, which still works.
  async function writeNflPages() {
    try {
      const entry = await import(ENTRY);
      const latestRow = await query('nfl_games?select=season&order=season.desc&limit=1');
      const latest = latestRow?.[0]?.season;
      if (latest == null) {
        console.warn('Static: NFL data unavailable -- NFL pages stay client-rendered.');
        return;
      }
      const [teams, standings, games, summaries] = await Promise.all([
        query(`nfl_teams?select=${entry.NFL_TEAM_COLUMNS}&order=name.asc`),
        queryAll(`nfl_standings?select=${entry.NFL_STANDING_COLUMNS}&order=season.asc,franchise.asc`),
        queryAll(`nfl_games?select=${entry.NFL_GAME_COLUMNS}&order=season.asc,week.asc,game_id.asc`),
        query(`nfl_season_summary?select=${entry.NFL_SUMMARY_COLUMNS}&order=season.asc`),
      ]);
      if (!teams || !standings || !games || !summaries) {
        console.warn('Static: NFL data unavailable -- NFL pages stay client-rendered.');
        return;
      }
      const seasons = entry.nflSeasonRange(latest);
      const write = (page) => {
        const dir = join(DIST, ...new URL(page.canonical).pathname.split('/').filter(Boolean));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
      };
      const attempt = (label, fn) => {
        try {
          write(fn());
          return 1;
        } catch (err) {
          console.error(`Static: failed NFL ${label}: ${err?.message ?? err}`);
          return 0;
        }
      };
      const gamesBy = new Map();
      for (const g of games) {
        if (!gamesBy.has(g.season)) gamesBy.set(g.season, []);
        gamesBy.get(g.season).push(g);
      }
      const latestGames = gamesBy.get(latest) ?? [];
      const tableSeason = Math.max(...standings.map((r) => r.season));
      const teamStats = (await query(`nfl_team_seasons?select=${entry.NFL_TEAM_SEASON_COLUMNS}&season=eq.${tableSeason}`)) ?? [];
      const tableData = { season: tableSeason, seasons, rows: standings.filter((r) => r.season === tableSeason), games: gamesBy.get(tableSeason) ?? [], teamStats: teamStats.length ? teamStats : undefined };
      let n = 0;
      const model = (await query(`nfl_game_model?select=${entry.NFL_MODEL_COLUMNS}&game_id=like.${latest}_*&limit=1000`)) ?? [];
      const week = entry.buildNflWeek(latest, seasons, latestGames, null, teams, model);
      if (week) n += attempt('fixtures', () => entry.renderNflFixturesPage(week));
      n += attempt('table', () => entry.renderNflTablePage(tableData));
      n += attempt('teams', () => entry.renderNflTeamsPage(tableData));
      n += attempt('seasons', () => entry.renderNflSeasonsPage({ standings, summaries }));
      n += attempt('scoring rules', () => entry.renderNflScoringPage());
      for (const season of seasons) {
        const rows = standings.filter((r) => r.season === season);
        if (rows.length === 0) continue;
        n += attempt(`season ${season}`, () => entry.renderNflSeasonPage({ season, seasons, rows, games: gamesBy.get(season) ?? [], summaries }));
      }
      for (const team of teams) n += attempt(`team ${team.slug}`, () => entry.renderNflTeamPage(entry.buildNflTeam(team, standings, latestGames, latest)));
      // Road Trips and Pick My Team: from this season's games, the last
      // complete season's standings and every London game since 2007.
      n += attempt('road trips', () => entry.renderNflRoadTripsPage(entry.buildNflRoadTrips(latest, latestGames, teams)));
      const lastComplete = Math.max(...standings.filter((r) => r.season_complete).map((r) => r.season));
      const londonGames = games.filter((g) => entry.NFL_LONDON_STADIUM.test(g.stadium ?? ''));
      n += attempt('pick my team', () => entry.renderNflPickPage(entry.buildNflPicker(latest, latestGames, standings.filter((r) => r.season === lastComplete), londonGames, teams)));
      // Game pages for the latest season (every game since 2002 is the pool
      // for head-to-head and form; older games render in the browser).
      const modelBy = new Map(model.map((m) => [m.game_id, m]));
      for (const g of latestGames) n += attempt(`game ${g.game_id}`, () => entry.renderNflGamePage(entry.buildNflGamePreview(g, games, modelBy.get(g.game_id) ?? null)));
      console.log(`Static: wrote ${n} NFL page(s).`);
    } catch (err) {
      console.error(`Static: failed NFL pages: ${err?.message ?? err}`);
    }
  }
  await writeNflPages();

  // ---- Your Local Clubs (/football/local-clubs) --------------------------------
  // Every club with a checked ground and this season's division; the postcode
  // part only happens in the browser.
  try {
    const entry = await import(ENTRY);
    const tiers = entry.LOCAL_CLUBS_TIERS.join(',');
    const [grounds, standings] = await Promise.all([
      query('club_grounds?select=team_id,ground_name,latitude,longitude'),
      query(`league_standings?select=team_id,league_name,tier,season_start_year&league_code=in.(${tiers})&order=season_start_year.desc&limit=200`),
    ]);
    // Only the clubs with a ground (well under PostgREST's 1,000-row cap).
    const teams = grounds ? await query(`teams?select=team_id,display_name,canonical_name,slug&team_id=in.(${grounds.map((g) => g.team_id).join(',')})`) : null;
    if (grounds && standings && teams) {
      const page = entry.renderLocalClubsPage(entry.buildLocalClubs(grounds, teams, standings));
      const dir = join(DIST, 'football', 'local-clubs');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
      console.log('Static: wrote Your Local Clubs.');
    } else console.warn('Static: club grounds unavailable -- Your Local Clubs stays client-rendered.');
  } catch (err) {
    console.error(`Static: failed Your Local Clubs: ${err?.message ?? err}`);
  }

  // ---- Tennis ----------------------------------------------------------------
  // Results (latest day), Your Player, Past seasons (ATP: the list pages'
  // default tour), a season page per tour-year, and a page per player with 50+
  // matches in the tour's last three seasons. Each tour's matches are fetched
  // once (~70k ATP, ~48k WTA rows) and every page is built from them. Any
  // failure leaves the SPA shell, which still works.
  async function writeTennisPages() {
    try {
      const entry = await import(ENTRY);
      const write = (page) => {
        const dir = join(DIST, ...new URL(page.canonical).pathname.split('/').filter(Boolean));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
      };
      let n = 0;
      const attempt = (label, fn) => {
        try {
          write(fn());
          n++;
        } catch (err) {
          console.error(`Static: failed tennis ${label}: ${err?.message ?? err}`);
        }
      };
      const h2hManifest = [];
      for (const tour of ['ATP', 'WTA']) {
        // By year: deep offsets over a whole tour take ~1s a page; a year is 3 small pages.
        const latestRow = await query(`tennis_matches?select=year&tour=eq.${tour}&order=match_date.desc&limit=1`);
        const players = await queryAll(`tennis_players?select=${entry.TENNIS_PLAYER_COLUMNS}&tour=eq.${tour}&order=player_id.asc`);
        const matches = [];
        let missing = latestRow?.[0]?.year == null;
        for (const y of missing ? [] : entry.tennisYears(tour, latestRow[0].year)) {
          const rows = await queryAll(`tennis_matches?select=${entry.TENNIS_MATCH_COLUMNS}&tour=eq.${tour}&year=eq.${y}&order=source_key.asc`);
          if (rows == null) missing = true;
          else matches.push(...rows);
        }
        if (missing || !matches.length || !players?.length) {
          console.warn(`Static: tennis ${tour} data unavailable -- its pages stay client-rendered.`);
          continue;
        }
        matches.sort((a, b) => a.match_date.localeCompare(b.match_date) || a.source_key.localeCompare(b.source_key));
        const latestDate = matches[matches.length - 1].match_date;
        const latestYear = Number(latestDate.slice(0, 4));
        const years = entry.tennisYears(tour, latestYear);
        if (tour === 'ATP') {
          const y = Number(latestDate.slice(0, 4));
          const m = Number(latestDate.slice(5, 7)) - 1;
          const { from, to } = entry.tennisResultsWindow(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1);
          attempt('results', () => entry.renderTennisResultsPage({ tour, latestDate, from, to, matches: matches.filter((x) => x.match_date >= from && x.match_date <= to) }));
          attempt('players', () => entry.renderTennisPlayersPage({ tour, players }));
          attempt('seasons', () => entry.renderTennisSeasonsPage(entry.buildTennisSeasonIndex(tour, matches.filter((x) => x.round === 'The Final'))));
        }
        // Phase 3: tournaments list (ATP), every event page, and the draw page of
        // every Grand Slam, Tour Finals and 1000 edition.
        const events = await queryAll(`tennis_events?select=${entry.TENNIS_EVENT_COLUMNS}&tour=eq.${tour}&order=event_id.asc`);
        const editions = await queryAll(`tennis_editions?select=${entry.TENNIS_EDITION_COLUMNS}&tour=eq.${tour}&order=tournament_id.asc,year.asc`);
        if (events?.length && editions?.length) {
          if (tour === 'ATP') attempt('tournaments', () => entry.renderTennisTournamentsPage(entry.buildTennisTournaments(tour, events, editions)));
          const byEdition = new Map();
          for (const x of matches) {
            const k = `${x.tournament_id}|${x.year}`;
            if (!byEdition.has(k)) byEdition.set(k, []);
            byEdition.get(k).push(x);
          }
          const edsByEvent = new Map();
          for (const e of editions) {
            if (!edsByEvent.has(e.event_id)) edsByEvent.set(e.event_id, []);
            edsByEvent.get(e.event_id).push(e);
          }
          for (const ev of events) {
            const eds = (edsByEvent.get(ev.event_id) ?? []).sort((a, b) => a.year - b.year);
            const own = eds.flatMap((e) => byEdition.get(`${e.tournament_id}|${e.year}`) ?? []);
            attempt(`event ${tour} ${ev.slug}`, () => entry.renderTennisEventPage({ event: ev, summary: entry.tennisEventSummary(eds, own) }));
            for (const e of eds) {
              if (e.level_rank > 3) continue;
              const rows = byEdition.get(`${e.tournament_id}|${e.year}`) ?? [];
              if (rows.length) attempt(`edition ${tour} ${ev.slug} ${e.year}`, () => entry.renderTennisEditionPage({ event: ev, edition: e, matches: rows, years: eds.map((d) => d.year) }));
            }
          }
        } else console.warn(`Static: tennis ${tour} events unavailable -- tournament pages stay client-rendered.`);
        const byYear = new Map();
        for (const x of matches) {
          if (!byYear.has(x.year)) byYear.set(x.year, []);
          byYear.get(x.year).push(x);
        }
        for (const year of years) {
          const rows = byYear.get(year);
          if (rows?.length) attempt(`season ${tour} ${year}`, () => entry.renderTennisSeasonPage({ summary: entry.tennisSeasonSummary(tour, year, rows), years }));
        }
        const byPlayer = new Map();
        for (const x of matches) for (const id of [x.winner_id, x.loser_id]) {
          if (!byPlayer.has(id)) byPlayer.set(id, []);
          byPlayer.get(id).push(x);
        }
        for (const p of players) {
          if (p.recent_matches < entry.TENNIS_STATIC_PLAYER_MIN) continue;
          attempt(`player ${tour} ${p.slug}`, () => entry.renderTennisPlayerPage(entry.buildTennisPlayer(p, byPlayer.get(p.player_id) ?? [])));
        }
        // Rivalries: the most-played pairs between players who still have a
        // page of their own (50+ recent matches) get a page each, at
        // /tennis/head-to-head/:tour/:a/:b (slugs in alphabetical order).
        // The list goes to dist-ssr/tennis-h2h-pairs.json for the sitemap.
        try {
          const live = new Map(players.filter((p) => p.recent_matches >= entry.TENNIS_STATIC_PLAYER_MIN).map((p) => [p.player_id, p]));
          const meetingsByPair = new Map();
          for (const x of matches) {
            if (!live.has(x.winner_id) || !live.has(x.loser_id)) continue;
            const k = x.winner_id < x.loser_id ? `${x.winner_id}|${x.loser_id}` : `${x.loser_id}|${x.winner_id}`;
            if (!meetingsByPair.has(k)) meetingsByPair.set(k, []);
            meetingsByPair.get(k).push(x);
          }
          const top = [...meetingsByPair.entries()]
            .filter(([, ms]) => ms.length >= TENNIS_H2H_MIN_MEETINGS)
            .sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0]))
            .slice(0, TENNIS_H2H_PAIRS_PER_TOUR);
          const ids = [...new Set(top.flatMap(([k]) => k.split('|').map(Number)))];
          const ratings = ids.length ? await queryAll(`tennis_ratings?select=${entry.TENNIS_RATING_COLUMNS}&player_id=in.(${ids.join(',')})&order=player_id.asc`) : [];
          const keys = top.flatMap(([, ms]) => ms.map((m) => m.source_key));
          const modelP = {};
          let modelOk = true;
          for (let i = 0; i < keys.length; i += 40) {
            const chunk = keys.slice(i, i + 40).map((k) => `"${k}"`).join(',');
            const rows = await query(`tennis_match_model?select=source_key,p_winner&source_key=in.(${encodeURIComponent(chunk)})`);
            if (rows == null) { modelOk = false; break; }
            for (const r of rows) if (r.p_winner != null) modelP[r.source_key] = r.p_winner;
          }
          if (ratings && modelOk) {
            for (const [, ms] of top) {
              const [p1, p2] = [live.get(ms[0].winner_id), live.get(ms[0].loser_id)];
              const [pa, pb] = p1.slug <= p2.slug ? [p1, p2] : [p2, p1];
              const own = Object.fromEntries(ms.filter((m) => m.source_key in modelP).map((m) => [m.source_key, modelP[m.source_key]]));
              const before = n;
              attempt(`head to head ${tour} ${pa.slug} ${pb.slug}`, () => entry.renderTennisH2HPairPage({
                tour, a: pa, b: pb,
                ratingsA: ratings.filter((r) => r.player_id === pa.player_id),
                ratingsB: ratings.filter((r) => r.player_id === pb.player_id),
                meetings: ms, modelP: own,
              }));
              if (n > before) h2hManifest.push({ tour, a: pa.slug, b: pb.slug, last: ms[ms.length - 1].match_date });
            }
          } else console.warn(`Static: tennis ${tour} ratings or model unavailable -- rivalry pages skipped.`);
        } catch (err) {
          console.error(`Static: failed tennis ${tour} rivalries: ${err?.message ?? err}`);
        }
      }
      try {
        writeFileSync(join(process.cwd(), 'dist-ssr', 'tennis-h2h-pairs.json'), JSON.stringify(h2hManifest), 'utf8');
        console.log(`Static: wrote ${h2hManifest.length} tennis rivalry page(s).`);
      } catch (err) {
        console.error(`Static: could not write the rivalry list: ${err?.message ?? err}`);
      }
      // Head to head (ATP default pair): the page itself; other pairs load in the browser.
      try {
        const [a, b] = entry.TENNIS_DEFAULT_PAIR.ATP;
        const pl = await query(`tennis_players?select=${entry.TENNIS_PLAYER_COLUMNS}&tour=eq.ATP&slug=in.(${a},${b})`);
        const pa = pl?.find((p) => p.slug === a);
        const pb = pl?.find((p) => p.slug === b);
        if (pa && pb) {
          const ratings = await query(`tennis_ratings?select=${entry.TENNIS_RATING_COLUMNS}&player_id=in.(${pa.player_id},${pb.player_id})`);
          const meetings = await queryAll(`tennis_matches?select=${entry.TENNIS_MATCH_COLUMNS}&tour=eq.ATP&or=(and(winner_id.eq.${pa.player_id},loser_id.eq.${pb.player_id}),and(winner_id.eq.${pb.player_id},loser_id.eq.${pa.player_id}))&order=match_date.asc`);
          const keys = (meetings ?? []).map((m) => `"${m.source_key}"`).join(',');
          const model = keys ? await query(`tennis_match_model?select=source_key,p_winner&source_key=in.(${encodeURIComponent(keys)})`) : [];
          if (ratings && meetings) {
            const modelP = Object.fromEntries((model ?? []).filter((r) => r.p_winner != null).map((r) => [r.source_key, r.p_winner]));
            attempt('head to head', () => entry.renderTennisH2HPage({ tour: 'ATP', a: pa, b: pb, ratingsA: ratings.filter((r) => r.player_id === pa.player_id), ratingsB: ratings.filter((r) => r.player_id === pb.player_id), meetings, modelP }));
          }
        }
      } catch (err) {
        console.error(`Static: failed tennis head to head: ${err?.message ?? err}`);
      }
      // TV guide (both tours): as at build day; the page refetches on a later day.
      const today = new Date().toISOString().slice(0, 10);
      const since = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10);
      const calendar = await queryAll(`tennis_calendar?select=${entry.TENNIS_CALENDAR_COLUMNS}&order=usual_start.asc`);
      const recent = await queryAll(`tennis_editions?select=${entry.TENNIS_EDITION_COLUMNS}&start_date=gte.${since}&order=start_date.asc`);
      if (calendar && recent) {
        const latestDate = recent.reduce((a, e) => (a == null || e.end_date > a ? e.end_date : a), null);
        attempt('tv guide', () => entry.renderTennisTvGuidePage({ calendar, recent, latestDate }, today));
      }
      console.log(`Static: wrote ${n} tennis page(s).`);
    } catch (err) {
      console.error(`Static: failed tennis pages: ${err?.message ?? err}`);
    }
  }
  await writeTennisPages();

  // ---- Record Book (/football/records, /football/records/:league) -----------
  async function writeRecordsPages() {
    if (!leagueBulk) return;
    try {
      const { buildRecords, renderRecordsPage, renderRecordsIndexPage } = await import(ENTRY);
      const write = (path, page) => {
        const dir = join(DIST, ...path.split('/').filter(Boolean));
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
      };
      write('/football/records', renderRecordsIndexPage(leagueBulk.built.list));
      const teams = new Map(leagueBulk.teams.map((t) => [t.team_id, { name: t.display_name, slug: t.slug }]));
      let n = 0;
      for (const { index } of leagueBulk.built.leagues) {
        const league = index.league;
        try {
          const [streaks, matches] = await Promise.all([
            query(`rpc/history_record_streaks?p_league_id=${league.league_id}&p_limit=10`),
            query(`rpc/history_record_matches?p_league_id=${league.league_id}&p_limit=10`),
          ]);
          if (!streaks || !matches) continue;
          const data = buildRecords({
            league,
            summaries: leagueBulk.summaries.filter((x) => x.league_id === league.league_id),
            tables: leagueBulk.tables.filter((x) => x.league_id === league.league_id),
            streaks,
            matches,
            teams,
          });
          const page = renderRecordsPage(data);
          write(new URL(page.canonical).pathname, page);
          n++;
        } catch (err) {
          console.error(`Static: failed records ${league.slug}: ${err?.message ?? err}`);
        }
      }
      console.log(`Static: wrote /football/records and ${n} league record page(s).`);
    } catch (err) {
      console.error(`Static: failed records pages: ${err?.message ?? err}`);
    }
  }
  await writeRecordsPages();

  // ---- League Lab (/football/history/trends[/:league]) -----------------------
  async function writeTrendsPages() {
    if (!leagueBulk) return;
    try {
      const { renderTrendsPage } = await import(ENTRY);
      let n = 0;
      for (const { index } of leagueBulk.built.leagues) {
        try {
          const league = index.league;
          const page = renderTrendsPage({ league, seasons: leagueBulk.summaries.filter((x) => x.league_id === league.league_id) });
          const dir = join(DIST, ...new URL(page.canonical).pathname.split('/').filter(Boolean));
          mkdirSync(dir, { recursive: true });
          writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
          n++;
        } catch (err) {
          console.error(`Static: failed trends ${index.league.slug}: ${err?.message ?? err}`);
        }
      }
      console.log(`Static: wrote ${n} League Lab page(s).`);
    } catch (err) {
      console.error(`Static: failed League Lab pages: ${err?.message ?? err}`);
    }
  }
  await writeTrendsPages();

  // ---- Scoreline Explorer (one page: Premier League, all seasons) -------------
  try {
    const { renderScorelinesPage } = await import(ENTRY);
    const rows = await query('rpc/history_scorelines?p_league_id=1');
    const league = leagueBulk?.built.leagues.find(({ index }) => index.league.league_id === 1)?.index.league;
    if (rows && league) {
      const page = renderScorelinesPage({ league, rows: rows.map((r) => ({ ...r, matches: Number(r.matches) })) });
      const dir = join(DIST, 'football', 'history', 'scorelines');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
      console.log('Static: wrote the Scoreline Explorer.');
    }
  } catch (err) {
    console.error(`Static: failed Scoreline Explorer: ${err?.message ?? err}`);
  }

  const financeTeamIds = await writeFinancePages();

  // Bulk fetches -- three requests total, not one per page.
  const teams = await pending.teams;
  const fits = await pending.fits;
  const fixtures = await pending.fixtures;
  if (!teams || !fixtures) {
    console.warn('Static: required data unavailable -- skipping.');
    return;
  }

  const teamById = new Map(teams.map((t) => [t.team_id, t]));
  const marketById = new Map(
    ((await pending.marketLatest) ?? []).map((m) => [m.fixture_id, { home: Number(m.market_home), draw: Number(m.market_draw), away: Number(m.market_away), captured_at: m.captured_at }])
  );
  const rec = (await pending.marketRecord)?.[0];
  const marketRecord = rec ? { matches: Number(rec.matches), from_date: rec.from_date, model_log_loss: Number(rec.model_log_loss), market_log_loss: Number(rec.market_log_loss) } : null;
  const rhoByFit = new Map((fits ?? []).map((f) => [f.fit_run_id, Number(f.rho)]));

  // Actual results, for played fixtures. Keyed the same way the runtime
  // page keys them so generated and client-rendered output agree.
  const matches = await pending.matches;
  const resultKey = (h, a, d) => `${h}|${a}|${d}`;
  const resultByKey = new Map(
    (matches ?? []).map((m) => [resultKey(m.home_team_id, m.away_team_id, m.match_date), m])
  );

  let written = 0;
  let skipped = 0;

  for (const f of fixtures) {
    const home = teamById.get(f.home_team_id);
    const away = teamById.get(f.away_team_id);
    if (!home || !away) {
      skipped++;
      continue;
    }

    const lambdaHome = f.predicted_home_goals != null ? Number(f.predicted_home_goals) : null;
    const lambdaAway = f.predicted_away_goals != null ? Number(f.predicted_away_goals) : null;
    const rho = f.prediction_fit_run_id != null ? rhoByFit.get(f.prediction_fit_run_id) : undefined;

    // The page component derives its own model from these lambdas; the
    // generator only supplies rho so the same maths runs here as in the
    // browser. Left null when the fixture genuinely has no prediction,
    // which the page already handles.
    const result = resultByKey.get(resultKey(f.home_team_id, f.away_team_id, f.kickoff_date));

    const data = {
      slug: f.slug,
      home_team_name: home.display_name,
      away_team_name: away.display_name,
      home_team_slug: home.slug,
      away_team_slug: away.slug,
      kickoff_date: f.kickoff_date,
      status: f.status,
      matchweek: f.matchweek,
      league_name: 'Premier League',
      predicted_home_goals: lambdaHome,
      predicted_away_goals: lambdaAway,
      predicted_at: f.predicted_at,
      fit_run_id: f.prediction_fit_run_id,
      model: null,
      actual_home_goals: result?.full_time_home_goals ?? null,
      actual_away_goals: result?.full_time_away_goals ?? null,
      reported_home_goals: f.reported_home_goals ?? null,
      reported_away_goals: f.reported_away_goals ?? null,
      market: marketById.get(f.fixture_id) ?? null,
      marketRecord,
      __rho: rho ?? null,
    };

    try {
      const page = renderMatchPage(f.slug, data);
      const dir = join(DIST, 'football', 'matches', f.slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
      written++;
    } catch (err) {
      console.error(`Static: failed to render ${f.slug}: ${err?.message ?? err}`);
      skipped++;
    }
  }

  console.log(`Static: wrote ${written} match page(s), skipped ${skipped}, from ${fixtures.length} fixture(s).`);

  // ---- Player pages -------------------------------------------------
  const players = await pending.players;
  const projections = await pending.projections;
  const actuals = await pending.actuals;

  if (!players) {
    console.warn('Static: player data unavailable -- match pages still written.');
    return;
  }

  const projByKey = new Map((projections ?? []).map((p) => [`${p.fixture_id}|${p.fpl_player_id}`, p]));
  const actualByKey = new Map((actuals ?? []).map((a) => [`${a.fpl_fixture_id}|${a.fpl_player_id}`, a.total_points]));

  // Fixtures grouped by team, so each player's season is a lookup rather
  // than a scan of all 380 fixtures per player.
  const fixturesByTeam = new Map();
  for (const f of fixtures) {
    for (const id of [f.home_team_id, f.away_team_id]) {
      if (!fixturesByTeam.has(id)) fixturesByTeam.set(id, []);
      fixturesByTeam.get(id).push(f);
    }
  }
  for (const list of fixturesByTeam.values()) list.sort((a, b) => (a.matchweek ?? 0) - (b.matchweek ?? 0));

  let pWritten = 0;
  let pSkipped = 0;

  for (const pl of players) {
    const team = teamById.get(pl.canonical_team_id);
    const teamFixtures = fixturesByTeam.get(pl.canonical_team_id) ?? [];
    if (!team || teamFixtures.length === 0) {
      pSkipped++;
      continue;
    }

    const season = teamFixtures
      .filter((f) => f.matchweek != null)
      .map((f) => {
        const isHome = f.home_team_id === pl.canonical_team_id;
        const opp = teamById.get(isHome ? f.away_team_id : f.home_team_id);
        const proj = projByKey.get(`${f.fixture_id}|${pl.fpl_player_id}`);
        const actual = actualByKey.get(`${f.fixture_id}|${pl.fpl_player_id}`);
        return {
          matchweek: f.matchweek,
          kickoff_date: f.kickoff_date,
          opponent_name: opp?.display_name ?? 'Unknown',
          is_home: isHome,
          status: f.status,
          projected_points: proj?.expected_fpl_points != null ? Number(proj.expected_fpl_points) : null,
          expected_minutes: proj?.expected_minutes != null ? Number(proj.expected_minutes) : null,
          actual_points: actual ?? null,
          generated_at: proj?.generated_at ?? null,
          model_version: proj?.model_version ?? null,
          ...projectionDetail(proj),
        };
      });

    const fullName = [pl.first_name, pl.second_name].filter(Boolean).join(' ').trim() || pl.web_name;
    const data = {
      profile: {
        fpl_player_id: pl.fpl_player_id,
        slug: pl.slug,
        web_name: pl.web_name,
        full_name: fullName,
        canonical_team_id: pl.canonical_team_id,
        team_name: team.display_name,
        team_slug: team.slug,
        position_label: POSITION_LABELS[pl.element_type] ?? 'Unknown',
        price: pl.now_cost != null ? pl.now_cost / 10 : null,
      },
      season,
    };

    try {
      const page = renderPlayerPage(pl.slug, data);
      const dir = join(DIST, 'fpl', 'players', pl.slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
      pWritten++;
    } catch (err) {
      console.error(`Static: failed to render player ${pl.slug}: ${err?.message ?? err}`);
      pSkipped++;
    }
  }

  console.log(`Static: wrote ${pWritten} player page(s), skipped ${pSkipped}, from ${players.length} player(s).`);

  // ---- Team pages ---------------------------------------------------
  // Scoped to teams that actually appear in this season's EPL fixtures.
  // The teams table holds 242 rows across every division and European
  // competition; generating pages for clubs with no fixtures here would
  // produce empty shells and pad the sitemap with nothing.
  const ratings = await pending.ratings;
  const overrides = await pending.overrides;
  const acceptedFits = await pending.acceptedFits;

  // Current accepted fit per league -- first row wins, since the query
  // is ordered newest-first.
  const fitByLeague = new Map();
  for (const f of acceptedFits ?? []) if (!fitByLeague.has(f.league_id)) fitByLeague.set(f.league_id, f);
  const currentFit = fitByLeague.get(EPL_LEAGUE_ID);

  const ratingByTeam = new Map(
    (ratings ?? []).filter((r) => currentFit && r.fit_run_id === currentFit.fit_run_id).map((r) => [r.team_id, r])
  );
  const overrideByTeam = new Map((overrides ?? []).map((o) => [o.team_id, o]));

  let tWritten = 0;
  let tSkipped = 0;

  // Closing market odds for this season's results: the pre-match win chance
  // and Upset/Shock flags on team pages (src/lib/expectation.ts).
  const matchIds = (matches ?? []).map((m) => m.match_id).filter((x) => x != null);
  const oddsRows = matchIds.length
    ? (await query(`match_odds?select=match_id,price_home,price_draw,price_away&market=eq.1x2&bookmaker=eq.Avg&is_closing=eq.true&match_id=in.(${matchIds.join(',')})`)) ?? []
    : [];
  const oddsByMatch = new Map(oddsRows.map((o) => [o.match_id, o]));

  for (const [teamId, teamFixtures] of fixturesByTeam.entries()) {
    const team = teamById.get(teamId);
    if (!team || !team.slug) {
      tSkipped++;
      continue;
    }

    const rating = ratingByTeam.get(teamId);
    const ov = overrideByTeam.get(teamId);
    let gf = null;
    let ga = null;
    if (rating) {
      gf = Math.exp(Number(rating.attack_strength) + Number(ov?.attack_adjustment ?? 0));
      ga = Math.exp(-(Number(rating.defence_strength) + Number(ov?.defence_adjustment ?? 0)));
    }

    const teamMatches = teamFixtures.map((f) => {
      const isHome = f.home_team_id === teamId;
      const opp = teamById.get(isHome ? f.away_team_id : f.home_team_id);
      const res = resultByKey.get(resultKey(f.home_team_id, f.away_team_id, f.kickoff_date));
      return {
        slug: f.slug ?? null,
        kickoff_date: f.kickoff_date,
        opponent_name: opp?.display_name ?? 'Unknown',
        is_home: isHome,
        status: f.status,
        goals_for: res ? (isHome ? res.full_time_home_goals : res.full_time_away_goals) : null,
        goals_against: res ? (isHome ? res.full_time_away_goals : res.full_time_home_goals) : null,
        reported_goals_for: f.reported_home_goals == null ? null : isHome ? f.reported_home_goals : f.reported_away_goals,
        reported_goals_against: f.reported_home_goals == null ? null : isHome ? f.reported_away_goals : f.reported_home_goals,
        predicted_goals_for:
          f.predicted_home_goals == null ? null : Number(isHome ? f.predicted_home_goals : f.predicted_away_goals),
        predicted_goals_against:
          f.predicted_home_goals == null ? null : Number(isHome ? f.predicted_away_goals : f.predicted_home_goals),
        ...teamChances(res ? oddsByMatch.get(res.match_id) : undefined, isHome),
      };
    });

    const data = {
      profile: {
        team_id: teamId,
        slug: team.slug,
        display_name: team.display_name,
        league_name: 'Premier League',
        league_id: EPL_LEAGUE_ID,
        goals_for_per_game: gf,
        goals_against_per_game: ga,
        is_estimated: rating?.is_estimated === true,
        fitted_at: currentFit?.fitted_at ?? null,
      },
      matches: teamMatches,
      hasFinance: financeTeamIds.has(teamId),
    };

    try {
      const page = renderTeamPage(team.slug, data);
      const dir = join(DIST, 'football', 'teams', team.slug);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
      tWritten++;
    } catch (err) {
      console.error(`Static: failed to render team ${team.slug}: ${err?.message ?? err}`);
      tSkipped++;
    }
  }

  console.log(`Static: wrote ${tWritten} team page(s), skipped ${tSkipped}.`);

  await writeClubSeasonPages(leagueBulk, shell, buildDocument);
}

// ---- Club seasons (/football/teams/:slug/:season) ----------------------------
// Every English league club-season: story, position after each match,
// points against champion/relegated bands, every result. LAST on purpose:
// ~160 snapshot queries, so it runs after every other page is written, stops
// at a time budget well inside the watchdog, and a failure costs only these.
async function writeClubSeasonPages(bulk, shell, buildDocument) {
  const BUDGET_MS = WATCHDOG_MS - 30000;
  if (!bulk) {
    console.warn('Static: no league data -- club-season pages stay client-rendered.');
    return;
  }
  try {
    const { buildClubSeason, SNAPSHOT_COLUMNS, renderClubSeasonPage } = await import(ENTRY);
    const bench = await queryAll('league_pace_benchmarks?select=league_id,comparable_group,matches_played,outcome,p25,p50,p75&league_id=lte.5&outcome=in.(champion,relegated)&order=league_id.asc,comparable_group.asc,matches_played.asc,outcome.asc');
    const english = bulk.built.leagues.filter(({ index }) => index.league.league_id <= 5);
    const teamById = new Map(bulk.teams.map((t) => [t.team_id, { name: t.display_name, slug: t.slug }]));
    // Every club's seasons (for prev/next links), from the bulk table rows.
    const codeById = new Map(bulk.leagues.map((l) => [l.league_id, l.code]));
    const startById = new Map(bulk.summaries.map((s) => [`${s.league_id}:${s.season_id}`, s.start_year]));
    const clubSeasons = new Map();
    for (const r of bulk.tables) {
      const start = startById.get(`${r.league_id}:${r.season_id}`);
      const code = codeById.get(r.league_id);
      if (start == null || !code) continue;
      if (!clubSeasons.has(r.team_id)) clubSeasons.set(r.team_id, []);
      clubSeasons.get(r.team_id).push({ league_code: code, start_year: start, position: r.position });
    }
    for (const list of clubSeasons.values()) list.sort((a, b) => a.start_year - b.start_year);

    const jobs = english.flatMap(({ seasons }) => seasons);
    let n = 0;
    let failed = 0;
    let next = 0;
    let stopped = false;
    async function worker() {
      while (next < jobs.length) {
        if (Date.now() - STARTED_AT > BUDGET_MS) { stopped = true; return; }
        const season = jobs[next++];
        const { league } = season;
        const snaps = await queryAll(`team_match_snapshot?select=${SNAPSHOT_COLUMNS}&league_id=eq.${league.league_id}&season_id=eq.${season.season.season_id}&order=team_id.asc,matches_played.asc`);
        if (!snaps) { failed += season.rows.length; continue; }
        const byTeam = new Map();
        for (const s of snaps) {
          if (!byTeam.has(s.team_id)) byTeam.set(s.team_id, []);
          byTeam.get(s.team_id).push(s);
        }
        for (const row of season.rows) {
          if (!row.team_slug) continue;
          try {
            const data = buildClubSeason({
              team: { team_id: row.team_id, name: row.team_name, slug: row.team_slug },
              league,
              eraName: season.eraName,
              row: { ...row, league_id: league.league_id, season_id: season.season.season_id, start_year: season.season.start_year, ...season.summary },
              snaps: byTeam.get(row.team_id) ?? [],
              names: teamById,
              bench: bench ?? [],
              clubSeasons: clubSeasons.get(row.team_id) ?? [],
            });
            const page = renderClubSeasonPage(data);
            const dir = join(DIST, ...new URL(page.canonical).pathname.split('/').filter(Boolean));
            mkdirSync(dir, { recursive: true });
            writeFileSync(join(dir, 'index.html'), buildDocument(shell, page), 'utf8');
            n++;
          } catch (err) {
            failed++;
            if (failed <= 5) console.error(`Static: failed club season ${row.team_slug} ${season.season.start_year}: ${err?.message ?? err}`);
          }
        }
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    console.log(`Static: wrote ${n} club-season page(s), ${failed} failed${stopped ? ', stopped at the time budget' : ''} (${Math.round((Date.now() - STARTED_AT) / 1000)}s since start).`);
  } catch (err) {
    console.error(`Static: failed club-season pages: ${err?.message ?? err}`);
  }
}

main()
  .catch((err) => {
    console.error('Static: generation failed --', err?.message ?? err);
  })
  .finally(() => {
    clearTimeout(watchdog);
    process.exit(0);
  });
