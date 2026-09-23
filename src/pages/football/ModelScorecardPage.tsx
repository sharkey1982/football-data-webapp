// ============================================================================
// src/pages/football/ModelScorecardPage.tsx   (/football/model-scorecard)
//
// How good are the model's forecasts, judged against the betting market's
// closing prices on the same matches? Past seasons use point-in-time
// retro-fits, so every forecast was made from results before the match.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import {
  calibration,
  getCalibration,
  getScorecard,
  matches,
  score,
  scoreBy,
  type CalibrationRow,
  type Score,
  type ScorecardRow,
} from '../../lib/scorecardApi';

const DIVISIONS = [
  { value: 'all', label: 'All' },
  { value: '1', label: 'PL' },
  { value: '2', label: 'Champ' },
  { value: '3', label: 'L1' },
  { value: '4', label: 'L2' },
];
const DIVISION_NAME: Record<number, string> = { 1: 'Premier League', 2: 'Championship', 3: 'League One', 4: 'League Two', 5: 'National League' };
const SEASON_NAME: Record<number, string> = { 10: '2023/24', 11: '2024/25', 12: '2025/26', 13: '2026/27' };
const TEAM_TYPES: { key: ScorecardRow['team_type']; label: string; note: string }[] = [
  { key: 'estimated', label: 'Estimated rating', note: 'a team without enough matches in the division, rated from the division next door' },
  { key: 'relegated', label: 'Relegated team', note: 'came down this season, fitted from its own matches' },
  { key: 'promoted', label: 'Promoted team', note: 'came up this season, fitted from its own matches' },
  { key: 'established', label: 'Established teams', note: 'everything else' },
];
const PHASES = ['1 Aug-Oct', '2 Nov-Dec', '3 Jan-Mar', '4 Apr-May'];

const pct = (x: number | null, dp = 0) => (x === null ? '\u2013' : `${(x * 100).toFixed(dp)}%`);
const f3 = (x: number | null) => (x === null ? '\u2013' : x.toFixed(3));
const signed = (x: number | null) => (x === null ? '\u2013' : `${x > 0 ? '+' : x < 0 ? '\u2212' : ''}${Math.abs(x).toFixed(3)}`);
// Positive gap = model worse than market.
const gapClass = (x: number | null) => (x === null ? 'text-ink-500' : x <= 0 ? 'text-pitch-800' : x < 0.015 ? 'text-amber-600' : 'text-loss-700');

