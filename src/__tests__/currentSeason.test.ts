import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { getCurrentFplSeasonId, getCurrentSeasonId, resetCurrentSeasonCache } from '../lib/currentSeason';

describe('current season lookup', () => {
  beforeEach(() => {
    rpc.mockReset();
    resetCurrentSeasonCache();
  });

  it('asks the database, not a constant, and asks once per page load', async () => {
    rpc.mockResolvedValue({ data: 36, error: null });
    expect(await getCurrentFplSeasonId()).toBe(36);
    expect(await getCurrentFplSeasonId()).toBe(36);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('fpl_current_season_id');
  });

  it('keeps the football and FPL seasons apart', async () => {
    rpc.mockImplementation(async (fn: string) => ({ data: fn === 'current_season_id' ? 36 : 13, error: null }));
    expect(await getCurrentSeasonId()).toBe(36);
    expect(await getCurrentFplSeasonId()).toBe(13);
  });

  it('does not cache a failure', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: new Error('down') }).mockResolvedValueOnce({ data: 13, error: null });
    await expect(getCurrentSeasonId()).rejects.toThrow('down');
    expect(await getCurrentSeasonId()).toBe(13);
  });
});
