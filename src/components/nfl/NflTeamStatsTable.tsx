// ============================================================================
// src/components/nfl/NflTeamStatsTable.tsx
//
// The League Table's "Team stats" view: every team's regular-season numbers
// per game, in three sets -- Offence, Defence (what opponents managed against
// them) and Fantasy (the team inputs that drive fantasy points: how many plays
// a team runs, how often it passes, the same for its opponents, and the team
// defence / special teams (DST) fantasy points). Sortable; rank colouring in
// each column shows best to worst at a glance.
// Data: public.nfl_team_seasons (nflverse stats_team_week).
// ============================================================================

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { NFL_HEAT_MAP_PATH, nflTeamPath, type NflTeamSeason } from '../../lib/nflApi';

type Set = 'offence' | 'defence' | 'fantasy';
type Col = {
  key: string;
  label: string;
  title: string;
  value: (r: NflTeamSeason) => number | null;
  /** Higher is better for the team (for the rank shading). */
  higherBetter: boolean;
  digits?: number;
  pct?: boolean;
  hideSm?: boolean;
  /** A style or matchup figure, neither good nor bad: no rank shading. */
  neutral?: boolean;
};

const pg = (x: number, r: NflTeamSeason) => (r.games ? Number(x) / r.games : null);

const TEAM_STAT_SETS: Record<Set, { label: string; cols: Col[] }> = {
  offence: {
    label: 'Offence',
    cols: [
      { key: 'pts', label: 'Pts', title: 'Points scored per game', value: (r) => pg(r.points_for, r), higherBetter: true },
      { key: 'yds', label: 'Yds', title: 'Total yards per game (passing net of sacks + rushing)', value: (r) => pg(r.pass_yards + r.rush_yards, r), higherBetter: true },
      { key: 'pass', label: 'Pass yds', title: 'Passing yards per game, net of sacks', value: (r) => pg(r.pass_yards, r), higherBetter: true },
      { key: 'rush', label: 'Rush yds', title: 'Rushing yards per game', value: (r) => pg(r.rush_yards, r), higherBetter: true, hideSm: true },
      { key: 'ptd', label: 'Pass TD', title: 'Passing touchdowns', value: (r) => Number(r.pass_tds), higherBetter: true, digits: 0, hideSm: true },
      { key: 'rtd', label: 'Rush TD', title: 'Rushing touchdowns', value: (r) => Number(r.rush_tds), higherBetter: true, digits: 0, hideSm: true },
      { key: 'fd', label: '1st downs', title: 'First downs per game (passing + rushing)', value: (r) => pg(r.first_downs, r), higherBetter: true, hideSm: true },
      { key: 'give', label: 'Giveaways', title: 'Interceptions thrown + fumbles lost', value: (r) => Number(r.giveaways), higherBetter: false, digits: 0 },
      { key: 'epa', label: 'EPA/play', title: 'Expected points added per play: how much each play improved the chance of scoring, on average (nflverse)', value: (r) => (r.offence_epa == null || !r.plays ? null : Number(r.offence_epa) / r.plays), higherBetter: true, digits: 3, hideSm: true },
    ],
  },
  defence: {
    label: 'Defence',
    cols: [
      { key: 'pa', label: 'Pts', title: 'Points allowed per game', value: (r) => pg(r.points_against, r), higherBetter: false },
      { key: 'oyds', label: 'Yds', title: 'Total yards allowed per game', value: (r) => pg(r.opp_pass_yards + r.opp_rush_yards, r), higherBetter: false },
      { key: 'opass', label: 'Pass yds', title: 'Passing yards allowed per game, net of sacks', value: (r) => pg(r.opp_pass_yards, r), higherBetter: false },
      { key: 'orush', label: 'Rush yds', title: 'Rushing yards allowed per game', value: (r) => pg(r.opp_rush_yards, r), higherBetter: false, hideSm: true },
      { key: 'optd', label: 'Pass TD', title: 'Passing touchdowns allowed', value: (r) => Number(r.opp_pass_tds), higherBetter: false, digits: 0, hideSm: true },
      { key: 'ortd', label: 'Rush TD', title: 'Rushing touchdowns allowed', value: (r) => Number(r.opp_rush_tds), higherBetter: false, digits: 0, hideSm: true },
      { key: 'sacks', label: 'Sacks', title: 'Sacks made', value: (r) => Number(r.def_sacks), higherBetter: true, digits: 1 },
      { key: 'take', label: 'Takeaways', title: 'Interceptions + fumble recoveries', value: (r) => Number(r.takeaways), higherBetter: true, digits: 0 },
      { key: 'tod', label: 'TO diff', title: 'Turnover differential: takeaways minus giveaways', value: (r) => Number(r.takeaways) - Number(r.giveaways), higherBetter: true, digits: 0 },
    ],
  },
  fantasy: {
    label: 'Fantasy',
    cols: [
      { key: 'plays', label: 'Plays', title: 'Offensive plays per game (passes + sacks + runs): more plays, more fantasy chances', value: (r) => pg(r.plays, r), higherBetter: true },
      { key: 'patt', label: 'Pass att', title: 'Pass attempts per game: the volume behind QB, WR and TE points', value: (r) => pg(r.attempts, r), higherBetter: true },
      { key: 'ratt', label: 'Rush att', title: 'Rushing attempts per game: the volume behind RB points', value: (r) => pg(r.carries, r), higherBetter: true },
      { key: 'prate', label: 'Pass rate', title: 'Share of plays that are dropbacks (passes + sacks)', value: (r) => (r.plays ? (Number(r.attempts) + Number(r.sacks_suffered)) / r.plays : null), higherBetter: true, pct: true, hideSm: true, neutral: true },
      { key: 'oplays', label: 'Opp plays', title: 'Plays opponents run per game: high means more chances for your DST to score, and for opposing players', value: (r) => pg(r.opp_plays, r), higherBetter: true, hideSm: true, neutral: true },
      { key: 'opatt', label: 'Opp pass att', title: 'Pass attempts opponents make per game against this team', value: (r) => pg(r.opp_attempts, r), higherBetter: true, hideSm: true, neutral: true },
      { key: 'dst', label: 'DST pts', title: 'Team defence / special teams fantasy points per game (standard scoring)', value: (r) => pg(r.dst_points, r), higherBetter: true },
      { key: 'dsttd', label: 'Def/ST TD', title: 'Defensive and special-teams touchdowns', value: (r) => Number(r.def_st_tds), higherBetter: true, digits: 0 },
    ],
  },
};

