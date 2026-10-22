import { describe, it, expect } from 'vitest';
import { ukDateOf, ukToday, addIsoDays } from '../lib/ukDate';

describe('ukDate (CODE-13: UK calendar date, not UTC)', () => {
  it('is already tomorrow in the UK between 00:00 and 01:00 BST', () => {
    // 23:30 UTC on 22 Oct 2026 is 00:30 BST on 23 Oct.
    const late = new Date('2026-10-22T23:30:00Z');
    expect(late.toISOString().slice(0, 10)).toBe('2026-10-22');
    expect(ukToday(late)).toBe('2026-10-23');
  });

  it('matches UTC in winter (GMT)', () => {
    expect(ukDateOf('2026-12-31T23:30:00Z')).toBe('2026-12-31');
    expect(ukDateOf(Date.parse('2027-01-01T00:30:00Z'))).toBe('2027-01-01');
  });

  it('handles the clock changes', () => {
    expect(ukDateOf('2026-10-25T00:30:00Z')).toBe('2026-10-25'); // 01:30 BST, the hour before the change
    expect(ukDateOf('2027-03-27T23:30:00Z')).toBe('2027-03-27'); // GMT until 01:00 UTC on the 28th
  });

  it('adds calendar days across months and the clock change', () => {
    expect(addIsoDays('2026-10-22', 21)).toBe('2026-11-12');
    expect(addIsoDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addIsoDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
