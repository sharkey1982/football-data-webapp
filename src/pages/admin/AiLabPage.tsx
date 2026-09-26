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
  saveReview,
  type AiRun,
  type BatchSummary,
  type BenchmarkQuestion,
  type PromptVersion,
  type Review,
  type ReviewItem,
  type RunDetail,
  type RunStep,
} from '../../lib/aiLabApi';

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const EMPTY_REVIEW: Review = { factually_correct: null, usefulness: null, unsupported_claims: null, comment: null, ideal_answer: null };

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

const label = (k: string) => k.replace(/_/g, ' ');
const show = (v: unknown) => (v === null || v === undefined || v === '' ? '–' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Ground truth as readable rows: each result row becomes a small card of
 * "field: value" lines, so it can be checked on a phone without reading JSON. */
function TruthView({ truth }: { truth: unknown }) {
  if (truth == null) return <p className="text-sm text-ink-500">None: this question tests whether it declines.</p>;
  if (!Array.isArray(truth)) return <Json value={truth} />;
  if (truth.length === 0) return <p className="text-sm text-ink-500">The ground-truth query returned no rows.</p>;
  return (
    <ol className="space-y-2">
      {truth.slice(0, 12).map((row, i) => (
        <li key={i} className="border border-chalk-200 rounded p-2 text-sm">
          {row && typeof row === 'object' ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {Object.entries(row as Record<string, unknown>).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ink-500">{label(k)}</dt>
                  <dd className="text-ink-900 break-words">{show(v)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            show(row)
          )}
        </li>
      ))}
      {truth.length > 12 && <li className="text-xs text-ink-500">…and {truth.length - 12} more rows</li>}
    </ol>
  );
}

function Choice<T extends string | number>({ options, value, onChange, name }: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-w-11 px-3 py-2 rounded border text-sm ${
            value === o.value ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-900 border-chalk-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ReviewForm({ runId, initial, onSaved, saveLabel = 'Save review' }: {
  runId: number;
  initial: Review | null;
  onSaved?: (r: Review) => void;
  saveLabel?: string;
}) {
  const [r, setR] = useState<Review>(initial ?? EMPTY_REVIEW);
  const [more, setMore] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setR(initial ?? EMPTY_REVIEW);
    setMore(!!(initial?.comment || initial?.ideal_answer));
    setMsg(null);
  }, [runId, initial]);

  async function save() {
    setMsg(null);
    setSaving(true);
    try {
      await saveReview(runId, r);
      setMsg('Saved.');
      onSaved?.(r);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  }

  const area = 'w-full border border-chalk-300 rounded p-2 text-sm';
  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1">
        <div className="text-ink-700">Factually correct?</div>
        <Choice name="Factually correct" value={r.factually_correct} onChange={(v) => setR({ ...r, factually_correct: v })}
          options={[{ value: 'yes', label: 'Yes' }, { value: 'unsure', label: 'Unsure' }, { value: 'no', label: 'No' }]} />
      </div>
      <div className="space-y-1">
        <div className="text-ink-700">Usefulness (1 = no use, 3 = answers it, 5 = excellent)</div>
        <Choice name="Usefulness" value={r.usefulness} onChange={(v) => setR({ ...r, usefulness: v })}
          options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }))} />
      </div>
      <label className="block space-y-1">
        <span className="text-ink-700">Unsupported or misleading claims</span>
        <textarea className={area} rows={2} value={r.unsupported_claims ?? ''} onChange={(e) => setR({ ...r, unsupported_claims: e.target.value || null })} />
      </label>
      {more ? (
        <>
          <label className="block space-y-1">
            <span className="text-ink-700">Comment</span>
            <textarea className={area} rows={2} value={r.comment ?? ''} onChange={(e) => setR({ ...r, comment: e.target.value || null })} />
          </label>
          <label className="block space-y-1">
            <span className="text-ink-700">Ideal answer (optional)</span>
            <textarea className={area} rows={3} value={r.ideal_answer ?? ''} onChange={(e) => setR({ ...r, ideal_answer: e.target.value || null })} />
          </label>
        </>
      ) : (
        <button type="button" className="text-sm text-ink-700 underline" onClick={() => setMore(true)}>Add a comment or ideal answer</button>
      )}
      <div className="flex items-center gap-2">
        <button type="button" disabled={saving || !r.factually_correct} onClick={save}
          className="px-4 py-2 rounded bg-ink-900 text-white text-sm disabled:opacity-40">
          {saving ? 'Saving…' : saveLabel}
        </button>
        {msg && <span className="text-xs text-ink-500">{msg}</span>}
      </div>
    </div>
  );
}

function Checks({ grade }: { grade: RunDetail['grade'] }) {
  if (!grade) return null;
  return (
    <ul className="text-xs space-y-1">
      {Object.entries(grade.checks).map(([k, c]) => (
        <li key={k} className="flex flex-wrap gap-x-2">
          <span className={c.pass ? 'text-pitch-700' : 'text-loss-700'}>{c.pass ? 'Pass' : 'Fail'}</span>
          <span className="font-mono">{label(k)}</span>
          <span className="text-ink-500">{c.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function Facts({ run }: { run: AiRun }) {
  if (!run.facts_used || run.facts_used.length === 0) return null;
  return (
    <ul className="text-sm space-y-1">
      {run.facts_used.map((f, i) => (
        <li key={i} className="border-t border-chalk-200 pt-1">
          <span className="font-mono">{String(f.value)}</span>
          <span className="text-ink-500"> · {f.meaning} · {f.tool}</span>
        </li>
      ))}
    </ul>
  );
}

function Trace({ steps }: { steps: RunStep[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (steps.length === 0) return <p className="text-xs text-ink-500">No tools were called.</p>;
  return (
    <ol className="space-y-1">
      {steps.map((s) => (
        <li key={s.step_no} className="text-xs">
          <button type="button" className="w-full text-left flex flex-wrap gap-2 items-baseline py-1" onClick={() => setOpen(open === s.step_no ? null : s.step_no)}>
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
  );
}

function Meter({ run }: { run: AiRun }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
      <div><dt className="text-ink-500">Rounds</dt><dd className="font-mono">{run.rounds ?? '–'}</dd></div>
      <div><dt className="text-ink-500">Tokens in / out</dt><dd className="font-mono">{run.input_tokens ?? 0} / {run.output_tokens ?? 0}</dd></div>
      <div><dt className="text-ink-500">Cached (read / written)</dt><dd className="font-mono">{run.cache_read_tokens ?? 0} / {run.cache_write_tokens ?? 0}</dd></div>
      <div><dt className="text-ink-500">Cost</dt><dd className="font-mono">{formatCost(run.cost_usd)}</dd></div>
      <div><dt className="text-ink-500">Time</dt><dd className="font-mono">{((run.latency_ms ?? 0) / 1000).toFixed(1)}s</dd></div>
    </dl>
  );
}

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
                        {b.runs} of {b.question_ids.length}
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
