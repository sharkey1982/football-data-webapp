import { trackEvent } from '../lib/analytics';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getLeagues,
  getLatestFitRun,
  getTeamRatingsForFitRun,
  getMatchesForTeam,
  getHeadToHead,
  getMatchResult,
  getTeamById,
  getTeamsInLeagueFixtures,
  getMostRecentFixtureSeason,
  splitHomeAway,
  buildFormEntries,
  computeStreaks,
  type TeamWithRating,
  type MatchWithNames,
  getUpcomingFixtureForPairing,
} from '../lib/api';
import { calculateDixonColes, calculateDixonColesFromExpectedGoals, type DixonColesResult } from '../lib/dixonColes';
import type { ModelFitRun } from '../types/database';
import { ComparisonCard, StreakBadges } from '../components/ComparisonCard';
import { HeadToHeadSummary } from '../components/HeadToHeadSummary';
import { MatchStatsGrid } from '../components/MatchStatsGrid';
import { ScoreChip } from '../components/ScoreChip';
import { formatMatchDateWithYear } from '../lib/formatDate';
import { ScoreProbabilityGrid } from '../components/ScoreProbabilityGrid';
import { TeamStatsPanel } from '../components/TeamStatsPanel';
import { FitFreshnessBanner } from '../components/FitFreshnessBanner';
import { useDocumentHead } from '../hooks/useDocumentHead';

type LeagueOption = { league_id: number; code: string; name: string };
type Tab = 'overview' | 'home' | 'away' | 'prediction';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'home', label: 'Home Team' },
  { id: 'away', label: 'Away Team' },
  { id: 'prediction', label: 'Prediction' },
];

