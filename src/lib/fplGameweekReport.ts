// ============================================================================
// src/lib/fplGameweekReport.ts
//
// The weekly FPL log: a reflection each Tuesday and a preview each Thursday,
// written by scripts/fpl_gameweek_report.py into fpl_gameweek_reports. The
// payload types here mirror that script. Pages read the newest published
// version (fpl_gameweek_reports_latest); drafts are never public.
// Design: project doc fpl-gameweek-preview-reflection-design-2026-10-12.
// ============================================================================

import { supabase } from './supabase';

export const GAMEWEEK_HUB_PATH = '/fpl/gameweek';
export type ReportKind = 'preview' | 'reflection';

export function reportPath(season: string, gw: number, kind: ReportKind): string {
  return `${GAMEWEEK_HUB_PATH}/${season}/${gw}/${kind}`;
}

/** "2026-27" -> "2026/27". */
export function seasonDisplay(season: string): string {
  return season.replace('-', '/');
}

export type PlayerRef = { id: number; name: string; team: string; pos: string | null; own: number | null };

export type MatchGoals = {
  home: string; away: string; finished: boolean;
  exp_home: number | null; exp_away: number | null;
  goals_home: number | null; goals_away: number | null;
  xg_home: number | null; xg_away: number | null;
};
export type SeasonTeam = {
  team: string; matches: number;
  goals_for: number; xg_for: number; market_for: number;
  goals_against: number; xg_against: number; market_against: number;
  attack_vs_market: number; defence_vs_market: number;
};
export type Next5Team = {
  team: string; fixtures: number;
  for_before: number; for_now: number; against_before: number; against_now: number;
  for_change: number; against_change: number;
};

export type ReflectionPayload = {
  kind: 'reflection';
  season: string;
  gw: number;
  deadline: string;
  generated_at: string;
  gameweek_finished: boolean;
  bonus_confirmed: boolean;
  average: number | null;
  headlines: string[];
  goals: {
    matches: MatchGoals[];
    expected_from: string;
    season: SeasonTeam[];
    next5: Next5Team[];
    next5_from: string;
    next5_gws: [number, number];
  };
  minutes: {
    brier: number | null;
    players: number;
    surprise_starters: (PlayerRef & { p: number; minutes: number; pts: number })[];
    surprise_absences: (PlayerRef & { p: number; flagged: boolean; news: string | null; minutes: number })[];
    early_subs: (PlayerRef & { xmin: number; minutes: number })[];
    positions: (PlayerRef & { model_role: string; played_role: string; kind?: 'line' | 'side' })[];
    lineups_covered: number;
    fixtures: number;
    next_gw: number;
    next_gw_moves: (PlayerRef & { before: number; now: number; change: number; reason: string })[];
  };
  set_pieces: {
    order_changes: { team: string; type: string; before: string[]; now: string[] }[];
    penalties_missed: (PlayerRef & { count: number })[];
    model_mismatches: { team: string; fpl: string[]; model: string }[];
    hierarchy_updated: string | null;
    note: string;
  };
  captaincy: {
    weeks: {
      gw: number;
      premium: (PlayerRef & { pts: number }) | null;
      form: (PlayerRef & { pts: number }) | null;
      model: (PlayerRef & { pts: number }) | null;
      best: (PlayerRef & { pts: number }) | null;
      average: number | null;
    }[];
    season: {
      key: 'premium' | 'form' | 'best' | 'model';
      label: string; definition: string; weeks: number; points: number; captain_points: number;
      beat_premium: number | null; worst: number | null; premium_same_weeks?: number;
    }[];
    span: [number, number] | null;
    context: { top_pick_blank_rate: number; top_pick_best_rate: number; seasons: string; article: string; haaland_article: string };
  };
  during: {
    injuries: (PlayerRef & { before: string | null; now: string | null; news: string | null })[];
    prices: (PlayerRef & { before: number; now: number })[];
    red_cards: PlayerRef[];
    model_changes: { date: string; area: string; title: string }[];
  };
  checks?: Record<string, unknown>;
};

/** Preview payloads arrive with phase 1; the page shows a placeholder until then. */
export type ReportPayload = ReflectionPayload | { kind: 'preview'; season: string; gw: number; headlines: string[] };

export type GameweekReport = {
  season_label: string;
  fpl_event_id: number;
  kind: ReportKind;
  version: number;
  frozen: boolean;
  generated_at: string;
  published_at: string | null;
  title: string;
  summary: string | null;
  payload: ReportPayload;
};

export type ReportListEntry = Omit<GameweekReport, 'payload'>;

const LIST_COLUMNS = 'season_label,fpl_event_id,kind,version,frozen,generated_at,published_at,title,summary';

export async function loadReport(season: string, gw: number, kind: ReportKind): Promise<GameweekReport | null> {
  const { data, error } = await supabase
    .from('fpl_gameweek_reports_latest' as never)
    .select(`${LIST_COLUMNS},payload`)
    .eq('season_label', season)
    .eq('fpl_event_id', gw)
    .eq('kind', kind)
    .maybeSingle();
  if (error) throw error;
  return (data as GameweekReport | null) ?? null;
}

export async function loadReportList(): Promise<ReportListEntry[]> {
  const { data, error } = await supabase
    .from('fpl_gameweek_reports_latest' as never)
    .select(LIST_COLUMNS)
    .order('fpl_event_id', { ascending: false })
    .order('kind', { ascending: true });
  if (error) throw error;
  return (data as ReportListEntry[] | null) ?? [];
}

// ---- Formatting helpers shared by the page and its tests --------------------

export function signed(v: number | null | undefined, nd = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  const s = Math.abs(v).toFixed(nd);
  if (Number(s) === 0) return (0).toFixed(nd);
  return v > 0 ? `+${s}` : `−${s}`;
}

export function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

const STATUS: Record<string, string> = { a: 'available', d: 'doubtful', i: 'injured', s: 'suspended', u: 'unavailable', n: 'not in the squad' };
export function statusLabel(s: string | null | undefined): string {
  return STATUS[s ?? 'a'] ?? s ?? 'available';
}

/** Teams whose next-5 projected goals moved, biggest first; none when nothing moved. */
export function movedTeams(rows: Next5Team[], min = 0.05): Next5Team[] {
  return rows.filter((r) => Math.abs(r.for_change) >= min || Math.abs(r.against_change) >= min);
}
