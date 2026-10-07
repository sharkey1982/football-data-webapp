// ============================================================================
// src/lib/tennisStats.ts
//
// Tennis section (phase 2, Oct 2026): pure builders behind the pages. No
// fetching here -- the same functions run in the browser and in the static
// generator, which passes the rows in. Tested in src/__tests__/tennis.test.ts.
//
// Counting rules (match the views, migration 20261004230000):
//   * a win-loss record counts played matches only (Completed, Retired,
//     Awarded, Disqualified); walkovers and "Not played" don't count;
//   * a final won by walkover is still a title; a "Not played" final is not.
// ============================================================================

export type Tour = 'ATP' | 'WTA';
export const TOURS: Tour[] = ['ATP', 'WTA'];
export const FIRST_YEAR: Record<Tour, number> = { ATP: 2000, WTA: 2007 };
export type Level = 'Grand Slam' | 'Finals' | '1000' | 'Premier' | '500' | '250';

export type TennisMatch = {
  source_key: string;
  tour: Tour;
  year: number;
  match_date: string;
  /** Present from phase 3 (MATCH_COLUMNS); optional so older fixtures still type-check. */
  tournament_id?: number;
  tournament: string;
  tournament_slug: string;
  location: string | null;
  surface_group: string | null;
  level: Level | null;
  level_rank: number;
  round: string;
  round_order: number;
  best_of: number | null;
  winner: string;
  winner_slug: string;
  winner_id: number;
  loser: string;
  loser_slug: string;
  loser_id: number;
  w_rank: number | null;
  l_rank: number | null;
  w_games: number[];
  l_games: number[];
  result: string;
  played: boolean;
  avg_w: number | null;
  avg_l: number | null;
  b365_w: number | null;
  b365_l: number | null;
  ps_w: number | null;
  ps_l: number | null;
};

export type TennisPlayer = {
  player_id: number;
  tour: Tour;
  name: string;
  slug: string;
  won: number;
  lost: number;
  titles: number;
  finals: number;
  first_year: number;
  last_year: number;
  last_match: string;
  recent_matches: number;
  /** From Wikidata (scripts/tennis_people.py): ISO alpha-2, null when unknown. */
  country?: string | null;
  full_name?: string | null;
  birth_date?: string | null;
  hand?: 'Right' | 'Left' | null;
  wikidata_qid?: string | null;
  /** Ranking on the day of the player's latest match in the data (tennis.player_ratings, migration 20261006200000). */
  latest_rank?: number | null;
  latest_rank_date?: string | null;
  best_rank?: number | null;
};

/** Ranking bands for the Your Player filter (?rank=10 etc.). */
export const RANK_BANDS = [10, 20, 50, 100] as const;
export function parseRankBand(v: string | null | undefined): number | null {
  const n = Number(v);
  return (RANK_BANDS as readonly number[]).includes(n) ? n : null;
}

/** Players with this many played matches in the tour's last three seasons get a static page. */
export const STATIC_PLAYER_MIN = 50;
/** A career this long, or any title, also earns an indexed page. */
export const INDEXED_CAREER_MIN = 200;

/** Whether a player's page is indexed (static, in the sitemap, no noindex):
 * active regulars, and any player with a title or a long career. Until
 * 7 Oct 2026 only the first counted, which noindexed Federer, Nadal, Murray,
 * Serena Williams and Sharapova (SEO audit). Rivalry pages still need both
 * players active (STATIC_PLAYER_MIN). */
export function isIndexedPlayer(p: { recent_matches: number; titles: number; won: number; lost: number }): boolean {
  return p.recent_matches >= STATIC_PLAYER_MIN || p.titles >= 1 || p.won + p.lost >= INDEXED_CAREER_MIN;
}

