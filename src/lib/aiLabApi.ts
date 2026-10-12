// ============================================================================
// src/lib/aiLabApi.ts
//
// Data layer for /admin/ai-lab (docs/ai-lab/design.md). Runs go through the
// ai-lab-run Edge Function, which holds the Anthropic key and writes the run,
// its tool calls, the ground truth and the automatic checks. Everything else
// here reads or writes the admin-only ai_* tables directly (RLS: is_admin()).
// ============================================================================

import { supabase } from './supabase';

// These tables are newer than the generated types, so the typed client
// can't name them; the row shapes below are the contract.
const db = supabase as unknown as { from: (t: string) => any };

export const AI_MODELS = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
] as const;

export type BenchmarkQuestion = {
  question_id: string;
  category: string;
  question: string;
  difficulty: number;
  expected_behaviour: string;
  must_include: string[];
  must_not_claim: string[];
  answerable_now: boolean;
  answerability_note: string | null;
  experiments: string[];
  version: number;
};

export type PromptVersion = { prompt_id: string; notes: string | null; body: string; created_at: string };

export type Fact = { value: string; meaning: string; tool: string };

export type AiRun = {
  run_id: number;
  batch_id: number | null;
  question_id: string | null;
  question_version: number | null;
  question: string;
  provider: string;
  model: string;
  prompt_id: string;
  toolset_version: string;
  answer: string | null;
  answer_type: 'answered' | 'partial' | 'refused' | null;
  facts_used: Fact[] | null;
  stop_reason: string | null;
  rounds: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | string | null;
  latency_ms: number | null;
  error: string | null;
  created_at?: string;
};

export type RunStep = {
  step_no: number;
  tool_name: string;
  arguments: Record<string, unknown> | null;
  result: unknown;
  latency_ms: number | null;
  error: string | null;
};

export type Check = { pass: boolean; detail: string };
export type Grade = { checks: Record<string, Check>; passed: number; total: number };

export type Review = {
  factually_correct: 'yes' | 'unsure' | 'no' | null;
  usefulness: number | null;
  unsupported_claims: string | null;
  comment: string | null;
  ideal_answer: string | null;
};

export type RunDetail = { run: AiRun; steps: RunStep[]; truth: unknown; grade: Grade | null; review: Review | null };

export type Batch = {
  batch_id: number;
  name: string;
  model: string;
  prompt_id: string;
  toolset_version: string;
  question_ids: string[];
  as_of: string;
  status: string;
};

/** A run can have grades from several graders (checks_v1, checks_v2, ...);
 * show the newest one. */
function latestGrade(grades: any[] | null | undefined): any {
  if (!grades || grades.length === 0) return null;
  return [...grades].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0];
}

function fail(error: { message?: string } | null, what: string): never {
  throw new Error(`${what}: ${error?.message ?? 'unknown error'}`);
}

export async function getBenchmarkQuestions(): Promise<BenchmarkQuestion[]> {
  const { data, error } = await db
    .from('ai_benchmark_questions')
    .select('question_id, category, question, difficulty, expected_behaviour, must_include, must_not_claim, answerable_now, answerability_note, experiments, version')
    .eq('is_active', true)
    .order('question_id');
  if (error) fail(error, 'Could not load the benchmark');
  return data ?? [];
}

export async function getPromptVersions(): Promise<PromptVersion[]> {
  const { data, error } = await db.from('ai_prompt_versions').select('*').order('created_at');
  if (error) fail(error, 'Could not load prompts');
  return data ?? [];
}

export async function getRecentRuns(limit = 40): Promise<(AiRun & { passed: number | null; total: number | null })[]> {
  const { data, error } = await db
    .from('ai_runs')
    .select('*, ai_auto_grades(passed, total, created_at)')
    .order('run_id', { ascending: false })
    .limit(limit);
  if (error) fail(error, 'Could not load runs');
  return (data ?? []).map((r: any) => ({ ...r, passed: latestGrade(r.ai_auto_grades)?.passed ?? null, total: latestGrade(r.ai_auto_grades)?.total ?? null }));
}

export async function getRunDetail(runId: number): Promise<RunDetail> {
  const [run, steps, truth, grade, review] = await Promise.all([
    db.from('ai_runs').select('*').eq('run_id', runId).single(),
    db.from('ai_run_steps').select('*').eq('run_id', runId).order('step_no'),
    db.from('ai_run_truth').select('truth').eq('run_id', runId).maybeSingle(),
    db.from('ai_auto_grades').select('checks, passed, total').eq('run_id', runId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    getMyReview(runId),
  ]);
  if (run.error) fail(run.error, 'Could not load the run');
  return { run: run.data, steps: steps.data ?? [], truth: truth.data?.truth ?? null, grade: grade.data ?? null, review };
}

async function getMyReview(runId: number): Promise<Review | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;
  const { data } = await db.from('ai_human_reviews').select('*').eq('run_id', runId).eq('reviewer_id', u.user.id).maybeSingle();
  return data ?? null;
}

