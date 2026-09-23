// ============================================================================
// src/lib/teamHistoryApi.ts
//
// A team's league history across the archive: one row per season from the
// league_standings view (all five divisions, deductions applied, curtailed
// seasons ranked on points per game), and its record by calendar month.
// The summarising is pure and exported so it can be tested without a network.
// ============================================================================

import { supabase } from './supabase';

export type Venue = 'total' | 'home' | 'away';

export type StandingRow = {
  league_code: string;
  league_name: string;
  tier: number;
  season_id: number;
  season_label: string;
  position: number;
  pyramid_position: number;
  teams: number;
  is_final: boolean;
  curtailed: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  clean_sheets: number;
  points_won: number;
  deduction: number;
  points: number;
  home_played: number;
  home_won: number;
  home_drawn: number;
  home_lost: number;
  home_goals_for: number;
  home_goals_against: number;
  home_clean_sheets: number;
  home_points: number;
  away_played: number;
  away_won: number;
  away_drawn: number;
  away_lost: number;
  away_goals_for: number;
  away_goals_against: number;
  away_clean_sheets: number;
  away_points: number;
};

export type MonthRow = { month_num: number; month_label: string; venue: 'home' | 'away'; played: number; points: number; ppg: number };

const COLUMNS =
  'league_code,league_name,tier,season_id,season_label,position,pyramid_position,teams,is_final,curtailed,' +
  'played,won,drawn,lost,goals_for,goals_against,clean_sheets,points_won,deduction,points,' +
  'home_played,home_won,home_drawn,home_lost,home_goals_for,home_goals_against,home_clean_sheets,home_points,' +
  'away_played,away_won,away_drawn,away_lost,away_goals_for,away_goals_against,away_clean_sheets,away_points';

export async function getTeamStandings(teamId: number): Promise<StandingRow[]> {
  const { data, error } = await supabase
    .from('league_standings')
    .select(COLUMNS)
    .eq('team_id', teamId)
    .order('season_id');
  if (error) throw error;
  return (data ?? []) as unknown as StandingRow[];
}

export async function getTeamMonthProfile(teamId: number): Promise<MonthRow[]> {
  const { data, error } = await supabase.rpc('get_team_month_profile', { p_team_id: teamId });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    month_num: Number(r.month_num),
    month_label: String(r.month_label),
    venue: r.venue === 'away' ? 'away' : 'home',
    played: Number(r.played),
    points: Number(r.points),
    ppg: Number(r.ppg),
  }));
}

/** '1415' -> '2014/15' */
export function seasonName(label: string): string {
  return label.length === 4 ? `20${label.slice(0, 2)}/${label.slice(2)}` : label;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export type VenueLine = {
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  /** Points as won on the pitch for home/away; after deductions for the total. */
  points: number;
};

export function venueLine(r: StandingRow, v: Venue): VenueLine {
  if (v === 'home')
    return { played: r.home_played, won: r.home_won, drawn: r.home_drawn, lost: r.home_lost, goalsFor: r.home_goals_for, goalsAgainst: r.home_goals_against, cleanSheets: r.home_clean_sheets, points: r.home_points };
  if (v === 'away')
    return { played: r.away_played, won: r.away_won, drawn: r.away_drawn, lost: r.away_lost, goalsFor: r.away_goals_for, goalsAgainst: r.away_goals_against, cleanSheets: r.away_clean_sheets, points: r.away_points };
  return { played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, goalsFor: r.goals_for, goalsAgainst: r.goals_against, cleanSheets: r.clean_sheets, points: r.points };
}

export type HistorySummary = VenueLine & { seasons: number; divisions: string[]; ppg: number | null; gfPerGame: number | null; gaPerGame: number | null; cleanSheetPct: number | null };

export function summariseHistory(rows: StandingRow[], v: Venue): HistorySummary {
  const t = rows.map((r) => venueLine(r, v)).reduce<VenueLine>(
    (a, b) => ({
      played: a.played + b.played,
      won: a.won + b.won,
      drawn: a.drawn + b.drawn,
      lost: a.lost + b.lost,
      goalsFor: a.goalsFor + b.goalsFor,
      goalsAgainst: a.goalsAgainst + b.goalsAgainst,
      cleanSheets: a.cleanSheets + b.cleanSheets,
      points: a.points + b.points,
    }),
    { played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, points: 0 },
  );
  const per = (x: number) => (t.played > 0 ? x / t.played : null);
  const divisions = [...new Set([...rows].sort((a, b) => a.tier - b.tier).map((r) => r.league_name))];
  return {
    ...t,
    seasons: rows.length,
    divisions,
    ppg: per(t.points),
    gfPerGame: per(t.goalsFor),
    gaPerGame: per(t.goalsAgainst),
    cleanSheetPct: t.played > 0 ? (100 * t.cleanSheets) / t.played : null,
  };
}

/** Best and worst COMPLETED seasons by pyramid position (1 = top of the Premier League). */
export function bestAndWorst(rows: StandingRow[]): { best: StandingRow | null; worst: StandingRow | null } {
  const done = rows.filter((r) => r.is_final);
  if (done.length === 0) return { best: null, worst: null };
  const byPyr = [...done].sort((a, b) => a.pyramid_position - b.pyramid_position || a.season_id - b.season_id);
  return { best: byPyr[0], worst: byPyr[byPyr.length - 1] };
}
