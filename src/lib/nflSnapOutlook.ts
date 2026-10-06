// ============================================================================
// src/lib/nflSnapOutlook.ts
//
// NFL Snap Outlook (the NFL counterpart of FPL's Minutes Outlook; the NFL
// counts snaps, not minutes). One team at a time: each fantasy player's share
// of the team's offensive snaps game by game, the trend, carries + targets,
// his place on the depth chart now and before the last game, injury status for
// the next game, and an expected role.
//
// Data: public.nfl_player_snaps (nflverse snap counts), public.nfl_depth_latest
// and public.nfl_depth_by_game (depth charts), public.nfl_player_weeks
// (carries, targets), public.nfl_projections (injury report for the next game).
// ============================================================================

import { supabase } from './supabase';
import { TEAM_COLUMNS, type NflTeam } from './nflApi';

export const OUTLOOK_POSITIONS = ['QB', 'RB', 'WR', 'TE'] as const;
export type OutlookPosition = (typeof OUTLOOK_POSITIONS)[number];

export type SnapRow = { player_id: string | null; player_name: string; player_slug: string | null; position: string | null; week: number; game_id: string; offense_snaps: number; team_offense_snaps: number };
export type UsageRow = { player_id: string; week: number; carries: number; targets: number };
export type DepthRow = { player_id: string; player_name: string; position: string; slot: number | string; depth: number };
export type InjuryRow = { player_id: string; injury_status: string | null; injury: string | null };

export type Role = 'Starter' | 'Rotation' | 'Backup' | 'Out' | 'Doubtful' | 'Depth';

export type OutlookPlayer = {
  player_id: string;
  name: string;
  slug: string | null;
  position: OutlookPosition;
  /** Share of team offensive snaps per week (null = did not play that week). */
  shares: Map<number, number | null>;
  seasonShare: number | null;
  /** Average share in the last two games played by the team, minus the average before them (percentage points / 100). */
  trend: number | null;
  /** Carries + targets per game played. */
  opportunities: number | null;
  depthNow: number | null;
  depthBefore: number | null;
  /** e.g. "RB1", "WR2". */
  depthLabel: string | null;
  injury: InjuryRow | null;
  role: Role;
};

export type SnapOutlook = {
  team: NflTeam;
  season: number;
  weeks: number[];
  players: OutlookPlayer[];
  gaining: OutlookPlayer[];
  losing: OutlookPlayer[];
  depthMoves: { player: OutlookPlayer; from: number | null; to: number | null }[];
  asOf: string | null;
};

const fantasyPos = (p: string | null): OutlookPosition | null => {
  const x = p === 'FB' || p === 'HB' ? 'RB' : p;
  return (OUTLOOK_POSITIONS as readonly string[]).includes(x ?? '') ? (x as OutlookPosition) : null;
};

const avg = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** Expected role for the next game, from the injury report, recent snap share and the depth chart. */
export function roleOf(recentShare: number | null, depth: number | null, injury: string | null): Role {
  if (injury === 'Out') return 'Out';
  if (injury === 'Doubtful') return 'Doubtful';
  if (recentShare != null && recentShare >= 0.6) return 'Starter';
  if (recentShare != null && recentShare >= 0.3) return 'Rotation';
  if (recentShare == null && depth === 1) return 'Starter';
  if (recentShare != null && recentShare > 0) return 'Backup';
  return 'Depth';
}

/**
 * Builds the outlook for one team. Depth for a position: a player's best (lowest)
 * rank across the chart's slots for his position, ordered among team-mates at that
 * position, so "RB1" is the first running back listed.
 */
