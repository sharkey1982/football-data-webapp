import { describe, it, expect } from 'vitest';
import { summariseBroadcasts, type FixtureBroadcast } from '../lib/broadcastsApi';

const row = (o: Partial<FixtureBroadcast> = {}): FixtureBroadcast => ({
  broadcastId: 1,
  fixtureId: 100,
  market: 'GB',
  status: 'confirmed_broadcast',
  broadcaster: 'Sky Sports',
  channel: 'Sky Sports Main Event',
  streamingService: 'Sky Go',
  isFreeToAir: false,
  isSubscription: true,
  isPpv: false,
  watchUrl: null,
  source: 'test',
  sourceUrl: null,
  verifiedAt: '2026-09-24T00:00:00Z',
  ...o,
});

describe('summariseBroadcasts', () => {
  it('no rows at all means not yet determined -- never guessed at', () => {
    expect(summariseBroadcasts(undefined)).toEqual({ kind: 'unknown' });
    expect(summariseBroadcasts([])).toEqual({ kind: 'unknown' });
  });

  it('a confirmed_not_televised row is distinct from "unknown", not folded into it', () => {
    expect(summariseBroadcasts([row({ status: 'confirmed_not_televised', broadcaster: null, channel: null, streamingService: null, isSubscription: false })]))
      .toEqual({ kind: 'not_televised' });
  });

  it('a confirmed broadcast collects every distinct broadcaster and whether any leg is free', () => {
    const rows = [
      row({ broadcaster: 'Sky Sports', isFreeToAir: false }),
      row({ broadcastId: 2, broadcaster: 'Sky Sports', channel: 'Sky Sports Premier League', isFreeToAir: false }),
    ];
    expect(summariseBroadcasts(rows)).toEqual({ kind: 'broadcast', freeToAir: false, broadcasters: ['Sky Sports'] });

    const ftaRows = [row({ broadcaster: 'ITV1', isFreeToAir: true, isSubscription: false })];
    expect(summariseBroadcasts(ftaRows)).toEqual({ kind: 'broadcast', freeToAir: true, broadcasters: ['ITV1'] });
  });
});
