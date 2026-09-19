// ============================================================================
// src/lib/injuryApi.ts
//
// Availability report: who's out, why, and how many fixtures it costs.
//
// The fixtures-missed count is the whole point. FPL gives a status flag
// and a sentence; turning "Expected back 11 Oct" into "misses one
// fixture" is the work -- and it's what makes an international break
// legible. A three-week absence can cost one fixture or four depending
// entirely on where the break falls, which a status flag can never tell
// you.
//
// Return dates are parsed from free text and are null when unparseable
// or when FPL says "unknown return date". Null means unknown, never
// zero -- a confidently wrong fixture count is worse than an honest gap.
// ============================================================================

import { supabase } from './supabase';

export type InjuryRow = {
  fpl_player_id: number;
  web_name: string;
  slug: string | null;
  team_id: number | null;
  team_name: string | null;
  position_label: string;
  price: number | null;
  ownership: number | null;
  total_points: number;
  status: string;
  chance_next_round: number | null;
  news: string | null;
  return_date: string | null;
  fixtures_missed: number | null;
  next_fixture_date: string | null;
};

/** FPL's single-letter status codes, spelled out. */
export const STATUS_LABEL: Record<string, string> = {
  i: 'Injured',
  d: 'Doubtful',
  s: 'Suspended',
  u: 'Unavailable',
  n: 'Not in squad',
};

export async function getInjuryReport(seasonId = 13): Promise<InjuryRow[]> {
  const { data, error } = await supabase.rpc('get_injury_report', { p_season_id: seasonId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({
    ...r,
    price: r.price == null ? null : Number(r.price),
    ownership: r.ownership == null ? null : Number(r.ownership),
    total_points: Number(r.total_points ?? 0),
    chance_next_round: r.chance_next_round == null ? null : Number(r.chance_next_round),
    fixtures_missed: r.fixtures_missed == null ? null : Number(r.fixtures_missed),
  }));
}
