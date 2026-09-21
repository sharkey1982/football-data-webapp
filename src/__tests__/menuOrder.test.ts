import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { menuIndex, menuOrder } from '../lib/journey';

describe('trivia follows the header menu', () => {
  const order = menuOrder();
  it('reads the menu in order: Football first, then Fantasy', () => {
    expect(order[0]).toBe('/fixtures');
    expect(order.indexOf('/team-strength')).toBeLessThan(order.indexOf('/fpl/player-scout'));
  });
  it('places a path exactly, via an alias, under its parent page, or last if unknown', () => {
    expect(menuIndex('/table')).toBe(order.indexOf('/table'));
    expect(menuIndex('/football/matches/arsenal-v-spurs')).toBe(order.indexOf('/fixtures'));
    expect(menuIndex('/fpl/team-of-the-week/gw5')).toBe(order.indexOf('/fpl/team-of-the-week'));
    expect(menuIndex('/not-a-page')).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('every link a trivia question uses is a page in the menu', () => {
    const src = readFileSync('src/lib/landingApi.ts', 'utf8');
    const links = [...src.matchAll(/link: \{ to: [`']([^`'$]+)/g)].map((m) => m[1]).concat('/fpl/team-of-the-week/gw5', '/football/matches/x');
    expect(links.length).toBeGreaterThan(10);
    for (const l of links) expect(menuIndex(l), l).toBeLessThan(Number.MAX_SAFE_INTEGER);
  });
});
