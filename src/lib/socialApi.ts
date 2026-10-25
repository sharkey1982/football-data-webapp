// ============================================================================
// src/lib/socialApi.ts
//
// Data layer for /admin/social (docs/social-publishing.md). Reads the
// admin-only social_* tables (RLS: is_admin()); every change goes through a
// database function that checks admin and writes the audit log, or through
// the x-oauth-start / x-publish Edge Functions. Nothing here can publish on
// its own: a live post needs the kill switch off, live publishing on, a
// connected @FixtureSharkHQ and an approved candidate, all checked server-side.
// ============================================================================

import { supabase } from './supabase';

// Newer than the generated types; the row shapes below are the contract.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped tables, shapes below
const db = supabase as unknown as { from: (t: string) => any; rpc: (f: string, a?: Record<string, unknown>) => any };

export type PostType = 'fpl_captaincy' | 'team_xg_change' | 'prediction_accuracy' | 'historical_insight' | 'announcement'
  | 'fpl_price_changes' | 'gameweek_thread' | 'fpl_availability' | 'fpl_market' | 'fpl_week_changes' | 'gameweek_outlook' | 'fixture_moved'
  | 'match_predictions' | 'quiz' | 'quiz_answer' | 'fact' | 'daily_market';
export const POST_TYPE_LABEL: Record<PostType, string> = {
  fpl_captaincy: 'FPL captaincy',
  fpl_price_changes: 'FPL price changes',
  gameweek_thread: 'Gameweek thread',
  fpl_availability: 'FPL availability',
  fpl_market: 'FPL market watch',
  fpl_week_changes: "FPL week's changes",
  gameweek_outlook: 'The week ahead',
  fixture_moved: 'Fixture moved',
  match_predictions: 'Match-day predictions',
  daily_market: 'Daily market view',
  quiz: 'Quiz question',
  quiz_answer: 'Quiz answer',
  fact: 'Did you know',
  team_xg_change: 'Team xG change',
  prediction_accuracy: 'Prediction accuracy',
  historical_insight: 'Historical insight',
  announcement: 'Announcement',
};

export type Check = { check: string; ok: boolean; detail?: unknown };

export type Candidate = {
  candidate_id: number;
  post_type: PostType;
  text: string;
  generated_text: string;
  source_data: Record<string, unknown> & { checks?: Check[] };
  model_version: string | null;
  snapshot_at: string;
  expires_at: string;
  validation_status: 'passed' | 'failed' | 'stale';
  validation_errors: string[];
  approval_status: 'pending' | 'approved' | 'rejected' | 'superseded';
  approved_at: string | null;
  rejected_reason: string | null;
  scheduled_for: string | null;
  publication_status: 'unpublished' | 'publishing' | 'published' | 'failed' | 'needs_check';
  x_post_id: string | null;
  published_at: string | null;
  publish_attempts: number;
  last_error: string | null;
  created_at: string;
  /** Phase 4: queued for automatic posting at hold_until unless held. */
  thread?: string[] | null;
  auto?: boolean;
  hold_until?: string | null;
  held?: boolean;
  notified_at?: string | null;
  x_post_ids?: string[] | null;
};

export type Settings = {
  kill_switch: boolean;
  live_enabled: boolean;
  auto_publish_enabled: boolean;
  detector_enabled: boolean;
  allowed_x_username: string;
  max_posts_per_day: number;
  max_posts_per_month: number;
  min_minutes_between_posts: number;
  monthly_budget_usd: number;
  cost_per_post_usd: number;
  cost_per_post_with_url_usd: number;
  allow_urls: boolean;
  max_live_attempts: number;
  updated_at: string;
  hold_minutes?: number;
  max_links_per_week?: number;
  auto_post_types?: PostType[];
  post_hours_from?: number;
  post_hours_to?: number;
  breaker_tripped_at?: string | null;
  breaker_reason?: string | null;
};

export type Connection = {
  status: 'disconnected' | 'connected' | 'error';
  x_username: string | null;
  scopes: string | null;
  connected_at: string | null;
  access_expires_at: string | null;
  last_refreshed_at: string | null;
  last_error: string | null;
};

