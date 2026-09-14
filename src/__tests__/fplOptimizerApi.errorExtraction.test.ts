import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));

import { supabase } from '../lib/supabase';
import { optimizeFplSquad } from '../lib/fplOptimizerApi';

describe('optimizeFplSquad -- error message extraction', () => {
  it('extracts the backend\'s real error message from a non-2xx response context, not the generic client message', async () => {
    const fakeResponse = {
      text: async () => JSON.stringify({ error: 'Missing projections; available GWs: 5,6,7' }),
    };
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: fakeResponse },
    });

    await expect(optimizeFplSquad(5, 10, 100)).rejects.toThrow('Missing projections; available GWs: 5,6,7');
  });

  it('falls back to the generic client message when the response body is not readable/valid JSON', async () => {
    const fakeResponse = { text: async () => 'not json' };
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: fakeResponse },
    });

    await expect(optimizeFplSquad(5, 10, 100)).rejects.toThrow('Edge Function returned a non-2xx status code');
  });

  it('never produces the literal "[object Object]" when error.message is not a plain string (the real reported bug)', async () => {
    // Reproduces the actual case seen live: no response context at all
    // (a genuine network-level failure, confirmed via the function's own
    // logs showing zero requests received), and error.message is some
    // non-string value rather than a plain string.
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: { message: { code: 'ECONNRESET' }, context: undefined },
    });

    let caught: Error | null = null;
    try {
      await optimizeFplSquad(5, 6, 100);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).not.toBe('[object Object]');
    expect(caught!.message).toContain('Could not reach the squad optimiser');
  });

  it('returns the parsed result on success', async () => {
    const fakeResult = { from_matchweek: 5, to_matchweek: 5, weeks: [5], squad: [], weekly_plan: [] };
    (supabase.functions.invoke as any).mockResolvedValue({ data: fakeResult, error: null });
    await expect(optimizeFplSquad(5, 5, 100)).resolves.toEqual(fakeResult);
  });
});
