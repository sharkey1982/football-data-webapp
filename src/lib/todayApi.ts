// ============================================================================
// src/lib/todayApi.ts
//
// The Today page (/today; Chris approved the mockup on 1 Nov 2026): one page
// for the day's action. The football comes from one read,
// public.get_day_page(p_day) (migration 20261101120000): every game that UK
// day with our model's chance (point-in-time, as the daily market post), the
// betting market's, confirmed UK broadcasters and any reported score, plus
// the next week's game counts and the Premier League team-news facts.
//
// The rules the page shows are pure functions here, so they are tested on
// their own: favourites (market first, our model in brackets where it
// differs by 5+ points), kick-off slots, the biggest model-v-market gap,
// the strongest favourites, results v expectation and the dated opening
// sentence the static build pre-renders. Factual probabilities only: no
// tips, no odds advice.
// ============================================================================

import { supabase } from './supabase';
import { longDate } from './answerFirst';
import type { Probs } from './myHomeApi';

export type DayGame = {
  fixtureId: number;
  slug: string | null;
  leagueId: number;
  league: string;
  /** 'HH:MM' UK time, or null when the kick-off time isn't known. */
  time: string | null;
  status: string;
  homeId: number;
  awayId: number;
  home: string;
  away: string;
  model: Probs | null;
  /** A side's rating is still an estimate (promoted club): left out of the gap. */
  estimated: boolean;
  market: Probs | null;
  tv: string[];
  notTv: boolean;
  hg: number | null;
  ag: number | null;
  /** The result is confirmed (else reported by the fixture feed). */
  confirmed: boolean;
};

export type AheadRow = { date: string; leagueId: number; league: string; games: number };
export type TeamNewsPlayer = { id: number; name: string; team: string; own: number; reason?: string | null; chance?: number };
export type TeamNewsSlot = {
  slot: string;
  ready: boolean;
  games: { home: string; away: string }[];
  notStarting: TeamNewsPlayer[];
  doubtsStarting: TeamNewsPlayer[];
};
export type DayPage = { day: string; games: DayGame[]; ahead: AheadRow[]; teamNews: TeamNewsSlot[] };

// ---- Parsing ----------------------------------------------------------------

type Raw = Record<string, unknown>;
const n = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
function probs(v: unknown): Probs | null {
  const p = v as Raw | null | undefined;
  if (!p) return null;
  const home = n(p.home), draw = n(p.draw), away = n(p.away);
  return home == null || draw == null || away == null ? null : { home, draw, away };
}

export function parseDayPage(raw: unknown): DayPage {
  const r = (raw ?? {}) as Raw;
  const games = ((r.games ?? []) as Raw[]).map((g): DayGame => ({
    fixtureId: Number(g.fixture_id),
    slug: (g.slug as string | null) ?? null,
    leagueId: Number(g.league_id),
    league: String(g.league ?? ''),
    time: typeof g.time === 'string' && g.time ? g.time.slice(0, 5) : null,
    status: String(g.status ?? 'scheduled'),
    homeId: Number(g.home_id),
    awayId: Number(g.away_id),
    home: String(g.home ?? ''),
    away: String(g.away ?? ''),
    model: probs(g.model),
    estimated: Boolean(g.estimated),
    market: probs(g.market),
    tv: Array.isArray(g.tv) ? (g.tv as unknown[]).filter((x): x is string => typeof x === 'string').sort() : [],
    notTv: Boolean(g.not_tv),
    hg: n(g.hg),
    ag: n(g.ag),
    confirmed: Boolean(g.confirmed),
  }));
  const ahead = ((r.ahead ?? []) as Raw[]).map((a) => ({ date: String(a.date), leagueId: Number(a.league_id), league: String(a.league), games: Number(a.games) }));
  const teamNews = ((r.team_news ?? []) as Raw[]).map((s): TeamNewsSlot => {
    const f = (s.facts ?? {}) as Raw;
    const people = (v: unknown) => ((v ?? []) as Raw[]).map((p) => ({
      id: Number(p.id), name: String(p.name), team: String(p.team), own: Number(p.own ?? 0),
      reason: (p.reason as string | null) ?? null, chance: p.chance == null ? undefined : Number(p.chance),
    }));
    return {
      slot: String(s.slot),
      ready: Boolean(f.ready),
      games: ((f.games ?? []) as Raw[]).map((x) => ({ home: String(x.home), away: String(x.away) })),
      notStarting: people(f.not_starting),
      doubtsStarting: people(f.doubts_starting),
    };
  });
  return { day: String(r.day ?? ''), games, ahead, teamNews };
}

