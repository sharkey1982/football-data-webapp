// ============================================================================
// src/lib/historyApi.ts
//
// Historical analytics: What Happened Next?, Historic Pace and how quickly the
// table settles. Everything reads the precomputed history layer
// (team_match_snapshot and its season summaries, docs/methodology/history.md)
// rather than rebuilding tables from decades of matches in the browser.
//
// Comparisons are by MATCHES PLAYED, not nominal gameweek, and only between
// seasons of the same size (comparable_group, e.g. 20x38), so the 22-club
// Premier League of 1992-95 is not silently mixed with 38-game seasons.
// Summaries are pure functions, exported for tests.
// ============================================================================

import { supabase } from './supabase';

export type HistoryLeague = { id: number; code: string; name: string };

/** The English divisions with continuous history (league_id 1-5). */
export const HISTORY_LEAGUES: HistoryLeague[] = [
  { id: 1, code: 'E0', name: 'Premier League' },
  { id: 2, code: 'E1', name: 'Championship' },
  { id: 3, code: 'E2', name: 'League One' },
  { id: 4, code: 'E3', name: 'League Two' },
  { id: 5, code: 'EC', name: 'National League' },
];

export function leagueByCode(code: string | null | undefined): HistoryLeague {
  return HISTORY_LEAGUES.find((l) => l.code === code) ?? HISTORY_LEAGUES[0];
}

export type WhnRow = {
  season_id: number;
  season_label: string;
  start_year: number;
  team_id: number;
  team_name: string;
  team_slug: string | null;
  position_at_played: number;
  teams_at_played: number;
  points: number;
  goal_difference: number;
  final_position: number;
  final_points: number;
  clubs: number;
  champion: boolean;
  top_four: boolean | null;
  top_six: boolean | null;
  relegated: boolean | null;
  promoted: boolean | null;
};

export type WhnQuery = {
  leagueId: number;
  played: number;
  positionMin?: number | null;
  positionMax?: number | null;
  pointsMin?: number | null;
  pointsMax?: number | null;
  fromYear?: number | null;
  toYear?: number | null;
  comparableGroup?: string | null;
};

export async function getWhatHappenedNext(q: WhnQuery): Promise<WhnRow[]> {
  const { data, error } = await supabase.rpc('history_what_happened_next' as never, {
    p_league_id: q.leagueId,
    p_matches_played: q.played,
    p_position_min: q.positionMin ?? null,
    p_position_max: q.positionMax ?? null,
    p_points_min: q.pointsMin ?? null,
    p_points_max: q.pointsMax ?? null,
    p_from_year: q.fromYear ?? null,
    p_to_year: q.toYear ?? null,
    p_comparable_group: q.comparableGroup ?? null,
  } as never);
  if (error) throw error;
  return (data ?? []) as unknown as WhnRow[];
}

export type OutcomeSummary = {
  teamSeasons: number;
  seasons: number;
  champions: number;
  topFour: number;
  topSix: number;
  /** Relegation is only known where next season is on file. */
  relegated: number;
  relegationKnown: number;
  meanFinal: number | null;
  medianFinal: number | null;
  /** Average places gained (positive) or lost between then and the end. */
  meanMove: number | null;
  /** Count of team-seasons finishing in each position, 1..max clubs. */
  distribution: { position: number; count: number }[];
};

export function summariseOutcomes(rows: WhnRow[]): OutcomeSummary {
  const n = rows.length;
  const finals = rows.map((r) => r.final_position).sort((a, b) => a - b);
  const median =
    n === 0 ? null : n % 2 === 1 ? finals[(n - 1) / 2] : (finals[n / 2 - 1] + finals[n / 2]) / 2;
  const maxClubs = rows.reduce((m, r) => Math.max(m, r.clubs), 0);
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.final_position, (counts.get(r.final_position) ?? 0) + 1);
  const known = rows.filter((r) => r.relegated !== null);
  return {
    teamSeasons: n,
    seasons: new Set(rows.map((r) => r.season_id)).size,
    champions: rows.filter((r) => r.champion).length,
    topFour: rows.filter((r) => r.top_four).length,
    topSix: rows.filter((r) => r.top_six).length,
    relegated: known.filter((r) => r.relegated).length,
    relegationKnown: known.length,
    meanFinal: n ? round1(rows.reduce((s, r) => s + r.final_position, 0) / n) : null,
    medianFinal: median,
    meanMove: n ? round1(rows.reduce((s, r) => s + (r.position_at_played - r.final_position), 0) / n) : null,
    distribution: Array.from({ length: maxClubs }, (_, i) => ({ position: i + 1, count: counts.get(i + 1) ?? 0 })),
  };
}

