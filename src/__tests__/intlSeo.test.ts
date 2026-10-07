import { describe, expect, it } from 'vitest';
import { intlEditionHead, intlTeamHead, intlTournamentHead } from '../lib/intlSeo';
import { TOURNAMENTS } from '../lib/intlStats';
import { setIntlGender } from '../lib/intlApi';

describe('international page heads (shared by the pages and the static build)', () => {
  const wc = TOURNAMENTS.find((t) => t.slug === 'world-cup')!;

  it('nation', () => {
    const h = intlTeamHead({ team: 'England', slug: 'england', played: 1080, won: 600, first_match: '1872-11-30', elo: 2010.4, elo_rank: 4 });
    expect(h.path).toBe('/international/teams/england');
    expect(h.title).toBe('England national team: record, rating and tournament history');
    expect(h.description).toContain('since 1872; Elo 2010 (ranked 4)');
  });

  it('tournament and edition, with and without the final score', () => {
    expect(intlTournamentHead(wc).path).toBe('/international/tournaments/world-cup');
    const e = { label: '2022', winner: 'Argentina', runner_up: 'France' };
    expect(intlEditionHead(wc, e).path).toBe('/international/tournaments/world-cup/2022');
    expect(intlEditionHead(wc, e).description).toBe('FIFA World Cup 2022: Argentina beat France. Every group, knockout round, scorer and upset.');
    expect(intlEditionHead(wc, e, '3-3').description).toContain('Argentina beat France 3-3 in the final');
    expect(intlEditionHead(wc, { label: '2026', winner: null, runner_up: null }).description).toBe('FIFA World Cup 2026: every group, fixture and result.');
  });

  it('women’s pages: paths, titles and crumbs follow the side', () => {
    setIntlGender('women');
    try {
      const h = intlTeamHead({ team: 'Spain', slug: 'spain', played: 277, won: 157, first_match: '1985-04-27', elo: 2413, elo_rank: 1 });
      expect(h.path).toBe('/international/women/teams/spain');
      expect(h.title).toBe('Spain national team: record, rating and tournament history — women’s football');
      expect(h.crumbs?.map((c) => c.path)).toEqual(['/international', '/international/women', '/international/women/teams']);
      const oly = TOURNAMENTS.find((t) => t.slug === 'olympics')!;
      expect(intlEditionHead(oly, { label: '2024', winner: 'United States', runner_up: 'Brazil' }).path).toBe('/international/women/tournaments/olympics/2024');
    } finally {
      setIntlGender('men');
    }
  });
});
