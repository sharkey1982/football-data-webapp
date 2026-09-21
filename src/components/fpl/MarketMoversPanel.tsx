// ============================================================================
// src/components/fpl/MarketMoversPanel.tsx
//
// The transfer window: price risers and fallers, ownership swings and
// availability news over the last seven days. Formerly the whole of the
// /fpl/market page; now the lower half of "In the papers", beneath the
// gameweek's headlines. Factual throughout -- no projections.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFplMarketMovers, type FplMover } from '../../lib/fplMarketApi';

type Tab = 'risers' | 'fallers' | 'owned' | 'news';

const TABS: { key: Tab; label: string; blurb: string }[] = [
  { key: 'risers', label: 'Price risers', blurb: 'Players the market has pushed up.' },
  { key: 'fallers', label: 'Price fallers', blurb: 'Players being sold off.' },
  { key: 'owned', label: 'Ownership swings', blurb: 'Where managers are moving, regardless of price.' },
  { key: 'news', label: 'Availability news', blurb: 'Doubts, injuries and suspensions as reported by FPL.' },
];

function MoverRow({ m, metric }: { m: FplMover; metric: 'price' | 'ownership' }) {
  const change = metric === 'price' ? m.price_change : m.ownership_change;
  const sign = change > 0 ? '+' : '';
  return (
    <tr className="odd:bg-chalk-100/60">
      <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal">
        {m.slug ? (
          <Link to={`/fpl/players/${m.slug}`} className="text-pitch-800 underline underline-offset-2">
            {m.web_name}
          </Link>
        ) : (
          m.web_name
        )}
      </th>
      <td className="px-3 py-1.5 text-xs text-ink-700">{m.team_name ?? '\u2014'}</td>
      <td className="px-3 py-1.5 text-xs text-ink-500">{m.position_label}</td>
      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">&pound;{m.price_now.toFixed(1)}m</td>
      <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{m.ownership_now.toFixed(1)}%</td>
      <td
        className={[
          'px-3 py-1.5 text-right font-mono text-xs tabular-nums',
          change > 0 ? 'text-pitch-800' : change < 0 ? 'text-loss-700' : 'text-ink-500',
        ].join(' ')}
      >
        {sign}
        {metric === 'price' ? `\u00a3${change.toFixed(1)}m` : `${change.toFixed(1)}%`}
      </td>
    </tr>
  );
}

export default function MarketMoversPanel() {
  const [movers, setMovers] = useState<FplMover[] | null>(null);
  const [tab, setTab] = useState<Tab>('risers');


  useEffect(() => {
    getFplMarketMovers(7)
      .then(setMovers)
      .catch(() => setMovers([]));
  }, []);

  const view = useMemo(() => {
    if (!movers) return [];
    switch (tab) {
      case 'risers':
        return movers.filter((m) => m.price_change > 0).sort((a, b) => b.price_change - a.price_change || b.ownership_now - a.ownership_now).slice(0, 20);
      case 'fallers':
        return movers.filter((m) => m.price_change < 0).sort((a, b) => a.price_change - b.price_change || b.ownership_now - a.ownership_now).slice(0, 20);
      case 'owned':
        return movers.filter((m) => Math.abs(m.ownership_change) >= 0.1).sort((a, b) => Math.abs(b.ownership_change) - Math.abs(a.ownership_change)).slice(0, 20);
      case 'news':
        return movers.filter((m) => m.news).sort((a, b) => b.ownership_now - a.ownership_now).slice(0, 20);
    }
  }, [movers, tab]);

  if (movers === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (movers.length === 0) {
    return (
      <div>
        <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">The transfer window</h2>
        <p className="text-ink-700 mt-2">No snapshot data is available yet.</p>
      </div>
    );
  }

  const window_ = movers[0];
  const metric = tab === 'owned' ? 'ownership' : 'price';
  const active = TABS.find((t) => t.key === tab)!;

  return (
    <section aria-labelledby="market-h" className="space-y-4">
      <header>
        <h2 id="market-h" className="font-display uppercase tracking-wide text-xl text-ink-900">The transfer window</h2>
        <p className="text-ink-700 mt-1 max-w-prose text-sm">
          The longer view: what managers have been doing over the last seven days &mdash; prices, ownership and
          availability, captured daily from the official game.
        </p>
        <p className="text-xs text-ink-500 font-mono mt-1">
          Movement measured from <time dateTime={window_.from_date}>{window_.from_date}</time> to{' '}
          <time dateTime={window_.to_date}>{window_.to_date}</time>
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              'text-sm rounded px-3 py-1.5 border transition-colors',
              t.key === tab ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-ink-700 text-sm">{active.blurb}</p>

      {tab === 'news' ? (
        <ul className="space-y-2">
          {view.map((m) => (
            <li key={m.fpl_player_id} className="border border-chalk-300 rounded-lg bg-white p-3">
              <p className="text-sm">
                <span className="font-medium text-ink-900">{m.web_name}</span>{' '}
                <span className="text-ink-500">
                  {m.team_name} &middot; {m.ownership_now.toFixed(1)}% owned
                </span>
              </p>
              <p className="text-sm text-ink-700 mt-0.5">{m.news}</p>
            </li>
          ))}
          {view.length === 0 && <li className="text-sm text-ink-500">No availability news right now.</li>}
        </ul>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
            <thead className="bg-chalk-200 text-ink-500">
              <tr>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Player</th>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Team</th>
                <th scope="col" className="text-left font-medium text-xs px-3 py-2">Pos</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Price</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Owned</th>
                <th scope="col" className="text-right font-medium text-xs px-3 py-2">Change</th>
              </tr>
            </thead>
            <tbody>
              {view.map((m) => (
                <MoverRow key={m.fpl_player_id} m={m} metric={metric} />
              ))}
              {view.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-ink-500 text-xs">
                    No movement in this window yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </section>
  );
}
