// ============================================================================
// src/pages/fpl/ValuePage.tsx
//
// Points per million actually returned.
//
// Discover, not Predict: every number here is what happened. The
// contribution columns sit alongside deliberately, so the ratio can be
// interrogated rather than trusted -- 8.0 per million earned mostly from
// bonus is a different proposition from the same figure earned from
// goals, and a ratio off 90 minutes is not the same as one off a cameo.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { getActualValueTable, valueByPosition, valueByTeam, type ValueRow } from '../../lib/valueApi';

const POSITIONS = ['All', 'GKP', 'DEF', 'MID', 'FWD'];

type SortKey =
  | 'web_name' | 'team_name' | 'price' | 'total_points' | 'points_per_million'
  | 'minutes' | 'goals' | 'assists' | 'clean_sheets' | 'bonus';

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: 'web_name', label: 'Player', numeric: false },
  { key: 'team_name', label: 'Team', numeric: false },
  { key: 'price', label: 'Price', numeric: true },
  { key: 'total_points', label: 'Points', numeric: true },
  { key: 'points_per_million', label: 'Per \u00a3m', numeric: true },
  { key: 'minutes', label: 'Mins', numeric: true },
  { key: 'goals', label: 'G', numeric: true },
  { key: 'assists', label: 'A', numeric: true },
  { key: 'clean_sheets', label: 'CS', numeric: true },
  { key: 'bonus', label: 'Bonus', numeric: true },
];

