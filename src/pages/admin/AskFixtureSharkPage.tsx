// ============================================================================
// src/pages/admin/AskFixtureSharkPage.tsx   (/admin/ask)
//
// Ask FixtureShark, admin-only trial (step 2 of the route in
// docs/ai-lab/design.md). A plain question box over the AI Lab: the question
// goes to the ai-lab-run Edge Function with the current prompt (analyst_v2)
// and tools, the answer comes back with the data sources it used, and the
// review form underneath is the same one the AI Lab uses, so marks land in
// ai_human_reviews alongside the benchmark reviews.
//
// Every question is filed under the standing "Ask FixtureShark" batch, so the
// page can list past questions and the AI Lab shows the running cost. Each
// question costs about 2-3p and counts towards the AI Lab monthly limit.
// Not public: visitors see nothing and no request is made.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import {
  askQuestion,
  formatCost,
  getAskBatchId,
  getBatchForReview,
  getRunDetail,
  sourcesUsed,
  type ReviewItem,
  type Review,
} from '../../lib/aiLabApi';
import { CreditPanel, Facts, ReviewForm, Section, Trace, when } from './aiLabParts';

const EXAMPLES = [
  'Which teams have the easiest fixtures over the next five gameweeks?',
  'Best pair of midfielders for £15m next gameweek?',
  'Saka or Palmer for the next three gameweeks?',
];

const TYPE_NOTE: Record<string, string> = {
  partial: 'Partly answered: some of what you asked is not in FixtureShark data.',
  refused: 'Not answered: FixtureShark data does not cover this.',
};