function fmt(c: Col, v: number | null): string {
  if (v == null || Number.isNaN(v)) return '–';
  if (c.pct) return `${Math.round(v * 100)}%`;
  const d = c.digits ?? 1;
  const s = v.toFixed(d);
  return c.key === 'tod' && v > 0 ? `+${s}` : s;
}

export default function NflTeamStatsTable({ rows }: { rows: NflTeamSeason[] }) {
  const [set, setSet] = useState<Set>('offence');
  const cols = TEAM_STAT_SETS[set].cols;
  const [sort, setSort] = useState<{ key: string; desc: boolean } | null>(null);
  const active = useMemo(() => (sort && cols.some((c) => c.key === sort.key) ? sort : { key: cols[0].key, desc: cols[0].higherBetter }), [sort, cols]);

  // Per column: how many teams are better and worse than each team (ties count as neither).
  const ranks = useMemo(() => {
    const out = new Map<string, Map<string, { better: number; worse: number }>>();
    for (const c of cols) {
      const vals = rows.map((r) => c.value(r)).filter((v): v is number => v != null);
      const m = new Map<string, { better: number; worse: number }>();
      for (const r of rows) {
        const v = c.value(r);
        if (v == null) continue;
        const above = vals.filter((x) => x > v + 1e-9).length;
        const below = vals.filter((x) => x < v - 1e-9).length;
        m.set(r.franchise, c.higherBetter ? { better: above, worse: below } : { better: below, worse: above });
      }
      out.set(c.key, m);
    }
    return out;
  }, [rows, cols]);

  const sorted = useMemo(() => {
    const c = cols.find((x) => x.key === active.key) ?? cols[0];
    return [...rows].sort((a, b) => {
      const v = (c.value(a) ?? -Infinity) - (c.value(b) ?? -Infinity);
      return active.desc ? -v : v;
    });
  }, [rows, cols, active]);

  // Green: fewer than five teams better (top five, ties included); red: fewer than five worse.
  const shade = (rank: { better: number; worse: number } | undefined) => {
    if (!rank) return '';
    if (rank.better < 5) return 'bg-pitch-800/15';
    if (rank.worse < 5) return 'bg-loss-600/10';
    return '';
  };

  return (
    <div className="space-y-3" data-testid="nfl-team-stats">
      <div role="group" aria-label="Stat set" className="inline-flex border border-chalk-300 rounded overflow-hidden text-sm">
        {(Object.keys(TEAM_STAT_SETS) as Set[]).map((k) => (
          <button key={k} type="button" aria-pressed={set === k} onClick={() => { setSet(k); setSort(null); }} className={`px-3 py-1 ${set === k ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700'}`}>
            {TEAM_STAT_SETS[k].label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
          <thead className="bg-chalk-200 text-ink-500">
            <tr>
              <th scope="col" className="text-left font-medium text-xs px-2 py-2">Team</th>
              <th scope="col" className="text-right font-medium text-xs px-2 py-2 hidden sm:table-cell">GP</th>
              {cols.map((c) => (
                <th key={c.key} scope="col" title={c.title} className={`text-right font-medium text-xs px-2 py-2 ${c.hideSm ? 'hidden md:table-cell' : ''}`} aria-sort={active.key === c.key ? (active.desc ? 'descending' : 'ascending') : 'none'}>
                  <button type="button" className="hover:underline" onClick={() => setSort({ key: c.key, desc: active.key === c.key ? !active.desc : c.higherBetter })}>
                    {c.label}
                    {active.key === c.key && <span aria-hidden="true">{active.desc ? ' ↓' : ' ↑'}</span>}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.franchise} className={i % 2 ? 'bg-chalk-100/60' : undefined} data-testid="nfl-team-stats-row">
                <th scope="row" className="text-left px-2 py-1.5 font-normal whitespace-nowrap">
                  <Link to={nflTeamPath(r.slug)} className="hover:underline">{r.team_name}</Link>
                </th>
                <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums hidden sm:table-cell">{r.games}</td>
                {cols.map((c) => {
                  const rank = c.neutral ? undefined : ranks.get(c.key)?.get(r.franchise);
                  return (
                    <td key={c.key} title={rank ? `${c.title}: ranked ${rank.better + 1} of ${rows.length}` : c.title} className={`px-2 py-1.5 text-right font-mono text-xs tabular-nums ${shade(rank)} ${c.hideSm ? 'hidden md:table-cell' : ''}`}>
                      {fmt(c, c.value(r))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-500 max-w-prose">
        Regular season, per game unless a total (TDs, giveaways, takeaways, sacks). Green: top five in the league for the team; red: bottom five (ties share a place). Pass rate and the opponent columns describe style or matchups, so they aren\u2019t shaded. Defence is what opponents managed against the team. Hover a heading for what it means.
        {set === 'fantasy' && (
          <>
            {' '}DST points use standard scoring: sack 1, interception or fumble recovery 2, safety or blocked kick 2, defensive or special-teams TD 6, plus 10 down to −4 for points allowed (0, 1–6, 7–13, 14–20, 21–27, 28–34, 35+). For points allowed to each position, see the <Link to={NFL_HEAT_MAP_PATH} className="text-pitch-800 underline underline-offset-2">Fixture Heat Map</Link>.
          </>
        )}{' '}
        Data: nflverse.
      </p>
    </div>
  );
}
