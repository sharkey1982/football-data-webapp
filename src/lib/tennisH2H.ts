// ============================================================================
// src/lib/tennisH2H.ts
//
// Head to head between two players (5 Oct 2026): the record overall, by
// surface and by level, finals, the current run, and every meeting. Pure --
// the page and its tests pass the meetings in (public.tennis_matches where
// the two met). Walkovers are listed but don't count in the record.
// ============================================================================

import { byPlayOrder, type TennisMatch } from './tennisStats';

export type Split = { key: string; a: number; b: number };
export type H2HSummary = {
  a: number;
  b: number;
  walkovers: number;
  bySurface: Split[];
  byLevel: Split[];
  finals: { a: number; b: number };
  /** Current run of wins: who and how many (played meetings). */
  streak: { who: 'a' | 'b'; n: number } | null;
  meetings: TennisMatch[];
};

const LEVEL_ORDER = ['Grand Slam', 'Finals', '1000', 'Premier', '500', '250'];
const SURFACE_ORDER = ['Hard', 'Clay', 'Grass', 'Carpet'];

export function h2hSummary(meetings: TennisMatch[], idA: number, idB: number): H2HSummary {
  const rows = meetings.filter((m) => (m.winner_id === idA && m.loser_id === idB) || (m.winner_id === idB && m.loser_id === idA)).sort(byPlayOrder);
  const played = rows.filter((m) => m.played);
  const split = (key: (m: TennisMatch) => string | null, order: string[]) => {
    const map = new Map<string, Split>();
    for (const m of played) {
      const k = key(m);
      if (!k) continue;
      const s = map.get(k) ?? { key: k, a: 0, b: 0 };
      if (m.winner_id === idA) s.a++;
      else s.b++;
      map.set(k, s);
    }
    return [...map.values()].sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key));
  };
  let streak: H2HSummary['streak'] = null;
  for (const m of [...played].reverse()) {
    const who = m.winner_id === idA ? 'a' : 'b';
    if (!streak) streak = { who, n: 1 };
    else if (streak.who === who) streak.n++;
    else break;
  }
  const finals = played.filter((m) => m.round === 'The Final');
  return {
    a: played.filter((m) => m.winner_id === idA).length,
    b: played.filter((m) => m.winner_id === idB).length,
    walkovers: rows.length - played.length,
    bySurface: split((m) => m.surface_group, SURFACE_ORDER),
    byLevel: split((m) => m.level, LEVEL_ORDER),
    finals: { a: finals.filter((m) => m.winner_id === idA).length, b: finals.filter((m) => m.winner_id === idB).length },
    streak,
    meetings: [...rows].reverse(),
  };
}

export function h2hSentence(nameA: string, nameB: string, s: H2HSummary): string {
  const n = s.a + s.b;
  if (n === 0) return `${nameA} and ${nameB} have not played each other at tour level${s.walkovers ? ' (one walkover only)' : ''}.`;
  const lead = s.a === s.b ? `${nameA} and ${nameB} are level at ${s.a}–${s.b}` : s.a > s.b ? `${nameA} leads ${nameB} ${s.a}–${s.b}` : `${nameB} leads ${nameA} ${s.b}–${s.a}`;
  const run = s.streak && s.streak.n >= 2 ? `; ${s.streak.who === 'a' ? nameA : nameB} has won the last ${s.streak.n}` : '';
  return `${lead} in ${n} tour-level meeting${n === 1 ? '' : 's'}${run}.`;
}
