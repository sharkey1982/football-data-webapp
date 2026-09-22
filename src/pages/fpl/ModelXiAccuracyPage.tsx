// ============================================================================
// src/pages/fpl/ModelXiAccuracyPage.tsx
//
// The model's XI against the week's best XI, week by week.
//
// Two honesty rules built in, because the earlier Team of the Week panel
// broke both:
//   1. A week with no projections is NOT shown as "0 points against a
//      projection of 0".
//   2. A week whose projections were generated after the FPL deadline is
//      labelled RETROSPECTIVE. Those rows say what the model would pick
//      knowing what happened, which is a different claim entirely.
//
// The perfect XI is hindsight by construction, so the model losing to it is
// expected, not a failure: the readable tests are whether the model's own
// forecast was calibrated, and how it fares against the week's average.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { getModelXiHistory, summariseModelXi, type ModelXiWeek } from '../../lib/modelXiApi';
import { getErrorMessage } from '../../lib/errorMessage';

function Bars({ weeks }: { weeks: ModelXiWeek[] }) {
  const max = Math.max(...weeks.map((w) => Math.max(w.actual_xi_points, w.model_xi_actual_points, w.model_xi_projected)), 1);
  const pct = (v: number) => `${Math.round((v / max) * 100)}%`;
  return (
    <div className="space-y-3">
      {weeks.map((w) => (
        <div key={w.fpl_event_id}>
          <div className="flex items-baseline justify-between text-xs text-ink-600 mb-1">
            <span className="font-medium text-ink-800">Gameweek {w.fpl_event_id}</span>
            {!w.generated_before_deadline && (
              <span className="text-[11px] uppercase tracking-wide text-amber-700">retrospective</span>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] text-ink-500">Model XI</span>
              <div className="flex-1 bg-chalk-100 rounded h-4 overflow-hidden">
                <div className="h-full bg-pitch-700" style={{ width: pct(w.model_xi_actual_points) }} />
              </div>
              <span className="w-10 text-right text-xs font-mono text-ink-800">{w.model_xi_actual_points}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] text-ink-500">Its forecast</span>
              <div className="flex-1 bg-chalk-100 rounded h-4 overflow-hidden">
                <div className="h-full bg-sky-400" style={{ width: pct(w.model_xi_projected) }} />
              </div>
              <span className="w-10 text-right text-xs font-mono text-ink-600">{w.model_xi_projected.toFixed(0)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-[11px] text-ink-500">Perfect XI</span>
              <div className="flex-1 bg-chalk-100 rounded h-4 overflow-hidden">
                <div className="h-full bg-chalk-400" style={{ width: pct(w.actual_xi_points) }} />
              </div>
              <span className="w-10 text-right text-xs font-mono text-ink-600">{w.actual_xi_points}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ModelXiAccuracyPage() {
  const [weeks, setWeeks] = useState<ModelXiWeek[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentHead({
    title: 'Model XI accuracy',
    description: "How the eleven the model rated highest each gameweek actually scored, against the week's best possible XI.",
  });

  useEffect(() => {
    let live = true;
    getModelXiHistory()
      .then((w) => live && setWeeks(w))
      .catch((e) => live && setError(getErrorMessage(e, 'Could not load the model XI history')));
    return () => {
      live = false;
    };
  }, []);

  const summary = useMemo(() => (weeks ? summariseModelXi(weeks) : null), [weeks]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl text-ink-900">Model XI accuracy</h1>
        <p className="text-sm text-ink-600 mt-1">
          The eleven the model rated highest for each gameweek, and what they actually scored — against its own forecast, and against the
          best XI that week (which is chosen with hindsight, so it is an upper bound, not a rival).
        </p>
      </header>

      {error && <p className="text-sm text-loss-700">{error}</p>}
      {weeks === null && !error && <p className="text-sm text-ink-500">Loading…</p>}

      {weeks !== null && weeks.length === 0 && (
        <p className="text-sm text-ink-600">
          No finished gameweek has projections yet, so there is nothing to compare. This page fills in as projections are generated.
        </p>
      )}

      {weeks !== null && summary !== null && weeks.length > 0 && (
        <>
          {summary.forecastWeeks.length === 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded-lg p-3 text-sm text-ink-800">
              <b>Every week here is retrospective.</b> These projections were generated after the FPL deadline, so they show what the model
              would pick knowing how the week went — not what it called beforehand. Treat them as a fit, not a forecast.
            </div>
          )}

          <section className="grid gap-3 sm:grid-cols-3">
            <div className="border border-chalk-300 rounded-lg bg-white p-3">
              <div className="text-xs text-ink-500">Model XI, average</div>
              <div className="font-display text-2xl text-ink-900">{summary.meanModelPoints?.toFixed(0)}</div>
              <div className="text-xs text-ink-500">points a week</div>
            </div>
            <div className="border border-chalk-300 rounded-lg bg-white p-3">
              <div className="text-xs text-ink-500">Its own forecast</div>
              <div className="font-display text-2xl text-ink-900">{summary.meanProjected?.toFixed(0)}</div>
              <div className={`text-xs ${(summary.meanCalibrationGap ?? 0) < 0 ? 'text-loss-700' : 'text-pitch-800'}`}>
                {(summary.meanCalibrationGap ?? 0) >= 0 ? 'beat its forecast by ' : 'short of it by '}
                {Math.abs(summary.meanCalibrationGap ?? 0).toFixed(0)} a week
              </div>
            </div>
            <div className="border border-chalk-300 rounded-lg bg-white p-3">
              <div className="text-xs text-ink-500">Perfect XI (hindsight)</div>
              <div className="font-display text-2xl text-ink-900">{summary.meanPerfectPoints?.toFixed(0)}</div>
              <div className="text-xs text-ink-500">the ceiling, not a rival</div>
            </div>
          </section>

          <section className="border border-chalk-300 rounded-lg bg-white p-3">
            <h2 className="font-display uppercase tracking-wide text-sm text-ink-900 mb-3">Week by week</h2>
            <Bars weeks={weeks} />
          </section>

          <section className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-chalk-100 text-ink-700">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">GW</th>
                  <th className="text-right px-3 py-2 font-medium">Model XI</th>
                  <th className="text-right px-3 py-2 font-medium">Forecast</th>
                  <th className="text-right px-3 py-2 font-medium">Perfect XI</th>
                  <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">In common</th>
                  <th className="text-left px-3 py-2 font-medium">Basis</th>
                </tr>
              </thead>
              <tbody>
                {weeks.map((w) => (
                  <tr key={w.fpl_event_id} className="border-t border-chalk-200">
                    <td className="px-3 py-2 text-ink-900">{w.fpl_event_id}</td>
                    <td className="px-3 py-2 text-right font-mono">{w.model_xi_actual_points}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-600">{w.model_xi_projected.toFixed(0)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-600">{w.actual_xi_points}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-600 hidden sm:table-cell">{w.overlap_count}</td>
                    <td className="px-3 py-2 text-xs">
                      {w.generated_before_deadline ? (
                        <span className="text-pitch-800">forecast</span>
                      ) : (
                        <span className="text-amber-700">retrospective</span>
                      )}
                      <span className="text-ink-400"> · {w.players_projected} players</span>
                      {w.players_projected < 300 && <span className="text-loss-700"> · partial</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <p className="text-xs text-ink-500">
            A week marked <b>partial</b> had projections for only a fraction of the league, so its XI was chosen from that fragment. See also{' '}
            <Link className="underline" to="/fpl/team-of-the-week">
              Team of the Week
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}
