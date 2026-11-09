import { describe, expect, it } from 'vitest';
import { isOnNow, londonToUtc, nextUp, untilText, type NextUpItem } from '../lib/myNextUp';

const t = (iso: string) => Date.parse(iso);

describe('londonToUtc', () => {
  it('reads UK wall-clock time in winter and summer', () => {
    expect(new Date(londonToUtc('2026-11-21', '15:00:00')).toISOString()).toBe('2026-11-21T15:00:00.000Z');
    expect(new Date(londonToUtc('2027-04-10', '15:00:00')).toISOString()).toBe('2027-04-10T14:00:00.000Z');
  });
});

describe('nextUp', () => {
  const now = t('2026-11-09T18:30:00Z');
  const items: NextUpItem[] = [
    { key: 'fpl', kind: 'fpl', title: 'FPL Gameweek 11 deadline', at: t('2026-11-21T11:00:00Z') },
    { key: 'game:1', kind: 'club', title: 'Aston Villa v Sunderland', at: t('2026-11-21T15:00:00Z') },
    { key: 'intl', kind: 'intl', title: 'England v Wales', at: t('2026-11-12T19:45:00Z') },
    { key: 'old', kind: 'followed', title: 'Long gone', at: t('2026-11-08T14:00:00Z') },
    { key: 'past-deadline', kind: 'fpl', title: 'Old deadline', at: t('2026-11-09T18:00:00Z') },
  ];

  it('orders by time and drops what has finished', () => {
    expect(nextUp(items, now).map((i) => i.key)).toEqual(['intl', 'fpl', 'game:1']);
  });

  it('keeps a game in its first two hours as on now, but not a passed deadline', () => {
    const live: NextUpItem = { key: 'live', kind: 'club', title: 'On now', at: t('2026-11-09T17:45:00Z') };
    const out = nextUp([...items, live], now);
    expect(out[0].key).toBe('live');
    expect(isOnNow(out[0], now)).toBe(true);
    expect(out.some((i) => i.key === 'past-deadline')).toBe(false);
  });

  it('shows a game two followed clubs share once', () => {
    const a: NextUpItem = { key: 'game:7', kind: 'club', title: 'A v B', at: t('2026-11-10T19:00:00Z') };
    const b: NextUpItem = { ...a, kind: 'followed' };
    expect(nextUp([b, a], now)).toEqual([a]);
  });
});

describe('untilText', () => {
  const now = t('2026-11-09T18:30:00Z');
  it('says minutes, hours, tomorrow or days', () => {
    expect(untilText(t('2026-11-09T18:50:00Z'), now)).toBe('in 20 min');
    expect(untilText(t('2026-11-09T21:30:00Z'), now)).toBe('in 3 hours');
    expect(untilText(t('2026-11-10T20:00:00Z'), now)).toBe('tomorrow');
    expect(untilText(t('2026-11-21T11:00:00Z'), now)).toBe('in 12 days');
  });
});