export default function MatchPreview() {
  useDocumentHead({
    title: 'Match Preview',
    description: 'Head-to-head history, team form, and Dixon-Coles score probabilities for an upcoming fixture.',
    path: '/preview',
  });

  const [searchParams] = useSearchParams();
  const urlLeagueId = searchParams.get('league') ? Number(searchParams.get('league')) : null;
  const urlHomeId = searchParams.get('home') ? Number(searchParams.get('home')) : null;
  const urlAwayId = searchParams.get('away') ? Number(searchParams.get('away')) : null;
  const urlSeasonId = searchParams.get('season') ? Number(searchParams.get('season')) : null;

  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [leagueId, setLeagueId] = useState<number | null>(urlLeagueId);

  const [fitRun, setFitRun] = useState<ModelFitRun | null>(null);
  const [ratedTeams, setRatedTeams] = useState<TeamWithRating[]>([]);
  const [pickerTeams, setPickerTeams] = useState<{ team_id: number; canonical_name: string }[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [modelUnavailable, setModelUnavailable] = useState<{ home?: string; away?: string } | null>(null);

  const [homeTeamId, setHomeTeamId] = useState<number | null>(urlHomeId);
  const [awayTeamId, setAwayTeamId] = useState<number | null>(urlAwayId);

  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState<{
    homeMatchesFull: MatchWithNames[]; // last 60 -- used for venue-specific form/streaks and the per-team tabs
    awayMatchesFull: MatchWithNames[];
    h2hMatches: MatchWithNames[];
    dixonColes: DixonColesResult | null;
    /** True when the numbers came from the stored production prediction
     * rather than a live recompute -- the two can differ where a manual
     * override is in play, so the reader is told which they're seeing. */
    usedStoredPrediction: boolean;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

  // Set only when this preview was reached via a fixture link whose exact
  // league+season+home+away pairing has already been played -- distinct
  // from head-to-head (which finds the two teams' most recent meeting in
  // ANY competition, possibly a different, later match). Null both before
  // the lookup runs and when the specific fixture hasn't been played yet.
  const [matchResult, setMatchResult] = useState<MatchWithNames | null>(null);

  // Fires when a comparison has actually been built and rendered, not
  // when the page is merely opened -- the page can sit on the picker
  // indefinitely without ever producing one. Keyed on previewData
  // becoming non-null, so re-picking the same teams doesn't re-fire.
  useEffect(() => {
    if (previewData) trackEvent('team_comparison_view');
  }, [previewData]);


  useEffect(() => {
    getLeagues().then((data) => setLeagues(data ?? []));
  }, []);

  // Tracks the previous leagueId so we only wipe home/away team selections
  // on a GENUINE league change (the user picking a different division),
  // never on the initial mount -- including React StrictMode's deliberate
  // double-invocation of effects in development. Comparing against the
  // previous VALUE (rather than a boolean "first run" flag) is robust to
  // that double-invocation, since on both StrictMode passes the previous
  // value is still genuinely undefined until a real change occurs.
  const previousLeagueId = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    setFitRun(null);
    setRatedTeams([]);
    setPickerTeams([]);
    const isGenuineLeagueChange =
      previousLeagueId.current !== undefined && previousLeagueId.current !== leagueId;
    if (isGenuineLeagueChange) {
      setHomeTeamId(null);
      setAwayTeamId(null);
    }
    previousLeagueId.current = leagueId;
    setPreviewData(null);
    setError(null);

    if (!leagueId) return;

    setLoadingTeams(true);
    (async () => {
      try {
        // getMostRecentFixtureSeason only needs leagueId (already known),
        // not fit/rated -- start it immediately rather than after the
        // fit-run chain finishes, so both requests are in flight together
        // instead of one waiting on the other for no reason.
        const seasonPromise = getMostRecentFixtureSeason(leagueId);

        const fit = await getLatestFitRun(leagueId);
        let rated: TeamWithRating[] = [];
        if (fit) {
          setFitRun(fit);
          rated = await getTeamRatingsForFitRun(fit.fit_run_id);
          setRatedTeams(rated);
        } else {
          setError('No model has been fitted for this league yet.');
        }

        const currentSeason = await seasonPromise;
        const merged = new Map<number, string>();
        for (const t of rated) merged.set(t.team_id, t.canonical_name);
        if (currentSeason) {
          const fixtureTeams = await getTeamsInLeagueFixtures(leagueId, currentSeason.season_id);
          for (const t of fixtureTeams) {
            if (!merged.has(t.team_id)) merged.set(t.team_id, t.canonical_name);
          }
        }
        setPickerTeams(
          [...merged.entries()]
            .map(([team_id, canonical_name]) => ({ team_id, canonical_name }))
            .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name))
        );
      } catch (err: any) {
        setError(err.message ?? 'Failed to load team data');
      } finally {
        setLoadingTeams(false);
      }
    })();
  }, [leagueId]);

  async function buildPreview() {
    if (!homeTeamId || !awayTeamId) return;
    const home = ratedTeams.find((t) => t.team_id === homeTeamId);
    const away = ratedTeams.find((t) => t.team_id === awayTeamId);

    setLoadingPreview(true);
    setError(null);
    setModelUnavailable(null);
    setMatchResult(null);
    setActiveTab('overview');
    try {
      const [homeMatchesFull, awayMatchesFull, h2hMatches, matchedResult] = await Promise.all([
        getMatchesForTeam(homeTeamId, 60),
        getMatchesForTeam(awayTeamId, 60),
        getHeadToHead(homeTeamId, awayTeamId, 10),
        urlSeasonId && leagueId ? getMatchResult(leagueId, urlSeasonId, homeTeamId, awayTeamId) : Promise.resolve(null),
      ]);
      setMatchResult(matchedResult);

      let dixonColes: DixonColesResult | null = null;
      let usedStoredPrediction = false;
      if (home && away && fitRun) {
        // PREFER THE STORED PREDICTION where this pairing is a real
        // scheduled fixture. fixtures.predicted_* includes manual
        // team-strength overrides; recomputing from raw ratings drops
        // them, and 96 fixtures currently differ by up to 0.14 goals.
        // Without this the same match reads one way here and another on
        // Results Projections.
        const storedFixture =
          leagueId != null ? await getUpcomingFixtureForPairing(leagueId, homeTeamId!, awayTeamId!) : null;

        if (
          storedFixture &&
          storedFixture.predicted_home_goals != null &&
          storedFixture.predicted_away_goals != null
        ) {
          dixonColes = calculateDixonColesFromExpectedGoals(
            storedFixture.predicted_home_goals,
            storedFixture.predicted_away_goals,
            fitRun.rho
          );
          usedStoredPrediction = true;
        } else {
          // No scheduled fixture for this pairing -- the picker allows
          // any two teams, so this is a hypothetical. Recomputing from
          // ratings is the only option and is correct here.
          dixonColes = calculateDixonColes({
            homeAttack: home.attack_strength,
            homeDefence: home.defence_strength,
            awayAttack: away.attack_strength,
            awayDefence: away.defence_strength,
            rho: fitRun.rho,
            homeAdvantage: fitRun.home_advantage,
          });
        }
      } else {
        // Both lookups are independent (different team ids, no shared
        // data dependency) -- only fetch the ones actually needed
        // (either, both, or neither team may already be in `rated`),
        // but run them concurrently rather than one after the other.
        const missing: { home?: string; away?: string } = {};
        const [homeTeamData, awayTeamData] = await Promise.all([
          !home ? getTeamById(homeTeamId) : Promise.resolve(null),
          !away ? getTeamById(awayTeamId) : Promise.resolve(null),
        ]);
        if (homeTeamData) missing.home = homeTeamData.canonical_name;
        if (awayTeamData) missing.away = awayTeamData.canonical_name;
        setModelUnavailable(missing);
      }

      setPreviewData({ homeMatchesFull, awayMatchesFull, h2hMatches, dixonColes, usedStoredPrediction });
    } catch (err: any) {
      setError(err.message ?? 'Failed to build match preview');
    } finally {
      setLoadingPreview(false);
    }
  }

  // Auto-build the preview once we have a league and both teams pre-filled
  // from the gameweek browser's "Explore" link.
  useEffect(() => {
    if (urlHomeId && urlAwayId && pickerTeams.length > 0 && !previewData && !loadingPreview) {
      buildPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerTeams]);

  const homeTeam = ratedTeams.find((t) => t.team_id === homeTeamId);
  const awayTeam = ratedTeams.find((t) => t.team_id === awayTeamId);
  const homeTeamName = homeTeam?.canonical_name ?? modelUnavailable?.home ?? 'Home team';
  const awayTeamName = awayTeam?.canonical_name ?? modelUnavailable?.away ?? 'Away team';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide">Match Preview</h1>
        <p className="text-ink-500 mt-1">
          Pick a fixture for a full comparison &mdash; form, head-to-head history, and a Dixon-Coles prediction,
          all in one place.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink-700 mb-1">Division</label>
        <select
          value={leagueId ?? ''}
          onChange={(e) => setLeagueId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-xs border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
        >
          <option value="">Select a division&hellip;</option>
          {leagues.map((l) => (
            <option key={l.league_id} value={l.league_id}>
              {l.code} &mdash; {l.name}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{error}</div>
      )}

      {!loadingTeams && <FitFreshnessBanner leagueId={leagueId} fitRun={fitRun} />}

      {loadingTeams && <p className="text-ink-500 font-mono text-sm">Loading teams&hellip;</p>}

      {leagueId && pickerTeams.length > 0 && (
        <>
          <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Home team</label>
              <select
                value={homeTeamId ?? ''}
                onChange={(e) => setHomeTeamId(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
              >
                <option value="">Select&hellip;</option>
                {pickerTeams.map((t) => {
                  const rated = ratedTeams.find((r) => r.team_id === t.team_id);
                  return (
                    <option key={t.team_id} value={t.team_id}>
                      {t.canonical_name}
                      {!rated ? ' (no model rating yet)' : rated.is_estimated ? ' (estimated rating)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Away team</label>
              <select
                value={awayTeamId ?? ''}
                onChange={(e) => setAwayTeamId(e.target.value ? Number(e.target.value) : null)}
                className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
              >
                <option value="">Select&hellip;</option>
                {pickerTeams
                  .filter((t) => t.team_id !== homeTeamId)
                  .map((t) => {
                    const rated = ratedTeams.find((r) => r.team_id === t.team_id);
                    return (
                      <option key={t.team_id} value={t.team_id}>
                        {t.canonical_name}
                        {!rated ? ' (no model rating yet)' : rated.is_estimated ? ' (estimated rating)' : ''}
                      </option>
                    );
                  })}
              </select>
            </div>
          </div>

          <button
            onClick={buildPreview}
            disabled={!homeTeamId || !awayTeamId || loadingPreview}
            className="px-4 py-2 bg-amber-500 text-ink-900 rounded font-medium text-sm hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loadingPreview ? 'Building preview&hellip;' : 'Build match preview'}
          </button>
        </>
      )}

      {previewData && (
        <div className="space-y-4">
          {matchResult && (
            <div className="border-2 border-pitch-700 rounded-lg bg-pitch-950 text-chalk-100 p-4">
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <span className="font-display uppercase text-xs tracking-wide text-amber-400">
                  Full-Time Result &middot; {formatMatchDateWithYear(matchResult.match_date)}
                  {matchResult.league_code ? ` \u00b7 ${matchResult.league_code}` : ''}
                </span>
                {matchResult.referee && (
                  <span className="text-xs text-chalk-300">Referee: {matchResult.referee}</span>
                )}
              </div>
              <div className="flex items-center justify-center gap-4 mb-1">
                <span className="font-medium">{homeTeamName}</span>
                <ScoreChip
                  homeGoals={matchResult.full_time_home_goals}
                  awayGoals={matchResult.full_time_away_goals}
                  size="lg"
                />
                <span className="font-medium">{awayTeamName}</span>
              </div>
              {matchResult.half_time_home_goals != null && matchResult.half_time_away_goals != null && (
                <p className="text-center text-xs text-chalk-300 mb-3">
                  HT {matchResult.half_time_home_goals}&ndash;{matchResult.half_time_away_goals}
                </p>
              )}
              <div className="mt-3 pt-3 border-t border-chalk-100/10">
                <MatchStatsGrid match={matchResult} />
              </div>
            </div>
          )}

          {modelUnavailable && (
            <div className="border border-amber-500 bg-amber-400/15 rounded-lg px-4 py-3 text-sm text-ink-700">
              No Dixon-Coles rating yet for{' '}
              <strong>{[modelUnavailable.home, modelUnavailable.away].filter(Boolean).join(' or ')}</strong> in this
              division &mdash; likely a newly promoted side with no top-flight history to fit a model on.
            </div>
          )}

          <div className="flex flex-wrap gap-1 border-b border-chalk-300">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={[
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  activeTab === tab.id
                    ? 'border-amber-500 text-pitch-800'
                    : 'border-transparent text-ink-500 hover:text-ink-700',
                ].join(' ')}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="border border-chalk-300 rounded-lg bg-white p-4">
                <h2 className="font-display uppercase text-sm tracking-wide text-ink-500 mb-3">
                  Head-to-head (last {previewData.h2hMatches.length})
                </h2>
                {previewData.h2hMatches.length > 0 ? (
                  <HeadToHeadSummary
                    matches={previewData.h2hMatches}
                    teamAId={homeTeamId!}
                    teamAName={homeTeamName}
                    teamBName={awayTeamName}
                    resultMatchId={matchResult?.match_id}
                  />
                ) : (
                  <p className="text-sm text-ink-500">These two haven&rsquo;t met in the archive.</p>
                )}
              </div>

              <ComparisonCard
                homeTeamName={homeTeamName}
                awayTeamName={awayTeamName}
                homeForm={buildFormEntries(
                  splitHomeAway(previewData.homeMatchesFull, homeTeamId!).home.slice(0, 5),
                  homeTeamId!
                )}
                awayForm={buildFormEntries(
                  splitHomeAway(previewData.awayMatchesFull, awayTeamId!).away.slice(0, 5),
                  awayTeamId!
                )}
                homeWinPct={previewData.dixonColes?.homeWinPct}
                drawPct={previewData.dixonColes?.drawPct}
                awayWinPct={previewData.dixonColes?.awayWinPct}
              />
              <p className="text-xs text-ink-500 -mt-2">
                Form shown is each team&rsquo;s record in the role they&rsquo;re playing here &mdash;{' '}
                {homeTeamName}&rsquo;s last 5 home games, {awayTeamName}&rsquo;s last 5 away games.
              </p>
              {/* Which prediction the reader is looking at. A scheduled
                  fixture shows the STORED production number, including any
                  manual rating override; an arbitrary pairing has no
                  fixture and is computed live from ratings alone. Those
                  differ, so saying which avoids the same match appearing
                  to have two answers. */}
              <p className="text-xs text-ink-500 -mt-1">
                {previewData.usedStoredPrediction
                  ? 'These are the production predictions for this fixture \u2014 the same figures used across the site.'
                  : 'No scheduled fixture between these two, so this is modelled live from current team ratings.'}
              </p>
              <div className="border border-chalk-300 rounded-lg bg-white p-4">
                <h2 className="font-display uppercase text-sm tracking-wide text-ink-500 mb-3">Notable streaks</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <StreakBadges
                    teamName={homeTeamName}
                    streaks={computeStreaks(splitHomeAway(previewData.homeMatchesFull, homeTeamId!).home, homeTeamId!)}
                  />
                  <StreakBadges
                    teamName={awayTeamName}
                    streaks={computeStreaks(splitHomeAway(previewData.awayMatchesFull, awayTeamId!).away, awayTeamId!)}
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'home' && (
            <TeamStatsPanel
              team={{ team_id: homeTeamId!, canonical_name: homeTeamName }}
              matches={previewData.homeMatchesFull}
              modelled={
                previewData.dixonColes
                  ? {
                      goalsFor: previewData.dixonColes.expectedHomeGoals,
                      goalsAgainst: previewData.dixonColes.expectedAwayGoals,
                    }
                  : undefined
              }
              dixonColes={previewData.dixonColes}
              fixtureHomeTeamName={homeTeamName}
              fixtureAwayTeamName={awayTeamName}
            />
          )}

          {activeTab === 'away' && (
            <TeamStatsPanel
              team={{ team_id: awayTeamId!, canonical_name: awayTeamName }}
              matches={previewData.awayMatchesFull}
              modelled={
                previewData.dixonColes
                  ? {
                      goalsFor: previewData.dixonColes.expectedAwayGoals,
                      goalsAgainst: previewData.dixonColes.expectedHomeGoals,
                    }
                  : undefined
              }
              dixonColes={previewData.dixonColes}
              fixtureHomeTeamName={homeTeamName}
              fixtureAwayTeamName={awayTeamName}
            />
          )}

          {activeTab === 'prediction' && (
            <div className="border border-chalk-300 rounded-lg bg-white p-4">
              {previewData.dixonColes ? (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-display uppercase text-sm tracking-wide text-ink-500">
                      Dixon-Coles expected goals
                    </h2>
                    <span className="font-mono text-lg font-bold text-pitch-800">
                      {previewData.dixonColes.expectedHomeGoals.toFixed(2)} &ndash;{' '}
                      {previewData.dixonColes.expectedAwayGoals.toFixed(2)}
                    </span>
                  </div>
                  <ScoreProbabilityGrid
                    result={previewData.dixonColes}
                    homeTeamName={homeTeamName}
                    awayTeamName={awayTeamName}
                  />
                </>
              ) : (
                <p className="text-sm text-ink-500">Dixon-Coles prediction unavailable for this fixture.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
