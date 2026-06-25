import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getLeagues,
  getLatestFitRun,
  getTeamRatingsForFitRun,
  getMatchesForTeam,
  getHeadToHead,
  getTeamById,
  getTeamsInLeagueFixtures,
  getMostRecentFixtureSeason,
  splitHomeAway,
  buildFormEntries,
  computeStreaks,
  type TeamWithRating,
  type MatchWithNames,
} from '../lib/api';
import { calculateDixonColes, type DixonColesResult } from '../lib/dixonColes';
import type { ModelFitRun } from '../types/database';
import { ComparisonCard, StreakBadges } from '../components/ComparisonCard';
import { HeadToHeadSummary } from '../components/HeadToHeadSummary';
import { ScoreProbabilityGrid } from '../components/ScoreProbabilityGrid';
import { TeamStatsPanel } from '../components/TeamStatsPanel';

type LeagueOption = { league_id: number; code: string; name: string };
type Tab = 'overview' | 'home' | 'away' | 'prediction';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'home', label: 'Home Team' },
  { id: 'away', label: 'Away Team' },
  { id: 'prediction', label: 'Prediction' },
];

export default function MatchPreview() {
  const [searchParams] = useSearchParams();
  const urlLeagueId = searchParams.get('league') ? Number(searchParams.get('league')) : null;
  const urlHomeId = searchParams.get('home') ? Number(searchParams.get('home')) : null;
  const urlAwayId = searchParams.get('away') ? Number(searchParams.get('away')) : null;

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
  } | null>(null);

  const [error, setError] = useState<string | null>(null);

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
        const fit = await getLatestFitRun(leagueId);
        let rated: TeamWithRating[] = [];
        if (fit) {
          setFitRun(fit);
          rated = await getTeamRatingsForFitRun(fit.fit_run_id);
          setRatedTeams(rated);
        } else {
          setError('No model has been fitted for this league yet.');
        }

        const currentSeason = await getMostRecentFixtureSeason(leagueId);
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
    setActiveTab('overview');
    try {
      const [homeMatchesFull, awayMatchesFull, h2hMatches] = await Promise.all([
        getMatchesForTeam(homeTeamId, 60),
        getMatchesForTeam(awayTeamId, 60),
        getHeadToHead(homeTeamId, awayTeamId, 10),
      ]);

      let dixonColes: DixonColesResult | null = null;
      if (home && away && fitRun) {
        dixonColes = calculateDixonColes({
          homeAttack: home.attack_strength,
          homeDefence: home.defence_strength,
          awayAttack: away.attack_strength,
          awayDefence: away.defence_strength,
          rho: fitRun.rho,
          homeAdvantage: fitRun.home_advantage,
        });
      } else {
        const missing: { home?: string; away?: string } = {};
        if (!home) {
          const t = await getTeamById(homeTeamId);
          missing.home = t.canonical_name;
        }
        if (!away) {
          const t = await getTeamById(awayTeamId);
          missing.away = t.canonical_name;
        }
        setModelUnavailable(missing);
      }

      setPreviewData({ homeMatchesFull, awayMatchesFull, h2hMatches, dixonColes });
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
