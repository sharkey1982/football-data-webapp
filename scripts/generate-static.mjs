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
    const page = await query(`${path}${sep}limit=${pageSize}&offset=${offset}`);
    if (page == null) return out.length > 0 ? out : null;
    out.push(...page);
    if (page.length < pageSize) return out;
    // Guard against an unbounded loop if the server ever ignores offset.
    if (offset > 200000) {
      console.error('Static: pagination guard tripped -- stopping.');
      return out;
    }
  }
}

async function main() {
  if (!existsSync(SHELL) || !existsSync(ENTRY)) {
    console.warn('Static: missing dist/index.html or dist-ssr/entry-server.js -- skipping.');
    return;
  }

  const { renderMatchPage, renderPlayerPage, renderTeamPage, renderStaticRouteHead, STATIC_ROUTES, buildDocument, projectionDetail, PROJECTION_DETAIL_COLUMNS } = await import(ENTRY);
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
      `matches?select=home_team_id,away_team_id,match_date,full_time_home_goals,full_time_away_goals` +
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
      const tableData = { season: tableSeason, seasons, rows: standings.filter((r) => r.season === tableSeason) };
      let n = 0;
      const week = entry.buildNflWeek(latest, seasons, latestGames, null, teams);
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
      console.log(`Static: wrote ${n} NFL page(s).`);
    } catch (err) {
      console.error(`Static: failed NFL pages: ${err?.message ?? err}`);
    }
  }
  await writeNflPages();

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
