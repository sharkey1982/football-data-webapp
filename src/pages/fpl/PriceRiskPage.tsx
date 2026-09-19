// ============================================================================
// src/pages/fpl/PriceRiskPage.tsx
//
// Who's under pressure to rise or fall tonight.
//
// Predict, not Discover: this is a claim about what will happen, unlike
// the Transfer Window's record of what managers have already done.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { getPriceChangeRisk, riskBands, bandOf, type PriceRisk, type RiskBand } from '../../lib/priceRiskApi';

function RiskTable({ rows, kind }: { rows: PriceRisk[]; kind: 'rise' | 'fall' }) {
  if (rows.length === 0) return <p className="text-ink-500 text-sm">Nobody under meaningful pressure.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Player</th>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Team</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Price</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Owned</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Net transfers</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Pressure</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.fpl_player_id} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
              <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
                {r.slug ? (
                  <Link to={`/fpl/players/${r.slug}`} className="text-pitch-800 underline underline-offset-2">
                    {r.web_name}
                  </Link>
                ) : (
                  r.web_name
                )}
                <span className="text-ink-500"> {r.position_label}</span>
              </th>
              <td className="px-3 py-1.5 text-xs text-ink-700">{r.team_name ?? '\u2014'}</td>
              <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">&pound;{r.price.toFixed(1)}m</td>
              <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.ownership.toFixed(1)}%</td>
              <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">
                {r.net_transfers > 0 ? '+' : ''}
                {r.net_transfers.toLocaleString()}
              </td>
              <td
                className={[
                  'px-3 py-1.5 text-right font-mono text-xs tabular-nums font-medium',
                  kind === 'rise' ? 'text-pitch-800' : 'text-loss-700',
                ].join(' ')}
              >
                {Math.abs(r.pressure).toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PriceRiskPage() {
  const [rows, setRows] = useState<PriceRisk[] | null>(null);
  const [minBand, setMinBand] = useState<RiskBand | 'all'>('all');

  useDocumentHead({
    title: 'The Trading Floor \u2014 FPL price change risk',
    description:
      'Which Fantasy Premier League players are under the most transfer pressure to rise or fall in price.',
    path: '/fpl/price-risk',
  });

  useEffect(() => {
    getPriceChangeRisk(13)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const bands = useMemo(() => riskBands(rows ?? []), [rows]);

  const { risers, fallers } = useMemo(() => {
    const r = rows ?? [];
    const keep = (x: PriceRisk) => {
      if (minBand === 'all') return true;
      const b = bandOf(x, bands);
      // "medium" means medium AND high -- a filter that excluded the
      // most urgent cases would be the opposite of what's wanted.
      return minBand === 'high' ? b === 'high' : b !== 'low';
    };
    return {
      risers: r.filter((x) => x.direction === 'rise' && keep(x)).slice(0, 15),
      fallers: r.filter((x) => x.direction === 'fall' && keep(x)).slice(0, 15),
    };
  }, [rows, minBand, bands]);

  if (rows === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (rows.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">The Trading Floor</h1>
        <p className="text-ink-700 mt-2">No transfer data is available right now.</p>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Predict</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">The Trading Floor</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Who&rsquo;s under the most transfer pressure. Pressure is net transfers measured against a player&rsquo;s owner
          base, not the raw count &mdash; 20,000 net transfers is decisive for a player owned by 2% of squads and barely
          registers for one owned by 40%.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'Everyone'],
            ['medium', 'Notable'],
            ['high', 'High risk'],
          ] as [RiskBand | 'all', string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMinBand(k)}
            className={[
              'text-sm rounded px-3 py-1.5 border transition-colors',
              k === minBand ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="border border-chalk-300 rounded-lg bg-white p-4">
        <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">What this can and can&rsquo;t tell you</h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          FPL doesn&rsquo;t publish its price-change threshold. It moves with ownership, resets each gameweek, and the
          actual algorithm isn&rsquo;t known outside the game. So this ranks pressure rather than calling a change: a
          player at the top is far likelier to move tonight than one at the bottom, but no figure here is a prediction
          that they will.
        </p>
        <p className="text-ink-500 text-sm mt-2 max-w-prose">
          &ldquo;High risk&rdquo; means the top tenth of today&rsquo;s pressure, not a fixed number. Transfer activity
          swings enormously around deadlines and falls away mid-week, so a fixed threshold would call everyone high risk
          on a Friday and nobody on a Tuesday.
        </p>
        <p className="text-ink-500 text-sm mt-2 max-w-prose">
          Snapshots are taken daily, so this reflects the position as of the last capture rather than the live count.
          Dedicated price-change sites poll hourly and will be sharper on the exact moment.
        </p>
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Under pressure to rise</h2>
        <div className="mt-2">
          <RiskTable rows={risers} kind="rise" />
        </div>
      </section>

      <section>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Under pressure to fall</h2>
        <div className="mt-2">
          <RiskTable rows={fallers} kind="fall" />
        </div>
      </section>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/market" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          What managers have already done
        </Link>
        <Link to="/fpl/start/predict" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          More projections
        </Link>
      </nav>
    </article>
  );
}
