// ============================================================================
// src/lib/digestApi.ts
//
// What changed since the last snapshot.
//
// Derived rather than stored, so it can't drift from the pages it
// summarises -- a digest disagreeing with the Trading Floor or Physio
// Room would be worse than no digest.
//
// Also the source for scheduled posts. The recommendation there is
// generate-and-queue rather than auto-post: the model will sometimes be
// wrong, and a wrong call published automatically overnight is hard to
// walk back for an account still building credibility.
// ============================================================================

import { supabase } from './supabase';

export type DigestChangeType = 'price_rise' | 'price_fall' | 'availability' | 'ownership';

export type DigestEntry = {
  change_type: DigestChangeType;
  fpl_player_id: number;
  web_name: string;
  slug: string | null;
  team_name: string | null;
  position_label: string;
  ownership: number;
  old_value: string | null;
  new_value: string | null;
  detail: string | null;
  from_date: string;
  to_date: string;
};

export async function getDailyDigest(seasonId = 13): Promise<DigestEntry[]> {
  const { data, error } = await supabase.rpc('get_daily_digest', { p_season_id: seasonId });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => ({ ...r, ownership: Number(r.ownership ?? 0) }));
}

export const CHANGE_LABELS: Record<DigestChangeType, string> = {
  availability: 'Availability',
  price_rise: 'Price rises',
  price_fall: 'Price falls',
  ownership: 'Ownership swings',
};

/** Display order: availability first because it's the only category
 * that can force a transfer, then prices because they cost money, then
 * ownership which is context rather than a decision. */
export const CHANGE_ORDER: DigestChangeType[] = ['availability', 'price_rise', 'price_fall', 'ownership'];

/** Changes worth pushing at someone, as opposed to everything that
 * moved. A 0.1m move for a 0.3%-owned player is real and irrelevant;
 * the same move at 40% ownership affects most squads.
 *
 * Availability is exempt from the ownership floor: a newly injured
 * player nobody owns yet is exactly the thing worth knowing early. */
export function notable(entries: DigestEntry[], minOwnership = 5): DigestEntry[] {
  return entries.filter((e) => e.change_type === 'availability' || e.ownership >= minOwnership);
}
