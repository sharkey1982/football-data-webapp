// ============================================================================
// src/pages/admin/AiLabPage.tsx   (/admin/ai-lab)
//
// The AI Lab console (docs/ai-lab/design.md). Two views:
//
//   Review  one answer at a time, built for a phone: question, answer, the
//           facts it says it used, the ground truth captured at run time
//           (as readable rows, not JSON), the checks, and a quick review
//           form with Save & next. The trace is there but folded away.
//   Run     ask a question or queue a batch, and inspect any run in full:
//           each tool call with the exact data returned, tokens and cost.
//
// Batches are queued on the server (ai_lab_enqueue_batch + pg_cron), so
// closing the page or locking the phone doesn't stop them.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import {
  AI_MODELS,
  enqueueBatch,
  formatCost,
  getBatchForReview,
  getBatches,
  getBenchmarkQuestions,
  getPromptVersions,
  getRecentRuns,
  getRunDetail,
  runQuestion,
  type AiRun,
  type BatchSummary,
  type BenchmarkQuestion,
  type PromptVersion,
  type Review,
  type ReviewItem,
  type RunDetail,
} from '../../lib/aiLabApi';
import { Checks, CreditPanel, Facts, Meter, ReviewForm, Section, Trace, TruthView, when } from './aiLabParts';


/** Full detail of one run, for the Run view. */
function RunView({ d }: { d: RunDetail }) {
  const { run, steps, truth, grade } = d;
  return (
    <div className="space-y-3">
      <Section title={`Run ${run.run_id}${run.question_id ? ` · ${run.question_id}` : ''}`}>
        <p className="text-sm text-ink-900">{run.question}</p>
        <p className="text-xs text-ink-500 font-mono">
          {run.model} · {run.prompt_id} · {run.toolset_version}
          {run.batch_id ? ` · batch ${run.batch_id}` : ''} · {when(run.created_at)}
        </p>
        <Meter run={run} />
        {run.error && <p className="text-sm text-loss-700">Error: {run.error}</p>}
      </Section>
      <Section title="Tool calls"><Trace steps={steps} /></Section>
      <Section title={`Answer${run.answer_type ? ` (${run.answer_type})` : ''}`}>
        <p className="text-sm text-ink-900 whitespace-pre-wrap">{run.answer ?? '–'}</p>
        <Facts run={run} />
      </Section>
      {grade && <Section title={`Automatic checks: ${grade.passed} of ${grade.total} passed`}><Checks grade={grade} /></Section>}
      {run.question_id && <Section title="Ground truth at run time"><TruthView truth={truth} /></Section>}
      <Section title="Your review"><ReviewForm runId={run.run_id} initial={d.review} /></Section>
    </div>
  );
}

