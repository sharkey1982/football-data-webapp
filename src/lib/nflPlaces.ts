// ============================================================================
// src/lib/nflPlaces.ts
//
// Where NFL games are played, for /nfl/road-trips (miles on the road and late
// UK kick-offs, on a US map) and /nfl/pick-my-team (a four-question team
// picker for UK fans).
//
// STADIUMS is keyed by nfl_games.stadium exactly as nflverse spells it. x/y
// are positions on public/maps/us-states.svg (900 x 540): d3-geo's
// geoAlbersUsa fitted to us-atlas's nation outline at that size, the same
// projection that drew the SVG. Venues outside the US have no x/y. A venue
// missing here is reported on the page rather than guessed: add it when a
// new season brings a new stadium name.
// ============================================================================

import { supabase } from './supabase';
import { GAME_COLUMNS, STANDING_COLUMNS, TEAM_COLUMNS, type NflGame, type NflStanding, type NflTeam } from './nflApi';

export type Venue = { lat: number; lon: number; x?: number; y?: number };

export const STADIUMS: Record<string, Venue> = {
  'AT&T Stadium': { lat: 32.748, lon: -97.093, x: 474.5, y: 386.5 },
  'Acrisure Stadium': { lat: 40.447, lon: -80.016, x: 734.4, y: 210.0 },
  'Allegiant Stadium': { lat: 36.091, lon: -115.184, x: 185.8, y: 287.7 },
  'Bank of America Stadium': { lat: 35.226, lon: -80.853, x: 738.7, y: 316.7 },
  'Caesars Superdome': { lat: 29.951, lon: -90.081, x: 595.9, y: 439.9 },
  'Empower Field at Mile High': { lat: 39.744, lon: -105.02, x: 354.8, y: 238.0 },
  'EverBank Stadium': { lat: 30.324, lon: -81.637, x: 741.0, y: 416.8 },
  'Ford Field': { lat: 42.34, lon: -83.046, x: 683.7, y: 178.9 },
  'GEHA Field at Arrowhead Stadium': { lat: 39.049, lon: -94.484, x: 516.3, y: 258.5 },
  'Gillette Stadium': { lat: 42.091, lon: -71.264, x: 855.6, y: 149.5 },
  'Hard Rock Stadium': { lat: 25.958, lon: -80.239, x: 779.4, y: 499.3 },
  'Highmark Stadium': { lat: 42.774, lon: -78.787, x: 744.2, y: 160.3 },
  'Huntington Bank Field': { lat: 41.506, lon: -81.7, x: 705.9, y: 192.8 },
  'Lambeau Field': { lat: 44.501, lon: -88.062, x: 606.4, y: 143.5 },
  "Levi's Stadium": { lat: 37.403, lon: -121.97, x: 86.8, y: 236.3 },
  'Lincoln Financial Field': { lat: 39.901, lon: -75.168, x: 809.0, y: 206.6 },
  'Lucas Oil Stadium': { lat: 39.76, lon: -86.164, x: 643.3, y: 236.5 },
  'Lumen Field': { lat: 47.595, lon: -122.332, x: 137.7, y: 36.5 },
  'M&T Bank Stadium': { lat: 39.278, lon: -76.623, x: 789.8, y: 223.7 },
  'Mercedes-Benz Stadium': { lat: 33.755, lon: -84.401, x: 685.0, y: 354.5 },
  'MetLife Stadium': { lat: 40.813, lon: -74.074, x: 821.1, y: 184.9 },
  'Nissan Stadium': { lat: 36.166, lon: -86.771, x: 641.2, y: 310.1 },
  'Northwest Stadium': { lat: 38.908, lon: -76.864, x: 787.6, y: 231.8 },
  'Paycor Stadium': { lat: 39.095, lon: -84.516, x: 670.1, y: 247.1 },
  'Raymond James Stadium': { lat: 27.976, lon: -82.503, x: 732.8, y: 465.7 },
  'Reliant Stadium': { lat: 29.685, lon: -95.411, x: 503.1, y: 448.4 },
  'SoFi Stadium': { lat: 33.953, lon: -118.339, x: 126.1, y: 318.9 },
  'Soldier Field': { lat: 41.862, lon: -87.617, x: 617.4, y: 196.1 },
  'State Farm Stadium': { lat: 33.528, lon: -112.263, x: 223.2, y: 347.7 },
  'U.S. Bank Stadium': { lat: 44.974, lon: -93.258, x: 531.8, y: 138.1 },
  // Outside the US.
  Bernabeu: { lat: 40.453, lon: -3.688 },
  'Estadio Banorte': { lat: 19.303, lon: -99.15 },
  'FC Bayern Munich Stadium': { lat: 48.219, lon: 11.625 },
  'Maracana Stadium': { lat: -22.912, lon: -43.23 },
  'Melbourne Cricket Ground': { lat: -37.82, lon: 144.983 },
  'Stade de France': { lat: 48.924, lon: 2.36 },
  'Tottenham Hotspur Stadium': { lat: 51.604, lon: -0.066 },
  'Wembley Stadium': { lat: 51.556, lon: -0.28 },
};

