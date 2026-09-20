// ============================================================================
// src/lib/playerScoutApi.ts
//
// Player Scout: search any player, read what actually happened.
//
// The counterpart to Player Projections, which is about what the model
// expects. This only works because player_identity links the same human
// across seasons and clubs -- FPL reassigns element ids every year, so
// "Saka in 2022/23" and "Saka now" share no id, only a code.
// ============================================================================

import { supabase } from './supabase';

export type PlayerSearchResult = {
  slug?: string | null;
  fpl_code: number;
  canonical_name: string;
  latest_web_name: string | null;
  latest_team: string | null;
  element_type: number;
  seasons_played: number;
  career_points: number;
  first_season: string | null;
  last_season: string | null;
  /** Only current-season players have a projection page to link to. */
  current_slug: string | null;
};

export type PlayerSeason = {
  season_id: number;
  season_slug: string;
  web_name: string;
  team_name: string | null;
  element_type: number;
  start_cost: number;
  end_cost: number;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
  points_per_start_million: number | null;
  points_early: number | null;
  points_mid: number | null;
  points_late: number | null;
};

export const POSITION: Record<number, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };

export async function searchPlayers(query: string, limit = 20): Promise<PlayerSearchResult[]> {
  if (query.trim().length < 2) return [];
  const { data, error } = await supabase.rpc('search_players', {
    p_query: query.trim(),
    p_limit: limit,
  });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    fpl_code: Number(r.fpl_code),
    element_type: Number(r.element_type),
    seasons_played: Number(r.seasons_played),
    career_points: Number(r.career_points),
  }));
}

export async function getPlayerCareer(fplCode: number): Promise<PlayerSeason[]> {
  const { data, error } = await supabase.rpc('get_player_career', { p_fpl_code: fplCode });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    ...r,
    season_id: Number(r.season_id),
    element_type: Number(r.element_type),
    start_cost: Number(r.start_cost),
    end_cost: Number(r.end_cost),
    total_points: Number(r.total_points),
    minutes: Number(r.minutes),
    goals_scored: Number(r.goals_scored),
    assists: Number(r.assists),
    clean_sheets: Number(r.clean_sheets),
    bonus: Number(r.bonus),
    points_per_start_million: r.points_per_start_million == null ? null : Number(r.points_per_start_million),
    points_early: r.points_early == null ? null : Number(r.points_early),
    points_mid: r.points_mid == null ? null : Number(r.points_mid),
    points_late: r.points_late == null ? null : Number(r.points_late),
  }));
}

/** Pretty form of the dataset slug: "2025-26" -> "2025/26". */
export function seasonLabel(slug: string): string {
  return slug.replace('-', '/');
}

export type PlayerIdentity = {
  fpl_code: number;
  slug: string;
  canonical_name: string;
  latest_web_name: string | null;
  latest_team: string | null;
  element_type: number;
  seasons_played: number;
  career_points: number;
  career_minutes: number;
  first_season: string | null;
  last_season: string | null;
  current_slug: string | null;
  /** Null for a player no longer in the league -- they have history but
   * no current season, and the page should say so rather than show
   * zeros. */
  current_fpl_player_id: number | null;
  current_total_points: number | null;
  current_minutes: number | null;
  current_goals: number | null;
  current_assists: number | null;
  current_bonus: number | null;
  current_now_cost: number | null;
};

export type ScoutTeam = { team_id: number; team_name: string; players: number };

export async function listScoutTeams(): Promise<ScoutTeam[]> {
  const { data, error } = await supabase.rpc('list_scout_teams', { p_season_id: 13 });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    team_id: Number(r.team_id),
    team_name: String(r.team_name),
    players: Number(r.players),
  }));
}

/** Columns the browse list can be sorted by. Kept here rather than in
 * the page so the labels and the sort keys can't drift apart. */
export const SCOUT_SORT_COLUMNS = [
  { key: 'total_points', label: 'Points' },
  { key: 'now_cost', label: 'Price' },
  { key: 'minutes', label: 'Mins' },
  { key: 'points_per_million', label: 'Per £m' },
  { key: 'price_pressure', label: 'Pressure' },
  { key: 'goals_scored', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'web_name', label: 'Player' },
] as const;

export type ScoutSortKey = (typeof SCOUT_SORT_COLUMNS)[number]['key'];

/** Sorts a loaded page of players. Done client-side deliberately: the
 * list is capped at 150 rows, so re-querying to reorder would be a round
 * trip for something already in memory. */