/** Review a batch one answer at a time. */
function ReviewPanel({ batches }: { batches: BatchSummary[] }) {
  const [batchId, setBatchId] = useState<number | null>(batches[0]?.batch_id ?? null);
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (batchId == null) return;
    let live = true;
    setItems(null);
    getBatchForReview(batchId)
      .then((list) => {
        if (!live) return;
        setItems(list);
        const firstOpen = list.findIndex((i) => !i.reviewed);
        setIdx(firstOpen >= 0 ? firstOpen : 0);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load the batch'));
    return () => {
      live = false;
    };
  }, [batchId]);

  if (batches.length === 0) return <p className="text-sm text-ink-500">No batches yet. Queue one from Run.</p>;
  const item = items?.[idx] ?? null;
  const done = items?.filter((i) => i.reviewed).length ?? 0;

  function saved(r: Review) {
    setItems((list) => list && list.map((it, i) => (i === idx ? { ...it, review: r, reviewed: true } : it)));
    if (items) {
      const next = items.findIndex((it, i) => i > idx && !it.reviewed);
      if (next >= 0) setIdx(next);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-ink-700">Batch</span>
          <select className="border border-chalk-300 rounded p-1" value={batchId ?? ''} onChange={(e) => setBatchId(Number(e.target.value))}>
            {batches.map((b) => (
              <option key={b.batch_id} value={b.batch_id}>{b.batch_id} · {b.name} · {b.prompt_id} · {when(b.as_of)}</option>
            ))}
          </select>
        </label>
        {items && <span className="text-ink-500">{done} of {items.length} reviewed</span>}
      </div>
      {error && <p className="text-sm text-loss-700">{error}</p>}
      {items && items.length > 0 && (
        <div className="flex flex-wrap gap-1" aria-label="Questions">
          {items.map((it, i) => (
            <button key={it.run.run_id} type="button" onClick={() => setIdx(i)}
              aria-current={i === idx}
              className={`px-2 py-1 rounded text-xs font-mono border ${
                i === idx ? 'bg-ink-900 text-white border-ink-900' : it.reviewed ? 'bg-chalk-200 border-chalk-300 text-ink-700' : 'bg-white border-chalk-300 text-ink-900'
              }`}>
              {it.run.question_id ?? it.run.run_id}{it.reviewed ? ' ✓' : ''}
            </button>
          ))}
        </div>
      )}
      {items && items.length === 0 && <p className="text-sm text-ink-500">No runs in this batch yet.</p>}
      {item && (
        <div className="space-y-3">
          <Section title={`${item.run.question_id ?? 'Run ' + item.run.run_id} · ${idx + 1} of ${items!.length}`}>
            <p className="text-base text-ink-900 font-medium">{item.run.question}</p>
            <div className="border-l-4 border-chalk-300 pl-3">
              <div className="text-xs text-ink-500 mb-1">Answer{item.run.answer_type ? ` (${item.run.answer_type})` : ''}</div>
              <p className="text-base text-ink-900 whitespace-pre-wrap">{item.run.answer ?? '–'}</p>
              {item.run.error && <p className="text-sm text-loss-700 mt-1">Error: {item.run.error}</p>}
            </div>
          </Section>
          <Section title="Ground truth at run time"><TruthView truth={item.truth} /></Section>
          <Section title="Facts it says it used"><Facts run={item.run} />{!item.run.facts_used?.length && <p className="text-xs text-ink-500">None listed.</p>}</Section>
          <Section title="Your review">
            <ReviewForm runId={item.run.run_id} initial={item.review} onSaved={saved} saveLabel="Save & next" />
          </Section>
          <details className="border border-chalk-300 rounded-lg bg-white p-3">
            <summary className="text-sm text-ink-700 cursor-pointer">
              Automatic checks{item.grade ? `: ${item.grade.passed} of ${item.grade.total}` : ''} · tools · cost
            </summary>
            <div className="space-y-3 pt-2">
              <Checks grade={item.grade} />
              <Trace steps={item.steps} />
              <Meter run={item.run} />
            </div>
          </details>
          <div className="flex justify-between">
            <button type="button" disabled={idx === 0} onClick={() => setIdx(idx - 1)} className="px-4 py-2 rounded border border-chalk-300 text-sm disabled:opacity-40">Previous</button>
            <button type="button" disabled={idx >= items!.length - 1} onClick={() => setIdx(idx + 1)} className="px-4 py-2 rounded border border-chalk-300 text-sm disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AiLabPage() {
  useDocumentHead({ title: 'AI Lab' });
  const isAdmin = useAuthOptional()?.isAdmin ?? false;
  const [tab, setTab] = useState<'review' | 'run'>('review');
  const [questions, setQuestions] = useState<BenchmarkQuestion[]>([]);
  const [prompts, setPrompts] = useState<PromptVersion[]>([]);
  const [runs, setRuns] = useState<(AiRun & { passed: number | null; total: number | null })[]>([]);
  const [batches, setBatches] = useState<BatchSummary[] | null>(null);
  const [questionId, setQuestionId] = useState<string>('');
  const [freeText, setFreeText] = useState('');
  const [model, setModel] = useState<string>(AI_MODELS[0].id);
  const [promptId, setPromptId] = useState<string>('analyst_v1');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
        // Default to the newest prompt (the list is ordered by created_at).
        if (p.length) setPromptId(p[p.length - 1].prompt_id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the AI Lab'));
  }, [isAdmin, reload]);

  // While a batch is waiting on the server queue, refresh its progress.
  const waiting = (batches ?? []).some((b) => b.items.waiting > 0);
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(() => void reload().catch(() => undefined), 20000);
    return () => window.clearInterval(t);
  }, [waiting, reload]);

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
    setNotice(null);
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

  async function queueExperiment() {
    if (!window.confirm(`Queue all ${exp001.length} Experiment 001 questions with ${model} and ${promptId}? Roughly $0.01–0.05 per question.`)) return;
    setBusy(true);
    setError(null);
    try {
      const id = await enqueueBatch({ name: 'exp001', model, prompt_id: promptId, question_ids: exp001.map((q) => q.question_id) });
      setNotice(`Batch ${id} queued. It runs on the server, about 3 questions a minute; you can close this page.`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not queue the batch');
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return <p className="text-sm text-ink-500">This page is for admins.</p>;

  const tabBtn = (t: 'review' | 'run', text: string) => (
    <button type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
      className={`px-4 py-2 text-sm rounded-t border-b-2 ${tab === t ? 'border-ink-900 text-ink-900 font-medium' : 'border-transparent text-ink-500'}`}>
      {text}
    </button>
  );

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">AI Lab</h1>
        <p className="text-sm text-ink-500">
          Ask a question, see which FixtureShark tools the model used, the exact data it saw, what it answered and what it cost. Design:
          docs/ai-lab/design.md.
        </p>
      </header>

      <CreditPanel refreshKey={runs[0]?.run_id} />

      <div role="tablist" className="flex gap-1 border-b border-chalk-300">
        {tabBtn('review', 'Review')}
        {tabBtn('run', 'Run')}
      </div>

      {error && <p className="text-sm text-loss-700">{error}</p>}

      {tab === 'review' && batches && <ReviewPanel batches={batches} />}

      {tab === 'run' && (
        <>
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
              <div className="flex flex-wrap items-end gap-2">
                <button type="button" disabled={busy || (!questionId && !freeText.trim())} onClick={runOne}
                  className="px-3 py-1 rounded bg-ink-900 text-white text-sm disabled:opacity-40">
                  {busy ? 'Running…' : 'Run'}
                </button>
                <button type="button" disabled={busy || exp001.length === 0} onClick={queueExperiment}
                  className="px-3 py-1 rounded border border-ink-900 text-sm disabled:opacity-40">
                  Queue Experiment 001 ({exp001.length})
                </button>
              </div>
            </div>
            {notice && <p className="text-xs text-ink-700">{notice}</p>}
          </Section>

          {detail && <RunView d={detail} />}

          {batches && batches.length > 0 && (
            <Section title="Batches">
              <div className="overflow-x-auto"><table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-ink-500">
                    <th className="py-1 pr-2">Batch</th><th className="pr-2">Model</th><th className="pr-2">Prompt</th>
                    <th className="pr-2">Progress</th><th className="pr-2">Checks passed</th><th className="pr-2">Cost</th><th>Started</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.batch_id} className="border-t border-chalk-200">
                      <td className="py-1 pr-2 font-mono">{b.batch_id} {b.name}</td>
                      <td className="pr-2 font-mono">{b.model}</td>
                      <td className="pr-2 font-mono">{b.prompt_id}</td>
                      <td className="pr-2 whitespace-nowrap">
                        {b.question_ids.length ? `${b.runs} of ${b.question_ids.length}` : `${b.runs} runs`}
                        {b.items.waiting > 0 ? ` · ${b.items.waiting} waiting` : ''}
                        {b.items.failed > 0 ? ` · ${b.items.failed} failed` : ''}
                      </td>
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
        </>
      )}
    </div>
  );
}
