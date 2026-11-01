// ============================================================================
// src/lib/fplLivePitch.ts
//
// Extra per-player context for the FPL Live pitch view (/fpl/live, Chris,
// 1 Nov 2026: "could look more like [the FPL app's Pick Team pitch] and also
// include the info re availability status too"):
//   - availability from FPL's own flag (public.fpl_players: status,
//     chance_of_playing_next_round / _this_round, news, news_added), reduced
//     to the app's colour code: yellow for 75%/50%, orange for 25%, red for
//     0% or injured / suspended / unavailable;
//   - FixtureShark's projection and start probability for each player's next
//     fixture (public.fpl_player_projections, baseline scenario);
//   - plain kit colours per club for the shirt icon (two flat colours and the
//     club's FPL short code: no crests, sponsors or kit designs).
// The live score itself still comes from public.fpl_live_entry
// (src/lib/fplLiveApi.ts); none of this is needed to score the team, so the
// page renders without it if this fetch fails.
// ============================================================================

import { supabase } from './supabase';
import { getCurrentFplSeasonId } from './currentSeason';
import { CURRENT_MODEL_VERSION } from './fplModel';
import { STATUS_LABEL } from './injuryApi';
import type { PlayerScore } from './fplLiveScore';

const PL_LEAGUE_ID = 1;

export type AvailabilityTone = 'none' | 'yellow' | 'orange' | 'red';

export interface Availability {
  tone: AvailabilityTone;
  /** Chance of playing (0-100) where FPL gives one. */
  chance: number | null;
  /** Short text: "Doubtful 75%", "Injured", "Suspended"; '' when available. */
  label: string;
}

/**
 * FPL's availability flag as the app colours it. The chance of playing
 * decides the colour where FPL gives one (75/50 yellow, 25 orange, 0 red);
 * without one, doubtful is yellow and any other non-available status red.
 */
export function availabilityOf(status: string | null | undefined, chanceNext?: number | null, chanceThis?: number | null): Availability {
  const s = status ?? 'a';
  const chance = chanceNext ?? chanceThis ?? null;
  if (s === 'a' && (chance === null || chance >= 100)) return { tone: 'none', chance, label: '' };
  let tone: AvailabilityTone;
  if (chance !== null && chance < 100) tone = chance >= 50 ? 'yellow' : chance >= 25 ? 'orange' : 'red';
  else tone = s === 'd' ? 'yellow' : s === 'a' ? 'none' : 'red';
  const name = STATUS_LABEL[s] ?? (s === 'a' ? 'Available' : 'Unavailable');
  const label = chance !== null && chance > 0 && chance < 100 ? `${name} ${chance}%` : name;
  return { tone, chance, label };
}

/** Tailwind classes for the flag and the tinted name bar, per tone. */
export const AVAILABILITY_CLASSES: Record<AvailabilityTone, { flag: string; bar: string }> = {
  none: { flag: '', bar: 'bg-white text-ink-900' },
  yellow: { flag: 'bg-yellow-400 text-ink-900', bar: 'bg-yellow-300 text-ink-900' },
  orange: { flag: 'bg-orange-500 text-ink-900', bar: 'bg-orange-400 text-ink-900' },
  red: { flag: 'bg-red-600 text-white', bar: 'bg-red-600 text-white' },
};

/**
 * Two flat colours per club (shirt body, sleeves and trim), by FPL short
 * code. Only the colours: no crests, sponsors or kit patterns.
 */
