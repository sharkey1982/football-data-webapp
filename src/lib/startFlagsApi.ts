// ============================================================================
// src/lib/startFlagsApi.ts
//
// The start-chance review list (experiment D1, 25 Oct 2026): players the
// model gives 60%+ to start despite <= 1 start in their last five matches
// while fit. Stored by the projections refresh (fpl_start_flags); admins only.
// ============================================================================
import { supabase } from './supabase';

export type StartFlag = {
  fixture_id: number;
  kickoff_date: string;
  matchweek: number | null;
  team: string | null;
  fpl_player_id: number;
  web_name: string;
  raw_probability: number;
  probability: number;
  capped: boolean;
  starts_last: number | null;
  avail_last: number | null;
  depth_rank: number | null;
  tactical_role: string | null;
  role_source: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- view not in the generated types, shape above
const db = supabase as unknown as { from: (t: string) => any };

export async function getStartFlags(): Promise<StartFlag[]> {
  const { data, error } = await db
    .from('fpl_start_flags_review')
    .select('fixture_id, kickoff_date, matchweek, team, fpl_player_id, web_name, raw_probability, probability, capped, starts_last, avail_last, depth_rank, tactical_role, role_source')
    .order('kickoff_date')
    .order('raw_probability', { ascending: false });
  if (error) throw error;
  return (data ?? []) as StartFlag[];
}

