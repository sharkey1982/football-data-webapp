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
import type { RatingRow } from './tennisModel';
import { eventRows, eventSummary, finalLite, type CalendarRow, type EventRow, type EventSummary, type FinalLite, type TennisEdition, type TennisEvent } from './tennisEvents';
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
export const TENNIS_TOURNAMENTS_PATH = '/tennis/tournaments';
export const TENNIS_TV_GUIDE_PATH = '/tennis/tv-guide';
export const TENNIS_H2H_PATH = '/tennis/head-to-head';

const withTour = (path: string, tour: Tour, extra = '') => (tour === 'ATP' && !extra ? path : `${path}?tour=${tourParam(tour)}${extra}`);
export const tennisResultsPath = (tour: Tour = 'ATP', date?: string) => withTour(TENNIS_RESULTS_PATH, tour, date ? `&date=${date}` : '');
export const tennisPlayersPath = (tour: Tour = 'ATP') => withTour(TENNIS_PLAYERS_PATH, tour);
export const tennisSeasonsPath = (tour: Tour = 'ATP') => withTour(TENNIS_SEASONS_PATH, tour);
export const tennisPlayerPath = (tour: Tour, slug: string) => `${TENNIS_PLAYERS_PATH}/${tourParam(tour)}/${slug}`;
export const tennisSeasonPath = (tour: Tour, year: number) => `${TENNIS_SEASONS_PATH}/${tourParam(tour)}/${year}`;
export const tennisTournamentsPath = (tour: Tour = 'ATP') => withTour(TENNIS_TOURNAMENTS_PATH, tour);
export const tennisEventPath = (tour: Tour, slug: string) => `${TENNIS_TOURNAMENTS_PATH}/${tourParam(tour)}/${slug}`;
/** A pair has its own URL (/tennis/head-to-head/atp/sinner-j/alcaraz-c) so a
 * rivalry can be indexed; the bare path with ?a=&b= still works. */
export const tennisH2HPairPath = (tour: Tour, a: string, b: string) => `${TENNIS_H2H_PATH}/${tourParam(tour)}/${a}/${b}`;
/** The canonical form of a pair: slugs in alphabetical order, so a/b and b/a are one page. */
export const tennisH2HCanonicalPath = (tour: Tour, a: string, b: string) => (a <= b ? tennisH2HPairPath(tour, a, b) : tennisH2HPairPath(tour, b, a));
export const tennisH2HPath = (tour: Tour = 'ATP', a?: string, b?: string) => {
  if (a && b) return tennisH2HPairPath(tour, a, b);
  const q = new URLSearchParams();
  if (tour !== 'ATP') q.set('tour', tourParam(tour));
  if (a) q.set('a', a);
  if (b) q.set('b', b);
  const s = q.toString();
  return s ? `${TENNIS_H2H_PATH}?${s}` : TENNIS_H2H_PATH;
};
export const tennisEditionPath = (tour: Tour, slug: string, year: number) => `${tennisEventPath(tour, slug)}/${year}`;

export const MATCH_COLUMNS =
  'source_key,tour,year,match_date,tournament_id,tournament,tournament_slug,location,surface_group,level,level_rank,round,round_order,best_of,' +
  'winner,winner_slug,winner_id,loser,loser_slug,loser_id,w_rank,l_rank,w_games,l_games,result,played,avg_w,avg_l,b365_w,b365_l,ps_w,ps_l';
