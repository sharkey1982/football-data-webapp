import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getLeagues,
  getSeasons,
  getFixturesForMatchweek,
  getFixtureCalendarIndex,
  getFixturesForDate,
  type FixtureWithNames,
} from '../lib/api';
import { formatMatchDate } from '../lib/formatDate';
import FixtureCalendarHeatmap from '../components/FixtureCalendarHeatmap';
import { ScoreChip } from '../components/ScoreChip';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

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

  const [selectedMatchweek, setSelectedMatchweek] = useState<number | null>(urlMatchweek);

  const [fixtures, setFixtures] = useState<FixtureWithNames[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Raw {kickoff_date, matchweek} rows for the selected division/season --
  // derives the calendar heat-map counts AND the "which matchweeks fall in
  // the viewed month" filter below, from a single fetch.
  const [calendarIndex, setCalendarIndex] = useState<{ kickoff_date: string; matchweek: number | null }[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const today = new Date();
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [dateFixtures, setDateFixtures] = useState<FixtureWithNames[] | null>(null);
  const [dateFixturesLoading, setDateFixturesLoading] = useState(false);

  const dateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of calendarIndex) counts[row.kickoff_date] = (counts[row.kickoff_date] ?? 0) + 1;
    return counts;
  }, [calendarIndex]);

  // Every matchweek in the season, for validating a URL-restored selection
  // and as a fallback when the viewed calendar month has none of its own.
  const allMatchweeks = useMemo(() => {
    const seen = new Set<number>();
    for (const row of calendarIndex) if (row.matchweek !== null) seen.add(row.matchweek);
    return [...seen].sort((a, b) => a - b);
  }, [calendarIndex]);

  // Matchweeks whose fixtures fall within the currently viewed calendar
  // month -- these are the buttons actually shown, keeping the matchweek
  // filter in sync with whatever month the calendar is paged to.
  const matchweeksByMonth = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    for (const row of calendarIndex) {
      if (row.matchweek === null) continue;
      const [y, m] = row.kickoff_date.split('-').map(Number);
      const key = monthKey(y, m - 1);
      (map[key] ??= new Set()).add(row.matchweek);
    }
    const result: Record<string, number[]> = {};
    for (const [key, set] of Object.entries(map)) result[key] = [...set].sort((a, b) => a - b);
    return result;
  }, [calendarIndex]);
  const visibleMatchweeks = matchweeksByMonth[monthKey(calendarYear, calendarMonth)] ?? [];

  useEffect(() => {
    getLeagues().then((data) => {
      const loadedLeagues = data ?? [];
      setLeagues(loadedLeagues);
      setLeagueId(
        (current) =>
          current ??
          loadedLeagues.find((league) => league.code === 'E0')?.league_id ??
          null
      );
    });
    getSeasons().then((data) => {
      const loadedSeasons = data ?? [];
      setSeasons(loadedSeasons);
      setSeasonId((current) => current ?? loadedSeasons[0]?.season_id ?? null);
    });
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

  // Calendar index -- one fetch per division/season powers both the
  // heat-map and the matchweek filter. Resets the day filter and snaps the
  // calendar back to the current month, since a date/month selected under
  // one division/season is meaningless once that changes.
  useEffect(() => {
    setCalendarIndex([]);
    setFixtures(null);
    setError(null);
    setSelectedCalendarDate(null);
    setCalendarYear(today.getFullYear());
    setCalendarMonth(today.getMonth());

    if (!leagueId || !seasonId) return;

    setCalendarLoading(true);
    getFixtureCalendarIndex(leagueId, seasonId)
      .then(setCalendarIndex)
      .catch((err) => setError(err.message ?? 'Failed to load fixtures'))
      .finally(() => setCalendarLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, seasonId]);

  // Default the selected matchweek once the calendar index loads, but only
  // if there's no already-valid selection (e.g. restored from the URL) --
  // don't clobber it. Prefers a matchweek from the currently viewed
  // calendar month, falling back to the season's first if none fall there.
  useEffect(() => {
    if (allMatchweeks.length === 0) return;
    if (selectedMatchweek !== null && allMatchweeks.includes(selectedMatchweek)) return;
    setSelectedMatchweek(visibleMatchweeks[0] ?? allMatchweeks[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allMatchweeks, visibleMatchweeks]);

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

  // When a calendar day is selected, fetch that day's fixtures to show
  // in place of the matchweek-based list below.
  useEffect(() => {
    if (!leagueId || !seasonId || !selectedCalendarDate) {
      setDateFixtures(null);
      return;
    }
    setDateFixturesLoading(true);
    getFixturesForDate(leagueId, seasonId, selectedCalendarDate)
      .then(setDateFixtures)
      .catch((err) => setError(err.message ?? 'Failed to load fixtures for that date'))
      .finally(() => setDateFixturesLoading(false));
  }, [leagueId, seasonId, selectedCalendarDate]);

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

      {leagueId && seasonId && (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <FixtureCalendarHeatmap
            dateCounts={dateCounts}
            loading={calendarLoading}
            selectedDate={selectedCalendarDate}
            onSelectDate={setSelectedCalendarDate}
            viewYear={calendarYear}
            viewMonth={calendarMonth}
            onChangeMonth={(y, m) => {
              setCalendarYear(y);
              setCalendarMonth(m);
            }}
          />

          <div className="flex-1 min-w-0">
            {allMatchweeks.length === 0 && !error && !calendarLoading && (
              <p className="text-ink-500">No fixtures have been imported for this division/season yet.</p>
            )}

            {allMatchweeks.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-2">
                  Matchweek &mdash; {monthLabel(calendarYear, calendarMonth)}
                </label>
                {visibleMatchweeks.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {visibleMatchweeks.map((mw) => (
                      <button
                        key={mw}
                        onClick={() => {
                          setSelectedMatchweek(mw);
                          setSelectedCalendarDate(null);
                        }}
                        className={[
                          'w-9 h-9 rounded text-sm font-mono font-medium transition-colors',
                          selectedMatchweek === mw && !selectedCalendarDate
                            ? 'bg-pitch-800 text-chalk-100'
                            : 'bg-white border border-chalk-300 text-ink-700 hover:bg-chalk-100',
                        ].join(' ')}
                      >
                        {mw}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-ink-500 text-sm">No matchweeks fall in {monthLabel(calendarYear, calendarMonth)}.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{error}</div>
      )}

      {selectedCalendarDate ? (
        <>
          {dateFixturesLoading && <p className="text-ink-500 font-mono text-sm">Loading fixtures&hellip;</p>}

          {dateFixtures && dateFixtures.length > 0 && (
            <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white">
              <div className="px-4 py-2 bg-pitch-900 text-chalk-100 font-display uppercase text-sm tracking-wide flex items-center justify-between">
                <span>{formatMatchDate(selectedCalendarDate)}</span>
                <button
                  onClick={() => setSelectedCalendarDate(null)}
                  className="text-chalk-100/80 hover:text-chalk-100 text-xs normal-case tracking-normal underline"
                >
                  Clear date filter
                </button>
              </div>
              <ul className="divide-y divide-chalk-300">
                {dateFixtures.map((f) => (
                  <li
                    key={f.fixture_id}
                    className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 hover:bg-chalk-100 transition-colors cursor-pointer"
                    onClick={() => exploreFixture(f)}
                  >
                    <span className="font-mono text-xs text-ink-500 w-28 shrink-0">
                      {f.kickoff_time ? f.kickoff_time.slice(0, 5) : ''}
                    </span>
                    <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 min-w-0">
                      <span className="truncate font-medium min-w-0">{f.home_team_name}</span>
                      {f.full_time_home_goals != null && f.full_time_away_goals != null ? (
                        <div className="flex flex-col items-center">
                          <ScoreChip homeGoals={f.full_time_home_goals} awayGoals={f.full_time_away_goals} size="sm" />
                          {f.half_time_home_goals != null && f.half_time_away_goals != null && (
                            <span className="text-[10px] text-ink-500 font-mono mt-0.5">
                              HT {f.half_time_home_goals}&ndash;{f.half_time_away_goals}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink-500 text-xs font-mono text-center">vs</span>
                      )}
                      <span className="truncate font-medium text-right min-w-0">{f.away_team_name}</span>
                    </div>
                    <span className="text-xs text-pitch-700 font-medium shrink-0 hidden sm:inline">
                      Explore &rarr;
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : (
        <>
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
                    <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 min-w-0">
                      <span className="truncate font-medium min-w-0">{f.home_team_name}</span>
                      {f.full_time_home_goals != null && f.full_time_away_goals != null ? (
                        <div className="flex flex-col items-center">
                          <ScoreChip homeGoals={f.full_time_home_goals} awayGoals={f.full_time_away_goals} size="sm" />
                          {f.half_time_home_goals != null && f.half_time_away_goals != null && (
                            <span className="text-[10px] text-ink-500 font-mono mt-0.5">
                              HT {f.half_time_home_goals}&ndash;{f.half_time_away_goals}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-ink-500 text-xs font-mono text-center">vs</span>
                      )}
                      <span className="truncate font-medium text-right min-w-0">{f.away_team_name}</span>
                    </div>
                    <span className="text-xs text-pitch-700 font-medium shrink-0 hidden sm:inline">
                      Explore &rarr;
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
