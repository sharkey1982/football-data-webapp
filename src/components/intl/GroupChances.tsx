// ============================================================================
// src/components/intl/GroupChances.tsx
//
// A league-phase group's simulated outcomes (intl_group_odds: model IP1 played
// out 10,000 times): for each team, its chance of finishing in each position
// as a stacked bar plus the numbers, and its expected points. Used on the
// Nations League edition page and on a nation's page.
// ============================================================================

import { TeamLink } from './IntlBits';
import { pct, type GroupOdds } from '../../lib/intlStats';

const SHADES = ['bg-pitch-800', 'bg-pitch-600', 'bg-chalk-300', 'bg-amber-500', 'bg-loss-600'];
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

export default function GroupChances({ odds, highlight, testId }: { odds: GroupOdds[]; highlight?: string; testId?: string }) {
  if (!odds.length) return null;
  const rows = [...odds].sort((a, b) => b.exp_points - a.exp_points || b.p_pos[0] - a.p_pos[0]);
  const n = Math.max(...rows.map((r) => r.p_pos.length));
  const shade = (k: number) => (k === n - 1 && n > 2 ? SHADES[4] : SHADES[Math.min(k, 3)]);
  return (
    <div className="space-y-1" data-testid={testId}>
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden bg-white">
        <thead className="bg-chalk-200 text-ink-500 text-xs">
          <tr>
            <th className="text-left font-medium px-2 py-1">Team</th>
            <th className="text-left font-medium px-2 py-1 hidden sm:table-cell">Finishing position</th>
            {Array.from({ length: n }, (_, k) => <th key={k} className="text-right font-medium px-1.5 py-1">{ORD[k]}</th>)}
            <th className="text-right font-medium px-2 py-1" title="Expected points at the end of the league phase">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team} className={r.team === highlight ? 'bg-chalk-100' : undefined}>
              <td className="px-2 py-1 whitespace-nowrap"><TeamLink slug={r.slug} name={r.team} bold={r.team === highlight} /></td>
              <td className="px-2 py-1 hidden sm:table-cell">
                <span className="flex h-2.5 w-36 overflow-hidden rounded-full bg-chalk-200" aria-hidden>
                  {r.p_pos.map((p, k) => <span key={k} className={shade(k)} style={{ width: `${p * 100}%` }} />)}
                </span>
              </td>
              {Array.from({ length: n }, (_, k) => (
                <td key={k} className={`text-right px-1.5 py-1 font-mono text-xs tabular-nums ${k === 0 && r.p_pos[0] >= 0.5 ? 'font-semibold text-pitch-800' : ''}`}>
                  {r.p_pos[k] ? pct(r.p_pos[k]) : '–'}
                </td>
              ))}
              <td className="text-right px-2 py-1 font-mono text-xs tabular-nums">{r.exp_points.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
