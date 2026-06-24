import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getRecentMatches, type MatchWithNames } from '../lib/api';
import { formatMatchDate } from '../lib/formatDate';
import { ScoreChip } from '../components/ScoreChip';

export default function Dashboard() {
  const [matches, setMatches] = useState<MatchWithNames[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getRecentMatches(15)
      .then(setMatches)
      .catch((err) => setError(err.message ?? 'Failed to load matches'));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide text-ink-900">
          Latest results
        </h1>
        <p className="text-ink-500 mt-1">
          The most recent fixtures across every English division in the archive.
        </p>
      </div>

      {error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">
          Couldn&rsquo;t load results: {error}
        </div>
      )}

      {!matches && !error && (
        <p className="text-ink-500 font-mono text-sm">Loading results&hellip;</p>
      )}

      {matches && matches.length === 0 && (
        <p className="text-ink-500">No matches found.</p>
      )}

      {matches && matches.length > 0 && (
        <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white">
          <ul className="divide-y divide-chalk-300">
            {matches.map((m) => (
              <li
                key={m.match_id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 hover:bg-chalk-100 transition-colors"
              >
                <span className="font-mono text-xs text-ink-500 w-24 shrink-0">
                  {formatMatchDate(m.match_date)}
                </span>
                <span className="font-mono text-xs uppercase text-pitch-700 font-semibold w-12 shrink-0">
                  {m.league_code}
                </span>
                <div className="flex-1 flex items-center justify-between gap-3 min-w-0">
                  <span className="truncate font-medium">{m.home_team_name}</span>
                  <ScoreChip homeGoals={m.full_time_home_goals} awayGoals={m.full_time_away_goals} size="sm" />
                  <span className="truncate font-medium text-right">{m.away_team_name}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3 pt-2">
        <Link
          to="/matches"
          className="inline-block px-4 py-2 bg-pitch-800 text-chalk-100 rounded font-medium text-sm hover:bg-pitch-700 transition-colors"
        >
          Browse all matches &rarr;
        </Link>
        <Link
          to="/teams"
          className="inline-block px-4 py-2 border border-pitch-800 text-pitch-800 rounded font-medium text-sm hover:bg-pitch-800 hover:text-chalk-100 transition-colors"
        >
          Explore a team &rarr;
        </Link>
      </div>
    </div>
  );
}
