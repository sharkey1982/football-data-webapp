// ============================================================================
// src/lib/tennisApi.ts
//
// Tennis section (phase 2, Oct 2026): routes and loaders. Reads
// public.tennis_matches and public.tennis_players, which sit over the tennis
// schema loaded from tennis-data.co.uk (scripts/tennis_import.py; ATP from
// 2000, WTA from 2007, tour-level main draws, results only).
//
// Player slugs are unique within a tour only, so detail pages carry the tour
// in the path: /tennis/players/atp/sinner-j, /tennis/seasons/wta/2024. List
// pages take ?tour=wta (ATP when absent).
// ============================================================================

import { supabase } from './supabase';
import {
  FIRST_YEAR,
  playerSummary,
  seasonIndex,
  seasonSummary,
  tourParam,
  type PlayerSummary,
  type SeasonIndexRow,
  type SeasonSummary,
  type TennisMatch,
  type TennisPlayer,
  type Tour,
} from './tennisStats';

export const TENNIS_HUB_PATH = '/tennis';
export const TENNIS_DISCOVER_PATH = '/tennis/discover';
export const TENNIS_RESULTS_PATH = '/tennis/results';
export const TENNIS_PLAYERS_PATH = '/tennis/players';
export const TENNIS_SEASONS_PATH = '/tennis/seasons';

const withTour = (path: string, tour: Tour, extra = '') => (tour === 'ATP' && !extra ? path : `${path}?tour=${tourParam(tour)}${extra}`);
export const tennisResultsPath = (tour: Tour = 'ATP', date?: string) => withTour(TENNIS_RESULTS_PATH, tour, date ? `&date=${date}` : '');
export const tennisPlayersPath = (tour: Tour = 'ATP') => withTour(TENNIS_PLAYERS_PATH, tour);
export const tennisSeasonsPath = (tour: Tour = 'ATP') => withTour(TENNIS_SEASONS_PATH, tour);
export const tennisPlayerPath = (tour: Tour, slug: string) => `${TENNIS_PLAYERS_PATH}/${tourParam(tour)}/${slug}`;
export const tennisSeasonPath = (tour: Tour, year: number) => `${TENNIS_SEASONS_PATH}/${tourParam(tour)}/${year}`;

export const MATCH_COLUMNS =
  'source_key,tour,year,match_date,tournament,tournament_slug,location,surface_group,level,level_rank,round,round_order,best_of,' +
  'winner,winner_slug,winner_id,loser,loser_slug,loser_id,w_rank,l_rank,w_games,l_games,result,played,avg_w,avg_l,b365_w,b365_l,ps_w,ps_l';
export const PLAYER_COLUMNS = 'player_id,tour,name,slug,won,lost,titles,finals,first_year,last_year,last_match,recent_matches';

/** Every year with data for a tour, newest first. */
export function tennisYears(tour: Tour, latest: number): number[] {
  const out: number[] = [];
  for (let y = latest; y >= FIRST_YEAR[tour]; y--) out.push(y);
  return out;
}

/** The tennis views aren't in the generated database types; a loose query shape keeps the calls readable. */
export type TennisQuery = PromiseLike<{ data: unknown[] | null; error: unknown }> & {
  eq(column: string, value: unknown): TennisQuery;
  gte(column: string, value: unknown): TennisQuery;
  lte(column: string, value: unknown): TennisQuery;
  or(filter: string): TennisQuery;
  order(column: string, options?: { ascending: boolean }): TennisQuery;
  limit(n: number): TennisQuery;
  range(from: number, to: number): TennisQuery;
};
export const tennisView = (view: 'tennis_matches' | 'tennis_players', columns: string): TennisQuery =>
  (supabase.from(view as never) as unknown as { select(columns: string): TennisQuery }).select(columns);