export type WeekRow = {
  week_start: string; post_type: PostType; generated: number; passed_checks: number; approved: number; rejected: number;
  superseded: number; published: number; failed: number; dry_runs: number; live_attempts: number; blocked: number; spend_usd: number;
};

export type DetectorRun = {
  run_id: number; started_at: string; finished_at: string | null; triggered_by: string;
  candidates_created: number; results: Record<string, { status: string; reason?: string; checks?: Check[]; fixtures?: unknown[]; streaks?: unknown[] }>;
};

export type AuditRow = { audit_id: number; at: string; action: string; candidate_id: number | null; detail: Record<string, unknown> };

export type PublishResult = {
  ok: boolean; mode: 'dry_run' | 'live'; reasons?: string[]; text?: string; would_post?: { text: string };
  estimated_cost_usd?: number; outcome?: string; x_post_id?: string; url?: string;
};

function fail(error: { message?: string } | null, what: string): never {
  throw new Error(`${what}: ${error?.message ?? 'unknown error'}`);
}

export async function getSocialState(): Promise<{ settings: Settings; connection: Connection; candidates: Candidate[]; weeks: WeekRow[]; runs: DetectorRun[]; audit: AuditRow[] }> {
  const [s, c, cand, w, r, a] = await Promise.all([
    db.from('social_settings').select('*').maybeSingle(),
    db.from('social_x_connection').select('status, x_username, scopes, connected_at, access_expires_at, last_refreshed_at, last_error').maybeSingle(),
    db.from('social_post_candidates').select('*').order('created_at', { ascending: false }).limit(200),
    db.from('social_weekly_report').select('*').order('week_start', { ascending: false }).limit(60),
    db.from('social_detector_runs').select('*').order('started_at', { ascending: false }).limit(10),
    db.from('social_audit_log').select('audit_id, at, action, candidate_id, detail').order('at', { ascending: false }).limit(50),
  ]);
  for (const [res, what] of [[s, 'settings'], [c, 'connection'], [cand, 'candidates'], [w, 'weekly report'], [r, 'detector runs'], [a, 'audit log']] as const) {
    if (res.error) fail(res.error, `Could not load ${what}`);
  }
  return { settings: s.data, connection: c.data, candidates: cand.data ?? [], weeks: w.data ?? [], runs: r.data ?? [], audit: a.data ?? [] };
}

export async function review(candidateId: number, action: 'approve' | 'reject' | 'edit' | 'schedule' | 'unschedule',
                             opts: { text?: string; reason?: string; scheduledFor?: string | null } = {}): Promise<{ ok: boolean; errors?: string[] }> {
  const { data, error } = await db.rpc('social_review', {
    p_candidate_id: candidateId, p_action: action, p_text: opts.text ?? null, p_reason: opts.reason ?? null, p_scheduled_for: opts.scheduledFor ?? null,
  });
  if (error) fail(error, 'Could not save');
  return data;
}

/** Stop (or release) an automatic post before it goes out. */
export async function hold(candidateId: number, on: boolean): Promise<void> {
  const { error } = await db.rpc('social_hold', { p_candidate_id: candidateId, p_hold: on });
  if (error) fail(error, on ? 'Could not hold' : 'Could not release');
}

export async function updateSettings(change: Partial<Settings> & { reset_breaker?: boolean }): Promise<void> {
  const { error } = await db.rpc('social_update_settings', { p: change });
  if (error) fail(error, 'Could not save settings');
}

export async function runDetectors(): Promise<{ run_id: number; candidates_created: number }> {
  const { data, error } = await db.rpc('social_run_detectors', { p_triggered_by: 'admin' });
  if (error) fail(error, 'Could not run the detectors');
  return data;
}

export async function resolveNeedsCheck(candidateId: number, xPostId: string | null): Promise<void> {
  const { error } = await db.rpc('social_resolve_needs_check', { p_candidate_id: candidateId, p_x_post_id: xPostId });
  if (error) fail(error, 'Could not save');
}

