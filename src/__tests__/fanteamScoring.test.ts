// @vitest-environment node
import { describe, it, expect } from 'vitest';
import highsLoader from 'highs';
import { scoreEvents, expectedPoints, safetyNetValue, winLoss, type ScoringRule, type Pos, type ProjectionInput } from '../lib/fanteam/scoring';
import { solveLineup, validateLineup, buildLp, stackingPenalty, type Candidate, type ContestRules, type SolverFn } from '../lib/fanteam/optimiser';
import { parsePaste, matchPlayer, resolveClub, type FplRef } from '../lib/fanteam/paste';
import { buildPlayers, health, toCandidates } from '../lib/fanteam/model';

// The seed in migration 20261005140000_fanteam_private.sql, as the page reads it.
const R = (rule_code: string, position: Pos | null, points: number, per_n: number | null = null, threshold_minutes: number | null = null): ScoringRule =>
  ({ rule_code, position, points, per_n, threshold_minutes });
const RULES: ScoringRule[] = [
  R('appearance', null, 1), R('minutes_60', null, 1, null, 60), R('full_match', 'MID', 1), R('full_match', 'FWD', 1),
  R('goal', 'GK', 8), R('goal', 'DEF', 6), R('goal', 'MID', 5), R('goal', 'FWD', 4), R('assist', null, 3),
  R('clean_sheet', 'GK', 4, null, 60), R('clean_sheet', 'DEF', 4, null, 60), R('clean_sheet', 'MID', 1, null, 60),
  R('goals_conceded', 'GK', -1, 2), R('goals_conceded', 'DEF', -1, 2),
  R('shot_on_target', 'GK', 1), R('shot_on_target', 'DEF', 0.6), R('shot_on_target', 'MID', 0.4), R('shot_on_target', 'FWD', 0.4),
  R('save', 'GK', 0.5), R('penalty_save', 'GK', 5), R('impact_positive', null, 0.3), R('impact_negative', null, -0.3),
  R('caused_penalty', null, -2), R('caused_scoring_free_kick', null, -2), R('penalty_miss', null, -2),
  R('own_goal', null, -2), R('yellow_card', null, -1), R('red_card', null, -3),
];

