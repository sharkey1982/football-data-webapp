// International TV Guide rights rules (src/lib/intlWatch.ts).
import { describe, expect, it } from 'vitest';
import { intlGuideItem, intlWatch } from '../lib/intlWatch';
import { fixtureWatchState } from '../lib/watchGuide';

const names = (w: ReturnType<typeof intlWatch>) => w.offers.map((o) => o.broadcaster);

describe('intlWatch', () => {
  it('home nations: ITV for England, the BBC for Scotland, Wales and Northern Ireland', () => {
    expect(names(intlWatch('England', 'Greece', 'UEFA Nations League', 'men'))).toEqual(['ITV']);
    expect(names(intlWatch('Switzerland', 'Scotland', 'UEFA Nations League', 'men'))).toEqual(['BBC']);
    expect(names(intlWatch('Wales', 'England', 'Friendly', 'men'))).toEqual(['ITV', 'BBC']);
    expect(names(intlWatch('England', 'Spain', 'Friendly', 'women'))).toEqual(['ITV']);
    expect(fixtureWatchState(intlWatch('England', 'Greece', 'UEFA Nations League', 'men').offers)).toMatchObject({ kind: 'watch', best: 'free' });
  });

  it('Ireland pay-per-view; other UEFA games a note; others say nothing', () => {
    const ire = intlWatch('Republic of Ireland', 'Kosovo', 'UEFA Nations League', 'men');
    expect(fixtureWatchState(ire.offers)).toMatchObject({ kind: 'watch', best: 'ppv' });
    const other = intlWatch('Croatia', 'Spain', 'UEFA Nations League', 'men');
    expect(other.offers).toEqual([]);
    expect(other.note).toMatch(/Prime Video/);
    const far = intlWatch('Chile', 'Mexico', 'Friendly', 'men');
    expect(far).toEqual({ offers: [], note: null });
    expect(fixtureWatchState(far.offers).kind).toBe('unknown'); // "not yet confirmed", never "not on TV"
  });

  it('a fixture becomes a guide row in UK time with the model pick and a match link', () => {
    const row = intlGuideItem(
      { fixture_key: 'k', edition_key: 'UNL-2026-27', kickoff_utc: '2026-11-14T19:45:00Z', home_team: 'England', home_slug: 'england', away_team: 'Greece', away_slug: 'greece', group_label: 'B2', round_number: 5, venue: 'Wembley', home_score: null, away_score: null, match_key: null, p_home: 0.7, p_draw: 0.2, p_away: 0.1, xg_home: 2, xg_away: 0.6 },
      () => 'UEFA',
    );
    expect(row).toMatchObject({ kickoffDate: '2026-11-14', kickoffTime: '19:45', leagueName: 'UEFA Nations League', href: '/international/matches/2026-11-14-england-v-greece' });
    expect(String(row.subtitle)).toContain('League B, Group 2 · Wembley · Model: England 70%');
  });
});
