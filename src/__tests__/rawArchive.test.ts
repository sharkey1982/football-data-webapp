import { describe, it, expect } from 'vitest';
import { rawRowKey, rowsToArchive, sameRawRow } from '../../scripts/lib/rawArchive';

const r = (date: string, home: string, away: string, extra: Record<string, string> = {}) => ({
  Div: 'E0', Date: date, Time: '15:00', HomeTeam: home, AwayTeam: away, FTHG: '1', FTAG: '0', FTR: 'H', B365H: '2.1', ...extra,
});

describe('raw row archiving for odds', () => {
  it('uses the same row key as the backfill-football-raw edge function', () => {
    expect(rawRowKey('E0', r('12/09/2026', 'Arsenal', 'Leeds'))).toBe('E0|12/09/2026|Arsenal|Leeds');
  });

  it('compares content, not key order or surrounding space', () => {
    expect(sameRawRow({ a: '1', b: '2' }, { b: '2 ', a: '1' })).toBe(true);
    expect(sameRawRow({ a: '1', b: '' }, { a: '1' })).toBe(true);
    expect(sameRawRow({ a: '1' }, { a: '2' })).toBe(false);
  });

  it('archives only new or changed rows, with their position in the file', () => {
    const old = r('06/09/2026', 'Chelsea', 'Fulham');
    const changed = r('06/09/2026', 'Everton', 'Wolves');
    const latest = new Map<string, Record<string, unknown>>([
      [rawRowKey('E0', old), { ...old }],
      [rawRowKey('E0', changed), { ...changed, B365H: '1.9' }],
    ]);
    const fresh = r('12/09/2026', 'Arsenal', 'Leeds');
    const out = rowsToArchive('E0', [old, changed, fresh, { Date: '', HomeTeam: '', AwayTeam: '' }], latest);
    expect(out.map((o) => [o.key, o.rowNumber])).toEqual([
      ['E0|06/09/2026|Everton|Wolves', 2],
      ['E0|12/09/2026|Arsenal|Leeds', 3],
    ]);
  });
});