export function buildSnapOutlook(input: {
  team: NflTeam;
  season: number;
  snaps: SnapRow[];
  usage: UsageRow[];
  depthNow: DepthRow[];
  depthBefore: DepthRow[];
  injuries: InjuryRow[];
  asOf: string | null;
}): SnapOutlook {
  const weeks = [...new Set(input.snaps.map((s) => s.week))].sort((a, b) => a - b);
  const byPlayer = new Map<string, SnapRow[]>();
  for (const s of input.snaps) {
    const pos = fantasyPos(s.position);
    if (!pos || !s.player_id) continue;
    byPlayer.set(s.player_id, [...(byPlayer.get(s.player_id) ?? []), s]);
  }
  const ranks = (rows: DepthRow[]) => {
    const best = new Map<string, { pos: OutlookPosition; key: number; name: string }>();
    for (const r of rows) {
      const pos = fantasyPos(r.position);
      if (!pos) continue;
      const key = Number(r.depth) * 100 + (typeof r.slot === 'number' ? r.slot : 0);
      const cur = best.get(r.player_id);
      if (!cur || key < cur.key) best.set(r.player_id, { pos, key, name: r.player_name });
    }
    const out = new Map<string, { pos: OutlookPosition; rank: number; name: string }>();
    for (const pos of OUTLOOK_POSITIONS) {
      [...best.entries()].filter(([, v]) => v.pos === pos).sort((a, b) => a[1].key - b[1].key).forEach(([id, v], i) => out.set(id, { pos, rank: i + 1, name: v.name }));
    }
    return out;
  };
  const now = ranks(input.depthNow);
  const before = ranks(input.depthBefore);
  const injuries = new Map(input.injuries.map((i) => [i.player_id, i]));
  const usage = new Map<string, UsageRow[]>();
  for (const u of input.usage) usage.set(u.player_id, [...(usage.get(u.player_id) ?? []), u]);

  // Everyone who has played a snap, plus anyone on today's chart who hasn't (new signings, returners).
  const ids = new Set([...byPlayer.keys(), ...now.keys()]);
  const lastTwo = weeks.slice(-2);
  const players: OutlookPlayer[] = [];
  for (const id of ids) {
    const rows = byPlayer.get(id) ?? [];
    const pos = fantasyPos(rows[0]?.position ?? null) ?? now.get(id)?.pos;
    if (!pos) continue;
    const shares = new Map<number, number | null>(weeks.map((w) => [w, null]));
    for (const r of rows) shares.set(r.week, r.team_offense_snaps ? Number(r.offense_snaps) / Number(r.team_offense_snaps) : null);
    const played = [...shares.values()].filter((v): v is number => v != null);
    // Recent and earlier include games he missed as 0: losing his place is the point.
    const recent = avg(lastTwo.map((w) => shares.get(w) ?? 0));
    const earlierWeeks = weeks.filter((w) => !lastTwo.includes(w));
    const earlier = avg(earlierWeeks.map((w) => shares.get(w) ?? 0));
    const u = usage.get(id) ?? [];
    const inj = injuries.get(id) ?? null;
    const dn = now.get(id)?.rank ?? null;
    players.push({
      player_id: id,
      name: rows[rows.length - 1]?.player_name ?? now.get(id)?.name ?? id,
      slug: rows.find((r) => r.player_slug)?.player_slug ?? null,
      position: pos,
      shares,
      seasonShare: avg(played),
      trend: recent != null && earlier != null && rows.length ? recent - earlier : null,
      opportunities: u.length ? u.reduce((s, x) => s + Number(x.carries) + Number(x.targets), 0) / u.length : null,
      depthNow: dn,
      depthBefore: before.get(id)?.rank ?? null,
      depthLabel: dn ? `${pos}${dn}` : null,
      injury: inj,
      role: roleOf(rows.length ? recent : null, dn, inj?.injury_status ?? null),
    });
  }
  const posOrder = (p: OutlookPosition) => OUTLOOK_POSITIONS.indexOf(p);
  players.sort((a, b) => posOrder(a.position) - posOrder(b.position) || (a.depthNow ?? 99) - (b.depthNow ?? 99) || (b.seasonShare ?? 0) - (a.seasonShare ?? 0));
  const moving = players.filter((p) => p.trend != null && Math.abs(p.trend) >= 0.1);
  return {
    team: input.team,
    season: input.season,
    weeks,
    players,
    gaining: moving.filter((p) => p.trend! > 0).sort((a, b) => b.trend! - a.trend!).slice(0, 4),
    losing: moving.filter((p) => p.trend! < 0).sort((a, b) => a.trend! - b.trend!).slice(0, 4),
    // No chart from before the last game (not captured): no moves rather than everyone "new".
    depthMoves: !input.depthBefore.length ? [] : players
      .filter((p) => (p.depthNow ?? null) !== (p.depthBefore ?? null) && (p.depthNow != null && p.depthNow <= 3 || p.depthBefore != null && p.depthBefore <= 3))
      .map((p) => ({ player: p, from: p.depthBefore, to: p.depthNow })),
    asOf: input.asOf,
  };
}

