// Unit tests for src/lib/intlMatch.ts: match page addresses and the browser
// copy of model IP1 (checked against scripts/intl_projections.py's output).
import { describe, it, expect } from 'vitest';
import { intlMatchSlug, ip1Grid, parseIntlMatchSlug, summariseGrid } from '../lib/intlMatch';

const P = [0.08, 0.29, 0.8, 0.01, 0.09, 0.19, -0.05, -0.12];

describe('intlMatch', () => {
  it('round-trips the page address, including hyphenated slugs', () => {
    const s = intlMatchSlug('2026-11-14', 'bosnia-and-herzegovina', 'north-macedonia');
    expect(s).toBe('2026-11-14-bosnia-and-herzegovina-v-north-macedonia');
    expect(parseIntlMatchSlug(s)).toEqual({ date: '2026-11-14', home: 'bosnia-and-herzegovina', away: 'north-macedonia' });
    expect(parseIntlMatchSlug('nonsense')).toBeNull();
  });

  it('matches the Python model to three decimals', () => {
    const a = summariseGrid(ip1Grid(P, 2000, 1600, false, 'nations_league'));
    expect([a.pHome, a.pDraw, a.pAway].map((x) => +x.toFixed(4))).toEqual([0.8818, 0.0894, 0.0287]);
    expect([+a.xgHome.toFixed(2), +a.xgAway.toFixed(2)]).toEqual([3.12, 0.47]);
    expect(a.top[0]).toMatchObject({ h: 3, a: 0 });
    const b = summariseGrid(ip1Grid(P, 1700, 1800, true, 'friendly'));
    expect([b.pHome, b.pDraw, b.pAway].map((x) => +x.toFixed(4))).toEqual([0.2433, 0.2999, 0.4568]);
    expect(b.top[0]).toMatchObject({ h: 0, a: 1 });
  });
});
