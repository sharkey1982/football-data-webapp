// ============================================================================
// src/lib/modelApi.ts
//
// Dixon-Coles model data: fit runs, team ratings, the team-strength
// summary and the fantasy fixture-difficulty grid built from them.
// Split out of api.ts.
// ============================================================================

import { supabase } from './supabase';
import type { LeagueFitStatus, ModelFitRun } from '../types/database';
import { getMostRecentFixtureSeason } from './referenceApi';

export async function getLeagueFitStatusFor(leagueId: number): Promise<LeagueFitStatus | null> {
  const { data, error } = await supabase.from('league_fit_status').select('*').eq('league_id', leagueId).maybeSingle();
  if (error) throw error;
  return data;
}

/** Full validation_checks jsonb for one fit run -- lazy-loaded on the Data Health page when a row is expanded, rather than bloating league_fit_status with it for every row on every load. */
export async function getFitRunValidationChecks(fitRunId: number): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from('model_fit_runs').select('validation_checks').eq('fit_run_id', fitRunId).maybeSingle();
  if (error) throw error;
  return (data?.validation_checks as Record<string, unknown> | undefined) ?? null;
}

// ----------------------------------------------------------------------------
// Dixon-Coles model data
//
// IMPORTANT: ratings are only meaningful relative to other teams in the SAME
// fit run -- a team's Championship attack rating and its Premier League
// attack rating are on different scales (different leagues score goals at
// different rates) even though they're stored in the same table. Every
// function here takes or returns a fit_run_id explicitly, and team lists are
// always scoped to one league's latest fit, so it's structurally impossible
// to accidentally mix ratings from two different leagues into one prediction.
// ----------------------------------------------------------------------------

export type TeamWithRating = {
  team_id: number;
  canonical_name: string;
  attack_strength: number;
  defence_strength: number;
  is_estimated: boolean;
  estimation_note: string | null;
};

/** One row per league from the league_fit_status view: latest attempted fit alongside the current accepted production fit -- the data-health summary. */
export async function getLeagueFitStatus(): Promise<LeagueFitStatus[]> {
  const { data, error } = await supabase.from('league_fit_status').select('*').order('league_code');
  if (error) throw error;
  return (data ?? []) as LeagueFitStatus[];
}

