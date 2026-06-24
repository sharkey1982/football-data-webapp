import { useEffect, useState } from 'react';
import {
  getLeagues,
  getTeams,
  getMatchesForTeam,
  getMostRecentFixtureSeason,
  getTeamsInLeagueFixtures,
  type MatchWithNames,
} from '../lib/api';
import { TeamStatsPanel } from '../components/TeamStatsPanel';

type TeamOption = { team_id: number; canonical_name: string };
type LeagueOption = { league_id: number; code: string; name: string };

export default function TeamExplorer() {
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [leagueFilter, setLeagueFilter] = useState<number | null>(null);

  const [allTeams, setAllTeams] = useState<TeamOption[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [nameFilter, setNameFilter] = useState('');

  const [team, setTeam] = useState<TeamOption | null>(null);
  const [matches, setMatches] = useState<MatchWithNames[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLeagues().then((data) => setLeagues(data ?? []));
  }, []);

  useEffect(() => {
    setLoadingTeams(true);
    setError(null);
    (async () => {
      try {
        if (leagueFilter) {
          const season = await getMostRecentFixtureSeason(leagueFilter);
          if (season) {
            const teams = await getTeamsInLeagueFixtures(leagueFilter, season.season_id);
            setAllTeams(teams);
            return;
          }
        }
        const teams = await getTeams();
        setAllTeams(teams ?? []);
      } catch (err: any) {
        setError(err.message ?? 'Failed to load teams');
      } finally {
        setLoadingTeams(false);
      }
    })();
  }, [leagueFilter]);

  const visibleTeams = allTeams.filter((t) =>
    t.canonical_name.toLowerCase().includes(nameFilter.trim().toLowerCase())
  );

  async function selectTeam(t: TeamOption) {
    setTeam(t);
    setError(null);
    setMatches(null);
    try {
      const data = await getMatchesForTeam(t.team_id, 60);
      setMatches(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load team data');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide">Team Explorer</h1>
        <p className="text-ink-500 mt-1">
          Browse teams, then dig into their home/away form, goal record, and recent matches.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Filter by division</label>
          <select
            value={leagueFilter ?? ''}
            onChange={(e) => setLeagueFilter(e.target.value ? Number(e.target.value) : null)}
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
          <label className="block text-sm font-medium text-ink-700 mb-1">Filter by name</label>
          <input
            type="text"
            value={nameFilter}
            onChange={(e) => setNameFilter(e.target.value)}
            placeholder="Start typing&hellip;"
            className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
          />
        </div>
      </div>

      {error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{error}</div>
      )}

      {loadingTeams && <p className="text-ink-500 font-mono text-sm">Loading teams&hellip;</p>}

      {!loadingTeams && visibleTeams.length > 0 && (
        <div className="border border-chalk-300 rounded-lg bg-white max-h-64 overflow-y-auto">
          <ul className="divide-y divide-chalk-200">
            {visibleTeams.map((t) => (
              <li key={t.team_id}>
                <button
                  onClick={() => selectTeam(t)}
                  className={[
                    'w-full text-left px-4 py-2 transition-colors',
                    team?.team_id === t.team_id ? 'bg-pitch-800 text-chalk-100' : 'hover:bg-chalk-100',
                  ].join(' ')}
                >
                  {t.canonical_name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {team && matches && <TeamStatsPanel team={team} matches={matches} />}
    </div>
  );
}
