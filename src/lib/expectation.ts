// ============================================================================
// src/lib/expectation.ts
//
// How good a result was, given how hard the fixture was (Chris, 5 Oct 2026,
// after Tennis's upset flag). One rule for every sport: the pre-match chance
// comes from the closing betting market, as Tennis's does.
//
//   * Football: the average closing 1X2 odds (match_odds, bookmaker 'Avg'),
//     bookmaker margin removed by normalising -- the same numbers as the
//     market_closing_lines view.
//   * NFL: the closing spread turned into a win chance by the margin curve
//     (src/lib/nflMargin.ts), ties counting half.
//
// Flags: an UPSET is a win when the team's chance was under a third; a SHOCK
// is a defeat when it was over two thirds. Over a season, points (football:
// 3 a win, 1 a draw) or wins (NFL) are set against what those chances add up
// to. Thresholds are a first cut; revisit with Chris.
// ============================================================================

import { marginDistribution } from './nflMargin';

export const UPSET_BELOW = 1 / 3;
export const SHOCK_ABOVE = 2 / 3;

export type Outcome = 'W' | 'D' | 'L';
export type ResultFlagKind = 'upset' | 'shock';

/** Win / draw / lose chances from decimal odds, bookmaker margin removed. */
export function chancesFromOdds(priceWin: number, priceDraw: number | null, priceLose: number): { win: number; draw: number; lose: number } | null {
  if (!(priceWin > 1) || !(priceLose > 1) || (priceDraw != null && !(priceDraw > 1))) return null;
  const w = 1 / priceWin;
  const d = priceDraw != null ? 1 / priceDraw : 0;
  const l = 1 / priceLose;
  const z = w + d + l;
  return { win: w / z, draw: d / z, lose: l / z };
}

/** NFL: the home side's chance from the closing spread (nflverse sign: + =
 * home favoured), ties counting half. */
export function homeChanceFromSpread(spreadLine: number): number {
  const dist = marginDistribution(spreadLine);
  let p = 0;
  for (const [m, q] of dist) p += m > 0 ? q : m === 0 ? q / 2 : 0;
  return p;
}

export function resultFlag(winChance: number | null | undefined, outcome: Outcome | null | undefined): ResultFlagKind | null {
  if (winChance == null || !outcome) return null;
  if (outcome === 'W' && winChance < UPSET_BELOW) return 'upset';
  if (outcome === 'L' && winChance > SHOCK_ABOVE) return 'shock';
  return null;
}

export type SeasonVsExpected = { played: number; actual: number; expected: number; upsets: number; shocks: number };

/** Football: points against expected points (3·win + draw), over the games
 * that have both a result and a market. */
export function pointsVsExpected(rows: { outcome: Outcome | null; win?: number | null; draw?: number | null }[]): SeasonVsExpected {
  const out: SeasonVsExpected = { played: 0, actual: 0, expected: 0, upsets: 0, shocks: 0 };
  for (const r of rows) {
    if (!r.outcome || r.win == null || r.draw == null) continue;
    out.played++;
    out.actual += r.outcome === 'W' ? 3 : r.outcome === 'D' ? 1 : 0;
    out.expected += 3 * r.win + r.draw;
    const f = resultFlag(r.win, r.outcome);
    if (f === 'upset') out.upsets++;
    else if (f === 'shock') out.shocks++;
  }
  return out;
}

/** NFL: wins (ties half) against expected wins. */
export function winsVsExpected(rows: { outcome: Outcome | null; win?: number | null }[]): SeasonVsExpected {
  const out: SeasonVsExpected = { played: 0, actual: 0, expected: 0, upsets: 0, shocks: 0 };
  for (const r of rows) {
    if (!r.outcome || r.win == null) continue;
    out.played++;
    out.actual += r.outcome === 'W' ? 1 : r.outcome === 'D' ? 0.5 : 0;
    out.expected += r.win;
    const f = resultFlag(r.win, r.outcome);
    if (f === 'upset') out.upsets++;
    else if (f === 'shock') out.shocks++;
  }
  return out;
}

const signed = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** "14 points v 11.2 expected (+2.8) · 2 upsets, 1 shock" */
export function vsExpectedText(s: SeasonVsExpected, unit: 'points' | 'wins'): string {
  if (s.played === 0) return '';
  const flags = [s.upsets ? `${s.upsets} upset${s.upsets === 1 ? '' : 's'}` : '', s.shocks ? `${s.shocks} shock${s.shocks === 1 ? '' : 's'}` : ''].filter(Boolean).join(', ');
  return `${fmt(s.actual)} ${unit} v ${s.expected.toFixed(1)} expected (${signed(s.actual - s.expected)})${flags ? ` · ${flags}` : ''}`;
}

export const chanceText = (p: number | null | undefined) => (p == null ? '–' : `${Math.round(p * 100)}%`);

/** NFL: one team's pre-game win chance from the closing spread. */
export function nflTeamChance(g: { spread_line: number | null; home_franchise: string }, franchise: string): number | null {
  if (g.spread_line == null) return null;
  const p = homeChanceFromSpread(Number(g.spread_line));
  return g.home_franchise === franchise ? p : 1 - p;
}