export async function getDayPage(day: string): Promise<DayPage> {
  const { data, error } = await supabase.rpc('get_day_page', { p_day: day });
  if (error) throw error;
  return parseDayPage(data);
}

// ---- Competitions ---------------------------------------------------------------

export const PL_ID = 1;

const SHORT: Record<number, string> = {
  1: 'PL', 2: 'Champ', 3: 'L1', 4: 'L2', 5: 'NL', 6: 'Carabao Cup', 7: 'FA Cup', 9: 'Champions League', 10: 'Europa League',
  11: 'Conference League', 13: 'La Liga', 14: 'Bundesliga', 15: 'Serie A', 16: 'Ligue 1', 22: 'SPL',
};
/** The competition as a short badge ("PL", "Champ", "Serie A"). */
export function leagueShort(g: Pick<DayGame, 'leagueId' | 'league'>): string {
  return SHORT[g.leagueId] ?? g.league.replace(/^UEFA /, '');
}

// English football first, then Europe's competitions, then the rest.
const ORDER = [1, 9, 2, 10, 11, 6, 7, 3, 4, 5, 22, 13, 15, 14, 16];
export function leagueRank(leagueId: number): number {
  const i = ORDER.indexOf(leagueId);
  return i < 0 ? ORDER.length + leagueId : i;
}

// ---- Times ---------------------------------------------------------------------

