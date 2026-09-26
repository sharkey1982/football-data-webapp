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
    .select('*, ai_auto_grades(passed, total)')
    .order('run_id', { ascending: false })
    .limit(limit);
  if (error) fail(error, 'Could not load runs');
  return (data ?? []).map((r: any) => ({ ...r, passed: r.ai_auto_grades?.[0]?.passed ?? null, total: r.ai_auto_grades?.[0]?.total ?? null }));
}

export async function getRunDetail(runId: number): Promise<RunDetail> {
  const [run, steps, truth, grade, review] = await Promise.all([
    db.from('ai_runs').select('*').eq('run_id', runId).single(),
    db.from('ai_run_steps').select('*').eq('run_id', runId).order('step_no'),
    db.from('ai_run_truth').select('truth').eq('run_id', runId).maybeSingle(),
    db.from('ai_auto_grades').select('checks, passed, total').eq('run_id', runId).eq('grader', 'checks_v1').maybeSingle(),
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

export async function createBatch(b: { name: string; model: string; prompt_id: string; question_ids: string[] }): Promise<Batch> {
  const { data, error } = await db
    .from('ai_batches')
    .insert({ ...b, provider: 'anthropic', toolset_version: 'ai_tools_v1' })
    .select('*')
    .single();
  if (error) fail(error, 'Could not create the batch');
  return data;
}

export async function finishBatch(batchId: number): Promise<void> {
  const { error } = await db.from('ai_batches').update({ status: 'finished', finished_at: new Date().toISOString() }).eq('batch_id', batchId);
  if (error) fail(error, 'Could not close the batch');
}

export async function getBatches(): Promise<(Batch & { runs: number; cost: number; checks_passed: number; checks_total: number })[]> {
  const { data, error } = await db
    .from('ai_batches')
    .select('*, ai_runs(cost_usd, ai_auto_grades(passed, total))')
    .order('batch_id', { ascending: false })
    .limit(20);
  if (error) fail(error, 'Could not load batches');
  return (data ?? []).map((b: any) => {
    const runs = b.ai_runs ?? [];
    return {
      ...b,
      runs: runs.length,
      cost: runs.reduce((a: number, r: any) => a + Number(r.cost_usd ?? 0), 0),
      checks_passed: runs.reduce((a: number, r: any) => a + (r.ai_auto_grades?.[0]?.passed ?? 0), 0),
      checks_total: runs.reduce((a: number, r: any) => a + (r.ai_auto_grades?.[0]?.total ?? 0), 0),
    };
  });
}

export function formatCost(usd: number | string | null | undefined): string {
  const v = Number(usd ?? 0);
  return `$${v < 0.1 ? v.toFixed(4) : v.toFixed(2)}`;
}
