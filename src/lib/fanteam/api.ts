// ============================================================================
// src/lib/fanteam/api.ts
//
// Data access for /admin/fanteam. Every table and RPC here is admin-only at
// the database (RLS + _require_admin); a non-admin gets empty results or a
// permission error, never data. Nothing here contacts FanTeam.
// ============================================================================

import { supabase } from '../supabase';
import type { Pos, ScoringRule, ProjectionInput } from './scoring';

// Newer than the generated types; the row shapes below are the contract.
type Row = Record<string, unknown>;
type Result = Promise<{ data: Row[] | null; error: Error | null }>;
type Query = Result & {
  select: (cols: string) => Query; eq: (c: string, v: unknown) => Query; lt: (c: string, v: unknown) => Query;
  order: (c: string, o?: { ascending: boolean }) => Query; limit: (n: number) => Query;
  upsert: (v: Row) => Promise<{ error: Error | null }>;
  delete: () => Query;
};
const db = supabase as unknown as {
  from: (t: string) => Query;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

export type GameRules = {
  rules_id: number;
  format: string;
  budget_m: number;
  squad_size: number;
  starting_size: number;
  xi_min: Record<Pos, number>;
  xi_max: Record<Pos, number>;
  max_per_club: number;
  captain_multiplier: number;
  vice_rule: string;
  stacking_penalty: { positions: Pos[]; steps: number[] } | null;
  safety_net: string;
  scoring_version: string;
  source_url: string;
  verified_at: string;
};

export type InputRow = ProjectionInput & {
  matchweek: number;
  kickoff_date: string;
  kickoff_time: string | null;
  web_name: string;
  first_name: string;
  second_name: string;
  team_name: string;
  opponent_name: string;
  is_home: boolean;
  now_cost: number;
  status: string | null;
  generated_at: string;
};

export type Paste = {
  paste_id: number;
  pasted_at: string;
  contest_name: string | null;
  season_id: number;
  matchweek: number;
  rules_id: number;
  budget_m: number;
  stacking_penalty: boolean;
  safety_net: boolean;
  row_count: number;
  parser_version: string;
};

export type PriceRow = {
  paste_id: number;
  row_no: number;
  name_raw: string;
  club_raw: string;
  position: Pos;
  price_m: number;
  team_id: number | null;
  fpl_code: number | null;
  match_method: string | null;
  /** FanTeam export fields; null for older pastes or other layouts. */
  fanteam_player_id?: number | null;
  first_name?: string | null;
  surname?: string | null;
  lineup_status?: string | null;
};

export async function getRules(format = 'classic_11'): Promise<{ game: GameRules; scoring: ScoringRule[] }> {
  const { data: g, error: ge } = await db.from('fantasy_game_rules').select('*')
    .eq('provider', 'fanteam').eq('format', format).order('verified_at', { ascending: false }).limit(1);
  if (ge) throw ge;
  if (!g?.length) throw new Error(`No FanTeam rules row for ${format}`);
  const game = g[0] as unknown as GameRules;
  const { data: s, error: se } = await db.from('fantasy_scoring_rules')
    .select('rule_code, position, points, per_n, threshold_minutes')
    .eq('provider', 'fanteam').eq('scoring_version', game.scoring_version);
  if (se) throw se;
  return { game, scoring: (s ?? []).map((r) => ({ ...r, points: Number(r.points) })) as unknown as ScoringRule[] };
}

export async function getInputs(matchweek: number): Promise<InputRow[]> {
  const { data, error } = await db.rpc('fanteam_projection_inputs', { p_matchweek: matchweek });
  if (error) throw error;
  const num = (v: unknown) => (v == null ? null : Number(v));
  return ((data ?? []) as Row[]).map((r) => ({
    ...r,
    start_probability: Number(r.start_probability), sub_appearance_probability: Number(r.sub_appearance_probability),
    expected_minutes: Number(r.expected_minutes), expected_goals: Number(r.expected_goals), expected_assists: Number(r.expected_assists),
    expected_saves: num(r.expected_saves), xpts_clean_sheet: num(r.xpts_clean_sheet), xpts_goals_conceded: num(r.xpts_goals_conceded),
    xpts_penalties: num(r.xpts_penalties), xpts_cards_own_goals: num(r.xpts_cards_own_goals),
    team_goals: Number(r.team_goals), opp_goals: Number(r.opp_goals),
    p_off_before_60: num(r.p_off_before_60), p_off_60_84: num(r.p_off_60_84), p_full: num(r.p_full),
  })) as unknown as InputRow[];
}

export async function getLatestPaste(matchweek: number): Promise<{ paste: Paste; rows: PriceRow[] } | null> {
  const { data, error } = await db.from('fanteam_price_pastes')
    .select('paste_id, pasted_at, contest_name, season_id, matchweek, rules_id, budget_m, stacking_penalty, safety_net, row_count, parser_version')
    .eq('matchweek', matchweek).order('pasted_at', { ascending: false }).limit(1);
  if (error) throw error;
  if (!data?.length) return null;
  const paste = { ...data[0], budget_m: Number(data[0].budget_m) } as unknown as Paste;
  const { data: rows, error: re } = await db.from('fanteam_player_prices').select('*').eq('paste_id', paste.paste_id).order('row_no');
  if (re) throw re;
  return { paste, rows: (rows ?? []).map((r) => ({ ...r, price_m: Number(r.price_m) })) as unknown as PriceRow[] };
}

/** Previous paste's prices by name|team, for "changed since last paste". */
export async function getPreviousPrices(beforePasteId: number): Promise<Map<string, number>> {
  const { data, error } = await db.from('fanteam_price_pastes').select('paste_id')
    .lt('paste_id', beforePasteId).order('paste_id', { ascending: false }).limit(1);
  if (error) throw error;
  if (!data?.length) return new Map();
  const { data: rows, error: re } = await db.from('fanteam_player_prices').select('name_raw, team_id, price_m').eq('paste_id', data[0].paste_id);
  if (re) throw re;
  return new Map((rows ?? []).map((r) => [`${String(r.name_raw)}|${String(r.team_id)}`, Number(r.price_m)]));
}

export async function getManualMaps(): Promise<{ players: Map<string, number | null>; clubs: Map<string, number> }> {
  const [{ data: p, error: pe }, { data: c, error: ce }] = await Promise.all([
    db.from('fanteam_player_map').select('name_key, team_id, fpl_code'),
    db.from('fanteam_club_map').select('club_key, team_id'),
  ]);
  if (pe) throw pe;
  if (ce) throw ce;
  return {
    players: new Map((p ?? []).map((r) => [`${String(r.name_key)}|${String(r.team_id)}`, r.fpl_code == null ? null : Number(r.fpl_code)])),
    clubs: new Map((c ?? []).map((r) => [String(r.club_key), Number(r.team_id)])),
  };
}

export async function setPlayerFix(nameKey: string, teamId: number, fplCode: number | null): Promise<void> {
  const { error } = await db.from('fanteam_player_map').upsert({ name_key: nameKey, team_id: teamId, fpl_code: fplCode, set_at: new Date().toISOString() });
  if (error) throw error;
}

/** Undo a saved player fix: the player goes back to automatic matching. */
export async function deletePlayerFix(nameKey: string, teamId: number): Promise<void> {
  const { error } = await db.from('fanteam_player_map').delete().eq('name_key', nameKey).eq('team_id', teamId);
  if (error) throw error;
}

export async function deleteClubFix(clubKey: string): Promise<void> {
  const { error } = await db.from('fanteam_club_map').delete().eq('club_key', clubKey);
  if (error) throw error;
}

export async function setClubFix(clubKey: string, teamId: number): Promise<void> {
  const { error } = await db.from('fanteam_club_map').upsert({ club_key: clubKey, team_id: teamId, set_at: new Date().toISOString() });
  if (error) throw error;
}

export type NewPaste = {
  contest_name: string | null;
  season_id: number;
  matchweek: number;
  rules_id: number;
  budget_m: number;
  stacking_penalty: boolean;
  safety_net: boolean;
  raw_text: string;
  parser_version: string;
};

export async function savePaste(paste: NewPaste, rows: Omit<PriceRow, 'paste_id'>[]): Promise<number> {
  const { data, error } = await db.rpc('fanteam_save_paste', { p_paste: paste as unknown as Row, p_rows: rows });
  if (error) throw error;
  return Number(data);
}
