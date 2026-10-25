// Range views for fixture-type lists (Chris, 25 Oct 2026: "a way to toggle
// month, week and today only type views"). Shared by /fixtures, Results
// Projections and the TV guides through components/RangeControl.
//
// Every date is a UK calendar date 'YYYY-MM-DD' (lib/ukDate), so a week or
// month never shifts by a day at midnight BST or over the clocks change.

import { addIsoDays } from './ukDate';

/** 'next' = next matchday (the default); 'all' = everything listed (TV guides). */
export type DateRange = 'next' | 'today' | 'week' | 'month' | 'all';

export const RANGE_LABELS: Record<DateRange, string> = {
  next: 'Next matchday',
  today: 'Today',
  week: 'This week',
  month: 'This month',
  all: 'All upcoming',
};

/** ?range= value read from the URL; anything unknown gives null (use the page default). */
export function parseRange(value: string | null | undefined, allowed: readonly DateRange[]): DateRange | null {
  return value && (allowed as readonly string[]).includes(value) ? (value as DateRange) : null;
}

/** Day of the week of an ISO date, Monday = 0 ... Sunday = 6. */
function mondayIndex(iso: string): number {
  return (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** Inclusive start and end dates of a fixed range around `today` (UK date). */
export function rangeBounds(range: 'today' | 'week' | 'month', today: string): { start: string; end: string } {
  if (range === 'today') return { start: today, end: today };
  if (range === 'week') {
    const start = addIsoDays(today, -mondayIndex(today));
    return { start, end: addIsoDays(start, 6) };
  }
  const [y, m] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return { start: `${y}-${mm}-01`, end: `${y}-${mm}-${String(last).padStart(2, '0')}` };
}

/** Every date from start to end inclusive. */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end && out.length < 400; d = addIsoDays(d, 1)) out.push(d);
  return out;
}

/** The first date with games after `after`, or null. */
export function nextDateAfter(dates: Iterable<string>, after: string): string | null {
  let best: string | null = null;
  for (const d of dates) if (d > after && (best === null || d < best)) best = d;
  return best;
}

/** Heading for an empty range, e.g. "No games today" / "No games this week". */
export function emptyRangeText(range: DateRange): string {
  if (range === 'today') return 'No games today';
  if (range === 'week') return 'No games this week';
  if (range === 'month') return 'No games this month';
  return 'No games';
}

/** A week or month range moved back or forward: the first day of the new one. */
export function stepRange(range: 'week' | 'month', anchor: string, dir: -1 | 1): string {
  const { start } = rangeBounds(range, anchor);
  if (range === 'week') return addIsoDays(start, 7 * dir);
  const [y, m] = start.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + dir, 1));
  return d.toISOString().slice(0, 10);
}

const SHORT = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** What a range covers: 'Mon 19 Oct to Sun 25 Oct', 'October 2026', 'Sun 25 Oct'. */
export function rangeCaption(range: 'today' | 'week' | 'month', anchor: string): string {
  const { start, end } = rangeBounds(range, anchor);
  if (range === 'today') return SHORT(start);
  if (range === 'week') return `${SHORT(start)} to ${SHORT(end)}`;
  return new Date(`${start}T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** 'Saturday 31 October' for an ISO date (calendar date, no time zone shift). */
export function longDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}
