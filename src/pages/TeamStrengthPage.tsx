// ============================================================================
// src/pages/TeamStrengthPage.tsx
//
// Dixon-Coles team strength summary: attack/defence ratings and home
// advantage next to season-total projected goals for/against (from the
// same predictions used everywhere else on the site) alongside last
// season's actual GF/GA, so a projection that looks "off" for a team can
// be sanity-checked against what actually happened last season in one
// place, without digging through individual fixtures.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { getLeagues, getTeamStrengthSummary, type TeamStrengthSummary } from '../lib/api';

type LeagueOption = { league_id: number; code: string; name: string; competition_type: string | null };
type SortKey = 'canonical_name' | 'attack_strength' | 'defence_strength' | 'projected_gf' | 'projected_ga' | 'last_season_gf' | 'last_season_ga';

const selectClass = 'w-full sm:w-56 border border-chalk-300 rounded px-2.5 py-2 text-sm bg-white focus:border-pitch-700';

function fmt(n: number | null, digits = 2): string {
  return n === null ? '\u2014' : n.toFixed(digits);
}

export default function TeamStrengthPage() {
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [summary, setSummary] = useState<TeamStrengthSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('attack_strength');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    getLeagues().then((data) => {
      const loaded = ((data ?? []) as LeagueOption[]).filter((l) => l.competition_type === 'league');
      setLeagues(loaded);
      setLeagueId((current) => current ?? loaded.find((l) => l.code === 'E0')?.league_id ?? loaded[0]?.league_id ?? null);
    });
  }, []);

  useEffect(() => {
    if (leagueId === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getTeamStrengthSummary(leagueId)
      .then((data) => {
        if (!cancelled) setSummary(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load team strength data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId]);

  const sortedRows = useMemo(() => {
    if (!summary) return [];
    const factor = sortDir === 'asc' ? 1 : -1;
    return [...summary.rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'string' || typeof bv === 'string') return factor * String(av ?? '').localeCompare(String(bv ?? ''));
      const an = av === null ? -Infinity : av;
      const bn = bv === null ? -Infinity : bv;
      return factor * (an - bn);
    });
  }, [summary, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'canonical_name' ? 'asc' : 'desc');
    }
  }

  const columns: { key: SortKey; label: string; title?: string }[] = [
    { key: 'canonical_name', label: 'Team' },
    { key: 'attack_strength', label: 'Attack', title: 'Log-scale Dixon-Coles parameter vs league average (0). Higher = more attacking.' },
    { key: 'defence_strength', label: 'Defence', title: 'Log-scale Dixon-Coles parameter vs league average (0). Higher = tighter defence (concedes fewer).' },
    { key: 'projected_gf', label: 'Proj. GF', title: 'Sum of predicted goals for across every fixture this season, played and upcoming' },
    { key: 'projected_ga', label: 'Proj. GA', title: 'Sum of predicted goals against across every fixture this season, played and upcoming' },
    { key: 'last_season_gf', label: 'Last Szn GF' },
    { key: 'last_season_ga', label: 'Last Szn GA' },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Team Strength</h1>
        <p className="text-sm text-ink-500 mt-1">
          Dixon-Coles attack/defence ratings, this season&rsquo;s total projected goals, and last season&rsquo;s actual goals
          &mdash; a quick sanity check for whether a projection looks fixture-sensitive or just off.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-ink-500 mb-1" htmlFor="league-select">
          League
        </label>
        <select
          id="league-select"
          className={selectClass}
          value={leagueId ?? ''}
          onChange={(e) => setLeagueId(Number(e.target.value))}
        >
          {leagues.map((l) => (
            <option key={l.league_id} value={l.league_id}>
              {l.name} ({l.code})
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {!loading && error && <p className="text-loss-700 text-sm">{error}</p>}

      {!loading && !error && summary && (
        <>
          {!summary.fitRun && (
            <p className="text-sm text-ink-500 bg-chalk-100 border border-chalk-300 rounded-lg px-3 py-2">
              No accepted Dixon-Coles fit for this league yet &mdash; nothing to show.
            </p>
          )}

          {summary.fitRun && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white border border-chalk-300 rounded-lg p-3">
                <div className="text-xs text-ink-500" title="How many extra expected goals the home side gets, added in log-space before exponentiating -- the same figure for every team in this league, not a per-team value">
                  Home advantage
                </div>
                <div className="text-lg font-display text-ink-900">{summary.fitRun.home_advantage.toFixed(3)}</div>
              </div>
              <div className="bg-white border border-chalk-300 rounded-lg p-3">
                <div className="text-xs text-ink-500">Low-score correlation (&rho;)</div>
                <div className="text-lg font-display text-ink-900">{summary.fitRun.rho.toFixed(3)}</div>
              </div>
              <div className="bg-white border border-chalk-300 rounded-lg p-3">
                <div className="text-xs text-ink-500">Matches used to fit</div>
                <div className="text-lg font-display text-ink-900">{summary.fitRun.matches_used}</div>
              </div>
              <div className="bg-white border border-chalk-300 rounded-lg p-3">
                <div className="text-xs text-ink-500">Fitted</div>
                <div className="text-sm font-display text-ink-900">{new Date(summary.fitRun.fitted_at).toLocaleDateString()}</div>
              </div>
            </div>
          )}

          <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-chalk-100 text-ink-500">
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        title={col.title}
                        onClick={() => handleSort(col.key)}
                        className={[
                          'font-medium text-xs px-3 py-1.5 cursor-pointer select-none whitespace-nowrap hover:text-ink-900',
                          col.key === 'canonical_name' ? 'text-left' : 'text-right',
                        ].join(' ')}
                      >
                        {col.label}
                        {sortKey === col.key && <span className="ml-1">{sortDir === 'asc' ? '\u25b2' : '\u25bc'}</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((r, i) => (
                    <tr key={r.team_id} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                      <td className="px-3 py-1.5 font-medium text-ink-900">
                        {r.canonical_name}
                        {r.is_estimated && (
                          <span
                            className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-700"
                            title="Not enough matches yet to fit directly -- estimated from a related league/team"
                          >
                            est.
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-700">{fmt(r.attack_strength, 3)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-700">{fmt(r.defence_strength, 3)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-pitch-800 font-semibold">{fmt(r.projected_gf, 1)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-loss-700 font-semibold">{fmt(r.projected_ga, 1)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-700">{fmt(r.last_season_gf, 0)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-xs text-ink-700">{fmt(r.last_season_ga, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-ink-500">
            Projected GF/GA sums this season&rsquo;s Dixon-Coles predicted goals across every fixture (played and upcoming) for
            the current fit &mdash; not a live-updating in-season tally. Last season&rsquo;s GF/GA is the real final total; a team
            with no last-season figure was outside this league then (e.g. newly promoted).
          </p>
        </>
      )}
    </div>
  );
}