export const KIT_COLOURS: Record<string, { primary: string; secondary: string; text: string }> = {
  ARS: { primary: '#db0007', secondary: '#ffffff', text: '#ffffff' },
  AVL: { primary: '#670e36', secondary: '#95bfe5', text: '#ffffff' },
  BHA: { primary: '#0057b8', secondary: '#ffffff', text: '#ffffff' },
  BOU: { primary: '#da291c', secondary: '#111111', text: '#ffffff' },
  BRE: { primary: '#e30613', secondary: '#ffffff', text: '#ffffff' },
  BUR: { primary: '#6c1d45', secondary: '#99d6ea', text: '#ffffff' },
  CHE: { primary: '#034694', secondary: '#ffffff', text: '#ffffff' },
  COV: { primary: '#5db3e6', secondary: '#ffffff', text: '#0b2240' },
  CRY: { primary: '#1b458f', secondary: '#c4122e', text: '#ffffff' },
  EVE: { primary: '#003399', secondary: '#ffffff', text: '#ffffff' },
  FUL: { primary: '#ffffff', secondary: '#111111', text: '#111111' },
  HUL: { primary: '#f5a12d', secondary: '#111111', text: '#111111' },
  IPS: { primary: '#3a64a3', secondary: '#ffffff', text: '#ffffff' },
  LEE: { primary: '#ffffff', secondary: '#1d428a', text: '#1d428a' },
  LEI: { primary: '#003090', secondary: '#fdbe11', text: '#ffffff' },
  LIV: { primary: '#c8102e', secondary: '#ffffff', text: '#ffffff' },
  MCI: { primary: '#6cabdd', secondary: '#ffffff', text: '#1c2c5b' },
  MUN: { primary: '#da291c', secondary: '#111111', text: '#ffffff' },
  NEW: { primary: '#241f20', secondary: '#ffffff', text: '#ffffff' },
  NFO: { primary: '#dd0000', secondary: '#ffffff', text: '#ffffff' },
  SHU: { primary: '#ee2737', secondary: '#ffffff', text: '#ffffff' },
  SOU: { primary: '#d71920', secondary: '#ffffff', text: '#ffffff' },
  SUN: { primary: '#eb172b', secondary: '#ffffff', text: '#ffffff' },
  TOT: { primary: '#ffffff', secondary: '#132257', text: '#132257' },
  WAT: { primary: '#fbee23', secondary: '#ed2127', text: '#111111' },
  WHU: { primary: '#7a263a', secondary: '#1bb1e7', text: '#ffffff' },
  WOL: { primary: '#fdb913', secondary: '#231f20', text: '#231f20' },
};
const FALLBACK_KIT = { primary: '#9ca3af', secondary: '#ffffff', text: '#111111' };

export function kitFor(short: string | null | undefined) {
  return (short && KIT_COLOURS[short]) || FALLBACK_KIT;
}

export interface NextProjection {
  matchweek: number | null;
  /** Opponent's FPL short code, e.g. "HUL". */
  opponent: string | null;
  home: boolean;
  kickoffDate: string | null;
  xp: number | null;
  startProbability: number | null;
}

export interface PitchExtra {
  fullName: string;
  availability: Availability;
  status: string | null;
  chanceNext: number | null;
  chanceThis: number | null;
  news: string | null;
  newsAdded: string | null;
  next: NextProjection | null;
}

type PlayerRow = {
  fpl_player_id: number; first_name: string | null; second_name: string | null; web_name: string | null;
  canonical_team_id: number | null; status: string | null; chance_of_playing_next_round: number | null;
  chance_of_playing_this_round: number | null; news: string | null; news_added: string | null;
};
type FixtureRow = { fixture_id: number; matchweek: number | null; kickoff_date: string | null; home_team_id: number; away_team_id: number };
type ProjRow = { fpl_player_id: number; fixture_id: number; expected_fpl_points: number | null; start_probability: number | null };

const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