export const PLAYER_COLUMNS = 'player_id,tour,name,slug,won,lost,titles,finals,first_year,last_year,last_match,recent_matches,country,full_name,birth_date,hand,wikidata_qid';
export const EVENT_COLUMNS = 'event_id,tour,slug,name,city,country,level,level_rank,surface,first_year,last_year,editions';
export const EDITION_COLUMNS = 'tournament_id,year,event_id,event_slug,tour,name,city,start_date,end_date,level,level_rank,surface,matches,winner,winner_slug,runner_up,runner_up_slug';
export const CALENDAR_COLUMNS = 'event_id,tour,slug,name,city,country,level,level_rank,surface,usual_start,usual_end,last_year,last_winner,last_winner_slug,channel,free_to_air';

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
  in(column: string, values: unknown[]): TennisQuery;
  order(column: string, options?: { ascending: boolean }): TennisQuery;
  limit(n: number): TennisQuery;
  range(from: number, to: number): TennisQuery;
};
export type TennisViewName = 'tennis_matches' | 'tennis_players' | 'tennis_events' | 'tennis_editions' | 'tennis_calendar' | 'tennis_ratings' | 'tennis_match_model' | 'tennis_model_record';
export const tennisView = (view: TennisViewName, columns: string): TennisQuery =>
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

export type TennisPlayerData = { player: TennisPlayer; summary: PlayerSummary; matches?: TennisMatch[] };

export function buildTennisPlayer(player: TennisPlayer, matches: TennisMatch[]): TennisPlayerData {
  return { player, summary: playerSummary(player, matches), matches };
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
export type TennisSeasonIndexData = { tour: Tour; rows: SeasonIndexRow[]; finals?: FinalLite[] };
export type TennisSeasonData = { summary: SeasonSummary; years: number[] };

export async function loadTennisSeasonIndex(tour: Tour): Promise<TennisSeasonIndexData> {
  const finals = await pagedMatches((q) => q.eq('tour', tour).eq('round', 'The Final'));
  return buildSeasonIndex(tour, finals);
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

export function buildSeasonIndex(tour: Tour, finals: TennisMatch[]): TennisSeasonIndexData {
  return { tour, rows: seasonIndex(finals), finals: finals.filter((m) => m.result !== 'Not played').map(finalLite) };
}

// ---------------------------------------------------------------------------
// Tournaments (phase 3)
// ---------------------------------------------------------------------------
async function pagedView<T>(view: TennisViewName, columns: string, filter: (q: TennisQuery) => TennisQuery, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filter(tennisView(view, columns)).order(order).range(from, from + 999);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return out;
  }
}

export type TennisTournamentsData = { tour: Tour; rows: EventRow[]; latestYear: number };

export function buildTournaments(tour: Tour, events: TennisEvent[], editions: TennisEdition[]): TennisTournamentsData {
  return { tour, rows: eventRows(events, editions), latestYear: Math.max(0, ...events.map((e) => e.last_year)) };
}

export async function loadTennisTournaments(tour: Tour): Promise<TennisTournamentsData> {
  const [events, editions] = await Promise.all([
    pagedView<TennisEvent>('tennis_events', EVENT_COLUMNS, (q) => q.eq('tour', tour), 'event_id'),
    pagedView<TennisEdition>('tennis_editions', EDITION_COLUMNS, (q) => q.eq('tour', tour), 'tournament_id'),
  ]);
  return buildTournaments(tour, events, editions);
}

export type TennisEventData = { event: TennisEvent; summary: EventSummary };

export async function loadTennisEvent(tour: Tour, slug: string): Promise<TennisEventData | null> {
  const { data, error } = await tennisView('tennis_events', EVENT_COLUMNS).eq('tour', tour).eq('slug', slug).limit(1);
  if (error) throw error;
  const event = ((data ?? []) as TennisEvent[])[0];
  if (!event) return null;
  const editions = await pagedView<TennisEdition>('tennis_editions', EDITION_COLUMNS, (q) => q.eq('event_id', event.event_id), 'year');
  const ids = [...new Set(editions.map((e) => e.tournament_id))];
  const matches = ids.length ? await pagedMatches((q) => q.eq('tour', tour).in('tournament_id', ids)) : [];
  // A tournament name can be used by another event in another year: keep this event's years only.
  const years = new Set(editions.map((e) => `${e.tournament_id}|${e.year}`));
  const own = matches.filter((m) => years.has(`${m.tournament_id}|${m.year}`));
  return { event, summary: eventSummary(editions, own) };
}

export type TennisEditionData = { event: TennisEvent; edition: TennisEdition; matches: TennisMatch[]; years: number[] };

export async function loadTennisEdition(tour: Tour, slug: string, year: number): Promise<TennisEditionData | null> {
  const { data, error } = await tennisView('tennis_events', EVENT_COLUMNS).eq('tour', tour).eq('slug', slug).limit(1);
  if (error) throw error;
  const event = ((data ?? []) as TennisEvent[])[0];
  if (!event) return null;
  const editions = await pagedView<TennisEdition>('tennis_editions', EDITION_COLUMNS, (q) => q.eq('event_id', event.event_id), 'year');
  const edition = editions.find((e) => e.year === year);
  if (!edition) return null;
  const matches = await pagedMatches((q) => q.eq('tournament_id', edition.tournament_id).eq('year', year));
  return { event, edition, matches, years: editions.map((e) => e.year) };
}

// ---------------------------------------------------------------------------
// TV guide (phase 3)
// ---------------------------------------------------------------------------
export type TennisGuideData = { calendar: CalendarRow[]; recent: TennisEdition[]; latestDate: string | null };

export async function loadTennisGuide(today = new Date().toISOString().slice(0, 10)): Promise<TennisGuideData> {
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - 21 * 86400000).toISOString().slice(0, 10);
  const [calendar, recent] = await Promise.all([
    pagedView<CalendarRow>('tennis_calendar', CALENDAR_COLUMNS, (q) => q, 'usual_start'),
    pagedView<TennisEdition>('tennis_editions', EDITION_COLUMNS, (q) => q.gte('start_date', since), 'start_date'),
  ]);
  const latestDate = recent.reduce<string | null>((a, e) => (a == null || e.end_date > a ? e.end_date : a), null);
  return { calendar, recent, latestDate };
}

