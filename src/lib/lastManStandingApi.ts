// ============================================================================
// src/lib/lastManStandingApi.ts
//
// Data for /admin/last-man-standing, all from existing tables: the season's
// fixtures for one league (with market-rating goals and Dixon-Coles goals)
// and the latest de-vigged prices for the next rounds (fixture_market_latest).
// buildProblem turns them into the engine's round × team matrix.
// ============================================================================

import { supabase } from './supabase';
import { outcomeProbs, type Cell, type Problem } from './lastManStanding';
import type { FieldRound } from './lmsField';

export const LMS_LEAGUES = {
  E0: { leagueId: 1, label: 'Premier League', game: 'PremSkins' },
  E1: { leagueId: 2, label: 'Championship', game: 'ChampSkins' },
} as const;
export type LmsLeague = keyof typeof LMS_LEAGUES;

export type LmsFixture = {
  fixtureId: number;
  matchweek: number;
  status: string;
  kickoffDate: string | null;
  kickoffTime: string | null;
  homeId: number;
  awayId: number;
  homeName: string;
  awayName: string;
  marketHome: number | null;
  marketAway: number | null;
  dcHome: number | null;
  dcAway: number | null;
  /** Full-time score once known (matches, else the reported score). */
  homeGoals?: number | null;
  awayGoals?: number | null;
};

export type LmsPrice = { fixtureId: number; home: number; draw: number; away: number; capturedAt: string };

export type LmsData = { fixtures: LmsFixture[]; prices: Map<number, LmsPrice> };

export async function loadLmsData(league: LmsLeague, seasonId: number): Promise<LmsData> {
  const { data, error } = await supabase
    .from('fixtures')
    .select(`
      fixture_id, matchweek, status, kickoff_date, kickoff_time, home_team_id, away_team_id,
      market_home_goals, market_away_goals, predicted_home_goals, predicted_away_goals,
      reported_home_goals, reported_away_goals,
      home_team:teams!fixtures_home_team_id_fkey(display_name),
      away_team:teams!fixtures_away_team_id_fkey(display_name)
    `)
    .eq('league_id', LMS_LEAGUES[league].leagueId)
    .eq('season_id', seasonId)
    .order('kickoff_date', { ascending: true });
  if (error) throw error;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fixtures: LmsFixture[] = (data ?? []).map((r: any) => ({
    fixtureId: r.fixture_id,
    matchweek: r.matchweek,
    status: r.status,
    kickoffDate: r.kickoff_date,
    kickoffTime: r.kickoff_time,
    homeId: r.home_team_id,
    awayId: r.away_team_id,
    homeName: r.home_team?.display_name ?? String(r.home_team_id),
    awayName: r.away_team?.display_name ?? String(r.away_team_id),
    marketHome: r.market_home_goals,
    marketAway: r.market_away_goals,
    dcHome: r.predicted_home_goals,
    dcAway: r.predicted_away_goals,
    homeGoals: r.reported_home_goals ?? null,
    awayGoals: r.reported_away_goals ?? null,
  }));

  // results, for the field's survivors (matches is keyed by the home/away pair, unique in a league-season)
  const { data: res, error: re } = await supabase
    .from('matches')
    .select('home_team_id, away_team_id, full_time_home_goals, full_time_away_goals')
    .eq('league_id', LMS_LEAGUES[league].leagueId)
    .eq('season_id', seasonId);
  if (re) throw re;
  const byPair = new Map((res ?? []).map((m) => [`${m.home_team_id}-${m.away_team_id}`, m]));
  for (const f of fixtures) {
    const m = byPair.get(`${f.homeId}-${f.awayId}`);
    if (m && m.full_time_home_goals != null && m.full_time_away_goals != null) {
      f.homeGoals = m.full_time_home_goals;
      f.awayGoals = m.full_time_away_goals;
    }
  }

  // prices: the next rounds, plus the last price before kick-off for the season's played games
  // (the field's past rounds are scored at the chances the field saw)
  const next = fixtures.map((f) => f.fixtureId);
  const prices = new Map<number, LmsPrice>();
  if (next.length) {
    const { data: px, error: pe } = await supabase
      .from('fixture_market_latest' as never)
      .select('fixture_id, market_home, market_draw, market_away, captured_at')
      .in('fixture_id', next);
    if (pe) throw pe;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of (px ?? []) as any[]) {
      prices.set(p.fixture_id, { fixtureId: p.fixture_id, home: Number(p.market_home), draw: Number(p.market_draw), away: Number(p.market_away), capturedAt: p.captured_at });
    }
  }
  return { fixtures, prices };
}

/**
 * One round of the real field: pasted counts by team id → the engine's team
 * order, with each team's pre-match win chance and result. Win chances are
 * the last price before kick-off where captured, else the goals model, so a
 * played round is judged on what the field could see.
 */
