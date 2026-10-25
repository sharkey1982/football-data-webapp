import { describe, it, expect } from 'vitest';
import { rangeBounds, datesBetween, nextDateAfter, parseRange, longDay, emptyRangeText, stepRange, rangeCaption } from '../lib/dateRange';
import { ukToday } from '../lib/ukDate';

describe('dateRange (range views on fixture lists)', () => {
  it('today is the UK date, not UTC, just after midnight BST', () => {
    const today = ukToday(new Date('2026-10-23T23:30:00Z')); // 00:30 BST Sat 24 Oct
    expect(rangeBounds('today', today)).toEqual({ start: '2026-10-24', end: '2026-10-24' });
    expect(rangeBounds('week', today)).toEqual({ start: '2026-10-19', end: '2026-10-25' });
  });

  it('weeks run Monday to Sunday', () => {
    expect(rangeBounds('week', '2026-10-19')).toEqual({ start: '2026-10-19', end: '2026-10-25' }); // Monday
    expect(rangeBounds('week', '2026-10-25')).toEqual({ start: '2026-10-19', end: '2026-10-25' }); // Sunday
    expect(rangeBounds('week', '2026-10-26')).toEqual({ start: '2026-10-26', end: '2026-11-01' });
    expect(rangeBounds('week', '2026-12-31')).toEqual({ start: '2026-12-28', end: '2027-01-03' }); // across the year
  });

  it('months end on the right day', () => {
    expect(rangeBounds('month', '2026-10-25')).toEqual({ start: '2026-10-01', end: '2026-10-31' });
    expect(rangeBounds('month', '2026-11-05')).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(rangeBounds('month', '2027-02-14')).toEqual({ start: '2027-02-01', end: '2027-02-28' });
    expect(rangeBounds('month', '2028-02-29')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });

  it('the clocks-change weekend keeps seven distinct days', () => {
    // BST ends 01:00 UTC Sun 25 Oct 2026; 23:30 UTC that night is still Sunday in the UK (GMT).
    expect(ukToday(new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-25');
    const { start, end } = rangeBounds('week', '2026-10-25');
    expect(datesBetween(start, end)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(datesBetween('2027-03-27', '2027-03-29')).toEqual(['2027-03-27', '2027-03-28', '2027-03-29']); // spring forward
  });

  it('finds the next date with games and reads ?range=', () => {
    expect(nextDateAfter(['2026-10-20', '2026-11-07', '2026-10-31'], '2026-10-25')).toBe('2026-10-31');
    expect(nextDateAfter(['2026-10-20'], '2026-10-25')).toBeNull();
    expect(parseRange('week', ['next', 'today', 'week', 'month'])).toBe('week');
    expect(parseRange('all', ['next', 'today', 'week', 'month'])).toBeNull();
    expect(parseRange(null, ['week'])).toBeNull();
    expect(longDay('2026-10-31')).toBe('Saturday 31 October');
    expect(emptyRangeText('today')).toBe('No games today');
  });

  it('steps weeks and months and captions them', () => {
    expect(stepRange('week', '2026-10-25', 1)).toBe('2026-10-26');
    expect(stepRange('week', '2026-10-25', -1)).toBe('2026-10-12');
    expect(stepRange('month', '2026-12-15', 1)).toBe('2027-01-01');
    expect(stepRange('month', '2026-01-31', -1)).toBe('2025-12-01');
    expect(rangeCaption('week', '2026-10-25')).toBe('Mon 19 Oct to Sun 25 Oct');
    expect(rangeCaption('month', '2026-10-25')).toBe('October 2026');
  });
});
