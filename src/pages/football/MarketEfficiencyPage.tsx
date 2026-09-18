// ============================================================================
// src/pages/football/MarketEfficiencyPage.tsx
//
// How sharply each English division is priced by the betting market.
//
// Deliberately analysis, not tipping. Every number here describes what
// the market DID, historically; nothing suggests a bet. That framing is
// what keeps this a football-analytics site rather than a gambling one,
// which has real consequences for tone, audience, and which advertising
// and app-store rules apply.
//
// Uses closing odds -- the sharpest price a market reaches, after it has
// absorbed team news and money. Opening prices would flatter the market
// less and are a weaker benchmark.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { getMarketEfficiency, marginPct, type MarketEfficiencyRow } from '../../lib/marketApi';

const PYRAMID = ['E0', 'E1', 'E2', 'E3', 'EC'];

export default function MarketEfficiencyPage() {
  const [rows, setRows] = useState<MarketEfficiencyRow[] | null>(null);

  useDocumentHead({
    title: 'How sharply is each division priced?',
    description:
      'Bookmaker margin and historical returns across the Premier League, Championship, League One, League Two and National League, from closing odds on 17,800+ matches.',
    path: '/football/market-efficiency',
  });

  useEffect(() => {
    getMarketEfficiency(true)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  if (rows === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (rows.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Market efficiency</h1>
        <p className="text-ink-700 mt-2">No market data is available right now.</p>
      </div>
    );
  }

  const ordered = [...rows].sort((a, b) => PYRAMID.indexOf(a.league_code) - PYRAMID.indexOf(b.league_code));
  const total = ordered.reduce((s, r) => s + r.matches, 0);
  const sharpest = ordered.reduce((a, b) => (a.overround < b.overround ? a : b));
  const loosest = ordered.reduce((a, b) => (a.overround > b.overround ? a : b));
  const maxMargin = Math.max(...ordered.map((r) => marginPct(r.overround)));

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Football &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">How sharply is each division priced?</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Bookmakers build a margin into every market. Comparing that margin across the whole English pyramid &mdash;
          {' '}{total.toLocaleString()} matches of closing odds &mdash; shows where the market is competitive and where it
          isn&rsquo;t.
        </p>
        <p className="text-ink-500 text-sm mt-2 max-w-prose">
          This is analysis of what the market did, not betting advice. No strategy below made money.
        </p>
      </header>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Bookmaker margin</h2>
        <p className="text-ink-700 mt-1 max-w-prose">
          The margin rises steadily the further down you go. {sharpest.league_name} is priced most competitively at{' '}
          <strong>{marginPct(sharpest.overround)}%</strong>; {loosest.league_name} costs{' '}
          <strong>{marginPct(loosest.overround)}%</strong> &mdash; close to double. More competition and more money on the
          bigger leagues drives the margin down.
        </p>
        <div className="space-y-2 mt-3">
          {ordered.map((r) => {
            const m = marginPct(r.overround);
            return (
              <div key={r.league_code} className="flex items-center gap-3">
                <span className="w-32 sm:w-40 shrink-0 text-sm text-ink-700 truncate">{r.league_name}</span>
                <div className="flex-1 bg-chalk-200 rounded h-6 overflow-hidden">
                  <div className="bg-pitch-700 h-full rounded" style={{ width: `${(m / maxMargin) * 100}%` }} />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-sm tabular-nums">{m}%</span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Favourites and outsiders</h2>
        <p className="text-ink-700 mt-1 max-w-prose">
          Backing outsiders has lost far more than backing favourites in every division &mdash; the long-documented
          favourite&ndash;longshot bias, clearly present here. Both lose; outsiders lose harder.
        </p>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
            <thead className="bg-chalk-200 text-ink-500">
              <tr>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Division</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Matches</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Margin</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Favourites</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Outsiders</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Home</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Draw</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Away</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((r, i) => (
                <tr key={r.league_code} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                  <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">{r.league_name}</th>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.matches.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{marginPct(r.overround)}%</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.roi_favourite}%</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.roi_outsider}%</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.roi_home}%</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.roi_draw}%</td>
                  <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.roi_away}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-ink-500 text-xs mt-2 max-w-prose">
          Returns are per &pound;1 staked flat on every match, at average closing odds across the market. Every column is
          negative: the margin is the reason.
        </p>
      </section>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/football/leagues-compared" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          How the divisions compare
        </Link>
        <Link to="/football/discover" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          More to discover
        </Link>
      </nav>
    </article>
  );
}