describe('FanTeam scoring: each rule', () => {
  const base = (pos: Pos, extra = {}) => scoreEvents(RULES, pos, { minutes: 30, goalsConcededWhileOn: 1, teamResultWhileOn: 'drew', ...extra });
  it('no minutes scores nothing', () => expect(scoreEvents(RULES, 'MID', { minutes: 0, goals: 1 })).toBe(0));
  it('appearance = 1 for every position', () => (['GK', 'DEF', 'MID', 'FWD'] as Pos[]).forEach((p) => expect(base(p)).toBe(1)));
  it('60 minutes +1, 59 minutes not', () => {
    expect(base('FWD', { minutes: 60 })).toBe(2);
    expect(base('FWD', { minutes: 59 })).toBe(1);
  });
  it('full match +1 for MID/FWD only', () => {
    expect(base('MID', { minutes: 90, completedMatch: true })).toBe(3);
    expect(base('FWD', { minutes: 90, completedMatch: true })).toBe(3);
    expect(base('DEF', { minutes: 90, completedMatch: true })).toBe(2);
    expect(base('GK', { minutes: 90, completedMatch: true })).toBe(2);
  });
  it.each([['GK', 8], ['DEF', 6], ['MID', 5], ['FWD', 4]] as [Pos, number][])('goal %s = %d', (pos, pts) =>
    expect(base(pos, { goals: 1 }) - base(pos)).toBe(pts));
  it('assist = 3 everywhere', () => (['GK', 'DEF', 'MID', 'FWD'] as Pos[]).forEach((p) => expect(base(p, { assists: 1 }) - base(p)).toBe(3)));
  it.each([['GK', 4], ['DEF', 4], ['MID', 1], ['FWD', 0]] as [Pos, number][])('clean sheet %s = %d (60+ min)', (pos, pts) => {
    const cs = scoreEvents(RULES, pos, { minutes: 60, goalsConcededWhileOn: 0 });
    const noCs = scoreEvents(RULES, pos, { minutes: 60, goalsConcededWhileOn: 1 });
    expect(cs - noCs).toBe(pts);
  });
  it('no clean sheet under 60 minutes', () =>
    expect(scoreEvents(RULES, 'DEF', { minutes: 59, goalsConcededWhileOn: 0 })).toBe(1));
  it('every 2 conceded -1 for GK/DEF, nothing for MID/FWD', () => {
    expect(base('DEF', { goalsConcededWhileOn: 2 }) - base('DEF', { goalsConcededWhileOn: 1 })).toBe(-1);
    expect(base('GK', { goalsConcededWhileOn: 5 }) - base('GK', { goalsConcededWhileOn: 1 })).toBe(-2);
    expect(base('MID', { goalsConcededWhileOn: 4 }) - base('MID', { goalsConcededWhileOn: 1 })).toBe(0);
  });
  it.each([['GK', 1], ['DEF', 0.6], ['MID', 0.4], ['FWD', 0.4]] as [Pos, number][])('shot on target %s = %d', (pos, pts) =>
    expect(base(pos, { shotsOnTarget: 1 }) - base(pos)).toBeCloseTo(pts));
  it('saves 0.5 each, penalty save 5 (GK)', () => {
    expect(base('GK', { saves: 3 }) - base('GK')).toBe(1.5);
    expect(base('GK', { penaltySaves: 1 }) - base('GK')).toBe(5);
    expect(base('DEF', { saves: 3 }) - base('DEF')).toBe(0);
  });
  it('negatives', () => {
    expect(base('MID', { penaltyMisses: 1 }) - base('MID')).toBe(-2);
    expect(base('MID', { causedPenalties: 1 }) - base('MID')).toBe(-2);
    expect(base('MID', { causedScoringFreeKicks: 1 }) - base('MID')).toBe(-2);
    expect(base('MID', { ownGoals: 1 }) - base('MID')).toBe(-2);
    expect(base('MID', { yellowCards: 1 }) - base('MID')).toBe(-1);
    expect(base('MID', { redCards: 1 }) - base('MID')).toBe(-3);
  });
  it('impact ±0.3', () => {
    expect(base('FWD', { teamResultWhileOn: 'won' }) - base('FWD')).toBeCloseTo(0.3);
    expect(base('FWD', { teamResultWhileOn: 'lost' }) - base('FWD')).toBeCloseTo(-0.3);
  });
});

describe('FanTeam scoring: combinations', () => {
  it('defender: 90 mins, goal, clean sheet, 2 SoT, yellow, win', () =>
    // 1 + 1 + 6 + 4 + 1.2 - 1 + 0.3
    expect(scoreEvents(RULES, 'DEF', { minutes: 90, completedMatch: true, goals: 1, goalsConcededWhileOn: 0, shotsOnTarget: 2, yellowCards: 1, teamResultWhileOn: 'won' })).toBeCloseTo(12.5));
  it('keeper: 90 mins, 3 conceded, 6 saves, penalty save, loss', () =>
    // 1 + 1 - 1 + 3 + 5 - 0.3
    expect(scoreEvents(RULES, 'GK', { minutes: 90, goalsConcededWhileOn: 3, saves: 6, penaltySaves: 1, teamResultWhileOn: 'lost' })).toBeCloseTo(8.7));
  it('forward: full match, brace, assist, 3 SoT, penalty miss, win', () =>
    // 1 + 1 + 1 + 8 + 3 + 1.2 - 2 + 0.3
    expect(scoreEvents(RULES, 'FWD', { minutes: 94, completedMatch: true, goals: 2, assists: 1, shotsOnTarget: 3, penaltyMisses: 1, teamResultWhileOn: 'won', goalsConcededWhileOn: 1 })).toBeCloseTo(13.5));
  it('midfielder: subbed on 20 mins, own goal, red card', () =>
    expect(scoreEvents(RULES, 'MID', { minutes: 20, ownGoals: 1, redCards: 1, goalsConcededWhileOn: 0 })).toBe(-4));
});

