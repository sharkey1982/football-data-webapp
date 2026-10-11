// ============================================================================
// src/pages/admin/aiLabParts.tsx
//
// Pieces shared by the AI Lab (/admin/ai-lab) and Ask FixtureShark
// (/admin/ask): the review form, facts, tool trace, cost meter and checks.
// ============================================================================

import { useEffect, useState } from 'react';
import { formatCost, saveReview, type AiRun, type Review, type RunDetail, type RunStep } from '../../lib/aiLabApi';

export const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

const EMPTY_REVIEW: Review = { factually_correct: null, usefulness: null, unsupported_claims: null, comment: null, ideal_answer: null };

export function Json({ value }: { value: unknown }) {
  return (
    <pre className="text-[11px] leading-snug bg-chalk-100 border border-chalk-300 rounded p-2 overflow-x-auto max-h-80 whitespace-pre-wrap break-words">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-chalk-300 rounded-lg bg-white p-3 space-y-2">
      <h2 className="text-sm font-medium text-ink-700">{title}</h2>
      {children}
    </section>
  );
}

export const label = (k: string) => k.replace(/_/g, ' ');
export const show = (v: unknown) => (v === null || v === undefined || v === '' ? '–' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** Ground truth as readable rows: each result row becomes a small card of
 * "field: value" lines, so it can be checked on a phone without reading JSON. */
export function TruthView({ truth }: { truth: unknown }) {
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

export function Choice<T extends string | number>({ options, value, onChange, name }: {
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

export function ReviewForm({ runId, initial, onSaved, saveLabel = 'Save review' }: {
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

export function Checks({ grade }: { grade: RunDetail['grade'] }) {
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

export function Facts({ run }: { run: AiRun }) {
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

export function Trace({ steps }: { steps: RunStep[] }) {
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

export function Meter({ run }: { run: AiRun }) {
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