export default function ValuePage() {
  const [rows, setRows] = useState<ValueRow[] | null>(null);
  const [position, setPosition] = useState('All');
  const [minMinutes, setMinMinutes] = useState(180);
  // Sortable rather than a second "player scout" table -- three
  // overlapping player-actuals views would drift apart; one sortable
  // table answers value, points, minutes and contribution from the same
  // numbers.
  const [sortKey, setSortKey] = useState<SortKey>('points_per_million');
  const [sortDesc, setSortDesc] = useState(true);

  useDocumentHead({
    title: 'Bargain Basement \u2014 FPL points per million',
    description:
      'Which Fantasy Premier League players have actually returned the most points per million spent, with the goals, assists, clean sheets and bonus behind each figure.',
    path: '/fpl/value',
  });

  useEffect(() => {
    getActualValueTable(13)
      .then(setRows)
      .catch(() => setRows([]));
  }, []);

  const byPosition = useMemo(() => (rows ? valueByPosition(rows, 5, 180) : []), [rows]);
  const byTeam = useMemo(() => (rows ? valueByTeam(rows) : []), [rows]);

  const view = useMemo(() => {
    if (!rows) return [];
    const filtered = rows.filter(
      (r) => (position === 'All' || r.position_label === position) && r.minutes >= minMinutes
    );
    const dir = sortDesc ? -1 : 1;
    return filtered
      .slice()
      .sort((a, b) => {
        const av = a[sortKey];
        const bv = b[sortKey];
        if (typeof av === 'string' || typeof bv === 'string') {
          return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
        }
        return (Number(av ?? 0) - Number(bv ?? 0)) * dir;
      })
      .slice(0, 40);
  }, [rows, position, minMinutes, sortKey, sortDesc]);

  if (rows === null) return <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>;
  if (rows.length === 0) {
    return (
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Bargain Basement</h1>
        <p className="text-ink-700 mt-2">No scoring data is available yet.</p>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Discover</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Bargain Basement</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          What players have actually returned for what they cost. Every figure here is points already scored &mdash; no
          projections.
        </p>
      </header>

      {byPosition.length > 0 && (() => {
        const best = [...byPosition].sort((a, b) => b.topPointsPerMillion - a.topPointsPerMillion)[0];
        const worst = [...byPosition].sort((a, b) => a.topPointsPerMillion - b.topPointsPerMillion)[0];
        const max = Math.max(...byPosition.map((p) => p.topPointsPerMillion));
        const NAMES: Record<string, string> = { GKP: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' };
        const ratio = worst.topPointsPerMillion > 0 ? best.topPointsPerMillion / worst.topPointsPerMillion : 0;
        return (
          <section className="border border-chalk-300 rounded-lg bg-white p-4">
            <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">Where the value actually is</h2>
            <p className="text-ink-900 mt-1 max-w-prose">
              Comparing the five best-value players in each position &mdash; the ones a squad is actually built from
              &mdash; {NAMES[best.position].toLowerCase()} return{' '}
              <strong>{best.topPointsPerMillion} points per &pound;m</strong> at an average of &pound;
              {best.topAveragePrice.toFixed(1)}m, against <strong>{worst.topPointsPerMillion}</strong> for{' '}
              {NAMES[worst.position].toLowerCase()} at &pound;{worst.topAveragePrice.toFixed(1)}m.
              {ratio >= 1.5 && (
                <>
                  {' '}
                  That&rsquo;s {ratio.toFixed(1)}&times; the value, for less money.
                </>
              )}
            </p>
            <div className="space-y-2 mt-3">
              {byPosition.map((p) => (
                <div key={p.position} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm text-ink-700">{NAMES[p.position]}</span>
                  <div className="flex-1 bg-chalk-200 rounded h-5 overflow-hidden">
                    <div
                      className="bg-pitch-700 h-full rounded"
                      style={{ width: `${max > 0 ? (p.topPointsPerMillion / max) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums">{p.topPointsPerMillion}</span>
                  <span className="w-16 shrink-0 text-right font-mono text-[0.65rem] text-ink-500 tabular-nums">
                    &pound;{p.topAveragePrice.toFixed(1)}m
                  </span>
                </div>
              ))}
            </div>
            <p className="text-ink-700 text-sm mt-3 max-w-prose">
              <strong>But value isn&rsquo;t points.</strong> Points per million is a ratio, and maximising a ratio
              doesn&rsquo;t spend a budget. Building the highest-value XI from this season&rsquo;s data returns 324 points
              and leaves roughly &pound;24m unused; building the highest-scoring XI within the same budget returns 356
              &mdash; and it plays <strong>three</strong> defenders, not five.
            </p>
            <p className="text-ink-500 text-sm mt-2 max-w-prose">
              So cheap defenders are genuinely the best value per pound, and that is still worth knowing &mdash; it tells
              you where to save. It does not follow that a squad should be built around them. The money saved has to go
              somewhere, and premium midfielders convert it into more points than a fifth budget defender does. Use this
              page to find the savings, and the{' '}
              <Link to="/fpl/optimal-squad" className="text-pitch-800 underline underline-offset-2">
                optimiser
              </Link>{' '}
              to decide where the money goes.
            </p>
          </section>
        );
      })()}

      {byTeam.length > 2 && (() => {
        const top = byTeam.slice(0, 5);
        const bottom = byTeam.slice(-3).reverse();
        const max = byTeam[0].pointsPerMillion || 1;
        const Row = ({ t }: { t: (typeof byTeam)[number] }) => (
          <div className="flex items-center gap-3">
            <span className="w-28 sm:w-36 shrink-0 text-sm text-ink-700 truncate">{t.team}</span>
            <div className="flex-1 bg-chalk-200 rounded h-4 overflow-hidden">
              <div className="bg-pitch-700 h-full rounded" style={{ width: `${(t.pointsPerMillion / max) * 100}%` }} />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums">{t.pointsPerMillion}</span>
            <span className="w-24 shrink-0 text-right font-mono text-[0.65rem] text-ink-500 tabular-nums">
              {t.points} pts / &pound;{t.cost}m
            </span>
          </div>
        );
        return (
          <section className="border border-chalk-300 rounded-lg bg-white p-4">
            <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">Which clubs are underpriced</h2>
            <p className="text-ink-700 text-sm mt-1 max-w-prose">
              Every qualifying player at a club, pooled: points returned against what the squad costs.{' '}
              <strong>{byTeam[0].team}</strong> lead on {byTeam[0].pointsPerMillion} points per &pound;m. A club near the
              top is usually one FPL priced before it improved &mdash; promoted sides and overperformers take time for
              the pricing to catch up.
            </p>
            <div className="space-y-1.5 mt-3">
              {top.map((t) => (
                <Row key={t.team} t={t} />
              ))}
            </div>
            <p className="text-xs font-mono uppercase tracking-widest text-ink-500 mt-4">Priced above their returns</p>
            <div className="space-y-1.5 mt-1.5">
              {bottom.map((t) => (
                <Row key={t.team} t={t} />
              ))}
            </div>
            <p className="text-ink-500 text-xs mt-3 max-w-prose">
              Clubs with fewer than eight qualifying players are excluded &mdash; a small squad sample tops this kind of
              table on a fluke. Expensive clubs sit lower by construction: a side full of premium players can be both
              poor value and the right place to spend.
            </p>
          </section>
        );
      })()}

      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-wrap gap-2">
          {POSITIONS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPosition(p)}
              className={[
                'text-sm rounded px-3 py-1.5 border transition-colors',
                p === position ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'border-chalk-300 text-ink-700 hover:bg-chalk-200',
              ].join(' ')}
            >
              {p}
            </button>
          ))}
        </div>
        <label className="text-sm">
          <span className="block text-xs font-mono uppercase tracking-widest text-ink-500">Min minutes</span>
          <select
            value={minMinutes}
            onChange={(e) => setMinMinutes(Number(e.target.value))}
            className="mt-1 border border-chalk-300 rounded px-2 py-1.5 text-sm bg-white"
          >
            {/* A minutes floor matters more than it looks: without one the
                top of this table fills with players who scored once off
                the bench and never played again. */}
            {[0, 90, 180, 270].map((m) => (
              <option key={m} value={m}>{m === 0 ? 'Any' : `${m}+`}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
          <thead className="bg-chalk-200 text-ink-500">
            <tr>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`font-medium text-xs px-3 py-2 ${c.numeric ? 'text-right' : 'text-left'}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (sortKey === c.key) setSortDesc(!sortDesc);
                      else {
                        setSortKey(c.key);
                        // Numbers are interesting largest-first; names
                        // are not, so the default follows the type.
                        setSortDesc(c.numeric);
                      }
                    }}
                    className="hover:text-ink-900"
                  >
                    {c.label}
                    {sortKey === c.key ? (sortDesc ? ' \u2193' : ' \u2191') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r, i) => (
              <tr key={r.fpl_player_id} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                <th scope="row" className="text-left px-3 py-1.5 text-xs font-normal whitespace-nowrap">
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
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.total_points}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums font-medium">{r.points_per_million.toFixed(2)}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">{r.minutes}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.goals}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.assists}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.clean_sheets}</td>
                <td className="px-3 py-1.5 text-right font-mono text-xs tabular-nums">{r.bonus}</td>
              </tr>
            ))}
            {view.length === 0 && (
              <tr><td colSpan={10} className="px-3 py-4 text-center text-ink-500 text-xs">Nobody matches that filter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-ink-500 text-xs max-w-prose">
        Value uses each player&rsquo;s current price, which is the usual convention but a simplification: points were
        earned at whatever the price was at the time, so a player who has since risen looks slightly worse value than
        they were. Early in a season these ratios move a lot week to week.
      </p>

      <nav aria-label="Related pages" className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        <Link to="/fpl/start/discover" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          More to discover
        </Link>
        <Link to="/fpl/player-points" className="text-pitch-800 hover:text-pitch-700 underline underline-offset-2">
          Projected points
        </Link>
      </nav>
    </article>
  );
}