const input = (o: Partial<ProjectionInput> = {}): ProjectionInput => ({
  fixture_id: 1, fpl_player_id: 1, fpl_code: 1, element_type: 3, team_id: 1,
  start_probability: 1, sub_appearance_probability: 0, expected_minutes: 90,
  expected_goals: 0, expected_assists: 0, expected_saves: null,
  xpts_clean_sheet: 0, xpts_goals_conceded: 0, xpts_penalties: 0, xpts_cards_own_goals: 0,
  team_goals: 1.4, opp_goals: 1.4, p_off_before_60: 0, p_off_60_84: 0, p_full: 1, ...o,
});

describe('FanTeam expected points', () => {
  it('nailed 90-minute midfielder, nothing else: 3 points + impact 0', () => {
    const e = expectedPoints(RULES, 'MID', input());
    expect(e.breakdown.appearance + e.breakdown.minutes_60 + e.breakdown.full_match).toBeCloseTo(3);
    expect(e.breakdown.impact).toBeCloseTo(0, 6); // equal teams
    expect(e.total).toBeCloseTo(3);
    expect(e.ifStart).toBeCloseTo(3);
  });
  it('xG drives goals and shots on target', () => {
    const e = expectedPoints(RULES, 'FWD', input({ element_type: 4, expected_goals: 0.5 }));
    expect(e.breakdown.goals).toBeCloseTo(2);
    expect(e.breakdown.shots_on_target).toBeCloseTo(0.5 * 2.05 * 0.4);
  });
  it('clean sheet probability comes from FPL xpts (incl. minutes), rescaled', () => {
    const e = expectedPoints(RULES, 'MID', input({ xpts_clean_sheet: 0.25 }));
    expect(e.pCleanSheet60).toBeCloseTo(0.25);
    expect(e.breakdown.clean_sheet).toBeCloseTo(0.25);
    const d = expectedPoints(RULES, 'DEF', input({ element_type: 2, xpts_clean_sheet: 1.2 }));
    expect(d.pCleanSheet60).toBeCloseTo(0.3);
    expect(d.breakdown.clean_sheet).toBeCloseTo(1.2);
  });
  it('FPL forward listed as MID by FanTeam gets a computed clean sheet', () => {
    const e = expectedPoints(RULES, 'MID', input({ element_type: 4, xpts_clean_sheet: 0, opp_goals: 1 }));
    expect(e.pCleanSheet60).toBeCloseTo(Math.exp(-1));
  });
  it('impact favours the stronger team', () => {
    const fav = expectedPoints(RULES, 'MID', input({ team_goals: 2.2, opp_goals: 0.8 }));
    const { win, loss } = winLoss(2.2, 0.8);
    expect(fav.breakdown.impact).toBeCloseTo(0.3 * (win - loss));
    expect(fav.breakdown.impact).toBeGreaterThan(0);
  });
  it('rotation risk lowers total but not points-if-start', () => {
    const e = expectedPoints(RULES, 'MID', input({ start_probability: 0.5, expected_minutes: 45, expected_goals: 0.1 }));
    expect(e.total).toBeLessThan(e.ifStart);
    expect(e.ifStart).toBeGreaterThan(3);
  });
  it('safety net: a 50% starter backed by a nailed cheaper team-mate keeps most of his value', () => {
    const a = { key: 'a', team_id: 1, pos: 'MID' as Pos, price: 8, s: 0.5, ifStart: 6 };
    const b = { key: 'b', team_id: 1, pos: 'MID' as Pos, price: 6, s: 1, ifStart: 4 };
    const c = { key: 'c', team_id: 1, pos: 'MID' as Pos, price: 9, s: 1, ifStart: 10 }; // dearer: not eligible
    const v = safetyNetValue(a, [a, b, c]);
    expect(v.replacementValue).toBeCloseTo(4);
    expect(v.value).toBeCloseTo(0.5 * 6 + 0.5 * 4);
  });
});

// ---------------------------------------------------------------------------
// Optimiser
// ---------------------------------------------------------------------------

const RULES11: ContestRules = {
  budget: 108, size: 11, maxPerClub: 3, captainMultiplier: 2, stacking: true,
  xiMin: { GK: 1, DEF: 3, MID: 3, FWD: 1 }, xiMax: { GK: 1, DEF: 5, MID: 5, FWD: 3 },
};

