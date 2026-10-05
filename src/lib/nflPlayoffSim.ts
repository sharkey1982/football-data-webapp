// ============================================================================
// src/lib/nflPlayoffSim.ts
//
// NFL play-off chances (Model Lab experiment N2): the rest of the regular
// season simulated many times with the NFL model (N1's margin Elo: K 20, home
// advantage 45, half-way regression between seasons), standings and seeds
// settled each time by the official tie-breaks (nflTiebreak.ts).
//
// "Hot" simulation: within each simulated season the ratings update after
// every simulated game, as they would for real, so the uncertainty about how
// good a team is carries through to the end of the season. Margins are drawn
// from Normal(Elo edge / 25, 13.26), the margin curve used on game pages,
// with the winner decided first (no simulated ties).
//
// The same file runs the daily job (scripts/nfl_playoff_odds.ts), the
// backtest (scripts/nfl_playoff_lab.ts) and the tests.
// ============================================================================

import type { NflGame, NflStanding } from './nflApi';
import { buildStandingsMath } from './nflTiebreak';

export const ELO = { K: 20, HFA: 45, REG: 0.5, MARGIN_PER_ELO: 25, MARGIN_SD: 13.26 } as const;

export type EloGame = Pick<NflGame, 'season' | 'home_franchise' | 'away_franchise' | 'home_score' | 'away_score' | 'neutral_site'>;

export function eloProb(edge: number): number {
  return 1 / (1 + 10 ** (-edge / 400));
}

/** Elo change for the home side after a game (lab_nfl.elo_walk). */
export function eloDelta(edge: number, margin: number): number {
  const p = eloProb(edge);
  const result = margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  const winnerEdge = margin > 0 ? edge : margin < 0 ? -edge : 0;
  const mult = (Math.log(Math.abs(margin) + 1) * 2.2) / (winnerEdge * 0.001 + 2.2);
  return ELO.K * mult * (result - p);
}

/** Ratings after every played game, in order (a port of lab_nfl.elo_walk). */
export function eloWalk(played: EloGame[]): { ratings: Map<string, number>; season: number | null } {
  const r = new Map<string, number>();
  const get = (t: string) => r.get(t) ?? 1500;
  let season: number | null = null;
  for (const g of played) {
    if (g.season !== season) {
      season = g.season;
      for (const [t, v] of r) r.set(t, 1500 + (1 - ELO.REG) * (v - 1500));
    }
    const edge = get(g.home_franchise) - get(g.away_franchise) + (g.neutral_site ? 0 : ELO.HFA);
    const d = eloDelta(edge, Number(g.home_score) - Number(g.away_score));
    r.set(g.home_franchise, get(g.home_franchise) + d);
    r.set(g.away_franchise, get(g.away_franchise) - d);
  }
  return { ratings: r, season };
}

/** Deterministic random numbers (mulberry32), so a run can be repeated exactly. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

export type TeamOdds = {
  franchise: string;
  p_playoff: number;
  p_division: number;
  /** Seed 1 (a first-round bye from 2020; seeds 1-2 before). */
  p_bye: number;
  mean_wins: number;
  /** Chance of each seed, 1..spots. */
  p_seed: number[];
};

export type SimMode = 'elo' | 'coin';

/**
 * Simulates the unplayed regular-season games `sims` times.
 * `games` is the whole season (played and unplayed); `ratings` the ratings
 * before the first unplayed game. Mode 'coin' is the no-model baseline: every
 * game a coin flip but for home advantage (the benchmark for experiment N2).
 */
export function simulateSeason(rows: NflStanding[], games: NflGame[], ratings: Map<string, number>, sims: number, seed = 1, mode: SimMode = 'elo'): TeamOdds[] {
  const rand = rng(seed);
  const reg = games.filter((g) => g.game_type === 'REG');
  const played = reg.filter((g) => g.home_score != null && g.away_score != null);
  const todo = reg.filter((g) => g.home_score == null || g.away_score == null).sort((a, b) => a.week - b.week || a.gameday.localeCompare(b.gameday));
  const teams = rows.map((r) => r.franchise);
  const spots = rows[0] && rows[0].season >= 2020 ? 7 : 6;
  const byes = spots === 7 ? 1 : 2;
  const acc = new Map(teams.map((t) => [t, { playoff: 0, division: 0, bye: 0, wins: 0, seed: new Array(spots).fill(0) as number[] }]));
  const homeP = eloProb(ELO.HFA);

  for (let s = 0; s < sims; s++) {
    const r = new Map(ratings);
    const get = (t: string) => r.get(t) ?? 1500;
    const simmed: NflGame[] = played.slice();
    for (const g of todo) {
      const edge = get(g.home_franchise) - get(g.away_franchise) + (g.neutral_site ? 0 : ELO.HFA);
      const p = mode === 'coin' ? (g.neutral_site ? 0.5 : homeP) : eloProb(edge);
      const homeWins = rand() < p;
      const size = Math.max(1, Math.round(Math.abs(edge / ELO.MARGIN_PER_ELO + ELO.MARGIN_SD * normal(rand))));
      const margin = homeWins ? size : -size;
      if (mode === 'elo') {
        const d = eloDelta(edge, margin);
        r.set(g.home_franchise, get(g.home_franchise) + d);
        r.set(g.away_franchise, get(g.away_franchise) - d);
      }
      simmed.push({ ...g, home_score: homeWins ? margin : 0, away_score: homeWins ? 0 : -margin });
    }
    const m = buildStandingsMath(rows, simmed);
    for (const g of simmed) {
      const hs = Number(g.home_score);
      const as = Number(g.away_score);
      const winner = hs > as ? g.home_franchise : as > hs ? g.away_franchise : null;
      if (winner && acc.has(winner)) acc.get(winner)!.wins++;
    }
    for (const conf of m.conference.values()) {
      for (const sd of conf) {
        const w = acc.get(sd.franchise)!;
        if (sd.divisionWinner) w.division++;
        if (sd.seed != null) {
          w.playoff++;
          w.seed[sd.seed - 1]++;
          if (sd.seed <= byes) w.bye++;
        }
      }
    }
  }
  return teams.map((t) => {
    const w = acc.get(t)!;
    return {
      franchise: t,
      p_playoff: w.playoff / sims,
      p_division: w.division / sims,
      p_bye: w.bye / sims,
      mean_wins: w.wins / sims,
      p_seed: w.seed.map((n) => n / sims),
    };
  });
}

/** Ratings before a season's first unplayed game, from every played game since 2002. */
export function currentRatings(allPlayed: EloGame[], nextSeason: number): Map<string, number> {
  const { ratings, season } = eloWalk(allPlayed);
  if (season != null && season !== nextSeason) for (const [t, v] of ratings) ratings.set(t, 1500 + (1 - ELO.REG) * (v - 1500));
  return ratings;
}
