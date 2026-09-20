import { describe, it, expect } from 'vitest';
import { solveRollingXi, ROLLING_XI_BUDGET, type RollingCandidate } from '../lib/seasonXiApi';

const p = (o: Partial<RollingCandidate> & { fpl_code: number }): RollingCandidate => ({
  web_name: `P${o.fpl_code}`, team_name: 'Club A', element_type: 3,
  august_cost: 50, now_cost: 50, total_points: 10, minutes: 900, ...o,
});

/** A legal pool: enough at each position to fill any formation. */
function pool(): RollingCandidate[] {
  const out: RollingCandidate[] = [];
  let id = 1;
  const add = (type: number, n: number, club: string, pts: number) => {
    for (let i = 0; i < n; i++) {
      out.push(p({ fpl_code: id++, element_type: type, team_name: club, total_points: pts - i, august_cost: 45 }));
    }
  };
  add(1, 4, 'A', 60); add(1, 4, 'B', 40);
  add(2, 8, 'A', 80); add(2, 8, 'B', 50); add(2, 8, 'C', 30);
  add(3, 8, 'A', 90); add(3, 8, 'B', 55); add(3, 8, 'D', 35);
  add(4, 6, 'A', 70); add(4, 6, 'E', 45);
  return out;
}

describe('rolling XI solver', () => {
  it('returns exactly eleven players in a legal formation', () => {
    const xi = solveRollingXi(pool());
    expect(xi).not.toBeNull();
    expect(xi!.players).toHaveLength(11);
    const byPos = (t: number) => xi!.players.filter((x) => x.element_type === t).length;
    expect(byPos(1)).toBe(1);
    expect(byPos(2)).toBeGreaterThanOrEqual(3);
    expect(byPos(4)).toBeGreaterThanOrEqual(1);
    expect(byPos(2) + byPos(3) + byPos(4)).toBe(10);
  });

  it('never picks more than three from one club', () => {
    // The completed-season XIs originally DID, producing sides with five
    // from one team. That bug is the reason this test exists.
    const xi = solveRollingXi(pool());
    const counts = new Map<string, number>();
    for (const x of xi!.players) counts.set(x.team_name!, (counts.get(x.team_name!) ?? 0) + 1);
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(3);
  });

  it('stays within budget, using AUGUST prices not current ones', () => {
    // A player whose price has doubled must still be costed at what you
    // would have paid in August.
    const inflated = pool().map((x) => ({ ...x, now_cost: x.august_cost * 2 }));
    const xi = solveRollingXi(inflated);
    expect(xi!.cost).toBeLessThanOrEqual(ROLLING_XI_BUDGET);
    const summed = xi!.players.reduce((s, x) => s + x.august_cost, 0);
    expect(xi!.cost).toBe(summed);
  });

  it('returns null rather than a partial side when the pool cannot fill one', () => {
    // Two goalkeepers and nothing else shouldn't yield a nine-man XI.
    const thin = [p({ fpl_code: 1, element_type: 1 }), p({ fpl_code: 2, element_type: 1 })];
    expect(solveRollingXi(thin)).toBeNull();
  });

  it('prefers points over cheapness when budget allows', () => {
    const xi = solveRollingXi(pool());
    // Club A holds the highest scorers at every position, so a
    // points-maximising solve must take its three.
    expect(xi!.players.filter((x) => x.team_name === 'A')).toHaveLength(3);
  });
});
