import { useEffect, useState } from 'react';
import { getLeagues, getSeasons, searchMatches, type MatchWithNames } from '../lib/api';
import { formatMatchDate } from '../lib/formatDate';
import { ScoreChip } from '../components/ScoreChip';

type LeagueOption = { league_id: number; code: string; name: string; tier: number | null };
type SeasonOption = { season_id: number; label: string; start_year: number; end_year: number };

export default function LeagueExplorer() {
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [matches, setMatches] = useState<MatchWithNames[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLeagues().then((data) => setLeagues(data ?? []));
    getSeasons().then((data) => setSeasons(data ?? []));
  }, []);

  useEffect(() => {
    if (!leagueId && !seasonId) {
      setMatches(null);
      return;
    }
    setError(null);
    searchMatches({ leagueId: leagueId ?? undefined, seasonId: seasonId ?? undefined, limit: 50 })
      .then(setMatches)
      .catch((err) => setError(err.message ?? 'Failed to load matches'));
  }, [leagueId, seasonId]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide">League Explorer</h1>
        <p className="text-ink-500 mt-1">Browse results by division and season.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Division</label>
          <select
            value={leagueId ?? ''}
            onChange={(e) => setLeagueId(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
          >
            <option value="">All divisions</option>
            {leagues.map((l) => (
              <option key={l.league_id} value={l.league_id}>
                {l.code} &mdash; {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Season</label>
          <select
            value={seasonId ?? ''}
            onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
          >
            <option value="">All seasons</option>
            {seasons.map((s) => (
              <option key={s.season_id} value={s.season_id}>
                {s.start_year}/{String(s.end_year).slice(2)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{error}</div>
      )}

      {!leagueId && !seasonId && (
        <p className="text-ink-500">Pick a division and/or season above to see results.</p>
      )}

      {matches && matches.length === 0 && <p className="text-ink-500">No matches found for that filter.</p>}

      {matches && matches.length > 0 && (
        <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white">
          <ul className="divide-y divide-chalk-300">
            {matches.map((m) => (
              <li key={m.match_id} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3">
                <span className="font-mono text-xs text-ink-500 w-24 shrink-0">{formatMatchDate(m.match_date)}</span>
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
    </div>
  );
}
