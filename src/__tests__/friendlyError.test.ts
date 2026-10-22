// Audit 22 Oct 2026, S-19: public pages never show raw PostgREST text.
import { describe, expect, it, vi } from 'vitest';
import { friendlyError } from '../lib/errorMessage';

describe('friendlyError', () => {
  it('returns a plain sentence and logs the raw error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const raw = { message: 'permission denied for table fpl_player_projections', code: '42501' };
    const msg = friendlyError(raw, 'Failed to load player points');
    expect(msg).toBe('Failed to load player points. Please try again in a moment.');
    expect(msg).not.toMatch(/permission|42501/);
    expect(spy.mock.calls[0].join(' ')).toContain('permission denied');
    spy.mockRestore();
  });
});

describe('friendlyError passes through messages written for the visitor', () => {
  it('keeps an app-thrown message', () => {
    expect(friendlyError(new Error('No legal squad found'), 'Optimisation failed')).toBe('No legal squad found');
  });
  it('hides network and timeout errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(friendlyError(new TypeError('Failed to fetch'), 'Failed to load the TV guide')).toBe('Failed to load the TV guide. Please try again in a moment.');
    expect(friendlyError(new Error('canceling statement due to statement timeout'), 'Failed to load')).toBe('Failed to load. Please try again in a moment.');
    spy.mockRestore();
  });
});
