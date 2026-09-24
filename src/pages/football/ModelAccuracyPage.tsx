// ============================================================================
// src/pages/football/ModelAccuracyPage.tsx
//
// How accurate the model has been. Two different questions, both answered:
// - "Is the method sound?" -- the walk-forward backtest (retro-fits: refit
//   weekly on only past results, predict the next week, score against the
//   closing market; 3 seasons, 4 divisions, 5,000+ matches). This is the
//   out-of-sample evidence the page used to say didn't exist (see
//   docs/incidents.md / OUTSTANDING.md, corrected 2026-09-24).
// - "Are this week's live predictions on track?" -- the original live
//   section below: every fixture frozen before kickoff since that started,
//   a small sample that only reflects recent weeks and today's settings.
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
import { getScorecard, score, type ScorecardRow } from '../../lib/scorecardApi';

const DIVISION_NAME: Record<number, string> = { 1: 'Premier League', 2: 'Championship', 3: 'League One', 4: 'League Two' };
const f3 = (x: number | null) => (x === null ? '\u2013' : x.toFixed(3));
const pct = (x: number | null) => (x === null ? '\u2013' : `${(x * 100).toFixed(0)}%`);

export default function ModelAccuracyPage() {
  const [summary, setSummary] = useState<ModelAccuracySummary | null>(null);
  const [bands, setBands] = useState<CalibrationBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [scorecard, setScorecard] = useState<ScorecardRow[] | null>(null);

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
    // Fetched separately: a scorecard hiccup shouldn't take down the live
    // section above, which has worked reliably since the restructure.
    getScorecard()
      .then(setScorecard)
      .catch(() => setScorecard([]));
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

      {scorecard !== null && scorecard.length > 0 && (
        <section className="border border-chalk-300 rounded-lg bg-white p-4" aria-label="Out of sample backtest">
          <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Does the method work?</h2>
          {(() => {
            const t = score(scorecard);
            const seasons = [...new Set(scorecard.map((r) => r.season_id))].length;
            const divisions = [...new Set(scorecard.map((r) => r.league_id))]
              .sort((a, b) => a - b)
              .map((d) => DIVISION_NAME[d] ?? `League ${d}`);
            return (
              <>
                <p className="text-ink-700 text-sm mt-1 max-w-prose">
                  Answered properly: refit the model at each point in history using only results known then, predict the
                  following week, and score every forecast against that week&rsquo;s closing betting price &mdash; a fair,
                  independent judge with no stake in the answer.{' '}
                  <strong>
                    {t.n.toLocaleString('en-GB')} matches
                  </strong>{' '}
                  across {seasons} seasons and {divisions.join(', ')}, none of it hindsight.
                </p>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                  <div className="border border-chalk-300 rounded-lg p-3">
                    <dt className="text-xs text-ink-500">Model log-loss</dt>
                    <dd className="font-display text-xl text-ink-900">{f3(t.model)}</dd>
                  </div>
                  <div className="border border-chalk-300 rounded-lg p-3">
                    <dt className="text-xs text-ink-500">Market log-loss</dt>
                    <dd className="font-display text-xl text-ink-900">{f3(t.market)}</dd>
                  </div>
                  <div className="border border-chalk-300 rounded-lg p-3">
                    <dt className="text-xs text-ink-500">Of the market&rsquo;s skill</dt>
                    <dd className={`font-display text-xl ${(t.skillVsMarket ?? 0) >= 1 ? 'text-pitch-800' : 'text-ink-900'}`}>
                      {pct(t.skillVsMarket)}
                    </dd>
                  </div>
                  <div className="border border-chalk-300 rounded-lg p-3">
                    <dt className="text-xs text-ink-500">Guessing (33/33/33)</dt>
                    <dd className="font-display text-xl text-ink-900">1.099</dd>
                  </div>
                </dl>
                <p className="text-ink-700 text-sm mt-3 max-w-prose">
                  &ldquo;Of the market&rsquo;s skill&rdquo; is how far the model gets from guessing towards the closing
                  market&rsquo;s accuracy &mdash; lower log-loss is better, 100% would match the market, and beating it is
                  the bar that would need clearing before the model&rsquo;s edge could be expected to show a profit. It
                  doesn&rsquo;t clear it yet; the breakdown by division, season and time of year is on the{' '}
                  <Link to="/football/model-scorecard" className="text-pitch-800 underline underline-offset-2">
                    full scorecard
                  </Link>
                  , and every change made because of it is logged on{' '}
                  <Link to="/admin/model" className="text-pitch-800 underline underline-offset-2">
                    model versions and changes
                  </Link>
                  .
                </p>
              </>
            );
          })()}
        </section>
      )}

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
        <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">What the sections above don&rsquo;t tell you</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          {summary.fixtures} fixtures over a few weeks is a small sample: it&rsquo;s a freshness check on live
          predictions, not proof the method works &mdash; that&rsquo;s what the backtest above is for. The backtest has
          its own limits: it covers the English men&rsquo;s divisions only, three seasons so far, and reflects the model
          as it was fitted at each point in history &mdash; a settings change made today doesn&rsquo;t retroactively
          improve it. Neither section says anything about markets or seasons outside what&rsquo;s shown.
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