function pool(): Candidate[] {
  const out: Candidate[] = [];
  let k = 0;
  // 6 clubs; club 1 is strong (high values, high clean sheet) to tempt >3 picks.
  for (let club = 1; club <= 6; club++) {
    const strong = club === 1;
    const add = (pos: Pos, n: number, price: number, value: number) => {
      for (let j = 0; j < n; j++) {
        const v = value - j * 0.3;
        out.push({ key: `p${k++}`, name: `${pos}${club}-${j}`, team_id: club, team_name: `Club ${club}`, pos, price: price - j * 0.5,
          value: v, captainExtra: v, s: 0.95, ifStart: v / 0.95, pCleanSheet: strong ? 0.5 : 0.25 });
      }
    };
    add('GK', 2, strong ? 6 : 4.5, strong ? 5 : 3.5);
    add('DEF', 4, strong ? 7 : 5, strong ? 6 : 3.8);
    add('MID', 4, strong ? 10 : 7, strong ? 8 : 5);
    add('FWD', 3, strong ? 11 : 7.5, strong ? 8.5 : 5);
  }
  return out;
}

describe('FanTeam optimiser', async () => {
  const highs = await highsLoader();
  const solve: SolverFn = (lp) => highs.solve(lp) as unknown as ReturnType<SolverFn>;

  it('returns a valid lineup: 11, budget, formation, 3 per club', () => {
    const l = solveLineup(pool(), RULES11, solve);
    expect(validateLineup(l, RULES11)).toEqual([]);
    const perClub = new Map<number, number>();
    l.players.forEach((p) => perClub.set(p.team_id, (perClub.get(p.team_id) ?? 0) + 1));
    expect(Math.max(...perClub.values())).toBeLessThanOrEqual(3);
    expect(perClub.get(1)).toBe(3); // the strong club is capped, not exceeded
    expect(l.cost).toBeLessThanOrEqual(108);
  });

  it('captains the best player and picks a different vice', () => {
    const l = solveLineup(pool(), RULES11, solve);
    const best = Math.max(...l.players.map((p) => p.captainExtra));
    expect(l.captain.captainExtra).toBeCloseTo(best);
    expect(l.vice.key).not.toBe(l.captain.key);
  });

  it('respects a tighter budget', () => {
    const tight = { ...RULES11, budget: 70 };
    const l = solveLineup(pool(), tight, solve);
    expect(l.cost).toBeLessThanOrEqual(70);
    expect(validateLineup(l, tight)).toEqual([]);
  });

  it('stacking penalty steers away from 3 defenders of one club', () => {
    // Three equal defenders at club 1 vs equal ones elsewhere: penalty should split them.
    const p = pool().map((c) => (c.pos === 'DEF' ? { ...c, value: 4, captainExtra: 4, price: 5, pCleanSheet: 0.6 } : c));
    const withPen = solveLineup(p, RULES11, solve);
    const defsByClub = new Map<number, number>();
    withPen.players.filter((x) => x.pos === 'GK' || x.pos === 'DEF').forEach((x) => defsByClub.set(x.team_id, (defsByClub.get(x.team_id) ?? 0) + 1));
    expect(Math.max(...defsByClub.values())).toBe(1);
    expect(withPen.stackingPenalty).toBeCloseTo(0);
  });

  it('stacking penalty is 0, 0, 1, 3 × P(CS) for 0..3 defenders', () => {
    const p = pool();
    const defs1 = p.filter((c) => c.team_id === 1 && (c.pos === 'DEF' || c.pos === 'GK'));
    const q = defs1.reduce((a, c) => a + c.pCleanSheet, 0) / defs1.length;
    expect(stackingPenalty(defs1.slice(0, 1), p)).toBeCloseTo(0);
    expect(stackingPenalty(defs1.slice(0, 2), p)).toBeCloseTo(q);
    expect(stackingPenalty(defs1.slice(0, 3), p)).toBeCloseTo(3 * q);
  });

  it('no-good cuts give a different lineup', () => {
    const first = solveLineup(pool(), RULES11, solve);
    const second = solveLineup(pool(), RULES11, solve, [first.players.map((p) => p.key)]);
    expect(second.players.map((p) => p.key).sort()).not.toEqual(first.players.map((p) => p.key).sort());
    expect(second.expectedPoints).toBeLessThanOrEqual(first.expectedPoints + 1e-6);
  });

  it('validator catches violations', () => {
    const l = solveLineup(pool(), RULES11, solve);
    const bad = { ...l, players: [...l.players.slice(0, 10), { ...l.players[0], key: 'dup' }] };
    const extraClub = pool().filter((c) => c.team_id === 2).slice(0, 4);
    const bad2 = { ...l, players: [...l.players.filter((p) => p.team_id !== 2).slice(0, 7), ...extraClub] };
    expect(validateLineup(bad, RULES11).length).toBeGreaterThan(0);
    expect(validateLineup(bad2, RULES11).some((m) => m.includes('max 3'))).toBe(true);
  });

  it('LP is well formed', () => {
    const lp = buildLp(pool().slice(0, 30), RULES11);
    expect(lp).toMatch(/^Maximize/);
    expect(lp).toContain('Binary');
    expect(lp).not.toMatch(/\+ -/);
  });
});

