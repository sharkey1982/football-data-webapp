// ============================================================================
// src/pages/FinanceIndexPage.tsx
//
// /finance -- every club with published statutory accounts. Built from
// finance_published_periods, so it lists whichever clubs have data (only
// Southend at launch) without anything hard-coded. Accepts initialData for
// static generation.
// ============================================================================

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { getFinanceIndex, type FinanceIndexEntry } from '../lib/financeApi';
import { formatMoneyShort, fyLabel, scaled, signedMoney } from '../lib/financeFormat';

export default function FinanceIndexPage({ initialData }: { initialData?: FinanceIndexEntry[] } = {}) {
  const [entries, setEntries] = useState<FinanceIndexEntry[] | undefined>(initialData);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (initialData) return;
    let cancelled = false;
    getFinanceIndex()
      .then((e) => { if (!cancelled) setEntries(e); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [initialData]);

  useDocumentHead({
    title: 'Club finances \u2014 statutory accounts, explained',
    description: 'Football club finances from the accounts clubs file at Companies House: revenue, profit and loss, cash, borrowings and net assets, with every figure traceable to its source.',
    path: '/finance',
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-xs text-amber-600 uppercase tracking-widest">Statutory accounts</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">Club finances</h1>
        <p className="text-ink-700 max-w-prose">
          What clubs earn, spend, owe and hold &mdash; taken from the accounts they file by law at Companies House,
          with every figure traceable to the filing it came from. Clubs appear here once their accounts have been checked.
        </p>
      </header>

      {error && <p className="text-ink-700">The list of clubs could not be loaded just now. Please try again shortly.</p>}
      {!error && entries === undefined && <p className="text-ink-500">Loading clubs&hellip;</p>}
      {!error && entries && entries.length === 0 && <p className="text-ink-700">No club accounts have been published yet.</p>}

      {entries && entries.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2">
          {entries.map(({ team, latest, periodCount }) => {
            const rev = scaled(latest.revenue_total, latest.unit_scale);
            const pbt = scaled(latest.profit_before_tax, latest.unit_scale);
            const pbtText = signedMoney('profit_before_tax', pbt, 'Profit or loss before tax');
            return (
              <li key={team.team_id}>
                <Link to={`/football/teams/${team.slug}/finances`}
                  className="block rounded-lg border border-ink-500/20 bg-white/60 p-4 hover:border-amber-500 transition-colors">
                  <p className="font-display uppercase tracking-wide text-xl text-ink-900">{team.display_name}</p>
                  <p className="text-xs text-ink-500">{latest.reporting_entity}</p>
                  <p className="text-sm text-ink-700 mt-2">
                    {fyLabel(latest.period_end)}: revenue {formatMoneyShort(rev)} &middot; {pbtText.label.toLowerCase()} {pbtText.amount}
                  </p>
                  <p className="text-xs text-ink-500 mt-1">{periodCount} {periodCount === 1 ? 'year' : 'years'} of accounts</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
