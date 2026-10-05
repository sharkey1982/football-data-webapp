// ============================================================================
// scripts/nfl_playoff_lab.ts
//
// NFL Model Lab, experiment N2 (registered in
// supabase/migrations/20261005200000_lab_nfl_playoffs_register.sql before it
// was scored): play-off chances from the hot Elo season simulation v the same
// simulation with no model. Uses the site's own code (src/lib/nflPlayoffSim.ts,
// src/lib/nflTiebreak.ts).
//
//   npx vite-node scripts/nfl_playoff_lab.ts -- tuning|validation [games.csv]
//   npx vite-node scripts/nfl_playoff_lab.ts -- holdout [games.csv]   (once)
//
// Prints JSON results. Writes nothing: scorings are recorded separately.
// ============================================================================

import { readFileSync } from 'node:fs';
import type { NflGame, NflStanding } from '../src/lib/nflApi';
import { buildStandingsMath } from '../src/lib/nflTiebreak';
import { eloWalk, simulateSeason, ELO, type EloGame } from '../src/lib/nflPlayoffSim';

const SPLITS: Record<string, number[]> = {
  tuning: [2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
  validation: [2024],
  holdout: [2025],
};
const CHECKPOINTS = [4, 8, 12];
const SIMS = 2000;
const GAMES_URL = 'https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv';
const RELOCATED: Record<string, string> = { OAK: 'LV', SD: 'LAC', STL: 'LA' };
const DIV: Record<string, [NflStanding['conference'], NflStanding['division']]> = {
  BUF: ['AFC', 'East'], MIA: ['AFC', 'East'], NE: ['AFC', 'East'], NYJ: ['AFC', 'East'],
  BAL: ['AFC', 'North'], CIN: ['AFC', 'North'], CLE: ['AFC', 'North'], PIT: ['AFC', 'North'],
  HOU: ['AFC', 'South'], IND: ['AFC', 'South'], JAX: ['AFC', 'South'], TEN: ['AFC', 'South'],
  DEN: ['AFC', 'West'], KC: ['AFC', 'West'], LV: ['AFC', 'West'], LAC: ['AFC', 'West'],
  DAL: ['NFC', 'East'], NYG: ['NFC', 'East'], PHI: ['NFC', 'East'], WAS: ['NFC', 'East'],
  CHI: ['NFC', 'North'], DET: ['NFC', 'North'], GB: ['NFC', 'North'], MIN: ['NFC', 'North'],
  ATL: ['NFC', 'South'], CAR: ['NFC', 'South'], NO: ['NFC', 'South'], TB: ['NFC', 'South'],
  ARI: ['NFC', 'West'], LA: ['NFC', 'West'], SF: ['NFC', 'West'], SEA: ['NFC', 'West'],
};

type G = NflGame & EloGame;

async function loadGames(path?: string): Promise<G[]> {
  const text = path ? readFileSync(path, 'utf8') : await (await fetch(GAMES_URL)).text();
  const lines = text.trim().split('\n');
  const h = lines[0].split(',');
  const ix = (k: string) => h.indexOf(k);
  const code = (c: string) => RELOCATED[c] ?? c;
  return lines
    .slice(1)
    .map((l) => l.split(','))
    .filter((c) => +c[ix('season')] >= 2002)
    .map((c) => ({
      game_id: c[ix('game_id')], season: +c[ix('season')], game_type: c[ix('game_type')], week: +c[ix('week')], gameday: c[ix('gameday')],
      home_franchise: code(c[ix('home_team')]), away_franchise: code(c[ix('away_team')]),
      home_score: c[ix('home_score')] === '' ? null : +c[ix('home_score')], away_score: c[ix('away_score')] === '' ? null : +c[ix('away_score')],
      neutral_site: c[ix('location')] === 'Neutral',
    }) as unknown as G)
    .sort((a, b) => a.gameday.localeCompare(b.gameday) || a.game_id.localeCompare(b.game_id));
}

const rowsFor = (season: number): NflStanding[] =>
  Object.entries(DIV).map(([f, [conference, division]]) => ({ season, franchise: f, team_name: f, conference, division }) as unknown as NflStanding);

function tStat(d: number[], clusters: string[]): { mean: number; t: number } {
  const n = d.length;
  const mean = d.reduce((s, x) => s + x, 0) / n;
  const by = new Map<string, number>();
  d.forEach((x, i) => by.set(clusters[i], (by.get(clusters[i]) ?? 0) + (x - mean)));
  const se = Math.sqrt([...by.values()].reduce((s, x) => s + x * x, 0)) / n;
  return { mean, t: se > 0 ? mean / se : NaN };
}

const ll = (p: number, y: number) => -Math.log(Math.min(1 - 1e-6, Math.max(1e-6, y ? p : 1 - p)));

async function main() {
  const split = process.argv[2] ?? 'tuning';
  const seasons = SPLITS[split];
  if (!seasons) throw new Error(`unknown split ${split}`);
  const all = await loadGames(process.argv[3]);
  const out = { split, sims: SIMS, checkpoints: CHECKPOINTS, n: 0, rows: [] as Record<string, number | string>[] };
  const dPlay: number[] = [], dDiv: number[] = [], dLl: number[] = [], cl: string[] = [];
  const sum = { brier_elo: 0, brier_coin: 0, ll_elo: 0, ll_coin: 0, div_elo: 0, div_coin: 0, wins_elo: 0, wins_coin: 0, wins_pace: 0 };
  for (const season of seasons) {
    const reg = all.filter((g) => g.season === season && g.game_type === 'REG');
    const rows = rowsFor(season);
    const truth = buildStandingsMath(rows, reg);
    const made = new Set([...truth.conference.values()].flat().filter((s) => s.seed != null).map((s) => s.franchise));
    const div = new Set([...truth.conference.values()].flat().filter((s) => s.divisionWinner).map((s) => s.franchise));
    const wins = new Map(rows.map((r) => [r.franchise, 0]));
    for (const g of reg) {
      const w = Number(g.home_score) > Number(g.away_score) ? g.home_franchise : Number(g.away_score) > Number(g.home_score) ? g.away_franchise : null;
      if (w) wins.set(w, wins.get(w)! + 1);
    }
    const nGames = new Map(rows.map((r) => [r.franchise, reg.filter((g) => g.home_franchise === r.franchise || g.away_franchise === r.franchise).length]));
    for (const cp of CHECKPOINTS) {
      const before = all.filter((g) => g.home_score != null && (g.season < season || (g.season === season && g.game_type === 'REG' && g.week <= cp)));
      const { ratings } = eloWalk(before);
      const partial = reg.map((g) => (g.week <= cp ? g : { ...g, home_score: null, away_score: null }));
      const elo = simulateSeason(rows, partial, ratings, SIMS, season * 100 + cp, 'elo');
      const coin = simulateSeason(rows, partial, ratings, SIMS, season * 100 + cp, 'coin');
      const coinBy = new Map(coin.map((x) => [x.franchise, x]));
      for (const e of elo) {
        const c = coinBy.get(e.franchise)!;
        const y = made.has(e.franchise) ? 1 : 0;
        const yd = div.has(e.franchise) ? 1 : 0;
        const be = (e.p_playoff - y) ** 2, bc = (c.p_playoff - y) ** 2;
        const de = (e.p_division - yd) ** 2, dc = (c.p_division - yd) ** 2;
        const playedSoFar = partial.filter((g) => g.home_score != null && (g.home_franchise === e.franchise || g.away_franchise === e.franchise));
        const wonSoFar = playedSoFar.filter((g) => (g.home_franchise === e.franchise ? Number(g.home_score) > Number(g.away_score) : Number(g.away_score) > Number(g.home_score))).length;
        const pace = playedSoFar.length ? (wonSoFar / playedSoFar.length) * nGames.get(e.franchise)! : nGames.get(e.franchise)! / 2;
        sum.brier_elo += be; sum.brier_coin += bc;
        sum.ll_elo += ll(e.p_playoff, y); sum.ll_coin += ll(c.p_playoff, y);
        sum.div_elo += de; sum.div_coin += dc;
        sum.wins_elo += Math.abs(e.mean_wins - wins.get(e.franchise)!);
        sum.wins_coin += Math.abs(c.mean_wins - wins.get(e.franchise)!);
        sum.wins_pace += Math.abs(pace - wins.get(e.franchise)!);
        dPlay.push(be - bc); dDiv.push(de - dc); dLl.push(ll(e.p_playoff, y) - ll(c.p_playoff, y)); cl.push(`${season}-${e.franchise}`);
        out.n++;
      }
      process.stderr.write(`${season} week ${cp} done\n`);
    }
  }
  const n = out.n;
  const t = tStat(dPlay, cl), tl = tStat(dLl, cl), td = tStat(dDiv, cl);
  const res = {
    split, n, sims: SIMS, model: ELO,
    playoff_brier: { elo: +(sum.brier_elo / n).toFixed(4), coin: +(sum.brier_coin / n).toFixed(4), diff: +t.mean.toFixed(4), t: +t.t.toFixed(2) },
    playoff_logloss: { elo: +(sum.ll_elo / n).toFixed(4), coin: +(sum.ll_coin / n).toFixed(4), diff: +tl.mean.toFixed(4), t: +tl.t.toFixed(2) },
    division_brier: { elo: +(sum.div_elo / n).toFixed(4), coin: +(sum.div_coin / n).toFixed(4), diff: +td.mean.toFixed(4), t: +td.t.toFixed(2) },
    wins_mae: { elo: +(sum.wins_elo / n).toFixed(3), coin: +(sum.wins_coin / n).toFixed(3), current_pace: +(sum.wins_pace / n).toFixed(3) },
  };
  console.log(JSON.stringify(res));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
