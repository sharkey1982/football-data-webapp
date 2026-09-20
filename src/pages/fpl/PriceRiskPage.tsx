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
import { getPriceChangeRisk, type PriceRisk } from '../../lib/priceRiskApi';

// ONE table, sorted by pressure regardless of direction, because the
// question is "who is under most pressure" -- which two separate tables
// can't answer: the top faller might outrank every riser, and split
// tables hide that.
function RiskTable({ rows }: { rows: PriceRisk[] }) {
  if (rows.length === 0) return <p className="text-ink-500 text-sm">Nobody under meaningful pressure.</p>;
  // Fill the whole row, scaled to pressure relative to the strongest on
  // screen. Alpha rather than a fixed palette so the gradient is
  // continuous -- the eye reads "how urgent" from depth of colour
  // without consulting the number.
  const peak = Math.max(...rows.map((r) => Math.abs(r.pressure)), 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Player</th>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Way</th>
            <th scope="col" className="text-left font-medium text-xs px-3 py-2">Team</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Price</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Owned</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Net transfers</th>
            <th scope="col" className="text-right font-medium text-xs px-3 py-2">Pressure</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.fpl_player_id}
              style={{
                // Floor of 0.06 so even the weakest row carries its
                // direction; ceiling 0.42 keeps dark text readable at
                // the top of the scale.
                backgroundColor:
                  r.direction === 'rise'
                    ? `rgba(31, 92, 58, ${(0.06 + (Math.abs(r.pressure) / peak) * 0.36).toFixed(3)})`
                    : `rgba(155, 44, 44, ${(0.06 + (Math.abs(r.pressure) / peak) * 0.36).toFixed(3)})`,
              }}
            >
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
              <td className="px-3 py-1.5 text-xs whitespace-nowrap">
                <span
                  className={
                    r.direction === 'rise'
                      ? 'text-pitch-800 font-medium'
                      : 'text-loss-700 font-medium'
                  }
                >
                  {r.direction === 'rise' ? '\u2191 rise' : '\u2193 fall'}
                </span>
              </td>
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
                  r.direction === 'rise' ? 'text-pitch-800' : 'text-loss-700',
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
  // Was a "minimum risk band" filter. It could never change anything:
  // the tables show the top 15 by pressure, and 31 risers already sit in
  // the high band, so the top 15 are always high whatever is selected.
  // Direction is the filter that actually does something -- and on a
  // phone, two 15-row tables is a lot of scrolling to reach the one you
  // wanted.
  const [show, setShow] = useState<'both' | 'rise' | 'fall'>('both');

  useDocumentHead({
    title: 'Bullpit \u2014 FPL price change risk',
    description:
      'Which Fantasy Premier League players are under the most transfer pressure to rise or fall in price.',
    path: '/fpl/price-risk',
  });

  useEffect(() => {
    getPriceChangeRisk(13)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);


  const visible = useMemo(() => {
    const r = rows ?? [];
    return r
      .filter((x) => show === 'both' || x.direction === show)
      // Sorted on ABSOLUTE pressure, so the most urgent case leads
      // whichever direction it's heading.
      .sort((a, b) => Math.abs(b.pressure) - Math.abs(a.pressure))
      .slice(0, 25);
  }, [rows, show]);

  if (rows === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (rows.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Bullpit</h1>
        <p className="text-ink-700 mt-2">No transfer data is available right now.</p>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Predict</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Bullpit</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Who&rsquo;s under the most transfer pressure. Pressure is net transfers measured against a player&rsquo;s owner
          base, not the raw count &mdash; 20,000 net transfers is decisive for a player owned by 2% of squads and barely
          registers for one owned by 40%.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['both', 'Both'],
            ['rise', '\u2191 Rising'],
            ['fall', '\u2193 Falling'],
          ] as ['both' | 'rise' | 'fall', string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setShow(k)}
            className={[
              'text-sm rounded px-3 py-1.5 border transition-colors',
              k === show
                ? k === 'rise'
                  ? 'bg-pitch-800 text-chalk-100 border-pitch-800'
                  : k === 'fall'
                    ? 'bg-loss-700 text-chalk-100 border-loss-700'
                    : 'bg-ink-900 text-chalk-100 border-ink-900'
                : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
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
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
          Under most pressure
        </h2>
        <p className="text-ink-700 text-sm mt-1 max-w-prose">
          Ranked by pressure whichever way it points, so the most urgent case is first whether it&rsquo;s about to rise
          or fall.
        </p>
        <div className="mt-2">
          <RiskTable rows={visible} />
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
