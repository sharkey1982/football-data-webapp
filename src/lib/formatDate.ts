// ============================================================================
// src/lib/formatDate.ts
//
// Shared date display formatting. Match/fixture dates are stored as plain
// ISO strings ('YYYY-MM-DD') -- this turns that into something readable
// like "Sat 22 Aug", which is how football fixtures/results are actually
// thought about (by matchday), not as raw ISO dates.
// ============================================================================

const WEEKDAY_ABBREV = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_ABBREV = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Formats an ISO date string ('YYYY-MM-DD') as 'Sat 22 Aug'.
 *
 * Parses the date manually as UTC-anchored (rather than via `new Date(str)`
 * directly, which interprets bare 'YYYY-MM-DD' strings as UTC midnight but
 * then renders weekday/date using the BROWSER's local timezone -- for
 * someone west of UTC, late-evening UTC dates can roll back a day. Since
 * these are calendar dates with no real time-of-day meaning for the day-of-
 * week question, we deliberately compute the weekday from the UTC calendar
 * date rather than letting local-timezone conversion shift it.
 */
export function formatMatchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  if (!year || !month || !day) return isoDate; // fall back to raw string if unparseable

  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = WEEKDAY_ABBREV[date.getUTCDay()];
  const monthName = MONTH_ABBREV[date.getUTCMonth()];

  return `${weekday} ${day} ${monthName}`;
}

/** Same as formatMatchDate but includes the year, e.g. 'Sat 22 Aug 2026' -- useful when a list spans multiple years. */
export function formatMatchDateWithYear(isoDate: string): string {
  const [year] = isoDate.split('-').map(Number);
  if (!year) return isoDate;
  return `${formatMatchDate(isoDate)} ${year}`;
}

/**
 * Formats a full ISO timestamp (e.g. a timestamptz value like
 * '2026-09-12 04:15:00.215121+00') as '12 Sep 2026' -- for "last updated"
 * style captions where the weekday isn't meaningful, just the calendar date.
 */
export function formatRefreshDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp;
  return `${date.getUTCDate()} ${MONTH_ABBREV[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "Sat 19 Sep" from a plain date. Fixed tables rather than Intl: en-GB now
 *  gives "Sept" in some engines (recent ICU, incl. Node and Chrome) and "Sep"
 *  in others, so the same date read differently depending on the browser.
 *  Parsed as UTC, so no timezone can shift the day. */
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function formatShortDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${DAYS[day]} ${d} ${MONTHS[m - 1]}`;
}
