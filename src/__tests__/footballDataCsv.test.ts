import { describe, it, expect } from 'vitest';
import { csvUrlFor, detectFormat, labelForStartYear, parseSeasonLabel, selectRows } from '../../scripts/lib/footballDataCsv';

const extra = (season: string, home: string, away: string, date = '01/08/2026') => ({
  Country: 'Norway', League: 'Eliteserien', Season: season, Date: date, Time: '17:00',
  Home: home, Away: away, HG: '2', AG: '1', Res: 'H', PSCH: '1.9',
});

describe('football-data.co.uk CSV layouts', () => {
  it('derives URLs: main leagues per season, 3-letter extra leagues all-seasons', () => {
    expect(csvUrlFor('E0', '2627')).toBe('https://football-data.co.uk/mmz4281/2627/E0.csv');
    expect(csvUrlFor('SC0', '2526')).toBe('https://football-data.co.uk/mmz4281/2526/SC0.csv');
    expect(csvUrlFor('NOR', '2627')).toBe('https://football-data.co.uk/new/NOR.csv');
  });

  it('maps season labels both ways', () => {
    expect(parseSeasonLabel('2627')).toEqual({ startYear: 2026, split: '2026/2027' });
    expect(labelForStartYear(2027)).toBe('2728');
    expect(labelForStartYear(2099)).toBe('9900');
    expect(() => parseSeasonLabel('2026/27')).toThrow();
  });

  it('leaves main-format files untouched, all rows under the requested season', () => {
    const rows = [{ Div: 'E0', Date: '15/08/2026', HomeTeam: 'Arsenal', AwayTeam: 'Wolves', FTHG: '2', FTAG: '0', FTR: 'H' }];
    const { format, selected } = selectRows(rows, '2627');
    expect(format).toBe('main');
    expect(selected).toEqual([{ row: rows[0], seasonLabel: '2627' }]);
  });

  it('keeps only the split season from an extra file and renames columns', () => {
    const rows = [
      { ...extra('2025/2026', 'Old A', 'Old B'), Country: 'Denmark' },
      { ...extra('2026/2027', 'Midtjylland', 'Brondby'), Country: 'Denmark' },
    ];
    const { format, selected } = selectRows(rows, '2627');
    expect(format).toBe('extra');
    expect(selected).toHaveLength(1);
    expect(selected[0]).toEqual({
      seasonLabel: '2627',
      row: { Date: '01/08/2026', Time: '17:00', HomeTeam: 'Midtjylland', AwayTeam: 'Brondby', FTHG: '2', FTAG: '1', FTR: 'H' },
    });
  });

  it('files calendar year N under N/N+1, and routes next year to the next label', () => {
    const rows = [extra('2025', 'Molde', 'Brann'), extra('2026', 'Bodo/Glimt', 'Viking'), extra('2027', 'Rosenborg', 'Brann', '15/03/2027')];
    const { selected } = selectRows(rows, '2627');
    expect(selected.map((s) => [s.row.HomeTeam, s.seasonLabel])).toEqual([
      ['Bodo/Glimt', '2627'],
      ['Rosenborg', '2728'],
    ]);
    // Importing the previous season picks up calendar 2025 (and 2026 as its "next").
    expect(selectRows(rows, '2526').selected.map((s) => s.seasonLabel)).toEqual(['2526', '2627']);
  });

  it('excludes play-offs against lower-division clubs, even one that is promoted', () => {
    const clubs = ['A', 'B', 'C', 'D'];
    const rows = [];
    for (let round = 0; round < 12; round++) for (let i = 0; i < clubs.length; i += 2) rows.push({ ...extra('2025/2026', clubs[(i + round) % 4], clubs[(i + round + 1) % 4]), Country: 'Romania' });
    rows.push({ ...extra('2025/2026', 'A', 'Voluntari'), Country: 'Romania' }, { ...extra('2025/2026', 'Voluntari', 'A'), Country: 'Romania' });
    rows.push({ ...extra('2026/2027', 'Voluntari', 'B'), Country: 'Romania' });
    const last = selectRows(rows, '2526');
    expect(last.selected).toHaveLength(24);
    expect(last.excluded).toHaveLength(2);
    expect(last.excluded[0].reason).toMatch(/Voluntari played under a quarter.*play-off/);
    // Round one of the next season: one game each, nothing excluded.
    const next = selectRows(rows, '2627');
    expect(next.selected).toHaveLength(1);
    expect(next.excluded).toHaveLength(0);
  });

  it('rejects an unknown layout rather than importing nothing silently', () => {
    expect(() => detectFormat([{ Foo: '1', Bar: '2' }])).toThrow(/Unrecognised/);
  });
});
