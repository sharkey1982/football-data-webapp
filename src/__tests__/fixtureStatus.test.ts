import { describe, expect, it } from 'vitest';
import { hasKickedOff, isAwaitingResult, KICKED_OFF_STATUSES } from '../lib/fixtureStatus';

// DQ-02 (22 Oct 2026): 'awaiting_result' is a kicked-off game whose result has
// not arrived; it must never be treated as upcoming.
describe('fixture status helpers', () => {
  it('treats played and awaiting_result as kicked off', () => {
    expect(hasKickedOff('played')).toBe(true);
    expect(hasKickedOff('awaiting_result')).toBe(true);
  });

  it('treats scheduled, postponed and missing as not kicked off', () => {
    expect(hasKickedOff('scheduled')).toBe(false);
    expect(hasKickedOff('postponed')).toBe(false);
    expect(hasKickedOff(null)).toBe(false);
    expect(hasKickedOff(undefined)).toBe(false);
  });

  it('flags only awaiting_result as awaiting a result', () => {
    expect(isAwaitingResult('awaiting_result')).toBe(true);
    expect(isAwaitingResult('played')).toBe(false);
    expect(isAwaitingResult('scheduled')).toBe(false);
  });

  it('lists the kicked-off statuses for PostgREST filters', () => {
    expect([...KICKED_OFF_STATUSES].sort()).toEqual(['awaiting_result', 'played']);
  });
});
