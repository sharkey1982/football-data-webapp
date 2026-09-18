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

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DIST = join(process.cwd(), 'dist');
const SHELL = join(DIST, 'index.html');
const ENTRY = join(process.cwd(), 'dist-ssr', 'entry-server.js');
const SEASON_ID = 13;
const EPL_LEAGUE_ID = 1;
const MODEL_VERSION = 'leaguewide_v6';
const POSITION_LABELS = { 1: 'Goalkeeper', 2: 'Defender', 3: 'Midfielder', 4: 'Forward' };
const REQUEST_TIMEOUT_MS = 20000;
const WATCHDOG_MS = 240000;

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
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('Static: no Supabase credentials in the build env -- skipping (SPA still works).');
    return;
  }
  if (!existsSync(SHELL) || !existsSync(ENTRY)) {
    console.warn('Static: missing dist/index.html or dist-ssr/entry-server.js -- skipping.');
    return;
  }

  const { renderMatchPage, renderPlayerPage, buildDocument } = await import(ENTRY);
  const shell = readFileSync(SHELL, 'utf8');

  // Bulk fetches -- three requests total, not one per page.
  const teams = await query('teams?select=team_id,display_name,slug&limit=1000');
  const fits = await query('model_fit_runs?select=fit_run_id,rho&limit=1000');
  const fixtures = await queryAll(
    `fixtures?select=fixture_id,slug,kickoff_date,status,matchweek,home_team_id,away_team_id,predicted_home_goals,predicted_away_goals,predicted_at,prediction_fit_run_id` +
      `&league_id=eq.${EPL_LEAGUE_ID}&season_id=eq.${SEASON_ID}&slug=not.is.null`
  );
  if (!teams || !fixtures) {
    console.warn('Static: required data unavailable -- skipping.');
    return;
  }

  const teamById = new Map(teams.map((t) => [t.team_id, t]));
  const rhoByFit = new Map((fits ?? []).map((f) => [f.fit_run_id, Number(f.rho)]));

  // Actual results, for played fixtures. Keyed the same way the runtime
  // page keys them so generated and client-rendered output agree.
  const matches = await queryAll(
    `matches?select=home_team_id,away_team_id,match_date,full_time_home_goals,full_time_away_goals` +
      `&league_id=eq.${EPL_LEAGUE_ID}&season_id=eq.${SEASON_ID}`
  );
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
  const players = await queryAll(
    `fpl_players?select=fpl_player_id,slug,web_name,first_name,second_name,element_type,now_cost,canonical_team_id&season_id=eq.${SEASON_ID}&slug=not.is.null`
  );
  const projections = await queryAll(
    `fpl_player_projections?select=fixture_id,fpl_player_id,expected_fpl_points,expected_minutes,generated_at,model_version&model_version=eq.${MODEL_VERSION}&scenario_key=eq.baseline`
  );
  const actuals = await queryAll(
    `fpl_player_gameweeks?select=fpl_fixture_id,fpl_player_id,total_points&season_id=eq.${SEASON_ID}`
  );

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
}

main()
  .catch((err) => {
    console.error('Static: generation failed --', err?.message ?? err);
  })
  .finally(() => {
    clearTimeout(watchdog);
    process.exit(0);
  });