export const LEVEL_LABEL: Record<Level, string> = {
  'Grand Slam': 'Grand Slam',
  Finals: 'Tour Finals',
  '1000': '1000',
  Premier: 'Premier',
  '500': '500',
  '250': '250',
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
export const tourParam = (t: Tour) => t.toLowerCase() as 'atp' | 'wta';
export function parseTour(v: string | null | undefined): Tour | null {
  const u = (v ?? '').toUpperCase();
  return u === 'ATP' || u === 'WTA' ? u : null;
}

/** "6-4 3-6 7-6", or "W/O" / "ret." notes for unfinished matches. */
export function scoreLabel(m: Pick<TennisMatch, 'w_games' | 'l_games' | 'result'>): string {
  const sets = (m.w_games ?? []).map((w, i) => `${w}-${m.l_games?.[i] ?? ''}`).join(' ');
  if (m.result === 'Walkover') return 'Walkover';
  if (m.result === 'Not played') return 'Not played';
  if (m.result === 'Retired') return sets ? `${sets} ret.` : 'Retired';
  if (m.result === 'Awarded' || m.result === 'Disqualified') return sets ? `${sets} (${m.result.toLowerCase()})` : m.result;
  return sets || '–';
}

/** Pre-match odds for winner and loser: average market, else Bet365, else Pinnacle. */
export function odds(m: Pick<TennisMatch, 'avg_w' | 'avg_l' | 'b365_w' | 'b365_l' | 'ps_w' | 'ps_l'>): { w: number; l: number } | null {
  for (const [w, l] of [[m.avg_w, m.avg_l], [m.b365_w, m.b365_l], [m.ps_w, m.ps_l]] as const) {
    if (w != null && l != null && w > 1 && l > 1) return { w, l };
  }
  return null;
}

/** True when the winner was the bookmakers' outsider. */
export function isUpset(m: Parameters<typeof odds>[0] & Pick<TennisMatch, 'played'>): boolean {
  const o = odds(m);
  return Boolean(m.played && o && o.w > o.l);
}

export const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export const DATA_NOTE = 'Tour-level main draws. Data: tennis-data.co.uk.';

export const pct = (won: number, lost: number) => (won + lost === 0 ? null : won / (won + lost));
export const pctLabel = (p: number | null) => (p == null ? '–' : `${Math.round(p * 100)}%`);
export const recordLabel = (won: number, lost: number) => `${won}–${lost}`;

/** Chronological order within a season: date, then round. */
export function byPlayOrder(a: TennisMatch, b: TennisMatch): number {
  return a.match_date.localeCompare(b.match_date) || a.round_order - b.round_order || a.source_key.localeCompare(b.source_key);
}

const isTitle = (m: TennisMatch) => m.round === 'The Final' && m.result !== 'Not played';

// ---------------------------------------------------------------------------
// Results page
// ---------------------------------------------------------------------------
export type TournamentDay = { tournament: string; level: Level | null; surface: string | null; location: string | null; matches: TennisMatch[] };

/** Matches on the given dates, grouped by tournament (biggest level first), latest round first. */
export function groupByTournament(matches: TennisMatch[]): TournamentDay[] {
  const map = new Map<string, TournamentDay>();
  for (const m of matches) {
    const g = map.get(m.tournament) ?? { tournament: m.tournament, level: m.level, surface: m.surface_group, location: m.location, matches: [] };
    g.matches.push(m);
    map.set(m.tournament, g);
  }
  const groups = [...map.values()];
  for (const g of groups) g.matches.sort((a, b) => b.round_order - a.round_order || a.match_date.localeCompare(b.match_date) || a.winner.localeCompare(b.winner));
  const rank = (g: TournamentDay) => g.matches[0]?.level_rank ?? 9;
  return groups.sort((a, b) => rank(a) - rank(b) || a.tournament.localeCompare(b.tournament));
}

export function countsByDate(matches: Pick<TennisMatch, 'match_date'>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of matches) out[m.match_date] = (out[m.match_date] ?? 0) + 1;
  return out;
}