/** Pure: joins the four reads into one entry per player (exported for tests). */
export function buildPitchExtras(players: PlayerRow[], fixtures: FixtureRow[], projections: ProjRow[], shortByTeam: Map<number, string>): Map<number, PitchExtra> {
  const proj = new Map<string, ProjRow>(projections.map((p) => [`${p.fpl_player_id}:${p.fixture_id}`, p]));
  const sorted = [...fixtures].sort((a, b) => (a.kickoff_date ?? '').localeCompare(b.kickoff_date ?? '') || a.fixture_id - b.fixture_id);
  const out = new Map<number, PitchExtra>();
  for (const p of players) {
    const team = p.canonical_team_id;
    const fx = team == null ? undefined : sorted.find((f) => f.home_team_id === team || f.away_team_id === team);
    let next: NextProjection | null = null;
    if (fx) {
      const home = fx.home_team_id === team;
      const pr = proj.get(`${p.fpl_player_id}:${fx.fixture_id}`);
      next = {
        matchweek: fx.matchweek,
        opponent: shortByTeam.get(home ? fx.away_team_id : fx.home_team_id) ?? null,
        home,
        kickoffDate: fx.kickoff_date,
        xp: num(pr?.expected_fpl_points),
        startProbability: num(pr?.start_probability),
      };
    }
    const chanceNext = num(p.chance_of_playing_next_round);
    const chanceThis = num(p.chance_of_playing_this_round);
    out.set(p.fpl_player_id, {
      fullName: [p.first_name, p.second_name].filter(Boolean).join(' ').trim() || (p.web_name ?? ''),
      availability: availabilityOf(p.status, chanceNext, chanceThis),
      status: p.status,
      chanceNext,
      chanceThis,
      news: p.news?.trim() ? p.news.trim() : null,
      newsAdded: p.news_added,
      next,
    });
  }
  return out;
}

/** Today's date in London as YYYY-MM-DD (fixtures.kickoff_date is a date). */
function londonToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Availability, full names and next-fixture projections for these FPL elements. */
export async function fetchPitchExtras(elements: number[]): Promise<Map<number, PitchExtra>> {
  if (elements.length === 0) return new Map();
  const season = await getCurrentFplSeasonId();
  const [{ data: players, error: pErr }, { data: fixtures, error: fErr }, { data: fplTeams }] = await Promise.all([
    supabase
      .from('fpl_players')
      .select('fpl_player_id, first_name, second_name, web_name, canonical_team_id, status, chance_of_playing_next_round, chance_of_playing_this_round, news, news_added')
      .eq('season_id', season)
      .in('fpl_player_id', elements),
    supabase
      .from('fixtures')
      .select('fixture_id, matchweek, kickoff_date, home_team_id, away_team_id')
      .eq('league_id', PL_LEAGUE_ID)
      .eq('season_id', season)
      .eq('status', 'scheduled')
      .gte('kickoff_date', londonToday())
      .order('kickoff_date', { ascending: true })
      .limit(40),
    supabase.from('fpl_teams').select('canonical_team_id, short_name').eq('season_id', season),
  ]);
  if (pErr) throw pErr;
  if (fErr) throw fErr;
  const fixtureRows = (fixtures ?? []) as FixtureRow[];
  let projRows: ProjRow[] = [];
  if (fixtureRows.length) {
    const { data, error } = await supabase
      .from('fpl_player_projections')
      .select('fpl_player_id, fixture_id, expected_fpl_points, start_probability')
      .eq('model_version', CURRENT_MODEL_VERSION)
      .eq('scenario_key', 'baseline')
      .in('fpl_player_id', elements)
      .in('fixture_id', fixtureRows.map((f) => f.fixture_id));
    if (!error) projRows = (data ?? []) as ProjRow[];
  }
  const shortByTeam = new Map<number, string>(
    ((fplTeams ?? []) as { canonical_team_id: number | null; short_name: string }[])
      .filter((t) => t.canonical_team_id != null)
      .map((t) => [t.canonical_team_id as number, t.short_name]),
  );
  return buildPitchExtras((players ?? []) as PlayerRow[], fixtureRows, projRows, shortByTeam);
}

export type PlayState = 'none' | 'to_come' | 'live' | 'done';

/** Whether a player's gameweek matches are still to come, in play or over. */
export function playStateOf(p: PlayerScore): PlayState {
  if (!p.hasFixture) return 'none';
  if (p.fixtures.some((f) => f.state === 'live')) return 'live';
  if (p.done) return 'done';
  if (p.fixtures.some((f) => f.state !== 'not_started')) return 'live'; // one of a double done, one to come
  return 'to_come';
}

/** Bench label as the app shows it: "GKP", then "1. DEF", "2. MID", "3. FWD". */
export function benchLabelOf(p: PlayerScore): string {
  const pos = ({ 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' } as Record<number, string>)[p.type] ?? '';
  return p.position === 12 ? pos : `${p.position - 12}. ${pos}`;
}
