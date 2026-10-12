import { describe, expect, it } from 'vitest';
import { addedNumbers, weightedLength } from '../lib/socialApi';

// Values checked against public.social_weighted_length / social_numbers in Postgres.
describe('social post text rules', () => {
  it('counts like X: URLs 23, wide characters 2', () => {
    expect(weightedLength('FPL GW7 captaincy')).toBe(17);
    expect(weightedLength('see https://fixtureshark.com/fpl/gameweek/2026-27/7/preview now')).toBe(31);
    expect(weightedLength('Groß → 1.5')).toBe(11); // the arrow counts 2
    expect(weightedLength('⚽ goal')).toBe(7);
    expect(weightedLength('日本')).toBe(4);
  });
  it('lets an edit reword but not add numbers', () => {
    const gen = 'FPL GW7 captaincy\n1. Haaland (MCI, £15.6m) 8.9';
    expect(addedNumbers('GW7: Haaland 8.9 (£15.6m)', gen)).toEqual([]);
    expect(addedNumbers('GW7: Haaland 9.9', gen)).toEqual(['9.9']);
    expect(addedNumbers('Haaland 100% nailed for GW7', gen)).toEqual(['100']);
  });
});
