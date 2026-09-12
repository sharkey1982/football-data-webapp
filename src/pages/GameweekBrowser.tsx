import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getLeagues,
  getCountries,
  getSeasons,
  getTeams,
  getTeamById,
  getFixturesForSeason,
  getMatchesForSeasonAsFixtures,
  getFixturesForTeam,
  getMatchesForTeamAsFixtures,
  type FixtureWithNames,
} from '../lib/api';
import { formatMatchDate, formatMatchDateWithYear } from '../lib/formatDate';
import FixtureCalendarHeatmap from '../components/FixtureCalendarHeatmap';
import { ScoreChip } from '../components/ScoreChip';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month]} ${year}`;
}

/** Today as a local 'YYYY-MM-DD' key, matching the format `kickoff_date`
 *  and the calendar's own date keys use. Used to default the fixtures
 *  list to "today" on load, rather than an empty or unfiltered list. */
function todayIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** Normalises a possibly out-of-range (year, month) pair -- e.g. month 12 -> next year, January. */
function normaliseMonth(year: number, month: number): { year: number; month: number } {
  const total = year * 12 + month;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
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

/**
 * The score/status slot in a fixture row: the actual result once played,
 * otherwise the stored pre-match Dixon-Coles expected-goals prediction
 * when one exists, otherwise a plain "vs". Shown as decimals with an
 * "xG est." label and an explanatory tooltip -- deliberately NOT styled
 * to look like a real scoreline (no ScoreChip), so an expectation can
 * never be mistaken for a result.
 */
function FixtureScoreCell({ f }: { f: FixtureWithNames }) {
  if (f.full_time_home_goals != null && f.full_time_away_goals != null) {
    return (
      <div className="flex flex-col items-center">
        <ScoreChip homeGoals={f.full_time_home_goals} awayGoals={f.full_time_away_goals} size="sm" />
        {f.half_time_home_goals != null && f.half_time_away_goals != null && (
          <span className="text-[10px] text-ink-500 font-mono mt-0.5">
            HT {f.half_time_home_goals}&ndash;{f.half_time_away_goals}
          </span>
        )}
        {f.predicted_home_goals != null && f.predicted_away_goals != null && (
          <span
            className="text-[9px] text-ink-400 font-mono italic mt-0.5"
            title="Dixon-Coles pre-match expected goals, frozen before kickoff -- how the model rated this game beforehand, for comparison with what actually happened"
          >
            xG {f.predicted_home_goals.toFixed(1)}&ndash;{f.predicted_away_goals.toFixed(1)}
          </span>
        )}
      </div>
    );
  }
  if (f.predicted_home_goals != null && f.predicted_away_goals != null) {
    return (
      <div
        className="flex flex-col items-center"
        title="Dixon-Coles pre-match expected goals -- a model estimate, not a result"
      >
        <span className="text-ink-500 text-xs font-mono text-center italic">
          {f.predicted_home_goals.toFixed(1)}&ndash;{f.predicted_away_goals.toFixed(1)}
        </span>
        <span className="text-[8px] text-ink-400 uppercase tracking-wide mt-0.5">xG est.</span>
      </div>
    );
  }
  return <span className="text-ink-500 text-xs font-mono text-center">vs</span>;
}

export default function GameweekBrowser() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const urlView = searchParams.get('view') === 'team' ? 'team' : 'division';
  const urlLeagueId = searchParams.get('league') ? Number(searchParams.get('league')) : null;
  const urlSeasonId = searchParams.get('season') ? Number(searchParams.get('season')) : null;
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

  const [seasonFixtures, setSeasonFixtures] = useState<FixtureWithNames[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const today = new Date();
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  // Defaults to today; can hold more than one date (multi-select) --
  // this is what the fixture list below is filtered to, independent of
  // which months the calendar is currently paged to.
  const [selectedCalendarDates, setSelectedCalendarDates] = useState<Set<string>>(
    () => new Set([todayIsoDate()])
  );
  // Which matchweek/month sections are expanded, keyed by group key (see
  // groupFixtures below). A Set rather than a single value, since more
  // than one section can be open at once.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  // True when the selected division+season has no rows in `fixtures` at
  // all (a fully historic, completed season) and the list below is
  // sourced from `matches` instead -- see getMatchesForSeasonAsFixtures.
  const [historicMode, setHistoricMode] = useState(false);

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
  // Single-select for the team view (a team rarely plays "today", so
  // unlike the division view this isn't defaulted) -- represented as a
  // Set to match the calendar component's multi-select-capable API.
  const [selectedTeamDates, setSelectedTeamDates] = useState<Set<string>>(new Set());
  function toggleTeamDate(date: string) {
    setSelectedTeamDates((prev) => (prev.has(date) ? new Set() : new Set([date])));
  }
  // True when teamFixtures came from getMatchesForTeamAsFixtures (a
  // fixtures-less historic season) rather than getFixturesForTeam.
  const [teamHistoricMode, setTeamHistoricMode] = useState(false);

  const teamDateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of teamFixtures ?? []) counts[f.kickoff_date] = (counts[f.kickoff_date] ?? 0) + 1;
    return counts;
  }, [teamFixtures]);

  // Unlike the Division view, a team's fixtures can span both league and
  // cup competitions, so this is a genuine per-date lookup -- 'mixed' when
  // a date has both (rare, but the calendar should still show it clearly).
  const teamDateTypes = useMemo(() => {
    const seen: Record<string, Set<'league' | 'cup'>> = {};
    for (const f of teamFixtures ?? []) {
      const type: 'league' | 'cup' = f.competition_type === 'cup' ? 'cup' : 'league';
      (seen[f.kickoff_date] ??= new Set()).add(type);
    }
    const result: Record<string, 'league' | 'cup' | 'mixed'> = {};
    for (const [date, types] of Object.entries(seen)) {
      result[date] = types.size > 1 ? 'mixed' : [...types][0];
    }
    return result;
  }, [teamFixtures]);

  const teamFilteredLeagues = useMemo(() => {
    return leagues.filter((l) => !teamFilterCountryId || l.country_id === teamFilterCountryId);
  }, [leagues, teamFilterCountryId]);

  const visibleTeamFixtures = useMemo(() => {
    if (!teamFixtures) return teamFixtures;
    if (selectedTeamDates.size === 0) return teamFixtures;
    return teamFixtures.filter((f) => selectedTeamDates.has(f.kickoff_date));
  }, [teamFixtures, selectedTeamDates]);

  const dateCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of seasonFixtures ?? []) counts[f.kickoff_date] = (counts[f.kickoff_date] ?? 0) + 1;
    return counts;
  }, [seasonFixtures]);

  // Division view only ever shows one league at a time, so every date in
  // its calendar shares that league's competition type -- no per-date
  // lookup needed, just a uniform map matching dateCounts' keys.
  const selectedLeagueCompetitionType = useMemo(
    () => leagues.find((l) => l.league_id === leagueId)?.competition_type,
    [leagues, leagueId]
  );
  const calendarDateTypes = useMemo(() => {
    const type = selectedLeagueCompetitionType === 'cup' ? 'cup' : 'league';
    const map: Record<string, 'league' | 'cup'> = {};
    for (const date of Object.keys(dateCounts)) map[date] = type;
    return map;
  }, [dateCounts, selectedLeagueCompetitionType]);

  // Groups the season's fixtures into sections for the collapsible list:
  // by matchweek when that data exists (the normal case), or by month
  // when it doesn't (a historic season sourced from `matches`, which
  // carries no matchweek column at all). Always sorted chronologically.
  type FixtureGroup = { key: string; label: string; sortKey: string; fixtures: FixtureWithNames[] };
  const groups = useMemo((): FixtureGroup[] => {
    if (!seasonFixtures) return [];
    const map = new Map<string, FixtureGroup>();
    for (const f of seasonFixtures) {
      // The calendar's date selection is the source of truth for which
      // fixtures show below -- when nothing is selected, fall back to
      // showing everything (the months-on-screen effect further down
      // still narrows which sections start expanded).
      if (selectedCalendarDates.size > 0 && !selectedCalendarDates.has(f.kickoff_date)) continue;
      let key: string;
      let label: string;
      let sortKey: string;
      if (!historicMode && f.matchweek != null) {
        key = `mw-${f.matchweek}`;
        label = `Matchweek ${f.matchweek}`;
        sortKey = String(f.matchweek).padStart(4, '0');
      } else if (!historicMode) {
        key = 'mw-none';
        label = 'Other fixtures';
        sortKey = '9999';
      } else {
        const [y, m] = f.kickoff_date.split('-');
        key = `month-${y}-${m}`;
        label = monthLabel(Number(y), Number(m) - 1);
        sortKey = `${y}-${m}`;
      }
      let group = map.get(key);
      if (!group) {
        group = { key, label, sortKey, fixtures: [] };
        map.set(key, group);
      }
      group.fixtures.push(f);
    }
    // Chronological within a group too: kickoff_date first, then
    // kickoff_time -- the query orders by date only, so two fixtures on
    // the same day can otherwise come back in an arbitrary order (e.g. a
    // 20:00 kickoff listed before a 17:30 one).
    for (const group of map.values()) {
      group.fixtures.sort((a, b) => {
        if (a.kickoff_date !== b.kickoff_date) return a.kickoff_date < b.kickoff_date ? -1 : 1;
        return (a.kickoff_time ?? '').localeCompare(b.kickoff_time ?? '');
      });
    }
    return [...map.values()].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  }, [seasonFixtures, historicMode, selectedCalendarDates]);

  // Which groups have any fixture in a given (year, month) -- used both to
  // decide which sections the calendar's two visible months should expand
  // (the actual "calendar filters the list" behaviour) and, on first load,
  // to seed the initial month the calendar opens on.
  function groupKeysForMonth(year: number, month: number): string[] {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    return groups.filter((g) => g.fixtures.some((f) => f.kickoff_date.startsWith(prefix))).map((g) => g.key);
  }

  const groupKeyForDate = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of groups) for (const f of g.fixtures) map[f.kickoff_date] = g.key;
    return map;
  }, [groups]);

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
    }
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, countryId, competitionType, leagueId, seasonId, teamId]);

  // Fetches the WHOLE season's fixtures in one go -- powers the calendar,
  // the matchweek grouping, and the list, all from a single source of
  // truth. (Previously the calendar and the list were two separate
  // fetches that could end up showing inconsistent things; this can't.)
  useEffect(() => {
    setSeasonFixtures(null);
    setError(null);
    setSelectedCalendarDates(new Set([todayIsoDate()]));
    setCalendarYear(today.getFullYear());
    setCalendarMonth(today.getMonth());
    setHistoricMode(false);
    setExpandedGroups(new Set());

    if (viewMode !== 'division' || !leagueId || !seasonId) return;

    setLoading(true);
    getFixturesForSeason(leagueId, seasonId)
      .then(async (rows) => {
        if (rows.length > 0) return rows;
        // No scheduled fixtures for this division/season -- fall back to
        // the results archive, which covers every season back to 2014/15
        // (fixtures.csv imports only ever cover the current official
        // schedule, never historic ones).
        const historicRows = await getMatchesForSeasonAsFixtures(leagueId, seasonId);
        if (historicRows.length > 0) {
          setHistoricMode(true);
          // "Today" is never useful for a fully historic season -- clear
          // the default date selection (it would otherwise filter the
          // list down to nothing) and land on the month of its last
          // match instead of an empty calendar the person would have to
          // page back through years to reach.
          setSelectedCalendarDates(new Set());
          const latestDate = historicRows.reduce(
            (max, r) => (r.kickoff_date > max ? r.kickoff_date : max),
            historicRows[0].kickoff_date
          );
          const [y, m] = latestDate.split('-').map(Number);
          setCalendarYear(y);
          setCalendarMonth(m - 1);
        }
        return historicRows;
      })
      .then(setSeasonFixtures)
      .catch((err) => setError(err.message ?? 'Failed to load fixtures'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, leagueId, seasonId]);

  // Whenever the visible groups change -- because a date got
  // selected/deselected, or (with no date selected) because the calendar
  // was paged to a different pair of months -- expand exactly the
  // section(s) that should be showing. With an active date selection,
  // `groups` is already narrowed to just the selected date(s), so every
  // remaining group is shown open regardless of which months the
  // calendar itself is currently paged to.
  useEffect(() => {
    if (groups.length === 0) return;
    if (selectedCalendarDates.size > 0) {
      setExpandedGroups(new Set(groups.map((g) => g.key)));
      return;
    }
    const next = normaliseMonth(calendarYear, calendarMonth + 1);
    const matching = new Set([
      ...groupKeysForMonth(calendarYear, calendarMonth),
      ...groupKeysForMonth(next.year, next.month),
    ]);
    setExpandedGroups(matching);
    const firstKey = groups.find((g) => matching.has(g.key))?.key;
    if (firstKey) {
      requestAnimationFrame(() => {
        groupRefs.current[firstKey]?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendarYear, calendarMonth, groups]);

  // Refs to each group's section, so the calendar can scroll a section
  // into view once expanded.
  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Toggles one date in/out of the multi-select set -- this is what
  // actually filters the fixture list below (see `groups`). Scrolls to
  // that date's section on select; nothing to scroll to on deselect.
  function toggleCalendarDate(date: string) {
    setSelectedCalendarDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
    if (selectedCalendarDates.has(date)) return;
    const groupKey = groupKeyForDate[date];
    if (!groupKey) return;
    requestAnimationFrame(() => {
      groupRefs.current[groupKey]?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    });
  }

  function toggleGroup(key: string) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
    setSelectedTeamDates(new Set());
    setTeamCalendarYear(today.getFullYear());
    setTeamCalendarMonth(today.getMonth());
    setTeamHistoricMode(false);

    if (viewMode !== 'team' || !teamId || !seasonId) {
      setTeamFixtures(null);
      return;
    }
    setTeamFixturesLoading(true);
    setTeamError(null);
    getFixturesForTeam(teamId, seasonId)
      .then(async (rows) => {
        if (rows.length > 0) return rows;
        // No scheduled fixtures for this team+season -- fall back to the
        // results archive (same reasoning as the Division view's fallback).
        const historicRows = await getMatchesForTeamAsFixtures(teamId, seasonId);
        if (historicRows.length > 0) {
          setTeamHistoricMode(true);
          const latestDate = historicRows.reduce(
            (max, r) => (r.kickoff_date > max ? r.kickoff_date : max),
            historicRows[0].kickoff_date
          );
          const [y, m] = latestDate.split('-').map(Number);
          setTeamCalendarYear(y);
          setTeamCalendarMonth(m - 1);
        }
        return historicRows;
      })
      .then(setTeamFixtures)
      .catch((err) => setTeamError(err.message ?? 'Failed to load fixtures'))
      .finally(() => setTeamFixturesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, teamId, seasonId]);

  function exploreFixture(f: FixtureWithNames) {
    navigate(`/preview?league=${f.league_id}&home=${f.home_team_id}&away=${f.away_team_id}&season=${f.season_id}`);
  }

  function selectTeam(t: TeamOption) {
    setTeamId(t.team_id);
    setTeamName(t.canonical_name);
    setTeamQuery('');
    setTeamDropdownOpen(false);
  }

  // Cup fixtures get the steel-blue treatment end-to-end -- background
  // wash, border accent, badge, and the team names themselves -- so a cup
  // fixture reads as different at a glance, not just via a small label.
  // League fixtures stay in the app's default pitch-green/white styling.
  function competitionRowClass(type?: string | null) {
    return type === 'cup'
      ? 'bg-cup-700/10 hover:bg-cup-700/20 border-l-4 border-cup-700'
      : 'hover:bg-chalk-100 border-l-4 border-pitch-700/30';
  }
  function competitionTextClass(type?: string | null) {
    return type === 'cup' ? 'text-cup-800' : 'text-ink-900';
  }
  function competitionBadgeClass(type?: string | null) {
    return type === 'cup'
      ? 'text-cup-800 bg-cup-700/15'
      : 'text-pitch-700 bg-pitch-700/10';
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
            dateTypes={calendarDateTypes}
            loading={loading}
            selectedDates={selectedCalendarDates}
            onToggleDate={toggleCalendarDate}
            viewYear={calendarYear}
            viewMonth={calendarMonth}
            onChangeMonth={(y, m) => {
              setCalendarYear(y);
              setCalendarMonth(m);
            }}
          />

          <div className="flex-1 min-w-0 text-ink-500 text-sm pt-1">
            {Object.keys(dateCounts).length === 0 && !error && !loading && (
              <p>No fixtures or results found for this division/season yet.</p>
            )}

            {historicMode && !error && !loading && (
              <p>
                This season is complete &mdash; sourced from the results archive rather than the fixture
                schedule, grouped by month below.
              </p>
            )}

            {Object.keys(dateCounts).length > 0 && !error && !loading && (
              <p>
                {selectedCalendarDates.size > 0
                  ? `The list below shows fixtures on the ${selectedCalendarDates.size === 1 ? 'selected day' : `${selectedCalendarDates.size} selected days`} only.`
                  : `The list below shows the ${historicMode ? 'months' : 'matchweeks'} visible on the calendar \u2014 page it to filter.`}{' '}
                Tap a day to select it, or tap again to deselect &mdash; tap more than one day to
                compare several at once.
                {selectedCalendarDates.size > 0 && (
                  <button
                    onClick={() => setSelectedCalendarDates(new Set())}
                    className="ml-2 text-pitch-700 font-medium hover:underline"
                  >
                    Clear
                  </button>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      {viewMode === 'team' && teamId && seasonId && teamFixtures && teamFixtures.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <FixtureCalendarHeatmap
            dateCounts={teamDateCounts}
            dateTypes={teamDateTypes}
            loading={teamFixturesLoading}
            selectedDates={selectedTeamDates}
            onToggleDate={toggleTeamDate}
            viewYear={teamCalendarYear}
            viewMonth={teamCalendarMonth}
            onChangeMonth={(y, m) => {
              setTeamCalendarYear(y);
              setTeamCalendarMonth(m);
            }}
          />
          <div className="flex-1 min-w-0 text-ink-500 text-sm pt-1">
            {teamHistoricMode && (
              <p className="mb-1">This season is complete &mdash; sourced from the results archive.</p>
            )}
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
                  {teamName} &mdash;{' '}
                  {selectedTeamDates.size === 1
                    ? formatMatchDate([...selectedTeamDates][0])
                    : 'All Competitions'}
                </span>
                {selectedTeamDates.size > 0 && (
                  <button
                    onClick={() => setSelectedTeamDates(new Set())}
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
                      'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 transition-colors cursor-pointer',
                      competitionRowClass(f.competition_type),
                    ].join(' ')}
                    onClick={() => exploreFixture(f)}
                  >
                    <span className={['font-mono text-xs w-32 shrink-0', f.competition_type === 'cup' ? 'text-cup-700' : 'text-ink-500'].join(' ')}>
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
                      <span className={['truncate font-medium min-w-0', competitionTextClass(f.competition_type)].join(' ')}>
                        {f.home_team_name}
                      </span>
                      <FixtureScoreCell f={f} />
                      <span className={['truncate font-medium text-right min-w-0', competitionTextClass(f.competition_type)].join(' ')}>
                        {f.away_team_name}
                      </span>
                    </div>
                    <span
                      className={[
                        'text-xs font-medium shrink-0 hidden sm:inline',
                        f.competition_type === 'cup' ? 'text-cup-700' : 'text-pitch-700',
                      ].join(' ')}
                    >
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

          {groups.length > 0 && (
            <div className="space-y-3">
              {groups.map((g) => {
                const expanded = expandedGroups.has(g.key);
                return (
                  <div
                    key={g.key}
                    ref={(el) => {
                      groupRefs.current[g.key] = el;
                    }}
                    className="border border-chalk-300 rounded-lg overflow-hidden bg-white scroll-mt-4"
                  >
                    <button
                      onClick={() => toggleGroup(g.key)}
                      className="w-full flex items-center justify-between px-4 py-2 bg-pitch-900 text-chalk-100 hover:bg-pitch-800 transition-colors"
                    >
                      <span className="font-display uppercase text-sm tracking-wide">{g.label}</span>
                      <span className="text-xs text-chalk-100/70 font-mono flex items-center gap-2">
                        {g.fixtures.length} fixture{g.fixtures.length === 1 ? '' : 's'}
                        <span className="normal-case">{expanded ? '\u25b2' : '\u25bc'}</span>
                      </span>
                    </button>
                    {expanded && (
                      <ul className="divide-y divide-chalk-300">
                        {g.fixtures.map((f) => (
                          <li
                            key={f.fixture_id}
                            className={[
                              'flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 px-4 py-3 transition-colors cursor-pointer',
                              selectedCalendarDates.has(f.kickoff_date)
                                ? 'bg-amber-500/15 hover:bg-amber-500/20'
                                : 'hover:bg-chalk-100',
                            ].join(' ')}
                            onClick={() => exploreFixture(f)}
                          >
                            <span className="font-mono text-xs text-ink-500 w-28 shrink-0">
                              {formatMatchDate(f.kickoff_date)}
                              {f.kickoff_time && ` ${f.kickoff_time.slice(0, 5)}`}
                            </span>
                            <div className="flex-1 grid grid-cols-[1fr_auto_1fr] items-center gap-3 min-w-0">
                              <span className="truncate font-medium min-w-0">{f.home_team_name}</span>
                              <FixtureScoreCell f={f} />
                              <span className="truncate font-medium text-right min-w-0">{f.away_team_name}</span>
                            </div>
                            <span className="text-xs text-pitch-700 font-medium shrink-0 hidden sm:inline">
                              Explore &rarr;
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