// ---------------------------------------------------------------------------
// Player page
// ---------------------------------------------------------------------------
export type SplitRow = { key: string; won: number; lost: number; pct: number | null; titles: number };
export type TitleRow = { year: number; titles: string[]; runnerUp: string[] };
export type NotableWin = { match: TennisMatch; opponentRank: number | null; odds: number | null };

export type PlayerSummary = {
  name: string;
  tour: Tour;
  won: number;
  lost: number;
  titles: number;
  finals: number;
  firstYear: number;
  lastYear: number;
  season: { year: number; won: number; lost: number; titles: number } | null;
  bySurface: SplitRow[];
  byLevel: SplitRow[];
  byYear: SplitRow[];
  titleYears: TitleRow[];
  bestWinsByRank: NotableWin[];
  bestWinsByOdds: NotableWin[];
  recent: TennisMatch[];
  bestRank: { rank: number; date: string } | null;
};

function split(rows: TennisMatch[], playerId: number, key: (m: TennisMatch) => string | null, order?: (k: string) => number): SplitRow[] {
  const map = new Map<string, SplitRow>();
  for (const m of rows) {
    const k = key(m);
    if (k == null) continue;
    const r = map.get(k) ?? { key: k, won: 0, lost: 0, pct: null, titles: 0 };
    const won = m.winner_id === playerId;
    if (m.played) {
      if (won) r.won++;
      else r.lost++;
    }
    if (won && isTitle(m)) r.titles++;
    map.set(k, r);
  }
  const out = [...map.values()].map((r) => ({ ...r, pct: pct(r.won, r.lost) }));
  return order ? out.sort((a, b) => order(a.key) - order(b.key)) : out.sort((a, b) => b.won + b.lost - (a.won + a.lost));
}

const LEVEL_ORDER: Record<string, number> = { 'Grand Slam': 1, Finals: 2, '1000': 3, Premier: 4, '500': 5, '250': 6 };

export function playerSummary(player: Pick<TennisPlayer, 'player_id' | 'name' | 'tour'>, matches: TennisMatch[]): PlayerSummary {
  const id = player.player_id;
  const rows = [...matches].sort(byPlayOrder);
  const played = rows.filter((m) => m.played);
  const won = played.filter((m) => m.winner_id === id).length;
  const titlesAll = rows.filter((m) => isTitle(m) && m.winner_id === id);
  const finalsAll = rows.filter((m) => isTitle(m) && (m.winner_id === id || m.loser_id === id));
  const lastYear = rows.length ? rows[rows.length - 1].year : 0;
  const seasonRows = rows.filter((m) => m.year === lastYear);
  const seasonPlayed = seasonRows.filter((m) => m.played);

  const titleYears = new Map<number, TitleRow>();
  for (const m of finalsAll) {
    const t = titleYears.get(m.year) ?? { year: m.year, titles: [], runnerUp: [] };
    (m.winner_id === id ? t.titles : t.runnerUp).push(m.tournament);
    titleYears.set(m.year, t);
  }

  const wins = played.filter((m) => m.winner_id === id);
  const bestWinsByRank = wins
    .filter((m) => m.l_rank != null)
    .sort((a, b) => a.l_rank! - b.l_rank! || b.level_rank - a.level_rank || b.match_date.localeCompare(a.match_date))
    .slice(0, 5)
    .map((m) => ({ match: m, opponentRank: m.l_rank, odds: odds(m)?.w ?? null }));
  const bestWinsByOdds = wins
    .filter((m) => odds(m) != null)
    .sort((a, b) => odds(b)!.w - odds(a)!.w || b.match_date.localeCompare(a.match_date))
    .slice(0, 5)
    .map((m) => ({ match: m, opponentRank: m.l_rank, odds: odds(m)!.w }));

  let bestRank: PlayerSummary['bestRank'] = null;
  for (const m of rows) {
    const r = m.winner_id === id ? m.w_rank : m.l_rank;
    if (r != null && r > 0 && (bestRank == null || r < bestRank.rank)) bestRank = { rank: r, date: m.match_date };
  }

  return {
    name: player.name,
    tour: player.tour,
    won,
    lost: played.length - won,
    titles: titlesAll.length,
    finals: finalsAll.length,
    firstYear: rows.length ? rows[0].year : 0,
    lastYear,
    season: lastYear
      ? {
          year: lastYear,
          won: seasonPlayed.filter((m) => m.winner_id === id).length,
          lost: seasonPlayed.filter((m) => m.winner_id !== id).length,
          titles: seasonRows.filter((m) => isTitle(m) && m.winner_id === id).length,
        }
      : null,
    bySurface: split(rows, id, (m) => m.surface_group),
    byLevel: split(rows, id, (m) => m.level, (k) => LEVEL_ORDER[k] ?? 9),
    byYear: split(rows, id, (m) => String(m.year), (k) => -Number(k)),
    titleYears: [...titleYears.values()].sort((a, b) => b.year - a.year),
    bestWinsByRank,
    bestWinsByOdds,
    recent: [...rows].reverse().slice(0, 15),
    bestRank,
  };
}

