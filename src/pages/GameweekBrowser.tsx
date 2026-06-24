import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getLeagues, getSeasons, getAvailableMatchweeks, getFixturesForMatchweek, type FixtureWithNames } from '../lib/api';
import { formatMatchDate } from '../lib/formatDate';

type LeagueOption = { league_id: number; code: string; name: string };
type SeasonOption = { season_id: number; label: string; start_year: number; end_year: number };

export default function GameweekBrowser() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlLeagueId = searchParams.get('league') ? Number(searchParams.get('league')) : null;
  const urlSeasonId = searchParams.get('season') ? Number(searchParams.get('season')) : null;
  const urlMatchweek = searchParams.get('mw') ? Number(searchParams.get('mw')) : null;

  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);
  const [leagueId, setLeagueId] = useState<number | null>(urlLeagueId);
  const [seasonId, setSeasonId] = useState<number | null>(urlSeasonId);

  const [matchweeks, setMatchweeks] = useState<number[]>([]);
  const [selectedMatchweek, setSelectedMatchweek] = useState<number | null>(urlMatchweek);

  const [fixtures, setFixtures] = useState<FixtureWithNames[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLeagues().then((data) => setLeagues(data ?? []));
    getSeasons().then((data) => setSeasons(data ?? []));
  }, []);

  // Keep the URL in sync with the current selections, so navigating away
  // and back (or refreshing, or sharing the link) restores exactly this
  // league/season/matchweek rather than starting from blank.
  useEffect(() => {
    const params: Record<string, string> = {};
    if (leagueId) params.league = String(leagueId);
    if (seasonId) params.season = String(seasonId);
    if (selectedMatchweek !== null) params.mw = String(selectedMatchweek);
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, seasonId, selectedMatchweek]);

  useEffect(() => {
    setMatchweeks([]);
    setFixtures(null);
    setError(null);

    if (!leagueId || !seasonId) return;

    getAvailableMatchweeks(leagueId, seasonId)
      .then((weeks) => {
        setMatchweeks(weeks);
        // Only default to the first matchweek if we don't already have a
        // valid selection (e.g. restored from the URL) -- don't clobber it.
        if (weeks.length > 0 && (selectedMatchweek === null || !weeks.includes(selectedMatchweek))) {
          setSelectedMatchweek(weeks[0]);
        }
      })
      .catch((err) => setError(err.message ?? 'Failed to load matchweeks'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, seasonId]);

  useEffect(() => {
    if (!leagueId || !seasonId || selectedMatchweek === null) {
      setFixtures(null);
      return;
    }
    setLoading(true);
    setError(null);
    getFixturesForMatchweek(leagueId, seasonId, selectedMatchweek)
      .then(setFixtures)
      .catch((err) => setError(err.message ?? 'Failed to load fixtures'))
      .finally(() => setLoading(false));
  }, [leagueId, seasonId, selectedMatchweek]);

  function exploreFixture(f: FixtureWithNames) {
    navigate(`/preview?league=${f.league_id}&home=${f.home_team_id}&away=${f.away_team_id}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide">Gameweek Browser</h1>
        <p className="text-ink-500 mt-1">
          Browse upcoming fixtures by matchweek, then jump straight into a full stats comparison.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-1">Division</label>
          <select
            value={leagueId ?? ''}
            onChange={(e) => setLeagueId(e.target.value ? Number(e.target.value) : null)}
            className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
          >
            <option value="">Select a division&hellip;</option>
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
            <option value="">Select a season&hellip;</option>
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

      {leagueId && seasonId && matchweeks.length === 0 && !error && (
        <p className="text-ink-500">No fixtures have been imported for this division/season yet.</p>
      )}

      {matchweeks.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-ink-700 mb-2">Matchweek</label>
          <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
            {matchweeks.map((mw) => (
              <button
                key={mw}
                onClick={() => setSelectedMatchweek(mw)}
                className={[
                  'w-9 h-9 rounded text-sm font-mono font-medium transition-colors',
                  selectedMatchweek === mw
                    ? 'bg-pitch-800 text-chalk-100'
                    : 'bg-white border border-chalk-300 text-ink-700 hover:bg-chalk-100',
                ].join(' ')}
              >
                {mw}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && <p className="text-ink-500 font-mono text-sm">Loading fixtures&hellip;</p>}

      {fixtures && fixtures.length > 0 && (
        <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white">
          <div className="px-4 py-2 bg-pitch-900 text-chalk-100 font-display uppercase text-sm tracking-wide">
            Matchweek {selectedMatchweek}
          </div>
          <ul className="divide-y divide-chalk-300">
            {fixtures.map((f) => (
              <li
                key={f.fixture_id}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 hover:bg-chalk-100 transition-colors cursor-pointer"
                onClick={() => exploreFixture(f)}
              >
                <span className="font-mono text-xs text-ink-500 w-28 shrink-0">
                  {formatMatchDate(f.kickoff_date)}
                  {f.kickoff_time && ` ${f.kickoff_time.slice(0, 5)}`}
                </span>
                <div className="flex-1 flex items-center justify-between gap-3 min-w-0">
                  <span className="truncate font-medium">{f.home_team_name}</span>
                  <span className="text-ink-500 text-xs font-mono shrink-0">vs</span>
                  <span className="truncate font-medium text-right">{f.away_team_name}</span>
                </div>
                <span className="text-xs text-pitch-700 font-medium shrink-0 hidden sm:inline">
                  Explore &rarr;
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
