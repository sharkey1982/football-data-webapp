import { describe, it, expect } from 'vitest';
import { buildOutlook, ruleText, shortOpponents } from '../lib/minutesOutlookApi';

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
