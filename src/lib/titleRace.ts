// ============================================================================
// src/lib/titleRace.ts
//
// The title-race summary at the top of a league page (/football/leagues/:league):
// headline counts, most titles, recent champions, highest totals, the spread
// of champions' points, and every champion's points match by match.
//
// Everything except the match-by-match lines is built from the league index
// data the page already has, so it is in the server-rendered HTML. The lines
// come from team_match_snapshot in the browser.
//
// Comparability: the chart and the points spread use only seasons of the
// same length as the latest one (the 42-game Premier League of 1992-95 is
// left out, and says so). Highest totals rank by points per game across
// every complete season, as the Record Book does.
// ============================================================================

import { supabase } from './supabase';
import { seasonDisplay, type LeagueIndexData, type LeagueIndexSeason } from './leagueSeasonApi';

export type TitleCount = { team: string; titles: number; last: string };
export type ChampionRow = { season: string; startYear: number; team: string; points: number; games: number };

export type TitleRaceSummary = {
  seasons: number;
  firstSeason: string;
  lastSeason: string;
  /** Champions with most titles first; ties by most recent. */
  titles: TitleCount[];
  latest: ChampionRow | null;
  /** The season in progress, if any. */
  current: { season: string; startYear: number; leader: string; points: number; played: number | null } | null;
  recent: ChampionRow[];
  /** By points per game, all complete seasons. */
  highest: ChampionRow[];
  /** Season length (games, clubs) for the chart and the spread, and how many seasons that leaves out. */
  games: number;
  clubs: number;
  excluded: { seasons: number; games: number[] };
  /** Champions' final points, comparable seasons only. */
  spread: { points: number[]; mean: number | null; median: number | null };
};

const complete = (s: LeagueIndexSeason) => s.is_final && !s.curtailed && !s.split_format && s.leader != null;

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function buildTitleRace(d: LeagueIndexData): TitleRaceSummary | null {
  const code = d.league.code;
  const seasons = [...d.seasons].sort((a, b) => a.start_year - b.start_year);
  if (!seasons.length) return null;
  const done = seasons.filter(complete);
  if (done.length < 3) return null;
  const row = (s: LeagueIndexSeason): ChampionRow => ({
    season: seasonDisplay(code, s.start_year),
    startYear: s.start_year,
    team: s.leader!.team_name,
    points: s.leader!.points,
    games: s.games_in_season,
  });

  // Titles count every finished season with a winner, split format included.
  const winners = seasons.filter((s) => s.is_final && s.leader);
  const byTeam = new Map<string, { titles: number; last: number }>();
  for (const s of winners) {
    const t = byTeam.get(s.leader!.team_name) ?? { titles: 0, last: 0 };
    t.titles += 1;
    t.last = Math.max(t.last, s.start_year);
    byTeam.set(s.leader!.team_name, t);
  }
  const titles = [...byTeam.entries()]
    .sort((a, b) => b[1].titles - a[1].titles || b[1].last - a[1].last)
    .map(([team, t]) => ({ team, titles: t.titles, last: seasonDisplay(code, t.last) }));

  const inProgress = seasons.filter((s) => !s.is_final && s.leader).pop() ?? null;
  // Season length from the latest finished season (an unfinished season's
  // games_in_season is the games played so far).
  const ref = done[done.length - 1];
  const games = ref.games_in_season;
  const clubs = ref.clubs;
  const comparable = done.filter((s) => s.games_in_season === games && s.clubs === clubs);
  const other = done.filter((s) => !(s.games_in_season === games && s.clubs === clubs));
  const pts = comparable.map((s) => s.leader!.points);

  return {
    seasons: seasons.length,
    firstSeason: seasonDisplay(code, seasons[0].start_year),
    lastSeason: seasonDisplay(code, seasons[seasons.length - 1].start_year),
    titles,
    latest: winners.length ? row(winners[winners.length - 1]) : null,
    current: inProgress
      ? { season: seasonDisplay(code, inProgress.start_year), startYear: inProgress.start_year, leader: inProgress.leader!.team_name, points: inProgress.leader!.points, played: null }
      : null,
    recent: winners.slice(-5).reverse().map(row),
    highest: [...done].sort((a, b) => b.leader!.points / b.games_in_season - a.leader!.points / a.games_in_season || b.start_year - a.start_year).slice(0, 5).map(row),
    games,
    clubs,
    excluded: { seasons: other.length, games: [...new Set(other.map((s) => s.games_in_season))].sort((a, b) => a - b) },
    spread: { points: pts, mean: pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null, median: median(pts) },
  };
}

/** Champions' points in 5-point bins, lowest first; empty bins kept so gaps show. */
export function pointsBins(points: number[], width = 5): { from: number; to: number; count: number }[] {
  if (!points.length) return [];
  const lo = Math.floor(Math.min(...points) / width) * width;
  const hi = Math.floor(Math.max(...points) / width) * width;
  const out: { from: number; to: number; count: number }[] = [];
  for (let b = lo; b <= hi; b += width) out.push({ from: b, to: b + width - 1, count: points.filter((p) => p >= b && p < b + width).length });
  return out;
}

export type ChampionPath = { seasonId: number; startYear: number; season: string; team: string; final: boolean; points: { x: number; y: number }[] };

/** Every comparable champion's points after each match, plus the current leader's so far. */
export async function loadChampionPaths(d: LeagueIndexData, summary: TitleRaceSummary): Promise<ChampionPath[]> {
  const wanted = d.seasons.filter(
    (s) => s.leader && !s.curtailed && !s.split_format && s.clubs === summary.clubs && (!s.is_final || s.games_in_season === summary.games)
  );
  if (!wanted.length) return [];
  // Team ids aren't on the index rows; look them up by slug.
  const slugs = [...new Set(wanted.map((s) => s.leader!.team_slug).filter((x): x is string => !!x))];
  const { data: teams, error: e1 } = await supabase.from('teams').select('team_id, slug').in('slug', slugs);
  if (e1) throw e1;
  const idBySlug = new Map(((teams ?? []) as { team_id: number; slug: string }[]).map((t) => [t.slug, t.team_id]));
  const pairs = wanted
    .map((s) => ({ s, teamId: s.leader!.team_slug ? idBySlug.get(s.leader!.team_slug) : undefined }))
    .filter((p): p is { s: LeagueIndexSeason; teamId: number } => p.teamId != null);
  if (!pairs.length) return [];
  const filter = pairs.map((p) => `and(season_id.eq.${p.s.season_id},team_id.eq.${p.teamId})`).join(',');
  const rows: { season_id: number; team_id: number; matches_played: number; points: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('team_match_snapshot' as never)
      .select('season_id, team_id, matches_played, points')
      .eq('league_id', d.league.league_id)
      .or(filter)
      .order('season_id')
      .order('team_id')
      .order('matches_played')
      .range(from, from + 999);
    if (error) throw error;
    const page = (data ?? []) as unknown as typeof rows;
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return pairs.map(({ s, teamId }) => ({
    seasonId: s.season_id,
    startYear: s.start_year,
    season: seasonDisplay(d.league.code, s.start_year),
    team: s.leader!.team_name,
    final: s.is_final,
    points: rows.filter((r) => r.season_id === s.season_id && r.team_id === teamId).map((r) => ({ x: r.matches_played, y: r.points })),
  }));
}