export function playerSentence(s: PlayerSummary): string {
  const span = s.firstYear === s.lastYear ? `in ${s.firstYear}` : `from ${s.firstYear} to ${s.lastYear}`;
  const titles = s.titles === 0 ? 'no titles yet' : `${s.titles} title${s.titles === 1 ? '' : 's'}`;
  return `${s.name}: ${recordLabel(s.won, s.lost)} in ${s.tour} tour-level matches ${span}, ${titles}.`;
}

// ---------------------------------------------------------------------------
// Past seasons
// ---------------------------------------------------------------------------
export type FinalRow = { tournament: string; level: Level | null; levelRank: number; surface: string | null; date: string; winner: string; winnerSlug: string; runnerUp: string; runnerUpSlug: string; score: string };
export type Leader = { name: string; slug: string; titles: number; finals: number };
export type Streak = { name: string; slug: string; length: number; from: string; to: string };
export type Upset = { match: TennisMatch; odds: number | null; rankGap: number | null };

export type SeasonSummary = {
  tour: Tour;
  year: number;
  matches: number;
  complete: boolean;
  firstDate: string | null;
  lastDate: string | null;
  bigFinals: FinalRow[];
  allFinals: FinalRow[];
  leaders: Leader[];
  upsetsByOdds: Upset[];
  upsetsByRank: Upset[];
  streaks: Streak[];
  surfaces: { surface: string; matches: number }[];
};

export function finalRow(m: TennisMatch): FinalRow {
  return {
    tournament: m.tournament,
    level: m.level,
    levelRank: m.level_rank,
    surface: m.surface_group,
    date: m.match_date,
    winner: m.winner,
    winnerSlug: m.winner_slug,
    runnerUp: m.loser,
    runnerUpSlug: m.loser_slug,
    score: scoreLabel(m),
  };
}

/** Longest winning run in the season per player (walkovers neither extend nor break a run). */
function streaks(rows: TennisMatch[]): Streak[] {
  const byPlayer = new Map<number, { name: string; slug: string; cur: number; start: string; best: Streak | null }>();
  const get = (id: number, name: string, slug: string) => {
    let s = byPlayer.get(id);
    if (!s) byPlayer.set(id, (s = { name, slug, cur: 0, start: '', best: null }));
    return s;
  };
  for (const m of rows) {
    if (!m.played) continue;
    const w = get(m.winner_id, m.winner, m.winner_slug);
    if (w.cur === 0) w.start = m.match_date;
    w.cur++;
    if (!w.best || w.cur > w.best.length) w.best = { name: w.name, slug: w.slug, length: w.cur, from: w.start, to: m.match_date };
    get(m.loser_id, m.loser, m.loser_slug).cur = 0;
  }
  return [...byPlayer.values()].map((p) => p.best).filter((b): b is Streak => b != null).sort((a, b) => b.length - a.length || a.from.localeCompare(b.from));
}

