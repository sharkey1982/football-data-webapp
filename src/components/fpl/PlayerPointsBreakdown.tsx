// ============================================================================
// src/components/fpl/PlayerPointsBreakdown.tsx
//
// "Where the points come from": each upcoming gameweek's projected points
// split by source -- appearance, goals, assists, clean sheet, defensive
// contributions, bonus and so on. The parts come straight from the
// projection rows and add up to the projected total EXACTLY (checked: a gap
// of 0.0000 across all 7,322 current projections), so this is the model's
// own arithmetic, not an estimate of it.
//
// Pure and synchronous, so it is in the pre-rendered HTML. Categories that
// are zero across every gameweek shown (saves for an outfield player) are
// left out rather than filling the table with zeroes.
// ============================================================================

import { BREAKDOWN_PARTS, type PlayerPageGameweek } from '../../lib/fplPlayerPageApi';

export default function PlayerPointsBreakdown({ season }: { season: PlayerPageGameweek[] }) {
  const rows = season.filter((g) => g.status !== 'played' && g.breakdown && g.projected_points != null).slice(0, 8);
  if (rows.length === 0) return null;
  const parts = BREAKDOWN_PARTS.filter((p) => rows.some((g) => Math.abs(g.breakdown![p.key]) >= 0.005));
  const sum = (key: (typeof BREAKDOWN_PARTS)[number]['key']) => rows.reduce((s, g) => s + g.breakdown![key], 0);
  const total = rows.reduce((s, g) => s + (g.projected_points ?? 0), 0);
  const fmt = (v: number) => (Math.abs(v) < 0.005 ? '\u2013' : v.toFixed(2));
  // The biggest source over the period, in words, for the lead-in.
  const top = [...parts].sort((a, b) => sum(b.key) - sum(a.key))[0];

  return (
    <section aria-labelledby="breakdown-h">
      <h2 id="breakdown-h" className="font-display uppercase tracking-wide text-lg text-ink-900">Where the points come from</h2>
      <p className="text-ink-700 mt-1 text-sm">
        Projected points by source over the next {rows.length} gameweek{rows.length === 1 ? '' : 's'}
        {top && total > 0 && <> &mdash; the biggest share ({Math.round((sum(top.key) / total) * 100)}%) from <strong>{top.label.toLowerCase()}</strong></>}.
      </p>
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
          <caption className="sr-only">Projected points by source for each upcoming gameweek</caption>
          <thead className="bg-chalk-200 text-ink-500">
            <tr>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2 whitespace-nowrap">Gameweek</th>
              {parts.map((p) => (
                <th key={p.key} scope="col" className="text-right font-medium text-xs px-2 py-2 whitespace-nowrap">{p.label}</th>
              ))}
              <th scope="col" className="text-right font-medium text-xs px-3 py-2 whitespace-nowrap sticky right-0 bg-chalk-200">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={g.matchweek} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                <th scope="row" className="text-left px-3 py-1.5 font-mono text-xs font-normal whitespace-nowrap">
                  GW{g.matchweek} <span className="text-ink-500">{g.is_home ? 'v' : '@'} {g.opponent_name}</span>
                </th>
                {parts.map((p) => (
                  <td key={p.key} className={['text-right px-2 py-1.5 font-mono text-xs tabular-nums', g.breakdown![p.key] < 0 ? 'text-loss-700' : 'text-ink-700'].join(' ')}>
                    {fmt(g.breakdown![p.key])}
                  </td>
                ))}
                <td className="text-right px-3 py-1.5 font-mono text-sm font-semibold text-pitch-800 tabular-nums sticky right-0 bg-white">{(g.projected_points ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-chalk-300">
            <tr>
              <th scope="row" className="text-left px-3 py-1.5 text-xs font-semibold">Total</th>
              {parts.map((p) => (
                <td key={p.key} className="text-right px-2 py-1.5 font-mono text-xs font-semibold tabular-nums">{fmt(sum(p.key))}</td>
              ))}
              <td className="text-right px-3 py-1.5 font-mono text-sm font-bold text-pitch-800 tabular-nums sticky right-0 bg-white">{total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-ink-500 mt-1">Negative values (in red) are expected deductions, such as goals conceded or cards.</p>
    </section>
  );
}
