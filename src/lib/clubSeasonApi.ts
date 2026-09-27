// ============================================================================
// src/lib/clubSeasonApi.ts
//
// One club's season: /football/teams/:slug/:season. Every league match with
// the table position after it, the season's record and outcome, its longest
// runs, and its points against where champions and relegated clubs stood
// after the same number of matches (league_pace_benchmarks).
//
// Reads team_match_snapshot and team_season_summary (docs/methodology/
// history.md). The builders are pure so the static generator can make every
// English club-season page from bulk rows.
// ============================================================================

import { supabase } from './supabase';
import {
  eraNames,
  isEnglish,
  leagueSeasonPath,
  listNames,
  seasonDisplay,
  seasonSegment,
  teamNames,
  type LeagueRef,
  type SeasonSummary,
  type SeasonTableRow,
} from './leagueSeasonApi';
import { ordinal } from './teamHistoryApi';

export { ordinal };

export type ClubSeasonMatch = {
  matches_played: number;
  match_date: string;
  venue: 'H' | 'A';
  opponent_team_id: number;
  opponent_name: string;
  opponent_slug: string | null;
  goals_for: number;
  goals_against: number;
  result: 'W' | 'D' | 'L';
  points: number;
  position_on_date: number;
  teams_in_league: number;
};

export type BenchPoint = { matches_played: number; outcome: 'champion' | 'relegated'; p25: number; p50: number; p75: number };

export type ClubSeasonLink = { league_code: string; start_year: number; position: number };

export type ClubSeasonData = {
  team: { team_id: number; name: string; slug: string };
  league: LeagueRef;
  eraName: string;
  season: { season_id: number; start_year: number };
  record: SeasonTableRow;
  summary: Pick<SeasonSummary, 'is_final' | 'curtailed' | 'split_format' | 'clubs' | 'comparable_group' | 'games_in_season'>;
  matches: ClubSeasonMatch[];
  benchmarks: BenchPoint[];
  /** The club's seasons in any league on file, oldest first (navigation). */
  clubSeasons: ClubSeasonLink[];
};

export const SNAPSHOT_COLUMNS =
  'league_id,season_id,team_id,matches_played,match_date,venue,opponent_team_id,goals_for,goals_against,result,points,position_on_date,teams_in_league';

export type RawSnapshotRow = Omit<ClubSeasonMatch, 'opponent_name' | 'opponent_slug'> & { league_id: number; season_id: number; team_id: number };

// ---------------------------------------------------------------------------
// URLs and wording
// ---------------------------------------------------------------------------

export function clubSeasonPath(teamSlug: string, leagueCode: string, startYear: number): string {
  return `/football/teams/${teamSlug}/${seasonSegment(leagueCode, startYear)}`;
}

export type Run = { length: number; from: number; to: number };