/** complete: the season's last final (Tour Finals) has been played, or the year is over. */
export function seasonSummary(tour: Tour, year: number, matches: TennisMatch[], today = new Date().toISOString().slice(0, 10)): SeasonSummary {
  const rows = [...matches].sort(byPlayOrder);
  const finals = rows.filter(isTitle);
  const allFinals = finals.map(finalRow).sort((a, b) => a.date.localeCompare(b.date));
  const bigFinals = allFinals.filter((f) => f.level === 'Grand Slam' || f.level === 'Finals' || f.level === '1000');

  const leaderMap = new Map<string, Leader>();
  for (const f of finals) {
    for (const [name, slug, won] of [[f.winner, f.winner_slug, true], [f.loser, f.loser_slug, false]] as const) {
      const l = leaderMap.get(slug) ?? { name, slug, titles: 0, finals: 0 };
      l.finals++;
      if (won) l.titles++;
      leaderMap.set(slug, l);
    }
  }
  const leaders = [...leaderMap.values()].filter((l) => l.titles > 0).sort((a, b) => b.titles - a.titles || b.finals - a.finals || a.name.localeCompare(b.name));

  const upsets = rows.filter((m) => m.played).map((m) => ({ match: m, odds: odds(m)?.w ?? null, rankGap: m.w_rank != null && m.l_rank != null ? m.w_rank - m.l_rank : null }));
  const upsetsByOdds = upsets.filter((u) => u.odds != null && isUpset(u.match)).sort((a, b) => b.odds! - a.odds! || a.match.match_date.localeCompare(b.match.match_date)).slice(0, 10);
  const upsetsByRank = upsets.filter((u) => u.rankGap != null && u.rankGap > 0).sort((a, b) => b.rankGap! - a.rankGap! || a.match.match_date.localeCompare(b.match.match_date)).slice(0, 10);

  const surf = new Map<string, number>();
  for (const m of rows) if (m.played && m.surface_group) surf.set(m.surface_group, (surf.get(m.surface_group) ?? 0) + 1);

  const tourFinalsPlayed = finals.some((f) => f.level === 'Finals');
  return {
    tour,
    year,
    matches: rows.filter((m) => m.played).length,
    complete: tourFinalsPlayed || today > `${year}-12-31`,
    firstDate: rows[0]?.match_date ?? null,
    lastDate: rows[rows.length - 1]?.match_date ?? null,
    bigFinals,
    allFinals,
    leaders: leaders.slice(0, 10),
    upsetsByOdds,
    upsetsByRank,
    streaks: streaks(rows).slice(0, 10),
    surfaces: [...surf.entries()].map(([surface, n]) => ({ surface, matches: n })).sort((a, b) => b.matches - a.matches),
  };
}

export function seasonSentence(s: SeasonSummary): string {
  const slams = s.bigFinals.filter((f) => f.level === 'Grand Slam');
  const top = s.leaders[0];
  const parts: string[] = [];
  if (slams.length) {
    const byWinner = new Map<string, string[]>();
    for (const f of slams) byWinner.set(f.winner, [...(byWinner.get(f.winner) ?? []), f.tournament]);
    parts.push(
      `Grand Slam ${slams.length === 1 ? 'champion' : 'champions'}: ${[...byWinner.entries()].map(([w, t]) => (t.length > 1 ? `${w} (${t.length})` : `${w}`)).join(', ')}`
    );
  }
  if (top) parts.push(`most titles: ${top.name} (${top.titles})`);
  const lead = `The ${s.year} ${s.tour} season${s.complete ? '' : ' so far'}: ${s.matches.toLocaleString('en-GB')} matches`;
  return parts.length ? `${lead}. ${parts.map((p, i) => (i === 0 ? p[0].toUpperCase() + p.slice(1) : p)).join('; ')}.` : `${lead}.`;
}

