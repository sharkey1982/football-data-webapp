// ============================================================================
// src/lib/minutesOutlookApi.ts
//
// Minutes Outlook: each club's players, gameweek by gameweek over the next
// 10, with the model's start chance and expected minutes and the
// availability rule behind them (return dates, doubts, suspensions). Built
// so a first-choice player coming back from injury can be seen taking
// minutes back from the stand-in over time.
// ============================================================================

import { supabase } from './supabase';

export type OutlookTeam = { team_id: number; team_name: string; slug: string | null };

export type OutlookCell = {
  fixtures: number;
  opponents: string;
  start: number;
  minutes: number;
  availability: number | null;
  rule: string | null;
  /**
   * Start chance and minutes IF FIT (Chris, 6 Oct 2026): the projection
   * divided by his chance of being available. Where he is certainly out, the
   * nearest gameweek's if-fit value. null when he is out for the whole window.
   * Expected points use start/minutes above, not these.
   */
  fitStart: number | null;
  fitMinutes: number | null;
};

export type OutlookPlayer = {
  fpl_player_id: number;
  web_name: string;
  slug: string | null;
  position: 'GKP' | 'DEF' | 'MID' | 'FWD' | '?';
  status: string | null;
  news: string | null;
  /** Keyed by FPL gameweek. */
  cells: Map<number, OutlookCell>;
  /** Average start chance over the window. */
  avgStart: number;
  totalMinutes: number;
  /** Start chance in the last gameweek shown minus the first (positive = gaining a place). */
  trend: number;
  /** Actual minutes in recent played gameweeks, keyed by gameweek. */
  actual: Map<number, OutlookActual>;
  /** Most common specific tactical role over the window (e.g. RCB, DM); null when only a generic DEF/MID is known. */
  role: string | null;
};

/** What actually happened in a played gameweek. available = not injured or suspended at the time. */
export type OutlookActual = { minutes: number; started: boolean; available: boolean };

export type Outlook = {
  /** Recent played gameweeks with actual minutes, oldest first. */
  pastGameweeks: number[];
  gameweeks: number[];
  /** Opponents by gameweek, from any player's row (the same for the whole club). */
  opponents: Map<number, string>;
  players: OutlookPlayer[];
  generatedAt: string | null;
};

// Newer than the generated types.
const rpc = (supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
}).rpc.bind(supabase);

export async function getOutlookTeams(): Promise<OutlookTeam[]> {
  const { data, error } = await rpc('get_fpl_minutes_teams');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    team_id: Number(r.team_id),
    team_name: String(r.team_name),
    slug: r.slug == null ? null : String(r.slug),
  }));
}

type Row = {
  fpl_player_id: number; web_name: string; slug: string | null; position_label: string; status: string | null; news: string | null;
  fpl_event_id: number; fixtures: number; opponents: string; start_probability: number | string; expected_minutes: number | string;
  availability: number | string | null; availability_rule: string | null; generated_at: string | null;
  tactical_role?: string | null;
};

type ActualRow = { fpl_player_id: number; fpl_event_id: number; minutes: number; started: boolean; available: boolean };

/** Below this availability, dividing by it is noise: borrow a neighbouring gameweek instead. */
const MIN_AVAILABILITY_FOR_FIT = 0.1;

/** Pure: fills fitStart/fitMinutes on a player's cells (per-fixture values, rescaled for double gameweeks). */
export function fillIfFit(p: OutlookPlayer, gameweeks: number[]): void {
  const direct = new Map<number, { s: number; m: number }>(); // per fixture
  for (const gw of gameweeks) {
    const c = p.cells.get(gw);
    if (!c) continue;
    const a = c.availability ?? 1;
    if (a >= MIN_AVAILABILITY_FOR_FIT) {
      direct.set(gw, { s: Math.min(0.98, c.start / c.fixtures / a), m: Math.min(90, c.minutes / c.fixtures / a) });
    }
  }
  for (const gw of gameweeks) {
    const c = p.cells.get(gw);
    if (!c) continue;
    let v = direct.get(gw);
    if (!v) {
      // Nearest gameweek with a value, looking forward first (a returning player).
      const i = gameweeks.indexOf(gw);
      for (let d = 1; d < gameweeks.length && !v; d++) v = direct.get(gameweeks[i + d]) ?? direct.get(gameweeks[i - d]);
    }
    c.fitStart = v ? v.s * c.fixtures : null;
    c.fitMinutes = v ? v.m * c.fixtures : null;
  }
}

/**
 * Tactical roles, back to front and left to right within each line, so
 * players competing for the same spot sit next to each other (Chris, 6 Oct
 * 2026). Generic labels (DEF, MID, FWD) mean no specific role is known.
 */
export const ROLE_ORDER = [
  'GK',
  'LWB', 'LB', 'LCB', 'CB', 'RCB', 'RB', 'RWB',
  'DM', 'CDM', 'CM', 'LM', 'LW', 'AM', 'CAM', 'RW', 'RM',
  'LF', 'CF', 'ST', 'RF',
];

export function roleRank(role: string | null): number {
  const i = role ? ROLE_ORDER.indexOf(role.toUpperCase()) : -1;
  return i === -1 ? ROLE_ORDER.length : i;
}

/** Within a position group: by role (left to right), then most minutes first. */
export function compareByRole(a: OutlookPlayer, b: OutlookPlayer): number {
  return roleRank(a.role) - roleRank(b.role) || b.totalMinutes - a.totalMinutes;
}

