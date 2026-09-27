// ============================================================================
// src/lib/recordsApi.ts
//
// The Record Book: /football/records and /football/records/:league.
// Team-season records (points, goals, champions, relegated clubs) are ranked
// by PER-GAME rates, because season lengths differ (42 games in the 22-club
// Premier League of 1992-95, 38 since). Match records and streaks come from
// history_record_matches() and history_record_streaks().
//
// Complete seasons only for team-season records: not curtailed, not split
// format (split leagues halve or regroup points). Pure builders, shared by
// the browser loader and the static generator.
// ============================================================================

import { supabase } from './supabase';
import {
  isEnglish,
  leagueBySlug,
  leagueSeasonPath,
  leagueSummaries,
  seasonDisplay,
  teamNames,
  TABLE_COLUMNS,
  type LeagueRef,
  type RawTableRow,
  type SeasonSummary,
} from './leagueSeasonApi';
import { clubSeasonPath } from './clubSeasonApi';

export type RecordRow = {
  rank: number;
  tied: boolean;
  team: string | null;
  teamPath: string | null;
  value: string;
  detail: string;
  season: string;
  seasonPath: string | null;
  flag?: string;
};

export type RecordList = { id: string; title: string; note?: string; rows: RecordRow[] };

export type RecordsData = { league: LeagueRef; firstYear: number; lists: RecordList[]; headline: string };

export type StreakRow = {
  streak_type: string; rank: number; team_id: number; length: number; start_date: string; end_date: string;
  start_season_id: number; end_season_id: number; ongoing: boolean; truncated_start: boolean;
};

export type MatchRecordRow = {
  record: 'biggest_win' | 'highest_scoring'; rank: number; match_id: number; season_id: number; start_year: number;
  match_date: string; home_team_id: number; away_team_id: number; home_goals: number; away_goals: number;
};

