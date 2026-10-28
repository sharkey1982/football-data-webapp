// ============================================================================
// src/pages/FinanceMovesPage.tsx
//
// /finance/promotion-relegation -- what promotion and relegation did to
// clubs' accounts: the last season before the move against the first season
// after it. One summary card per kind of move (with medians that leave out
// non-comparable years, and say so), then every move in a sortable table
// linking to each club's finance page. Rules live in src/lib/financeMoves.ts.
// Accepts initialData for static generation.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { getAllClubFinance, divisionShort } from '../lib/financeApi';
import { fyLabel, formatMoneyShort } from '../lib/financeFormat';
import { allMoves, groupMoves, groupTakeaway, MIN_FOR_MEDIAN, MOVES_DESCRIPTION, type FinanceMove, type MoveGroup } from '../lib/financeMoves';

const nd = <span className="text-ink-500">n/d</span>;
const m = (v: number | null) => (v == null ? nd : formatMoneyShort(v));
const pct = (v: number | null) => (v == null ? nd : `${Math.round(v * 100)}%`);
const signedPct = (v: number | null) => (v == null ? nd : `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v) * 100)}%`);

function GroupCard({ g }: { g: MoveGroup }) {
  const up = g.direction === 'promoted';
  const left = g.moves.length - g.comparableCount;
  return (
    <section className="rounded-lg border border-ink-500/20 bg-white/60 p-4 space-y-2" data-testid="move-group">
      <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">
        <span aria-hidden="true" className={up ? 'text-pitch-800' : 'text-loss-600'}>{up ? '▲ ' : '▼ '}</span>
        {up ? 'Promoted' : 'Relegated'}: {g.from.league_name} to {g.to.league_name}
      </h2>
      <p className="text-sm text-ink-700">{g.moves.length} move{g.moves.length === 1 ? '' : 's'}: {g.moves.map((mv) => `${mv.team.display_name} (${fyLabel(mv.after.period_end)})`).join(', ')}.</p>
      {groupTakeaway(g) && <p className="text-sm text-ink-900">{groupTakeaway(g)}</p>}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
        <div><dt className="text-xs text-ink-500">Median revenue change</dt><dd className="font-mono">{signedPct(g.medianRevenueChange)}</dd></div>
        <div><dt className="text-xs text-ink-500">Median broadcast &amp; league change</dt><dd className="font-mono">{signedPct(g.medianBroadcastChange)}</dd></div>
        <div><dt className="text-xs text-ink-500">Median wages / revenue</dt><dd className="font-mono">{pct(g.medianWagesBefore)} → {pct(g.medianWagesAfter)}</dd></div>
        <div><dt className="text-xs text-ink-500">Pre-tax loss the season after</dt><dd className="font-mono">{g.lossesAfter.of ? `${g.lossesAfter.losses} of ${g.lossesAfter.of}` : nd}</dd></div>
      </dl>
      {g.comparableCount < MIN_FOR_MEDIAN && <p className="text-xs text-ink-500">Too few comparable moves for a median yet.</p>}
      {left > 0 && g.comparableCount >= MIN_FOR_MEDIAN && (
        <p className="text-xs text-ink-500">Medians leave out {left} move{left === 1 ? '' : 's'} where a year isn&rsquo;t comparable (†).</p>
      )}
    </section>
  );
}

type Col = { key: string; label: string; get: (mv: FinanceMove) => number | null; fmt: (v: number | null) => React.ReactNode };
const COLS: Col[] = [
  { key: 'revB', label: 'Revenue before', get: (mv) => mv.revenueBefore, fmt: m },
  { key: 'revA', label: 'Revenue after', get: (mv) => mv.revenueAfter, fmt: m },
  { key: 'revC', label: 'Change', get: (mv) => mv.revenueChange, fmt: signedPct },
  { key: 'bcC', label: 'Broadcast change', get: (mv) => mv.broadcastChange, fmt: signedPct },
  { key: 'wB', label: 'Wages before', get: (mv) => mv.wagesBefore, fmt: pct },
  { key: 'wA', label: 'Wages after', get: (mv) => mv.wagesAfter, fmt: pct },
  { key: 'pB', label: 'Pre-tax before', get: (mv) => mv.pbtBefore, fmt: m },
  { key: 'pA', label: 'Pre-tax after', get: (mv) => mv.pbtAfter, fmt: m },
];

