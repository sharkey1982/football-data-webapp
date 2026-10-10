import { describe, it, expect } from 'vitest';
import { decodeCounts, encodeCounts, fieldState, fitBeta, modelShares, parsePickCounts, type FieldRound, type TeamRef } from '../lib/lmsField';

// PremSkins 2, GW1 = Premier League GW6 2026/27 (the email of 10 Oct 2026)
const EMAIL = `Game Week 1
Arsenal 1802
Chelsea 843
Newcastle 782
Man Utd 640
BHA 431
Ipswich 295
Everton 130
Aston Villa 119
Brentford 105
Crystal Palace 97
Fulham 79
Hull 66
Liverpool 44
Nottm Forest 34
Spurs 23
Sunderland 21
Man City 17
Coventry 21
Bournemouth 3
Leeds 2

Arsenal have Leeds at the Emirates today in the lunchtime kick-off.`;

// display names as the live teams table has them
const TEAMS: TeamRef[] = [
  'Arsenal', 'Aston Villa', 'Bournemouth', 'Brentford', 'Brighton', 'Chelsea', 'Coventry', 'Crystal Palace', 'Everton', 'Fulham',
  'Hull', 'Ipswich', 'Leeds', 'Liverpool', 'Manchester City', 'Manchester United', 'Newcastle', 'Nottingham Forest', 'Sunderland', 'Tottenham',
].map((name, i) => ({ id: i + 1, name }));
const id = (name: string) => TEAMS.find((t) => t.name === name)!.id;

// de-vigged average odds captured 9 Oct 13:10 (fixture_market_latest)
const P: Record<string, number> = {
  Arsenal: 0.683, Leeds: 0.120, Chelsea: 0.568, Bournemouth: 0.208, Sunderland: 0.320, Brighton: 0.409, Ipswich: 0.342, Fulham: 0.388,
  'Aston Villa': 0.360, Brentford: 0.371, 'Manchester United': 0.558, Tottenham: 0.216, Hull: 0.263, Everton: 0.461,
  'Crystal Palace': 0.362, 'Nottingham Forest': 0.356, Liverpool: 0.358, 'Manchester City': 0.384, Coventry: 0.288, Newcastle: 0.450,
};

function round(gw: number, counts: Map<number, number>, won: Record<string, 0 | 1> | null): FieldRound {
  return {
    gw,
    counts: TEAMS.map((t) => counts.get(t.id) ?? 0),
    p: TEAMS.map((t) => P[t.name]),
    won: TEAMS.map((t) => (won ? won[t.name] ?? 0 : null)),
  };
}

describe('parsePickCounts', () => {
  it('reads the SportSkins email, with its nicknames, and skips the heading and prose', () => {
    const r = parsePickCounts(EMAIL, TEAMS);
    expect(r.unknown).toEqual([]);
    expect(r.counts.size).toBe(20);
    expect([...r.counts.values()].reduce((a, b) => a + b, 0)).toBe(5554);
    expect(r.counts.get(id('Manchester United'))).toBe(640);
    expect(r.counts.get(id('Brighton'))).toBe(431);
    expect(r.counts.get(id('Nottingham Forest'))).toBe(34);
    expect(r.counts.get(id('Tottenham'))).toBe(23);
    expect(r.counts.get(id('Manchester City'))).toBe(17);
  });
  it('accepts separators and thousands commas, and reports names it cannot place', () => {
    const r = parsePickCounts('Arsenal - 1,802\nWolves: 12\nMan U 5', TEAMS);
    expect(r.counts.get(id('Arsenal'))).toBe(1802);
    expect(r.counts.get(id('Manchester United'))).toBe(5);
    expect(r.unknown).toEqual(['Wolves']);
  });
  it('round-trips through the URL', () => {
    const r = parsePickCounts(EMAIL, TEAMS);
    expect(decodeCounts(encodeCounts(r.counts))).toEqual(r.counts);
  });
});

describe('fitBeta', () => {
  it('fits PremSkins 2 GW1 at about 8.5 (computed independently in Python: 8.50)', () => {
    const fit = fitBeta([round(6, parsePickCounts(EMAIL, TEAMS).counts, null)], TEAMS.length)!;
    expect(fit.beta).toBeCloseTo(8.5, 1);
    expect(fit.picks).toBe(5554);
  });
  it('recovers the β that generated the counts, two rounds with the used teams carried forward', () => {
    const T = TEAMS.length;
    const r1p = TEAMS.map((t) => P[t.name]);
    const s1 = modelShares(r1p, new Array(T).fill(0), 6);
    const c1 = new Map(TEAMS.map((t, j) => [t.id, Math.round(s1[j] * 1e6)]));
    const won1: Record<string, 0 | 1> = { Arsenal: 1, Chelsea: 1, 'Manchester United': 1, Newcastle: 1, Everton: 1 };
    const r1 = round(6, c1, won1);
    const used = fieldState([r1], T).usedShare;
    const r2p = [...r1p].reverse();
    const s2 = modelShares(r2p, used, 6);
    const r2: FieldRound = { gw: 7, counts: s2.map((v) => Math.round(v * 1e6)), p: r2p, won: new Array(T).fill(null) };
    expect(fitBeta([r1, r2], T)!.beta).toBeCloseTo(6, 1);
  });
});

describe('fieldState', () => {
  const counts = parsePickCounts(EMAIL, TEAMS).counts;
  it('before results: survivors are expected from the win chances, and flagged as pending', () => {
    const s = fieldState([round(6, counts, null)], TEAMS.length);
    expect(s.entrants0).toBe(5554);
    expect(s.pending).toBe(true);
    expect(s.left).toBeCloseTo(2973.6, 0);
    expect(s.rounds[0].top[0]).toEqual({ team: TEAMS.findIndex((t) => t.name === 'Arsenal'), n: 1802 });
  });
  it('after results: only winners survive, and their team is marked used', () => {
    const won = { Arsenal: 1, Everton: 1 } as Record<string, 0 | 1>;
    const s = fieldState([round(6, counts, won)], TEAMS.length);
    expect(s.pending).toBe(false);
    expect(s.left).toBe(1802 + 130);
    const ars = TEAMS.findIndex((t) => t.name === 'Arsenal');
    expect(s.usedShare[ars]).toBeCloseTo(1802 / 1932, 6);
    expect(s.usedShare.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
  it('a used team is never picked again by the model', () => {
    const used = new Array(TEAMS.length).fill(0);
    used[0] = 1;
    expect(modelShares(TEAMS.map((t) => P[t.name]), used, 8)[0]).toBe(0);
  });
});
