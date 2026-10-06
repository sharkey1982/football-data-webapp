// The women's side of International: the Men | Women switch keeps you on the
// same page where the other side has one, and setIntlGender moves every path
// and the tournament list.
import { afterEach, describe, expect, it } from 'vitest';
import { otherSidePath } from '../components/intl/IntlBits';
import { INTL_FIXTURES_PATH, INTL_HUB_PATH, intlTeamPath, setIntlGender } from '../lib/intlApi';
import { intlMatchPath } from '../lib/intlMatch';
import { TOURNAMENTS, sideTitle, sinceYear } from '../lib/intlStats';

afterEach(() => setIntlGender('men'));

describe('otherSidePath', () => {
  it.each([
    ['/international', 'women', '/international/women'],
    ['/international/discover', 'women', '/international/women'],
    ['/international/women', 'men', '/international'],
    ['/international/teams/england', 'women', '/international/women/teams/england'],
    ['/international/women/teams/england', 'men', '/international/teams/england'],
    ['/international/matches/2026-11-14-england-v-spain', 'women', '/international/women/fixtures'],
    ['/international/tournaments/euro/2024', 'women', '/international/women/tournaments/euro'],
    ['/international/tournaments/gold-cup', 'women', '/international/women/tournaments'],
    ['/international/women/tournaments/olympics/2024', 'men', '/international/tournaments'],
    ['/international/history', 'women', '/international/women/history'],
  ] as const)('%s -> %s: %s', (from, to, want) => {
    expect(otherSidePath(from, to)).toBe(want);
  });
});

describe('setIntlGender', () => {
  it('moves the paths, tournaments and copy to the women’s side and back', () => {
    setIntlGender('women');
    expect(INTL_HUB_PATH).toBe('/international/women');
    expect(INTL_FIXTURES_PATH).toBe('/international/women/fixtures');
    expect(intlTeamPath('spain')).toBe('/international/women/teams/spain');
    expect(intlMatchPath('2025-07-27', 'england', 'spain')).toBe('/international/women/matches/2025-07-27-england-v-spain');
    expect(TOURNAMENTS.map((t) => t.slug)).toContain('olympics');
    expect(sinceYear()).toBe(1956);
    expect(sideTitle('X')).toMatch(/women/);
    setIntlGender('men');
    expect(INTL_FIXTURES_PATH).toBe('/international/fixtures');
    expect(TOURNAMENTS.map((t) => t.slug)).toContain('gold-cup');
    expect(sideTitle('X')).toBe('X');
  });
});
