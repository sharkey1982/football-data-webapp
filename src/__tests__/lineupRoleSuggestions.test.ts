import { describe, it, expect } from 'vitest';
import { summariseLineupRoles, planAccept } from '../lib/lineupRoleSuggestions';

const start = (id: number, role: string, team = 1) => ({ fpl_player_id: id, team_id: team, tactical_role: role });

describe('summariseLineupRoles', () => {
  it('suggests a position with 2+ starts and 60%+ share that differs from his main role', () => {
    const m = summariseLineupRoles([start(1, 'DM'), start(1, 'DM'), start(1, 'CM')], [{ fpl_player_id: 1, team_id: 1, tactical_role: 'CM' }]);
    expect(m.get(1)).toEqual({ starts: 3, byRole: [{ role: 'DM', n: 2 }, { role: 'CM', n: 1 }], suggested: 'DM' });
  });

  it('makes no suggestion from one start, a tie, a share under 60%, or his current role', () => {
    const players = [1, 2, 3, 4].map((id) => ({ fpl_player_id: id, team_id: 1, tactical_role: 'CM' }));
    const m = summariseLineupRoles(
      [start(1, 'DM'), start(2, 'DM'), start(2, 'AM'), start(3, 'DM'), start(3, 'DM'), start(3, 'AM'), start(3, 'LW'), start(3, 'RW'), start(4, 'CM'), start(4, 'CM')],
      players
    );
    expect([1, 2, 3, 4].map((id) => m.get(id)?.suggested)).toEqual([null, null, null, null]);
  });

  it('ignores starts for another club and players with no recorded starts', () => {
    const m = summariseLineupRoles([start(1, 'LW', 2), start(1, 'LW', 2)], [{ fpl_player_id: 1, team_id: 1, tactical_role: 'RW' }]);
    expect(m.has(1)).toBe(false);
  });
});

describe('planAccept', () => {
  it('keeps his depth rank and moves the old main role to Also plays', () => {
    expect(planAccept({ tactical_role: 'CB', depth_rank: 2, other_positions: [] }, 'LCB')).toEqual({ mainRole: 'LCB', depthRank: 2, removeOther: null, addOther: { role: 'CB', rank: 2 } });
  });

  it('swaps when the suggestion was already one of his Also plays', () => {
    expect(planAccept({ tactical_role: 'CM', depth_rank: 3, other_positions: [{ role: 'DM', rank: 1 }] }, 'DM')).toEqual({ mainRole: 'DM', depthRank: 1, removeOther: 'DM', addOther: { role: 'CM', rank: 3 } });
  });

  it('drops a generic placeholder rather than keeping it as Also plays', () => {
    expect(planAccept({ tactical_role: 'MID', depth_rank: 3, other_positions: [] }, 'RW')).toEqual({ mainRole: 'RW', depthRank: 3, removeOther: null, addOther: null });
  });
});
