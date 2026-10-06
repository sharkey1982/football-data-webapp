import { describe, it, expect } from 'vitest';
import { buildOutlook, compareByRole, ruleText, shortOpponents } from '../lib/minutesOutlookApi';

const row = (id: number, name: string, gw: number, start: number, extra: Record<string, unknown> = {}) => ({
  fpl_player_id: id, web_name: name, slug: name.toLowerCase(), position_label: 'DEF', status: 'a', news: null,
  fpl_event_id: gw, fixtures: 1, opponents: 'Leeds (H)', start_probability: String(start), expected_minutes: String(start * 85),
  availability: '1', availability_rule: 'available', generated_at: '2026-10-05T18:17:00Z', ...extra,
});

describe('Minutes Outlook', () => {
  // Arsenal, real shape: Saliba back from injury, Mosquera the stand-in.
  const rows = [
    row(1, 'Saliba', 6, 0, { availability: '0', availability_rule: 'injured_no_date' }),
    row(1, 'Saliba', 7, 0.118, { availability: '0.15', availability_rule: 'injured_no_date' }),
    row(1, 'Saliba', 8, 0.43, { availability: '0.6', availability_rule: 'injured_no_date' }),
    row(2, 'Mosquera', 6, 0.373), row(2, 'Mosquera', 7, 0.36), row(2, 'Mosquera', 8, 0.33),
    row(3, 'Gabriel', 6, 0.95, { opponents: 'Wolves (A), Leeds (H)', fixtures: 2, start_probability: '1.9' }),
    row(3, 'Gabriel', 7, 0.95), row(3, 'Gabriel', 8, 0.95),
  ];
  const o = buildOutlook(rows as never);
  const p = (n: string) => o.players.find((x) => x.web_name === n)!;

  it('lays players out by gameweek and measures who gains or loses a place', () => {
    expect(o.gameweeks).toEqual([6, 7, 8]);
    expect(p('Saliba').trend).toBeCloseTo(0.43, 2);
    expect(p('Mosquera').trend).toBeCloseTo(-0.043, 2);
    expect(p('Saliba').cells.get(6)?.availability).toBe(0);
    expect(o.generatedAt).toBe('2026-10-05T18:17:00Z');
  });

  it('counts a double gameweek per fixture, not as a bigger chance', () => {
    expect(p('Gabriel').trend).toBeCloseTo(0, 5);
    expect(p('Gabriel').avgStart).toBeCloseTo((1.9 + 0.95 + 0.95) / 4, 5);
  });

  it('explains availability in plain words, and nothing when fully available', () => {
    expect(ruleText('injured_no_date', 0)).toBe('Injured, no return date');
    expect(ruleText('returning', 0.75)).toBe('Returning from injury: 75% available');
    expect(ruleText('doubt', 1)).toBeNull();
  });

  it('abbreviates opponents FPL style: capitals at home', () => {
    expect(shortOpponents('Leeds (H), Wolves (A)')).toBe('LEE wol');
    expect(shortOpponents("Nott'm Forest (A)")).toBe('not');
  });
});

describe('Minutes Outlook: playing roles', () => {
  const r = (id: number, name: string, gw: number, role: string, start: number) => ({
    fpl_player_id: id, web_name: name, slug: null, position_label: 'DEF', status: 'a', news: null,
    fpl_event_id: gw, fixtures: 1, opponents: 'Leeds (H)', start_probability: start, expected_minutes: start * 85,
    availability: 1, availability_rule: 'available', generated_at: null, tactical_role: role,
  });
  const o = buildOutlook([
    r(1, 'Saliba', 6, 'RCB', 0), r(1, 'Saliba', 7, 'RCB', 0.4),
    r(2, 'Mosquera', 6, 'RCB', 0.37), r(2, 'Mosquera', 7, 'RCB', 0.33),
    r(3, 'Calafiori', 6, 'LB', 0.93), r(3, 'Calafiori', 7, 'LB', 0.93),
    r(4, 'Gabriel', 6, 'LCB', 0.97), r(4, 'Gabriel', 7, 'LCB', 0.97),
    r(5, 'Youth', 6, 'DEF', 0.02), r(5, 'Youth', 7, 'DEF', 0.02),
    r(6, 'White', 6, 'RB', 0.6), r(6, 'White', 7, 'RCB', 0.6), r(6, 'White', 8, 'RB', 0.6),
  ] as never);
  it('takes the most common specific role, and none for a generic label', () => {
    const role = (n: string) => o.players.find((p) => p.web_name === n)!.role;
    expect(role('White')).toBe('RB');
    expect(role('Youth')).toBeNull();
  });
  it('sorts left to right by role, rivals for a spot together by minutes, unknown roles last', () => {
    expect([...o.players].sort(compareByRole).map((p) => p.web_name)).toEqual(['Calafiori', 'Gabriel', 'Mosquera', 'Saliba', 'White', 'Youth']);
  });
});

describe('Minutes Outlook: actual minutes', () => {
  const proj = [{ fpl_player_id: 1, web_name: 'Saliba', slug: null, position_label: 'DEF', status: 'i', news: null,
    fpl_event_id: 6, fixtures: 1, opponents: 'Leeds (H)', start_probability: 0, expected_minutes: 0,
    availability: 0, availability_rule: 'injured_no_date', generated_at: null, tactical_role: 'RCB' }];
  const o = buildOutlook(proj as never, [
    { fpl_player_id: 1, fpl_event_id: 5, minutes: 0, started: false, available: false },
    { fpl_player_id: 1, fpl_event_id: 4, minutes: 0, started: false, available: false },
    { fpl_player_id: 99, fpl_event_id: 5, minutes: 90, started: true, available: true }, // not in the projections: ignored
  ]);
  it('adds played gameweeks oldest first and attaches them to listed players only', () => {
    expect(o.pastGameweeks).toEqual([4, 5]);
    expect(o.players[0].actual.get(5)).toEqual({ minutes: 0, started: false, available: false });
    expect(o.players).toHaveLength(1);
  });
});
