// ============================================================================
// src/lib/watchGuide.ts
//
// Pure logic behind the UK Watch Guide: "can I legally watch this match
// live in the UK, and if so where and how?"
//
// A fixture has 0..n viewing offers. Its state is derived, never stored:
//   watch     -- at least one confirmed offer
//   not_live  -- an explicit, evidenced "confirmed not televised" row
//   unknown   -- nothing confirmed. Absence of data NEVER means "not on TV".
//
// Offers are ranked free -> free with a compatible device -> subscription
// -> pay-per-view -> unknown, but every route is kept, not just the best.
//
// Designed for "what can I watch with the services I have": providerKeys()
// normalises offers to service keys, and canWatchWith() answers per offer
// once a user's services are known. No account storage exists yet; these
// are the seams it will plug into.
// ============================================================================

export type AccessTier = 'free' | 'free_compatible_device' | 'subscription' | 'ppv' | 'unknown';

export type WatchOffer = {
  broadcastId: number;
  status: 'confirmed_broadcast' | 'confirmed_not_televised';
  broadcaster: string | null;
  channel: string | null;
  streamingService: string | null;
  serviceProduct: string | null;
  accessType: AccessTier | null;
  deliveryMethods: string[];
  platformDevice: string | null;
  isFast: boolean;
  isFreeToAir: boolean;
  isSubscription: boolean;
  isPpv: boolean;
  watchUrl: string | null;
  confidence: string | null;
  availabilityNotes: string | null;
  source: string | null;
  sourceUrl: string | null;
  verifiedAt: string | null;
};

export const TIER_ORDER: AccessTier[] = ['free', 'free_compatible_device', 'subscription', 'ppv', 'unknown'];

export const TIER_LABEL: Record<AccessTier, string> = {
  free: 'Free',
  free_compatible_device: 'Free \u2014 compatible device',
  subscription: 'Subscription',
  ppv: 'Pay-per-view',
  unknown: 'Access not confirmed',
};

/** Access tier for an offer. Rows synced before access_type existed fall
 * back to the legacy free/subscription/PPV flags. */
export function tierOf(o: Pick<WatchOffer, 'accessType' | 'isFreeToAir' | 'isSubscription' | 'isPpv'>): AccessTier {
  if (o.accessType) return o.accessType;
  if (o.isPpv) return 'ppv';
  if (o.isFreeToAir) return 'free';
  if (o.isSubscription) return 'subscription';
  return 'unknown';
}

// Service keys, most specific first. A key is what a user would say they
// "have" (Sky Sports, TNT Sports...), so NOW maps to its own key: it's a
// separate way to buy Sky Sports, not the same subscription.
const PROVIDERS: { key: string; label: string; match: RegExp }[] = [
  { key: 'sky_sports', label: 'Sky Sports', match: /\bsky\b/i },
  { key: 'now', label: 'NOW', match: /\bNOW\b/ },
  { key: 'tnt_sports', label: 'TNT Sports', match: /\btnt\b|hbo max|discovery\+/i },
  { key: 'prime_video', label: 'Prime Video', match: /prime video|amazon/i },
  { key: 'premier_sports', label: 'Premier Sports', match: /premier sports/i },
  { key: 'bbc', label: 'BBC', match: /\bbbc\b|iplayer/i },
  { key: 'itv', label: 'ITV', match: /\bitv/i },
  { key: 'channel_4', label: 'Channel 4', match: /channel 4/i },
  { key: 'samsung_tv_plus', label: 'Samsung TV Plus', match: /samsung/i },
  { key: 'dazn', label: 'DAZN', match: /\bdazn\b/i },
  { key: 'youtube', label: 'YouTube', match: /youtube/i },
];

export function providerKeys(o: Pick<WatchOffer, 'broadcaster' | 'channel' | 'streamingService' | 'serviceProduct'>): string[] {
  const text = [o.broadcaster, o.channel, o.streamingService, o.serviceProduct].filter(Boolean).join(' / ');
  return PROVIDERS.filter((p) => p.match.test(text)).map((p) => p.key);
}

export function providerLabel(key: string): string {
  return PROVIDERS.find((p) => p.key === key)?.label ?? key;
}

/** Main name to show for an offer: the channel when known and meaningful,
 * otherwise the service, otherwise the broadcaster. "(channel TBC)"
 * placeholders are not a name. */
export function offerName(o: WatchOffer): string {
  const channel = o.channel && !/\bTBC\b/i.test(o.channel) ? o.channel : null;
  return channel ?? o.serviceProduct ?? o.streamingService ?? o.broadcaster ?? 'Broadcaster TBC';
}

/** Other ways in for the same offer ("Also on Sky Sports app, NOW"), from
 * the service/streaming fields, minus anything already in the name. */
