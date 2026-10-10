// ============================================================================
// Shark Fantasy Phase 3a: the bot test (design §4.4).
//
//   npx tsx scripts/sf/bots.ts [seasons=100] [--report path]
//
// Plays bot leagues over many generated worlds and checks:
//   1. skill beats luck: optimiser bots beat random bots (proposed pass:
//      the optimisers' average beats the randoms' average in ≥ 80% of seasons);
//   2. a once-a-week player isn't punished: set-and-forget bots' median rank
//      is within the top 60%;
//   3. the public projection is honest: projected against actual points by
//      bins, and Brier scores for clean sheets and goals.
// Writes a markdown report (default docs/shark-fantasy/bots.md).
// No database, nothing live.
// ============================================================================
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import highsLoader from 'highs';
import { runLeague } from '../../src/sharkfantasy/fantasy/league';
import type { LeagueResult } from '../../src/sharkfantasy/fantasy/league';
import { BOT_KINDS } from '../../src/sharkfantasy/fantasy/bots';
import type { BotKind, Solver } from '../../src/sharkfantasy/fantasy/bots';
import { GAME_RULES_V1 } from '../../src/sharkfantasy/fantasy/rules';
import { ENGINE_VERSION } from '../../src/sharkfantasy/engine/params';

const args = process.argv.slice(2);
const seasons = Number(args[0] ?? 100);
const ri = args.indexOf('--report'), reportPath = ri >= 0 ? args[ri + 1] : 'docs/shark-fantasy/bots.md';
const LINEUP: Record<BotKind, number> = { optimiser: 4, template: 4, setforget: 4, chaser: 4, random: 8 };
const N = Object.values(LINEUP).reduce((a, b) => a + b, 0);

let highs = await highsLoader();
// highs-js grows its memory over many solves: a fresh instance every 10 seasons
const solve: Solver = (lp) => highs.solve(lp) as unknown as ReturnType<Solver>;

