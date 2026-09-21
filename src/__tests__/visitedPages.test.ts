import { describe, it, expect, beforeEach } from 'vitest';
import { pageKey, recordVisit, getVisitedPages, orderForDiscovery, _resetVisitedPages } from '../lib/visitedPages';

beforeEach(() => _resetVisitedPages());

describe('visited pages (this visit, in memory only)', () => {
  it('groups pages by their first two path segments', () => {
    expect(pageKey('/fpl/team-of-the-week/gw5')).toBe('/fpl/team-of-the-week');
    expect(pageKey('/football/matches/arsenal-v-chelsea?x=1')).toBe('/football/matches');
    expect(pageKey('/team-strength/')).toBe('/team-strength');
    expect(pageKey('/')).toBe('/');
  });

  it('records visits without touching device storage', () => {
    const before = typeof localStorage !== 'undefined' ? localStorage.length : 0;
    recordVisit('/fpl/value');
    expect(getVisitedPages().has('/fpl/value')).toBe(true);
    if (typeof localStorage !== 'undefined') expect(localStorage.length).toBe(before);
  });

  it('orders unvisited pages first, each group shuffled', () => {
    const items = ['/a', '/b', '/c', '/d'].map((to) => ({ link: { to } }));
    recordVisit('/a');
    recordVisit('/c');
    const out = orderForDiscovery(items, getVisitedPages()).map((i) => i.link.to);
    expect(out.slice(0, 2).sort()).toEqual(['/b', '/d']);
    expect(out.slice(2).sort()).toEqual(['/a', '/c']);
  });
});
