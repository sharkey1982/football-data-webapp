import { useEffect, useState } from 'react';
import {
  getLeagues,
  getSeasons,
  getTeams,
  getRawMatches,
  matchesToCsv,
  type MatchWithNames,
  type MatchVenueFilter,
} from '../lib/api';
import { formatMatchDate } from '../lib/formatDate';

type LeagueOption = { league_id: number; code: string; name: string };
type SeasonOption = { season_id: number; label: string; start_year: number; end_year: number };
type TeamOption = { team_id: number; canonical_name: string };

export default function RawData() {
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);

  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [venue, setVenue] = useState<MatchVenueFilter>('either');

  const [matches, setMatches] = useState<MatchWithNames[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    getLeagues().then((data) => setLeagues(data ?? []));
    getSeasons().then((data) => setSeasons(data ?? []));
    getTeams().then((data) => setTeams(data ?? []));
  }, []);

  async function runQuery() {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const result = await getRawMatches({
        leagueId: leagueId ?? undefined,
        seasonId: seasonId ?? undefined,
        teamId: teamId ?? undefined,
        venue,
      });
      setMatches(result.matches);
      setTruncated(result.truncated);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load matches');
      setMatches(null);
    } finally {
      setLoading(false);
    }
  }

  function downloadCsv() {
    if (!matches || matches.length === 0) return;
    const csv = matchesToCsv(matches);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matches-export-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function resetFilters() {
    setLeagueId(null);
    setSeasonId(null);
    setTeamId(null);
    setVenue('either');
    setMatches(null);
    setHasSearched(false);
    setError(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide">Raw Data</h1>
        <p className="text-ink-500 mt-1">
          Filter the match archive by division, season, and team, then browse or export the results.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Team</label>
          <select
            value={teamId ?? ''}
            onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.team_id} value={t.team_id}>
                {t.canonical_name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Venue</label>
          <select
            value={venue}
            onChange={(e) => setVenue(e.target.value as MatchVenueFilter)}
            disabled={!teamId}
            className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700 disabled:bg-chalk-100 disabled:text-ink-400"
          >
            <option value="either">Home or away</option>
            <option value="home">Home only</option>
            <option value="away">Away only</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={runQuery}
          disabled={loading}
          className="px-4 py-2 rounded bg-pitch-800 text-chalk-100 font-medium hover:bg-pitch-700 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Run query'}
        </button>
        <button
          onClick={resetFilters}
          className="px-4 py-2 rounded border border-chalk-300 text-ink-700 font-medium hover:bg-chalk-100 transition-colors"
        >
          Reset filters
        </button>
        {matches && matches.length > 0 && (
          <button
            onClick={downloadCsv}
            className="px-4 py-2 rounded border border-pitch-700 text-pitch-800 font-medium hover:bg-pitch-700 hover:text-chalk-100 transition-colors ml-auto"
          >
            Export CSV ({matches.length} row{matches.length === 1 ? '' : 's'})
          </button>
        )}
      </div>

      {error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{error}</div>
      )}

      {truncated && (
        <div className="border border-amber-500 bg-amber-500/10 text-ink-700 px-4 py-3 rounded text-sm">
          This filter combination returned more rows than can be shown at once. Narrow the
          filters (e.g. add a season or team) to see the complete result set.
        </div>
      )}

      {hasSearched && !loading && !error && matches && matches.length === 0 && (
        <p className="text-ink-500">No matches found for this filter combination.</p>
      )}

      {matches && matches.length > 0 && (
        <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-pitch-900 text-chalk-100">
              <tr>
                <th className="text-left font-display uppercase text-xs tracking-wide px-3 py-2">Date</th>
                <th className="text-left font-display uppercase text-xs tracking-wide px-3 py-2">Division</th>
                <th className="text-left font-display uppercase text-xs tracking-wide px-3 py-2">Season</th>
                <th className="text-right font-display uppercase text-xs tracking-wide px-3 py-2">Home</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-3 py-2">Score</th>
                <th className="text-left font-display uppercase text-xs tracking-wide px-3 py-2">Away</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-3 py-2">HT</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-3 py-2">Shots</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-3 py-2">Corners</th>
                <th className="text-center font-display uppercase text-xs tracking-wide px-3 py-2">Cards</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-chalk-200">
              {matches.map((m) => (
                <tr key={m.match_id} className="hover:bg-chalk-100 transition-colors">
                  <td className="px-3 py-2 font-mono text-xs text-ink-500 whitespace-nowrap">
                    {formatMatchDate(m.match_date)}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{m.league_code}</td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{m.season_label}</td>
                  <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{m.home_team_name}</td>
                  <td className="px-3 py-2 text-center font-mono font-semibold whitespace-nowrap">
                    {m.full_time_home_goals}&ndash;{m.full_time_away_goals}
                  </td>
                  <td className="px-3 py-2 font-medium whitespace-nowrap">{m.away_team_name}</td>
                  <td className="px-3 py-2 text-center font-mono text-xs text-ink-500 whitespace-nowrap">
                    {m.half_time_home_goals ?? '–'}&ndash;{m.half_time_away_goals ?? '–'}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs text-ink-500 whitespace-nowrap">
                    {m.home_shots ?? '–'}&ndash;{m.away_shots ?? '–'}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs text-ink-500 whitespace-nowrap">
                    {m.home_corners ?? '–'}&ndash;{m.away_corners ?? '–'}
                  </td>
                  <td className="px-3 py-2 text-center font-mono text-xs text-ink-500 whitespace-nowrap">
                    {m.home_yellow_cards}/{m.home_red_cards}&ndash;{m.away_yellow_cards}/{m.away_red_cards}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
