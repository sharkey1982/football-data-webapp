// ============================================================================
// src/pages/football/ModelReturnsPage.tsx
//
// What the model's predictions would have returned as bets.
//
// Kept apart from Model Accuracy deliberately: accuracy is a property of the
// predictions, returns are a property of the predictions AND four choices a
// bettor makes. Those choices are controls here rather than assumptions
// buried in a query, because each one moves the answer.
//
// The page refuses to imply a verdict on a small sample. Roughly 100 bets
// against a 5% margin is noise, and saying so is the honest reading.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { getErrorMessage } from '../../lib/errorMessage';
import BetList from '../../components/betting/BetList';
import {
  getBettingBets,
  getBettingReturns,
  totalReturns,
  sampleIsThin,
  type BettingMarket,
  type BettingBet,
  type BettingReturnRow,
} from '../../lib/bettingApi';

const EDGES = [0.02, 0.05, 0.1];

// 2025/26 predictions are retro-fitted: today's model code, fitted week by
// week on only the results available before each match (match_predictions).
const SEASONS = [
  { value: '13', label: '2026/27' },
  { value: '12', label: '2025/26' },
];
const RETROFIT_SEASONS = new Set([12]);

function Toggle({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-500 mb-1">{label}</div>
      <div className="inline-flex rounded-lg border border-chalk-300 overflow-hidden text-sm">
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

export default function ModelReturnsPage() {
  const [edge, setEdge] = useState(0.05);
  const [market, setMarket] = useState<BettingMarket>('1x2');
  const [closing, setClosing] = useState(true);
  const [bestPrice, setBestPrice] = useState(true);
  const [seasonId, setSeasonId] = useState(13);
  const [rows, setRows] = useState<BettingReturnRow[] | null>(null);
  const [bets, setBets] = useState<BettingBet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useDocumentHead({
    title: 'Model returns',
    description:
      "What FixtureShark's predictions would have returned as bets, against real bookmaker prices, at whatever edge you ask for.",
  });

  useEffect(() => {
    let live = true;
    setRows(null);
    setBets(null);
    setError(null);
    const opts = { edge, market, closing, bestPrice, seasonId };
    Promise.all([getBettingReturns(opts), getBettingBets(opts)])
      .then(([r, b]) => {
        if (!live) return;
        setRows(r);
        setBets(b);
      })
      .catch((e) => live && setError(getErrorMessage(e, 'Could not work out the returns')));
    return () => {
      live = false;
    };
  }, [edge, market, closing, bestPrice, seasonId]);

  const totals = useMemo(() => (rows ? totalReturns(rows) : null), [rows]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl text-ink-900">Model returns</h1>
        <p className="text-sm text-ink-500 mt-1">
          What the predictions would have returned as bets, against real bookmaker prices. A bet is placed when the model&rsquo;s probability
          beats the price&rsquo;s implied probability by the edge you choose &mdash; compared against the raw price, so the bookmaker&rsquo;s
          margin counts against the model, as it would against you. Flat stakes of &pound;10.
        </p>
      </header>

      <div className="flex flex-wrap gap-4">
        <Toggle label="Season" value={String(seasonId)} onChange={(v) => setSeasonId(Number(v))} options={SEASONS} />
        <Toggle
          label="Edge"
          value={String(edge)}
          onChange={(v) => setEdge(Number(v))}
          options={EDGES.map((e) => ({ value: String(e), label: `${(e * 100).toFixed(0)}%` }))}
        />
        <Toggle
          label="Market"
          value={market}
          onChange={(v) => setMarket(v as BettingMarket)}
          options={[
            { value: '1x2', label: 'Home / draw / away' },
            { value: 'ou25', label: 'Over/under 2.5' },
          ]}
        />
        <Toggle
          label="Price"
          value={bestPrice ? 'best' : 'median'}
          onChange={(v) => setBestPrice(v === 'best')}
          options={[
            { value: 'best', label: 'Best of the books' },
            { value: 'median', label: 'Market average' },
          ]}
        />
        <Toggle
          label="Taken"
          value={closing ? 'closing' : 'early'}
          onChange={(v) => setClosing(v === 'closing')}
          options={[
            { value: 'closing', label: 'At the close' },
            { value: 'early', label: 'Earliest price' },
          ]}
        />
      </div>

      {RETROFIT_SEASONS.has(seasonId) && (
        <p className="text-xs text-ink-500">
          Retro-fitted: each match is predicted by a fit made from results before it, using today&rsquo;s model.
        </p>
      )}

      {error && <p className="text-sm text-loss-700">{error}</p>}
      {rows === null && !error && <p className="text-sm text-ink-500">Working it out&hellip;</p>}

      {rows !== null && rows.length === 0 && (
        <p className="text-sm text-ink-500">No bet clears that edge. Try a lower one.</p>
      )}

      {rows !== null && totals !== null && rows.length > 0 && (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <div className="border border-chalk-300 rounded-lg bg-white p-3">
              <div className="text-xs text-ink-500">Bets</div>
              <div className="font-display text-2xl text-ink-900">{totals.bets}</div>
            </div>
            <div className="border border-chalk-300 rounded-lg bg-white p-3">
              <div className="text-xs text-ink-500">Staked</div>
              <div className="font-display text-2xl text-ink-900">&pound;{totals.staked.toFixed(0)}</div>
            </div>
            <div className="border border-chalk-300 rounded-lg bg-white p-3">
              <div className="text-xs text-ink-500">Profit</div>
              <div className={`font-display text-2xl ${totals.profit >= 0 ? 'text-pitch-800' : 'text-loss-700'}`}>
                {totals.profit >= 0 ? '+' : '\u2212'}&pound;{Math.abs(totals.profit).toFixed(2)}
              </div>
            </div>
            <div className="border border-chalk-300 rounded-lg bg-white p-3">
              <div className="text-xs text-ink-500">Return on stakes</div>
              <div className={`font-display text-2xl ${(totals.roiPct ?? 0) >= 0 ? 'text-pitch-800' : 'text-loss-700'}`}>
                {(totals.roiPct ?? 0) >= 0 ? '+' : '\u2212'}
                {Math.abs(totals.roiPct ?? 0).toFixed(1)}%
              </div>
            </div>
          </section>

          {sampleIsThin(totals.bets) && (
            <div className="border border-amber-400 bg-chalk-100 rounded-lg p-3 text-sm text-ink-700">
              <b>Too few bets to mean anything.</b> {totals.bets} bets against a bookmaker&rsquo;s margin is noise, not evidence &mdash; the
              swing between these settings is luck at this size.
            </div>
          )}

          <section className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
            <table className="w-full text-sm" aria-label="Returns by selection">
              <thead className="bg-chalk-100 text-ink-700">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Selection</th>
                  <th className="text-right px-3 py-2 font-medium">Bets</th>
                  <th className="text-right px-3 py-2 font-medium">Won</th>
                  <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">Avg odds</th>
                  <th className="text-right px-3 py-2 font-medium hidden sm:table-cell">Avg edge</th>
                  <th className="text-right px-3 py-2 font-medium">Profit</th>
                  <th className="text-right px-3 py-2 font-medium">ROI</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.selection} className="border-t border-chalk-200">
                    <td className="px-3 py-2 text-ink-900">{r.selection}</td>
                    <td className="px-3 py-2 text-right font-mono">{r.bets}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-500">
                      {r.wins} ({r.hit_rate_pct.toFixed(0)}%)
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-ink-500 hidden sm:table-cell">{r.avg_odds.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-500 hidden sm:table-cell">{r.avg_edge_pct.toFixed(1)}%</td>
                    <td className={`px-3 py-2 text-right font-mono ${r.profit >= 0 ? 'text-pitch-800' : 'text-loss-700'}`}>
                      {r.profit >= 0 ? '+' : '\u2212'}&pound;{Math.abs(r.profit).toFixed(2)}
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${r.roi_pct >= 0 ? 'text-pitch-800' : 'text-loss-700'}`}>
                      {r.roi_pct >= 0 ? '+' : '\u2212'}
                      {Math.abs(r.roi_pct).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {bets !== null && bets.length > 0 && (
            <>
              <h2 className="font-display text-lg text-ink-900">Bets</h2>
              <BetList bets={bets} />
            </>
          )}

          <p className="text-xs text-ink-500">
            Prices are from Bet365, Bet&amp;Win and Pinnacle (not every match), plus football-data.co.uk&rsquo;s market best and
            market average across many more bookmakers. &ldquo;Best of the books&rdquo; takes the highest price on file;
            &ldquo;market average&rdquo; is closer to holding one account. Beating the closing price is the usual test of a real
            edge. See also{' '}
            <Link className="underline" to="/football/model-accuracy">
              Model Accuracy
            </Link>
            , which measures the predictions themselves.
          </p>
        </>
      )}
    </div>
  );
}