/** Fetches every available fit run for a league (any status), most recent first -- for a fit-history/data-health view, not production selection. */
export async function getFitRunsForLeague(leagueId: number) {
  const { data, error } = await supabase
    .from('model_fit_runs')
    .select('*')
    .eq('league_id', leagueId)
    .order('fitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

/** Fetches the single most recent fit run for a league, or null if none exists yet. */
export async function getLatestFitRun(leagueId: number) {
  // NEVER select by fitted_at/fit_run_id or converged alone -- a fit can
  // converge and still be statistically pathological (see fit_run_id=7's
  // Coventry complete-separation failure). status = 'accepted' is the
  // only thing that means "passed every quality gate and is the current
  // production fit for this league" -- see scripts/fit_dixon_coles.py's
  // validate_fit() for what that entails.
  const { data, error } = await supabase
    .from('model_fit_runs')
    .select('*')
    .eq('league_id', leagueId)
    .eq('status', 'accepted')
    .order('fitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Fetches every team rated in a given fit run, joined with team names.
 * This is the ONLY supported way to get "the list of teams for this
 * league's predictions" -- it's impossible to get a team here that isn't
 * actually rated in this specific fit, which is what prevents the
 * cross-league rating mixup (e.g. a team's Championship rating leaking
 * into a Premier League prediction).
 */
export async function getTeamRatingsForFitRun(fitRunId: number): Promise<TeamWithRating[]> {
  const { data, error } = await supabase
    .from('team_ratings')
    .select('team_id, attack_strength, defence_strength, is_estimated, estimation_note, team:teams!team_ratings_team_id_fkey(canonical_name:display_name)')
    .eq('fit_run_id', fitRunId);
  if (error) throw error;

  return (data ?? [])
    .map((row: any) => ({
      team_id: row.team_id,
      canonical_name: row.team?.canonical_name ?? 'Unknown',
      attack_strength: row.attack_strength,
      defence_strength: row.defence_strength,
      is_estimated: row.is_estimated ?? false,
      estimation_note: row.estimation_note ?? null,
    }))
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
}

// ----------------------------------------------------------------------------
// Team strength summary -- Dixon-Coles attack/defence/home-advantage next to
// season-total projected vs last-season actual goals for/against, for the
// Team Strength page.
// ----------------------------------------------------------------------------

export interface TeamStrengthRow {
  team_id: number;
  canonical_name: string;
  /** Log-scale Dixon-Coles parameter, relative to league average (0). Higher = more attacking. */
  attack_strength: number;
  /** Log-scale Dixon-Coles parameter, relative to league average (0). Higher = tighter defence (concedes fewer). */
  defence_strength: number;
  is_estimated: boolean;
  /** Sum of predicted_home_goals/predicted_away_goals across every fixture in the current season (played and upcoming). Null if no fixtures have a prediction yet. */
  projected_gf: number | null;
  projected_ga: number | null;
  projected_fixtures_counted: number;
  /** Actual full-time goals from last season's real results. Null if the team didn't play in that league/season (e.g. newly promoted). */
  last_season_gf: number | null;
  last_season_ga: number | null;
  last_season_played: number;
  /** Actual full-time goals from THIS season's results so far -- for
   * sense-checking the model's projected per-game rate against what's
   * actually happening this season, not just last season. Null if the
   * team hasn't played yet. */
  this_season_actual_gf: number | null;
  this_season_actual_ga: number | null;
  this_season_actual_played: number;
  /** Manual adjustment on top of the derived attack/defence_strength,
   * requested directly for known real-world context the model can't
   * see yet (a signing, an injury, actual in-season form). Additive,
   * same log-scale units as attack_strength/defence_strength. Zero
   * (not null) when no override is set. */
  attack_adjustment: number;
  defence_adjustment: number;
  override_note: string | null;
  /** When the override was last saved, ISO string. Null if no override
   * is set. Compared against the position projection's simulated_at
   * (below) to flag a stale simulation -- requested directly, since an
   * override immediately updates predicted_home_goals/away_goals but
   * does NOT automatically re-run the finishing-position simulation. */
  override_updated_at: string | null;
  /** Monte Carlo projected final league position (mean and median
   * across 20,000 simulated remaining seasons), requested directly.
   * Null for a cup competition or if the simulation hasn't run yet. */
  projected_position_mean: number | null;
  projected_position_median: number | null;
  projected_points_mean: number | null;
  /** When the position projection was last simulated, ISO string. Null
   * if it's never run for this league/season. */
  position_simulated_at: string | null;
}

export interface TeamStrengthSummary {
  fitRun: ModelFitRun | null;
  currentSeasonLabel: string | null;
  lastSeasonLabel: string | null;
  rows: TeamStrengthRow[];
  /** Teams that played in this league last season but aren't rated in it this season -- relegated (or otherwise dropped out). */
  relegatedTeams: { team_id: number; canonical_name: string }[];
}

export async function getTeamStrengthSummary(leagueId: number): Promise<TeamStrengthSummary> {
  const fitRun = await getLatestFitRun(leagueId);
  const allRatings = fitRun ? await getTeamRatingsForFitRun(fitRun.fit_run_id) : [];

  const currentSeason = await getMostRecentFixtureSeason(leagueId);
  const currentSeasonId = currentSeason?.season_id ?? null;

  // The fit's window is wide enough (currently ~2 seasons) that it rates
  // some teams who aren't actually in this league THIS season at all --
  // confirmed live: 25 rated teams for a 20-team league, because a team
  // relegated up to ~2 seasons ago still has matches inside the fitting
  // window. Anyone not in this season's own fixture list doesn't belong in
  // the main table no matter how they're still weighted internally -- the
  // in-season team list (not the rated-team list) is the source of truth
  // for "who's actually in this league now".
  const currentSeasonTeamIds = new Set<number>();
  if (currentSeasonId !== null) {
    const { data, error } = await supabase
      .from('fixtures')
      .select('home_team_id, away_team_id')
      .eq('league_id', leagueId)
      .eq('season_id', currentSeasonId);
    if (error) throw error;
    for (const f of (data ?? []) as any[]) {
      currentSeasonTeamIds.add(f.home_team_id);
      currentSeasonTeamIds.add(f.away_team_id);
    }
  }
  const ratings = currentSeasonTeamIds.size > 0 ? allRatings.filter((r) => currentSeasonTeamIds.has(r.team_id)) : allRatings;
  // Anyone rated but NOT in this season's team list -- regardless of
  // exactly which past season they last played in -- is out of the league
  // now (relegated, or otherwise dropped out) and gets flagged separately
  // rather than silently sitting in the main ranking table.
  const relegatedTeams = (currentSeasonTeamIds.size > 0 ? allRatings.filter((r) => !currentSeasonTeamIds.has(r.team_id)) : [])
    .map((r) => ({ team_id: r.team_id, canonical_name: r.canonical_name }))
    .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));

  // Projected GF/GA: sum of Dixon-Coles predicted goals across every fixture
  // in the CURRENT season, played and upcoming alike -- fixtures.predicted_*
  // is backfilled for historic fixtures too (backfill_historic_fixture_predictions()),
  // so this is "what the model expected across the whole season", the same
  // unit and scope as a full season's actual GF/GA, making the two directly
  // comparable.
  const projectedByTeam = new Map<number, { gf: number; ga: number; count: number }>();
  if (currentSeasonId !== null) {
    const { data, error } = await supabase
      .from('fixtures')
      .select('home_team_id, away_team_id, predicted_home_goals, predicted_away_goals')
      .eq('league_id', leagueId)
      .eq('season_id', currentSeasonId)
      .not('predicted_home_goals', 'is', null)
      .not('predicted_away_goals', 'is', null);
    if (error) throw error;
    for (const f of (data ?? []) as any[]) {
      const hg = f.predicted_home_goals as number;
      const ag = f.predicted_away_goals as number;
      const h = projectedByTeam.get(f.home_team_id) ?? { gf: 0, ga: 0, count: 0 };
      h.gf += hg;
      h.ga += ag;
      h.count += 1;
      projectedByTeam.set(f.home_team_id, h);
      const a = projectedByTeam.get(f.away_team_id) ?? { gf: 0, ga: 0, count: 0 };
      a.gf += ag;
      a.ga += hg;
      a.count += 1;
      projectedByTeam.set(f.away_team_id, a);
    }
  }

  // Last season's actual GF/GA, from real results -- whichever season_id is
  // immediately before the current one for this league.
  let lastSeasonLabel: string | null = null;
  const actualByTeam = new Map<number, { gf: number; ga: number; played: number }>();
  if (currentSeasonId !== null) {
    const { data: seasonRows, error: seasonError } = await supabase
      .from('seasons')
      .select('season_id, label')
      .lt('season_id', currentSeasonId)
      .order('season_id', { ascending: false })
      .limit(1);
    if (seasonError) throw seasonError;
    const lastSeason = seasonRows?.[0] as { season_id: number; label: string } | undefined;
    if (lastSeason) {
      lastSeasonLabel = lastSeason.label;
      const { data, error } = await supabase
        .from('matches')
        .select('home_team_id, away_team_id, full_time_home_goals, full_time_away_goals')
        .eq('league_id', leagueId)
        .eq('season_id', lastSeason.season_id)
        .not('full_time_home_goals', 'is', null)
        .not('full_time_away_goals', 'is', null);
      if (error) throw error;
      for (const m of (data ?? []) as any[]) {
        const hg = m.full_time_home_goals as number;
        const ag = m.full_time_away_goals as number;
        const h = actualByTeam.get(m.home_team_id) ?? { gf: 0, ga: 0, played: 0 };
        h.gf += hg;
        h.ga += ag;
        h.played += 1;
        actualByTeam.set(m.home_team_id, h);
        const a = actualByTeam.get(m.away_team_id) ?? { gf: 0, ga: 0, played: 0 };
        a.gf += ag;
        a.ga += hg;
        a.played += 1;
        actualByTeam.set(m.away_team_id, a);
      }
    }
  }

  // This season's actual GF/GA so far -- lets the page compare the
  // model's projected per-game rate against what's actually happening
  // THIS season, not just last season's different context. Requested
  // directly. Same matches-table pattern as the last-season query above.
  const thisSeasonActualByTeam = new Map<number, { gf: number; ga: number; played: number }>();
  if (currentSeasonId !== null) {
    const { data, error } = await supabase
      .from('matches')
      .select('home_team_id, away_team_id, full_time_home_goals, full_time_away_goals')
      .eq('league_id', leagueId)
      .eq('season_id', currentSeasonId)
      .not('full_time_home_goals', 'is', null)
      .not('full_time_away_goals', 'is', null);
    if (error) throw error;
    for (const m of (data ?? []) as any[]) {
      const hg = m.full_time_home_goals as number;
      const ag = m.full_time_away_goals as number;
      const h = thisSeasonActualByTeam.get(m.home_team_id) ?? { gf: 0, ga: 0, played: 0 };
      h.gf += hg;
      h.ga += ag;
      h.played += 1;
      thisSeasonActualByTeam.set(m.home_team_id, h);
      const a = thisSeasonActualByTeam.get(m.away_team_id) ?? { gf: 0, ga: 0, played: 0 };
      a.gf += ag;
      a.ga += hg;
      a.played += 1;
      thisSeasonActualByTeam.set(m.away_team_id, a);
    }
  }

  // Manual overrides, requested directly -- lets Chris nudge a team's
  // attack/defence rating for known real-world context the model can't
  // see yet. Applied inside backfill_fixture_predictions() itself, not
  // just displayed here.
  const { data: overrideRows, error: overrideError } = await (supabase as any)
    .from('team_strength_manual_override')
    .select('team_id, attack_adjustment, defence_adjustment, note, updated_at');
  if (overrideError) throw overrideError;
  const overrideByTeam = new Map<number, { attack_adjustment: number; defence_adjustment: number; note: string | null; updated_at: string }>(
    ((overrideRows ?? []) as any[]).map((o) => [o.team_id, { attack_adjustment: Number(o.attack_adjustment), defence_adjustment: Number(o.defence_adjustment), note: o.note, updated_at: o.updated_at }])
  );

  // Projected final position, requested directly -- from the Monte
  // Carlo simulation script (scripts/simulate_final_table.py), keyed by
  // league+season since it's already scoped per-league.
  const positionByTeam = new Map<number, { mean: number; median: number; points: number; simulated_at: string }>();
  if (currentSeasonId !== null) {
    const { data: positionRows, error: positionError } = await (supabase as any)
      .from('team_finishing_position_projection')
      .select('team_id, projected_position_mean, projected_position_median, projected_points_mean, simulated_at')
      .eq('league_id', leagueId)
      .eq('season_id', currentSeasonId);
    if (positionError) throw positionError;
    for (const p of (positionRows ?? []) as any[]) {
      positionByTeam.set(p.team_id, { mean: Number(p.projected_position_mean), median: Number(p.projected_position_median), points: Number(p.projected_points_mean), simulated_at: p.simulated_at });
    }
  }

  const rows: TeamStrengthRow[] = ratings.map((r) => {
    const proj = projectedByTeam.get(r.team_id);
    const actual = actualByTeam.get(r.team_id);
    const thisSeasonActual = thisSeasonActualByTeam.get(r.team_id);
    const override = overrideByTeam.get(r.team_id);
    return {
      team_id: r.team_id,
      canonical_name: r.canonical_name,
      attack_strength: r.attack_strength,
      defence_strength: r.defence_strength,
      is_estimated: r.is_estimated,
      projected_gf: proj ? proj.gf : null,
      projected_ga: proj ? proj.ga : null,
      projected_fixtures_counted: proj?.count ?? 0,
      last_season_gf: actual ? actual.gf : null,
      last_season_ga: actual ? actual.ga : null,
      this_season_actual_gf: thisSeasonActual ? thisSeasonActual.gf : null,
      this_season_actual_ga: thisSeasonActual ? thisSeasonActual.ga : null,
      this_season_actual_played: thisSeasonActual?.played ?? 0,
      attack_adjustment: override?.attack_adjustment ?? 0,
      defence_adjustment: override?.defence_adjustment ?? 0,
      override_note: override?.note ?? null,
      override_updated_at: override?.updated_at ?? null,
      projected_position_mean: positionByTeam.get(r.team_id)?.mean ?? null,
      projected_position_median: positionByTeam.get(r.team_id)?.median ?? null,
      projected_points_mean: positionByTeam.get(r.team_id)?.points ?? null,
      position_simulated_at: positionByTeam.get(r.team_id)?.simulated_at ?? null,
      last_season_played: actual?.played ?? 0,
    };
  });

  return {
    fitRun,
    currentSeasonLabel: currentSeason?.label ?? null,
    lastSeasonLabel,
    rows,
    relegatedTeams,
  };
}

/** Saves (or clears, if both adjustments are 0 and note is empty) a
 * manual attack/defence override for a team, then immediately re-runs
 * backfill_fixture_predictions() so every future fixture involving that
 * team picks up the new predicted goals right away -- not just a
 * display-only change. Requested directly, and built to actually
 * propagate this time (unlike the earlier manual_status gap this
 * session found and fixed): the override is read inside that SQL
 * function itself. */
export async function saveTeamStrengthOverride(teamId: number, attackAdjustment: number, defenceAdjustment: number, note: string | null): Promise<void> {
  if (attackAdjustment === 0 && defenceAdjustment === 0 && !note) {
    const { error: deleteErr } = await (supabase as any).from('team_strength_manual_override').delete().eq('team_id', teamId);
    if (deleteErr) throw deleteErr;
  } else {
    const { error: upsertErr } = await (supabase as any)
      .from('team_strength_manual_override')
      .upsert({ team_id: teamId, attack_adjustment: attackAdjustment, defence_adjustment: defenceAdjustment, note, updated_at: new Date().toISOString() }, { onConflict: 'team_id' });
    if (upsertErr) throw upsertErr;
  }
  const { error: rpcErr } = await (supabase as any).rpc('backfill_fixture_predictions');
  if (rpcErr) throw rpcErr;
}



export interface FantasyFixtureCell {
  fixture_id: number;
  kickoff_date: string;
  matchweek: number | null;
  opponent_team_id: number;
  opponent_name: string;
  is_home: boolean;
  expected_goals_for: number;
  expected_goals_against: number;
  /** P(this team keeps a clean sheet), 0-1 -- P(opponent scores 0), read off the Dixon-Coles score grid. */
  clean_sheet_probability: number;
  opponent_attack_strength: number;
  opponent_defence_strength: number;
}

export interface FantasyTeamFixtures {
  team_id: number;
  team_name: string;
  /** Chronological (matchweek, then kickoff_date) order -- earliest fixture first. */
  fixtures: FantasyFixtureCell[];
}

export interface FantasyFixtureData {
  fitRun: ModelFitRun | null;
  ratings: TeamWithRating[];
  teams: FantasyTeamFixtures[];
}

/**
 * Builds the per-team list of upcoming fixtures with Dixon-Coles expected
 * goals for/against, for the Fantasy fixture-difficulty heat map. "Upcoming"
 * means any fixture not yet played (scheduled or postponed) -- postponed
 * fixtures are kept even without a firm date since they'll still count
 * against a team's near-term run once rescheduled.
 *
 * A fixture where either side has no rating in the latest fit run (freshly
 * promoted, not enough matches yet) is skipped entirely rather than shown
 * with a fabricated number -- there's no real attack/defence strength to
 * base an expected-goals figure on.
 */
export async function getFantasyFixtureDifficulty(
  leagueId: number,
  seasonId: number
): Promise<FantasyFixtureData> {
  const fitRun = await getLatestFitRun(leagueId);
  if (!fitRun) return { fitRun: null, ratings: [], teams: [] };

  const ratings = await getTeamRatingsForFitRun(fitRun.fit_run_id);
  const ratingByTeam = new Map(ratings.map((r) => [r.team_id, r]));

  const { data, error } = await supabase
    .from('fixtures')
    .select(
      `
      fixture_id, kickoff_date, matchweek, status,
      home_team_id, away_team_id, predicted_home_goals, predicted_away_goals,
      home_team:teams!fixtures_home_team_id_fkey(canonical_name:display_name),
      away_team:teams!fixtures_away_team_id_fkey(canonical_name:display_name)
    `
    )
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .neq('status', 'played')
    .order('matchweek', { ascending: true, nullsFirst: false })
    .order('kickoff_date', { ascending: true });
  if (error) throw error;

  const byTeam = new Map<number, FantasyTeamFixtures>();
  const ensureTeam = (teamId: number, name: string) => {
    let entry = byTeam.get(teamId);
    if (!entry) {
      entry = { team_id: teamId, team_name: name, fixtures: [] };
      byTeam.set(teamId, entry);
    }
    return entry;
  };

  for (const row of (data ?? []) as any[]) {
    const homeRating = ratingByTeam.get(row.home_team_id);
    const awayRating = ratingByTeam.get(row.away_team_id);
    // Requested directly: this used to recompute xG client-side via the
    // plain calculateDixonColes() formula (exp(homeAdvantage + attack -
    // defence), no shrinkage, no home/away split adjustment) -- genuinely
    // inconsistent with backfill_fixture_predictions(), the SQL function
    // that actually sets predicted_home_goals/predicted_away_goals for
    // every other part of this app (FPL projections included), which uses
    // a materially more sophisticated model (sparse-data shrinkage toward
    // the mean for teams with under 12 fit-window appearances, plus a
    // separate home/away split adjustment) -- confirmed by reading both
    // formulas directly, not assumed. Now reads the same stored, central
    // values everyone else uses instead of approximating them again here.
    // Clean sheet probability matches the exact formula
    // fpl_projection_leaguewide_points uses elsewhere (plain Poisson
    // P(0) = exp(-opponent's expected goals), no Dixon-Coles tau
    // correction) for the same reason -- one consistent number app-wide.
    if (row.predicted_home_goals === null || row.predicted_away_goals === null || !homeRating || !awayRating) continue;
    const homeGoals = +row.predicted_home_goals;
    const awayGoals = +row.predicted_away_goals;
    const homeCleanSheetProb = Math.exp(-awayGoals);
    const awayCleanSheetProb = Math.exp(-homeGoals);

    const homeName = row.home_team?.canonical_name ?? 'Unknown';
    const awayName = row.away_team?.canonical_name ?? 'Unknown';

    ensureTeam(row.home_team_id, homeName).fixtures.push({
      fixture_id: row.fixture_id,
      kickoff_date: row.kickoff_date,
      matchweek: row.matchweek,
      opponent_team_id: row.away_team_id,
      opponent_name: awayName,
      is_home: true,
      expected_goals_for: homeGoals,
      expected_goals_against: awayGoals,
      clean_sheet_probability: homeCleanSheetProb,
      opponent_attack_strength: awayRating.attack_strength,
      opponent_defence_strength: awayRating.defence_strength,
    });

    ensureTeam(row.away_team_id, awayName).fixtures.push({
      fixture_id: row.fixture_id,
      kickoff_date: row.kickoff_date,
      matchweek: row.matchweek,
      opponent_team_id: row.home_team_id,
      opponent_name: homeName,
      is_home: false,
      expected_goals_for: awayGoals,
      expected_goals_against: homeGoals,
      clean_sheet_probability: awayCleanSheetProb,
      opponent_attack_strength: homeRating.attack_strength,
      opponent_defence_strength: homeRating.defence_strength,
    });
  }

  const teams = [...byTeam.values()].sort((a, b) => a.team_name.localeCompare(b.team_name));
  return { fitRun, ratings, teams };
}

/**
 * Buckets every rated team's attack/defence strength into FDR-style
 * quintiles (1 = weakest, 5 = strongest), for the "simple rating" colour
 * toggle -- an alternative to the raw Dixon-Coles expected-goals scale that
 * mirrors the familiar 1-5 fixture-difficulty convention fantasy players
 * already know, independent of the model's actual goal-scale numbers.
 */
export function computeFdrQuintiles(
  ratings: TeamWithRating[]
): Map<number, { attack_fdr: number; defence_fdr: number }> {
  function quintileRanks(values: { team_id: number; value: number }[]): Map<number, number> {
    const sorted = [...values].sort((a, b) => a.value - b.value);
    const n = sorted.length;
    const ranks = new Map<number, number>();
    sorted.forEach((v, i) => {
      const bucket = Math.min(5, Math.floor((i / n) * 5) + 1);
      ranks.set(v.team_id, bucket);
    });
    return ranks;
  }

  const attackRanks = quintileRanks(ratings.map((r) => ({ team_id: r.team_id, value: r.attack_strength })));
  const defenceRanks = quintileRanks(ratings.map((r) => ({ team_id: r.team_id, value: r.defence_strength })));

  const result = new Map<number, { attack_fdr: number; defence_fdr: number }>();
  for (const r of ratings) {
    result.set(r.team_id, {
      attack_fdr: attackRanks.get(r.team_id) ?? 3,
      defence_fdr: defenceRanks.get(r.team_id) ?? 3,
    });
  }
  return result;
}

