// ============================================================================
// src/pages/admin/ModelChangesPage.tsx   (/admin/model)
//
// The model's versions and its change log: what settings produce today's
// fits and predictions, and every change to how they (or the returns built
// on them) are calculated -- when, why, and what it did to the numbers.
// Entries are written by migrations in reviewed PRs, never from the site.
// ============================================================================

import { useEffect, useState } from 'react';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { getModelChanges, getModelVersions, metricLines, type ModelChange, type ModelVersion } from '../../lib/modelChangesApi';

const AREA: Record<ModelChange['area'], string> = {
  fit: 'Fitting',
  prediction: 'Predictions',
  returns: 'Returns',
  data: 'Data',
};

const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

function Metrics({ title, m }: { title: string; m: Record<string, unknown> | null }) {
  const lines = metricLines(m);
  if (lines.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{title}</div>
      <ul className="text-xs text-ink-700 space-y-0.5">
        {lines.map((l) => (
          <li key={l.label}>
            {l.label}: <span className="font-mono">{l.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function VersionCard({ v }: { v: ModelVersion }) {
  const params = Object.entries(v.params ?? {});
  return (
    <div className="border border-chalk-300 rounded-lg bg-white p-3 space-y-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-mono text-sm text-ink-900">{v.version}</span>
        <span className="text-xs text-ink-500">{v.component === 'fit' ? 'Fitting' : 'Predictions'}</span>
        {v.retired_at ? (
          <span className="text-xs text-loss-700">retired {fmtDate(v.retired_at)}</span>
        ) : (
          <span className="text-xs text-pitch-700">in use</span>
        )}
      </div>
      <p className="text-sm text-ink-700">{v.description}</p>
      {params.length > 0 && (
        <ul className="text-xs text-ink-500 flex flex-wrap gap-x-4 gap-y-0.5">
          {params.map(([k, val]) => (
            <li key={k}>
              {k.replace(/_/g, ' ')}: <span className="font-mono">{String(val)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ModelChangesPage() {
  const [versions, setVersions] = useState<ModelVersion[] | null>(null);
  const [changes, setChanges] = useState<ModelChange[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentHead({
    title: 'Model versions and changes',
    description: 'Every change to how FixtureShark fits the model and makes predictions: when, why, and what it did to the numbers.',
  });

  useEffect(() => {
    let live = true;
    Promise.all([getModelVersions(), getModelChanges()])
      .then(([v, c]) => {
        if (!live) return;
        setVersions(v);
        setChanges(c);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  const inUse = (versions ?? []).filter((v) => !v.retired_at);
  const retired = (versions ?? []).filter((v) => v.retired_at);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl text-ink-900">Model versions and changes</h1>
        <p className="text-sm text-ink-500 mt-1">
          Every change to how the model is fitted, how predictions are made, or how returns are worked out &mdash; with the reason and
          what it did to the numbers. Changes are only made through reviewed updates, never from the site.
        </p>
      </header>

      {error && <p className="text-sm text-loss-700">{error}</p>}
      {!error && (versions === null || changes === null) && <p className="text-sm text-ink-500">Loading&hellip;</p>}

      {versions !== null && (
        <section className="space-y-3" aria-label="Versions in use">
          <h2 className="font-display text-lg text-ink-900">In use</h2>
          {inUse.map((v) => (
            <VersionCard key={v.version} v={v} />
          ))}
          {retired.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-700">Retired versions ({retired.length})</summary>
              <div className="space-y-3 mt-3">
                {retired.map((v) => (
                  <VersionCard key={v.version} v={v} />
                ))}
              </div>
            </details>
          )}
        </section>
      )}

      {changes !== null && (
        <section className="space-y-3" aria-label="Change log">
          <h2 className="font-display text-lg text-ink-900">Change log</h2>
          {changes.length === 0 && <p className="text-sm text-ink-500">No changes recorded yet.</p>}
          <ol className="space-y-3">
            {changes.map((c) => (
              <li key={c.change_id} className="border border-chalk-300 rounded-lg bg-white p-3 space-y-2" data-testid="change">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-xs text-ink-500">{fmtDate(c.changed_at)}</span>
                  <span className="text-xs rounded bg-chalk-200 text-ink-700 px-1.5">{AREA[c.area]}</span>
                  {(c.version_from || c.version_to) && (
                    <span className="text-xs font-mono text-ink-500">
                      {c.version_from ?? '\u2013'} &rarr; {c.version_to ?? '\u2013'}
                    </span>
                  )}
                </div>
                <h3 className="text-ink-900 font-medium">{c.title}</h3>
                <p className="text-sm text-ink-700">
                  <span className="text-ink-500">Why: </span>
                  {c.reason}
                </p>
                {c.detail && <p className="text-sm text-ink-700">{c.detail}</p>}
                {(c.before_metrics || c.after_metrics) && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Metrics title="Before" m={c.before_metrics} />
                    <Metrics title="After" m={c.after_metrics} />
                  </div>
                )}
                {c.reference && <div className="text-xs text-ink-500">Reference: {c.reference}</div>}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
