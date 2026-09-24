// ============================================================================
// src/lib/broadcastsApi.ts
//
// UK (and future other-market) broadcast information per fixture. See
// docs/incidents.md for the investigation behind this: there is no free,
// terms-compliant, automated per-fixture feed of UK broadcast selections --
// paid feeds (e.g. Sportmonks' tvStations) exist but cost money on an
// ongoing basis, and the well-known free listings sites explicitly forbid
// scraping and republishing their data. fixture_broadcasts is written by an
// admin (the same is_admin() pattern as team_strength_manual_override), not
// a pipeline, until/unless a paid feed is chosen.
//
// Three states per fixture+market, and the UI must never blur them:
//   no row at all                          -> not yet determined
//   one row, confirmed_not_televised       -> definitely not on
//   one or more confirmed_broadcast rows   -> here's where to watch
// ============================================================================

import { supabase } from './supabase';

export type BroadcastStatus = 'confirmed_broadcast' | 'confirmed_not_televised';

export type FixtureBroadcast = {
  broadcastId: number;
  fixtureId: number;
  market: string;
  status: BroadcastStatus;
  broadcaster: string | null;
  channel: string | null;
  streamingService: string | null;
  isFreeToAir: boolean;
  isSubscription: boolean;
  isPpv: boolean;
  watchUrl: string | null;
  source: string;
  sourceUrl: string | null;
  verifiedAt: string;
};

const COLUMNS =
  'broadcast_id,fixture_id,market,status,broadcaster,channel,streaming_service,' +
  'is_free_to_air,is_subscription,is_ppv,watch_url,source,source_url,verified_at';

// Newer than the generated types; the row shape above is the contract.
const db = supabase as unknown as { from: (t: string) => any };

function toBroadcast(r: Record<string, unknown>): FixtureBroadcast {
  return {
    broadcastId: Number(r.broadcast_id),
    fixtureId: Number(r.fixture_id),
    market: String(r.market),
    status: r.status as BroadcastStatus,
    broadcaster: (r.broadcaster as string | null) ?? null,
    channel: (r.channel as string | null) ?? null,
    streamingService: (r.streaming_service as string | null) ?? null,
    isFreeToAir: Boolean(r.is_free_to_air),
    isSubscription: Boolean(r.is_subscription),
    isPpv: Boolean(r.is_ppv),
    watchUrl: (r.watch_url as string | null) ?? null,
    source: String(r.source),
    sourceUrl: (r.source_url as string | null) ?? null,
    verifiedAt: String(r.verified_at),
  };
}

/** All UK (market='GB') broadcast rows for a set of fixtures, grouped by
 * fixture_id. A fixture absent from the returned map has no rows at all --
 * not yet determined, not "confirmed not televised". */
export async function getFixtureBroadcasts(fixtureIds: number[], market = 'GB'): Promise<Map<number, FixtureBroadcast[]>> {
  const out = new Map<number, FixtureBroadcast[]>();
  if (fixtureIds.length === 0) return out;
  const { data, error } = await db
    .from('fixture_broadcasts')
    .select(COLUMNS)
    .in('fixture_id', fixtureIds)
    .eq('market', market);
  if (error) throw error;
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    const b = toBroadcast(row);
    out.set(b.fixtureId, [...(out.get(b.fixtureId) ?? []), b]);
  }
  return out;
}

export async function getFixtureBroadcast(fixtureId: number, market = 'GB'): Promise<FixtureBroadcast[]> {
  const { data, error } = await db.from('fixture_broadcasts').select(COLUMNS).eq('fixture_id', fixtureId).eq('market', market);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(toBroadcast);
}

/** How a fixture reads for the "All / On TV / Free-to-air" filter and
 * badge -- a pure summary over its rows (or absence of them). */
export type BroadcastSummary =
  | { kind: 'unknown' }
  | { kind: 'not_televised' }
  | { kind: 'broadcast'; freeToAir: boolean; broadcasters: string[] };

export type UpcomingBroadcastFixture = {
  broadcastId: number;
  market: string;
  broadcaster: string | null;
  channel: string | null;
  streamingService: string | null;
  isFreeToAir: boolean;
  isSubscription: boolean;
  isPpv: boolean;
  watchUrl: string | null;
  fixtureId: number;
  slug: string | null;
  kickoffDate: string;
  kickoffTime: string | null;
  leagueId: number;
  leagueCode: string;
  leagueName: string;
  countryName: string;
  homeTeamId: number;
  homeTeamName: string;
  awayTeamId: number;
  awayTeamName: string;
};

/** Every upcoming fixture with a confirmed broadcast, earliest first --
 * powers the TV Guide page. Market defaults to GB; the view and this
 * function both already take a market so a future per-market guide is a
 * filter change here, not new plumbing. */
export async function getUpcomingBroadcastFixtures(market = 'GB'): Promise<UpcomingBroadcastFixture[]> {
  const { data, error } = await db.from('upcoming_broadcast_fixtures').select('*').eq('market', market);
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    broadcastId: Number(r.broadcast_id),
    market: String(r.market),
    broadcaster: (r.broadcaster as string | null) ?? null,
    channel: (r.channel as string | null) ?? null,
    streamingService: (r.streaming_service as string | null) ?? null,
    isFreeToAir: Boolean(r.is_free_to_air),
    isSubscription: Boolean(r.is_subscription),
    isPpv: Boolean(r.is_ppv),
    watchUrl: (r.watch_url as string | null) ?? null,
    fixtureId: Number(r.fixture_id),
    slug: (r.slug as string | null) ?? null,
    kickoffDate: String(r.kickoff_date),
    kickoffTime: (r.kickoff_time as string | null) ?? null,
    leagueId: Number(r.league_id),
    leagueCode: String(r.league_code),
    leagueName: String(r.league_name),
    countryName: String(r.country_name),
    homeTeamId: Number(r.home_team_id),
    homeTeamName: String(r.home_team_name),
    awayTeamId: Number(r.away_team_id),
    awayTeamName: String(r.away_team_name),
  }));
}

export function summariseBroadcasts(rows: FixtureBroadcast[] | undefined): BroadcastSummary {
  if (!rows || rows.length === 0) return { kind: 'unknown' };
  if (rows[0].status === 'confirmed_not_televised') return { kind: 'not_televised' };
  const broadcasters = [...new Set(rows.map((r) => r.broadcaster).filter((b): b is string => !!b))];
  return { kind: 'broadcast', freeToAir: rows.some((r) => r.isFreeToAir), broadcasters };
}
