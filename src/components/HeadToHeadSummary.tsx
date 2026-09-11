import type { MatchWithNames } from '../lib/api';
import { formatMatchDate, formatMatchDateWithYear } from '../lib/formatDate';
import { MatchStatsGrid } from './MatchStatsGrid';
import { ScoreChip } from './ScoreChip';

const RESULT_COLORS = {
  teamA: '#1B4332', // --color-pitch-800
  draw: '#d8d2bd', // --color-chalk-300
  teamB: '#A63D40', // --color-loss-600, deliberately a distinct color from teamA, not implying "loss" generically
};

interface VenueTally {
  teamAWins: number;
  draws: number;
  teamBWins: number;
}

function tallyMatches(matches: MatchWithNames[], teamAId: number): VenueTally {
  let teamAWins = 0;
  let draws = 0;
  let teamBWins = 0;
  for (const m of matches) {
    const teamAIsHome = m.home_team_id === teamAId;
    const result = m.full_time_result;
    if (result === 'D') draws++;
    else if ((result === 'H' && teamAIsHome) || (result === 'A' && !teamAIsHome)) teamAWins++;
    else teamBWins++;
  }
  return { teamAWins, draws, teamBWins };
}

function VenueBar({
  tally,
  teamAName,
  teamBName,
}: {
  tally: VenueTally;
  teamAName: string;
  teamBName: string;
}) {
  const total = tally.teamAWins + tally.draws + tally.teamBWins;
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  if (total === 0) {
    return <p className="text-xs text-ink-500">No meetings in this venue split yet.</p>;
  }

  return (
    <div>
      <div className="flex justify-between text-xs font-mono text-ink-500 mb-1">
        <span>{teamAName} {tally.teamAWins}</span>
        <span>Draw {tally.draws}</span>
        <span>{teamBName} {tally.teamBWins}</span>
      </div>
      <div className="flex h-5 rounded overflow-hidden border border-chalk-300">
        {tally.teamAWins > 0 && (
          <div style={{ width: `${pct(tally.teamAWins)}%`, backgroundColor: RESULT_COLORS.teamA }} />
        )}
        {tally.draws > 0 && (
          <div style={{ width: `${pct(tally.draws)}%`, backgroundColor: RESULT_COLORS.draw }} />
        )}
        {tally.teamBWins > 0 && (
          <div style={{ width: `${pct(tally.teamBWins)}%`, backgroundColor: RESULT_COLORS.teamB }} />
        )}
      </div>
    </div>
  );
}

/**
 * Summarizes a head-to-head match list, split by venue (where teamA played
 * at home vs away) since "who wins this fixture" depends heavily on which
 * ground it's played at -- an aggregated all-venues tally hides that.
 * Also marks each scoreline chip with a venue indicator (H/A relative to
 * teamA) so the chronological strip carries the same information.
 */
export function HeadToHeadSummary({
  matches,
  teamAId,
  teamAName,
  teamBName,
  resultMatchId,
}: {
  matches: MatchWithNames[];
  teamAId: number;
  teamAName: string;
  teamBName: string;
  /** Match already shown in a result banner elsewhere on the page (e.g.
   *  Match Preview's "Full-Time Result" card) -- when the latest meeting
   *  IS that match, skip repeating its detailed stats here to avoid
   *  showing the same box score twice. */
  resultMatchId?: number;
}) {
  const chronological = [...matches].reverse();
  const latest = matches[0];
  const showLatestDetail = latest && latest.match_id !== resultMatchId;
  const teamAHomeMatches = matches.filter((m) => m.home_team_id === teamAId);
  const teamAAwayMatches = matches.filter((m) => m.away_team_id === teamAId);

  const homeTally = tallyMatches(teamAHomeMatches, teamAId);
  const awayTally = tallyMatches(teamAAwayMatches, teamAId);

  return (
    <div className="space-y-5">
      {showLatestDetail && (
        <div className="border border-chalk-300 rounded-lg bg-chalk-100 p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wide text-ink-500">
              Latest meeting &mdash; {formatMatchDateWithYear(latest.match_date)}
              {latest.league_code ? ` \u00b7 ${latest.league_code}` : ''}
            </span>
          </div>
          <div className="flex items-center justify-center gap-3 mb-3">
            <span className="text-sm font-medium">{latest.home_team_name}</span>
            <ScoreChip homeGoals={latest.full_time_home_goals} awayGoals={latest.full_time_away_goals} size="md" />
            <span className="text-sm font-medium">{latest.away_team_name}</span>
          </div>
          <MatchStatsGrid match={latest} />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-500 mb-2">
            When {teamAName} host ({teamAHomeMatches.length})
          </div>
          <VenueBar tally={homeTally} teamAName={teamAName} teamBName={teamBName} />
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-ink-500 mb-2">
            When {teamBName} host ({teamAAwayMatches.length})
          </div>
          <VenueBar tally={awayTally} teamAName={teamAName} teamBName={teamBName} />
        </div>
      </div>

      <div>
        <div className="text-xs text-ink-500 mb-2">
          Scoreline history (oldest &rarr; most recent) &mdash; <span className="font-medium">H</span> ={' '}
          {teamAName} at home, <span className="font-medium">A</span> = {teamAName} away
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {chronological.map((m) => {
            const teamAIsHome = m.home_team_id === teamAId;
            const aGoals = teamAIsHome ? m.full_time_home_goals : m.full_time_away_goals;
            const bGoals = teamAIsHome ? m.full_time_away_goals : m.full_time_home_goals;
            const result = m.full_time_result;
            const aWon = (result === 'H' && teamAIsHome) || (result === 'A' && !teamAIsHome);
            const bg = result === 'D' ? RESULT_COLORS.draw : aWon ? RESULT_COLORS.teamA : RESULT_COLORS.teamB;
            const textColor = result === 'D' ? '#3a3f42' : '#f2f0e6';

            return (
              <div key={m.match_id} className="shrink-0 flex flex-col items-center gap-0.5">
                <span className="text-[10px] font-mono text-ink-500">{teamAIsHome ? 'H' : 'A'}</span>
                <div
                  className="scoreline px-2 py-1 text-xs font-bold"
                  style={{ backgroundColor: bg, color: textColor }}
                  title={`${formatMatchDate(m.match_date)}: ${teamAIsHome ? teamAName : teamBName} ${m.full_time_home_goals}-${m.full_time_away_goals} ${teamAIsHome ? teamBName : teamAName}`}
                >
                  {aGoals}-{bGoals}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