export function sortScoutPlayers(
  rows: ScoutListPlayer[],
  key: ScoutSortKey,
  dir: 'asc' | 'desc'
): ScoutListPlayer[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'web_name') return factor * a.web_name.localeCompare(b.web_name);
    const av = a[key] as number | null;
    const bv = b[key] as number | null;
    // Nulls (an unpriced or unplayed player) sort LAST in both
    // directions. Substituting -Infinity would float them to the top of
    // an ascending sort, which reads as "cheapest" when it means
    // "unknown".
    if (av == null && bv == null) return a.web_name.localeCompare(b.web_name);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av === bv) return a.web_name.localeCompare(b.web_name);
    return factor * (av - bv);
  });
}

/** Resolve a player page from its stable slug.
 *
 * The slug lives on player_identity rather than fpl_players, so it
 * survives a transfer, a name change and a season rollover -- and
 * departed players have one at all, which the per-season slug can't
 * give them. */
export async function getPlayerBySlug(slug: string): Promise<PlayerIdentity | null> {
  const { data, error } = await supabase.rpc('get_player_by_slug', { p_slug: slug });
  if (error) throw error;
  const row = (data ?? [])[0];
  if (!row) return null;
  return {
    ...row,
    fpl_code: Number(row.fpl_code),
    element_type: Number(row.element_type),
    seasons_played: Number(row.seasons_played),
    career_points: Number(row.career_points),
    career_minutes: Number(row.career_minutes),
    current_fpl_player_id: row.current_fpl_player_id == null ? null : Number(row.current_fpl_player_id),
    current_total_points: row.current_total_points == null ? null : Number(row.current_total_points),
    current_minutes: row.current_minutes == null ? null : Number(row.current_minutes),
    current_goals: row.current_goals == null ? null : Number(row.current_goals),
    current_assists: row.current_assists == null ? null : Number(row.current_assists),
    current_bonus: row.current_bonus == null ? null : Number(row.current_bonus),
    current_now_cost: row.current_now_cost == null ? null : Number(row.current_now_cost),
  };
}

// ---------------------------------------------------------------------------
// Browsing
//
// Search-only assumed you already knew who you were looking for, which
// rather defeats "scouting". The list is filtered server-side so the
// page never pulls 662 rows to show 20.
// ---------------------------------------------------------------------------

export type ScoutListPlayer = {
  fpl_code: number;
  slug: string | null;
  fpl_player_id: number;
  web_name: string;
  full_name: string | null;
  team_name: string | null;
  team_id: number | null;
  element_type: number;
  now_cost: number | null;
  total_points: number;
  minutes: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  bonus: number;
  selected_by_percent: number | null;
  points_per_million: number | null;
  seasons_played: number;
  /** Absolute transfer pressure from Bullpit. Null means nothing
   * notable -- which is different from zero. */
  price_pressure: number | null;
  price_direction: 'rise' | 'fall' | null;
};

export type ScoutFilters = {
  position?: number | null;
  teamId?: number | null;
  minMinutes?: number;
  search?: string;
  limit?: number;
};

export async function listScoutPlayers(f: ScoutFilters = {}): Promise<ScoutListPlayer[]> {
  const { data, error } = await (supabase as any).rpc('list_scout_players', {
    p_season_id: 13,
    p_position: f.position ?? null,
    p_team_id: f.teamId ?? null,
    p_min_minutes: f.minMinutes ?? 0,
    p_search: f.search ?? null,
    p_limit: f.limit ?? 100,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    fpl_code: Number(r.fpl_code),
    fpl_player_id: Number(r.fpl_player_id),
    element_type: Number(r.element_type),
    total_points: Number(r.total_points ?? 0),
    minutes: Number(r.minutes ?? 0),
    goals_scored: Number(r.goals_scored ?? 0),
    assists: Number(r.assists ?? 0),
    clean_sheets: Number(r.clean_sheets ?? 0),
    bonus: Number(r.bonus ?? 0),
    seasons_played: Number(r.seasons_played ?? 0),
    now_cost: r.now_cost == null ? null : Number(r.now_cost),
    selected_by_percent: r.selected_by_percent == null ? null : Number(r.selected_by_percent),
    points_per_million: r.points_per_million == null ? null : Number(r.points_per_million),
    price_pressure: r.price_pressure == null ? null : Number(r.price_pressure),
    price_direction: (r.price_direction ?? null) as 'rise' | 'fall' | null,
  }));
}

