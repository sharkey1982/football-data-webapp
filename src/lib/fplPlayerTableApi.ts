// ============================================================================
// src/lib/fplPlayerTableApi.ts
//
// Data layer for the standalone Player Projections table page (Fantasy menu):
// one row per player, viewable either as points-per-gameweek across a range,
// or as a points-by-contribution breakdown summed across that range.
//
// DELIBERATE DEPARTURE from fplSeasonApi.ts's convention of reading only the
// frontend-facing season feed views: fpl_season_player_projection_feed (which
// those views ultimately chain into) times out for any matchweek query --
// traced to window functions inside two of its dependencies that Postgres
// can't push a matchweek filter through, so it materializes the full season
// before filtering (confirmed live, GW4: statement timeout; see handoff notes
// from 2026-09-15). fpl_player_projections is a genuine TABLE with real
// indexes, not a view chain -- querying it directly for a GW range measured
// at ~9ms once fixtures are filtered first via a CTE, vs timing out through
// the view. Same underlying data, same model_version, just without the
// window-function bottleneck in the way.
//
// ACTUAL-POINTS BREAKDOWN: computed here from fpl_player_gameweeks' raw
// stats using the official 2025/26 FPL scoring rules (verified against
// premierleague.com's own published changes before implementing -- goal
// values by position, the new defensive-contribution thresholds, etc.).
// Validated against two real GW4 rows before shipping: Groß (MID, 17 total
// points) and Raya (GK, 14 total points) both reconstruct exactly component
// by component. Kept separate from the projected breakdown (never blended)
// so a discrepancy between the two stays visible rather than silently
// averaged away.
// ============================================================================

import { supabase } from './supabase';
import { num, FPL_POSITION_LABEL, CURRENT_MODEL_VERSION } from './fplApi';
import type { FplElementType } from '../types/database';

export const PLAYER_TABLE_MODEL_VERSION = CURRENT_MODEL_VERSION;

/** Points per goal, by FPL element_type (1=GK, 2=DEF, 3=MID, 4=FWD). */
const GOAL_POINTS: Record<number, number> = { 1: 10, 2: 6, 3: 5, 4: 4 };
/** Points for a qualifying clean sheet (60+ minutes played), by position. */
const CLEAN_SHEET_POINTS: Record<number, number> = { 1: 4, 2: 4, 3: 1, 4: 0 };
/** Combined defensive-actions threshold for the 2025/26 defensive-contribution rule. GK not eligible. DEF counts CBIT (clearances+blocks+interceptions+tackles); MID/FWD count CBIRT (those four plus recoveries). */
const DEF_CONTRIBUTION_THRESHOLD: Record<number, number> = { 2: 10, 3: 12, 4: 12 };

export type ContributionBreakdown = {
  appearance: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  defensiveContribution: number;
  saves: number;
  bonus: number;
  goalsConceded: number;
  penalties: number;
  cardsOwnGoals: number;
};

/**
 * Reconstructs a real gameweek's points, component by component, from raw
 * FPL stats -- official 2025/26 scoring rules. Returns null if there's no
 * minutes data at all (the row exists but the player didn't feature, or the
 * gameweek hasn't been played -- callers should already be gating on that).
 */
