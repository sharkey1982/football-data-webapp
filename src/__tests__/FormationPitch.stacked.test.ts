import { describe, it, expect } from 'vitest';
import { layoutStacked } from '../components/fpl/FormationPitch';

function pl(id: number, name: string, pos: 1 | 2 | 3 | 4, role: string | null, start: number | null) {
  return {
    fpl_player_id: id, web_name: name, fpl_position: pos, fpl_position_label: ['', 'GKP', 'DEF', 'MID', 'FWD'][pos],
    tactical_role: role, start_probability: start, expected_minutes: null, set_piece_roles: [],
  } as never;
}

const arsenal = [
  pl(1, 'Raya', 1, 'GK', 0.96), pl(2, 'Arrizabalaga', 1, 'GK', 0.02),
  pl(8, 'Calafiori', 2, 'LB', 0.94), pl(9, 'Hincapie', 2, 'LB', 0.11),
  pl(4, 'Gabriel', 2, 'LCB', 0.96),
  pl(6, 'Saliba', 2, 'RCB', 0), pl(31, 'Konsa', 2, 'RCB', 0.68), pl(11, 'Mosquera', 2, 'RCB', 0.33),
  pl(5, 'Timber', 2, 'RB', 0.44), pl(10, 'White', 2, 'RB', 0.53),
  pl(13, 'Rice', 3, 'DM', 0.73), pl(7, 'Lewis-Skelly', 3, 'DM', 0.63), pl(452, 'Bruno G.', 3, 'DM', 0.26), pl(19, 'Zubimendi', 3, 'DM', 0.14),
  pl(14, 'Eze', 3, 'LW', 0.9), pl(15, 'Odegaard', 3, 'AM', 0.94), pl(12, 'Saka', 3, 'RW', 0.94),
  pl(26, 'Havertz', 4, 'CF', 0.71), pl(25, 'Gyokeres', 4, 'CF', 0.28),
  pl(99, 'Nwaneri', 3, 'MID', 0.12),
];

const slotOf = (layout: ReturnType<typeof layoutStacked>, name: string) =>
  layout.slots.find((s) => s.player.web_name === name || s.extras.some((x) => x.web_name === name));

describe('layoutStacked', () => {
  const layout = layoutStacked(arsenal, '4-2-3-1');

  it('puts the likeliest player in each slot and stacks the rest of his place group under it', () => {
    const headlines = layout.slots.map((s) => s.player.web_name);
    expect(headlines).toEqual(expect.arrayContaining(['Raya', 'Calafiori', 'Gabriel', 'Konsa', 'White', 'Rice', 'Lewis-Skelly', 'Eze', 'Odegaard', 'Saka', 'Havertz']));
    expect(headlines).toHaveLength(11);
    expect(slotOf(layout, 'Mosquera')!.player.web_name).toBe('Konsa');
    expect(slotOf(layout, 'Timber')!.player.web_name).toBe('White');
  });

  it('never puts a midfielder in the back line', () => {
    for (const name of ['Zubimendi', 'Bruno G.', 'Lewis-Skelly']) {
      const slot = slotOf(layout, name)!;
      expect(slot.top).toBeLessThan(60); // DM line is at 54; defenders 70+
    }
  });

  it('leaves off players under the threshold and lists role-unconfirmed extras under the pitch', () => {
    const all = layout.slots.flatMap((s) => [s.player, ...s.extras]).map((p) => p.web_name);
    expect(all).not.toContain('Saliba'); // 0% (injured)
    expect(all).not.toContain('Arrizabalaga');
    expect(layout.others.map((p) => p.web_name)).toEqual(['Nwaneri']);
  });

  it('fills an empty slot from the nearest role, but not from far away', () => {
    const noRb = arsenal.filter((p) => !['Timber', 'White'].includes((p as { web_name: string }).web_name));
    const l = layoutStacked(noRb, '4-2-3-1');
    const rbSlot = l.slots.find((s) => s.left === 88 && s.top === 70);
    // Mosquera (a centre-back) is the closest fit for the empty right-back slot.
    expect(rbSlot?.player.web_name).toBe('Mosquera');
    expect(slotOf(l, 'Zubimendi')!.top).toBeLessThan(60);
  });

  it('works with no start chances at all (pecking-order views): nobody dropped, nobody out of position', () => {
    const depth2 = [pl(7, 'Lewis-Skelly', 3, 'DM', null), pl(19, 'Zubimendi', 3, 'DM', null), pl(452, 'Bruno G.', 3, 'DM', null), pl(31, 'Konsa', 2, 'RCB', null)];
    const l = layoutStacked(depth2, '4-2-3-1', 0);
    const placed = l.slots.flatMap((s) => [s.player, ...s.extras]);
    expect(placed).toHaveLength(4);
    // The three midfielders stay in midfield (the third may cover the empty No.10 slot), never the back line.
    for (const name of ['Lewis-Skelly', 'Zubimendi', 'Bruno G.']) expect(slotOf(l, name)!.top).toBeLessThan(60);
    expect(slotOf(l, 'Konsa')!.top).toBe(74);
  });
});
