// ============================================================================
// src/pages/admin/AiLabPage.tsx   (/admin/ai-lab)
//
// The AI Lab console (docs/ai-lab/design.md). Deliberately a developer view,
// not a chat window: for every run it shows the question, the configuration,
// each tool the model called with the exact data returned, the answer and the
// facts it says it used, tokens and cost, the ground truth captured at run
// time, the automatic checks, and a review form.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import {
  AI_MODELS,
  createBatch,
  finishBatch,
  formatCost,
  getBatches,
  getBenchmarkQuestions,
  getPromptVersions,
  getRecentRuns,
  getRunDetail,
  runQuestion,
  saveReview,
  type AiRun,
  type Batch,
  type BenchmarkQuestion,
  type PromptVersion,
  type Review,
  type RunDetail,
} from '../../lib/aiLabApi';

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

function Json({ value }: { value: unknown }) {
  return (
    <pre className="text-[11px] leading-snug bg-chalk-100 border border-chalk-300 rounded p-2 overflow-x-auto max-h-80 whitespace-pre-wrap break-words">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-chalk-300 rounded-lg bg-white p-3 space-y-2">
      <h2 className="text-sm font-medium text-ink-700">{title}</h2>
      {children}
    </section>
  );
}

function ReviewForm({ runId, initial }: { runId: number; initial: Review | null }) {
  const [r, setR] = useState<Review>(
    initial ?? { factually_correct: null, usefulness: null, unsupported_claims: null, comment: null, ideal_answer: null },
  );
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setR(initial ?? { factually_correct: null, usefulness: null, unsupported_claims: null, comment: null, ideal_answer: null });
    setMsg(null);
  }, [runId, initial]);

  async function save() {
    setMsg(null);
    try {
      await saveReview(runId, r);
      setMsg('Saved.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save');
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ink-700">Factually correct?</span>
        {(['yes', 'unsure', 'no'] as const).map((v) => (
          <label key={v} className="flex items-center gap-1">
            <input type="radio" name={`fc-${runId}`} checked={r.factually_correct === v} onChange={() => setR({ ...r, factually_correct: v })} />
            {v === 'yes' ? 'Yes' : v === 'unsure' ? 'Unsure' : 'No'}
          </label>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-ink-700">Usefulness</span>
        {[1, 2, 3, 4, 5].map((v) => (
          <label key={v} className="flex items-center gap-1">
            <input type="radio" name={`u-${runId}`} checked={r.usefulness === v} onChange={() => setR({ ...r, usefulness: v })} />
            {v}
          </label>
        ))}
      </div>
      <label className="block">
        <span className="text-ink-700">Unsupported or misleading claims</span>
        <textarea className="w-full border border-chalk-300 rounded p-1 text-sm" rows={2} value={r.unsupported_claims ?? ''}
          onChange={(e) => setR({ ...r, unsupported_claims: e.target.value || null })} />
      </label>
      <label className="block">
        <span className="text-ink-700">Comment</span>
        <textarea className="w-full border border-chalk-300 rounded p-1 text-sm" rows={2} value={r.comment ?? ''}
          onChange={(e) => setR({ ...r, comment: e.target.value || null })} />
      </label>
      <label className="block">
        <span className="text-ink-700">Ideal answer (optional)</span>
        <textarea className="w-full border border-chalk-300 rounded p-1 text-sm" rows={2} value={r.ideal_answer ?? ''}
          onChange={(e) => setR({ ...r, ideal_answer: e.target.value || null })} />
      </label>
      <div className="flex items-center gap-2">
        <button type="button" onClick={save} className="px-3 py-1 rounded bg-ink-900 text-white text-sm">Save review</button>
        {msg && <span className="text-xs text-ink-500">{msg}</span>}
      </div>
    </div>
  );
}

function RunView({ d }: { d: RunDetail }) {
  const { run, steps, truth, grade } = d;
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <Section title={`Run ${run.run_id}${run.question_id ? ` · ${run.question_id}` : ''}`}>
        <p className="text-sm text-ink-900">{run.question}</p>
        <p className="text-xs text-ink-500 font-mono">
          {run.model} · {run.prompt_id} · {run.toolset_version}
          {run.batch_id ? ` · batch ${run.batch_id}` : ''} · {when(run.created_at)}
        </p>
        <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
          <div><dt className="text-ink-500">Rounds</dt><dd className="font-mono">{run.rounds ?? '–'}</dd></div>
          <div><dt className="text-ink-500">Tokens in / out</dt><dd className="font-mono">{run.input_tokens ?? 0} / {run.output_tokens ?? 0}</dd></div>
          <div><dt className="text-ink-500">Cached (read / written)</dt><dd className="font-mono">{run.cache_read_tokens ?? 0} / {run.cache_write_tokens ?? 0}</dd></div>
          <div><dt className="text-ink-500">Cost</dt><dd className="font-mono">{formatCost(run.cost_usd)}</dd></div>
          <div><dt className="text-ink-500">Time</dt><dd className="font-mono">{((run.latency_ms ?? 0) / 1000).toFixed(1)}s</dd></div>
        </dl>
        {run.error && <p className="text-sm text-loss-700">Error: {run.error}</p>}
      </Section>

      <Section title="Tool calls">
        {steps.length === 0 && <p className="text-xs text-ink-500">No tools were called.</p>}
        <ol className="space-y-1">
          {steps.map((s) => (
            <li key={s.step_no} className="text-xs">
              <button type="button" className="w-full text-left flex flex-wrap gap-2 items-baseline" onClick={() => setOpen(open === s.step_no ? null : s.step_no)}>
                <span className="font-mono text-ink-500">{s.step_no}.</span>
                <span className="font-mono text-ink-900">{s.tool_name}</span>
                <span className="font-mono text-ink-500 break-all">{s.tool_name === 'submit_answer' ? '' : JSON.stringify(s.arguments)}</span>
                {s.error && <span className="text-loss-700">error</span>}
                <span className="text-ink-500">{s.latency_ms != null ? `${s.latency_ms} ms` : ''}</span>
                <span className="text-ink-500 ml-auto">{open === s.step_no ? 'Hide' : 'Show data'}</span>
              </button>
              {open === s.step_no && <Json value={s.error ? { error: s.error } : s.tool_name === 'submit_answer' ? s.arguments : s.result} />}
            </li>
          ))}
        </ol>
      </Section>

      <Section title={`Answer${run.answer_type ? ` (${run.answer_type})` : ''}`}>
        <p className="text-sm text-ink-900 whitespace-pre-wrap">{run.answer ?? '–'}</p>
        {run.facts_used && run.facts_used.length > 0 && (
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-500"><th className="py-1 pr-2">Fact used</th><th className="pr-2">Meaning</th><th>From</th></tr>
            </thead>
            <tbody>
              {run.facts_used.map((f, i) => (
                <tr key={i} className="border-t border-chalk-200">
                  <td className="py-1 pr-2 font-mono">{String(f.value)}</td>
                  <td className="pr-2">{f.meaning}</td>
                  <td className="font-mono">{f.tool}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Section>

      {grade && (
        <Section title={`Automatic checks: ${grade.passed} of ${grade.total} passed`}>
          <ul className="text-xs space-y-0.5">
            {Object.entries(grade.checks).map(([k, c]) => (
              <li key={k} className="flex gap-2">
                <span className={c.pass ? 'text-pitch-700' : 'text-loss-700'}>{c.pass ? 'Pass' : 'Fail'}</span>
                <span className="font-mono">{k}</span>
                <span className="text-ink-500">{c.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {run.question_id && (
        <Section title="Ground truth at run time">
          {truth == null ? <p className="text-xs text-ink-500">None: this question tests a refusal.</p> : <Json value={truth} />}
        </Section>
      )}

      <Section title="Your review">
        <ReviewForm runId={run.run_id} initial={d.review} />
      </Section>
    </div>
  );
}

export default function AiLabPage() {
  useDocumentHead({ title: 'AI Lab' });
  const isAdmin = useAuthOptional()?.isAdmin ?? false;
  const [questions, setQuestions] = useState<BenchmarkQuestion[]>([]);
  const [prompts, setPrompts] = useState<PromptVersion[]>([]);
  const [runs, setRuns] = useState<(AiRun & { passed: number | null; total: number | null })[]>([]);
  const [batches, setBatches] = useState<Awaited<ReturnType<typeof getBatches>>>([]);
  const [questionId, setQuestionId] = useState<string>('');
  const [freeText, setFreeText] = useState('');
  const [model, setModel] = useState<string>(AI_MODELS[0].id);
  const [promptId, setPromptId] = useState<string>('analyst_v1');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);

  const reload = useCallback(async () => {
    const [r, b] = await Promise.all([getRecentRuns(), getBatches()]);
    setRuns(r);
    setBatches(b);
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([getBenchmarkQuestions(), getPromptVersions(), reload()])
      .then(([q, p]) => {
        setQuestions(q);
        setPrompts(p);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the AI Lab'));
  }, [isAdmin, reload]);

  const exp001 = useMemo(() => questions.filter((q) => q.experiments?.includes('exp001')), [questions]);
  const selected = questions.find((q) => q.question_id === questionId) ?? null;

  async function openRun(runId: number) {
    setError(null);
    try {
      setDetail(await getRunDetail(runId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the run');
    }
  }

  async function runOne() {
    setBusy(true);
    setError(null);
    try {
      const { run_id } = await runQuestion(
        questionId ? { question_id: questionId, model, prompt_id: promptId } : { question: freeText, model, prompt_id: promptId },
      );
      await Promise.all([openRun(run_id), reload()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The run failed');
    } finally {
      setBusy(false);
    }
  }

  async function runExperiment() {
    if (!window.confirm(`Run all ${exp001.length} Experiment 001 questions with ${model} and ${promptId}? Roughly $0.01–0.05 per question.`)) return;
    setBusy(true);
    setError(null);
    let batch: Batch | null = null;
    try {
      batch = await createBatch({ name: 'exp001', model, prompt_id: promptId, question_ids: exp001.map((q) => q.question_id) });
      for (const [i, q] of exp001.entries()) {
        setProgress(`Batch ${batch.batch_id}: ${i + 1} of ${exp001.length} (${q.question_id})`);
        try {
          await runQuestion({ question_id: q.question_id, model, prompt_id: promptId, batch_id: batch.batch_id });
        } catch (e) {
          // One failed question shouldn't stop the batch; the failure is
          // visible as a missing run in the batch summary.
          setError(`${q.question_id}: ${e instanceof Error ? e.message : 'failed'}`);
          if (e instanceof Error && /limit reached|expired or invalid/i.test(e.message)) break;
        }
      }
      await finishBatch(batch.batch_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The batch failed');
    } finally {
      setProgress(null);
      setBusy(false);
      await reload();
    }
  }

  if (!isAdmin) return <p className="text-sm text-ink-500">This page is for admins.</p>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">AI Lab</h1>
        <p className="text-sm text-ink-500">
          Ask a question, see which FixtureShark tools the model used, the exact data it saw, what it answered and what it cost. Design:
          docs/ai-lab/design.md.
        </p>
      </header>

      <Section title="Run">
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="text-sm sm:col-span-3">
            <span className="text-ink-700">Benchmark question</span>
            <select className="w-full border border-chalk-300 rounded p-1" value={questionId} onChange={(e) => setQuestionId(e.target.value)}>
              <option value="">Free text (not graded)</option>
              {questions.map((q) => (
                <option key={q.question_id} value={q.question_id}>
                  {q.question_id} {q.experiments?.includes('exp001') ? '· exp001 ' : ''}· {q.question}
                </option>
              ))}
            </select>
          </label>
          {!questionId && (
            <label className="text-sm sm:col-span-3">
              <span className="text-ink-700">Question</span>
              <textarea className="w-full border border-chalk-300 rounded p-1" rows={2} value={freeText} onChange={(e) => setFreeText(e.target.value)} />
            </label>
          )}
          {selected && (
            <div className="text-xs text-ink-500 sm:col-span-3">
              Expected: {selected.expected_behaviour}
              {!selected.answerable_now && selected.answerability_note ? ` · ${selected.answerability_note}` : ''}
            </div>
          )}
          <label className="text-sm">
            <span className="text-ink-700">Model</span>
            <select className="w-full border border-chalk-300 rounded p-1" value={model} onChange={(e) => setModel(e.target.value)}>
              {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-ink-700">Prompt</span>
            <select className="w-full border border-chalk-300 rounded p-1" value={promptId} onChange={(e) => setPromptId(e.target.value)}>
              {prompts.map((p) => <option key={p.prompt_id} value={p.prompt_id}>{p.prompt_id}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <button type="button" disabled={busy || (!questionId && !freeText.trim())} onClick={runOne}
              className="px-3 py-1 rounded bg-ink-900 text-white text-sm disabled:opacity-40">
              {busy && !progress ? 'Running…' : 'Run'}
            </button>
            <button type="button" disabled={busy || exp001.length === 0} onClick={runExperiment}
              className="px-3 py-1 rounded border border-ink-900 text-sm disabled:opacity-40">
              Run Experiment 001 ({exp001.length})
            </button>
          </div>
        </div>
        {progress && <p className="text-xs text-ink-700">{progress}</p>}
        {error && <p className="text-sm text-loss-700">{error}</p>}
      </Section>

      {detail && <RunView d={detail} />}

      {batches.length > 0 && (
        <Section title="Batches">
          <div className="overflow-x-auto"><table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-500">
                <th className="py-1 pr-2">Batch</th><th className="pr-2">Model</th><th className="pr-2">Prompt</th>
                <th className="pr-2">Runs</th><th className="pr-2">Checks passed</th><th className="pr-2">Cost</th><th>Started</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.batch_id} className="border-t border-chalk-200">
                  <td className="py-1 pr-2 font-mono">{b.batch_id} {b.name}</td>
                  <td className="pr-2 font-mono">{b.model}</td>
                  <td className="pr-2 font-mono">{b.prompt_id}</td>
                  <td className="pr-2">{b.runs} of {b.question_ids.length}</td>
                  <td className="pr-2">{b.checks_total ? `${b.checks_passed}/${b.checks_total}` : '–'}</td>
                  <td className="pr-2 font-mono">{formatCost(b.cost)}</td>
                  <td>{when(b.as_of)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Section>
      )}

      <Section title="Recent runs">
        {runs.length === 0 && <p className="text-xs text-ink-500">No runs yet.</p>}
        <div className="overflow-x-auto"><table className="w-full text-xs">
          <tbody>
            {runs.map((r) => (
              <tr key={r.run_id} className="border-t border-chalk-200 cursor-pointer hover:bg-chalk-100" onClick={() => openRun(r.run_id)}>
                <td className="py-1 pr-2 font-mono">{r.run_id}</td>
                <td className="pr-2 font-mono">{r.question_id ?? '–'}</td>
                <td className="pr-2 min-w-[12rem]">{r.question}</td>
                <td className="pr-2 font-mono whitespace-nowrap">{r.model}</td>
                <td className="pr-2 whitespace-nowrap">{r.total ? `${r.passed}/${r.total}` : '–'}</td>
                <td className="pr-2 font-mono">{formatCost(r.cost_usd)}</td>
                <td className="whitespace-nowrap">{when(r.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Section>
    </div>
  );
}