const t0 = Date.now();
const leagues: LeagueResult[] = [];
for (let s = 0; s < seasons; s++) {
  if (s % 10 === 0 && s) highs = await highsLoader();
  leagues.push(runLeague(`bots-${s + 1}`, LINEUP, solve));
  if ((s + 1) % 10 === 0) console.log(`${s + 1}/${seasons} seasons, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
const secs = (Date.now() - t0) / 1000;

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const median = (xs: number[]) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : 0; };
const pct = (x: number) => `${(100 * x).toFixed(0)}%`;

// 1 and 2: by kind
const byKind = Object.fromEntries(BOT_KINDS.map(k => [k, { totals: [] as number[], rankPct: [] as number[], hits: [] as number[], transfers: [] as number[], wildcards: 0, wins: 0 }]));
let optBeatsRandom = 0, pairWins = 0, pairs = 0, setforgetBeatsRandom = 0;
for (const L of leagues) {
  for (const b of L.bots) {
    const k = byKind[b.kind];
    k.totals.push(b.total); k.rankPct.push(b.rank / N); k.hits.push(b.hits); k.transfers.push(b.transfers);
    if (b.wildcardRound) k.wildcards++;
    if (b.rank === 1) k.wins++;
  }
  const t = (kind: BotKind) => L.bots.filter(b => b.kind === kind).map(b => b.total);
  if (mean(t('optimiser')) > mean(t('random'))) optBeatsRandom++;
  if (mean(t('setforget')) > mean(t('random'))) setforgetBeatsRandom++;
  for (const o of t('optimiser')) for (const r of t('random')) { pairs++; if (o > r) pairWins++; else if (o === r) pairWins += 0.5; }
}
const rule1 = optBeatsRandom / seasons, rule2 = median(byKind.setforget.rankPct);
const pass1 = rule1 >= 0.8, pass2 = rule2 <= 0.6;

// 3: the projection
const rows = leagues.flatMap(L => L.projections);
const bins = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 99]].map(([lo, hi]) => {
  const r = rows.filter(x => x.xp >= lo && x.xp < hi);
  return { label: hi === 99 ? `${lo}+` : `${lo}–${hi}`, n: r.length, xp: mean(r.map(x => x.xp)), actual: mean(r.map(x => x.actual)) };
});
const corr = (() => {
  const mx = mean(rows.map(r => r.xp)), my = mean(rows.map(r => r.actual));
  let sxy = 0, sxx = 0, syy = 0;
  for (const r of rows) { sxy += (r.xp - mx) * (r.actual - my); sxx += (r.xp - mx) ** 2; syy += (r.actual - my) ** 2; }
  return sxy / Math.sqrt(sxx * syy);
})();
const brier = (ps: number[], ys: boolean[]) => mean(ps.map((p, i) => (p - (ys[i] ? 1 : 0)) ** 2));
const back = rows.filter(r => (r.position === 'GK' || r.position === 'DEF') && r.pCS > 0);
const csRate = mean(back.map(r => (r.cs ? 1 : 0)));
const csBrier = brier(back.map(r => r.pCS), back.map(r => r.cs)), csBase = brier(back.map(() => csRate), back.map(r => r.cs));
const att = rows.filter(r => r.xGoals > 0);
const gProb = att.map(r => 1 - Math.exp(-r.xGoals));
const gRate = mean(att.map(r => (r.goals > 0 ? 1 : 0)));
const gBrier = brier(gProb, att.map(r => r.goals > 0)), gBase = brier(att.map(() => gRate), att.map(r => r.goals > 0));
const totalXp = mean(rows.map(r => r.xp)), totalActual = mean(rows.map(r => r.actual));
const priceMoves = mean(leagues.map(L => L.priceMoves));

const kindRows = BOT_KINDS.map(k => {
  const x = byKind[k];
  return `| ${k} | ${LINEUP[k]} | ${mean(x.totals).toFixed(0)} | ${median(x.totals).toFixed(0)} | ${pct(median(x.rankPct))} | ${pct(x.wins / seasons)} | ${mean(x.transfers).toFixed(1)} | ${mean(x.hits).toFixed(1)} | ${pct(x.wildcards / (seasons * LINEUP[k]))} |`;
}).join('\n');

const report = `# Shark Fantasy: bot test (Phase 3a)

Generated by \`npx tsx scripts/sf/bots.ts ${seasons}\` (${secs.toFixed(0)} s). Engine ${ENGINE_VERSION}, rules ${GAME_RULES_V1.version}.
${seasons} seasons, each in a different generated world, with ${N} bots: ${BOT_KINDS.map(k => `${LINEUP[k]} ${k}`).join(', ')}.
Bots see only the public view (scouting reports with noise, results, the projection), never the hidden attributes.

## Pass rules (proposed, design §4.4)

| Rule | Result | Target | |
|---|---|---|---|
| Optimiser bots' average beats random bots' average | ${pct(rule1)} of seasons | ≥ 80% | ${pass1 ? 'PASS' : 'FAIL'} |
| Set-and-forget median rank | top ${pct(rule2)} | top 60% | ${pass2 ? 'PASS' : 'FAIL'} |

Also: an optimiser bot beats a random bot head to head ${pct(pairWins / pairs)} of the time; set-and-forget bots' average beats the random bots' in ${pct(setforgetBeatsRandom / seasons)} of seasons.

## By kind

| Kind | Bots | Mean total | Median total | Median rank | Season wins | Transfers | Hits (pts) | Played wildcard |
|---|---|---|---|---|---|---|---|---|
${kindRows}

(Season wins: the share of seasons a bot of that kind topped the ${N}-bot league; ties count for each.)

## The public projection

Projected points (made before each deadline from the public view) against what happened, ${rows.length.toLocaleString()} player-rounds:

| Projected | Player-rounds | Mean projected | Mean actual |
|---|---|---|---|
${bins.map(b => `| ${b.label} | ${b.n.toLocaleString()} | ${b.xp.toFixed(2)} | ${b.actual.toFixed(2)} |`).join('\n')}

- Overall: projected ${totalXp.toFixed(2)} a player a round, actual ${totalActual.toFixed(2)}; correlation ${corr.toFixed(2)}.
- Clean sheets (keepers and defenders with a projected chance): Brier ${csBrier.toFixed(3)} against ${csBase.toFixed(3)} for a flat rate.
- Scoring a goal (every player with a projection): Brier ${gBrier.toFixed(4)} against ${gBase.toFixed(4)} for a flat rate.

Prices moved ${priceMoves.toFixed(0)} times a season (about ${(priceMoves / 9 / 200 * 100).toFixed(0)}% of players a week).
`;
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, report);
console.log(report);
if (!pass1 || !pass2) process.exitCode = 1;
