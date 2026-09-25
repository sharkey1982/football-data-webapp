import { describe, it, expect } from 'vitest';
import { canWatchWith, fixtureWatchState, isThisWeekend, isTonight, offerName, providerKeys, tierOf, verification, type WatchOffer } from '../lib/watchGuide';

const o = (over: Partial<WatchOffer> = {}): WatchOffer => ({
  broadcastId: 1, status: 'confirmed_broadcast', broadcaster: 'Sky Sports', channel: 'Sky Sports+', streamingService: null,
  serviceProduct: 'Sky Sports+ / Sky Sports app / NOW', accessType: 'subscription', deliveryMethods: [], platformDevice: null,
  isFast: false, isFreeToAir: false, isSubscription: true, isPpv: false, watchUrl: null, confidence: null, availabilityNotes: null,
  source: null, sourceUrl: null, verifiedAt: null, ...over,
});

describe('watch guide logic', () => {
  it('never reads "no rows" as "not televised"', () => {
    expect(fixtureWatchState([])).toEqual({ kind: 'unknown' });
    expect(fixtureWatchState(undefined)).toEqual({ kind: 'unknown' });
    expect(fixtureWatchState([o({ status: 'confirmed_not_televised' })])).toEqual({ kind: 'not_live' });
  });

  it('a confirmed offer outranks a conflicting not-televised row', () => {
    expect(fixtureWatchState([o({ status: 'confirmed_not_televised' }), o({ broadcastId: 2 })]).kind).toBe('watch');
  });

  it('orders tiers free first and keeps every route', () => {
    const s = fixtureWatchState([o({ accessType: 'ppv' }), o({ accessType: 'free_compatible_device' }), o({ accessType: 'free' })]);
    expect(s.kind === 'watch' && s.groups.map((g) => g.tier)).toEqual(['free', 'free_compatible_device', 'ppv']);
  });

  it('falls back to legacy flags when access_type is missing', () => {
    expect(tierOf(o({ accessType: null, isSubscription: true }))).toBe('subscription');
    expect(tierOf(o({ accessType: null, isFreeToAir: true, isSubscription: false }))).toBe('free');
    expect(tierOf(o({ accessType: null, isPpv: true }))).toBe('ppv');
    expect(tierOf(o({ accessType: null, isSubscription: false }))).toBe('unknown');
  });

  it('does not show a "(channel TBC)" placeholder as the name', () => {
    expect(offerName(o({ broadcaster: 'TNT Sports', channel: 'TNT Sports (channel TBC)', serviceProduct: null, streamingService: 'HBO Max' }))).toBe('HBO Max');
  });

  it('maps offers to services, and answers "can I watch with what I have"', () => {
    expect(providerKeys(o())).toEqual(['sky_sports', 'now']);
    expect(canWatchWith(o(), new Set(['now']))).toBe('included');
    expect(canWatchWith(o(), new Set(['tnt_sports']))).toBe('requires_other');
    expect(canWatchWith(o({ accessType: 'free' }), new Set())).toBe('free');
    expect(canWatchWith(o({ accessType: 'ppv' }), new Set(['prime_video']))).toBe('extra_payment');
    expect(canWatchWith(o({ broadcaster: 'Samsung TV Plus', serviceProduct: null, channel: null, accessType: 'free_compatible_device' }), new Set())).toBe('needs_device');
  });

  it('tonight and this weekend', () => {
    const wed = new Date(2026, 9, 7, 12); // Wed 7 Oct 2026
    expect(isTonight('2026-10-07', '19:45:00', wed)).toBe(true);
    expect(isTonight('2026-10-07', '12:30:00', wed)).toBe(false);
    expect(isThisWeekend('2026-10-09', '20:00:00', wed)).toBe(true); // Fri night
    expect(isThisWeekend('2026-10-09', '13:00:00', wed)).toBe(false);
    expect(isThisWeekend('2026-10-11', '16:30:00', wed)).toBe(true); // Sun
    expect(isThisWeekend('2026-10-12', '20:00:00', wed)).toBe(false); // Mon
    const sat = new Date(2026, 9, 10, 9);
    expect(isThisWeekend('2026-10-11', null, sat)).toBe(true);
  });

  it('flags stale verification after three weeks', () => {
    const now = new Date('2026-10-30T00:00:00Z');
    expect(verification('2026-09-25T00:00:00Z', now)).toEqual({ label: 'Verified 25 Sep', stale: true });
    expect(verification('2026-10-25T00:00:00Z', now)?.stale).toBe(false);
    expect(verification(null, now)).toBeNull();
  });
});