export const STREAK_TITLES: [string, string][] = [
  ['won', 'Most league wins in a row'],
  ['unbeaten', 'Longest unbeaten runs'],
  ['scored', 'Longest runs scoring in every match'],
  ['clean_sheet', 'Most clean sheets in a row'],
  ['winless', 'Longest runs without a win'],
  ['lost', 'Most defeats in a row'],
  ['no_goal', 'Longest runs without scoring'],
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
const dayMonthYear = (iso: string) => `${Number(iso.slice(8, 10))} ${monthYear(iso)}`;

type TeamMap = Map<number, { name: string; slug: string | null }>;

/** Competition ranking (1, 2, 2, 4) on a numeric key, highest first unless asc. */
function ranked<T>(items: T[], key: (t: T) => number, asc = false, limit = 10): { item: T; rank: number; tied: boolean }[] {
  const sorted = [...items].sort((a, b) => (asc ? key(a) - key(b) : key(b) - key(a)));
  const round = (v: number) => Math.round(v * 10000);
  const out: { item: T; rank: number; tied: boolean }[] = [];
  sorted.forEach((item, i) => {
    const rank = i > 0 && round(key(sorted[i - 1])) === round(key(item)) ? out[i - 1].rank : i + 1;
    out.push({ item, rank, tied: false });
  });
  for (const r of out) r.tied = out.filter((o) => o.rank === r.rank).length > 1;
  return out.slice(0, limit);
}

export function buildRecords(input: {
  league: LeagueRef;
  summaries: SeasonSummary[];
  tables: RawTableRow[];
  streaks: StreakRow[];
  matches: MatchRecordRow[];
  teams: TeamMap;
}): RecordsData {
  const { league, summaries, teams } = input;
  const english = isEnglish(league);
  const startBySeason = new Map(summaries.map((s) => [s.season_id, s.start_year]));
  const complete = new Set(summaries.filter((s) => s.is_final && !s.curtailed && !s.split_format).map((s) => s.season_id));
  const name = (id: number) => teams.get(id)?.name ?? 'Unknown';
  const when = (seasonId: number) => {
    const y = startBySeason.get(seasonId);
    return y == null ? '' : seasonDisplay(league.code, y);
  };
  const seasonLink = (seasonId: number) => {
    const y = startBySeason.get(seasonId);
    return y == null ? null : leagueSeasonPath(league, y);
  };
  const teamSeasonLink = (teamId: number, seasonId: number) => {
    const slug = teams.get(teamId)?.slug;
    const y = startBySeason.get(seasonId);
    if (!slug) return null;
    return english && y != null ? clubSeasonPath(slug, league.code, y) : `/football/teams/${slug}`;
  };
  const teamLink = (teamId: number) => {
    const slug = teams.get(teamId)?.slug;
    return slug ? `/football/teams/${slug}` : null;
  };

  const rows = input.tables.filter((r) => complete.has(r.season_id) && r.played > 0);
  const ppg = (r: RawTableRow) => r.points / r.played;
  const perGame = (v: number, n: number) => (v / n).toFixed(2);
  const teamSeasonRow = (r: RawTableRow, rank: number, tied: boolean, value: string, detail: string): RecordRow => ({
    rank, tied, team: name(r.team_id), teamPath: teamSeasonLink(r.team_id, r.season_id), value, detail,
    season: when(r.season_id), seasonPath: seasonLink(r.season_id),
  });
  const pointsList = (id: string, title: string, list: RawTableRow[], asc: boolean, note?: string): RecordList => ({
    id, title, note,
    rows: ranked(list, ppg, asc).map(({ item: r, rank, tied }) =>
      teamSeasonRow(r, rank, tied, `${r.points} pts`, `${r.played} games · ${perGame(r.points, r.played)} per game${r.deduction > 0 ? ` · after a ${r.deduction}-point deduction` : ''}`)
    ),
  });

  const lists: RecordList[] = [];
  const perGameNote = 'Ranked by points per game, as season lengths differ.';
  lists.push(pointsList('most_points', 'Most points in a season', rows, false, perGameNote));
  lists.push(pointsList('fewest_points', 'Fewest points in a season', rows, true, perGameNote));
  lists.push({
    id: 'most_goals', title: 'Most goals scored in a season', note: 'Ranked by goals per game.',
    rows: ranked(rows, (r) => r.goals_for / r.played).map(({ item: r, rank, tied }) =>
      teamSeasonRow(r, rank, tied, `${r.goals_for} goals`, `${r.played} games · ${perGame(r.goals_for, r.played)} per game`)
    ),
  });
  lists.push({
    id: 'fewest_conceded', title: 'Fewest goals conceded in a season', note: 'Ranked by goals conceded per game.',
    rows: ranked(rows, (r) => r.goals_against / r.played, true).map(({ item: r, rank, tied }) =>
      teamSeasonRow(r, rank, tied, `${r.goals_against} conceded`, `${r.played} games · ${perGame(r.goals_against, r.played)} per game`)
    ),
  });
  const champions = rows.filter((r) => r.position === 1);
  lists.push(pointsList('champions_fewest', 'Champions with the fewest points', champions, true, perGameNote));
  if (english) lists.push(pointsList('relegated_most', 'Most points by a relegated club', rows.filter((r) => r.relegated === true), false, perGameNote));
  const runnersUp = new Map(rows.filter((r) => r.position === 2).map((r) => [r.season_id, r]));
  const margins = champions.filter((c) => runnersUp.has(c.season_id)).map((c) => ({ c, gap: c.points - runnersUp.get(c.season_id)!.points, second: runnersUp.get(c.season_id)! }));
  lists.push({
    id: 'title_margin', title: 'Biggest title-winning margins',
    rows: ranked(margins, (m) => m.gap).map(({ item: m, rank, tied }) =>
      teamSeasonRow(m.c, rank, tied, `${m.gap} pts`, `${m.c.points} to ${name(m.second.team_id)}’s ${m.second.points}`)
    ),
  });

  const matchList = (id: MatchRecordRow['record'], title: string): RecordList => ({
    id, title,
    rows: input.matches.filter((m) => m.record === id).map((m) => {
      const ties = input.matches.filter((o) => o.record === id && o.rank === m.rank).length > 1;
      return {
        rank: m.rank, tied: ties, team: null, teamPath: null,
        value: `${name(m.home_team_id)} ${m.home_goals}–${m.away_goals} ${name(m.away_team_id)}`,
        detail: dayMonthYear(m.match_date),
        season: seasonDisplay(league.code, m.start_year), seasonPath: leagueSeasonPath(league, m.start_year),
      };
    }),
  });
  lists.push(matchList('biggest_win', 'Biggest wins'));
  lists.push(matchList('highest_scoring', 'Highest-scoring matches'));

  for (const [type, title] of STREAK_TITLES) {
    const s = input.streaks.filter((x) => x.streak_type === type);
    if (!s.length) continue;
    lists.push({
      id: `streak_${type}`, title,
      rows: s.map((x) => {
        const from = when(x.start_season_id);
        const to = when(x.end_season_id);
        return {
          rank: x.rank, tied: s.filter((o) => o.rank === x.rank).length > 1, team: name(x.team_id), teamPath: teamLink(x.team_id),
          value: `${x.length} matches`, detail: `${monthYear(x.start_date)} – ${monthYear(x.end_date)}`,
          season: from === to ? from : `${from} to ${to}`, seasonPath: seasonLink(x.start_season_id),
          flag: x.ongoing ? 'ongoing' : x.truncated_start ? 'from the start of our data; may be longer' : undefined,
        };
      }),
    });
  }

  const firstYear = Math.min(...summaries.map((s) => s.start_year));
  return { league, firstYear, lists, headline: recordsHeadline(league, firstYear, lists) };
}

/** Plain-string summary for the page opening and meta description. */
export function recordsHeadline(league: LeagueRef, firstYear: number, lists: RecordList[]): string {
  const top = (id: string) => lists.find((l) => l.id === id)?.rows[0];
  const parts: string[] = [];
  const pts = top('most_points');
  if (pts) parts.push(`the best season by points per game is ${pts.team}’s ${pts.value.replace(' pts', ' points')} in ${pts.season}`);
  const unbeaten = top('streak_unbeaten');
  if (unbeaten) parts.push(`the longest unbeaten run is ${unbeaten.team}’s ${unbeaten.value} (${unbeaten.detail})`);
  const win = top('biggest_win');
  if (win) parts.push(`the biggest win is ${win.value} (${win.season})`);
  if (!parts.length) return '';
  const s = `${league.name} records since ${seasonDisplay(league.code, firstYear)}: ${parts.join('; ')}.`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function loadRecords(leagueSlug: string): Promise<RecordsData | null> {
  const league = await leagueBySlug(leagueSlug);
  if (!league) return null;
  const [summaries, tablesRes, streaksRes, matchesRes] = await Promise.all([
    leagueSummaries(league.league_id),
    supabase.from('team_season_summary' as never).select(TABLE_COLUMNS).eq('league_id', league.league_id).limit(3000),
    supabase.rpc('history_record_streaks' as never, { p_league_id: league.league_id, p_limit: 10 } as never),
    supabase.rpc('history_record_matches' as never, { p_league_id: league.league_id, p_limit: 10 } as never),
  ]);
  if (tablesRes.error) throw tablesRes.error;
  if (streaksRes.error) throw streaksRes.error;
  if (matchesRes.error) throw matchesRes.error;
  const tables = (tablesRes.data ?? []) as unknown as RawTableRow[];
  const streaks = (streaksRes.data ?? []) as unknown as StreakRow[];
  const matches = (matchesRes.data ?? []) as unknown as MatchRecordRow[];
  const ids = [...tables.map((t) => t.team_id), ...streaks.map((s) => s.team_id), ...matches.flatMap((m) => [m.home_team_id, m.away_team_id])];
  const teams = await teamNames(ids);
  return buildRecords({ league, summaries, tables, streaks, matches, teams });
}

export function recordsPath(league: Pick<LeagueRef, 'slug'>): string {
  return `/football/records/${league.slug}`;
}
