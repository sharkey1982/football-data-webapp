// UK calendar dates as 'YYYY-MM-DD'.
//
// `new Date().toISOString().slice(0, 10)` is the UTC date, which between
// 00:00 and 01:00 BST is still yesterday in the UK (the same class of bug as
// incident 2026-10-11, fixture-list tests failing after midnight). Use these
// wherever "today" means the UK date the visitor is living in.

const UK_PARTS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' });

/** The UK (Europe/London) calendar date of an instant, as 'YYYY-MM-DD'. */
export function ukDateOf(instant: Date | number | string): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  const parts = Object.fromEntries(UK_PARTS.formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Today's UK calendar date, as 'YYYY-MM-DD'. */
export function ukToday(now: Date = new Date()): string {
  return ukDateOf(now);
}

/** An ISO calendar date moved by whole days (calendar arithmetic, no time zone). */
export function addIsoDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
