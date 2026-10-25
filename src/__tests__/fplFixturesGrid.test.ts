import { describe, expect, it, vi } from 'vitest';
vi.mock('../lib/supabase', () => ({ supabase: {} }));
import { band, buildColumns, buildRows, lastMidweek, nextMidweek, restDays, type GridData, type PlCell, type CupCell } from '../lib/fplFixturesGrid';

const team = (fpl: number, id: number, short: string) => ({ fpl_team_id: fpl, team_id: id, short, name: short, owned: [{ name: `${short}P`, own: 20 }] });
const pl = (gw: number, ko: string, h: number, a: number, hxg = 1.5, axg = 1.2, finished = false) =>
  ({ gw, ko, h, a, hxg, axg, finished, hs: finished ? 1 : null, ascore: finished ? 0 : null });

// Two gameweeks a week apart, a midweek cup game, an international break, and a double.
const data: GridData = {
  today: '2026-10-25',
  gameweeks: [],
  teams: [team(1, 101, 'ARS'), team(2, 102, 'CHE'), team(3, 103, 'LIV'), team(4, 104, 'MCI')],
  pl: [
    pl(9, '2026-10-24T14:00:00Z', 1, 2, 1.5, 1.2, true),
    pl(9, '2026-10-26T15:00:00Z', 3, 4),
    pl(10, '2026-10-31T15:00:00Z', 2, 1),
    pl(10, '2026-11-01T15:00:00Z', 4, 3),
    pl(11, '2026-11-21T15:00:00Z', 1, 3, 2.0, 1.0),
    pl(11, '2026-11-24T20:00:00Z', 1, 4, 1.0, 1.8), // ARS double; CHE blank
  ],
  cups: [{ fixture_id: 500, league_id: 6, d: '2026-10-28', tm: '19:45:00', home_team_id: 101, away_team_id: 999, home_name: 'ARS', away_name: 'Brentford' }],
  lineups: [
    { fixture_id: 500, team_id: 101, player_name: 'Saka', fpl_player_id: 1, started: false, on_minute: 60, off_minute: null, own: 30 },
    { fixture_id: 500, team_id: 101, player_name: 'Nwaneri', fpl_player_id: 2, started: true, on_minute: null, off_minute: 70, own: 1 },
  ],
};

describe('fplFixturesGrid', () => {
  it('rest days count the previous game, cup games included', () => {
    expect(restDays(['2026-10-24', '2026-10-28'], '2026-10-31')).toBe(3);
    expect(restDays([], '2026-10-31')).toBeNull();
    const rows = buildRows(data, buildColumns(data, 'next6'), 'attack');
    const ars = rows.find((r) => r.team.short === 'ARS')!;
    const gw10 = ars.cells['gw-10'] as PlCell[];
    expect(gw10[0].rest).toBe(3); // cup on Wed 28th, league on Sat 31st
    const che = rows.find((r) => r.team.short === 'CHE')!;
    expect((che.cells['gw-10'] as PlCell[])[0].rest).toBe(7);
  });

  it('puts cup games in a midweek column and a long empty gap in a break column', () => {
    const cols = buildColumns(data, 'next6');
    expect(cols.map((c) => c.kind)).toEqual(['gw', 'mid', 'gw', 'break', 'gw']);
    const mid = cols[1];
    expect(mid.kind === 'mid' && mid.from).toBe('2026-10-27');
    const ars = buildRows(data, cols, 'attack').find((r) => r.team.short === 'ARS')!;
    expect((ars.cells[mid.key] as CupCell[])[0]).toMatchObject({ comp: 6, home: true, opp: 'Brentford' });
  });

  it('handles doubles and blanks', () => {
    const rows = buildRows(data, buildColumns(data, 'next6'), 'attack');
    expect((rows.find((r) => r.team.short === 'ARS')!.cells['gw-11'] as PlCell[]).length).toBe(2);
    expect((rows.find((r) => r.team.short === 'CHE')!.cells['gw-11'] as PlCell[]).length).toBe(0);
  });

  it('ranges: gameweek only, and month cuts off after 31 days', () => {
    expect(buildColumns(data, 'gw').filter((c) => c.kind === 'gw').length).toBe(1);
    expect(buildColumns({ ...data, today: '2026-10-01' }, 'month').filter((c) => c.kind === 'gw').map((c) => c.kind === 'gw' && c.gw)).toEqual([9, 10]);
  });

  it('bands run hardest to easiest', () => {
    expect(band(1.0, 'attack')).toBe(1);
    expect(band(2.0, 'attack')).toBe(5);
    expect(band(2.0, 'defence')).toBe(1);
    expect(band(0.9, 'defence')).toBe(5);
    expect(band(null, 'attack')).toBe(0);
  });

  it('midweek panels', () => {
    const m = nextMidweek(data)!;
    expect(m.from).toBe('2026-10-28');
    expect(m.games[0].sides[0].next).toMatchObject({ date: '2026-10-31', home: false });
    const l = lastMidweek(data);
    expect(l[0].subs.map((x) => x.player_name)).toEqual(['Saka']);
    expect(l[0].started.map((x) => x.player_name)).toEqual(['Nwaneri']);
  });
});
