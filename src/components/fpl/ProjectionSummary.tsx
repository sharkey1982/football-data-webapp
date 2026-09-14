import type { FplFixtureProjection } from '../../lib/fplApi';
import { formatMatchDateWithYear } from '../../lib/formatDate';

function formatKickoffTime(time: string | null): string | null {
  if (!time) return null;
  const [h, m] = time.split(':');
  return `${h}:${m}`;
}

export default function ProjectionSummary({ projection }: { projection: FplFixtureProjection }) {
  const time = formatKickoffTime(projection.kickoff_time);

  return (
    <div className="bg-pitch-900 text-chalk-100 rounded-lg p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display uppercase tracking-wide text-xl sm:text-2xl">
          {projection.home.team_name} <span className="text-amber-400">vs</span> {projection.away.team_name}
        </h1>
        <span className="font-mono text-[11px] uppercase tracking-widest text-amber-400/90 border border-amber-400/40 rounded px-2 py-0.5">
          {projection.model_version}
        </span>
      </div>
      <p className="text-sm text-chalk-200 mt-1">
        {formatMatchDateWithYear(projection.kickoff_date)}
        {time ? ` \u2022 ${time}` : ''}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-3 max-w-md">
        <div className="scoreline px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-widest opacity-80">{projection.home.team_name} xG</div>
          <div className="text-xl font-semibold">{projection.home.team_expected_goals?.toFixed(3) ?? '\u2014'}</div>
        </div>
        <div className="scoreline px-3 py-2 text-center">
          <div className="text-[10px] uppercase tracking-widest opacity-80">{projection.away.team_name} xG</div>
          <div className="text-xl font-semibold">{projection.away.team_expected_goals?.toFixed(3) ?? '\u2014'}</div>
        </div>
      </div>

      <p className="text-[11px] text-chalk-300 mt-3 max-w-2xl">
        Predicted lineups and roles are model estimates, not confirmed team news &mdash; start probabilities and formation
        source counts below show how confident the model is, not a guarantee.
      </p>
    </div>
  );
}
