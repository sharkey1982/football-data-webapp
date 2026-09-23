// ============================================================================
// src/components/betting/BetList.tsx
//
// Every bet behind the Model Returns totals: fixture, selection, the price
// taken, what the model thought, and the result. Tap a row for every price on
// file for that selection, so the price basis can be checked by eye.
// ============================================================================

import { Fragment, useMemo, useState } from 'react';
import { orderedPrices, type BettingBet } from '../../lib/bettingApi';

type SortKey = 'matchDate' | 'fixture' | 'selection' | 'modelP' | 'price' | 'edge' | 'profit';

const COLUMNS: { key: SortKey; label: string; align: 'left' | 'right'; hideMobile?: boolean }[] = [
  { key: 'matchDate', label: 'Date', align: 'left' },
  { key: 'fixture', label: 'Fixture', align: 'left' },
  { key: 'selection', label: 'Bet', align: 'left' },
  { key: 'modelP', label: 'Model', align: 'right', hideMobile: true },
  { key: 'price', label: 'Price', align: 'right' },
  { key: 'edge', label: 'Edge', align: 'right', hideMobile: true },
  { key: 'profit', label: 'P/L', align: 'right' },
];

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });

const sortValue = (b: BettingBet, k: SortKey): string | number =>
  k === 'fixture' ? `${b.homeTeam} ${b.awayTeam}` : (b[k] as string | number);

export default function BetList({ bets }: { bets: BettingBet[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('matchDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [open, setOpen] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const out = [...bets];
    out.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? c : -c;
    });
    return out;
  }, [bets, sortKey, sortDir]);

  const onSort = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(k);
      setSortDir(k === 'matchDate' || k === 'fixture' || k === 'selection' ? 'asc' : 'desc');
    }
  };

  return (
    <section className="border border-chalk-300 rounded-lg bg-white overflow-x-auto">
      <table className="w-full text-sm" aria-label="Bets placed">
        <thead className="bg-chalk-100 text-ink-700">
          <tr>
            {COLUMNS.map((c) => (
              <th
                key={c.key}
                aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                className={`px-3 py-2 font-medium ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.hideMobile ? 'hidden sm:table-cell' : ''}`}
              >
                <button type="button" onClick={() => onSort(c.key)} className="whitespace-nowrap">
                  {c.label}
                  {sortKey === c.key && <span className="ml-1">{sortDir === 'asc' ? '\u25b2' : '\u25bc'}</span>}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((b) => {
            const id = `${b.matchId}-${b.selection}`;
            const isOpen = open === id;
            return (
              <Fragment key={id}>
                <tr
                  className="border-t border-chalk-200 cursor-pointer hover:bg-chalk-100"
                  onClick={() => setOpen(isOpen ? null : id)}
                  aria-expanded={isOpen}
                >
                  <td className="px-3 py-2 text-ink-500 whitespace-nowrap">{fmtDate(b.matchDate)}</td>
                  <td className="px-3 py-2 text-ink-900">
                    {b.homeTeam} <span className="font-mono text-ink-500">{b.homeGoals}&ndash;{b.awayGoals}</span> {b.awayTeam}
                  </td>
                  <td className="px-3 py-2 text-ink-900 whitespace-nowrap">{b.selection}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-500 hidden sm:table-cell">{(b.modelP * 100).toFixed(1)}%</td>
                  <td className="px-3 py-2 text-right font-mono">{b.price.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right font-mono text-ink-500 hidden sm:table-cell">{(b.edge * 100).toFixed(1)}%</td>
                  <td className={`px-3 py-2 text-right font-mono ${b.won ? 'text-pitch-800' : 'text-loss-700'}`}>
                    {b.profit >= 0 ? '+' : '\u2212'}&pound;{Math.abs(b.profit).toFixed(2)}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-chalk-100">
                    <td colSpan={COLUMNS.length} className="px-3 py-2 text-xs text-ink-700">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {orderedPrices(b.prices).map((p) => (
                          <span key={p.code} className={p.price === b.price ? 'font-semibold text-ink-900' : ''}>
                            {p.name} <span className="font-mono">{p.price.toFixed(2)}</span>
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 text-ink-500">
                        Model {(b.modelP * 100).toFixed(1)}% vs price {(100 / b.price).toFixed(1)}%.
                        {b.predictedFrom && <> Predicted from the fit of {fmtDate(b.predictedFrom)}{b.retrofit ? ' (retro-fitted)' : ''}.</>}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
