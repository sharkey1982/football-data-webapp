// ============================================================================
// src/lib/tennisEvents.ts
//
// Tennis phase 3 (Oct 2026): pure builders for tournaments, draws, paths to
// the final, the TV guide, player form grids and the timelapse races. No
// fetching -- the same functions run in the browser and in the static
// generator. Data: public.tennis_events / tennis_editions / tennis_calendar
// (migration 20261005090000) and tennis_matches. Tested in
// src/__tests__/tennisPhase3.test.tsx.
// ============================================================================

import { byPlayOrder, FIRST_YEAR, isUpset, odds, pct, scoreLabel, type Level, type TennisMatch, type Tour } from './tennisStats';

export type TennisEvent = {
  event_id: number;
  tour: Tour;
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  level: Level | null;
  level_rank: number;
  surface: string | null;
  first_year: number;
  last_year: number;
  editions: number;
};

export type TennisEdition = {
  tournament_id: number;
  year: number;
  event_id: number;
  event_slug: string;
  tour: Tour;
  name: string;
  city: string | null;
  start_date: string;
  end_date: string;
  level: Level | null;
  level_rank: number;
  surface: string | null;
  matches: number;
  winner: string | null;
  winner_slug: string | null;
  runner_up: string | null;
  runner_up_slug: string | null;
};

export type CalendarRow = {
  event_id: number;
  tour: Tour;
  slug: string;
  name: string;
  city: string | null;
  country: string | null;
  level: Level | null;
  level_rank: number;
  surface: string | null;
  usual_start: string;
  usual_end: string;
  last_year: number;
  last_winner: string | null;
  last_winner_slug: string | null;
  channel: string | null;
  free_to_air: string | null;
};

export const SLAMS = ['Australian Open', 'French Open', 'Wimbledon', 'US Open'] as const;
export const SLAM_SHORT: Record<string, string> = { 'Australian Open': 'AO', 'French Open': 'RG', Wimbledon: 'W', 'US Open': 'USO' };
export const SURFACES = ['Hard', 'Clay', 'Grass', 'Carpet'] as const;