export type GameweekBreakdown = {
  gameweek: number;
  opponent: string | null;
  was_home: boolean;
  kickoff_date: string | null;
  minutes: number;
  total_points: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  bps: number;
  saves: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  penalties_missed: number;
  penalties_saved: number;
  defensive_contribution: number;
  /** Pre-kickoff projection where one exists. Null for most early
   * gameweeks -- projections only began partway through the season, and
   * anything generated after kickoff isn't a forecast. */
  projected_points: number | null;
};

export async function getPlayerGameweekBreakdown(fplPlayerId: number): Promise<GameweekBreakdown[]> {
  const { data, error } = await (supabase as any).rpc('get_player_gameweek_breakdown', {
    p_fpl_player_id: fplPlayerId,
    p_season_id: 13,
  });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    gameweek: Number(r.gameweek),
    minutes: Number(r.minutes ?? 0),
    total_points: Number(r.total_points ?? 0),
    goals_scored: Number(r.goals_scored ?? 0),
    assists: Number(r.assists ?? 0),
    clean_sheets: Number(r.clean_sheets ?? 0),
    goals_conceded: Number(r.goals_conceded ?? 0),
    bonus: Number(r.bonus ?? 0),
    bps: Number(r.bps ?? 0),
    saves: Number(r.saves ?? 0),
    yellow_cards: Number(r.yellow_cards ?? 0),
    red_cards: Number(r.red_cards ?? 0),
    own_goals: Number(r.own_goals ?? 0),
    penalties_missed: Number(r.penalties_missed ?? 0),
    penalties_saved: Number(r.penalties_saved ?? 0),
    defensive_contribution: Number(r.defensive_contribution ?? 0),
    projected_points: r.projected_points == null ? null : Number(r.projected_points),
  }));
}

/** The SAME contribution columns Player Projections shows, computed
 * from actuals instead of forecasts. Keeping the two column sets
 * identical is the point: one page is what happened, the other what's
 * expected, and reading one should teach you how to read the other. */
export const SCOUT_CONTRIBUTION_COLUMNS = [
  'appearance',
  'goals',
  'assists',
  'cleanSheet',
  'defensiveContribution',
  'saves',
  'bonus',
  'goalsConceded',
  'penalties',
  'cardsOwnGoals',
] as const;

export type ScoutContributionKey = (typeof SCOUT_CONTRIBUTION_COLUMNS)[number];

export const SCOUT_CONTRIBUTION_LABEL: Record<ScoutContributionKey, string> = {
  appearance: 'Playing time',
  goals: 'Goals',
  assists: 'Assists',
  cleanSheet: 'Clean sheet',
  defensiveContribution: 'Def. contribution',
  saves: 'Saves',
  bonus: 'Bonus',
  goalsConceded: 'Goals conceded',
  penalties: 'Penalties',
  cardsOwnGoals: 'Cards / OG',
};

/** Actual points by category, using FPL's own scoring. Derived rather
 * than stored, so the breakdown explains the total instead of just
 * restating it. */
export function actualContribution(
  g: GameweekBreakdown,
  elementType: number
): Record<ScoutContributionKey, number> {
  const goalPoints = elementType === 1 || elementType === 2 ? 6 : elementType === 3 ? 5 : 4;
  const csPoints = elementType === 1 || elementType === 2 ? 4 : elementType === 3 ? 1 : 0;
  // Defensive contribution: 2 points at 10+ actions for defenders,
  // 12+ for everyone else.
  const dcThreshold = elementType === 2 ? 10 : 12;
  return {
    appearance: g.minutes > 0 ? (g.minutes >= 60 ? 2 : 1) : 0,
    goals: g.goals_scored * goalPoints,
    assists: g.assists * 3,
    cleanSheet: g.minutes >= 60 ? g.clean_sheets * csPoints : 0,
    defensiveContribution: g.defensive_contribution >= dcThreshold ? 2 : 0,
    saves: Math.floor(g.saves / 3),
    bonus: g.bonus,
    goalsConceded:
      elementType === 1 || elementType === 2 ? -Math.floor(g.goals_conceded / 2) : 0,
    penalties: g.penalties_saved * 5 - g.penalties_missed * 2,
    cardsOwnGoals: -(g.yellow_cards + g.red_cards * 3 + g.own_goals * 2),
  };
}

// ---------------------------------------------------------------------------
// Dedicated player page: any season, gameweek by gameweek
// ---------------------------------------------------------------------------

export type PlayerSeasonOption = {
  season_id: number;
  season_slug: string;
  total_points: number;
  is_current: boolean;
};