// ---------------------------------------------------------------------------
// Paste parsing and matching
// ---------------------------------------------------------------------------

const TEAMS = [
  { team_id: 1, team_name: 'Arsenal' }, { team_id: 2, team_name: 'Manchester City' },
  { team_id: 3, team_name: 'Manchester United' }, { team_id: 4, team_name: 'Tottenham Hotspur' },
  { team_id: 5, team_name: 'Nottingham Forest' },
];
const FPL: FplRef[] = [
  { fpl_code: 101, team_id: 1, element_type: 3, web_name: 'Saka', first_name: 'Bukayo', second_name: 'Saka' },
  { fpl_code: 102, team_id: 1, element_type: 2, web_name: 'Gabriel', first_name: 'Gabriel', second_name: 'dos Santos Magalhães' },
  { fpl_code: 201, team_id: 2, element_type: 4, web_name: 'Haaland', first_name: 'Erling', second_name: 'Haaland' },
  { fpl_code: 301, team_id: 3, element_type: 3, web_name: 'B.Fernandes', first_name: 'Bruno Borges', second_name: 'Fernandes' },
  { fpl_code: 401, team_id: 4, element_type: 3, web_name: 'Son', first_name: 'Heung-Min', second_name: 'Son' },
];

describe('FanTeam paste parsing', () => {
  it('one player per line, tab separated', () => {
    const rows = parsePaste('Bukayo Saka\tArsenal\tMID\t£9.5M\nErling Haaland\tMan City\tFWD\t£14.0M', TEAMS, new Map());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name_raw: 'Bukayo Saka', position: 'MID', price_m: 9.5, issues: [] });
    expect(rows[1]).toMatchObject({ name_raw: 'Erling Haaland', position: 'FWD', price_m: 14 });
    expect(resolveClub(rows[1].club_raw, TEAMS, new Map())).toBe(2);
  });
  it('player spread over several lines', () => {
    const rows = parsePaste('Saka\nARS · MID\n9.5M\nHaaland\nMCI · FWD\n14.0M', TEAMS, new Map());
    expect(rows.map((r) => [r.name_raw, r.position, r.price_m])).toEqual([['Saka', 'MID', 9.5], ['Haaland', 'FWD', 14]]);
  });
  it('flags rows it cannot read', () => {
    const rows = parsePaste('Somebody\tUnknown FC\tMID\t£5.0M', TEAMS, new Map());
    expect(rows[0].issues).toContain('club not recognised');
  });
  it('manual club fix is used', () => {
    const rows = parsePaste('Somebody\tUnknown FC\tMID\t£5.0M', TEAMS, new Map([['unknown fc', 5]]));
    expect(rows[0].issues).toEqual([]);
  });
});

