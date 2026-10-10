// ============================================================================
// src/lib/sharkFantasyApi.ts
//
// Reads the public sf_* views and calls the two functions a signed-in manager
// may use (sf_join, sf_save_team). Everything else in the sf schema is the
// round runner's (service role). While a universe is not public, the views
// return rows only to admins (RLS), so a non-admin simply sees nothing.
// ============================================================================

import { supabase } from './supabase';

// The sf_* views aren't in the generated Database types yet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface SfSeason { season_id: number; universe_id: string; universe: string; number: number; state: string; shield_winner: string | null; current_round: number | null; open_round: number | null }
export interface SfRound { season_id: number; number: number; kind: 'league' | 'finals'; deadline_at: string; kickoff_at: string; state: 'upcoming' | 'open' | 'locked' | 'final' }
export interface SfClub { club_id: string; name: string; short: string; manager: string }
export interface SfPlayer {
  player_id: string; name: string; club_id: string; club: string; position: Position; age: number; nationality: string;
  price: number; start_price: number; attack: number; creativity: number; defence: number; keeping: number; discipline: number;
  available_from: number; total_points: number; next_x_points: number | null;
}
export interface SfFixture { fixture_id: number; round: number; kind: 'league' | 'final' | 'placing'; home_id: string; home: string; away_id: string; away: string; kickoff_at: string; status: 'scheduled' | 'live' | 'full_time'; home_goals: number; away_goals: number; shootout: { winner: 'home' | 'away'; home: number; away: number } | null }
export interface SfEvent { fixture_id: number; seq: number; minute: number; type: string; side: 'home' | 'away'; player_id: string | null; player: string | null; detail: Record<string, unknown> | null }
export interface SfTableRow { club_id: string; p: number; w: number; d: number; l: number; gf: number; ga: number; gd: number; pts: number }
export interface SfLeaderRow { entry_id: number; team_name: string; display_name: string; is_bot: boolean; bot_kind: string | null; joined_round: number; total: number; hits: number; last_round: number | null }
export interface SfSnapshotPick { player_id: string; slot: number; is_captain: boolean; is_vice: boolean; purchase_price: number }
export interface SfEntryRound { entry_id: number; round: number; picks: SfSnapshotPick[]; bank: number; transfers: number; hits: number; wildcard: boolean; points: number | null; total: number | null; captain_used: string | null; subs: [string, string][] | null }
export interface SfPlayerRound { round: number; player_id: string; minutes: number; started: boolean; goals: number; assists: number; clean_sheet: boolean; saves: number; yellow: number; red: number; bonus: number; points: number }
export interface SfMyTeam {
  entry_id: number; team_name: string; bank: number; free_transfers: number; wildcards_left: number; transfers_this_round: number; wildcard_this_round: boolean;
  picks: { player_id: string; slot: number; is_captain: boolean; is_vice: boolean; purchase_price: number; price: number; selling_price: number }[];
}

async function rows<T>(q: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export const loadSeasons = () => rows<SfSeason>(db.from('sf_seasons').select('*').order('season_id', { ascending: false }));

export interface SeasonData {
  rounds: SfRound[]; clubs: SfClub[]; players: SfPlayer[]; fixtures: SfFixture[]; table: SfTableRow[]; leaderboard: SfLeaderRow[];
}

export async function loadSeasonData(season: SfSeason): Promise<SeasonData> {
  const [rounds, clubs, players, fixtures, table, leaderboard] = await Promise.all([
    rows<SfRound>(db.from('sf_rounds').select('*').eq('season_id', season.season_id).order('number')),
    rows<SfClub>(db.from('sf_clubs').select('club_id,name,short,manager').eq('universe_id', season.universe_id)),
    rows<SfPlayer>(db.from('sf_players').select('*').eq('season_id', season.season_id)),
    rows<SfFixture>(db.from('sf_fixtures').select('*').eq('season_id', season.season_id).order('fixture_id')),
    rows<SfTableRow>(db.from('sf_league_table').select('*').eq('season_id', season.season_id)),
    rows<SfLeaderRow>(db.from('sf_leaderboard').select('*').eq('season_id', season.season_id)),
  ]);
  return { rounds, clubs, players, fixtures, table, leaderboard };
}

export async function loadMyTeam(seasonId: number): Promise<SfMyTeam | null> {
  const r = await rows<Omit<SfMyTeam, 'picks'> & SfMyTeam['picks'][number]>(db.from('sf_my_team').select('*').eq('season_id', seasonId));
  if (!r.length) return null;
  const { entry_id, team_name, bank, free_transfers, wildcards_left, transfers_this_round, wildcard_this_round } = r[0];
  return { entry_id, team_name, bank, free_transfers, wildcards_left, transfers_this_round, wildcard_this_round,
    picks: r.filter((x) => x.player_id).map(({ player_id, slot, is_captain, is_vice, purchase_price, price, selling_price }) => ({ player_id, slot, is_captain, is_vice, purchase_price, price, selling_price })) };
}

export const loadEntryRounds = (entryId: number) => rows<SfEntryRound>(db.from('sf_entry_rounds').select('*').eq('entry_id', entryId).order('round'));
export const loadEvents = (fixtureIds: number[]) => fixtureIds.length
  ? rows<SfEvent>(db.from('sf_match_events').select('*').in('fixture_id', fixtureIds).order('seq'))
  : Promise.resolve([] as SfEvent[]);
export const loadPlayerRounds = (seasonId: number, round: number) =>
  rows<SfPlayerRound>(db.from('sf_player_rounds').select('*').eq('season_id', seasonId).eq('round', round));

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const joinSeason = (seasonId: number, teamName: string, displayName: string) =>
  rpc<number>('sf_join', { p_season: seasonId, p_team_name: teamName, p_display_name: displayName });

export interface SaveResult { round: number; bank: number; transfers: number; free_transfers: number; wildcard: boolean; hits_if_deadline_now: number }
export const saveTeam = (seasonId: number, p: { picks: { player_id: string; slot: number }[]; captain: string; vice: string; wildcard: boolean }) =>
  rpc<SaveResult>('sf_save_team', { p_season: seasonId, p });

export const money = (tenths: number) => (tenths / 10).toFixed(1);
