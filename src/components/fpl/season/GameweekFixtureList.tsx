import { Link } from 'react-router-dom';
import type { SeasonFixture } from '../../../lib/fplSeasonApi';
import { formatMatchDate } from '../../../lib/formatDate';

export default function GameweekFixtureList({
  fixtures,
  selectedFixtureId,
  onSelectFixture,
}: {
  fixtures: SeasonFixture[];
  /** The fixture the player table below is currently scoped to, or null for "all fixtures this gameweek". */
  selectedFixtureId: number | null;
  onSelectFixture: (fixtureId: number | null) => void;
}) {
  return (
    <div className="border border-chalk-300 rounded-lg bg-white overflow-hidden">
      <ul className="divide-y divide-chalk-200">
        {fixtures.map((f) => {
          const isFilterActive = selectedFixtureId === f.fixture_id;
          return (
            <li key={f.fixture_id} className="flex items-center gap-2 px-3 py-2.5">
              <Link to={`/fpl/fixture/${f.fixture_id}`} className="flex-1 flex items-center justify-between gap-3 min-w-0 hover:opacity-80 transition-opacity">
                <div className="min-w-0">
                  <div className="font-medium text-ink-900">
                    {f.home_team} <span className="text-ink-500">vs</span> {f.away_team}
                  </div>
                  <div className="text-xs text-ink-500 mt-0.5 font-mono">
                    {formatMatchDate(f.kickoff_date)}
                    {f.kickoff_time ? ` \u2022 ${f.kickoff_time.slice(0, 5)}` : ''}
                    {f.status === 'played' && <span className="ml-1.5 text-ink-500">{'\u2022 Played'}</span>}
                  </div>
                </div>
                <div className="scoreline px-2.5 py-1 text-xs font-mono shrink-0">
                  {f.predicted_home_goals?.toFixed(2) ?? '\u2014'} - {f.predicted_away_goals?.toFixed(2) ?? '\u2014'}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => onSelectFixture(isFilterActive ? null : f.fixture_id)}
                title="Filter the player table below to this fixture"
                className={[
                  'shrink-0 px-2 py-1 text-[11px] font-medium rounded border transition-colors',
                  isFilterActive
                    ? 'bg-pitch-800 text-chalk-100 border-pitch-800'
                    : 'bg-white text-ink-500 border-chalk-300 hover:bg-chalk-100',
                ].join(' ')}
              >
                {isFilterActive ? 'Showing players' : 'Show players'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