export function offerAlsoVia(o: WatchOffer): string[] {
  const name = offerName(o).toLowerCase();
  const parts = [o.serviceProduct, o.streamingService]
    .filter((x): x is string => !!x)
    .flatMap((x) => x.split('/'))
    .map((x) => x.trim())
    .filter((x) => x && !name.includes(x.toLowerCase()) && !x.toLowerCase().includes(name));
  return [...new Set(parts)];
}

/** One short line saying what it takes to watch. */
export function offerRequirement(o: WatchOffer): string {
  const tier = tierOf(o);
  if (tier === 'free') return 'Free in the UK';
  if (tier === 'free_compatible_device') return o.platformDevice ? `Free on ${o.platformDevice}` : 'Free on compatible devices';
  if (tier === 'ppv') return 'Extra payment (pay-per-view)';
  if (tier === 'subscription') {
    const keys = providerKeys(o).filter((k) => k !== 'now');
    return keys.length > 0 ? `Requires ${providerLabel(keys[0])} subscription` : 'Requires a subscription';
  }
  return 'Access details not confirmed';
}

export type FixtureWatchState =
  | { kind: 'unknown' }
  | { kind: 'not_live' }
  | { kind: 'watch'; best: AccessTier; groups: { tier: AccessTier; offers: WatchOffer[] }[] };

export function fixtureWatchState(rows: WatchOffer[] | undefined): FixtureWatchState {
  const offers = (rows ?? []).filter((r) => r.status === 'confirmed_broadcast');
  // A confirmed offer outranks a "not televised" row: if both exist the
  // data disagrees, and saying "not on TV" when a source says it is would
  // be the worse error. The sync reports such conflicts separately.
  if (offers.length === 0) {
    return (rows ?? []).some((r) => r.status === 'confirmed_not_televised') ? { kind: 'not_live' } : { kind: 'unknown' };
  }
  const groups = TIER_ORDER.map((tier) => ({ tier, offers: offers.filter((o) => tierOf(o) === tier) })).filter((g) => g.offers.length > 0);
  return { kind: 'watch', best: groups[0].tier, groups };
}

export function stateHeadline(s: FixtureWatchState): string {
  if (s.kind === 'unknown') return 'Broadcast details not yet confirmed';
  if (s.kind === 'not_live') return 'Not televised live in the UK';
  if (s.best === 'free' || s.best === 'free_compatible_device') return 'Watch live \u2014 free';
  if (s.best === 'ppv') return 'Watch live \u2014 pay-per-view';
  return 'Watch live';
}

export type WithServices = 'free' | 'included' | 'needs_device' | 'requires_other' | 'extra_payment' | 'unknown';

/** For a future "I can watch" filter: how an offer relates to the services
 * a user has told us about. */
export function canWatchWith(o: WatchOffer, services: Set<string>): WithServices {
  const tier = tierOf(o);
  if (tier === 'free') return 'free';
  if (tier === 'free_compatible_device') return providerKeys(o).some((k) => services.has(k)) ? 'free' : 'needs_device';
  if (tier === 'ppv') return 'extra_payment';
  if (tier === 'subscription') return providerKeys(o).some((k) => services.has(k)) ? 'included' : 'requires_other';
  return 'unknown';
}

// ---- time filters (UK local dates as stored on fixtures) ----

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today's evening kick-offs (17:00 on), or any time today if the time is
 * unknown. */
export function isTonight(date: string, time: string | null, now = new Date()): boolean {
  if (date !== ymd(now)) return false;
  return !time || time >= '17:00';
}

/** The coming Friday evening to Sunday (the current one if it's already
 * the weekend). */
export function isThisWeekend(date: string, time: string | null, now = new Date()): boolean {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = d.getDay(); // 0 Sun .. 6 Sat
  const toFriday = dow === 0 ? -2 : dow === 6 ? -1 : 5 - dow;
  const fri = new Date(d); fri.setDate(d.getDate() + toFriday);
  const sun = new Date(fri); sun.setDate(fri.getDate() + 2);
  if (date === ymd(fri)) return !time || time >= '17:00';
  return date > ymd(fri) && date <= ymd(sun);
}

/** "Verified 25 Sep"; stale after three weeks, since picks move. */
export function verification(verifiedAt: string | null, now = new Date()): { label: string; stale: boolean } | null {
  if (!verifiedAt) return null;
  const v = new Date(verifiedAt);
  if (Number.isNaN(v.getTime())) return null;
  // Fixed month names: ICU versions disagree on en-GB short months
  // ("Sep" vs "Sept"), and the label must read the same everywhere.
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const label = `Verified ${v.getUTCDate()} ${MONTHS[v.getUTCMonth()]}`;
  return { label, stale: now.getTime() - v.getTime() > 21 * 86400000 };
}