// ---- Loaders -------------------------------------------------------------------------------

export async function loadOutlookTeams(): Promise<NflTeam[]> {
  const { data, error } = await supabase.from('nfl_teams' as never).select(TEAM_COLUMNS).order('name');
  if (error) throw error;
  return (data ?? []) as unknown as NflTeam[];
}

export async function loadSnapOutlook(teamSlug: string): Promise<SnapOutlook | null> {
  const teams = await loadOutlookTeams();
  const team = teams.find((t) => t.slug === teamSlug);
  if (!team) return null;
  const { data: sRow, error: sErr } = await supabase.from('nfl_player_snaps' as never).select('season').order('season', { ascending: false }).limit(1);
  if (sErr) throw sErr;
  const season = ((sRow ?? []) as { season: number }[])[0]?.season;
  if (!season) return null;
  const [snaps, usage, depthNow, lastGame, injuries] = await Promise.all([
    supabase.from('nfl_player_snaps' as never).select('player_id,player_name,player_slug,position,week,game_id,offense_snaps,team_offense_snaps').eq('season', season).eq('team', team.franchise).eq('game_type', 'REG').in('position', ['QB', 'RB', 'FB', 'WR', 'TE']).limit(3000),
    supabase.from('nfl_player_weeks' as never).select('player_id,week,carries,targets').eq('season', season).eq('team', team.franchise).eq('season_type', 'REG').limit(3000),
    supabase.from('nfl_depth_latest' as never).select('player_id,player_name,position,slot,depth,as_of').eq('team', team.franchise),
    supabase.from('nfl_player_snaps' as never).select('game_id,week').eq('season', season).eq('team', team.franchise).order('week', { ascending: false }).limit(1),
    supabase.from('nfl_projections' as never).select('player_id,injury_status,injury,kickoff_at').eq('team', team.franchise).order('kickoff_at', { ascending: false }).limit(200),
  ]);
  for (const r of [snaps, usage, depthNow, lastGame]) if (r.error) throw r.error;
  const lastGameId = ((lastGame.data ?? []) as { game_id: string }[])[0]?.game_id;
  const before = lastGameId
    ? await supabase.from('nfl_depth_by_game' as never).select('player_id,player_name,position,slot,depth').eq('game_id', lastGameId).eq('team', team.franchise)
    : { data: [], error: null };
  // The next game's injury report: only the latest projection per player.
  const inj = new Map<string, InjuryRow>();
  for (const r of (injuries.error ? [] : (injuries.data ?? [])) as unknown as (InjuryRow & { kickoff_at: string })[]) if (!inj.has(r.player_id)) inj.set(r.player_id, r);
  const dn = (depthNow.data ?? []) as unknown as (DepthRow & { as_of: string })[];
  return buildSnapOutlook({
    team,
    season,
    snaps: (snaps.data ?? []) as unknown as SnapRow[],
    usage: (usage.data ?? []) as unknown as UsageRow[],
    depthNow: dn,
    depthBefore: (before.error ? [] : (before.data ?? [])) as unknown as DepthRow[],
    injuries: [...inj.values()],
    asOf: dn[0]?.as_of ?? null,
  });
}
