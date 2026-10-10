// ============================================================================
// src/lib/lineupCompareApi.ts
//
// Data for /admin/lineup-compare: our start chances for a gameweek next to
// Fantasy Football Scout's predicted XIs (entered by an admin; admin-only in
// the database, not a projection input).
// ============================================================================

import { supabase } from './supabase';
import { getCurrentFplSeasonId } from './currentSeason';
import { clubNames, type ClubRef, type SquadPlayer } from './externalLineupParse';

export const FFS_SOURCE = 'fantasy_football_scout';

const rpc = (supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
}).rpc.bind(supabase);

export type CompareRow = {
  team_id: number;
  team_name: string;
  fpl_player_id: number;
  web_name: string;
  element_type: number;
  tactical_role: string | null;
  depth_rank: number | null;
  status: string | null;
  news: string | null;
  start_probability: number;
  expected_minutes: number;
  /** null = FFS line-up not entered for this club; else whether FFS has him starting. */
  source_start: boolean | null;
  source_entered_at: string | null;
};

export type ClubComparison = {
  team_id: number;
  team_name: string;
  entered: boolean;
  enteredAt: string | null;
  /** In both XIs (our chance >= 50% and FFS starting). */
  agree: CompareRow[];
  /** FFS has him starting; we make it under 50%. */
  ffsOnly: CompareRow[];
  /** We make it 50%+; FFS leaves him out. */
  oursOnly: CompareRow[];
  /** Our expected number of starters from our top 11 by start chance, for context. */
  disagreements: number;
};

/** Our "starter" line. */
export const START_LINE = 0.5;

export function buildComparison(rows: CompareRow[]): ClubComparison[] {
  const byTeam = new Map<number, CompareRow[]>();
  for (const r of rows) byTeam.set(r.team_id, [...(byTeam.get(r.team_id) ?? []), r]);
  const out: ClubComparison[] = [];
  for (const [team_id, list] of byTeam) {
    const entered = list.some((r) => r.source_start !== null);
    const byChance = (a: CompareRow, b: CompareRow) => b.start_probability - a.start_probability;
    const agree = entered ? list.filter((r) => r.source_start && r.start_probability >= START_LINE).sort(byChance) : [];
    const ffsOnly = entered ? list.filter((r) => r.source_start && r.start_probability < START_LINE).sort(byChance) : [];
    const oursOnly = entered ? list.filter((r) => !r.source_start && r.start_probability >= START_LINE).sort(byChance) : [];
    out.push({
      team_id,
      team_name: list[0].team_name,
      entered,
      enteredAt: list.find((r) => r.source_entered_at)?.source_entered_at ?? null,
      agree,
      ffsOnly,
      oursOnly,
      disagreements: ffsOnly.length + oursOnly.length,
    });
  }
  // Entered clubs first, most disagreement first; then the rest by name.
  return out.sort((a, b) => Number(b.entered) - Number(a.entered) || b.disagreements - a.disagreements || a.team_name.localeCompare(b.team_name));
}

export async function getComparison(event: number): Promise<CompareRow[]> {
  const { data, error } = await rpc('get_fpl_lineup_comparison', { p_event: event, p_source: FFS_SOURCE });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    team_id: Number(r.team_id),
    team_name: String(r.team_name),
    fpl_player_id: Number(r.fpl_player_id),
    web_name: String(r.web_name),
    element_type: Number(r.element_type),
    tactical_role: r.tactical_role == null ? null : String(r.tactical_role),
    depth_rank: r.depth_rank == null ? null : Number(r.depth_rank),
    status: r.status == null ? null : String(r.status),
    news: r.news == null ? null : String(r.news),
    start_probability: Number(r.start_probability ?? 0),
    expected_minutes: Number(r.expected_minutes ?? 0),
    source_start: r.source_start == null ? null : Boolean(r.source_start),
    source_entered_at: r.source_entered_at == null ? null : String(r.source_entered_at),
  }));
}

export async function saveExternalLineup(event: number, teamId: number, playerIds: number[]): Promise<number> {
  const { data, error } = await rpc('fpl_save_external_lineup', { p_source: FFS_SOURCE, p_event: event, p_team_id: teamId, p_players: playerIds });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function clearExternalLineup(event: number, teamId: number): Promise<void> {
  const { error } = await rpc('fpl_clear_external_lineup', { p_source: FFS_SOURCE, p_event: event, p_team_id: teamId });
  if (error) throw error;
}

export type Gameweek = { fpl_event_id: number; deadline_time: string };

/** Gameweeks with the next one first in the default selection. */
export async function getGameweeks(): Promise<{ list: Gameweek[]; next: number | null }> {
  const season = await getCurrentFplSeasonId();
  const { data, error } = await supabase.from('fpl_gameweeks').select('fpl_event_id, deadline_time').eq('season_id', season).order('fpl_event_id');
  if (error) throw error;
  const list = (data ?? []).map((g) => ({ fpl_event_id: Number(g.fpl_event_id), deadline_time: String(g.deadline_time) }));
  const now = Date.now();
  const next = list.find((g) => new Date(g.deadline_time).getTime() > now)?.fpl_event_id ?? list.at(-1)?.fpl_event_id ?? null;
  return { list, next };
}

/** Squads (for matching names) and club names (for spotting club headers). */
export async function getSquadsAndClubs(): Promise<{ squads: Map<number, SquadPlayer[]>; clubs: (ClubRef & { label: string })[] }> {
  const season = await getCurrentFplSeasonId();
  const [{ data: players, error: pErr }, { data: teams, error: tErr }] = await Promise.all([
    supabase.from('fpl_players').select('fpl_player_id, web_name, first_name, second_name, canonical_team_id, status').eq('season_id', season).not('canonical_team_id', 'is', null),
    supabase.from('fpl_teams').select('canonical_team_id, name, short_name, teams!inner(display_name, canonical_name)').eq('season_id', season),
  ]);
  if (pErr) throw pErr;
  if (tErr) throw tErr;
  const squads = new Map<number, SquadPlayer[]>();
  for (const p of players ?? []) {
    if (p.status === 'u') continue; // left the club
    const tid = Number(p.canonical_team_id);
    squads.set(tid, [...(squads.get(tid) ?? []), { fpl_player_id: Number(p.fpl_player_id), web_name: String(p.web_name), first_name: p.first_name, second_name: p.second_name }]);
  }
  const clubs = (teams ?? [])
    .map((t) => {
      const tm = (t as unknown as { teams: { display_name: string; canonical_name: string } }).teams;
      const label = tm?.display_name ?? String(t.name);
      return { team_id: Number(t.canonical_team_id), label, names: clubNames([label, tm?.canonical_name, String(t.name), String(t.short_name)]) };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  return { squads, clubs };
}
