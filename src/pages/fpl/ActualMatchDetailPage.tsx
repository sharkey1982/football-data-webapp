// ============================================================================
// src/pages/fpl/ActualMatchDetailPage.tsx
//
// Real FPL stats for one played fixture, split by team, sorted by minutes
// played (the closest available proxy for starter vs sub -- there's a
// genuine data gap for proper lineup/formation data here).
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getActualMatchDetail, type ActualMatchDetail, type ActualMatchPlayerStat } from '../../lib/fplActualMatchApi';
import { FPL_POSITION_LABEL } from '../../lib/fplApi';
import { getErrorMessage } from '../../lib/errorMessage';

function statLine(p: ActualMatchPlayerStat): string {
  const parts: string[] = [];
  if (p.goals_scored > 0) parts.push(`${p.goals_scored} goal${p.goals_scored > 1 ? 's' : ''}`);
  if (p.assists > 0) parts.push(`${p.assists} assist${p.assists > 1 ? 's' : ''}`);
  if (p.clean_sheets > 0) parts.push('clean sheet');
  if (p.saves > 0) parts.push(`${p.saves} save${p.saves > 1 ? 's' : ''}`);
  if (p.bonus > 0) parts.push(`+${p.bonus} bonus`);
  if (p.yellow_cards > 0) parts.push('yellow');
  if (p.red_cards > 0) parts.push('red');
  if (p.own_goals > 0) parts.push('own goal');
  if (p.penalties_missed > 0) parts.push('pen missed');
  if (p.penalties_saved > 0) parts.push('pen saved');
  return parts.join(', ');
}

function TeamColumn({ teamName, players, opponentGoals }: { teamName: string; players: ActualMatchPlayerStat[]; opponentGoals: number | null }) {
  return (
    <div className="bg-white border border-chalk-300 rounded-lg overflow-hidden">
      <div className="px-3 py-2 border-b border-chalk-200 bg-chalk-100 font-display uppercase tracking-wide text-sm text-ink-900">
        {teamName}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[10px] font-medium text-ink-500 uppercase border-b border-chalk-200">
            <th className="px-3 py-1.5">Player</th>
            <th className="px-2 py-1.5">Pos</th>
            <th className="px-2 py-1.5 text-right">Mins</th>
            <th className="px-3 py-1.5">Stats</th>
            <th className="px-2 py-1.5 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {players.map((p) => (
            <tr key={p.fpl_player_id} className="border-b border-chalk-200 last:border-b-0">
              <td className="px-3 py-1.5 font-medium text-ink-900 whitespace-nowrap">{p.web_name}</td>
              <td className="px-2 py-1.5 font-mono text-xs text-ink-500 uppercase">{FPL_POSITION_LABEL[p.element_type as 1 | 2 | 3 | 4] ?? '\u2014'}</td>
              <td className="px-2 py-1.5 text-right font-mono text-xs text-ink-700">{p.minutes}</td>
              <td className="px-3 py-1.5 text-xs text-ink-500">{statLine(p) || '\u2014'}</td>
              <td className="px-2 py-1.5 text-right font-mono text-sm font-semibold text-pitch-800">{p.total_points}</td>
            </tr>
          ))}
          {players.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-sm text-ink-500">
                No player stats recorded for this side yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {opponentGoals !== null && (
        <div className="px-3 py-1.5 text-[11px] text-ink-500 border-t border-chalk-200 bg-chalk-100">
          Conceded {opponentGoals}
        </div>
      )}
    </div>
  );
}

export default function ActualMatchDetailPage() {
  const { fixtureId } = useParams<{ fixtureId: string }>();
  const parsedId = fixtureId ? Number(fixtureId) : NaN;

  const [detail, setDetail] = useState<ActualMatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notPlayedYet, setNotPlayedYet] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(parsedId)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setNotPlayedYet(false);
    getActualMatchDetail(parsedId)
      .then((data) => {
        if (cancelled) return;
        if (!data) setNotPlayedYet(true);
        else setDetail(data);
      })
      .catch((e) => {
        if (!cancelled) setError(getErrorMessage(e, 'Failed to load match detail'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [parsedId]);

  return (
    <div className="space-y-4">
      <Link to="/fpl/actual-matches" className="text-sm text-pitch-800 hover:underline">
        &larr; Back to Gameweek Results
      </Link>

      {loading && <p className="text-ink-500 font-mono text-sm">{'Loading\u2026'}</p>}
      {error && <p className="text-loss-700 text-sm">{error}</p>}
      {notPlayedYet && <p className="text-sm text-ink-500">This fixture hasn&rsquo;t been played (or backfilled) yet.</p>}

      {!loading && !error && detail && (
        <>
          <div>
            <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">
              {detail.fixture.home_team} <span className="text-ink-400">v</span> {detail.fixture.away_team}
            </h1>
            <p className="text-lg font-mono font-semibold text-ink-900 mt-1">
              {detail.fixture.home_score} &ndash; {detail.fixture.away_score}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TeamColumn teamName={detail.fixture.home_team} players={detail.home_players} opponentGoals={detail.fixture.away_score} />
            <TeamColumn teamName={detail.fixture.away_team} players={detail.away_players} opponentGoals={detail.fixture.home_score} />
          </div>

          <p className="text-[11px] text-ink-500">
            Sorted by minutes played within each team (highest first) &mdash; the closest available proxy for who started
            versus who came on as a substitute, since there&rsquo;s no proper starting-lineup/formation data source for
            played fixtures yet. Points and stats themselves are the real, official numbers.
          </p>
        </>
      )}
    </div>
  );
}