/** The instant of a UK wall-clock date and time ('YYYY-MM-DD', 'HH:MM'). */
export function ukInstant(date: string, time: string): number {
  const guess = Date.parse(`${date}T${time}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  );
  const shown = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  return guess - (shown - guess);
}

/** 'HH:MM' UK time of an instant. */
export function ukTime(iso: string | number | Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

export const hasScore = (g: Pick<DayGame, 'hg' | 'ag'>) => g.hg != null && g.ag != null;

/** Kicked off and no score in yet, within two hours of kick-off. */
export function inPlay(g: DayGame, day: string, now: number): boolean {
  if (!g.time || hasScore(g) || g.status === 'postponed') return false;
  const ko = ukInstant(day, g.time);
  return now >= ko && now <= ko + 120 * 60_000;
}

// ---- Favourites -------------------------------------------------------------------

const pct = (p: number) => `${Math.round(p * 100)}%`;
export { pct as pctOf };

export type Side = 'home' | 'draw' | 'away';
/** The side a forecast favours; 'level' when home and away are within a point. */
export function favourite(p: Probs): { side: 'home' | 'away' | 'level'; p: number } {
  if (Math.abs(p.home - p.away) < 0.01) return { side: 'level', p: Math.max(p.home, p.away) };
  return p.home > p.away ? { side: 'home', p: p.home } : { side: 'away', p: p.away };
}

const teamOf = (g: Pick<DayGame, 'home' | 'away'>, side: 'home' | 'away') => (side === 'home' ? g.home : g.away);

/** "Chelsea 52%", "Level, 36% each". */
function favText(g: Pick<DayGame, 'home' | 'away'>, p: Probs): string {
  const f = favourite(p);
  return f.side === 'level' ? `Level, ${pct(f.p)} each` : `${teamOf(g, f.side)} ${pct(f.p)}`;
}

/** The row's call: the market's favourite, with our model in brackets when it
 *  differs by 5+ points ("Chelsea 52%", "(ours 41%)"), or names its own
 *  favourite when that is the other side ("(ours: Hull 45%)"). Without a
 *  market, our model's favourite alone. */
export function favouriteCall(g: Pick<DayGame, 'home' | 'away' | 'model' | 'market'>): { main: string; ours: string | null; source: 'market' | 'model' | null } {
  if (g.market) {
    const mf = favourite(g.market);
    let ours: string | null = null;
    if (g.model) {
      const of = favourite(g.model);
      if (mf.side !== 'level' && of.side === mf.side) {
        const our = g.model[mf.side];
        if (Math.abs(our - mf.p) >= 0.05) ours = `ours ${pct(our)}`;
      } else if (of.side !== mf.side && of.side !== 'level') {
        ours = `ours: ${teamOf(g, of.side)} ${pct(of.p)}`;
      } else if (of.side === 'level' && mf.side !== 'level') {
        ours = `ours: level, ${pct(of.p)} each`;
      }
    }
    return { main: favText(g, g.market), ours, source: 'market' };
  }
  if (g.model) return { main: favText(g, g.model), ours: null, source: 'model' };
  return { main: '', ours: null, source: null };
}

// ---- Slots ----------------------------------------------------------------------

export const EVENING_FROM = '17:00';

export type Slot = { key: string; label: string; evening: boolean; games: DayGame[] };

/** Kick-off slots: each time before 17:00 on its own, 17:00 on together as
 *  "Evening" (times shown per row), unknown times last. Within a slot the
 *  Premier League and televised games come first. */
export function slotGroups(games: DayGame[], followed: Set<number> = new Set()): Slot[] {
  const prio = (g: DayGame) =>
    (followed.has(g.homeId) || followed.has(g.awayId) ? 0 : 1) * 1000 + (g.tv.length ? 0 : 100) + leagueRank(g.leagueId);
  const map = new Map<string, Slot>();
  for (const g of games) {
    const evening = !!g.time && g.time >= EVENING_FROM;
    const key = !g.time ? 'tbc' : evening ? 'evening' : g.time;
    const slot = map.get(key) ?? { key, label: !g.time ? 'Time to be confirmed' : evening ? 'Evening' : g.time, evening, games: [] };
    slot.games.push(g);
    map.set(key, slot);
  }
  const order = (k: string) => (k === 'tbc' ? '99' : k === 'evening' ? EVENING_FROM : k);
  return [...map.values()]
    .sort((a, b) => order(a.key).localeCompare(order(b.key)))
    .map((s) => ({
      ...s,
      games: s.evening
        ? [...s.games].sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '') || prio(a) - prio(b))
        : [...s.games].sort((a, b) => prio(a) - prio(b) || a.home.localeCompare(b.home)),
    }));
}

export type DayFilter = 'all' | 'tv' | 'pl';
export function applyFilter(games: DayGame[], f: DayFilter): DayGame[] {
  if (f === 'tv') return games.filter((g) => g.tv.length > 0);
  if (f === 'pl') return games.filter((g) => g.leagueId === PL_ID);
  return games;
}

/** "Championship to National League, Scottish Premiership": the
 *  competitions of the rows a collapsed slot hides. */
export function hiddenCompetitions(games: DayGame[]): string {
  const ids = [...new Set(games.map((g) => g.leagueId))].sort((a, b) => leagueRank(a) - leagueRank(b));
  const names = ids.map((id) => games.find((g) => g.leagueId === id)!.league.replace(/^UEFA /, ''));
  const efl = [2, 3, 4, 5].filter((id) => ids.includes(id));
  if (efl.length >= 3 && efl[efl.length - 1] - efl[0] === efl.length - 1) {
    const first = names[ids.indexOf(efl[0])], last = names[ids.indexOf(efl[efl.length - 1])];
    const rest = names.filter((_, i) => !efl.includes(ids[i]));
    return [`${first} to ${last}`, ...rest].join(', ');
  }
  return names.join(', ');
}

/** "11 games · 4 on UK TV", "40 games · no UK TV (3pm blackout)". */
export function slotSummary(slot: Slot, day: string): string {
  const total = slot.games.length;
  const tv = slot.games.filter((g) => g.tv.length > 0).length;
  const games = `${total} game${total === 1 ? '' : 's'}`;
  if (tv === total) return total === 1 ? games : `${games} · all on UK TV`;
  if (tv > 0) return `${games} · ${tv} on UK TV`;
  const saturday = new Date(`${day}T12:00:00Z`).getUTCDay() === 6;
  const blackout = saturday && slot.key >= '14:45' && slot.key <= '17:15' && slot.key !== 'evening';
  return `${games} · no UK TV${blackout ? ' (3pm blackout)' : ''}`;
}

// ---- Worth knowing -----------------------------------------------------------------

export type Gap = { game: DayGame; outcome: Side; model: number; market: number; gap: number };

/** The biggest difference between our model and the market on any outcome
 *  (5+ points), teams with real ratings only -- the rule the daily market
 *  post uses. */
export function biggestGap(games: DayGame[]): Gap | null {
  let best: Gap | null = null;
  for (const g of games) {
    if (!g.model || !g.market || g.estimated) continue;
    for (const outcome of ['home', 'draw', 'away'] as Side[]) {
      const gap = Math.abs(g.model[outcome] - g.market[outcome]);
      if (gap >= 0.05 && (!best || gap > best.gap + 1e-9)) best = { game: g, outcome, model: g.model[outcome], market: g.market[outcome], gap };
    }
  }
  return best;
}

export function outcomeLabel(g: Pick<DayGame, 'home' | 'away'>, o: Side): string {
  return o === 'draw' ? 'Draw' : teamOf(g, o);
}

export type StrongFav = { game: DayGame; team: string; opponent: string; p: number; source: 'market' | 'model' };

/** The day's biggest favourites, market first (our model where there is no
 *  market), games still to be played. */
export function strongestFavourites(games: DayGame[], limit = 3): StrongFav[] {
  return games
    .filter((g) => !hasScore(g) && g.status !== 'postponed' && (g.market || g.model))
    .map((g): StrongFav => {
      const p = (g.market ?? g.model)!;
      const side = p.home >= p.away ? 'home' : 'away';
      return { game: g, team: teamOf(g, side), opponent: teamOf(g, side === 'home' ? 'away' : 'home'), p: p[side], source: g.market ? 'market' : 'model' };
    })
    .sort((a, b) => b.p - a.p || a.team.localeCompare(b.team))
    .slice(0, limit);
}

// ---- Results ------------------------------------------------------------------------

/** The outcome a forecast rated most likely. */
export function expectedOutcome(p: Probs): Side {
  return p.home >= p.draw && p.home >= p.away ? 'home' : p.away >= p.draw ? 'away' : 'draw';
}
export function actualOutcome(g: Pick<DayGame, 'hg' | 'ag'>): Side | null {
  if (g.hg == null || g.ag == null) return null;
  return g.hg > g.ag ? 'home' : g.hg < g.ag ? 'away' : 'draw';
}
/** Whether the market and our model had the result as their most likely outcome. */
export function resultCalls(g: DayGame): { market: boolean | null; model: boolean | null } {
  const a = actualOutcome(g);
  if (!a) return { market: null, model: null };
  return { market: g.market ? expectedOutcome(g.market) === a : null, model: g.model ? expectedOutcome(g.model) === a : null };
}

// ---- The day -------------------------------------------------------------------------

/** A day with no Premier League game: the quiet layout. */
export function isQuietDay(games: DayGame[]): boolean {
  return !games.some((g) => g.leagueId === PL_ID && g.status !== 'postponed');
}

const plural = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;

/** The dated opening sentence (answer first: what the static page says
 *  before anything loads). "Sunday 1 November 2026: 18 football matches
 *  today, 17 on UK TV; Liverpool v Arsenal at 16:30 is the Premier League
 *  game." */
export function daySentence(day: string, games: DayGame[]): string {
  const live = games.filter((g) => g.status !== 'postponed');
  const head = `${longDate(day, true)}:`;
  if (live.length === 0) return `${head} no football matches in the competitions we cover today.`;
  const tv = live.filter((g) => g.tv.length > 0).length;
  const pl = live.filter((g) => g.leagueId === PL_ID).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''));
  let tail: string;
  if (pl.length === 1) tail = `${pl[0].home} v ${pl[0].away}${pl[0].time ? ` at ${pl[0].time}` : ''} is the Premier League game.`;
  else if (pl.length > 1) tail = `${pl.length} Premier League games${pl[0].time ? `, from ${pl[0].time}` : ''}.`;
  else {
    const first = live.filter((g) => g.time).sort((a, b) => a.time!.localeCompare(b.time!))[0];
    tail = `no Premier League game${first ? `; the first kick-off is ${first.time}` : ''}.`;
  }
  return `${head} ${plural(live.length, 'football match', 'football matches')} today, ${tv} on UK TV; ${tail}`;
}

/** "Wednesday: 4 EFL games. Saturday: Premier League gameweek." from the
 *  next week's counts, one line per day (first three days with games). */
export function comingUp(ahead: AheadRow[], limit = 3): { date: string; text: string }[] {
  const byDay = new Map<string, AheadRow[]>();
  for (const a of ahead) byDay.set(a.date, [...(byDay.get(a.date) ?? []), a]);
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, limit).map(([date, rows]) => ({
    date,
    text: rows.sort((a, b) => leagueRank(a.leagueId) - leagueRank(b.leagueId)).map((r) => `${r.league.replace(/^UEFA /, '')} ${r.games}`).join(' · '),
  }));
}