function computeActualContribution(
  elementType: number | null,
  stats: {
    minutes: number | null;
    goals_scored: number | null;
    assists: number | null;
    clean_sheets: number | null;
    goals_conceded: number | null;
    own_goals: number | null;
    penalties_saved: number | null;
    penalties_missed: number | null;
    yellow_cards: number | null;
    red_cards: number | null;
    saves: number | null;
    bonus: number | null;
    defensive_actions: number | null;
  }
): ContributionBreakdown {
  const pos = elementType ?? 0;
  const minutes = stats.minutes ?? 0;
  const appearance = minutes >= 60 ? 2 : minutes > 0 ? 1 : 0;
  const goals = (stats.goals_scored ?? 0) * (GOAL_POINTS[pos] ?? 0);
  const assists = (stats.assists ?? 0) * 3;
  const cleanSheet = (stats.clean_sheets ?? 0) > 0 && minutes >= 60 ? CLEAN_SHEET_POINTS[pos] ?? 0 : 0;
  const goalsConceded = (pos === 1 || pos === 2) ? -Math.floor((stats.goals_conceded ?? 0) / 2) : 0;
  const saves = pos === 1 ? Math.floor((stats.saves ?? 0) / 3) : 0;
  const penaltySave = (stats.penalties_saved ?? 0) * 5;
  const penaltyMiss = (stats.penalties_missed ?? 0) * -2;
  const cards = (stats.yellow_cards ?? 0) * -1 + (stats.red_cards ?? 0) * -3;
  const ownGoals = (stats.own_goals ?? 0) * -2;
  const threshold = DEF_CONTRIBUTION_THRESHOLD[pos];
  const defensiveContribution = threshold !== undefined && (stats.defensive_actions ?? 0) >= threshold ? 2 : 0;

  return {
    appearance,
    goals,
    assists,
    cleanSheet,
    defensiveContribution,
    saves,
    bonus: stats.bonus ?? 0,
    goalsConceded,
    penalties: penaltySave + penaltyMiss,
    cardsOwnGoals: cards + ownGoals,
  };
}

/** One player's projected or actual points for one gameweek. Never both null -- a row only exists where at least one side has data. */
export type PlayerGameweekPoints = {
  fpl_player_id: number;
  web_name: string;
  team_id: number;
  team_name: string;
  fpl_position: FplElementType | null;
  fpl_position_label: string;
  /** Current FPL price in £m (e.g. 6.2) -- same for every row of a given player, fetched once from fpl_players. */
  price: number | null;
  matchweek: number;
  /** Real FPL points scored -- null until the fixture's played and backfilled. */
  actual_points: number | null;
  /** Model's expected_fpl_points for this fixture -- null where the model hasn't covered it (see PLAYER_TABLE_MODEL_VERSION). */
  projected_points: number | null;
  /** Per-component breakdown of projected_points -- null wherever projected_points is null. */
  xpts_appearance: number | null;
  xpts_goals: number | null;
  xpts_assists: number | null;
  xpts_clean_sheet: number | null;
  xpts_saves: number | null;
  xpts_defensive_contribution: number | null;
  xpts_cards_own_goals: number | null;
  xpts_bonus: number | null;
  xpts_goals_conceded: number | null;
  xpts_penalties: number | null;
  /** Per-component breakdown of actual_points, reconstructed from real stats -- null wherever actual_points is null. Kept entirely separate from the projected breakdown above; never blended. */
  actual_contribution: ContributionBreakdown | null;
};

/**
 * Every player's actual and/or projected points for each gameweek in
 * [fromMatchweek, toMatchweek], league-wide (E0 only, matching every other
 * FPL screen in this app). One row per player per gameweek that has actual
 * data, projected data, or both.
 */
