// ============================================================================
// src/lib/localClubs.ts
//
// Your Local Clubs (/football/local-clubs): put in a postcode, get your
// nearest club and the nearest at each level of the pyramid the site covers
// (Premier League to National League).
//
// Grounds come from public.club_grounds (each checked against its own
// postcode; scripts/verify_club_grounds.py). Divisions are this season's
// league_standings. The visitor's postcode is looked up in their browser on
// postcodes.io (free, open data) and never stored or sent to us.
// ============================================================================

import { supabase } from './supabase';
import { milesBetween, type LatLon } from './geo';

export const LOCAL_CLUBS_PATH = '/football/local-clubs';
export const TOP_TIERS = ['E0', 'E1', 'E2', 'E3', 'EC'];

export type LocalClub = {
  teamId: number;
  name: string;
  slug: string;
  ground: string;
  lat: number;
  lon: number;
  tier: number;
  league: string;
};

export type LocalClubsData = { season: number; clubs: LocalClub[] };

export type Place = LatLon & { label: string };

export type NearbyClub = LocalClub & { miles: number };

type GroundRow = { team_id: number; ground_name: string; latitude: number | string; longitude: number | string; teams?: Omit<TeamRow, 'team_id'> | null };
type TeamRow = { team_id: number; display_name: string | null; canonical_name: string; slug: string };
type StandingRow = { team_id: number; league_name: string; tier: number; season_start_year: number };

export function buildLocalClubs(grounds: GroundRow[], teams: TeamRow[], standings: StandingRow[]): LocalClubsData {
  const season = Math.max(0, ...standings.map((s) => s.season_start_year));
  const now = new Map(standings.filter((s) => s.season_start_year === season).map((s) => [s.team_id, s]));
  const team = new Map(teams.map((t) => [t.team_id, t]));
  const clubs: LocalClub[] = [];
  for (const g of grounds) {
    const s = now.get(g.team_id);
    const t = team.get(g.team_id) ?? (g.teams ? { team_id: g.team_id, ...g.teams } : undefined);
    if (!s || !t) continue;
    const lat = Number(g.latitude);
    const lon = Number(g.longitude);
    clubs.push({ teamId: g.team_id, name: t.display_name ?? t.canonical_name, slug: t.slug, ground: g.ground_name, lat, lon, tier: s.tier, league: s.league_name });
  }
  clubs.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  return { season, clubs };
}

export function nearestClubs(clubs: LocalClub[], from: LatLon): NearbyClub[] {
  return clubs.map((c) => ({ ...c, miles: milesBetween(from, c) })).sort((a, b) => a.miles - b.miles);
}

/** The nearest club in each division, top division first. */
export function nearestByLevel(nearby: NearbyClub[]): NearbyClub[] {
  const seen = new Map<number, NearbyClub>();
  for (const c of nearby) if (!seen.has(c.tier)) seen.set(c.tier, c);
  return [...seen.values()].sort((a, b) => a.tier - b.tier);
}

export const milesText = (m: number) => (m < 10 ? `${m.toFixed(1)} miles` : `${Math.round(m)} miles`).replace(/^1\.0 miles$/, '1 mile');

export function localSentence(place: Place, nearby: NearbyClub[]): string {
  const first = nearby[0];
  if (!first) return '';
  const top = nearby.find((c) => c.tier === 1);
  const head = `Your nearest club to ${place.label} is ${first.name}, ${milesText(first.miles)} away at ${first.ground} (${first.league}).`;
  if (!top || top.teamId === first.teamId) return head;
  return `${head} The nearest Premier League club is ${top.name}, ${milesText(top.miles)} away.`;
}

// ---- Postcode lookup (browser -> postcodes.io) -------------------------------------

const FULL = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const OUTWARD = /^[A-Z]{1,2}\d[A-Z\d]?$/i;

export function tidyPostcode(raw: string): string {
  const s = raw.trim().toUpperCase().replace(/\s+/g, '');
  return FULL.test(s) ? `${s.slice(0, -3)} ${s.slice(-3)}` : s;
}

/** Full postcode or just the first half (e.g. "SS1"). Null when postcodes.io
 * doesn't know it. */
export async function lookupPostcode(raw: string, fetcher: typeof fetch = fetch): Promise<Place | null> {
  const pc = tidyPostcode(raw);
  let url: string;
  if (FULL.test(pc)) url = `https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`;
  else if (OUTWARD.test(pc)) url = `https://api.postcodes.io/outcodes/${encodeURIComponent(pc)}`;
  else return null;
  const res = await fetcher(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`postcodes.io ${res.status}`);
  const body = (await res.json()) as { result?: { latitude?: number | null; longitude?: number | null } };
  const r = body.result;
  if (!r || r.latitude == null || r.longitude == null) return null;
  return { lat: r.latitude, lon: r.longitude, label: pc };
}

// ---- Loader (browser) ----------------------------------------------------------------

export async function loadLocalClubs(): Promise<LocalClubsData> {
  // One round trip: grounds with their club embedded, beside this season's divisions.
  const [grounds, standings] = await Promise.all([
    supabase.from('club_grounds' as never).select('team_id,ground_name,latitude,longitude,teams(display_name,canonical_name,slug)'),
    supabase
      .from('league_standings' as never)
      .select('team_id,league_name,tier,season_start_year')
      .in('league_code', TOP_TIERS)
      .order('season_start_year', { ascending: false })
      .limit(200),
  ]);
  if (grounds.error) throw grounds.error;
  if (standings.error) throw standings.error;
  return buildLocalClubs((grounds.data ?? []) as unknown as GroundRow[], [], (standings.data ?? []) as unknown as StandingRow[]);
}