export async function saveReview(runId: number, review: Review): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) throw new Error('Sign in to review');
  const { error } = await db
    .from('ai_human_reviews')
    .upsert({ run_id: runId, reviewer_id: u.user.id, ...review }, { onConflict: 'run_id,reviewer_id' });
  if (error) fail(error, 'Could not save the review');
}

/** Runs one question through the ai-lab-run Edge Function. */
export async function runQuestion(opts: {
  question?: string;
  question_id?: string;
  model: string;
  prompt_id: string;
  batch_id?: number;
}): Promise<{ run_id: number }> {
  const { data, error } = await supabase.functions.invoke('ai-lab-run', { body: opts });
  if (error) {
    // The function's own {error} body is on error.context (the fetch Response).
    const context = (error as any)?.context;
    if (context && typeof context.text === 'function') {
      try {
        const body = JSON.parse(await context.text());
        if (body?.error) throw new Error(body.error);
      } catch (e) {
        if (e instanceof Error && e.message && !(e instanceof SyntaxError)) throw e;
      }
    }
    throw new Error(typeof (error as any)?.message === 'string' ? (error as any).message : 'Could not reach the AI Lab function');
  }
  if (data?.error) throw new Error(data.error);
  return { run_id: data.run_id };
}

/** Queues a batch on the server (ai_lab_enqueue_batch). A pg_cron job sends
 * the questions to ai-lab-run a few a minute, so the page can be closed. */
export async function enqueueBatch(b: { name: string; model: string; prompt_id: string; question_ids: string[] }): Promise<number> {
  const { data, error } = await (supabase as any).rpc('ai_lab_enqueue_batch', {
    p_name: b.name, p_model: b.model, p_prompt_id: b.prompt_id, p_question_ids: b.question_ids,
  });
  if (error) fail(error, 'Could not queue the batch');
  return data as number;
}

export type BatchSummary = Batch & {
  runs: number;
  cost: number;
  checks_passed: number;
  checks_total: number;
  items: { done: number; failed: number; waiting: number };
};

export async function getBatches(): Promise<BatchSummary[]> {
  const { data, error } = await db
    .from('ai_batches')
    .select('*, ai_runs(cost_usd, ai_auto_grades(passed, total, created_at)), ai_batch_items(status)')
    .order('batch_id', { ascending: false })
    .limit(20);
  if (error) fail(error, 'Could not load batches');
  return (data ?? []).map((b: any) => {
    const runs = b.ai_runs ?? [];
    const items: { status: string }[] = b.ai_batch_items ?? [];
    return {
      ...b,
      runs: runs.length,
      cost: runs.reduce((a: number, r: any) => a + Number(r.cost_usd ?? 0), 0),
      checks_passed: runs.reduce((a: number, r: any) => a + (latestGrade(r.ai_auto_grades)?.passed ?? 0), 0),
      checks_total: runs.reduce((a: number, r: any) => a + (latestGrade(r.ai_auto_grades)?.total ?? 0), 0),
      items: {
        done: items.filter((i) => i.status === 'done').length,
        failed: items.filter((i) => i.status === 'failed').length,
        waiting: items.filter((i) => i.status === 'queued' || i.status === 'sent').length,
      },
    };
  });
}

/** One entry per run in a batch (latest run per question), with what the
 * review screen needs: answer, facts, checks, truth and my review. */
export type ReviewItem = RunDetail & { reviewed: boolean };

