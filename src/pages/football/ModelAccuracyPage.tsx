// ============================================================================
// src/pages/football/ModelAccuracyPage.tsx
//
// How accurate the model has been -- the promise Football > Predict has
// been making since the restructure ("a prediction is only worth reading
// next to its track record") and not keeping.
//
// LEADS WITH CALIBRATION, not hit rate, and the reason is substantive
// rather than cosmetic. The model names a draw as most likely only ~6%
// of the time while draws happen ~32% of the time -- not because it
// thinks draws are rare, but because a draw is rarely the single highest
// cell even at a well-judged 27%. Hit rate cannot see a forecast that is
// right without being modal, so leading with it would understate a model
// that is well judged where it matters. The hit rate is still shown, next
// to the baseline it fails to beat.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  getModelAccuracySummary,
  getModelCalibration,
  MIN_BAND_FOR_CONFIDENCE,
  type ModelAccuracySummary,
  type CalibrationBand,
} from '../../lib/modelAccuracyApi';

export default function ModelAccuracyPage() {
  const [summary, setSummary] = useState<ModelAccuracySummary | null>(null);
  const [bands, setBands] = useState<CalibrationBand[]>([]);
  const [loading, setLoading] = useState(true);

  useDocumentHead({
    title: 'How accurate is the model?',
    description:
      'An honest record of how the Dixon-Coles predictions have performed against real results: calibration, hit rate, and the baselines worth beating.',
    path: '/football/model-accuracy',
  });

  useEffect(() => {
    Promise.all([getModelAccuracySummary(), getModelCalibration()])
      .then(([s, b]) => {
        setSummary(s);
        setBands(b);
      })
      .catch(() => {
        setSummary(null);
        setBands([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;

  if (!summary || summary.fixtures === 0) {
    return (
      <article>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">How accurate is the model?</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          No scored fixtures yet. Predictions are only counted once they&rsquo;ve been frozen before kickoff and the
          result has come in.
        </p>
      </article>
    );
  }

  const beatsHome = summary.hit_rate > summary.always_home_hit_rate;
  const beatsUniform = summary.model_brier < summary.uniform_brier;
  const solid = bands.filter((b) => b.forecasts >= MIN_BAND_FOR_CONFIDENCE);
  const worstSolidGap = solid.length
    ? solid.reduce((a, b) => (Math.abs(a.gap) >= Math.abs(b.gap) ? a : b))
    : null;

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Football &middot; Predict</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">How accurate is the model?</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Every prediction below was frozen before kickoff, so none of this is hindsight.{' '}
          <strong>{summary.fixtures} fixtures</strong> scored so far.
        </p>
      </header>

      <section className="border border-chalk-300 rounded-lg bg-white p-4">
        <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">The short version</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          Where most of its forecasts sit &mdash; the 20&ndash;50% range &mdash; the model is well calibrated
          {worstSolidGap && (
            <>
              : across {solid.reduce((s, b) => s + b.forecasts, 0)} forecasts in bands with enough data, the largest gap
              between predicted and actual is {Math.abs(worstSolidGap.gap).toFixed(1)} points
            </>
          )}
          . It is <strong>not</strong> better than simply backing the home team at picking winners, and on a sample this
          size neither result should be over-read.
        </p>
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Calibration</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          The fair test for a probability: when the model says 30%, does it happen 30% of the time? Every fixture
          contributes three forecasts &mdash; home, draw and away &mdash; because each is a claim that can be checked.
        </p>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
            <thead className="bg-chalk-200 text-ink-500">
              <tr>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Model said</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Forecasts</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Predicted</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Actual</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Gap</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b, i) => {
                const thin = b.forecasts < MIN_BAND_FOR_CONFIDENCE;
                return (
                  <tr key={b.band} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                    <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">{b.band}%</th>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{b.forecasts}</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{b.mean_predicted}%</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{b.actual_rate}%</td>
                    <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                      {thin ? (
                        // A 20-point gap on 8 forecasts is noise wearing a
                        // number's clothes. Say so rather than print it
                        // next to gaps built on 170.
                        <span className="text-ink-500" title="Too few forecasts to read">too few</span>
                      ) : (
                        <span className={Math.abs(b.gap) <= 3 ? 'text-pitch-800' : 'text-loss-700'}>
                          {b.gap > 0 ? '+' : ''}
                          {b.gap}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-ink-500 text-xs mt-2 max-w-prose">
          Bands holding fewer than {MIN_BAND_FOR_CONFIDENCE} forecasts are marked rather than scored: a couple of results
          swing them by twenty points, which says more about the sample than the model.
        </p>
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Picking winners</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          A harsher test, and one the model currently fails. Taking its most likely outcome as a pick:
        </p>
        <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="border border-chalk-300 rounded-lg bg-white p-3">
            <dt className="text-xs text-ink-500">Model hit rate</dt>
            <dd className="font-display text-xl text-ink-900">{summary.hit_rate}%</dd>
          </div>
          <div className="border border-chalk-300 rounded-lg bg-white p-3">
            <dt className="text-xs text-ink-500">Always pick home</dt>
            <dd className={`font-display text-xl ${beatsHome ? 'text-ink-900' : 'text-loss-700'}`}>
              {summary.always_home_hit_rate}%
            </dd>
          </div>
          <div className="border border-chalk-300 rounded-lg bg-white p-3">
            <dt className="text-xs text-ink-500">Brier score</dt>
            <dd className="font-display text-xl text-ink-900">{summary.model_brier}</dd>
          </div>
          <div className="border border-chalk-300 rounded-lg bg-white p-3">
            <dt className="text-xs text-ink-500">Always 33/33/33</dt>
            <dd className={`font-display text-xl ${beatsUniform ? 'text-ink-900' : 'text-loss-700'}`}>
              {summary.uniform_brier}
            </dd>
          </div>
        </dl>
        <p className="text-ink-700 text-sm mt-3 max-w-prose">
          Why the gap between this and the calibration above? A draw is almost never the single most likely scoreline,
          even when the model gives it a well-judged 27%. So &ldquo;pick the highest number&rdquo; throws away most of
          what the model knows, and a hit rate can&rsquo;t see a forecast that was right without being the favourite.
          Lower Brier is better; 0 is perfect.
        </p>
      </section>

      <section className="border border-chalk-300 rounded-lg bg-white p-4">
        <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">What this doesn&rsquo;t tell you</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          {summary.fixtures} fixtures over a few weeks is a small sample, and it only covers predictions made since
          scores began being frozen at kickoff. It measures whether recent live predictions worked &mdash; not whether
          the method works. Answering that properly means refitting the model at each point in history using only what
          was known then, and scoring it forward across seasons. That&rsquo;s a bigger exercise and it hasn&rsquo;t been
          done.
        </p>
      </section>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/football/projections" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Results projections
        </Link>
        <Link to="/football/market-efficiency" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Market efficiency
        </Link>
      </nav>
    </article>
  );
}