export default function FinanceMovesPage({ initialData }: { initialData?: FinanceMove[] } = {}) {
  const [moves, setMoves] = useState<FinanceMove[] | undefined>(initialData);
  const [error, setError] = useState(false);
  const [dir, setDir] = useState<'all' | 'promoted' | 'relegated'>('all');
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    getAllClubFinance()
      .then((d) => { if (!cancelled) setMoves(allMoves(d)); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [initialData]);

  useDocumentHead({ title: 'Promotion and Relegation: the Money', description: MOVES_DESCRIPTION, path: '/finance/promotion-relegation' });

  const groups = useMemo(() => groupMoves(moves ?? []), [moves]);

  if (error) return <p className="text-ink-700">The accounts could not be loaded just now. Please try again shortly.</p>;
  if (!moves) return <p className="text-ink-500">Loading accounts&hellip;</p>;

  const shown = moves.filter((mv) => dir === 'all' || mv.direction === dir);
  const col = sort ? COLS.find((c) => c.key === sort.key) : undefined;
  const rows = col && sort ? [...shown].sort((a, b) => {
    const va = col.get(a), vb = col.get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (va - vb) * sort.dir;
  }) : shown;
  const btn = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? 'border-pitch-800 bg-pitch-800 text-chalk-100' : 'border-ink-500/30 text-ink-700 hover:border-pitch-800'}`;
  const count = (d: 'promoted' | 'relegated') => moves.filter((mv) => mv.direction === d).length;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <p className="text-sm"><Link to="/finance" className="text-pitch-800 underline underline-offset-2">The Boardroom</Link></p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">Promotion and relegation: the money</h1>
        <p className="text-sm text-ink-700 max-w-prose">
          Every time a club with published accounts changed division, comparing the last season before the move with the first season after it.
          Divisions are the ones played in during the season each set of accounts covers.
        </p>
      </header>

      {moves.length === 0 ? (
        <p className="text-ink-700">No club with published accounts has changed division between two consecutive years yet.</p>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">{groups.map((g) => <GroupCard key={g.key} g={g} />)}</div>

          <section aria-labelledby="moves-h" className="space-y-2">
            <h2 id="moves-h" className="font-display uppercase tracking-wide text-lg text-ink-900">Every move</h2>
            <div role="group" aria-label="Direction" className="flex flex-wrap gap-2">
              <button type="button" className={btn(dir === 'all')} aria-pressed={dir === 'all'} onClick={() => setDir('all')}>All ({moves.length})</button>
              <button type="button" className={btn(dir === 'promoted')} aria-pressed={dir === 'promoted'} onClick={() => setDir('promoted')}>Promoted ({count('promoted')})</button>
              <button type="button" className={btn(dir === 'relegated')} aria-pressed={dir === 'relegated'} onClick={() => setDir('relegated')}>Relegated ({count('relegated')})</button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-ink-500/20" tabIndex={0} role="region" aria-labelledby="moves-h">
              <table className="min-w-full text-sm">
                <caption className="sr-only">Each promotion or relegation: the season before against the season after; select a column heading to sort</caption>
                <thead className="bg-chalk-200">
                  <tr>
                    <th scope="col" className="sticky left-0 bg-chalk-200 text-left px-3 py-2 font-mono text-xs font-normal text-ink-500">Club</th>
                    <th scope="col" className="px-3 py-2 text-left font-mono text-xs font-normal text-ink-500">Move</th>
                    {COLS.map((c) => (
                      <th key={c.key} scope="col" aria-sort={sort?.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className="px-3 py-2 text-right">
                        <button type="button" className="font-mono text-xs text-ink-700 hover:text-pitch-800"
                          onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key ? ((-s.dir) as 1 | -1) : -1 }))}>
                          {c.label}{sort?.key === c.key ? (sort.dir === -1 ? ' ▼' : ' ▲') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((mv) => (
                    <tr key={`${mv.team.team_id}-${mv.after.period_end}`} className="border-t border-ink-500/10" data-testid="move-row">
                      <th scope="row" className="sticky left-0 bg-chalk-100 text-left px-3 py-1.5 font-normal whitespace-nowrap">
                        <Link to={`/football/teams/${mv.team.slug}/finances`} className="text-pitch-800 underline underline-offset-2">{mv.team.display_name}</Link>
                        <span className="text-ink-500 text-xs"> {fyLabel(mv.before.period_end)}→{fyLabel(mv.after.period_end)}{mv.comparable ? '' : ' †'}</span>
                      </th>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className={mv.direction === 'promoted' ? 'text-pitch-800' : 'text-loss-600'}>{mv.direction === 'promoted' ? '▲' : '▼'}</span>{' '}
                        {divisionShort(mv.from)} → {divisionShort(mv.to)}
                      </td>
                      {COLS.map((c) => {
                        const v = c.get(mv);
                        return <td key={c.key} className={`px-3 py-1.5 text-right font-mono whitespace-nowrap ${v != null && v < 0 ? 'text-loss-600' : ''}`}>{c.fmt(v)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-500">
              Before = the last season in the old division; after = the first season in the new one. Broadcast change = broadcasting and league income (including parachute payments where clubs report them there). Wages = staff costs as a share of revenue.
              n/d not disclosed · † a year that isn&rsquo;t comparable (a period other than 12 months, a switch between company and group accounts, or a restatement), left out of the medians
              · PL Premier League, Champ Championship, L1 League One, L2 League Two, NL National League · in pounds, from clubs&rsquo; statutory accounts
            </p>
          </section>
        </>
      )}
    </div>
  );
}