export async function getBatchForReview(batchId: number): Promise<ReviewItem[]> {
  const { data: u } = await supabase.auth.getUser();
  const uid = u?.user?.id ?? null;
  const { data, error } = await db
    .from('ai_runs')
    .select('*, ai_run_steps(*), ai_run_truth(truth), ai_auto_grades(checks, passed, total, created_at), ai_human_reviews(*)')
    .eq('batch_id', batchId)
    .order('question_id')
    .order('run_id', { ascending: false });
  if (error) fail(error, 'Could not load the batch');
  const seen = new Set<string>();
  const out: ReviewItem[] = [];
  for (const r of (data ?? []) as any[]) {
    const key = r.question_id ?? `run-${r.run_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const { ai_run_steps, ai_run_truth, ai_auto_grades, ai_human_reviews, ...run } = r;
    const truthRow = Array.isArray(ai_run_truth) ? ai_run_truth[0] : ai_run_truth;
    const mine = (ai_human_reviews ?? []).find((h: any) => h.reviewer_id === uid) ?? null;
    out.push({
      run,
      steps: [...(ai_run_steps ?? [])].sort((a: RunStep, b: RunStep) => a.step_no - b.step_no),
      truth: truthRow?.truth ?? null,
      grade: latestGrade(ai_auto_grades),
      review: mine,
      reviewed: !!mine?.factually_correct,
    });
  }
  return out;
}

export function formatCost(usd: number | string | null | undefined): string {
  const v = Number(usd ?? 0);
  return `$${v < 0.1 ? v.toFixed(4) : v.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Ask FixtureShark (/admin/ask): admin-only trial of a plain question box.
// Every question is a free-text run filed under one standing batch (created
// by migration 20261011213000), so the answers also appear in the AI Lab
// Review tab and its batch table shows the running cost.
// ---------------------------------------------------------------------------

export const ASK_BATCH_NAME = 'Ask FixtureShark';
export const ASK_MODEL = 'claude-sonnet-5';
export const ASK_PROMPT = 'analyst_v2';

export async function getAskBatchId(): Promise<number | null> {
  const { data, error } = await db
    .from('ai_batches')
    .select('batch_id')
    .eq('name', ASK_BATCH_NAME)
    .order('batch_id')
    .limit(1)
    .maybeSingle();
  if (error) fail(error, 'Could not find the Ask FixtureShark log');
  return data?.batch_id ?? null;
}

export async function askQuestion(question: string, batchId: number | null): Promise<{ run_id: number }> {
  return runQuestion({ question, model: ASK_MODEL, prompt_id: ASK_PROMPT, ...(batchId != null ? { batch_id: batchId } : {}) });
}

/** Where an answer's data came from, in words a reader understands, with the
 * FixtureShark page that shows the same data. */
export const TOOL_SOURCES: Record<string, { label: string; kind: 'data' | 'model'; to?: string }> = {
  get_fixtures: { label: 'Fixtures', kind: 'data', to: '/fixtures' },
  get_results: { label: 'Results', kind: 'data', to: '/fixtures' },
  get_league_table: { label: 'League table', kind: 'data', to: '/table' },
  get_competition_summary: { label: 'Season totals', kind: 'data', to: '/table' },
  get_fpl_players: { label: 'Official FPL player data', kind: 'data', to: '/fpl/player-scout' },
  get_fpl_projections: { label: 'FixtureShark projected points', kind: 'model', to: '/fpl' },
  get_club_accounts: { label: 'Club accounts (Companies House)', kind: 'data', to: '/finance' },
  get_tv_listings: { label: 'TV listings', kind: 'data', to: '/tv-guide' },
  get_data_status: { label: 'Data coverage and freshness', kind: 'data', to: '/data-health' },
  compare_fixture_runs: { label: 'Fixture difficulty (FDR and FixtureShark goal models)', kind: 'model', to: '/fixtures' },
  best_fpl_combination: { label: 'FixtureShark projected points (best combination search)', kind: 'model', to: '/fpl' },
  compare_fpl_players: { label: 'FPL data and FixtureShark projections, side by side', kind: 'model', to: '/fpl' },
};

/** Distinct data sources an answer used, in the order first called. Name
 * look-ups and the final submit are plumbing, not sources. */
export function sourcesUsed(steps: { tool_name: string; error?: string | null }[]): { tool: string; label: string; kind: 'data' | 'model'; to?: string }[] {
  const seen = new Set<string>();
  const out: { tool: string; label: string; kind: 'data' | 'model'; to?: string }[] = [];
  for (const s of steps) {
    if (s.error || seen.has(s.tool_name) || s.tool_name === 'submit_answer' || s.tool_name === 'find_entity') continue;
    seen.add(s.tool_name);
    const src = TOOL_SOURCES[s.tool_name] ?? { label: s.tool_name.replace(/_/g, ' '), kind: 'data' as const };
    out.push({ tool: s.tool_name, ...src });
  }
  return out;
}

// ---------------------------------------------------------------------------
// AI credit estimate (migration 20261012050000). Anthropic has no API for the
// remaining prepaid balance, so: the balance Chris last copied from the
// Console, minus everything recorded as spent since (site answers in ai_runs
// plus GitHub eval runs in ai_external_spend).
// ---------------------------------------------------------------------------

export const ANTHROPIC_BILLING_URL = 'https://platform.claude.com/settings/billing';

export type CreditSummary = {
  month_site_usd: number;
  month_external_usd: number;
  monthly_limit_usd: number;
  last_check: { balance_usd: number; checked_at: string; spent_since_usd: number; estimate_left_usd: number } | null;
};

export async function getCreditSummary(): Promise<CreditSummary> {
  const { data, error } = await (supabase as any).rpc('ai_credit_summary');
  if (error) fail(error, 'Could not load the AI credit estimate');
  return data as CreditSummary;
}

export async function saveCreditCheck(balanceUsd: number): Promise<void> {
  if (!Number.isFinite(balanceUsd) || balanceUsd < 0) throw new Error('Enter the balance in dollars, e.g. 18.40');
  const { error } = await db.from('ai_credit_checks').insert({ balance_usd: Math.round(balanceUsd * 100) / 100 });
  if (error) fail(error, 'Could not save the balance');
}