async function pagedMatches(filter: (q: TennisQuery) => TennisQuery): Promise<TennisMatch[]> {
  const out: TennisMatch[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(tennisView('tennis_matches', MATCH_COLUMNS)).order('match_date').order('source_key').range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as TennisMatch[]));
    if ((data ?? []).length < 1000) return out;
  }
}

export async function loadLatestTennisDate(tour: Tour): Promise<string | null> {
  const { data, error } = await tennisView('tennis_matches', 'match_date').eq('tour', tour).order('match_date', { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? []) as { match_date: string }[])[0]?.match_date ?? null;
}

// ---------------------------------------------------------------------------
// Results: two calendar months at a time
// ---------------------------------------------------------------------------
export type TennisResultsData = { tour: Tour; latestDate: string; from: string; to: string; matches: TennisMatch[] };

/** First day of the month before `date`'s month, and last day of `date`'s month: the two months the calendar shows. */
export function resultsWindow(year: number, month: number): { from: string; to: string } {
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 2, 0));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function loadTennisResults(tour: Tour, viewYear: number | null, viewMonth: number | null): Promise<TennisResultsData | null> {
  const latestDate = await loadLatestTennisDate(tour);
  if (!latestDate) return null;
  const ly = Number(latestDate.slice(0, 4));
  const lm = Number(latestDate.slice(5, 7)) - 1;
  const y = viewYear ?? (lm === 0 ? ly - 1 : ly);
  const m = viewMonth ?? (lm === 0 ? 11 : lm - 1);
  const { from, to } = resultsWindow(y, m);
  const matches = await pagedMatches((q) => q.eq('tour', tour).gte('match_date', from).lte('match_date', to));
  return { tour, latestDate, from, to, matches };
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------
export type TennisPlayersData = { tour: Tour; players: TennisPlayer[] };

export async function loadTennisPlayers(tour: Tour): Promise<TennisPlayersData> {
  const players: TennisPlayer[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await tennisView('tennis_players', PLAYER_COLUMNS).eq('tour', tour).order('player_id').range(from, from + 999);
    if (error) throw error;
    players.push(...((data ?? []) as TennisPlayer[]));
    if ((data ?? []).length < 1000) break;
  }
  return { tour, players };
}

export type TennisPlayerData = { player: TennisPlayer; summary: PlayerSummary };

export function buildTennisPlayer(player: TennisPlayer, matches: TennisMatch[]): TennisPlayerData {
  return { player, summary: playerSummary(player, matches) };
}

export async function loadTennisPlayer(tour: Tour, slug: string): Promise<TennisPlayerData | null> {
  const { data, error } = await tennisView('tennis_players', PLAYER_COLUMNS).eq('tour', tour).eq('slug', slug).limit(1);
  if (error) throw error;
  const player = ((data ?? []) as TennisPlayer[])[0];
  if (!player) return null;
  const matches = await pagedMatches((q) => q.eq('tour', tour).or(`winner_id.eq.${player.player_id},loser_id.eq.${player.player_id}`));
  return buildTennisPlayer(player, matches);
}

// ---------------------------------------------------------------------------
// Past seasons
// ---------------------------------------------------------------------------
export type TennisSeasonIndexData = { tour: Tour; rows: SeasonIndexRow[] };
export type TennisSeasonData = { summary: SeasonSummary; years: number[] };

export async function loadTennisSeasonIndex(tour: Tour): Promise<TennisSeasonIndexData> {
  const finals = await pagedMatches((q) => q.eq('tour', tour).eq('round', 'The Final'));
  return { tour, rows: seasonIndex(finals) };
}

export async function loadTennisSeason(tour: Tour, year: number): Promise<TennisSeasonData | null> {
  const latest = await loadLatestTennisDate(tour);
  if (!latest) return null;
  const years = tennisYears(tour, Number(latest.slice(0, 4)));
  if (!years.includes(year)) return null;
  const matches = await pagedMatches((q) => q.eq('tour', tour).eq('year', year));
  if (matches.length === 0) return null;
  return { summary: seasonSummary(tour, year, matches), years };
}
