import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getFplProjectedFixtures, type FplProjectedFixtureSummary } from '../../lib/fplApi';
import { formatMatchDateWithYear } from '../../lib/formatDate';

export default function FplFixturesList() {
  const [fixtures, setFixtures] = useState<FplProjectedFixtureSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFplProjectedFixtures()
      .then((data) => {
        if (!cancelled) setFixtures(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load fixtures');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">FPL Projections</h1>
        <p className="text-sm text-ink-500 mt-1">
          Player-level fantasy point projections built from the Dixon-Coles fixture model, predicted formations and
          real tactical roles. Pick a fixture to see the full breakdown.
        </p>
      </div>

      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {error && <p className="text-loss-700 text-sm">{error}</p>}

      {!loading && !error && fixtures.length === 0 && (
        <p className="text-ink-500 text-sm">No fixtures currently have FPL projections.</p>
      )}

      {!loading && !error && fixtures.length > 0 && (
        <ul className="divide-y divide-chalk-300 border border-chalk-300 rounded-lg bg-white overflow-hidden">
          {fixtures.map((f) => (
            <li key={f.fixture_id}>
              <Link
                to={`/fpl/fixture/${f.fixture_id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-chalk-100 transition-colors"
              >
                <div>
                  <div className="font-medium text-ink-900">
                    {f.home_team_name} <span className="text-ink-500">vs</span> {f.away_team_name}
                  </div>
                  <div className="text-xs text-ink-500 mt-0.5">
                    {formatMatchDateWithYear(f.kickoff_date)}
                    {f.kickoff_time ? ` \u2022 ${f.kickoff_time.slice(0, 5)}` : ''}
                  </div>
                </div>
                <div className="scoreline px-2.5 py-1 text-xs font-mono">
                  {f.predicted_home_goals?.toFixed(2) ?? '\u2014'} - {f.predicted_away_goals?.toFixed(2) ?? '\u2014'}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