// ---------------------------------------------------------------------------
// Head to head and the match model (5 Oct 2026)
// ---------------------------------------------------------------------------
export const RATING_COLUMNS = 'player_id,surface,rating,matches,latest_rank,last_match';
export type TennisH2HData = {
  tour: Tour;
  a: TennisPlayer;
  b: TennisPlayer;
  ratingsA: RatingRow[];
  ratingsB: RatingRow[];
  meetings: TennisMatch[];
  /** The model's pre-match chance for the winner of each meeting, by source_key. */
  modelP: Record<string, number>;
};

async function playerBySlug(tour: Tour, slug: string): Promise<TennisPlayer | null> {
  const { data, error } = await tennisView('tennis_players', PLAYER_COLUMNS).eq('tour', tour).eq('slug', slug).limit(1);
  if (error) throw error;
  return ((data ?? []) as TennisPlayer[])[0] ?? null;
}

export async function loadTennisH2H(tour: Tour, slugA: string, slugB: string): Promise<TennisH2HData | null> {
  const [a, b] = await Promise.all([playerBySlug(tour, slugA), playerBySlug(tour, slugB)]);
  if (!a || !b || a.player_id === b.player_id) return null;
  const [ratings, meetings] = await Promise.all([
    pagedView<RatingRow>('tennis_ratings', RATING_COLUMNS, (q) => q.in('player_id', [a.player_id, b.player_id]), 'player_id'),
    pagedMatches((q) => q.eq('tour', tour).or(`and(winner_id.eq.${a.player_id},loser_id.eq.${b.player_id}),and(winner_id.eq.${b.player_id},loser_id.eq.${a.player_id})`)),
  ]);
  const modelP: Record<string, number> = {};
  if (meetings.length) {
    const rows = await pagedView<{ source_key: string; p_winner: number | null }>('tennis_match_model', 'source_key,p_winner', (q) => q.in('source_key', meetings.map((m) => m.source_key)), 'source_key');
    for (const r of rows) if (r.p_winner != null) modelP[r.source_key] = r.p_winner;
  }
  return { tour, a, b, ratingsA: ratings.filter((r) => r.player_id === a.player_id), ratingsB: ratings.filter((r) => r.player_id === b.player_id), meetings, modelP };
}