export async function getPlayerGameweekPointsRange(fromMatchweek: number, toMatchweek: number): Promise<PlayerGameweekPoints[]> {
  const { data: fixtureRows, error: fixtureError } = await supabase
    .from('fixtures')
    .select('fixture_id, matchweek')
    .eq('league_id', 1)
    .eq('season_id', 13)
    .gte('matchweek', fromMatchweek)
    .lte('matchweek', toMatchweek);
  if (fixtureError) throw fixtureError;
  const fixtureIds = (fixtureRows ?? []).map((f) => f.fixture_id);
  const matchweekByFixture = new Map<number, number>();
  for (const f of fixtureRows ?? []) if (f.matchweek !== null) matchweekByFixture.set(f.fixture_id, f.matchweek);
  if (fixtureIds.length === 0) return [];

  // PostgREST caps rows per request (confirmed live: a 6-week range hit the
  // exact same silent-truncation bug already found and fixed once this
  // session for the optimizer feed -- 3304 matching rows, only the first
  // 1000 returned, and because insertion order roughly follows matchweek
  // order, the truncation landed exactly where it was reported: GW5
  // complete, GW6 partial, everything after empty). Both queries below page
  // through with .range() until a page comes back short, rather than
  // trusting a single .in() call to return everything.
  async function fetchAllRows<T>(build: (from: number, to: number) => any): Promise<T[]> {
    const pageSize = 1000;
    const out: T[] = [];
    let from = 0;
    for (;;) {
      const { data, error } = await build(from, from + pageSize - 1);
      if (error) throw error;
      const page = (data ?? []) as T[];
      out.push(...page);
      if (page.length < pageSize) break;
      from += pageSize;
    }
    return out;
  }

  const projRows = await fetchAllRows<{
    fpl_player_id: number;
    fixture_id: number;
    expected_fpl_points: number | null;
    xpts_appearance: number | null;
    xpts_goals: number | null;
    xpts_assists: number | null;
    xpts_clean_sheet: number | null;
    xpts_saves: number | null;
    xpts_defensive_contribution: number | null;
    xpts_cards_own_goals: number | null;
    xpts_bonus: number | null;
    xpts_goals_conceded: number | null;
    xpts_penalties: number | null;
  }>((from, to) =>
    supabase
      .from('fpl_player_projections')
      .select(
        'fpl_player_id, fixture_id, expected_fpl_points, xpts_appearance, xpts_goals, xpts_assists, xpts_clean_sheet, xpts_saves, xpts_defensive_contribution, xpts_cards_own_goals, xpts_bonus, xpts_goals_conceded, xpts_penalties'
      )
      .eq('model_version', PLAYER_TABLE_MODEL_VERSION)
      .in('fixture_id', fixtureIds)
      .range(from, to)
  );

  const gwRows = await fetchAllRows<{
    fpl_player_id: number;
    fpl_fixture_id: number;
    total_points: number | null;
    minutes: number | null;
    goals_scored: number | null;
    assists: number | null;
    clean_sheets: number | null;
    goals_conceded: number | null;
    own_goals: number | null;
    penalties_saved: number | null;
    penalties_missed: number | null;
    yellow_cards: number | null;
    red_cards: number | null;
    saves: number | null;
    bonus: number | null;
    source_payload: any;
  }>((from, to) =>
    supabase
      .from('fpl_player_gameweeks' as any)
      .select(
        'fpl_player_id, fpl_fixture_id, total_points, minutes, goals_scored, assists, clean_sheets, goals_conceded, own_goals, penalties_saved, penalties_missed, yellow_cards, red_cards, saves, bonus, source_payload'
      )
      .in('fpl_fixture_id', fixtureIds)
      .range(from, to)
  );

  const playerIds = new Set<number>();
  for (const r of projRows) playerIds.add(r.fpl_player_id);
  for (const r of gwRows) playerIds.add(r.fpl_player_id);
  if (playerIds.size === 0) return [];

  const { data: playerRows, error: playerError } = await supabase
    .from('fpl_players')
    .select('fpl_player_id, web_name, element_type, canonical_team_id, now_cost')
    .eq('season_id', 13)
    .in('fpl_player_id', [...playerIds]);
  if (playerError) throw playerError;

  const { data: teamRows, error: teamError } = await supabase.from('teams').select('team_id, canonical_name');
  if (teamError) throw teamError;
  const teamNameById = new Map<number, string>();
  for (const t of teamRows ?? []) teamNameById.set(t.team_id, t.canonical_name);

  const playerInfo = new Map<number, { web_name: string; fpl_position: FplElementType | null; team_id: number; price: number | null }>();
  for (const p of playerRows ?? []) {
    playerInfo.set(p.fpl_player_id, {
      web_name: p.web_name ?? 'Unknown',
      fpl_position: p.element_type,
      team_id: p.canonical_team_id ?? 0,
      price: p.now_cost != null ? p.now_cost / 10 : null,
    });
  }

  // Key rows by player+matchweek (not player+fixture -- a player only ever
  // has one fixture per matchweek in this league, and matchweek is what the
  // UI filters/pivots by).
  const rowByKey = new Map<string, PlayerGameweekPoints>();
  const keyOf = (playerId: number, mw: number) => `${playerId}:${mw}`;

  const emptyRow = (playerId: number, mw: number): PlayerGameweekPoints => {
    const info = playerInfo.get(playerId);
    return {
      fpl_player_id: playerId,
      web_name: info?.web_name ?? 'Unknown',
      team_id: info?.team_id ?? 0,
      team_name: info ? teamNameById.get(info.team_id) ?? 'Unknown' : 'Unknown',
      fpl_position: info?.fpl_position ?? null,
      fpl_position_label: info?.fpl_position ? FPL_POSITION_LABEL[info.fpl_position] : '\u2014',
      price: info?.price ?? null,
      matchweek: mw,
      actual_points: null,
      projected_points: null,
      xpts_appearance: null,
      xpts_goals: null,
      xpts_assists: null,
      xpts_clean_sheet: null,
      xpts_saves: null,
      xpts_defensive_contribution: null,
      xpts_cards_own_goals: null,
      xpts_bonus: null,
      xpts_goals_conceded: null,
      xpts_penalties: null,
      actual_contribution: null,
    };
  };

  for (const p of projRows) {
    const mw = matchweekByFixture.get(p.fixture_id);
    if (mw === undefined) continue;
    const key = keyOf(p.fpl_player_id, mw);
    const row = rowByKey.get(key) ?? emptyRow(p.fpl_player_id, mw);
    row.projected_points = num(p.expected_fpl_points);
    row.xpts_appearance = num(p.xpts_appearance);
    row.xpts_goals = num(p.xpts_goals);
    row.xpts_assists = num(p.xpts_assists);
    row.xpts_clean_sheet = num(p.xpts_clean_sheet);
    row.xpts_saves = num(p.xpts_saves);
    row.xpts_defensive_contribution = num(p.xpts_defensive_contribution);
    row.xpts_cards_own_goals = num(p.xpts_cards_own_goals);
    row.xpts_bonus = num(p.xpts_bonus);
    row.xpts_goals_conceded = num(p.xpts_goals_conceded);
    row.xpts_penalties = num(p.xpts_penalties);
    rowByKey.set(key, row);
  }

  for (const g of gwRows) {
    const mw = matchweekByFixture.get(g.fpl_fixture_id);
    if (mw === undefined || g.total_points === null) continue;
    const key = keyOf(g.fpl_player_id, mw);
    const row = rowByKey.get(key) ?? emptyRow(g.fpl_player_id, mw);
    row.actual_points = g.total_points;
    const stats = g.source_payload?.stats ?? {};
    const defensiveActions = Number(stats.clearances_blocks_interceptions ?? 0) + Number(stats.tackles ?? 0) + (row.fpl_position === 3 || row.fpl_position === 4 ? Number(stats.recoveries ?? 0) : 0);
    row.actual_contribution = computeActualContribution(row.fpl_position, {
      minutes: g.minutes,
      goals_scored: g.goals_scored,
      assists: g.assists,
      clean_sheets: g.clean_sheets,
      goals_conceded: g.goals_conceded,
      own_goals: g.own_goals,
      penalties_saved: g.penalties_saved,
      penalties_missed: g.penalties_missed,
      yellow_cards: g.yellow_cards,
      red_cards: g.red_cards,
      saves: g.saves,
      bonus: g.bonus,
      defensive_actions: defensiveActions,
    });
    rowByKey.set(key, row);
  }

  return [...rowByKey.values()];
}
