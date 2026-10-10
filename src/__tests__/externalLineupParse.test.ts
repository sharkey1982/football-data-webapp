import { describe, it, expect } from 'vitest';
import { parseLineups, matchName, clubNames, type SquadPlayer } from '../lib/externalLineupParse';
import { buildComparison, type CompareRow } from '../lib/lineupCompareApi';

const ars: SquadPlayer[] = [
  { fpl_player_id: 1, web_name: 'Raya', first_name: 'David', second_name: 'Raya Martín' },
  { fpl_player_id: 5, web_name: 'J.Timber', first_name: 'Jurriën', second_name: 'Timber' },
  { fpl_player_id: 6, web_name: 'Saliba', first_name: 'William', second_name: 'Saliba' },
  { fpl_player_id: 4, web_name: 'Gabriel', first_name: 'Gabriel', second_name: 'dos Santos Magalhães' },
  { fpl_player_id: 8, web_name: 'Calafiori', first_name: 'Riccardo', second_name: 'Calafiori' },
  { fpl_player_id: 13, web_name: 'Rice', first_name: 'Declan', second_name: 'Rice' },
  { fpl_player_id: 7, web_name: 'Lewis-Skelly', first_name: 'Myles', second_name: 'Lewis-Skelly' },
  { fpl_player_id: 12, web_name: 'Saka', first_name: 'Bukayo', second_name: 'Saka' },
  { fpl_player_id: 15, web_name: 'Ødegaard', first_name: 'Martin', second_name: 'Ødegaard' },
  { fpl_player_id: 14, web_name: 'Eze', first_name: 'Eberechi', second_name: 'Eze' },
  { fpl_player_id: 26, web_name: 'Havertz', first_name: 'Kai', second_name: 'Havertz' },
  { fpl_player_id: 25, web_name: 'Gyökeres', first_name: 'Viktor', second_name: 'Gyökeres' },
  { fpl_player_id: 10, web_name: 'White', first_name: 'Ben', second_name: 'White' },
  { fpl_player_id: 452, web_name: 'Bruno G.', first_name: 'Bruno', second_name: 'Guimarães Rodriguez Moura' },
];
const mci: SquadPlayer[] = [
  { fpl_player_id: 400, web_name: 'Haaland', first_name: 'Erling', second_name: 'Haaland' },
  { fpl_player_id: 401, web_name: 'Rodri', first_name: 'Rodrigo', second_name: 'Hernández Cascante' },
];
const clubs = [
  { team_id: 1, names: clubNames(['Arsenal']) },
  { team_id: 18, names: clubNames(['Manchester City', 'Man City', 'MCI']) },
  { team_id: 5, names: clubNames(['Manchester United', 'Man Utd', 'MUN']) },
];
const squads = new Map([[1, ars], [18, mci], [5, []]]);

describe('matchName', () => {
  it('matches web names, surnames, accents and small misspellings', () => {
    expect(matchName('Timber', ars).player?.fpl_player_id).toBe(5);
    expect(matchName('Odegaard', ars).player?.fpl_player_id).toBe(15);
    expect(matchName('Gyokeres', ars).player?.fpl_player_id).toBe(25);
    expect(matchName('Lewis-Skelly', ars).player?.fpl_player_id).toBe(7);
    expect(matchName('Calafori', ars).player?.fpl_player_id).toBe(8);
    expect(matchName('Bruno Guimaraes', ars).player?.fpl_player_id).toBe(452);
  });
  it('does not guess a name it cannot place', () => {
    expect(matchName('Zinchenko', ars).player).toBeNull();
  });
});

describe('parseLineups', () => {
  it('reads an FFS-style paste with several clubs', () => {
    const text = 'Arsenal: Raya; Timber, Saliba, Gabriel, Calafiori; Rice, Lewis-Skelly; Saka, Odegaard (c), Eze; Havertz\nMan City: Haaland, Rodri';
    const out = parseLineups(text, clubs, squads, null);
    const a = out.find((p) => p.team_id === 1)!;
    expect(a.matched.map((m) => m.fpl_player_id)).toEqual([1, 5, 6, 4, 8, 13, 7, 12, 15, 14, 26]);
    expect(a.unmatched).toEqual([]);
    expect(out.find((p) => p.team_id === 18)!.matched.map((m) => m.web_name)).toEqual(['Haaland', 'Rodri']);
  });
  it('uses the chosen club when the text names none, one name per line', () => {
    const out = parseLineups('Raya\nWhite\nSaliba\nZinchenko', clubs, squads, 1);
    expect(out).toHaveLength(1);
    expect(out[0].matched.map((m) => m.web_name)).toEqual(['Raya', 'White', 'Saliba']);
    expect(out[0].unmatched.map((u) => u.text)).toEqual(['Zinchenko']);
  });
  it('tells Manchester clubs apart', () => {
    const out = parseLineups('Man Utd: \nMan City: Haaland', clubs, squads, null);
    expect(out.map((p) => p.team_id).sort((a, b) => a - b)).toEqual([5, 18]);
  });
});

describe('buildComparison', () => {
  const row = (id: number, name: string, sp: number, ffs: boolean | null): CompareRow => ({
    team_id: 1, team_name: 'Arsenal', fpl_player_id: id, web_name: name, element_type: 2, tactical_role: 'RB', depth_rank: 1,
    status: 'a', news: null, start_probability: sp, expected_minutes: sp * 80, source_start: ffs, source_entered_at: ffs === null ? null : '2026-10-10T09:00:00Z',
  });
  it('sorts each club into agree / FFS only / ours only', () => {
    const [c] = buildComparison([row(5, 'Timber', 0.44, true), row(10, 'White', 0.53, false), row(12, 'Saka', 0.94, true), row(99, 'Nwaneri', 0.1, false)]);
    expect(c.entered).toBe(true);
    expect(c.agree.map((r) => r.web_name)).toEqual(['Saka']);
    expect(c.ffsOnly.map((r) => r.web_name)).toEqual(['Timber']);
    expect(c.oursOnly.map((r) => r.web_name)).toEqual(['White']);
    expect(c.disagreements).toBe(2);
  });
  it('marks clubs with no FFS line-up as not entered', () => {
    const [c] = buildComparison([row(12, 'Saka', 0.94, null)]);
    expect(c.entered).toBe(false);
    expect(c.disagreements).toBe(0);
  });
});
