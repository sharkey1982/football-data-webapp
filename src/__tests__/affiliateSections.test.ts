// Affiliate links are scoped per site section, and DAZN's NFL watch link
// never appears on a Sunday game that Game Pass may black out (23 Oct 2026).
import { describe, expect, it, vi, beforeEach } from 'vitest';

const calls: { method: string; args: unknown[] }[] = [];
vi.mock('../lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or', 'contains']) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ method: m, args });
      return chain;
    };
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
  return { supabase: { from: (t: string) => (calls.push({ method: 'from', args: [t] }), chain) } };
});

import { getActivePartners, resolveCommercialLink, type AffiliatePartner } from '../lib/commercialLinks';
import { nflWatch } from '../lib/nflWatch';

beforeEach(() => {
  calls.length = 0;
});

describe('affiliate partners by section', () => {
  it('asks only for partners listed for the requested section', async () => {
    await getActivePartners('streaming', 'nfl');
    expect(calls).toContainEqual({ method: 'contains', args: ['sections', ['nfl']] });
    expect(calls).toContainEqual({ method: 'eq', args: ['active', true] });
  });

  it('a page with no partners keeps the canonical link (football DAZN links stay plain)', () => {
    const link = resolveCommercialLink('https://www.dazn.com/en-GB/', []);
    expect(link).toEqual({ url: 'https://www.dazn.com/en-GB/', isAffiliate: false });
  });

  it('a partner for the section turns the DAZN link into a marked affiliate link', () => {
    const dazn: AffiliatePartner = {
      partnerId: 3,
      name: 'DAZN UK',
      category: 'streaming',
      network: 'Awin',
      canonicalDomain: 'dazn.com',
      affiliateUrlTemplate: 'https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued={url}',
      market: 'GB',
    };
    const link = resolveCommercialLink('https://www.dazn.com/', [dazn]);
    expect(link.isAffiliate).toBe(true);
    expect(link.url).toBe('https://www.awin1.com/cread.php?awinmid=1&awinaffid=2&ued=https%3A%2F%2Fwww.dazn.com%2F');
  });
});

describe('NFL Game Pass blackouts', () => {
  const reg = (kickoff_at: string, extra: Partial<{ neutral_site: boolean; stadium: string }> = {}) =>
    nflWatch({ game_type: 'REG', kickoff_at, neutral_site: false, stadium: 'Somewhere', ...extra });
  const dazn = (w: ReturnType<typeof nflWatch>) => w.offers.find((o) => o.broadcaster === 'DAZN')!;

  it('Sunday 18:00 and 21:25 UK games: DAZN listed with the blackout note and no link', () => {
    for (const ko of ['2026-10-25T18:00:00Z', '2026-10-25T21:25:00Z', '2026-10-18T17:00:00Z']) {
      const d = dazn(reg(ko));
      expect(d.watchUrl).toBeNull();
      expect(d.availabilityNotes).toMatch(/blacks out/);
    }
  });

  it('games Game Pass always shows live keep the DAZN link', () => {
    const live = [
      reg('2026-10-30T00:15:00Z'), // Thursday night
      reg('2026-10-26T01:20:00Z'), // Sunday night (after midnight UK)
      reg('2026-10-25T14:30:00Z', { neutral_site: true, stadium: 'Wembley Stadium' }), // London
      nflWatch({ game_type: 'SB', kickoff_at: '2027-02-14T23:30:00Z', neutral_site: true, stadium: 'X' }),
      nflWatch({ game_type: 'WC', kickoff_at: '2027-01-16T18:00:00Z', neutral_site: false, stadium: 'X' }),
    ];
    for (const w of live) expect(dazn(w).watchUrl).toBe('https://www.dazn.com/');
  });
});