/** Pure: rows from get_fpl_minutes_outlook into players with per-gameweek cells. Exported for tests. */
export function buildOutlook(rows: Row[], actualRows: ActualRow[] = []): Outlook {
  const gameweeks = [...new Set(rows.map((r) => Number(r.fpl_event_id)))].sort((a, b) => a - b);
  const opponents = new Map<number, string>();
  const byPlayer = new Map<number, OutlookPlayer>();
  const roleCounts = new Map<number, Map<string, number>>();
  let generatedAt: string | null = null;
  for (const r of rows) {
    const gw = Number(r.fpl_event_id);
    if (!opponents.has(gw)) opponents.set(gw, r.opponents);
    if (r.generated_at && (!generatedAt || r.generated_at > generatedAt)) generatedAt = r.generated_at;
    let p = byPlayer.get(Number(r.fpl_player_id));
    if (!p) {
      p = {
        fpl_player_id: Number(r.fpl_player_id), web_name: r.web_name, slug: r.slug,
        position: (['GKP', 'DEF', 'MID', 'FWD'].includes(r.position_label) ? r.position_label : '?') as OutlookPlayer['position'],
        status: r.status, news: r.news, cells: new Map(), avgStart: 0, totalMinutes: 0, trend: 0, role: null, actual: new Map(),
      };
      byPlayer.set(p.fpl_player_id, p);
    }
    const role = r.tactical_role?.toUpperCase() ?? null;
    if (role && ROLE_ORDER.includes(role)) {
      const m = roleCounts.get(p.fpl_player_id) ?? new Map<string, number>();
      m.set(role, (m.get(role) ?? 0) + 1);
      roleCounts.set(p.fpl_player_id, m);
    }
    p.cells.set(gw, {
      fixtures: Number(r.fixtures), opponents: r.opponents,
      start: Number(r.start_probability), minutes: Number(r.expected_minutes),
      availability: r.availability == null ? null : Number(r.availability), rule: r.availability_rule,
      fitStart: null, fitMinutes: null,
    });
  }
  const first = gameweeks[0], last = gameweeks[gameweeks.length - 1];
  for (const p of byPlayer.values()) {
    const cells = [...p.cells.values()];
    // Per fixture, so a double gameweek doesn't inflate the average.
    const fx = cells.reduce((a, c) => a + c.fixtures, 0);
    p.avgStart = fx ? cells.reduce((a, c) => a + c.start, 0) / fx : 0;
    p.totalMinutes = cells.reduce((a, c) => a + c.minutes, 0);
    const a = p.cells.get(first), b = p.cells.get(last);
    p.trend = a && b ? b.start / b.fixtures - a.start / a.fixtures : 0;
    const counts = roleCounts.get(p.fpl_player_id);
    p.role = counts ? [...counts.entries()].sort((x, y) => y[1] - x[1] || roleRank(x[0]) - roleRank(y[0]))[0][0] : null;
  }
  for (const p of byPlayer.values()) fillIfFit(p, gameweeks);
  const pastGameweeks = [...new Set(actualRows.map((r) => Number(r.fpl_event_id)))].sort((a, b) => a - b);
  for (const r of actualRows) {
    byPlayer.get(Number(r.fpl_player_id))?.actual.set(Number(r.fpl_event_id), {
      minutes: Number(r.minutes), started: !!r.started, available: !!r.available,
    });
  }
  return { pastGameweeks, gameweeks, opponents, players: [...byPlayer.values()], generatedAt };
}

export async function getMinutesOutlook(teamId: number): Promise<Outlook> {
  const [proj, act] = await Promise.all([
    rpc('get_fpl_minutes_outlook', { p_team_id: teamId }),
    rpc('get_fpl_minutes_actuals', { p_team_id: teamId }),
  ]);
  if (proj.error) throw proj.error;
  // Actuals are context: the projections still show if they fail.
  return buildOutlook((proj.data ?? []) as Row[], act.error ? [] : ((act.data ?? []) as ActualRow[]));
}

/** Plain-English reason for a cell's availability, for the hover text. */
export function ruleText(rule: string | null, availability: number | null): string | null {
  if (availability == null || availability >= 0.999) return null;
  const pct = `${Math.round(availability * 100)}% available`;
  switch (rule) {
    case 'returning': return `Returning from injury: ${pct}`;
    case 'before_return_date': return 'Out: before his expected return date';
    case 'doubt': return `Doubtful: ${pct}`;
    case 'injured_no_date': return availability === 0 ? 'Injured, no return date' : `Injured, no return date: ${pct} (a slow assumed recovery)`;
    case 'return_date_passed': return `Return date passed, still injured: ${pct}`;
    case 'suspended_until': case 'suspended_next': return availability === 0 ? 'Suspended' : pct;
    case 'unavailable': return 'Unavailable';
    default: return pct;
  }
}

/** "Leeds (H), Wolves (A)" -> "LEE wol" (FPL style: capitals at home). */
export function shortOpponents(s: string): string {
  return s.split(', ').map((o) => {
    const m = o.match(/^(.*) \((H|A)\)$/);
    if (!m) return o.slice(0, 3);
    const abbr = m[1].replace(/[^A-Za-z]/g, '').slice(0, 3);
    return m[2] === 'H' ? abbr.toUpperCase() : abbr.toLowerCase();
  }).join(' ');
}
