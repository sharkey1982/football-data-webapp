// ============================================================================
// src/lib/scorelinesApi.ts
//
// Scoreline Explorer: how often each scoreline happens in a league, for any
// span of seasons, or from one club's side (history_scorelines()). Goals are
// capped at 5 ("5" = 5 or more). Pure summaries, exported for tests and the
// static generator.
// ============================================================================

import { supabase } from './supabase';
import { teamNames, type LeagueRef } from './leagueSeasonApi';

/** One capped scoreline and outcome (W/D/L for the home side or the club,
 * from the uncapped score, so 6-5 is a win even though both cap to 5+). */
export type ScorelineRow = { goals_a: number; goals_b: number; outcome: 'W' | 'D' | 'L'; matches: number };

export type ScorelinesData = { league: LeagueRef; rows: ScorelineRow[] };

export type ScorelineQuery = { leagueId: number; from: number | null; to: number | null; teamId: number | null; venue: 'H' | 'A' | null };

export async function getScorelines(q: ScorelineQuery): Promise<ScorelineRow[]> {
  const { data, error } = await supabase.rpc('history_scorelines' as never, {
    p_league_id: q.leagueId, p_from_year: q.from, p_to_year: q.to, p_team_id: q.teamId, p_venue: q.venue,
  } as never);
  if (error) throw error;
  return ((data ?? []) as unknown as ScorelineRow[]).map((r) => ({ ...r, matches: Number(r.matches) }));
}

/** Every club that has played in the league, by name. */
export async function getLeagueClubs(leagueId: number): Promise<{ team_id: number; name: string }[]> {
  const { data, error } = await supabase.from('team_season_summary' as never).select('team_id').eq('league_id', leagueId).limit(3000);
  if (error) throw error;
  const ids = [...new Set(((data ?? []) as unknown as { team_id: number }[]).map((r) => r.team_id))];
  const names = await teamNames(ids);
  return ids.map((id) => ({ team_id: id, name: names.get(id)?.name ?? 'Unknown' })).sort((a, b) => a.name.localeCompare(b.name));
}

export type ScorelineSummary = {
  total: number;
  grid: number[][]; // [a][b] counts, 0..5
  top: { goals_a: number; goals_b: number; matches: number }[];
  aWins: number;
  draws: number;
  bWins: number;
  goalless: number;
};

export function summariseScorelines(rows: ScorelineRow[]): ScorelineSummary {
  const grid = Array.from({ length: 6 }, () => Array(6).fill(0) as number[]);
  let total = 0;
  let aWins = 0;
  let draws = 0;
  let bWins = 0;
  for (const r of rows) {
    grid[r.goals_a][r.goals_b] += r.matches;
    total += r.matches;
    if (r.outcome === 'W') aWins += r.matches;
    else if (r.outcome === 'L') bWins += r.matches;
    else draws += r.matches;
  }
  // Cells, not rows: a capped cell can hold more than one outcome.
  const cells: { goals_a: number; goals_b: number; matches: number }[] = [];
  grid.forEach((row, a) => row.forEach((n, b) => n > 0 && cells.push({ goals_a: a, goals_b: b, matches: n })));
  const top = cells.sort((x, y) => y.matches - x.matches).slice(0, 5);
  return { total, grid, top, aWins, draws, bWins, goalless: grid[0][0] };
}

export const scoreLabel = (a: number, b: number) => `${a === 5 ? '5+' : a}–${b === 5 ? '5+' : b}`;

export function sharePct(n: number, total: number): string {
  if (total === 0) return '–';
  const p = (n / total) * 100;
  return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/** One or two sentences, from the home side's or the club's point of view. */
export function scorelineSentence(s: ScorelineSummary, subject: string, teamName: string | null): string {
  if (s.total === 0 || s.top.length === 0) return '';
  const t = s.top[0];
  const side = teamName ? `${teamName}’s` : 'home side’s';
  const second = s.top[1] ? `, then ${scoreLabel(s.top[1].goals_a, s.top[1].goals_b)} (${sharePct(s.top[1].matches, s.total)})` : '';
  const outcome = teamName
    ? `${teamName} won ${sharePct(s.aWins, s.total)}, drew ${sharePct(s.draws, s.total)} and lost ${sharePct(s.bWins, s.total)}`
    : `home sides won ${sharePct(s.aWins, s.total)}, ${sharePct(s.draws, s.total)} were drawn and away sides won ${sharePct(s.bWins, s.total)}`;
  return (
    `The most common scoreline in ${s.total.toLocaleString('en-GB')} ${subject} matches is ${scoreLabel(t.goals_a, t.goals_b)} (${side} goals first): ` +
    `${sharePct(t.matches, s.total)}${second}. ${outcome.charAt(0).toUpperCase()}${outcome.slice(1)}; ${sharePct(s.goalless, s.total)} finished 0–0.`
  );
}
