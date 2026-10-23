// Premier Sports sold through Prime Video Channels is a Premier Sports
// subscription, not a Prime Video game (23 Oct 2026).
import { describe, expect, it } from 'vitest';
import { offerRequirement, providerKeys, type WatchOffer } from '../lib/watchGuide';

const base = {
  broadcastId: 1, status: 'confirmed_broadcast', accessType: 'subscription', deliveryMethods: [], platformDevice: null,
  isFast: false, isFreeToAir: false, isSubscription: true, isPpv: false, watchUrl: null, confidence: null,
  sourceUrl: null, verifiedAt: null, source: null, availabilityNotes: null,
} as unknown as WatchOffer;

const premier = { ...base, broadcaster: 'Premier Sports', channel: 'Premier Sports', streamingService: 'Premier Sports Player / Prime Video Channels', serviceProduct: 'Premier Sports / LALIGATV' } as WatchOffer;
const prime = { ...base, broadcaster: 'Amazon Prime Video', channel: null, streamingService: 'Prime Video', serviceProduct: 'Amazon Prime Video' } as WatchOffer;
const sky = { ...base, broadcaster: 'Sky Sports', channel: 'Sky Sports Main Event', streamingService: 'NOW', serviceProduct: null } as WatchOffer;

describe('watch guide providers', () => {
  it('Premier Sports via Prime Video Channels is not a Prime Video game', () => {
    expect(providerKeys(premier)).toEqual(['premier_sports']);
    expect(offerRequirement(premier)).toBe('Requires Premier Sports subscription');
  });
  it('a real Prime Video game still is', () => {
    expect(providerKeys(prime)).toContain('prime_video');
    expect(offerRequirement(prime)).toBe('Requires Prime Video subscription');
  });
  it('Sky Sports with NOW still reads Sky Sports and stays under NOW', () => {
    expect(providerKeys(sky)).toEqual(['sky_sports', 'now']);
    expect(offerRequirement(sky)).toBe('Requires Sky Sports subscription');
  });
});