describe('FanTeam player matching', () => {
  const none = new Map<string, number | null>();
  it('full name, web name, surname, initial', () => {
    expect(matchPlayer('Bukayo Saka', 1, 'MID', FPL, none)).toMatchObject({ fpl_code: 101, method: 'exact' });
    expect(matchPlayer('Haaland', 2, 'FWD', FPL, none)).toMatchObject({ fpl_code: 201 });
    expect(matchPlayer('B. Fernandes', 3, 'MID', FPL, none).fpl_code).toBe(301);
    expect(matchPlayer('Heung-Min Son', 4, 'MID', FPL, none).fpl_code).toBe(401);
  });
  it('never matches across clubs', () => {
    expect(matchPlayer('Saka', 2, 'MID', FPL, none).fpl_code).toBeNull();
  });
  it('manual fix wins, including a deliberate "no FPL player"', () => {
    expect(matchPlayer('Gabriel Magalhaes', 1, 'DEF', FPL, new Map([['gabriel magalhaes|1', 102]]))).toMatchObject({ fpl_code: 102, method: 'manual' });
    expect(matchPlayer('Bukayo Saka', 1, 'MID', FPL, new Map([['bukayo saka|1', null]])).fpl_code).toBeNull();
  });
});

describe('FanTeam paste parsing: names', () => {
  it('keeps names that contain digits or accents, drops pure numbers', () => {
    const rows = parsePaste('Player 2\tArsenal\tDEF\t£5.0M\t12.5\nJoão Félix\tArsenal\tMID\t£6.5M\t3.2%', TEAMS, new Map());
    expect(rows.map((r) => r.name_raw)).toEqual(['Player 2', 'João Félix']);
  });
});

describe('FanTeam club recognition', () => {
  it('whole words only', () => {
    expect(resolveClub('Tottenham', TEAMS, new Map())).toBe(4);
    expect(resolveClub('Arsenal FC', TEAMS, new Map())).toBe(1);
    expect(resolveClub("Nott'm Forest", TEAMS, new Map())).toBe(5);
    expect(resolveClub('Manchester', TEAMS, new Map())).toBeNull(); // ambiguous
    expect(resolveClub('Test ArsenalDEF1', TEAMS, new Map())).toBeNull();
    expect(resolveClub('Arsenalist', TEAMS, new Map())).toBeNull();
  });
  it('a player named like a club is not taken as the club', () => {
    const rows = parsePaste('Lewis Hall\tArsenal\tDEF\t£5.0M', [...TEAMS, { team_id: 9, team_name: 'Hull City' }], new Map());
    expect(rows[0]).toMatchObject({ name_raw: 'Lewis Hall', club_raw: 'Arsenal' });
  });
});

describe('FanTeam paste parsing: club text inside a name', () => {
  it('removes the club field, not the same letters in the name', () => {
    const rows = parsePaste('Test ArsenalGK0\tArsenal\tGK\t£7.0M\nArsenal Tierney\tArsenal\tDEF\t£5.0M', TEAMS, new Map());
    expect(rows.map((r) => [r.name_raw, r.club_raw])).toEqual([['Test ArsenalGK0', 'Arsenal'], ['Arsenal Tierney', 'Arsenal']]);
  });
  it('single-space layout: Name Club POS price', () => {
    const rows = parsePaste('Bukayo Saka Arsenal MID 9.5M', TEAMS, new Map());
    expect(rows[0]).toMatchObject({ name_raw: 'Bukayo Saka', position: 'MID', price_m: 9.5 });
  });
});