/** "14 of 31 (45%)" -- the denominator is always shown. */
export function share(k: number, n: number): string {
  if (n === 0) return '–';
  return `${k} of ${n} (${Math.round((k / n) * 100)}%)`;
}

/** Percentile rank of value among values: the share below it plus half the ties. */
export function percentileRank(value: number, values: number[]): number | null {
  if (values.length === 0) return null;
  const below = values.filter((v) => v < value).length;
  const equal = values.filter((v) => v === value).length;
  return Math.round(((below + equal / 2) / values.length) * 100);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export { ordinal } from './teamHistoryApi';
export { seasonNameFromLabel as seasonName } from './seasonLabels';

// ---------------------------------------------------------------------------
// The current season
// ---------------------------------------------------------------------------

export type CurrentTeam = {
  team_id: number;
  team_name: string;
  team_slug: string | null;
  season_id: number;
  season_label: string;
  played: number;
  points: number;
  position: number;
  comparable_group: string;
  clubs: number;
};

/** The league's latest season (in progress, or the last finished one off-season). */
export async function getLatestSeasonTable(leagueId: number): Promise<CurrentTeam[]> {
  const { data: latest, error: e1 } = await supabase
    .from('team_season_summary' as never)
    .select('season_id, start_year')
    .eq('league_id', leagueId)
    .order('start_year', { ascending: false })
    .limit(1);
  if (e1) throw e1;
  const seasonId = (latest as unknown as { season_id: number }[] | null)?.[0]?.season_id;
  if (!seasonId) return [];
  const { data, error } = await supabase
    .from('team_season_summary' as never)
    .select('team_id, season_id, season_label, played, points, position, comparable_group, clubs')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .order('position');
  if (error) throw error;
  const rows = (data ?? []) as unknown as Omit<CurrentTeam, 'team_name' | 'team_slug'>[];
  const names = await teamNames(rows.map((r) => r.team_id));
  return rows.map((r) => ({ ...r, team_name: names.get(r.team_id)?.name ?? 'Unknown', team_slug: names.get(r.team_id)?.slug ?? null }));
}

async function teamNames(ids: number[]): Promise<Map<number, { name: string; slug: string | null }>> {
  const out = new Map<number, { name: string; slug: string | null }>();
  if (ids.length === 0) return out;
  const { data, error } = await supabase.from('teams').select('team_id, display_name, slug').in('team_id', ids);
  if (error) throw error;
  for (const t of (data ?? []) as { team_id: number; display_name: string; slug: string | null }[]) {
    out.set(t.team_id, { name: t.display_name, slug: t.slug });
  }
  return out;
}

/** Most common number of matches played -- the stage the season has reached. */
export function typicalPlayed(rows: { played: number }[]): number {
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.played, (counts.get(r.played) ?? 0) + 1);
  let best = 0;
  let bestN = -1;
  for (const [played, n] of counts) {
    if (n > bestN || (n === bestN && played > best)) {
      best = played;
      bestN = n;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Pace and table reliability
// ---------------------------------------------------------------------------

export type PacePoint = { matches_played: number; points: number; position_at_played: number };

export async function getTeamSeasonPace(leagueId: number, seasonId: number, teamId: number): Promise<PacePoint[]> {
  const { data, error } = await supabase
    .from('team_match_snapshot' as never)
    .select('matches_played, points, position_at_played')
    .eq('league_id', leagueId)
    .eq('season_id', seasonId)
    .eq('team_id', teamId)
    .order('matches_played');
  if (error) throw error;
  return (data ?? []) as unknown as PacePoint[];
}

export type Outcome = 'all' | 'champion' | 'top_four' | 'top_six' | 'relegated';

export type Benchmark = {
  matches_played: number;
  outcome: Outcome;
  team_seasons: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

export async function getPaceBenchmarks(leagueId: number, comparableGroup: string): Promise<Benchmark[]> {
  const { data, error } = await supabase
    .from('league_pace_benchmarks' as never)
    .select('matches_played, outcome, team_seasons, p10, p25, p50, p75, p90')
    .eq('league_id', leagueId)
    .eq('comparable_group', comparableGroup)
    .order('matches_played');
  if (error) throw error;
  return (data ?? []) as unknown as Benchmark[];
}

export type ChampionSeason = { season_id: number; season_label: string; team_id: number; team_name: string; points: number };

/** The highest-scoring champions of this league and size -- chosen from the data, not a hand-picked list. */
export async function getTopChampions(leagueId: number, comparableGroup: string, limit = 3): Promise<ChampionSeason[]> {
  const { data, error } = await supabase
    .from('team_season_summary' as never)
    .select('season_id, season_label, team_id, points')
    .eq('league_id', leagueId)
    .eq('comparable_group', comparableGroup)
    .eq('champion', true)
    .order('points', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as unknown as Omit<ChampionSeason, 'team_name'>[];
  const names = await teamNames(rows.map((r) => r.team_id));
  return rows.map((r) => ({ ...r, team_name: names.get(r.team_id)?.name ?? 'Unknown' }));
}

export type ReliabilityRow = {
  matches_played: number;
  seasons: number;
  rank_correlation: number;
  mean_abs_position_change: number;
  same_position_share: number;
};

export async function getTableReliability(leagueId: number, comparableGroup: string): Promise<ReliabilityRow[]> {
  const { data, error } = await supabase
    .from('league_table_reliability' as never)
    .select('matches_played, seasons, rank_correlation, mean_abs_position_change, same_position_share')
    .eq('league_id', leagueId)
    .eq('comparable_group', comparableGroup)
    .order('matches_played');
  if (error) throw error;
  return (data ?? []) as unknown as ReliabilityRow[];
}

/** First number of matches after which the average club finishes within `places` of where it stands. */
export function matchesUntilWithin(rows: ReliabilityRow[], places: number): number | null {
  const hit = rows.find((r) => r.mean_abs_position_change <= places);
  return hit ? hit.matches_played : null;
}

/** The standard comparison group for a league: its current size, as a double round robin. */
export function comparableGroupFor(clubs: number): string {
  return `${clubs}x${2 * (clubs - 1)}`;
}

/** '3' -> [3, 3]; '1-4' -> [1, 4]; anything else -> null. */
export function parseRange(v: string | null): [number, number] | null {
  if (!v) return null;
  const m = v.match(/^(\d+)(?:-(\d+))?$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return a <= b ? [a, b] : [b, a];
}

// ---------------------------------------------------------------------------
// History hub
// ---------------------------------------------------------------------------

export type HistoryHubData = {
  leagueCode: string;
  comparableGroup: string;
  reliability: ReliabilityRow[];
  /** Leaders after 10 matches: how many won the league, of how many. */
  leadersAfter10: { champions: number; teamSeasons: number };
};

export async function loadHistoryHubData(leagueCode: string): Promise<HistoryHubData> {
  const league = leagueByCode(leagueCode);
  const table = await getLatestSeasonTable(league.id);
  const group = comparableGroupFor(table[0]?.clubs ?? 20);
  const [reliability, leaders] = await Promise.all([
    getTableReliability(league.id, group),
    getWhatHappenedNext({ leagueId: league.id, played: 10, positionMin: 1, positionMax: 1, comparableGroup: group }),
  ]);
  const s = summariseOutcomes(leaders);
  return { leagueCode: league.code, comparableGroup: group, reliability, leadersAfter10: { champions: s.champions, teamSeasons: s.teamSeasons } };
}

const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

/** One string (not JSX fragments), so the server-rendered HTML reads as a plain sentence. */
export function settleSentence(leagueName: string, checkpoints: ReliabilityRow[]): string {
  if (checkpoints.length === 0) return '';
  const [first, ...rest] = checkpoints;
  const tail = rest.map((r) => `after ${r.matches_played}, ${f1(r.mean_abs_position_change)}`).join('; ');
  return `After ${first.matches_played} matches the average ${leagueName} club finishes ${f1(first.mean_abs_position_change)} places from where it stands${tail ? `; ${tail}` : ''}.`;
}
