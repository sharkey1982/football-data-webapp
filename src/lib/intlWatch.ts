// ============================================================================
// src/lib/intlWatch.ts
//
// "Where can I watch this international in the UK?" -- the International TV
// Guide's viewing routes. Like the NFL and tennis guides, this applies the
// published UK rights rather than scraping listings (their terms forbid it):
//
// Men (UEFA games -- Nations League, Euro 2028 qualifiers, friendlies):
//   * England                    ITV (ITV1/ITV4, ITVX; STV in Scotland), free, to Jun 2028
//   * Scotland, Wales, N Ireland BBC (iPlayer; BBC Alba for Scotland, S4C for
//                                Wales), free, home and away, to Jun 2028
//   * Republic of Ireland        Prime Video pay-per-view in the UK (RTÉ in Ireland)
//   * other UEFA nations         Prime Video shows selected games pay-per-view
//                                (Viaplay's UK rights): a note, not a promise
// Women:
//   * England                    ITV, free, to 2029
//   * Scotland, Wales, N Ireland BBC, free
//   * Women's World Cup 2027     BBC and ITV share the games
//
// A row with no rule says nothing ("not yet confirmed"), never "not on TV",
// as on the football guide. RULES_CHECKED is shown on the page; re-check the
// rights each season (every men's UEFA deal ends in June 2028).
// ============================================================================

import type { WatchOffer } from './watchGuide';
import type { WatchGuideItem } from '../components/WatchGuideView';
import { intlMatchPath } from './intlMatch';
import { INTL_GENDER, pct, ukDateTime, type IntlFixture } from './intlStats';

export const INTL_RULES_CHECKED = '7 October 2026';

export const INTL_TV_SOURCES = [
  { label: 'ITV (England men): 2024–28', url: 'https://www.itv.com/presscentre/node/21476' },
  { label: 'ITV (Lionesses): 2025–29', url: 'https://www.itv.com/presscentre/node/38791' },
  { label: 'BBC (Scotland, Wales, NI): Scotland, Wales and Northern Ireland to 2028', url: 'https://www.advanced-television.com/2026/06/25/scotland-wales-northern-ireland-football-remains-fta-on-bbc/' },
  { label: 'Prime Video: UEFA games pay-per-view', url: 'https://www.sportcal.com/media/amazon-to-offer-uefa-nations-league-matches-ppv-in-uk/' },
];

let nextId = -1;
function offer(o: Partial<WatchOffer> & Pick<WatchOffer, 'broadcaster' | 'availabilityNotes' | 'source'>): WatchOffer {
  return {
    broadcastId: nextId--,
    status: 'confirmed_broadcast',
    channel: null,
    streamingService: null,
    serviceProduct: null,
    accessType: 'free',
    deliveryMethods: ['tv', 'streaming'],
    platformDevice: null,
    isFast: false,
    isFreeToAir: true,
    isSubscription: false,
    isPpv: false,
    watchUrl: null,
    confidence: 'rule',
    sourceUrl: null,
    verifiedAt: null,
    ...o,
  };
}

const ITV = (who: string) =>
  offer({
    broadcaster: 'ITV',
    channel: 'ITV1 or ITV4 (STV in Scotland)',
    streamingService: 'ITVX',
    watchUrl: 'https://www.itv.com/watch/categories/sport',
    source: 'rule:intl_itv',
    availabilityNotes: `ITV shows every ${who} game live and free.`,
  });

const BBC = (who: string, extra?: string) =>
  offer({
    broadcaster: 'BBC',
    channel: extra ? `BBC (${extra})` : 'BBC',
    streamingService: 'BBC iPlayer',
    watchUrl: 'https://www.bbc.co.uk/iplayer/categories/sport/featured',
    source: 'rule:intl_bbc',
    availabilityNotes: `The BBC shows ${who} games live and free, home and away.`,
  });

const PRIME_PPV = (why: string) =>
  offer({
    broadcaster: 'Prime Video',
    streamingService: 'Prime Video',
    serviceProduct: 'Pay-per-view',
    accessType: 'ppv',
    deliveryMethods: ['streaming'],
    isFreeToAir: false,
    isPpv: true,
    watchUrl: 'https://www.primevideo.com/',
    source: 'rule:intl_prime_ppv',
    availabilityNotes: why,
  });