// ---------------------------------------------------------------------------
// Countries (ISO 3166-1 alpha-2 from Wikidata / tennis.venues)
// ---------------------------------------------------------------------------
let regionNames: Intl.DisplayNames | null = null;
export function countryName(code: string | null | undefined): string {
  if (!code) return '';
  try {
    regionNames ??= new Intl.DisplayNames(['en-GB'], { type: 'region' });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
/** Regional-indicator flag ("GB" -> 🇬🇧). Decorative: always shown with the name or code. */
export function flag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Whole years between two ISO dates. */
export function ageOn(birth: string, on: string): number {
  const [by, bm, bd] = birth.split('-').map(Number);
  const [y, m, d] = on.split('-').map(Number);
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

/** Countries with how many of the given rows each has, most first. */
export function countryCounts<T extends { country?: string | null }>(rows: T[]): { code: string; name: string; n: number }[] {
  const c = new Map<string, number>();
  for (const r of rows) if (r.country) c.set(r.country, (c.get(r.country) ?? 0) + 1);
  return [...c.entries()].map(([code, n]) => ({ code, name: countryName(code), n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------
// Tournaments list and event page
// ---------------------------------------------------------------------------
export type Champion = { name: string; slug: string; titles: number; finals: number; years: number[] };
export type EventRow = TennisEvent & { latest: TennisEdition | null; top: Champion | null };

/** Most titles at an event (finals as tie-break), from its editions. */
export function championsOf(editions: TennisEdition[]): Champion[] {
  const map = new Map<string, Champion>();
  for (const e of editions) {
    for (const [name, slug, won] of [[e.winner, e.winner_slug, true], [e.runner_up, e.runner_up_slug, false]] as const) {
      if (!name || !slug) continue;
      const c = map.get(slug) ?? { name, slug, titles: 0, finals: 0, years: [] };
      c.finals++;
      if (won) {
        c.titles++;
        c.years.push(e.year);
      }
      map.set(slug, c);
    }
  }
  for (const c of map.values()) c.years.sort((a, b) => a - b);
  return [...map.values()].filter((c) => c.titles > 0).sort((a, b) => b.titles - a.titles || b.finals - a.finals || a.name.localeCompare(b.name));
}

export function eventRows(events: TennisEvent[], editions: TennisEdition[]): EventRow[] {
  const byEvent = new Map<number, TennisEdition[]>();
  for (const e of editions) byEvent.set(e.event_id, [...(byEvent.get(e.event_id) ?? []), e]);
  return events.map((ev) => {
    const eds = (byEvent.get(ev.event_id) ?? []).sort((a, b) => b.year - a.year);
    return { ...ev, latest: eds.find((e) => e.winner) ?? null, top: championsOf(eds)[0] ?? null };
  });
}

export function matchesSearch(row: Pick<TennisEvent, 'name' | 'city'> & { country?: string | null }, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [row.name, row.city ?? '', countryName(row.country)].some((v) => v.toLowerCase().includes(s));
}

export type EventSummary = {
  champions: Champion[];
  editions: TennisEdition[];
  /** Longest run of consecutive match wins at this event, across editions. */
  bestRun: { name: string; slug: string; wins: number; from: number; to: number } | null;
};

export function eventSummary(editions: TennisEdition[], matches: TennisMatch[] = []): EventSummary {
  const eds = [...editions].sort((a, b) => b.year - a.year);
  const runs = new Map<number, { name: string; slug: string; cur: number; start: number; best: EventSummary['bestRun'] }>();
  for (const m of [...matches].sort(byPlayOrder)) {
    if (!m.played) continue;
    const w = runs.get(m.winner_id) ?? { name: m.winner, slug: m.winner_slug, cur: 0, start: m.year, best: null };
    if (w.cur === 0) w.start = m.year;
    w.cur++;
    if (!w.best || w.cur > w.best.wins) w.best = { name: w.name, slug: w.slug, wins: w.cur, from: w.start, to: m.year };
    runs.set(m.winner_id, w);
    const l = runs.get(m.loser_id);
    if (l) l.cur = 0;
  }
  const bestRun = [...runs.values()].map((r) => r.best).filter((b): b is NonNullable<EventSummary['bestRun']> => b != null).sort((a, b) => b.wins - a.wins || a.from - b.from)[0] ?? null;
  return { champions: championsOf(eds), editions: eds, bestRun };
}

export function eventSentence(ev: TennisEvent, s: EventSummary): string {
  const top = s.champions[0];
  const where = [ev.city, countryName(ev.country)].filter(Boolean).join(', ');
  const span = ev.first_year === ev.last_year ? `in ${ev.first_year}` : `${ev.editions} times from ${ev.first_year} to ${ev.last_year}`;
  const lead = `${ev.name}${where ? ` (${where})` : ''}: played ${span} in this data`;
  return top ? `${lead}. Most titles: ${top.name} (${top.titles}).` : `${lead}.`;
}

// ---------------------------------------------------------------------------
// The draw, rebuilt from results
// ---------------------------------------------------------------------------
export type DrawSlot = TennisMatch | null;
export type Draw = {
  /** Round names, earliest shown first, ending with "The Final". */
  rounds: string[];
  /** One array per round; slot i of round r feeds slot i/2 of round r+1. */
  slots: DrawSlot[][];
  /** Shown slots with no match found (byes, missing rows). */
  gaps: number;
  /** Earlier rounds, listed under the bracket. */
  earlier: { round: string; matches: TennisMatch[] }[];
  roundRobin: TennisMatch[];
};

const KO = (m: TennisMatch) => m.round !== 'Round Robin' && m.round !== 'Third Place';

/**
 * Builds the bracket back from the final: a match's feeders are the matches
 * in the previous round won by either of its two players. `depth` is the
 * number of rounds shown (4 = last 16).
 */
export function buildDraw(matches: TennisMatch[], depth: number): Draw | null {
  const ko = matches.filter(KO);
  const final = ko.find((m) => m.round === 'The Final');
  const roundRobin = matches.filter((m) => m.round === 'Round Robin').sort(byPlayOrder);
  if (!final) return null;
  const order = [...new Set(ko.map((m) => m.round_order))].sort((a, b) => b - a); // final first
  const nameOf = new Map(ko.map((m) => [m.round_order, m.round]));
  const shown = order.slice(0, depth).reverse(); // earliest shown first
  const byRound = new Map<number, TennisMatch[]>();
  for (const m of ko) byRound.set(m.round_order, [...(byRound.get(m.round_order) ?? []), m]);

  const levels: DrawSlot[][] = [[final]];
  for (let r = 1; r < shown.length; r++) {
    const above = levels[r - 1];
    const ro = shown[shown.length - 1 - r];
    const pool = byRound.get(ro) ?? [];
    const next: DrawSlot[] = [];
    for (const m of above) {
      if (!m) {
        next.push(null, null);
        continue;
      }
      // Top half feeds the player listed first in the bracket box (the winner when known).
      const feed = (id: number) => pool.find((x) => x.winner_id === id) ?? null;
      const a = feed(m.winner_id);
      const b = feed(m.loser_id);
      next.push(a, b);
    }
    levels.push(next);
  }
  let slots = levels.reverse();
  // Drop leading rounds with no match found at all (a smaller draw than the depth asked for).
  while (slots.length > 1 && slots[0].every((x) => x == null)) {
    slots = slots.slice(1);
    shown.shift();
  }
  const gaps = slots.slice(0, -1).flat().filter((s) => s == null).length;
  // Earlier rounds, latest first (order is final-first already).
  const earlier = order
    .filter((ro) => ro < shown[0])
    .map((ro) => ({ round: nameOf.get(ro)!, matches: [...(byRound.get(ro) ?? [])].sort((a, b) => a.match_date.localeCompare(b.match_date) || a.winner.localeCompare(b.winner)) }));
  return { rounds: shown.map((ro) => nameOf.get(ro)!), slots, gaps, earlier, roundRobin };
}

/** Rounds shown in the bracket: last 16 for Grand Slams, Tour Finals and 1000s, else last 8. */
export const drawDepth = (levelRank: number) => (levelRank <= 3 ? 4 : 3);

// ---------------------------------------------------------------------------
// Path to the final
// ---------------------------------------------------------------------------
export type PathStep = { match: TennisMatch; opponent: string; opponentSlug: string; opponentRank: number | null; won: boolean; odds: number | null };
export type FinalPath = { name: string; slug: string; champion: boolean; steps: PathStep[]; avgOpponentRank: number | null; topOpponents: number };

export function pathOf(matches: TennisMatch[], playerId: number): FinalPath | null {
  const mine = matches.filter((m) => m.winner_id === playerId || m.loser_id === playerId).sort((a, b) => a.round_order - b.round_order || a.match_date.localeCompare(b.match_date));
  if (!mine.length) return null;
  const first = mine[0];
  const name = first.winner_id === playerId ? first.winner : first.loser;
  const slug = first.winner_id === playerId ? first.winner_slug : first.loser_slug;
  const steps = mine.map((m) => {
    const won = m.winner_id === playerId;
    const o = odds(m);
    return { match: m, won, opponent: won ? m.loser : m.winner, opponentSlug: won ? m.loser_slug : m.winner_slug, opponentRank: won ? m.l_rank : m.w_rank, odds: o ? (won ? o.w : o.l) : null };
  });
  const ranks = steps.filter((s) => s.match.played && s.opponentRank != null && s.opponentRank > 0).map((s) => s.opponentRank!);
  return {
    name,
    slug,
    champion: mine.some((m) => m.round === 'The Final' && m.winner_id === playerId && m.result !== 'Not played'),
    steps,
    avgOpponentRank: ranks.length ? Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length) : null,
    topOpponents: ranks.filter((r) => r <= 32).length,
  };
}

/** Both finalists' routes, champion first. */
export function finalPaths(matches: TennisMatch[]): FinalPath[] {
  const final = matches.find((m) => m.round === 'The Final');
  if (!final) return [];
  return [pathOf(matches, final.winner_id), pathOf(matches, final.loser_id)].filter((p): p is FinalPath => p != null);
}

export function upsetCount(matches: TennisMatch[]): number {
  return matches.filter((m) => isUpset(m)).length;
}

// ---------------------------------------------------------------------------
// TV guide
// ---------------------------------------------------------------------------
export type GuideGroups = { underWay: TennisEdition[]; thisWeek: CalendarRow[]; nextWeek: CalendarRow[]; later: CalendarRow[] };

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** Monday of the week containing `iso`. */
export function weekStart(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return addDays(iso, -((d.getUTCDay() + 6) % 7));
}

/**
 * underWay: editions in the data whose results are recent and whose final
 * isn't in yet. Calendar rows: by the week they usually start (this week,
 * next week, the six weeks after), leaving out events already under way.
 */
export function guideGroups(calendar: CalendarRow[], recent: TennisEdition[], today: string): GuideGroups {
  // No final yet and started in the last three weeks (results can lag a few days).
  const underWay = recent.filter((e) => !e.winner && e.start_date >= addDays(today, -21)).sort((a, b) => a.level_rank - b.level_rank || a.name.localeCompare(b.name));
  const busy = new Set(underWay.map((e) => e.event_id));
  const mon = weekStart(today);
  const rows = calendar.filter((c) => !busy.has(c.event_id)).sort((a, b) => a.usual_start.localeCompare(b.usual_start) || a.level_rank - b.level_rank || a.name.localeCompare(b.name));
  const inRange = (c: CalendarRow, from: string, to: string) => c.usual_start >= from && c.usual_start <= to;
  return {
    underWay,
    thisWeek: rows.filter((c) => inRange(c, mon, addDays(mon, 6)) || (c.usual_start < mon && c.usual_end >= today)),
    nextWeek: rows.filter((c) => inRange(c, addDays(mon, 7), addDays(mon, 13))),
    later: rows.filter((c) => inRange(c, addDays(mon, 14), addDays(mon, 55))),
  };
}

// ---------------------------------------------------------------------------
// Player form: Grand Slam grid and surface grid
// ---------------------------------------------------------------------------
export const ROUND_SHORT: Record<string, string> = {
  '1st Round': 'R1', '2nd Round': 'R2', '3rd Round': 'R3', '4th Round': 'R4', 'Round Robin': 'RR',
  Quarterfinals: 'QF', Semifinals: 'SF', 'Third Place': 'SF', 'The Final': 'F',
};
export type SlamCell = { reached: string; depth: number; won: number; lost: number; champion: boolean };
export type SlamGrid = { years: number[]; cells: Record<number, Partial<Record<string, SlamCell>>>; totals: Record<string, { won: number; lost: number; titles: number; best: string | null }> };

export function slamGrid(matches: TennisMatch[], playerId: number): SlamGrid {
  const cells: SlamGrid['cells'] = {};
  const totals: SlamGrid['totals'] = Object.fromEntries(SLAMS.map((s) => [s, { won: 0, lost: 0, titles: 0, best: null }]));
  const bestDepth: Record<string, number> = {};
  for (const m of matches) {
    if (m.winner_id !== playerId && m.loser_id !== playerId) continue;
    if (m.level !== 'Grand Slam' || !(SLAMS as readonly string[]).includes(m.tournament)) continue;
    const row = (cells[m.year] ??= {});
    const c = (row[m.tournament] ??= { reached: '', depth: 0, won: 0, lost: 0, champion: false });
    const won = m.winner_id === playerId;
    if (m.played) {
      if (won) {
        c.won++;
        totals[m.tournament].won++;
      } else {
        c.lost++;
        totals[m.tournament].lost++;
      }
    }
    const champ = won && m.round === 'The Final' && m.result !== 'Not played';
    const depth = champ ? 8 : m.round_order;
    if (depth > c.depth) {
      c.depth = depth;
      c.reached = champ ? 'W' : ROUND_SHORT[m.round] ?? m.round;
    }
    if (champ) {
      c.champion = true;
      totals[m.tournament].titles++;
    }
  }
  for (const [y, row] of Object.entries(cells)) for (const [t, c] of Object.entries(row)) {
    if (c && c.depth > (bestDepth[t] ?? 0)) {
      bestDepth[t] = c.depth;
      totals[t].best = c.reached;
    }
    void y;
  }
  const years = Object.keys(cells).map(Number).sort((a, b) => a - b);
  return { years, cells, totals };
}

export type SurfaceGrid = { years: number[]; surfaces: string[]; cells: Record<number, Partial<Record<string, { won: number; lost: number; pct: number | null }>>> };

export function surfaceGrid(matches: TennisMatch[], playerId: number): SurfaceGrid {
  const cells: SurfaceGrid['cells'] = {};
  const seen = new Set<string>();
  for (const m of matches) {
    if (!m.played || !m.surface_group || (m.winner_id !== playerId && m.loser_id !== playerId)) continue;
    seen.add(m.surface_group);
    const c = ((cells[m.year] ??= {})[m.surface_group] ??= { won: 0, lost: 0, pct: null });
    if (m.winner_id === playerId) c.won++;
    else c.lost++;
  }
  for (const row of Object.values(cells)) for (const c of Object.values(row)) if (c) c.pct = pct(c.won, c.lost);
  return {
    years: Object.keys(cells).map(Number).sort((a, b) => a - b),
    surfaces: SURFACES.filter((s) => seen.has(s)),
    cells,
  };
}

/** Rolling win % over the last `window` played matches on each surface: one point per match. */
export function rollingForm(matches: TennisMatch[], playerId: number, window = 20): Record<string, { date: string; pct: number }[]> {
  const out: Record<string, { date: string; pct: number }[]> = {};
  const recent: Record<string, boolean[]> = {};
  for (const m of [...matches].sort(byPlayOrder)) {
    if (!m.played || !m.surface_group || (m.winner_id !== playerId && m.loser_id !== playerId)) continue;
    const r = (recent[m.surface_group] ??= []);
    r.push(m.winner_id === playerId);
    if (r.length > window) r.shift();
    if (r.length >= Math.min(window, 10)) (out[m.surface_group] ??= []).push({ date: m.match_date, pct: r.filter(Boolean).length / r.length });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Timelapse races (Past seasons)
// ---------------------------------------------------------------------------
export type FinalLite = { year: number; date: string; tournament: string; level: Level | null; winner: string; winnerSlug: string };
export type RaceSeries = { id: string; name: string; values: (number | null)[]; slug: string };
export type Race = { frames: string[]; series: RaceSeries[] };

export const RACE_LEVELS = { all: 'All titles', big: 'Grand Slams, Tour Finals and 1000s', slams: 'Grand Slams' } as const;
export type RaceLevel = keyof typeof RACE_LEVELS;
const levelOk = (l: Level | null, f: RaceLevel) => f === 'all' || (f === 'slams' ? l === 'Grand Slam' : l === 'Grand Slam' || l === 'Finals' || l === '1000');

/** Titles won from `from`, cumulative, one frame per season. Keeps players ever in the top `keep`. */
export function titlesRace(finals: FinalLite[], from: number, to: number, level: RaceLevel = 'all', keep = 15): Race {
  const years: number[] = [];
  for (let y = from; y <= to; y++) years.push(y);
  const rows = finals.filter((f) => f.year >= from && f.year <= to && levelOk(f.level, level));
  return race(rows, years.map(String), (f) => years.indexOf(f.year), keep);
}

/** Grand Slam titles from `from`, one frame per Slam final. */
export function slamRace(finals: FinalLite[], from: number, to: number, keep = 15): Race {
  const slams = finals.filter((f) => f.level === 'Grand Slam' && f.year >= from && f.year <= to).sort((a, b) => a.date.localeCompare(b.date));
  return race(slams, slams.map((f) => `${f.tournament} ${f.year}`), (_f, i) => i, keep);
}

function race(rows: FinalLite[], frames: string[], frameOf: (f: FinalLite, i: number) => number, keep: number): Race {
  const counts = new Map<string, { name: string; perFrame: number[] }>();
  rows.forEach((f, i) => {
    const k = frameOf(f, i);
    if (k < 0) return;
    const c = counts.get(f.winnerSlug) ?? { name: f.winner, perFrame: new Array(frames.length).fill(0) };
    c.perFrame[k]++;
    counts.set(f.winnerSlug, c);
  });
  const series: RaceSeries[] = [...counts.entries()].map(([slug, c]) => {
    let run = 0;
    const values = c.perFrame.map((n) => (run += n) || null);
    return { id: slug, slug, name: c.name, values: values.map((v) => (v === 0 ? null : v)) };
  });
  // Keep anyone who is ever in the top `keep` of a frame.
  const kept = new Set<string>();
  for (let i = 0; i < frames.length; i++) {
    series
      .filter((s) => s.values[i] != null)
      .sort((a, b) => b.values[i]! - a.values[i]! || a.name.localeCompare(b.name))
      .slice(0, keep)
      .forEach((s) => kept.add(s.id));
  }
  return { frames, series: series.filter((s) => kept.has(s.id)) };
}

export function finalLite(m: TennisMatch): FinalLite {
  return { year: m.year, date: m.match_date, tournament: m.tournament, level: m.level, winner: m.winner, winnerSlug: m.winner_slug };
}

// ---------------------------------------------------------------------------
// Page sentences (shared by the pages and their server renders)
// ---------------------------------------------------------------------------
export function tournamentsSentence(data: { tour: Tour; rows: { last_year: number }[]; latestYear: number }): string {
  const current = data.rows.filter((r) => r.last_year >= data.latestYear - 1).length;
  return `${data.rows.length} ${data.tour} tournaments since ${FIRST_YEAR[data.tour]}, ${current} on the current calendar: champions, most titles and every draw.`;
}

export function editionSentence(d: { event: TennisEvent; edition: TennisEdition; matches: TennisMatch[] }): string {
  const e = d.edition;
  const final = d.matches.find((m) => m.round === 'The Final');
  const lead = `${e.name} ${e.year} (${e.city ?? d.event.city}, ${e.surface ?? ''})`;
  if (final && e.winner) return `${lead}: ${final.winner} beat ${final.loser} ${scoreLabel(final)} in the final. ${d.matches.length} matches, ${upsetCount(d.matches)} won by the outsider.`;
  return `${lead}: ${d.matches.length} matches so far.`;
}

export function guideSentence(g: GuideGroups): string {
  const n = g.underWay.length + g.thisWeek.length;
  const slam = [...g.underWay, ...g.thisWeek, ...g.nextWeek].find((r) => r.level === 'Grand Slam');
  return `${n} tournament${n === 1 ? '' : 's'} this week and ${g.nextWeek.length} next week across the ATP and WTA, with the UK channel for each.${slam ? ` ${slam.name} is on.` : ''}`;
}