export type SeasonGameweek = {
  gameweek: number;
  opponent: string | null;
  was_home: boolean;
  minutes: number;
  total_points: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  goals_conceded: number;
  bonus: number;
  saves: number;
  yellow_cards: number;
  red_cards: number;
  own_goals: number;
  penalties_missed: number;
  penalties_saved: number;
  defensive_contribution: number;
  /** Price at that gameweek, in 0.1m units. Historic seasons only --
   * the current-season table doesn't carry a per-gameweek price. */
  price: number | null;
};

export async function getPlayerSeasons(fplCode: number): Promise<PlayerSeasonOption[]> {
  const { data, error } = await supabase.rpc('get_player_seasons', { p_fpl_code: fplCode });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    season_id: Number(r.season_id),
    season_slug: String(r.season_slug),
    total_points: Number(r.total_points ?? 0),
    is_current: Boolean(r.is_current),
  }));
}

export async function getPlayerSeasonGameweeks(fplCode: number, seasonId: number): Promise<SeasonGameweek[]> {
  const { data, error } = await supabase.rpc('get_player_season_gameweeks', {
    p_fpl_code: fplCode,
    p_season_id: seasonId,
  });
  if (error) throw error;
  return (data ?? []).map((r: Record<string, unknown>) => ({
    gameweek: Number(r.gameweek),
    opponent: r.opponent == null ? null : String(r.opponent),
    was_home: Boolean(r.was_home),
    minutes: Number(r.minutes ?? 0),
    total_points: Number(r.total_points ?? 0),
    goals_scored: Number(r.goals_scored ?? 0),
    assists: Number(r.assists ?? 0),
    clean_sheets: Number(r.clean_sheets ?? 0),
    goals_conceded: Number(r.goals_conceded ?? 0),
    bonus: Number(r.bonus ?? 0),
    saves: Number(r.saves ?? 0),
    yellow_cards: Number(r.yellow_cards ?? 0),
    red_cards: Number(r.red_cards ?? 0),
    own_goals: Number(r.own_goals ?? 0),
    penalties_missed: Number(r.penalties_missed ?? 0),
    penalties_saved: Number(r.penalties_saved ?? 0),
    defensive_contribution: Number(r.defensive_contribution ?? 0),
    price: r.price == null ? null : Number(r.price),
  }));
}

/** Season points split by what produced them. Summed from the gameweek
 * rows rather than the season totals, so it always reconciles with the
 * gameweek table shown beside it. */
export function seasonContributionTotals(
  gws: SeasonGameweek[],
  elementType: number
): { key: ScoutContributionKey; label: string; points: number }[] {
  const totals = {} as Record<ScoutContributionKey, number>;
  for (const k of SCOUT_CONTRIBUTION_COLUMNS) totals[k] = 0;
  for (const g of gws) {
    // actualContribution only reads the scoring fields, which a
    // SeasonGameweek has in full; the cast avoids inventing a
    // projected_points it has no business carrying.
    const c = actualContribution(g as unknown as GameweekBreakdown, elementType);
    for (const k of SCOUT_CONTRIBUTION_COLUMNS) totals[k] += c[k];
  }
  return SCOUT_CONTRIBUTION_COLUMNS.map((k) => ({
    key: k,
    label: SCOUT_CONTRIBUTION_LABEL[k],
    points: totals[k],
  })).filter((r) => r.points !== 0);
}

/** Running total after each gameweek -- the shape of a season rather
 * than its endpoint. */
export function cumulativePoints(gws: SeasonGameweek[]): { gameweek: number; total: number }[] {
  let running = 0;
  return gws.map((g) => {
    running += g.total_points;
    return { gameweek: g.gameweek, total: running };
  });
}

/** Rate stats, which is what actually compares seasons of different
 * lengths. A 38-game season and a 5-game one aren't comparable on
 * totals, and points per 90 is the honest version of "per game" for a
 * player who is often a substitute. */
export function seasonRates(gws: SeasonGameweek[]) {
  const appearances = gws.filter((g) => g.minutes > 0).length;
  const starts = gws.filter((g) => g.minutes >= 60).length;
  const minutes = gws.reduce((s, g) => s + g.minutes, 0);
  const points = gws.reduce((s, g) => s + g.total_points, 0);
  return {
    appearances,
    starts,
    minutes,
    points,
    pointsPerGame: appearances ? Number((points / appearances).toFixed(2)) : 0,
    pointsPer90: minutes ? Number(((points / minutes) * 90).toFixed(2)) : 0,
    minutesPerAppearance: appearances ? Math.round(minutes / appearances) : 0,
  };
}