export type IntlWatch = { offers: WatchOffer[]; note: string | null };

/** Viewing routes for one game from the rights rules. competition: the
 * fixture's competition name (only UEFA competitions and friendlies have rules). */
export function intlWatch(home: string, away: string, competition: string, gender = INTL_GENDER): IntlWatch {
  const teams = [home, away];
  const has = (t: string) => teams.includes(t);
  const offers: WatchOffer[] = [];
  const women = gender === 'women';
  if (women && /World Cup/.test(competition) && !/qualif/i.test(competition)) {
    return { offers, note: 'The BBC and ITV share the Women’s World Cup games, free; which channel shows this one is announced nearer the time.' };
  }
  if (has('England')) offers.push(ITV(women ? 'Lionesses' : 'England'));
  if (has('Scotland')) offers.push(BBC(women ? 'Scotland women’s' : 'Scotland', 'BBC Scotland; Gaelic on BBC Alba'));
  if (has('Wales')) offers.push(BBC(women ? 'Wales women’s' : 'Wales', 'BBC Wales; S4C in Welsh'));
  if (has('Northern Ireland')) offers.push(BBC(women ? 'Northern Ireland women’s' : 'Northern Ireland', 'BBC Northern Ireland'));
  if (offers.length) return { offers, note: null };
  if (!women && has('Republic of Ireland') && /UEFA|Nations League|Euro/.test(competition)) {
    return { offers: [PRIME_PPV('Prime Video shows Republic of Ireland games pay-per-view in the UK (RTÉ shows them free in Ireland).')], note: null };
  }
  if (!women && /UEFA|Nations League|Euro/.test(competition)) {
    return { offers, note: 'Prime Video shows selected UEFA games pay-per-view in the UK; check its listings nearer the time.' };
  }
  return { offers, note: null };
}

/** Competition name of a fixture-feed edition. */
export function editionCompetition(editionKey: string): string {
  if (editionKey.startsWith('UNL-')) return 'UEFA Nations League';
  return editionKey;
}

/** A stable numeric id per fixture (the guide keys rows by number). */
export function fixtureNumber(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** One coming international as a row of the shared TV Guide. */
export function intlGuideItem(f: IntlFixture, confederationOf: (team: string) => string | null): WatchGuideItem {
  const competition = editionCompetition(f.edition_key);
  const w = intlWatch(f.home_team, f.away_team, competition);
  const { date, time } = ukDateTime(f.kickoff_utc);
  const pick =
    f.p_home != null && f.p_away != null
      ? f.p_home >= f.p_away
        ? `${f.home_team} ${pct(f.p_home)}`
        : `${f.away_team} ${pct(f.p_away)}`
      : null;
  const stage = [f.group_label ? `League ${f.group_label.split('')[0]}${f.group_label.length > 1 ? `, Group ${f.group_label.slice(1)}` : ''}` : null, f.venue].filter(Boolean).join(' · ');
  return {
    fixtureId: fixtureNumber(f.fixture_key),
    slug: null,
    href: f.home_slug && f.away_slug ? intlMatchPath(date, f.home_slug, f.away_slug) : null,
    kickoffDate: date,
    kickoffTime: time,
    leagueCode: f.edition_key,
    leagueName: competition,
    countryName: confederationOf(f.home_team) ?? 'International',
    competitionType: 'cup',
    leagueTier: null,
    homeTeamName: f.home_team,
    awayTeamName: f.away_team,
    homeTeamCountry: confederationOf(f.home_team),
    awayTeamCountry: confederationOf(f.away_team),
    predictedHomeGoals: f.xg_home ?? null,
    predictedAwayGoals: f.xg_away ?? null,
    offers: w.offers,
    subtitle: `${competition}${stage ? ` · ${stage}` : ''}${pick ? ` · Model: ${pick}` : ''}`,
    note: w.note ? { text: w.note } : undefined,
  };
}