export function fieldRound(data: LmsData, gw: number, source: ProbSource, teams: { id: number }[], counts: Map<number, number>): FieldRound {
  const index = new Map(teams.map((t, i) => [t.id, i]));
  const T = teams.length;
  const out: FieldRound = { gw, counts: new Array(T).fill(0), p: new Array(T).fill(null), won: new Array(T).fill(null) };
  for (const [id, n] of counts) { const i = index.get(id); if (i != null) out.counts[i] += n; }
  const games = data.fixtures.filter((f) => f.matchweek === gw && f.status !== 'postponed')
    .sort((a, b) => `${a.kickoffDate ?? ''} ${a.kickoffTime ?? ''}`.localeCompare(`${b.kickoffDate ?? ''} ${b.kickoffTime ?? ''}`));
  for (const f of games) {
    const hi = index.get(f.homeId), ai = index.get(f.awayId);
    if (hi == null || ai == null || out.p[hi] != null || out.p[ai] != null) continue;
    let pH: number | null = null, pA: number | null = null;
    const price = data.prices.get(f.fixtureId);
    if (source === 'market' && price && price.home > 0 && price.away > 0) { pH = price.home; pA = price.away; }
    else {
      const [gh, ga] = source === 'market' && f.marketHome != null && f.marketAway != null ? [f.marketHome, f.marketAway] : [f.dcHome, f.dcAway];
      if (gh != null && ga != null) { const [h, , a] = outcomeProbs(gh, ga); pH = h; pA = a; }
    }
    out.p[hi] = pH; out.p[ai] = pA;
    if (f.homeGoals != null && f.awayGoals != null) {
      out.won[hi] = f.homeGoals > f.awayGoals ? 1 : 0;
      out.won[ai] = f.awayGoals > f.homeGoals ? 1 : 0;
    }
  }
  return out;
}

/** Gameweeks that still have an unplayed fixture, in order. */
export function openRounds(fixtures: LmsFixture[]): number[] {
  return [...new Set(fixtures.filter((f) => f.status !== 'played' && f.matchweek != null).map((f) => f.matchweek))].sort((a, b) => a - b);
}

export type ProbSource = 'market' | 'dc';

/**
 * Round × team matrix from gameweek `fromRound` to the end of the season.
 * A team's cell is its first unplayed match in that gameweek; no unplayed
 * match (blank, already played, postponed out of the round) = null, so the
 * engine can never pick it there.
 */
export function buildProblem(data: LmsData, fromRound: number, source: ProbSource): Problem {
  const teamMap = new Map<number, string>();
  for (const f of data.fixtures) {
    teamMap.set(f.homeId, f.homeName);
    teamMap.set(f.awayId, f.awayName);
  }
  const teams = [...teamMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  const index = new Map(teams.map((t, i) => [t.id, i]));
  const rounds = openRounds(data.fixtures).filter((r) => r >= fromRound);
  const cells: (Cell | null)[][] = rounds.map(() => teams.map(() => null));
  const byRound = new Map(rounds.map((r, k) => [r, k]));
  const sorted = [...data.fixtures].sort((a, b) =>
    `${a.kickoffDate ?? ''} ${a.kickoffTime ?? ''}`.localeCompare(`${b.kickoffDate ?? ''} ${b.kickoffTime ?? ''}`));
  for (const f of sorted) {
    if (f.status === 'played' || f.status === 'postponed') continue;
    const k = byRound.get(f.matchweek);
    if (k == null) continue;
    let pH: number | null = null, pA: number | null = null;
    let src: Cell['source'] = source;
    const price = data.prices.get(f.fixtureId);
    if (source === 'market' && price && price.home > 0 && price.away > 0) {
      pH = price.home; pA = price.away; src = 'price';
    } else {
      const [gh, ga] = source === 'market' && f.marketHome != null && f.marketAway != null
        ? [f.marketHome, f.marketAway]
        : [f.dcHome, f.dcAway];
      if (gh != null && ga != null) {
        const [h, , a] = outcomeProbs(gh, ga);
        pH = h; pA = a;
        src = source === 'market' && f.marketHome != null ? 'market' : 'dc';
      }
    }
    if (pH == null || pA == null) continue;
    const kickoff = f.kickoffDate ? `${f.kickoffDate}${f.kickoffTime ? ` ${f.kickoffTime.slice(0, 5)}` : ''}` : null;
    const hi = index.get(f.homeId)!, ai = index.get(f.awayId)!;
    // a double gameweek keeps the first match (earliest kick-off)
    cells[k][hi] ??= { p: pH, opponent: f.awayName, home: true, fixtureId: f.fixtureId, kickoff, source: src };
    cells[k][ai] ??= { p: pA, opponent: f.homeName, home: false, fixtureId: f.fixtureId, kickoff, source: src };
  }
  return { teams, rounds, cells };
}
