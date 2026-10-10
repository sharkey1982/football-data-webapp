// Shared formatting for the Shark Fantasy pages.
import type { SfPlayer } from '../../lib/sharkFantasyApi';

/** "Sun 18 Oct, 12:00" in UK time. */
export function when(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

export const price = (tenths: number) => (tenths / 10).toFixed(1);
export const xp = (v: number | null | undefined) => (v == null ? '–' : v.toFixed(1));

export const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'] as const;

/** Out until a later round (injury or ban), as seen before `round`. */
export const unavailable = (p: SfPlayer, round: number | null) => round != null && p.available_from > round;

export const BOT_LABEL: Record<string, string> = {
  optimiser: 'Bot: optimiser', template: 'Bot: template', setforget: 'Bot: set and forget', chaser: 'Bot: points chaser', random: 'Bot: random',
};
