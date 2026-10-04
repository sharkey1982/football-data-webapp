// ============================================================================
// src/lib/nflWatch.ts
//
// "How, when and where can I watch this NFL game in the UK?"
//
// The football TV Guide deliberately does not scrape listings sites (their
// terms forbid it; see broadcastsApi.ts). There is no per-game NFL feed
// either, so this works from the published UK rights for 2026/27 instead,
// and says plainly which games are picked week by week:
//
//   * DAZN NFL Game Pass   every game, live (subscription).
//   * Sky Sports NFL       the prime-time games (Thursday, Sunday and Monday
//                          nights -- after 23:00 UK), every London and
//                          European game, the play-offs and the Super Bowl;
//                          also through NOW. It picks further Sunday games
//                          each week from the 18:00 and 21:25 windows.
//   * 5 (free)             two Sunday games a week (18:00 on 5ACTION, 21:25
//                          on 5), all three London games, one play-off game
//                          a week and the Super Bowl -- also on My5.
//
// Rule rows say which rule produced them; the Sunday picks link to the
// broadcaster's listings rather than guessing. RULES_CHECKED is shown on
// the page; re-check the rights each season.
// ============================================================================

import type { WatchOffer } from './watchGuide';
import type { NflGame } from './nflApi';

export const RULES_CHECKED = '4 October 2026';

export const NFL_TV_SOURCES = [
  { label: 'Sky Sports: NFL on Sky', url: 'https://www.skysports.com/watch/nfl-on-sky' },
  {
    label: '5: NFL On 5 for 2026/27 (press release, 2 Sep 2026)',
    url: 'https://paramount-mediahub.co.uk/press-releases/nfl-on-5-supersizes-its-free-to-air-coverage-as-the-sport-returns-to-channel-5--for-another-adrenalin-fuelled-season',
  },
  { label: 'DAZN: NFL Game Pass', url: 'https://www.dazn.com/en-GB/help/articles/16858954355485' },
];

const SKY_LISTINGS = 'https://www.skysports.com/watch/nfl-on-sky';
const LONDON = /tottenham|wembley/i;

function ukParts(iso: string): { day: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', hour12: false }).formatToParts(new Date(iso));
  return {
    day: parts.find((p) => p.type === 'weekday')?.value ?? '',
    hour: Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24,
  };
}

let nextId = -1;
function offer(o: Partial<WatchOffer> & Pick<WatchOffer, 'broadcaster' | 'availabilityNotes' | 'source'>): WatchOffer {
  return {
    broadcastId: nextId--,
    status: 'confirmed_broadcast',
    channel: null,
    streamingService: null,
    serviceProduct: null,
    accessType: 'subscription',
    deliveryMethods: [],
    platformDevice: null,
    isFast: false,
    isFreeToAir: false,
    isSubscription: true,
    isPpv: false,
    watchUrl: null,
    confidence: 'rule',
    sourceUrl: null,
    verifiedAt: null,
    ...o,
  };
}

const DAZN = () =>
  offer({
    broadcaster: 'DAZN',
    serviceProduct: 'DAZN NFL Game Pass',
    streamingService: 'DAZN app',
    deliveryMethods: ['streaming'],
    watchUrl: 'https://www.dazn.com/',
    source: 'rule:nfl_game_pass',
    availabilityNotes: 'NFL Game Pass on DAZN streams every game live.',
  });

const SKY = (why: string) =>
  offer({
    broadcaster: 'Sky Sports',
    channel: 'Sky Sports NFL',
    streamingService: 'NOW',
    deliveryMethods: ['tv', 'streaming'],
    watchUrl: SKY_LISTINGS,
    source: 'rule:nfl_sky',
    availabilityNotes: why,
  });

const FIVE = (channel: '5' | '5ACTION', why: string) =>
  offer({
    broadcaster: '5',
    channel,
    streamingService: 'My5',
    accessType: 'free',
    isFreeToAir: true,
    isSubscription: false,
    deliveryMethods: ['tv', 'streaming'],
    source: 'rule:nfl_five',
    availabilityNotes: why,
  });

export type NflWatch = {
  offers: WatchOffer[];
  /** Sky and 5 choose this game's window week by week: say so, with the listings link. */
  pickedWeekly: string | null;
  listingsUrl: string;
};

export function nflWatch(g: Pick<NflGame, 'game_type' | 'kickoff_at' | 'neutral_site' | 'stadium'>): NflWatch {
  const offers: WatchOffer[] = [DAZN()];
  let pickedWeekly: string | null = null;
  if (!g.kickoff_at) return { offers, pickedWeekly: 'Kick-off time not set yet; UK broadcasts follow once it is.', listingsUrl: SKY_LISTINGS };
  const { day, hour } = ukParts(g.kickoff_at);
  const primetime = hour >= 23 || hour < 6;
  const london = g.neutral_site && LONDON.test(g.stadium ?? '');
  // European neutral-site games kick off in the UK afternoon; Sky shows every
  // London and European game. (Neutral games elsewhere fall to the other rules.)
  const european = g.neutral_site && hour >= 9 && hour < 17;

  if (g.game_type === 'SB') {
    offers.push(SKY('Sky Sports shows the Super Bowl live.'), FIVE('5', '5 shows the Super Bowl live and free.'));
  } else if (g.game_type !== 'REG') {
    offers.push(SKY('Sky Sports shows the play-offs live.'));
    pickedWeekly = '5 also shows one play-off game free each round, announced nearer the time.';
  } else if (london) {
    offers.push(SKY('Sky Sports shows every London game live.'), FIVE('5', '5 shows all three London games live and free.'));
  } else if (european) {
    offers.push(SKY('Sky Sports shows every European game live.'));
  } else if (primetime) {
    offers.push(SKY('Sky Sports shows the prime-time games (Thursday, Sunday and Monday nights) live.'));
  } else if (day === 'Sun' && hour >= 17 && hour < 23) {
    pickedWeekly =
      'Sky Sports and 5 pick their Sunday games each week: Sky shows several of the 18:00 and 21:25 games (some on Sky Sports+), and 5 shows one early-evening game on 5ACTION and one late game on 5, free.';
  } else {
    pickedWeekly = 'Sky Sports picks its other games each week.';
  }
  return { offers, pickedWeekly, listingsUrl: SKY_LISTINGS };
}
