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

export type ThemeKey = 'goals' | 'minutes' | 'incidents' | 'set_pieces' | 'captaincy';
export type Verdict = { head: string; rest: string };
export type TeamGoals = { team: string; opp: string; home: boolean; exp: number; xg: number | null; goals: number };
export type RatingMove = {
  team: string; att_before: number; att_now: number; def_before: number; def_now: number;
  for5_before: number | null; for5_now: number | null; against5_before: number | null; against5_now: number | null; size: number;
};
export type StatusChange = PlayerRef & { before: string | null; now: string | null; news: string | null };
export type CupGame = {
  team: string; comp: string; date: string; opp: string; home: boolean;
  league_date: string; league_opp: string; league_home: boolean; rest: number;
};
export type CupWindow = { gw: number; teams: number; comps: string[]; from: string; to: string };
export type RotationGroup = { teams: number; players: number; expected: number; started: number };
export type CaptainRange = PlayerRef & {
  tag: string; p10: number; p50: number; p90: number; mean: number; p_blank: number; p_haul: number; pts: number;
};
export type CaptainApproach = {
  key: 'premium' | 'form' | 'last' | 'best' | 'model';
  label: string; definition: string; weeks: number; points: number; captain_points: number;
  beat_premium: number | null; premium_same_weeks?: number;
  mean: number | null; sd: number | null; worst: number | null; best: number | null; blanks: number; hauls: number;
};

export type ReflectionPayload = {
  kind: 'reflection';
  season: string;
  gw: number;
  deadline: string;
  generated_at: string;
  gameweek_finished: boolean;
  bonus_confirmed: boolean;
  prices_in: boolean;
  average: number | null;
  headlines: string[];
  verdicts: Record<ThemeKey, Verdict>;
  model_summary: {
    automatic: { theme: ThemeKey; text: string }[];
    method: { date: string; area: string; title: string }[];
    considering: { theme: ThemeKey; text: string }[];
  };
  goals: {
    matches: MatchGoals[];
    expected_from: string;
    season: SeasonTeam[];
    next5: Next5Team[];
    next5_from: string;
    next5_gws: [number, number];
    teams: TeamGoals[];
    totals: { matches: number; goals: number; expected: number; xg: number | null };
    ratings: { status: 'updated' | 'pending'; moves: RatingMove[]; deadline: string };
  };
  minutes: {
    brier: number | null;
    players: number;
    counts: { absences: number; absences_flagged: number; starters: number; early_subs: number; line_changes: number; side_changes: number; start_moves: number };
    surprise_starters: (PlayerRef & { p: number; minutes: number; pts: number })[];
    surprise_absences: (PlayerRef & { p: number; flagged: boolean; news: string | null; minutes: number })[];
    early_subs: (PlayerRef & { xmin: number; minutes: number })[];
    positions: (PlayerRef & { model_role: string; played_role: string; kind?: 'line' | 'side' })[];
    lineups_covered: number;
    fixtures: number;
    next_gw: number;
    next_gw_moves: (PlayerRef & { before: number; now: number; change: number; reason: string })[];
  };
  incidents: {
    worse: StatusChange[];
    better: StatusChange[];
    worse_count: number;
    better_count: number;
    red_cards: PlayerRef[];
    prices: (PlayerRef & { before: number; now: number })[];
    price_count: number;
    congestion: {
      before_gw?: CupGame[];
      next_gw?: number;
      before_next?: CupGame[];
      later?: CupWindow[];
      ahead?: CupWindow[];
      days_since_previous?: number | null;
    };
    rotation?: { busy: RotationGroup; rest: RotationGroup } | null;
  };
  set_pieces: {
    order_changes: {
      team: string; type: string; before: string[]; now: string[];
      model: { type: string; name: string }[]; model_agrees: string[]; needs_review: boolean;
    }[];
    penalties_missed: (PlayerRef & { count: number })[];
    model_mismatches: { team: string; fpl: string[]; model: string }[];
    penalty_teams_compared: number;
    hierarchy_updated: string | null;
    note: string;
  };
  captaincy: {
    weeks: {
      gw: number;
      premium: (PlayerRef & { pts: number }) | null;
      form: (PlayerRef & { pts: number }) | null;
      last?: (PlayerRef & { pts: number }) | null;
      model: (PlayerRef & { pts: number }) | null;
      best: (PlayerRef & { pts: number }) | null;
      average: number | null;
    }[];
    season: CaptainApproach[];
    span: [number, number] | null;
    ranges: CaptainRange[];
    blank_at: number;
    haul_at: number;
    context: { top_pick_blank_rate: number; top_pick_best_rate: number; seasons: string; article: string; haaland_article: string };
  };
  checks?: Record<string, unknown>;
};

export type PreviewPlayer = PlayerRef & {
  price: number | null; gw_xpts: number; xpts_5: number; xpts_10: number;
  start: number; xmin: number; fixtures: number; status: string; news: string | null;
};

export type PreviewPayload = {
  kind: 'preview';
  season: string;
  gw: number;
  frozen: boolean;
  deadline: string;
  generated_at: string;
  source: string;
  headlines: string[];
  changes_since_last?: string[];
  fixtures: {
    home: string; away: string; kickoff: string | null;
    goals_home: number | null; goals_away: number | null; cs_home: number | null; cs_away: number | null;
    fdr_home: number | null; fdr_away: number | null;
  }[];
  captains: (PreviewPlayer & { top_chance: number | null })[];
  sim_worlds: number;
  picks: Record<'GK' | 'DEF' | 'MID' | 'FWD', PreviewPlayer[]>;
  value: (PreviewPlayer & { per_m: number })[];
  differentials: PreviewPlayer[];
  minutes_watch: (PreviewPlayer & { why: string })[];
  fixture_run: {
    team: string; for_5: number; against_5: number; for_10: number; against_10: number;
    weeks: { gw: number; fixtures: { opp: string; home: boolean; for: number; against: number }[] }[];
  }[];
  congestion?: { before_gw: CupGame[]; ahead: CupWindow[]; days_since_previous: number | null };
  changes: {
    since_gw: number;
    injuries: (PlayerRef & { before: string | null; now: string | null; news: string | null })[];
    prices: (PlayerRef & { before: number; now: number })[];
    set_pieces: { team: string; type: string; before: string[]; now: string[] }[];
    model_changes: { date: string; area: string; title: string }[];
    blanks: string[];
    doubles: string[];
  };
};

export type ReportPayload = ReflectionPayload | PreviewPayload;

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
