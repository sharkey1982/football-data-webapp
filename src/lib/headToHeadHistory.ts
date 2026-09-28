// ============================================================================
// src/lib/headToHeadHistory.ts
//
// The full record between two clubs from every meeting in the archive
// (English leagues from 1992/93, plus cups and other leagues where held):
// wins each way, goals, venue splits, biggest wins, longest unbeaten runs,
// most common scorelines, first meeting and competitions. Pure: takes the
// meetings (newest first, as getHeadToHead returns them), from team A's side.
// ============================================================================

import type { MatchWithNames } from './matchesApi';

export type Tally = { aWins: number; draws: number; bWins: number };

export type Run = { length: number; from: string; to: string; ongoing: boolean };

export type HeadToHeadHistory = {
  played: number;
  overall: Tally;
  aGoals: number;
  bGoals: number;
  /** Team A at home, team B at home. */
  aHome: Tally;
  bHome: Tally;
  biggestAWin: MatchWithNames | null;
  biggestBWin: MatchWithNames | null;
  /** Longest run of meetings each side went without losing. */
  longestUnbeatenA: Run | null;
  longestUnbeatenB: Run | null;
  /** From team A's side ("2-1" = A scored 2), most frequent first. */
  commonScores: { score: string; count: number }[];
  first: MatchWithNames | null;
  competitions: { name: string; played: number }[];
};

type Outcome = 'A' | 'D' | 'B';

function goals(m: MatchWithNames, aId: number): [number, number] | null {
  const h = m.full_time_home_goals;
  const a = m.full_time_away_goals;
  if (h == null || a == null) return null;
  return m.home_team_id === aId ? [h, a] : [a, h];
}

function outcome(g: [number, number]): Outcome {
  return g[0] > g[1] ? 'A' : g[0] < g[1] ? 'B' : 'D';
}

function longestRun(ordered: { m: MatchWithNames; o: Outcome }[], unbeatenFor: 'A' | 'B'): Run | null {
  let best: Run | null = null;
  let start = -1;
  const loser: Outcome = unbeatenFor === 'A' ? 'B' : 'A';
  for (let i = 0; i <= ordered.length; i++) {
    const unbeaten = i < ordered.length && ordered[i].o !== loser;
    if (unbeaten && start < 0) start = i;
    if (!unbeaten && start >= 0) {
      const length = i - start;
      if (!best || length > best.length) {
        best = { length, from: ordered[start].m.match_date, to: ordered[i - 1].m.match_date, ongoing: i === ordered.length };
      }
      start = -1;
    }
  }
  return best && best.length >= 2 ? best : null;
}

export function summariseHeadToHead(meetings: MatchWithNames[], aId: number): HeadToHeadHistory {
  const played = meetings
    .map((m) => ({ m, g: goals(m, aId) }))
    .filter((x): x is { m: MatchWithNames; g: [number, number] } => x.g !== null)
    .sort((x, y) => x.m.match_date.localeCompare(y.m.match_date));
  const blank = (): Tally => ({ aWins: 0, draws: 0, bWins: 0 });
  const overall = blank();
  const aHome = blank();
  const bHome = blank();
  let aGoals = 0;
  let bGoals = 0;
  let biggestA: { m: MatchWithNames; margin: number; scored: number } | null = null;
  let biggestB: { m: MatchWithNames; margin: number; scored: number } | null = null;
  const scores = new Map<string, number>();
  const comps = new Map<string, number>();
  const ordered: { m: MatchWithNames; o: Outcome }[] = [];

  for (const { m, g } of played) {
    const o = outcome(g);
    ordered.push({ m, o });
    const add = (t: Tally) => {
      if (o === 'A') t.aWins++;
      else if (o === 'B') t.bWins++;
      else t.draws++;
    };
    add(overall);
    add(m.home_team_id === aId ? aHome : bHome);
    aGoals += g[0];
    bGoals += g[1];
    const margin = Math.abs(g[0] - g[1]);
    const scored = Math.max(g[0], g[1]);
    // Biggest win: widest margin, then most goals, then the more recent.
    if (o === 'A' && (!biggestA || margin > biggestA.margin || (margin === biggestA.margin && scored >= biggestA.scored))) biggestA = { m, margin, scored };
    if (o === 'B' && (!biggestB || margin > biggestB.margin || (margin === biggestB.margin && scored >= biggestB.scored))) biggestB = { m, margin, scored };
    const key = `${g[0]}-${g[1]}`;
    scores.set(key, (scores.get(key) ?? 0) + 1);
    const comp = m.league_name || 'Other';
    comps.set(comp, (comps.get(comp) ?? 0) + 1);
  }

  return {
    played: played.length,
    overall,
    aGoals,
    bGoals,
    aHome,
    bHome,
    biggestAWin: biggestA?.m ?? null,
    biggestBWin: biggestB?.m ?? null,
    longestUnbeatenA: longestRun(ordered, 'A'),
    longestUnbeatenB: longestRun(ordered, 'B'),
    commonScores: [...scores.entries()]
      .map(([score, count]) => ({ score, count }))
      .sort((x, y) => y.count - x.count || x.score.localeCompare(y.score))
      .slice(0, 5),
    first: played[0]?.m ?? null,
    competitions: [...comps.entries()].map(([name, n]) => ({ name, played: n })).sort((x, y) => y.played - x.played),
  };
}

/** One plain sentence for the top of the section. */
export function headToHeadSentence(h: HeadToHeadHistory, aName: string, bName: string): string {
  if (h.played === 0) return '';
  const since = h.first ? ` since ${h.first.season_label ? seasonText(h.first.season_label) : h.first.match_date.slice(0, 4)}` : '';
  const { aWins, draws, bWins } = h.overall;
  const meetings = `${h.played} ${h.played === 1 ? 'meeting' : 'meetings'}`;
  if (aWins === bWins) return `${aName} and ${bName} have won ${aWins} each in ${meetings}${since}, with ${draws} ${draws === 1 ? 'draw' : 'draws'}.`;
  const [lead, leadWins, trail, trailWins] = aWins > bWins ? [aName, aWins, bName, bWins] : [bName, bWins, aName, aWins];
  return `${lead} have won ${leadWins} of ${meetings} with ${trail}${since}, ${trail} ${trailWins}, with ${draws} ${draws === 1 ? 'draw' : 'draws'}.`;
}

/** "9293" -> "1992/93", "2627" -> "2026/27"; a calendar-year label ("2024")
 * or anything else unchanged. */
export function seasonText(label: string): string {
  if (/^\d{4}$/.test(label)) {
    const y1 = Number(label.slice(0, 2));
    const y2 = Number(label.slice(2));
    if ((y1 + 1) % 100 === y2) return `${(y1 >= 50 ? 1900 : 2000) + y1}/${label.slice(2)}`;
  }
  return label;
}