export async function disconnectX(): Promise<void> {
  const { error } = await db.rpc('social_x_disconnect');
  if (error) fail(error, 'Could not disconnect');
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // The function's own {error} body is on error.context (the fetch Response).
    const e = error as { message?: unknown; context?: { text?: () => Promise<string> } };
    if (typeof e.context?.text === 'function') {
      try {
        const b = JSON.parse(await e.context.text()) as { error?: string };
        if (b?.error) throw new Error(b.error);
      } catch (x) {
        if (x instanceof Error && x.message && !(x instanceof SyntaxError)) throw x;
      }
    }
    throw new Error(typeof e.message === 'string' ? e.message : `Could not reach ${name}`);
  }
  const err = (data as { error?: unknown } | null)?.error;
  if (typeof err === 'string') throw new Error(err);
  return data as T;
}

/** X's authorise page for @FixtureSharkHQ (PKCE, single-use state). */
export async function startXConnect(): Promise<string> {
  const r = await invoke<{ authorize_url: string }>('x-oauth-start', {});
  return r.authorize_url;
}

export function publish(candidateId: number, mode: 'dry_run' | 'live'): Promise<PublishResult> {
  return invoke<PublishResult>('x-publish', { candidate_id: candidateId, mode });
}

/** X's weighted length (URLs 23, wide characters 2); mirrors social_weighted_length. */
export function weightedLength(text: string): number {
  const s = text.replace(/https?:\/\/\S+/g, 'x'.repeat(23));
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const light = cp <= 0x10ff || (cp >= 0x2000 && cp <= 0x200d) || (cp >= 0x2010 && cp <= 0x201f) || (cp >= 0x2032 && cp <= 0x2037);
    n += light ? 1 : 2;
  }
  return n;
}

/** Numbers in the text that are not in the generated text (an edit may not add any). */
export function addedNumbers(text: string, generated: string): string[] {
  const nums = (t: string) => t.match(/[0-9]+(?:\.[0-9]+)?/g) ?? [];
  const allowed = new Set(nums(generated));
  return [...new Set(nums(text).filter((n) => !allowed.has(n)))];
}

export const X_RESULT_MESSAGE: Record<string, string> = {
  connected: 'Connected @FixtureSharkHQ.',
  wrong_account: 'That was not @FixtureSharkHQ. Nothing was saved and its access was revoked. Sign in to X as @FixtureSharkHQ (a private window helps) and try again.',
  scopes: 'X did not grant exactly the permissions asked for. Nothing was saved.',
  denied: 'Authorisation was cancelled on X.',
  bad_state: 'The authorisation link had expired or was already used. Start again.',
  bad_request: 'X sent back an incomplete response. Start again.',
  exchange_failed: 'X did not accept the authorisation code. Check the client ID, secret and callback URL.',
  identify_failed: 'Could not confirm which account was authorised. Nothing was saved.',
  not_configured: 'X_CLIENT_ID and X_CLIENT_SECRET are not set as Edge Function secrets.',
  save_failed: 'Could not save the connection.',
};

// ---- Engagement (x-metrics; social_metrics_report) -------------------------
export type MetricsTypeRow = {
  post_type: PostType; posts: number; median_impressions: number | null; median_engagements: number | null;
  engagement_rate: number | null; likes: number | null; replies: number | null; reposts: number | null; url_clicks: number | null;
};
export type MetricsPostRow = {
  candidate_id: number; post_type: PostType; published_at: string; text: string; x_post_id: string;
  impressions: number | null; engagements: number; rate: number | null;
};
export type MetricsRun = {
  run_id: number; started_at: string; finished_at: string | null; triggered_by: string; posts_requested: number;
  posts_read: number; posts_missing: number; fields: string | null; estimated_cost_usd: number; error: string | null;
};
export type MetricsReport = {
  types: MetricsTypeRow[]; top: MetricsPostRow[]; bottom: MetricsPostRow[];
  settled_posts: number; fresh_posts: number; last_run: MetricsRun | null;
};

/** Per post type engagement, from the latest read of posts at least 24 hours old. */
export async function getMetricsReport(): Promise<MetricsReport> {
  const { data, error } = await db.rpc('social_metrics_report');
  if (error) fail(error, 'Could not load engagement');
  return data as MetricsReport;
}

/** Read the last 30 days' posts from X now (at most 300, about $0.001 each). */
export async function readMetricsNow(): Promise<{ posts_read: number; posts_missing: number; estimated_cost_usd: number }> {
  return invoke('x-metrics', { triggered_by: 'admin' });
}
