import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getLeagues,
  getCountries,
  getSeasons,
  getTeams,
  getTeamById,
  getFixturesForMatchweek,
  getFixtureCalendarIndex,
  getFixturesForDate,
  getFixturesForTeam,
  type FixtureWithNames,
} from '../lib/api';
import { formatMatchDate, formatMatchDateWithYear } from '../lib/formatDate';
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

type LeagueOption = {
  league_id: number;
  code: string;
  name: string;
  country_id: number | null;
  competition_type: string | null;
  scope: string | null;
};
type CountryOption = { country_id: number; name: string; code: string | null };
type SeasonOption = { season_id: number; label: string; start_year: number; end_year: number };
type TeamOption = { team_id: number; canonical_name: string };

type ViewMode = 'division' | 'team';

const selectClass =
  'w-full border border-chalk-300 rounded px-2.5 py-2 text-sm bg-white focus:border-pitch-700';
const labelClass = 'block text-xs sm:text-sm font-medium text-ink-700 mb-1';

export default function GameweekBrowser() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlView = searchParams.get('view') === 'team' ? 'team' : 'division';
  const urlLeagueId = searchParams.get('league') ? Number(searchParams.get('league')) : null;
  const urlSeasonId = searchParams.get('season') ? Number(searchParams.get('season')) : null;
  const urlMatchweek = searchParams.get('mw') ? Number(searchParams.get('mw')) : null;
  const urlCountryId = searchParams.get('country') ? Number(searchParams.get('country')) : null;
  const urlCompetitionType = searchParams.get('type');
  const urlTeamId = searchParams.get('team') ? Number(searchParams.get('team')) : null;

  const [viewMode, setViewMode] = useState<ViewMode>(urlView);

  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [seasons, setSeasons] = useState<SeasonOption[]>([]);

  // Division-view filters. Country/competition type narrow the Division
  // dropdown itself rather than being sent to the API separately -- the
  // league list is small enough to filter entirely client-side.
  const [countryId, setCountryId] = useState<number | null>(urlCountryId);
  const [competitionType, setCompetitionType] = useState<string>(urlCompetitionType ?? '');
  const [leagueId, setLeagueId] = useState<number | null>(urlLeagueId);
  const [seasonId, setSeasonId] = useState<number | null>(urlSeasonId);

  const filteredLeagues = useMemo(() => {
    return leagues.filter(
      (l) =>
        (!countryId || l.country_id === countryId) &&
        (!competitionType || l.competition_type === competitionType)
    );
  }, [leagues, countryId, competitionType]);

  // If the current division falls outside the Country/Competition filters
  // (or was never set), fall back to the first division those filters
  // still allow -- keeps the Division dropdown always showing a valid,
  // in-filter selection rather than a stale or empty one.
  useEffect(() => {
    if (filteredLeagues.length === 0) return;
    if (leagueId && filteredLeagues.some((l) => l.league_id === leagueId)) return;
    setLeagueId(filteredLeagues[0].league_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLeagues]);

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

  // Team-view state. Country/Division here are their own filters, kept
  // separate from the Division-view ones above -- they only narrow the
  // team search (which gets huge without them), not the fixture fetch
  // itself, and switching views shouldn't have them silently affect
  // each other.
  const [teamId, setTeamId] = useState<number | null>(urlTeamId);
  const [teamName, setTeamName] = useState<string>('');
  const [teamQuery, setTeamQuery] = useState('');
  const [teamOptions, setTeamOptions] = useState<TeamOption[]>([]);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [teamFilterCountryId, setTeamFilterCountryId] = useState<number | null>(null);
  const [teamFilterLeagueId, setTeamFilterLeagueId] = useState<number | null>(null);
  const [teamFixtures, setTeamFixtures] = useState<FixtureWithNames[] | null>(null);
  const [teamFixturesLoading, setTeamFixturesLoading] = useState(false);
  const [teamError, setTeamError] = useState<string | null>(null);

  // Calendar state for the team view, computed client-side from the
  // already-fetched teamFixtures rather than a separate query -- a
  // season's worth of one team's fixtures (even across cups) is small
  // enough to hold in memory and re-derive locally.
  const [teamCalendarYear, setTeamCalendarYear] = useState(today.getFullYear());
  const [teamCalendarMonth, setTeamCalendarMonth] = useState(today.getMonth());
  const [selectedTeamDate, setSelectedTeamDate] = useState<string | null>(null);

  const teamDateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of teamFixtures ?? []) counts[f.kickoff_date] = (counts[f.kickoff_date] ?? 0) + 1;
    return counts;
  }, [teamFixtures]);

  const teamFilteredLeagues = useMemo(() => {
    return leagues.filter((l) => !teamFilterCountryId || l.country_id === teamFilterCountryId);
  }, [leagues, teamFilterCountryId]);

  const visibleTeamFixtures = useMemo(() => {
    if (!teamFixtures) return teamFixtures;
    if (!selectedTeamDate) return teamFixtures;
    return teamFixtures.filter((f) => f.kickoff_date === selectedTeamDate);
  }, [teamFixtures, selectedTeamDate]);

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
      const loadedLeagues = (data ?? []) as LeagueOption[];
      setLeagues(loadedLeagues);
      setLeagueId(
        (current) =>
          current ??
          loadedLeagues.find((league) => league.code === 'E0')?.league_id ??
          null
      );
    });
    getCountries().then((data) => setCountries(data ?? []));
    getSeasons().then((data) => {
      const loadedSeasons = data ?? [];
      setSeasons(loadedSeasons);
      setSeasonId((current) => current ?? loadedSeasons[0]?.season_id ?? null);
    });
  }, []);

  // Restore a team-view selection from the URL on first load (the search
  // dropdown itself only holds transient query text, so the team's display
  // name has to be fetched separately once we know its id).
  useEffect(() => {
    if (!urlTeamId) return;
    getTeamById(urlTeamId)
      .then((t) => setTeamName(t?.canonical_name ?? ''))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the URL in sync with the current selections, so navigating away
  // and back (or refreshing, or sharing the link) restores exactly this
  // view/filters rather than starting from blank.
  useEffect(() => {
    const params: Record<string, string> = {};
    if (viewMode === 'team') {
      params.view = 'team';
      if (teamId) params.team = String(teamId);
      if (seasonId) params.season = String(seasonId);
    } else {
      if (countryId) params.country = String(countryId);
      if (competitionType) params.type = competitionType;
      if (leagueId) params.league = String(leagueId);
      if (seasonId) params.season = String(seasonId);
      if (selectedMatchweek !== null) params.mw = String(selectedMatchweek);
    }
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, countryId, competitionType, leagueId, seasonId, selectedMatchweek, teamId]);

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

    if (viewMode !== 'division' || !leagueId || !seasonId) return;

    setCalendarLoading(true);
    getFixtureCalendarIndex(leagueId, seasonId)
      .then(setCalendarIndex)
      .catch((err) => setError(err.message ?? 'Failed to load fixtures'))
      .finally(() => setCalendarLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, leagueId, seasonId]);

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
    if (viewMode !== 'division' || !leagueId || !seasonId || selectedMatchweek === null) {
      setFixtures(null);
      return;
    }
    setLoading(true);
    setError(null);
    getFixturesForMatchweek(leagueId, seasonId, selectedMatchweek)
      .then(setFixtures)
      .catch((err) => setError(err.message ?? 'Failed to load fixtures'))
      .finally(() => setLoading(false));
  }, [viewMode, leagueId, seasonId, selectedMatchweek]);

  // When a calendar day is selected, fetch that day's fixtures to show
  // in place of the matchweek-based list below.
  useEffect(() => {
    if (viewMode !== 'division' || !leagueId || !seasonId || !selectedCalendarDate) {
      setDateFixtures(null);
      return;
    }
    setDateFixturesLoading(true);
    getFixturesForDate(leagueId, seasonId, selectedCalendarDate)
      .then(setDateFixtures)
      .catch((err) => setError(err.message ?? 'Failed to load fixtures for that date'))
      .finally(() => setDateFixturesLoading(false));
  }, [viewMode, leagueId, seasonId, selectedCalendarDate]);

  // Team search -- fetches matching teams as the person types, narrowed by
  // the Country/Division filters when set (Division narrowing also needs
  // a season, since league membership is only known per-season). The list
  // stays small (a few hundred teams total, or fewer once narrowed) so a
  // plain query per keystroke is cheap; no need for debouncing here.
  useEffect(() => {
    if (viewMode !== 'team' || !teamDropdownOpen) return;
    let cancelled = false;
    getTeams(teamQuery, { countryId: teamFilterCountryId, leagueId: teamFilterLeagueId, seasonId })
      .then((data) => {
        if (!cancelled) setTeamOptions((data ?? []).slice(0, 8));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [viewMode, teamQuery, teamDropdownOpen, teamFilterCountryId, teamFilterLeagueId, seasonId]);

  // If the Division narrowing filter falls outside the Country filter (or
  // the Country filter changes), drop it rather than silently keep
  // filtering by a division from a different country.
  useEffect(() => {
    if (!teamFilterLeagueId) return;
    if (teamFilteredLeagues.some((l) => l.league_id === teamFilterLeagueId)) return;
    setTeamFilterLeagueId(null);
  }, [teamFilteredLeagues, teamFilterLeagueId]);

  // Fetch the selected team's fixtures across every competition once a
  // team + season are both chosen. Also resets the team-view calendar's
  // day filter and snaps it back to the current month, since a date
  // selected for one team/season is meaningless once that changes.
  useEffect(() => {
    setSelectedTeamDate(null);
    setTeamCalendarYear(today.getFullYear());
    setTeamCalendarMonth(today.getMonth());

    if (viewMode !== 'team' || !teamId || !seasonId) {
      setTeamFixtures(null);
      return;
    }
    setTeamFixturesLoading(true);
    setTeamError(null);
    getFixturesForTeam(teamId, seasonId)
      .then(setTeamFixtures)
      .catch((err) => setTeamError(err.message ?? 'Failed to load fixtures'))
      .finally(() => setTeamFixturesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, teamId, seasonId]);

  function exploreFixture(f: FixtureWithNames) {
    navigate(`/preview?league=${f.league_id}&home=${f.home_team_id}&away=${f.away_team_id}`);
  }

  function selectTeam(t: TeamOption) {
    setTeamId(t.team_id);
    setTeamName(t.canonical_name);
    setTeamQuery('');
    setTeamDropdownOpen(false);
  }

  // Cup fixtures get an amber treatment, league fixtures the app's usual
  // pitch-green -- only matters where the two mix in one list (the Team
  // view spans every competition a team plays in a season).
  function competitionBadgeClass(type?: string | null) {
    return type === 'cup'
      ? 'text-amber-600 bg-amber-500/15'
      : 'text-pitch-700 bg-pitch-700/10';
  }
  function competitionAccentClass(type?: string | null) {
    return type === 'cup' ? 'border-l-4 border-amber-500' : 'border-l-4 border-pitch-700/40';
  }

  const competitionTypeOptions = useMemo(() => {
    const seen = new Set<string>();
    for (const l of leagues) if (l.competition_type) seen.add(l.competition_type);
    return [...seen].sort();
  }, [leagues]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide">Fixtures</h1>
        <p className="text-ink-500 mt-1">
          Browse fixtures by division or by team, then jump straight into a full stats comparison.
        </p>
      </div>

      <div className="inline-flex rounded-lg border border-chalk-300 overflow-hidden text-sm font-medium">
        <button
          onClick={() => setViewMode('division')}
          className={[
            'px-4 py-2 transition-colors',
            viewMode === 'division' ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100',
          ].join(' ')}
        >
          By Division
        </button>
        <button
          onClick={() => setViewMode('team')}
          className={[
            'px-4 py-2 transition-colors border-l border-chalk-300',
            viewMode === 'team' ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100',
          ].join(' ')}
        >
          By Team
        </button>
      </div>

      {viewMode === 'division' ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
          <div>
            <label className={labelClass}>Country</label>
            <select
              value={countryId ?? ''}
              onChange={(e) => setCountryId(e.target.value ? Number(e.target.value) : null)}
              className={selectClass}
            >
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c.country_id} value={c.country_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Competition</label>
            <select
              value={competitionType}
              onChange={(e) => setCompetitionType(e.target.value)}
              className={selectClass}
            >
              <option value="">All types</option>
              {competitionTypeOptions.map((t) => (
                <option key={t} value={t}>
                  {t === 'league' ? 'League' : t === 'cup' ? 'Cup' : t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Division</label>
            <select
              value={leagueId ?? ''}
              onChange={(e) => setLeagueId(e.target.value ? Number(e.target.value) : null)}
              className={selectClass}
            >
              <option value="">Select&hellip;</option>
              {filteredLeagues.map((l) => (
                <option key={l.league_id} value={l.league_id}>
                  {l.code} &mdash; {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Season</label>
            <select
              value={seasonId ?? ''}
              onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : null)}
              className={selectClass}
            >
              <option value="">Select&hellip;</option>
              {seasons.map((s) => (
                <option key={s.season_id} value={s.season_id}>
                  {s.start_year}/{String(s.end_year).slice(2)}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl relative">
          <div>
            <label className={labelClass}>Country</label>
            <select
              value={teamFilterCountryId ?? ''}
              onChange={(e) => setTeamFilterCountryId(e.target.value ? Number(e.target.value) : null)}
              className={selectClass}
            >
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c.country_id} value={c.country_id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Division</label>
            <select
              value={teamFilterLeagueId ?? ''}
              onChange={(e) => setTeamFilterLeagueId(e.target.value ? Number(e.target.value) : null)}
              className={selectClass}
            >
              <option value="">All divisions</option>
              {teamFilteredLeagues.map((l) => (
                <option key={l.league_id} value={l.league_id}>
                  {l.code} &mdash; {l.name}
                </option>
              ))}
            </select>
            {teamFilterLeagueId && !seasonId && (
              <p className="text-[11px] text-ink-500 mt-1">Pick a season to apply this.</p>
            )}
          </div>
          <div className="relative">
            <label className={labelClass}>Team</label>
            <input
              type="text"
              value={teamDropdownOpen ? teamQuery : teamName}
              placeholder="Search for a team&hellip;"
              onFocus={() => {
                setTeamDropdownOpen(true);
                setTeamQuery('');
              }}
              onChange={(e) => setTeamQuery(e.target.value)}
              onBlur={() => setTimeout(() => setTeamDropdownOpen(false), 150)}
              className={selectClass}
            />
            {teamDropdownOpen && teamOptions.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full max-w-xs bg-white border border-chalk-300 rounded shadow-lg max-h-56 overflow-y-auto">
                {teamOptions.map((t) => (
                  <li key={t.team_id}>
                    <button
                      type="button"
                      onMouseDown={() => selectTeam(t)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-chalk-100"
                    >
                      {t.canonical_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <label className={labelClass}>Season</label>
            <select
              value={seasonId ?? ''}
              onChange={(e) => setSeasonId(e.target.value ? Number(e.target.value) : null)}
              className={selectClass}
            >
              <option value="">Select&hellip;</option>
              {seasons.map((s) => (
                <option key={s.season_id} value={s.season_id}>
                  {s.start_year}/{String(s.end_year).slice(2)}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {viewMode === 'division' && leagueId && seasonId && (
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

      {viewMode === 'team' && teamId && seasonId && teamFixtures && teamFixtures.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <FixtureCalendarHeatmap
            dateCounts={teamDateCounts}
            loading={teamFixturesLoading}
            selectedDate={selectedTeamDate}
            onSelectDate={setSelectedTeamDate}
            viewYear={teamCalendarYear}
            viewMonth={teamCalendarMonth}
            onChangeMonth={(y, m) => {
              setTeamCalendarYear(y);
              setTeamCalendarMonth(m);
            }}
          />
          <div className="flex-1 min-w-0 text-ink-500 text-sm pt-1">
            Click a day to filter {teamName}&rsquo;s fixture list below to that date.
          </div>
        </div>
      )}

      {error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{error}</div>
      )}
      {teamError && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{teamError}</div>
      )}

      {viewMode === 'team' ? (
        <>
          {!teamId && (
            <p className="text-ink-500">Search for a team above to see its fixtures across every competition.</p>
          )}
          {teamId && !seasonId && <p className="text-ink-500">Select a season.</p>}
          {teamFixturesLoading && <p className="text-ink-500 font-mono text-sm">Loading fixtures&hellip;</p>}

          {teamFixtures && teamFixtures.length === 0 && !teamFixturesLoading && (
            <p className="text-ink-500">No fixtures found for {teamName} that season.</p>
          )}

          {visibleTeamFixtures && visibleTeamFixtures.length > 0 && (
            <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white">
              <div className="px-4 py-2 bg-pitch-900 text-chalk-100 font-display uppercase text-sm tracking-wide flex items-center justify-between">
                <span>
                  {teamName} &mdash; {selectedTeamDate ? formatMatchDate(selectedTeamDate) : 'All Competitions'}
                </span>
                {selectedTeamDate && (
                  <button
                    onClick={() => setSelectedTeamDate(null)}
                    className="text-chalk-100/80 hover:text-chalk-100 text-xs normal-case tracking-normal underline"
                  >
                    Clear date filter
                  </button>
                )}
              </div>
              <ul className="divide-y divide-chalk-300">
                {visibleTeamFixtures.map((f) => (
                  <li
                    key={f.fixture_id}
                    className={[
                      'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 hover:bg-chalk-100 transition-colors cursor-pointer',
                      competitionAccentClass(f.competition_type),
                    ].join(' ')}
                    onClick={() => exploreFixture(f)}
                  >
                    <span className="font-mono text-xs text-ink-500 w-32 shrink-0">
                      {formatMatchDateWithYear(f.kickoff_date)}
                    </span>
                    {f.league_code && (
                      <span
                        className={[
                          'text-[10px] uppercase tracking-wide font-medium rounded px-1.5 py-0.5 w-fit shrink-0',
                          competitionBadgeClass(f.competition_type),
                        ].join(' ')}
                      >
                        {f.league_code}
                      </span>
                    )}
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
      ) : selectedCalendarDate ? (
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
