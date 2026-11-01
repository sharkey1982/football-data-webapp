// ============================================================================
// src/lib/todayYours.ts
//
// Rules for "Yours today" on the Today page (src/components/today/
// YoursToday.tsx): which game a followed club's card shows, how its day is
// worded, and the one-line table position.
// ============================================================================

import type { ClubCard, ClubCardGame, Probs } from './myHomeApi';
import type { DayGame } from './todayApi';
import { addIsoDays } from './ukDate';

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
export const ukDay = (date: string) => dayFmt.format(new Date(`${date}T12:00:00Z`));

/** A club's game, from today's list when it plays today, else its card's next game. */
export type ClubGame = {
  date: string; time: string | null; league: string | null; home: string; away: string; isHome: boolean;
  model: Probs | null; market: Probs | null; tv: string | null; slug: string | null; hg: number | null; ag: number | null;
};

export function clubGame(teamId: number, day: string, games: DayGame[], next: ClubCardGame | null): ClubGame | null {
  const g = games.find((x) => x.homeId === teamId || x.awayId === teamId);
  if (g) {
    return {
      date: day, time: g.time, league: g.league, home: g.home, away: g.away, isHome: g.homeId === teamId, model: g.model, market: g.market,
      tv: g.tv.length ? g.tv.join(', ') : g.notTv ? 'Not on UK TV' : null, slug: g.slug, hg: g.hg, ag: g.ag,
    };
  }
  if (!next) return null;
  return {
    date: next.date, time: next.time ? next.time.slice(0, 5) : null, league: next.league ?? null, home: next.home, away: next.away, isHome: next.isHome,
    model: next.model, market: next.market, tv: next.tv ?? null, slug: next.slug, hg: null, ag: null,
  };
}

/** "Today 15:00", "Tomorrow 16:30", "Sat 7 Nov, 15:00". */
export function whenLabel(date: string, time: string | null, day: string): string {
  const d = date === day ? 'Today' : date === addIsoDays(day, 1) ? 'Tomorrow' : ukDay(date);
  return time ? `${d}${d === 'Today' || d === 'Tomorrow' ? ' ' : ', '}${time}` : d;
}

/** "3rd", "21st". */
export function ordinal(k: number): string {
  const s = k % 100 >= 11 && k % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[k % 10] ?? 'th';
  return `${k}${s}`;
}

/** "Southend are 3rd, 3 points behind Harrogate in 2nd." from the card's table. */
export function tableLine(card: ClubCard): string | null {
  const me = card.table.find((r) => r.teamId === card.team.teamId);
  if (!me) return null;
  const pts = (k: number) => `${k} point${k === 1 ? '' : 's'}`;
  if (me.position === 1) {
    const second = card.table.find((r) => r.position === 2);
    if (!second) return `${card.team.name} are top.`;
    const lead = me.points - second.points;
    return lead === 0 ? `${card.team.name} are top on goal difference from ${second.name}.` : `${card.team.name} are top, ${pts(lead)} clear of ${second.name}.`;
  }
  const above = card.table.find((r) => r.position === me.position - 1);
  if (!above) return `${card.team.name} are ${ordinal(me.position)}.`;
  const gap = above.points - me.points;
  return `${card.team.name} are ${ordinal(me.position)}, ${gap === 0 ? 'level on points with' : `${pts(gap)} behind`} ${above.name} in ${ordinal(above.position)}.`;
}