/** Teams sharing a stadium are nudged apart on the map (second tenant). */
const NUDGE: Record<string, [number, number]> = { LAC: [9, 7], NYJ: [7, 6] };

/** Franchises that play outdoors through a northern winter (no roof). */
export const COLD_OUTDOOR = new Set(['GB', 'CHI', 'BUF', 'NE', 'CLE', 'PIT', 'KC', 'DEN', 'NYG', 'NYJ', 'PHI', 'BAL', 'CIN', 'WAS', 'SEA']);

export const LONDON_STADIUM = /wembley|tottenham|twickenham/i;

export function milesBetween(a: Venue, b: Venue): number {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin((r(b.lat) - r(a.lat)) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin((r(b.lon) - r(a.lon)) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

const UK_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false });

/** Kicks off between 23:00 and 06:00 UK time. */
export function lateUk(g: Pick<NflGame, 'kickoff_at'>): boolean {
  if (!g.kickoff_at) return false;
  const h = Number(UK_HOUR.format(new Date(g.kickoff_at))) % 24;
  return h >= 23 || h < 6;
}

// ---- Road Trips ------------------------------------------------------------------

export type RoadTripTeam = {
  franchise: string;
  name: string;
  slug: string;
  stadium: string;
  miles: number;
  late: number;
  /** Games outside the US this season (London, Europe, Mexico, Brazil, Australia). */
  abroad: string[];
  x: number | null;
  y: number | null;
};

export type RoadTrips = { season: number; teams: RoadTripTeam[]; unplaced: string[] };

/** Miles from each team's home stadium to every road and neutral-site game
 * and back, regular season only; home = the stadium a team hosts most often. */
export function buildRoadTrips(season: number, games: NflGame[], teams: NflTeam[]): RoadTrips {
  const reg = games.filter((g) => g.season === season && g.game_type === 'REG');
  const hosted = new Map<string, Map<string, number>>();
  for (const g of reg) {
    if (!g.stadium) continue;
    const m = hosted.get(g.home_franchise) ?? new Map<string, number>();
    m.set(g.stadium, (m.get(g.stadium) ?? 0) + 1);
    hosted.set(g.home_franchise, m);
  }
  const unplaced = new Set<string>();
  const out: RoadTripTeam[] = [];
  for (const t of teams) {
    const counts = hosted.get(t.franchise);
    if (!counts) continue;
    const stadium = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const home = STADIUMS[stadium];
    if (!home) unplaced.add(stadium);
    let miles = 0;
    let late = 0;
    const abroad: string[] = [];
    for (const g of reg) {
      if (g.home_franchise !== t.franchise && g.away_franchise !== t.franchise) continue;
      if (lateUk(g)) late++;
      const v = g.stadium ? STADIUMS[g.stadium] : undefined;
      if (g.stadium && !v) unplaced.add(g.stadium);
      if (v && v.x == null) abroad.push(g.stadium!);
      if (home && v && g.stadium !== stadium) miles += 2 * milesBetween(home, v);
    }
    const nudge = NUDGE[t.franchise] ?? [0, 0];
    out.push({
      franchise: t.franchise,
      name: t.name,
      slug: t.slug,
      stadium,
      miles: Math.round(miles),
      late,
      abroad,
      x: home?.x != null ? home.x + nudge[0] : null,
      y: home?.y != null ? home.y + nudge[1] : null,
    });
  }
  out.sort((a, b) => b.miles - a.miles);
  return { season, teams: out, unplaced: [...unplaced].sort() };
}

export function roadTripsSentence(d: RoadTrips): string {
  const most = d.teams[0];
  const least = d.teams[d.teams.length - 1];
  if (!most || !least) return `NFL road miles for ${d.season}.`;
  const fmt = (n: number) => n.toLocaleString('en-GB');
  const far = most.abroad.length ? `, including ${most.abroad.length === 1 ? 'a game' : `${most.abroad.length} games`} abroad` : '';
  return `The ${most.name} travel furthest in ${d.season}: ${fmt(most.miles)} miles${far}. The ${least.name} travel least, ${fmt(least.miles)} miles.`;
}

// ---- Pick My Team ------------------------------------------------------------------

export type PickerTeam = {
  franchise: string;
  name: string;
  slug: string;
  won: number;
  lost: number;
  tied: number;
  /** Season the record is from (the last complete one). */
  recordSeason: number;
  late: number;
  london: number;
  cold: boolean;
};

export type PickerData = { season: number; teams: PickerTeam[] };

export type PickerAnswers = {
  q1?: 'win' | 'dog' | 'any';
  q2?: 'early' | 'late';
  q3?: 'yes' | 'no';
  q4?: 'cold' | 'warm';
};

export const PICKER_QUESTIONS: { id: keyof PickerAnswers; title: string; options: [string, string][] }[] = [
  { id: 'q1', title: 'Winners or a long, honest struggle?', options: [['win', 'Winners'], ['dog', 'Underdogs'], ['any', "Don't mind"]] },
  { id: 'q2', title: 'When do you want to watch?', options: [['early', 'Early evening, UK time'], ['late', "I'll stay up"]] },
  { id: 'q3', title: 'Want to see them play in London?', options: [['yes', 'Yes'], ['no', 'Not bothered']] },
  { id: 'q4', title: 'What weather?', options: [['cold', 'Snow and mud'], ['warm', 'Sunshine or a roof']] },
];

export function buildPicker(season: number, games: NflGame[], lastStandings: NflStanding[], londonGames: Pick<NflGame, 'home_franchise' | 'away_franchise'>[], teams: NflTeam[]): PickerData {
  const late = new Map<string, number>();
  for (const g of games) {
    if (g.season !== season || g.game_type !== 'REG' || !lateUk(g)) continue;
    for (const f of [g.home_franchise, g.away_franchise]) late.set(f, (late.get(f) ?? 0) + 1);
  }
  const london = new Map<string, number>();
  for (const g of londonGames) for (const f of [g.home_franchise, g.away_franchise]) london.set(f, (london.get(f) ?? 0) + 1);
  const rec = new Map(lastStandings.map((s) => [s.franchise, s]));
  return {
    season,
    teams: teams
      .filter((t) => rec.has(t.franchise))
      .map((t) => {
        const s = rec.get(t.franchise)!;
        return {
          franchise: t.franchise,
          name: t.name,
          slug: t.slug,
          won: s.won,
          lost: s.lost,
          tied: s.tied,
          recordSeason: s.season,
          late: late.get(t.franchise) ?? 0,
          london: london.get(t.franchise) ?? 0,
          cold: COLD_OUTDOOR.has(t.franchise),
        };
      }),
  };
}

/** Rank teams for a set of answers. Each answer adds a few points; no single
 * answer can outweigh the rest (London games count up to 5). Ties go to the
 * better record, or the worse one for underdogs. */
export function rankTeams(teams: PickerTeam[], a: PickerAnswers): { team: PickerTeam; score: number }[] {
  return teams
    .map((t) => {
      const games = t.won + t.lost + t.tied || 17;
      const winShare = (t.won + t.tied / 2) / games;
      let s = 0;
      if (a.q1 === 'win') s += 12 * winShare;
      else if (a.q1 === 'dog') s += 12 * (1 - winShare);
      if (a.q2 === 'early') s -= 1.5 * t.late;
      if (a.q3 === 'yes') s += 1.2 * Math.min(t.london, 5);
      if (a.q4) s += (a.q4 === 'cold') === t.cold ? 5 : 0;
      s += (a.q1 === 'dog' ? -winShare : winShare) * 0.01;
      return { team: t, score: s };
    })
    .sort((x, y) => y.score - x.score);
}

export function pickReasons(t: PickerTeam, a: PickerAnswers, season: number): string[] {
  const r = [`${t.won}-${t.lost}${t.tied ? `-${t.tied}` : ''} in ${t.recordSeason}`];
  r.push(t.late === 0 ? `No kick-offs after 11pm UK time in ${season}` : `${t.late} late UK kick-off${t.late === 1 ? '' : 's'} in ${season}`);
  if (a.q3 === 'yes' || t.london >= 4) r.push(`${t.london} London game${t.london === 1 ? '' : 's'} since 2007, this season's included`);
  r.push(t.cold ? 'Plays outdoors through the winter' : 'Warm weather or a roof over the stadium');
  return r;
}

// ---- Loaders (browser) ---------------------------------------------------------------

async function latestSeason(): Promise<number | null> {
  const { data, error } = await supabase.from('nfl_games' as never).select('season').order('season', { ascending: false }).limit(1);
  if (error) throw error;
  return ((data ?? []) as { season: number }[])[0]?.season ?? null;
}

async function seasonGames(season: number): Promise<NflGame[]> {
  const { data, error } = await supabase.from('nfl_games' as never).select(GAME_COLUMNS).eq('season', season).limit(1000);
  if (error) throw error;
  return (data ?? []) as unknown as NflGame[];
}

async function allTeams(): Promise<NflTeam[]> {
  const { data, error } = await supabase.from('nfl_teams' as never).select(TEAM_COLUMNS).order('name');
  if (error) throw error;
  return (data ?? []) as unknown as NflTeam[];
}

export async function loadRoadTrips(): Promise<RoadTrips | null> {
  const season = await latestSeason();
  if (season == null) return null;
  const [games, teams] = await Promise.all([seasonGames(season), allTeams()]);
  return buildRoadTrips(season, games, teams);
}

export async function loadPicker(): Promise<PickerData | null> {
  const season = await latestSeason();
  if (season == null) return null;
  const { data: done, error } = await supabase.from('nfl_standings' as never).select('season').eq('season_complete', true).order('season', { ascending: false }).limit(1);
  if (error) throw error;
  const last = ((done ?? []) as { season: number }[])[0]?.season;
  if (last == null) return null;
  const [games, teams, standings, london] = await Promise.all([
    seasonGames(season),
    allTeams(),
    supabase.from('nfl_standings' as never).select(STANDING_COLUMNS).eq('season', last),
    supabase.from('nfl_games' as never).select('home_franchise,away_franchise').or('stadium.ilike.*wembley*,stadium.ilike.*tottenham*,stadium.ilike.*twickenham*').limit(1000),
  ]);
  if (standings.error) throw standings.error;
  if (london.error) throw london.error;
  return buildPicker(season, games, (standings.data ?? []) as unknown as NflStanding[], (london.data ?? []) as unknown as NflGame[], teams);
}