function Toggle({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-500 mb-1">{label}</div>
      <div className="inline-flex flex-wrap rounded-lg border border-chalk-300 overflow-hidden text-sm">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={o.value === value}
            onClick={() => onChange(o.value)}
            className={['px-3 py-1', o.value === value ? 'bg-pitch-700 text-chalk-100' : 'bg-white text-ink-700'].join(' ')}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ScoreTable({ label, rows }: { label: string; rows: { key: string; name: string; sub?: string; s: Score }[] }) {
  return (
    <section className="border border-chalk-300 rounded-lg bg-white overflow-x-auto">
      <table className="w-full text-sm" aria-label={label}>
        <thead className="bg-chalk-100 text-ink-700">
          <tr>
            <th className="text-left px-3 py-2 font-medium">{label}</th>
            <th className="text-right px-3 py-2 font-medium">Matches</th>
            <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">Model</th>
            <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">Market</th>
            <th className="text-right px-3 py-2 font-medium">Gap</th>
            <th className="text-right px-3 py-2 font-medium">Of market</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-chalk-200">
              <td className="px-3 py-2 text-ink-900">
                {r.name}
                {r.sub && <div className="text-xs text-ink-500">{r.sub}</div>}
              </td>
              <td className="px-3 py-2 text-right font-mono">{r.s.n}</td>
              <td className="px-3 py-2 text-right font-mono text-ink-500 hidden sm:table-cell">{f3(r.s.model)}</td>
              <td className="px-3 py-2 text-right font-mono text-ink-500 hidden sm:table-cell">{f3(r.s.market)}</td>
              <td className={`px-3 py-2 text-right font-mono ${gapClass(r.s.gap)}`}>{signed(r.s.gap)}</td>
              <td className="px-3 py-2 text-right font-mono">{pct(r.s.skillVsMarket)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function ModelScorecardPage() {
  const [rows, setRows] = useState<ScorecardRow[] | null>(null);
  const [calib, setCalib] = useState<CalibrationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [division, setDivision] = useState('all');
  const [season, setSeason] = useState('all');

  useDocumentHead({
    title: 'Model scorecard',
    description: "How FixtureShark's match forecasts compare with the betting market's closing prices, by division, season and type of team.",
  });

  useEffect(() => {
    let live = true;
    Promise.all([getScorecard(), getCalibration()])
      .then(([s, c]) => {
        if (!live) return;
        setRows(s);
        setCalib(c);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  const filter = useMemo(() => ({ leagueId: division === 'all' ? null : Number(division), seasonId: season === 'all' ? null : Number(season) }), [division, season]);
  const picked = useMemo(() => (rows ? rows.filter(matches(filter)) : []), [rows, filter]);
  const total = useMemo(() => score(picked), [picked]);
  const seasonOptions = useMemo(
    () => [{ value: 'all', label: 'All' }, ...[...new Set((rows ?? []).map((r) => r.season_id))].sort().map((s) => ({ value: String(s), label: (SEASON_NAME[s] ?? String(s)).slice(2) }))],
    [rows],
  );
  const byDivSeason = useMemo(
    () =>
      scoreBy(picked, (r) => `${r.league_id}|${r.season_id}`).map(({ key, s }) => {
        const [lg, sn] = key.split('|').map(Number);
        return { key, name: DIVISION_NAME[lg] ?? `League ${lg}`, sub: `${SEASON_NAME[sn] ?? sn}${sn === 13 ? ' (so far)' : ''}`, s };
      }),
    [picked],
  );
  const byType = useMemo(
    () => scoreBy(picked, (r) => r.team_type, TEAM_TYPES.map((t) => t.key)).map(({ key, s }) => {
      const t = TEAM_TYPES.find((x) => x.key === key)!;
      return { key, name: t.label, sub: t.note, s };
    }),
    [picked],
  );
  const byPhase = useMemo(() => scoreBy(picked, (r) => r.phase, PHASES).map(({ key, s }) => ({ key, name: key.slice(2), s })), [picked]);
  const calPoints = useMemo(() => (calib ? calibration(calib.filter(matches(filter))) : []), [calib, filter]);

  return (
    <div className="space-y-5">
      <header>
        <Link to="/football/model-returns" className="text-sm text-ink-500">&larr; Model returns</Link>
        <h1 className="font-display text-2xl text-ink-900 mt-2">Model scorecard</h1>
        <p className="text-sm text-ink-500 mt-1">
          How good the model&rsquo;s home/draw/away forecasts are, judged against the betting market&rsquo;s closing prices on the same
          matches. Past seasons use forecasts made only from results before each match. The measure is log-loss: the average penalty
          for how unlikely the forecast said the actual result was &mdash; lower is better. Guessing a third each scores 1.099.
        </p>
      </header>

      <div className="flex flex-wrap gap-4">
        <Toggle label="Division" value={division} onChange={setDivision} options={DIVISIONS} />
        <Toggle label="Season" value={season} onChange={setSeason} options={seasonOptions} />
      </div>

      {error && <p className="text-sm text-loss-700">{error}</p>}
      {!error && rows === null && <p className="text-sm text-ink-500">Loading&hellip;</p>}
      {rows !== null && total.n === 0 && <p className="text-sm text-ink-500">No forecasts with market prices for that selection yet.</p>}

      {rows !== null && total.n > 0 && (
        <>
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-label="Headline">
            <div className="border border-chalk-300 rounded-lg bg-white p-3">
              <div className="text-xs text-ink-500">Matches</div>
              <div className="font-display text-2xl text-ink-900">{total.n.toLocaleString('en-GB')}</div>
            </div>
            <div className="border border-chalk-300 rounded-lg bg-white p-3">
              <div className="text-xs text-ink-500">Model log-loss</div>
              <div className="font-display text-2xl text-ink-900">{f3(total.model)}</div>
            </div>
            <div className="border border-chalk-300 rounded-lg bg-white p-3">
              <div className="text-xs text-ink-500">Market log-loss</div>
              <div className="font-display text-2xl text-ink-900">{f3(total.market)}</div>
            </div>
            <div className="border border-chalk-300 rounded-lg bg-white p-3">
              <div className="text-xs text-ink-500">Of the market&rsquo;s skill</div>
              <div className={`font-display text-2xl ${(total.skillVsMarket ?? 0) >= 1 ? 'text-pitch-800' : 'text-ink-900'}`}>{pct(total.skillVsMarket)}</div>
            </div>
          </section>
          <p className="text-xs text-ink-500 -mt-2">
            &ldquo;Of the market&rsquo;s skill&rdquo;: how far the model gets from guessing towards the market&rsquo;s accuracy. 100% would
            match the closing prices; above 100% would beat them. Gap = model minus market, so negative is better.
          </p>

          {byDivSeason.length > 1 && <ScoreTable label="Division and season" rows={byDivSeason} />}
          <ScoreTable label="Type of team" rows={byType} />
          <ScoreTable label="Time of season" rows={byPhase} />

          <section className="border border-chalk-300 rounded-lg bg-white p-3 text-sm" aria-label="Draws and goals">
            <h2 className="font-display text-lg text-ink-900 mb-2">Draws and goals</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div />
              <div className="text-xs text-ink-500">Draws</div>
              <div className="text-xs text-ink-500">Goals a game</div>
              <div className="text-left text-ink-700">Model</div>
              <div className="font-mono">{pct(total.drawPredicted, 1)}</div>
              <div className="font-mono">{total.goalsPredicted?.toFixed(2) ?? '\u2013'}</div>
              <div className="text-left text-ink-700">Market</div>
              <div className="font-mono">{pct(total.drawMarket, 1)}</div>
              <div className="font-mono text-ink-500">&ndash;</div>
              <div className="text-left text-ink-700">Actual</div>
              <div className="font-mono">{pct(total.drawActual, 1)}</div>
              <div className="font-mono">{total.goalsActual?.toFixed(2) ?? '\u2013'}</div>
            </div>
          </section>

          {calPoints.length > 0 && (
            <section className="border border-chalk-300 rounded-lg bg-white p-3" aria-label="Calibration">
              <h2 className="font-display text-lg text-ink-900">Calibration</h2>
              <p className="text-xs text-ink-500 mb-2">
                When the model said a result had a given chance, how often it happened. A well-calibrated model&rsquo;s bars match.
                Groups with fewer than 30 forecasts are left out.
              </p>
              <div className="space-y-1.5">
                {calPoints.map((c) => (
                  <div key={`${c.outcome}${c.bin}`} className="grid grid-cols-[6.5rem_1fr_5.5rem] items-center gap-2 text-xs" data-testid="calibration-row">
                    <div className="text-ink-700">
                      {c.outcome} {c.bin * 10}&ndash;{c.bin * 10 + 10}%
                    </div>
                    <div className="space-y-0.5">
                      <div className="h-2 bg-chalk-200 rounded"><div className="h-2 bg-ink-500 rounded" style={{ width: `${c.predicted * 100}%` }} /></div>
                      <div className="h-2 bg-chalk-200 rounded"><div className="h-2 bg-pitch-700 rounded" style={{ width: `${c.happened * 100}%` }} /></div>
                    </div>
                    <div className="font-mono text-right text-ink-700">
                      {pct(c.predicted)} &rarr; {pct(c.happened)}
                      <div className="text-ink-500">n={c.n}</div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-ink-500 mt-2">
                <span className="text-ink-500">Grey</span>: forecast. <span className="text-pitch-700">Green</span>: what happened.
              </p>
            </section>
          )}

          <p className="text-xs text-ink-500">
            Every league match with a forecast and closing market-average odds. The market&rsquo;s probabilities have its margin removed, so
            the comparison is like for like. Refreshed twice a day. Before 2026/27 the forecasts are retro-fits: today&rsquo;s model, fitted on
            only the results available before each match. How the model changes over time is logged on{' '}
            <Link to="/admin/model" className="underline">Model versions and changes</Link>.
          </p>
        </>
      )}
    </div>
  );
}
