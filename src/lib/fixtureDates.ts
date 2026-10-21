// Which day a fixture list opens on (Fixtures, Results Projections).

/** The day the list opens on: today when it has fixtures, else the next
 *  day that does, else the last one played. Defaulting to today alone
 *  opened the most-visited page on an empty list most days of the week
 *  (layout review, 21 Oct 2026). */
export function defaultFixtureDate(dates: readonly string[], today: string): string | null {
  if (dates.length === 0) return null;
  let next: string | null = null;
  let last: string | null = null;
  for (const d of dates) {
    if (d === today) return today;
    if (d > today && (next === null || d < next)) next = d;
    if (d < today && (last === null || d > last)) last = d;
  }
  return next ?? last;
}