describe('FanTeam data status', () => {
  const inp = (o = {}) => ({
    fixture_id: 1, matchweek: 6, kickoff_date: '2026-10-10', kickoff_time: '15:00:00', fpl_player_id: 1, fpl_code: 101,
    web_name: 'Saka', first_name: 'Bukayo', second_name: 'Saka', element_type: 3, team_id: 1, team_name: 'Arsenal',
    opponent_name: 'Chelsea', is_home: true, now_cost: 95, status: 'a', start_probability: 0.9, sub_appearance_probability: 0.05,
    expected_minutes: 80, expected_goals: 0.5, expected_assists: 0.3, expected_saves: null, xpts_clean_sheet: 0.4,
    xpts_goals_conceded: 0, xpts_penalties: 0, xpts_cards_own_goals: -0.2, team_goals: 2, opp_goals: 0.8,
    p_off_before_60: 0.05, p_off_60_84: 0.3, p_full: 0.65, generated_at: '2026-10-05T06:41:00Z', ...o,
  });
  const NOW = new Date('2026-10-05T10:00:00Z');
  const row = (name: string, club: string, pos: Pos, price: number, row_no = 1) => ({ row_no, name_raw: name, club_raw: club, position: pos, price_m: price });
  // A squad's worth of inputs: one player per position.
  const four = (o = {}) => [
    inp(o),
    inp({ fpl_player_id: 2, fpl_code: 102, web_name: 'Raya', first_name: 'David', second_name: 'Raya', element_type: 1, ...o }),
    inp({ fpl_player_id: 3, fpl_code: 103, web_name: 'Saliba', first_name: 'William', second_name: 'Saliba', element_type: 2, ...o }),
    inp({ fpl_player_id: 4, fpl_code: 104, web_name: 'Havertz', first_name: 'Kai', second_name: 'Havertz', element_type: 4, ...o }),
  ];
  const others = [row('David Raya', 'Arsenal', 'GK', 6, 11), row('William Saliba', 'Arsenal', 'DEF', 6, 12), row('Kai Havertz', 'Arsenal', 'FWD', 7.5, 13)];
  const manual = (players: [string, number | null][] = [], clubs: [string, number][] = []) => ({ players: new Map(players), clubs: new Map(clubs) });

  it('Incomplete when a position is missing from the list', () => {
    const views = buildPlayers([row('Bukayo Saka', 'Arsenal', 'MID', 9.5)], four() as never, RULES, manual(), false);
    expect(health({ hasRules: true, inputs: four() as never, pasteMatchweek: 6, matchweek: 6, views, now: NOW }).status).toBe('Incomplete');
  });
  it('Fresh when everything matches', () => {
    const views = buildPlayers([row('Bukayo Saka', 'Arsenal', 'MID', 9.5), ...others], four() as never, RULES, manual(), false);
    expect(views[0].fpl_code).toBe(101);
    const h = health({ hasRules: true, inputs: four() as never, pasteMatchweek: 6, matchweek: 6, views, now: NOW });
    expect(h.status).toBe('Fresh');
  });
  it('Incomplete with an unmatched player; Fresh once marked not in FPL', () => {
    const rows = [row('Bukayo Saka', 'Arsenal', 'MID', 9.5, 1), row('Nobody Here', 'Arsenal', 'DEF', 4.0, 2), ...others];
    const v1 = buildPlayers(rows, four() as never, RULES, manual(), false);
    expect(health({ hasRules: true, inputs: four() as never, pasteMatchweek: 6, matchweek: 6, views: v1, now: NOW }).status).toBe('Incomplete');
    const v2 = buildPlayers(rows, four() as never, RULES, manual([['nobody here|1', null]]), false);
    expect(health({ hasRules: true, inputs: four() as never, pasteMatchweek: 6, matchweek: 6, views: v2, now: NOW }).status).toBe('Fresh');
    expect(toCandidates(v2, 2).map((c) => c.name)).not.toContain('Nobody Here');
    expect(toCandidates(v2, 2)).toHaveLength(4);
  });
  it('Stale when prices are for another gameweek or projections are old', () => {
    const views = buildPlayers([row('Bukayo Saka', 'Arsenal', 'MID', 9.5), ...others], four() as never, RULES, manual(), false);
    expect(health({ hasRules: true, inputs: four() as never, pasteMatchweek: 5, matchweek: 6, views, now: NOW }).status).toBe('Stale');
    const old = four({ generated_at: '2026-10-03T06:41:00Z' });
    expect(health({ hasRules: true, inputs: old as never, pasteMatchweek: 6, matchweek: 6, views, now: NOW }).status).toBe('Stale');
  });
  it('Broken without projections; Incomplete with an unknown club', () => {
    expect(health({ hasRules: true, inputs: [], pasteMatchweek: 6, matchweek: 6, views: [], now: NOW }).status).toBe('Broken');
    const views = buildPlayers([row('Bukayo Saka', 'Mystery FC', 'MID', 9.5), ...others], four() as never, RULES, manual(), false);
    expect(health({ hasRules: true, inputs: four() as never, pasteMatchweek: 6, matchweek: 6, views, now: NOW }).status).toBe('Incomplete');
  });
});
