import { describe, it, expect } from 'vitest';
import { parseNewsReturnDate } from '../lib/tacticalRoleAdminApi';

const today = new Date('2026-10-06T12:00:00Z');

describe('parseNewsReturnDate (same reading as fpl_player_fixture_availability)', () => {
  it('reads "Expected back" with the news year', () => {
    expect(parseNewsReturnDate('Hamstring injury - Expected back 18 Oct', '2026-10-01T10:00:00Z', today)).toBe('2026-10-18');
  });
  it('reads "until" for suspensions', () => {
    expect(parseNewsReturnDate('Suspended until 25 Oct', '2026-10-05T10:00:00Z', today)).toBe('2026-10-25');
  });
  it('rolls into the next year when the date would be well before the news', () => {
    expect(parseNewsReturnDate('Knee injury - Expected back 10 Jan', '2026-12-20T10:00:00Z', today)).toBe('2027-01-10');
  });
  it('keeps a date just before the news in the same year', () => {
    expect(parseNewsReturnDate('Expected back 28 Sep', '2026-10-05T10:00:00Z', today)).toBe('2026-09-28');
  });
  it('returns null without a date', () => {
    expect(parseNewsReturnDate('Knee injury - Unknown return date', '2026-10-01T10:00:00Z', today)).toBeNull();
    expect(parseNewsReturnDate(null, null, today)).toBeNull();
  });
  it('uses today when the news date is missing', () => {
    expect(parseNewsReturnDate('Expected back 18 Oct', null, today)).toBe('2026-10-18');
  });
});
