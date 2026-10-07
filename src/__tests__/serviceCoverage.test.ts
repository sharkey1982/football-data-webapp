import { describe, it, expect } from 'vitest';
import { serviceCoverage, type WatchOffer } from '../lib/watchGuide';

let id = 1;
const o = (over: Partial<WatchOffer> = {}): WatchOffer => ({
  broadcastId: id++, status: 'confirmed_broadcast', broadcaster: 'Sky Sports', channel: null, streamingService: null,
  serviceProduct: null, accessType: 'subscription', deliveryMethods: [], platformDevice: null, isFast: false,
  isFreeToAir: false, isSubscription: true, isPpv: false, watchUrl: null, confidence: null, availabilityNotes: null,
  source: null, sourceUrl: null, verifiedAt: null, ...over,
});
const g = (date: string, offers: WatchOffer[]) => ({ kickoffDate: date, offers });

describe('serviceCoverage', () => {
  it('counts games per service once, folds NOW into Sky, and finds the best pair', () => {
    const c = serviceCoverage([
      g('2099-01-01', [o({ serviceProduct: 'Sky Sports app / NOW' }), o({ channel: 'Sky Sports+' })]),
      g('2099-01-02', [o({ broadcaster: 'TNT Sports' })]),
      g('2099-01-03', [o({ broadcaster: 'BBC', accessType: 'free' })]),
      g('2099-01-04', [o({ broadcaster: 'TNT Sports' })]),
      g('2099-01-05', [o({ status: 'confirmed_not_televised', broadcaster: null })]),
    ]);
    expect(c.games).toBe(5);
    expect(c.onTv).toBe(4);
    expect(c.notLive).toBe(0); // after the last pick: not picked yet, not "not on TV"
    expect(c.notPickedYet).toBe(1);
    expect(c.lastConfirmed).toBe('2099-01-04');
    expect(c.nowFolded).toBe(true);
    expect(c.services.map((s) => [s.key, s.games, s.free])).toEqual([
      ['tnt_sports', 2, false], ['bbc', 1, true], ['sky_sports', 1, false],
    ]);
    expect(c.pair?.keys[0]).toBe('tnt_sports');
    expect(c.pair?.games).toBe(3);
  });

  it('no pair when one service shows everything; NOW alone stays NOW', () => {
    const c = serviceCoverage([g('2099-01-01', [o()]), g('2099-01-02', [o({ broadcaster: 'NOW' })])]);
    expect(c.services.map((s) => s.key)).toEqual(['now', 'sky_sports']);
    const all = serviceCoverage([g('2099-01-01', [o()]), g('2099-01-02', [o()])]);
    expect(all.pair).toBeNull();
    expect(all.services[0].games).toBe(2);
  });
});