/** Longest run of consecutive matches meeting `pred` (first one on ties). */
export function longestRun(matches: ClubSeasonMatch[], pred: (m: ClubSeasonMatch) => boolean): Run | null {
  let best: Run | null = null;
  let start = -1;
  matches.forEach((m, i) => {
    if (pred(m)) {
      if (start < 0) start = i;
      const len = i - start + 1;
      if (!best || len > best.length) best = { length: len, from: matches[start].matches_played, to: m.matches_played };
    } else start = -1;
  });
  return best;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The season in two to four sentences (one string: one text node in SSR). */
export function clubSeasonStory(d: Pick<ClubSeasonData, 'team' | 'league' | 'eraName' | 'season' | 'record' | 'summary' | 'matches'>): string {
  const r = d.record;
  const name = d.team.name;
  const when = seasonDisplay(d.league.code, d.season.start_year);
  const english = isEnglish(d.league);
  const rec = `won ${r.won}, drawn ${r.drawn}, lost ${r.lost}; scored ${r.goals_for}, conceded ${r.goals_against}`;
  const parts: string[] = [];

  if (d.summary.is_final) {
    let outcome = '';
    if (r.champion) outcome = r.promoted ? ' and won the title and promotion' : ' and won the title';
    else if (r.promoted) outcome = ' and were promoted';
    else if (r.relegated) outcome = english ? ' and were relegated' : ` and were not in the ${d.eraName} the next season`;
    parts.push(`${name} finished ${ordinal(r.position)} of ${d.summary.clubs} in the ${when} ${d.eraName} with ${r.points} points (${rec})${outcome}.`);
    if (d.summary.curtailed) parts.push('The season was curtailed and the table decided on points per game.');
  } else {
    parts.push(`${name} are ${ordinal(r.position)} of ${d.summary.clubs} in the ${when} ${d.eraName} with ${r.points} points after ${plural(r.played, 'match', 'matches')} (${rec}).`);
  }
  if (r.deduction > 0) parts.push(`That includes a ${r.deduction}-point deduction.`);

  const ms = d.matches;
  if (ms.length >= 5) {
    const top = ms.filter((m) => m.position_on_date === 1).length;
    const hi = ms.reduce((a, b) => (b.position_on_date < a.position_on_date ? b : a));
    const lo = ms.reduce((a, b) => (b.position_on_date > a.position_on_date ? b : a));
    parts.push(
      top > 0
        ? `They were top of the table after ${plural(top, 'match', 'matches')} of ${ms.length}; lowest ${ordinal(lo.position_on_date)}, after match ${lo.matches_played}.`
        : `Highest position ${ordinal(hi.position_on_date)}, after match ${hi.matches_played}; lowest ${ordinal(lo.position_on_date)}, after match ${lo.matches_played}.`
    );
    const unbeaten = longestRun(ms, (m) => m.result !== 'L');
    const wins = longestRun(ms, (m) => m.result === 'W');
    const winless = longestRun(ms, (m) => m.result !== 'W');
    const runs: string[] = [];
    if (wins && wins.length >= 3) runs.push(`${wins.length} wins in a row`);
    if (unbeaten && unbeaten.length >= 5 && (!wins || unbeaten.length > wins.length)) runs.push(`${unbeaten.length} unbeaten`);
    if (winless && winless.length >= 5) runs.push(`${winless.length} without a win`);
    if (runs.length) parts.push(`Longest runs: ${listNames(runs)}.`);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Builders (shared by the loader and the static generator)
// ---------------------------------------------------------------------------

export function buildMatches(rows: RawSnapshotRow[], names: Map<number, { name: string; slug: string | null }>): ClubSeasonMatch[] {
  return [...rows]
    .sort((a, b) => a.matches_played - b.matches_played)
    .map((r) => ({
      matches_played: r.matches_played,
      match_date: r.match_date,
      venue: r.venue,
      opponent_team_id: r.opponent_team_id,
      opponent_name: names.get(r.opponent_team_id)?.name ?? 'Unknown',
      opponent_slug: names.get(r.opponent_team_id)?.slug ?? null,
      goals_for: r.goals_for,
      goals_against: r.goals_against,
      result: r.result,
      points: r.points,
      position_on_date: r.position_on_date,
      teams_in_league: r.teams_in_league,
    }));
}

export function pickBenchmarks(rows: (BenchPoint & { league_id: number; comparable_group: string })[], leagueId: number, group: string): BenchPoint[] {
  return rows
    .filter((b) => b.league_id === leagueId && b.comparable_group === group && (b.outcome === 'champion' || b.outcome === 'relegated'))
    .map(({ matches_played, outcome, p25, p50, p75 }) => ({ matches_played, outcome, p25, p50, p75 }))
    .sort((a, b) => a.matches_played - b.matches_played);
}

// ---------------------------------------------------------------------------
// Loader (browser)
// ---------------------------------------------------------------------------

type TssRow = {
  league_id: number; league_code: string; season_id: number; start_year: number; team_id: number; position: number; played: number;
  won: number; drawn: number; lost: number; goals_for: number; goals_against: number; goal_difference: number; deduction: number;
  points: number; split_group: number | null; champion: boolean | null; relegated: boolean | null; promoted: boolean | null;
  is_final: boolean; curtailed: boolean; split_format: boolean; clubs: number; comparable_group: string; games_in_season: number;
};

export async function loadClubSeason(teamSlug: string, startYear: number): Promise<ClubSeasonData | null> {
  const { data: t, error: e0 } = await supabase.from('teams').select('team_id, display_name, slug').eq('slug', teamSlug).maybeSingle();
  if (e0) throw e0;
  const team = t as { team_id: number; display_name: string; slug: string } | null;
  if (!team) return null;

  const { data: seasons, error: e1 } = await supabase
    .from('team_season_summary' as never)
    .select(
      'league_id, league_code, season_id, start_year, team_id, position, played, won, drawn, lost, goals_for, goals_against, goal_difference, deduction, points, split_group, champion, relegated, promoted, is_final, curtailed, split_format, clubs, comparable_group, games_in_season'
    )
    .eq('team_id', team.team_id)
    .order('start_year');
  if (e1) throw e1;
  const all = (seasons ?? []) as unknown as TssRow[];
  const row = all.find((s) => s.start_year === startYear);
  if (!row) return null;

  const [leagueRes, snapRes, benchRes, eras] = await Promise.all([
    supabase.from('leagues').select('league_id, code, name, slug, countries(name)').eq('league_id', row.league_id).maybeSingle(),
    supabase
      .from('team_match_snapshot' as never)
      .select(SNAPSHOT_COLUMNS)
      .eq('league_id', row.league_id)
      .eq('season_id', row.season_id)
      .eq('team_id', team.team_id)
      .order('matches_played'),
    supabase
      .from('league_pace_benchmarks' as never)
      .select('league_id, comparable_group, matches_played, outcome, p25, p50, p75')
      .eq('league_id', row.league_id)
      .eq('comparable_group', row.comparable_group)
      .in('outcome', ['champion', 'relegated']),
    eraNames(row.league_id),
  ]);
  if (leagueRes.error) throw leagueRes.error;
  if (snapRes.error) throw snapRes.error;
  const l = leagueRes.data as unknown as { league_id: number; code: string; name: string; slug: string; countries: { name: string } | null } | null;
  if (!l) return null;
  const snaps = (snapRes.data ?? []) as unknown as RawSnapshotRow[];
  const names = await teamNames(snaps.map((s) => s.opponent_team_id));
  return buildClubSeason({
    team: { team_id: team.team_id, name: team.display_name, slug: team.slug },
    league: { league_id: l.league_id, code: l.code, name: l.name, slug: l.slug, country: l.countries?.name ?? null },
    eraName: eras.get(row.season_id) ?? l.name,
    row,
    snaps,
    names,
    bench: benchRes.error ? [] : ((benchRes.data ?? []) as unknown as (BenchPoint & { league_id: number; comparable_group: string })[]),
    clubSeasons: all.map((s) => ({ league_code: s.league_code, start_year: s.start_year, position: s.position })),
  });
}

export function buildClubSeason(a: {
  team: ClubSeasonData['team'];
  league: LeagueRef;
  eraName: string;
  row: Omit<TssRow, 'league_code'> & { league_code?: string };
  snaps: RawSnapshotRow[];
  names: Map<number, { name: string; slug: string | null }>;
  bench: (BenchPoint & { league_id: number; comparable_group: string })[];
  clubSeasons: ClubSeasonLink[];
}): ClubSeasonData {
  const r = a.row;
  return {
    team: a.team,
    league: a.league,
    eraName: a.eraName,
    season: { season_id: r.season_id, start_year: r.start_year },
    record: {
      position: r.position, team_id: r.team_id, team_name: a.team.name, team_slug: a.team.slug, played: r.played, won: r.won, drawn: r.drawn,
      lost: r.lost, goals_for: r.goals_for, goals_against: r.goals_against, goal_difference: r.goal_difference, deduction: r.deduction,
      points: r.points, split_group: r.split_group, champion: r.champion, relegated: r.relegated, promoted: r.promoted,
    },
    summary: { is_final: r.is_final, curtailed: r.curtailed, split_format: r.split_format, clubs: r.clubs, comparable_group: r.comparable_group, games_in_season: r.games_in_season },
    matches: buildMatches(a.snaps, a.names),
    benchmarks: pickBenchmarks(a.bench, r.league_id, r.comparable_group),
    clubSeasons: a.clubSeasons,
  };
}

export function leagueSeasonLink(d: Pick<ClubSeasonData, 'league' | 'season'>): string {
  return leagueSeasonPath(d.league, d.season.start_year);
}

export type { TssRow };
