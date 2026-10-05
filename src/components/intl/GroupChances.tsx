// ============================================================================
// src/components/intl/GroupChances.tsx
//
// A league-phase group's simulated outcomes (intl_group_odds: model IP1 played
// out 10,000 times). Two views:
//   * What it means -- each team's chance of each 2026/27 outcome for its
//     league: quarter-finals, promotion, play-offs, staying put, relegation
//     (League A ranks its thirds and fourths across groups, so these aren't
//     simply positions);
//   * Finishing position -- chance of 1st, 2nd, ... as a stacked bar.
// Used on the Nations League edition page and on a nation's page.
// ============================================================================

import { useState } from 'react';
import { ChipGroup, TeamLink } from './IntlBits';
import { NL_ZONES, pct, type GroupOdds } from '../../lib/intlStats';

const SHADES = ['bg-pitch-800', 'bg-pitch-600', 'bg-chalk-300', 'bg-amber-500', 'bg-loss-600'];
const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th'];
type View = 'zones' | 'positions';

export default function GroupChances({ odds, highlight, testId }: { odds: GroupOdds[]; highlight?: string; testId?: string }) {
  const zones = NL_ZONES[odds[0]?.group_label?.[0] ?? ''];
  const hasZones = !!zones && odds.some((o) => o.zones && Object.keys(o.zones).length);
  const [view, setView] = useState<View>(hasZones ? 'zones' : 'positions');
  if (!odds.length) return null;
  const rows = [...odds].sort((a, b) => b.exp_points - a.exp_points || b.p_pos[0] - a.p_pos[0]);
  const n = Math.max(...rows.map((r) => r.p_pos.length));
  const shade = (k: number) => (k === n - 1 && n > 2 ? SHADES[4] : SHADES[Math.min(k, 3)]);
  const showZones = hasZones && view === 'zones';
  const cols = showZones ? zones! : [];
  return (
    <div className="space-y-2" data-testid={testId}>
      {hasZones && (
        <ChipGroup options={[{ key: 'zones' as View, label: 'What it means' }, { key: 'positions' as View, label: 'Finishing position' }]} value={view} onChange={setView} label="Chances view" />
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden bg-white">
          <thead className="bg-chalk-200 text-ink-500 text-xs">
            <tr>
              <th className="text-left font-medium px-2 py-1">Team</th>
              {!showZones && <th className="text-left font-medium px-2 py-1 hidden sm:table-cell">Finishing position</th>}
              {showZones
                ? cols.map((z) => <th key={z.code} className="text-right font-medium px-1.5 py-1">{z.label}</th>)
                : Array.from({ length: n }, (_, k) => <th key={k} className="text-right font-medium px-1.5 py-1">{ORD[k]}</th>)}
              <th className="text-right font-medium px-2 py-1" title="Expected points at the end of the league phase">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.team} className={r.team === highlight ? 'bg-chalk-100' : undefined}>
                <td className="px-2 py-1 whitespace-nowrap"><TeamLink slug={r.slug} name={r.team} bold={r.team === highlight} /></td>
                {!showZones && (
                  <td className="px-2 py-1 hidden sm:table-cell">
                    <span className="flex h-2.5 w-36 overflow-hidden rounded-full bg-chalk-200" aria-hidden>
                      {r.p_pos.map((p, k) => <span key={k} className={shade(k)} style={{ width: `${p * 100}%` }} />)}
                    </span>
                  </td>
                )}
                {showZones
                  ? cols.map((z) => {
                      const p = r.zones?.[z.code] ?? 0;
                      const strong = p >= 0.5;
                      return (
                        <td key={z.code} className={`text-right px-1.5 py-1 font-mono text-xs tabular-nums ${strong && z.good ? 'font-semibold text-pitch-800' : strong && z.bad ? 'font-semibold text-loss-700' : ''}`}>
                          {p ? pct(p) : '–'}
                        </td>
                      );
                    })
                  : Array.from({ length: n }, (_, k) => (
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
      {showZones && odds[0].group_label[0] === 'A' && (
        <p className="text-xs text-ink-500">League A: the top two in each group reach the quarter-finals. The thirds and fourths are ranked across the four groups: the best two thirds stay up, the other two thirds and the best two fourths go into play-offs with League B’s runners-up, and the worst two fourths are relegated.</p>
      )}
      {showZones && odds[0].group_label[0] === 'D' && <p className="text-xs text-ink-500">League D: every team moves up to League C as the competition shrinks to three leagues from 2028/29.</p>}
    </div>
  );
}
