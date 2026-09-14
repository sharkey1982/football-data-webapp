// ============================================================================
// src/components/fpl/ActualVsPredictedTable.tsx
//
// Renders actual starts/minutes for a completed fixture, alongside any
// genuinely pre-kickoff prediction for the same player -- deliberately a
// flat table, not FormationPitch. Real formations/tactical roles aren't
// populated on the actual side of the data yet, and this component must
// never invent or infer them (a pitch layout would imply a position that
// isn't actually known).
// ============================================================================

import type { FplActualVsPredictedPlayer, FplActualVsPredictedTeam } from '../../lib/fplApi';

function PredictionCell({ player }: { player: FplActualVsPredictedPlayer }) {
  if (player.predicted_start_probability === null && player.predicted_minutes === null) {
    return <span className="text-ink-500">{'\u2014'}</span>;
  }
  const pct =
    player.predicted_start_probability === null ? null : `${Math.round(player.predicted_start_probability * 100)}%`;
  const mins = player.predicted_minutes === null ? null : Math.round(player.predicted_minutes);

  // generated_pre_kickoff is the only thing that makes this a genuine
  // historical forecast -- anything else (false or null) is a projection
  // generated after the match already happened and must read that way,
  // not as "what the model predicted".
  const isGenuineForecast = player.generated_pre_kickoff === true;

  return (
    <div>
      <div className="font-mono text-xs">
        {pct ?? '\u2014'} start{mins !== null ? ` \u00b7 ${mins} min` : ''}
      </div>
      <div className={`text-[10px] uppercase tracking-wide ${isGenuineForecast ? 'text-pitch-800' : 'text-amber-700'}`}>
        {isGenuineForecast ? 'Predicted pre-kickoff' : 'Retrospective projection'}
      </div>
    </div>
  );
}

function TeamTable({ teamName, team }: { teamName: string; team: FplActualVsPredictedTeam }) {
  const hasAnyPrediction = team.players.some((p) => p.predicted_start_probability !== null || p.predicted_minutes !== null);
  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
      <div className="px-3 py-2 border-b border-chalk-300 bg-chalk-100">
        <h3 className="font-display uppercase tracking-wide text-sm text-ink-900">{teamName}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-chalk-200 text-ink-500">
            <tr>
              <th className="text-left font-medium text-xs px-3 py-1.5">Player</th>
              <th className="text-center font-medium text-xs px-3 py-1.5">Started</th>
              <th className="text-right font-medium text-xs px-3 py-1.5">Minutes</th>
              {hasAnyPrediction && <th className="text-left font-medium text-xs px-3 py-1.5">Prediction</th>}
            </tr>
          </thead>
          <tbody>
            {team.players.map((p, i) => (
              <tr key={p.fpl_player_id} className={i % 2 === 1 ? 'bg-chalk-100/60' : undefined}>
                <td className="px-3 py-1.5">{p.player_name}</td>
                <td className="px-3 py-1.5 text-center">
                  {p.actual_started ? (
                    <span className="text-pitch-800 font-medium">{'\u2713'}</span>
                  ) : (
                    <span className="text-ink-500">sub</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right font-mono text-xs">{p.actual_minutes}</td>
                {hasAnyPrediction && (
                  <td className="px-3 py-1.5">
                    <PredictionCell player={p} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ActualVsPredictedTable({
  home,
  away,
}: {
  home: FplActualVsPredictedTeam;
  away: FplActualVsPredictedTeam;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-500 bg-chalk-100 border border-chalk-300 rounded-lg px-3 py-2">
        Actual starts and minutes from the real match. Formations and tactical positions aren&rsquo;t recorded for
        completed fixtures yet, so this is a plain list, not a pitch layout &mdash; who started, who came on, and how
        long they played.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <TeamTable teamName={home.team_name} team={home} />
        <TeamTable teamName={away.team_name} team={away} />
      </div>
    </div>
  );
}