function Answer({ item, onReviewed }: { item: ReviewItem; onReviewed: (r: Review) => void }) {
  const { run, steps } = item;
  const sources = sourcesUsed(steps);
  return (
    <div className="space-y-3">
      <Section title="Answer">
        <p className="text-base text-ink-900 font-medium">{run.question}</p>
        <p className="text-xs text-ink-500">AI answer from FixtureShark data. Check the figures against the sources before relying on it.</p>
        {run.answer_type && TYPE_NOTE[run.answer_type] && (
          <p className="text-sm text-ink-700 bg-chalk-100 border border-chalk-300 rounded px-2 py-1">{TYPE_NOTE[run.answer_type]}</p>
        )}
        <div className="border-l-4 border-pitch-700 pl-3">
          <p className="text-base text-ink-900 whitespace-pre-wrap">{run.answer ?? '–'}</p>
          {run.error && <p className="text-sm text-loss-700 mt-1">Error: {run.error}</p>}
        </div>
        {sources.length > 0 && (
          <div className="text-sm">
            <div className="text-ink-700">Sources</div>
            <ul className="space-y-0.5">
              {sources.map((s) => (
                <li key={s.tool}>
                  {s.to ? <Link to={s.to} className="underline text-ink-900">{s.label}</Link> : s.label}
                  <span className="text-xs text-ink-500"> · {s.kind === 'model' ? 'includes FixtureShark model estimates' : 'recorded data'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-xs text-ink-500">
          {formatCost(run.cost_usd)} · {((run.latency_ms ?? 0) / 1000).toFixed(0)}s · {when(run.created_at)}
        </p>
      </Section>
      <Section title="Was it right?">
        <ReviewForm runId={run.run_id} initial={item.review} onSaved={onReviewed} />
      </Section>
      <details className="border border-chalk-300 rounded-lg bg-white p-3">
        <summary className="text-sm text-ink-700 cursor-pointer">Figures it used and the data it looked at</summary>
        <div className="space-y-3 pt-2">
          <Facts run={run} />
          {!run.facts_used?.length && <p className="text-xs text-ink-500">No figures listed.</p>}
          <Trace steps={steps} />
        </div>
      </details>
    </div>
  );
}

export default function AskFixtureSharkPage() {
  useDocumentHead({ title: 'Ask FixtureShark' });
  const isAdmin = useAuthOptional()?.isAdmin ?? false;
  const [batchId, setBatchId] = useState<number | null>(null);
  const [history, setHistory] = useState<ReviewItem[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (id: number | null) => {
    setHistory(id == null ? [] : await getBatchForReview(id));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    getAskBatchId()
      .then(async (id) => {
        setBatchId(id);
        await load(id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load past questions'));
  }, [isAdmin, load]);

  async function ask() {
    const q = question.trim();
    if (!q) return;
    setBusy(true);
    setError(null);
    try {
      const { run_id } = await askQuestion(q, batchId);
      if (batchId == null) {
        // No log batch yet: show this answer on its own.
        const d = await getRunDetail(run_id);
        setHistory((h) => [{ ...d, reviewed: !!d.review?.factually_correct }, ...h]);
      } else {
        await load(batchId);
      }
      setSelected(run_id);
      setQuestion('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not get an answer');
    } finally {
      setBusy(false);
    }
  }

  function reviewed(runId: number, r: Review) {
    setHistory((h) => h.map((it) => (it.run.run_id === runId ? { ...it, review: r, reviewed: true } : it)));
  }

  if (!isAdmin) return <p className="text-sm text-ink-500">This page is for admins.</p>;

  const current = history.find((h) => h.run.run_id === selected) ?? null;
  const spent = history.reduce((a, h) => a + Number(h.run.cost_usd ?? 0), 0);
  const marked = history.filter((h) => h.reviewed).length;

  return (
    <div className="space-y-4 max-w-2xl">
      <header>
        <h1 className="text-xl font-semibold text-ink-900">Ask FixtureShark</h1>
        <p className="text-sm text-ink-500">
          Admin trial. Ask a football or FPL question; the answer is built only from FixtureShark data, with its sources. Mark each
          answer so we know whether it is good enough to open up. Each question costs about 2–3p.
        </p>
      </header>

      <CreditPanel refreshKey={history[0]?.run.run_id} />

      <Section title="Your question">
        <label className="block">
          <span className="sr-only">Question</span>
          <textarea
            className="w-full border border-chalk-300 rounded p-2 text-base"
            rows={3}
            maxLength={500}
            value={question}
            placeholder="e.g. Who are the best value defenders under £5m for the next three gameweeks?"
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void ask();
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button key={ex} type="button" onClick={() => setQuestion(ex)}
              className="px-2 py-1 rounded border border-chalk-300 text-xs text-ink-700 bg-white">
              {ex}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button type="button" disabled={busy || !question.trim()} onClick={ask}
            className="px-4 py-2 rounded bg-ink-900 text-white text-sm disabled:opacity-40">
            {busy ? 'Looking it up…' : 'Ask'}
          </button>
          {busy && <span className="text-xs text-ink-500">Usually 15–40 seconds.</span>}
        </div>
        {error && <p className="text-sm text-loss-700">{error}</p>}
      </Section>

      {current && <Answer item={current} onReviewed={(r) => reviewed(current.run.run_id, r)} />}

      <Section title="Past questions">
        {batchId == null && <p className="text-xs text-ink-500">The question log isn't set up yet, so past questions won't be listed.</p>}
        {history.length === 0 ? (
          <p className="text-xs text-ink-500">None yet.</p>
        ) : (
          <>
            <p className="text-xs text-ink-500">
              {history.length} asked · {marked} marked · {formatCost(spent)} in total
            </p>
            <ul className="divide-y divide-chalk-200">
              {history.map((h) => (
                <li key={h.run.run_id}>
                  <button type="button" onClick={() => setSelected(h.run.run_id)} aria-current={h.run.run_id === selected}
                    className={`w-full text-left py-2 flex gap-2 items-baseline text-sm ${h.run.run_id === selected ? 'font-medium' : ''}`}>
                    <span className="flex-1 text-ink-900">{h.run.question}</span>
                    <span className="text-xs text-ink-500 whitespace-nowrap">
                      {h.reviewed ? (h.review?.factually_correct === 'no' ? 'Marked wrong' : 'Marked') : 'Not marked'} · {when(h.run.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>
    </div>
  );
}