/** One row per year for the seasons list, from that tour's finals. */
export type SeasonIndexRow = { year: number; slams: FinalRow[]; topName: string | null; topSlug: string | null; topTitles: number; finals: number; complete: boolean };

export function seasonIndex(finals: TennisMatch[], today = new Date().toISOString().slice(0, 10)): SeasonIndexRow[] {
  const byYear = new Map<number, TennisMatch[]>();
  for (const m of finals) if (isTitle(m)) byYear.set(m.year, [...(byYear.get(m.year) ?? []), m]);
  return [...byYear.entries()]
    .map(([year, rows]) => {
      const counts = new Map<string, { name: string; slug: string; n: number }>();
      for (const m of rows) {
        const c = counts.get(m.winner_slug) ?? { name: m.winner, slug: m.winner_slug, n: 0 };
        c.n++;
        counts.set(m.winner_slug, c);
      }
      const top = [...counts.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))[0];
      return {
        year,
        slams: rows.filter((m) => m.level === 'Grand Slam').map(finalRow).sort((a, b) => a.date.localeCompare(b.date)),
        topName: top?.name ?? null,
        topSlug: top?.slug ?? null,
        topTitles: top?.n ?? 0,
        finals: rows.length,
        complete: rows.some((m) => m.level === 'Finals') || today > `${year}-12-31`,
      };
    })
    .sort((a, b) => b.year - a.year);
}

/** Grand Slam titles per player across the seasons list, most first. */
export function slamCounts(rows: SeasonIndexRow[]): { name: string; slug: string; n: number }[] {
  const c = new Map<string, { name: string; slug: string; n: number }>();
  for (const r of rows) for (const f of r.slams) {
    const e = c.get(f.winnerSlug) ?? { name: f.winner, slug: f.winnerSlug, n: 0 };
    e.n++;
    c.set(f.winnerSlug, e);
  }
  return [...c.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}

export function resultsSentence(tour: Tour, date: string, n: number, tournaments: number): string {
  return `${tour} results for ${shortDate(date)}: ${n} match${n === 1 ? '' : 'es'} at ${tournaments} tournament${tournaments === 1 ? '' : 's'}.`;
}

export function seasonsSentence(tour: Tour, rows: SeasonIndexRow[]): string {
  const top = slamCounts(rows).slice(0, 3);
  if (!rows.length) return `Every ${tour} season since ${FIRST_YEAR[tour]}.`;
  return `${rows.length} ${tour} seasons since ${FIRST_YEAR[tour]}. Most Grand Slam titles: ${top.map((t) => `${t.name} (${t.n})`).join(', ')}.`;
}

// ---------------------------------------------------------------------------
// Playing status (Chris, 6 Oct 2026): "active" means a tour-level match in the
// 12 months before the latest match in the data. Measured from the data's end,
// not today, so a late import doesn't turn everyone inactive. A player out
// injured for more than a year shows as inactive until they play again.
// ---------------------------------------------------------------------------
export type PlayerStatus = 'active' | 'inactive' | 'all';
export const ACTIVE_DAYS = 365;

export function parseStatus(v: string | null | undefined): PlayerStatus {
  return v === 'inactive' || v === 'all' ? v : 'active';
}

/** The earliest last-match date that still counts as active, from the latest match on the tour. */
export function activeSince(players: { last_match: string | null }[]): string | null {
  const latest = players.reduce<string | null>((a, p) => (p.last_match && (a == null || p.last_match > a) ? p.last_match : a), null);
  if (!latest) return null;
  return new Date(Date.parse(`${latest}T12:00:00Z`) - ACTIVE_DAYS * 86400000).toISOString().slice(0, 10);
}

export const isActive = (p: { last_match: string | null }, since: string | null) => since != null && p.last_match != null && p.last_match >= since;
