// ============================================================================
// src/lib/myNextUp.ts
//
// "Next up" for My FixtureShark (Chris, 9 Nov 2026: "On my personalised home
// page - it should show the thing happening next at the top"). Everything the
// visitor follows that has a time -- their club's next game, followed clubs,
// the FPL deadline, their international and NFL teams -- in time order. A
// game that kicked off up to two hours ago still counts (it is on now); a
// deadline counts only until it passes.
// ============================================================================

export type NextUpItem = {
  key: string;
  kind: 'club' | 'followed' | 'fpl' | 'intl' | 'nfl';
  /** The headline, e.g. "Aston Villa v Sunderland" or "FPL GW11 deadline". */
  title: string;
  /** The competition or a short label, e.g. "Premier League". */
  label?: string | null;
  at: number;
  /** No kick-off time known: show the day only. */
  dayOnly?: boolean;
  to?: string | null;
};

const LIVE_WINDOW_MS = 2 * 3600 * 1000;

/** Milliseconds for a UK wall-clock date and time ("2026-11-21", "15:00:00"). */
export function londonToUtc(date: string, time?: string | null): number {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = (time ?? '12:00').split(':').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh || 0, mm || 0);
  // London's offset at that moment (0 in winter, +1 in summer).
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(asUtc));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const shown = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return asUtc - (shown - asUtc);
}

/** Whether an item is happening now (a game in its first two hours). */
export function isOnNow(item: NextUpItem, now: number): boolean {
  return item.kind !== 'fpl' && item.at <= now && item.at > now - LIVE_WINDOW_MS;
}

/** Upcoming items, soonest first; one entry per game even if two followed clubs meet. */
export function nextUp(items: NextUpItem[], now: number): NextUpItem[] {
  const seen = new Set<string>();
  return items
    .filter((i) => Number.isFinite(i.at) && (i.kind === 'fpl' ? i.at > now : i.at > now - LIVE_WINDOW_MS))
    .sort((a, b) => a.at - b.at || (a.kind === 'club' ? -1 : b.kind === 'club' ? 1 : 0))
    .filter((i) => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}

/** "in 3 hours", "tomorrow", "in 12 days". */
export function untilText(at: number, now: number): string {
  const ms = at - now;
  if (ms <= 0) return 'on now';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(ms / 3600000);
  if (hours < 24) return `in ${hours} hour${hours === 1 ? '' : 's'}`;
  const day = (t: number) => Math.floor(londonToUtcDay(t) / 86400000);
  const days = day(at) - day(now);
  return days <= 1 ? 'tomorrow' : `in ${days} days`;
}

/** Midnight UTC of the London calendar date containing t (for day counts). */
function londonToUtcDay(t: number): number {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
