import { useEffect, useState } from 'react';
import {
  getTeams,
  getHeadToHead,
  getMatchesForTeam,
  getTeamCategories,
  getMostRecentFixtureSeason,
  getHeadToHeadVsCategory,
  getLatestFitRun,
  getTeamRatingsForFitRun,
  getLeagues,
  summarizeForm,
  type MatchWithNames,
} from '../lib/api';
import { calculateDixonColesVsCategory } from '../lib/dixonColes';
import { ScoreChip, FormBadge } from '../components/ScoreChip';
import { HeadToHeadSummary } from '../components/HeadToHeadSummary';
import { formatMatchDate } from '../lib/formatDate';

type TeamOption = { team_id: number; canonical_name: string };
type CategoryOption = { category_id: number; slug: string; name: string };

export default function MatchExplorer() {
  const [teamAQuery, setTeamAQuery] = useState('');
  const [teamBQuery, setTeamBQuery] = useState('');
  const [teamAOptions, setTeamAOptions] = useState<TeamOption[]>([]);
  const [teamBOptions, setTeamBOptions] = useState<TeamOption[]>([]);
  const [teamA, setTeamA] = useState<TeamOption | null>(null);
  const [teamB, setTeamB] = useState<TeamOption | null>(null);

  const [matches, setMatches] = useState<MatchWithNames[] | null>(null);
  const [mode, setMode] = useState<'idle' | 'team' | 'h2h' | 'category'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Category comparison mode state
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [categoryResult, setCategoryResult] = useState<{
    perOpponent: Array<{ opponentName: string; matches: MatchWithNames[] }>;
    pooled: MatchWithNames[];
    averagedPrediction: ReturnType<typeof calculateDixonColesVsCategory>['averaged'] | null;
    predictionUnavailable: string[];
  } | null>(null);
  const [loadingCategory, setLoadingCategory] = useState(false);

  useEffect(() => {
    getTeamCategories().then((data) => setCategories(data ?? []));
  }, []);

  // Debounced team search for each search box
  useEffect(() => {
    if (teamAQuery.trim() === '') {
      setTeamAOptions([]);
      return;
    }
    const handle = setTimeout(() => {
      getTeams(teamAQuery).then((data) => setTeamAOptions(data ?? []));
    }, 250);
    return () => clearTimeout(handle);
  }, [teamAQuery]);

  useEffect(() => {
    if (teamBQuery.trim() === '') {
      setTeamBOptions([]);
      return;
    }
    const handle = setTimeout(() => {
      getTeams(teamBQuery).then((data) => setTeamBOptions(data ?? []));
    }, 250);
    return () => clearTimeout(handle);
  }, [teamBQuery]);

  async function showTeamHistory(team: TeamOption) {
    setError(null);
    setMode('team');
    try {
      const data = await getMatchesForTeam(team.team_id, 20);
      setMatches(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load matches');
    }
  }

  async function showHeadToHead() {
    if (!teamA || !teamB) return;
    setError(null);
    setMode('h2h');
    try {
      const data = await getHeadToHead(teamA.team_id, teamB.team_id, 20);
      setMatches(data);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load head-to-head record');
    }
  }

  async function showCategoryComparison() {
    if (!teamA || !selectedCategoryId) return;
    setError(null);
    setMode('category');
    setLoadingCategory(true);
    setCategoryResult(null);
    try {
      // Categories are currently Premier-League-specific (Big Six, Newly
      // Promoted are both PL concepts) -- use the PL's most recent fixture
      // season and fit. If non-PL categories are added later, this will
      // need to look up the right league per category rather than
      // assuming E0.
      const leagues = await getLeagues();
      const e0 = leagues?.find((l) => l.code === 'E0');
      if (!e0) throw new Error('Premier League not found');

      const season = await getMostRecentFixtureSeason(e0.league_id);
      if (!season) throw new Error('No season data available for category comparisons yet.');

      const { perOpponent, pooled, opponents } = await getHeadToHeadVsCategory(
        teamA.team_id,
        selectedCategoryId,
        season.season_id,
        10
      );

      const namedPerOpponent = perOpponent.map((p) => ({
        opponentName: p.opponent.canonical_name,
        matches: p.matches,
      }));

      // Try to build the averaged Dixon-Coles prediction -- only possible
      // if teamA and every opponent has a fitted (or estimated) rating.
      let averagedPrediction: ReturnType<typeof calculateDixonColesVsCategory>['averaged'] | null = null;
      const predictionUnavailable: string[] = [];

      const fitRun = await getLatestFitRun(e0.league_id);
      if (fitRun) {
        const ratings = await getTeamRatingsForFitRun(fitRun.fit_run_id);
        const teamARating = ratings.find((r) => r.team_id === teamA.team_id);
        const opponentRatings = opponents
          .map((opp) => {
            const r = ratings.find((rr) => rr.team_id === opp.team_id);
            if (!r) predictionUnavailable.push(opp.canonical_name);
            return r;
          })
          .filter((r): r is NonNullable<typeof r> => r !== undefined);

        if (teamARating && opponentRatings.length > 0) {
          const result = calculateDixonColesVsCategory(
            { attackStrength: teamARating.attack_strength, defenceStrength: teamARating.defence_strength },
            opponentRatings.map((r) => ({ attackStrength: r.attack_strength, defenceStrength: r.defence_strength })),
            { rho: fitRun.rho, homeAdvantage: fitRun.home_advantage },
            true // teamA plays at home in every simulated fixture -- see calculateDixonColesVsCategory's docs
          );
          averagedPrediction = result.averaged;
        }
      }

      setCategoryResult({ perOpponent: namedPerOpponent, pooled, averagedPrediction, predictionUnavailable });
    } catch (err: any) {
      setError(err.message ?? 'Failed to load category comparison');
    } finally {
      setLoadingCategory(false);
    }
  }

  const formSummary =
    mode === 'team' && matches && teamA
      ? summarizeForm(matches.slice(0, 6), teamA.team_id)
      : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wide">Match Explorer</h1>
        <p className="text-ink-500 mt-1">Search a team for their results and form, or compare two head-to-head.</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <TeamSearchBox
          label="Team"
          query={teamAQuery}
          setQuery={setTeamAQuery}
          options={teamAOptions}
          selected={teamA}
          onSelect={(t) => {
            setTeamA(t);
            setTeamAQuery(t.canonical_name);
            setTeamAOptions([]);
            showTeamHistory(t);
          }}
        />
        <TeamSearchBox
          label="Compare against (optional, for head-to-head)"
          query={teamBQuery}
          setQuery={setTeamBQuery}
          options={teamBOptions}
          selected={teamB}
          onSelect={(t) => {
            setTeamB(t);
            setTeamBQuery(t.canonical_name);
            setTeamBOptions([]);
          }}
        />
      </div>

      {teamA && teamB && (
        <button
          onClick={showHeadToHead}
          className="px-4 py-2 bg-amber-500 text-ink-900 rounded font-medium text-sm hover:bg-amber-600 transition-colors"
        >
          Show {teamA.canonical_name} vs {teamB.canonical_name} head-to-head
        </button>
      )}

      {teamA && categories.length > 0 && (
        <div className="border border-chalk-300 rounded-lg bg-white p-4 max-w-md">
          <label className="block text-sm font-medium text-ink-700 mb-1">
            Or compare {teamA.canonical_name} against a group of teams
          </label>
          <div className="flex gap-2">
            <select
              value={selectedCategoryId ?? ''}
              onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : null)}
              className="flex-1 border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
            >
              <option value="">Select a category&hellip;</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              onClick={showCategoryComparison}
              disabled={!selectedCategoryId || loadingCategory}
              className="px-4 py-2 bg-pitch-800 text-chalk-100 rounded font-medium text-sm hover:bg-pitch-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              Compare
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {formSummary && (
        <div className="border border-chalk-300 rounded-lg bg-white p-4">
          <h2 className="font-display uppercase text-sm tracking-wide text-ink-500 mb-2">
            Last {formSummary.played} &mdash; {teamA?.canonical_name}
          </h2>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-1">
              {formSummary.form.map((r, i) => (
                <FormBadge key={i} result={r} />
              ))}
            </div>
            <span className="text-sm text-ink-500 font-mono">
              {formSummary.wins}W {formSummary.draws}D {formSummary.losses}L &middot; GD{' '}
              {formSummary.goalDifference >= 0 ? '+' : ''}
              {formSummary.goalDifference}
            </span>
          </div>
        </div>
      )}

      {matches && matches.length > 0 && mode === 'h2h' && teamA && teamB && (
        <div className="border border-chalk-300 rounded-lg bg-white p-4">
          <h2 className="font-display uppercase text-sm tracking-wide text-ink-500 mb-3">
            {teamA.canonical_name} vs {teamB.canonical_name} &mdash; head-to-head summary
          </h2>
          <HeadToHeadSummary
            matches={matches}
            teamAId={teamA.team_id}
            teamAName={teamA.canonical_name}
            teamBName={teamB.canonical_name}
          />
        </div>
      )}

      {loadingCategory && <p className="text-ink-500 font-mono text-sm">Loading category comparison&hellip;</p>}

      {mode === 'category' && categoryResult && teamA && (
        <div className="space-y-4">
          {categoryResult.averagedPrediction && (
            <div className="border border-chalk-300 rounded-lg bg-white p-4">
              <h2 className="font-display uppercase text-sm tracking-wide text-ink-500 mb-1">
                Averaged Dixon-Coles estimate &mdash; {teamA.canonical_name} (home) vs each opponent
              </h2>
              <p className="text-xs text-ink-500 mb-3">
                Average of {categoryResult.perOpponent.length} individual fixture predictions, one per opponent,
                all with {teamA.canonical_name} at home.
                {categoryResult.predictionUnavailable.length > 0 && (
                  <>
                    {' '}
                    Excludes {categoryResult.predictionUnavailable.join(', ')} (no model rating available).
                  </>
                )}
              </p>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-chalk-100 rounded-lg p-3">
                  <div className="text-xl font-bold font-mono text-pitch-800">
                    {categoryResult.averagedPrediction.homeWinPct.toFixed(0)}%
                  </div>
                  <div className="text-xs text-ink-500 mt-1">{teamA.canonical_name} win</div>
                </div>
                <div className="bg-chalk-100 rounded-lg p-3">
                  <div className="text-xl font-bold font-mono text-pitch-800">
                    {categoryResult.averagedPrediction.drawPct.toFixed(0)}%
                  </div>
                  <div className="text-xs text-ink-500 mt-1">Draw</div>
                </div>
                <div className="bg-chalk-100 rounded-lg p-3">
                  <div className="text-xl font-bold font-mono text-pitch-800">
                    {categoryResult.averagedPrediction.awayWinPct.toFixed(0)}%
                  </div>
                  <div className="text-xs text-ink-500 mt-1">Opponent win</div>
                </div>
              </div>
            </div>
          )}

          {categoryResult.pooled.length > 0 && (
            <div className="border border-chalk-300 rounded-lg bg-white p-4">
              <h2 className="font-display uppercase text-sm tracking-wide text-ink-500 mb-3">
                Pooled head-to-head record (last 10 vs each opponent, combined)
              </h2>
              <HeadToHeadSummary
                matches={categoryResult.pooled}
                teamAId={teamA.team_id}
                teamAName={teamA.canonical_name}
                teamBName="category opponents"
              />
            </div>
          )}

          <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white">
            <div className="px-4 py-2 bg-pitch-900 text-chalk-100 font-display uppercase text-sm tracking-wide">
              Breakdown by opponent
            </div>
            <ul className="divide-y divide-chalk-300">
              {categoryResult.perOpponent.map((p) => {
                const summary = summarizeForm(p.matches, teamA.team_id);
                return (
                  <li key={p.opponentName} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="font-medium">{p.opponentName}</span>
                    <span className="text-xs font-mono text-ink-500">
                      {summary.wins}W {summary.draws}D {summary.losses}L ({p.matches.length} meetings)
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {matches && matches.length > 0 && mode !== 'category' && (
        <div className="border border-chalk-300 rounded-lg overflow-hidden bg-white">
          <div className="px-4 py-2 bg-pitch-900 text-chalk-100 font-display uppercase text-sm tracking-wide">
            {mode === 'h2h' && teamA && teamB
              ? `Head-to-head: ${teamA.canonical_name} vs ${teamB.canonical_name}`
              : `Recent results${teamA ? `: ${teamA.canonical_name}` : ''}`}
          </div>
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

      {matches && matches.length === 0 && mode === 'h2h' && (
        <p className="text-ink-500">These two teams haven&rsquo;t met in the archive.</p>
      )}
    </div>
  );
}

function TeamSearchBox({
  label,
  query,
  setQuery,
  options,
  selected,
  onSelect,
}: {
  label: string;
  query: string;
  setQuery: (v: string) => void;
  options: TeamOption[];
  selected: TeamOption | null;
  onSelect: (t: TeamOption) => void;
}) {
  return (
    <div className="relative">
      <label className="block text-sm font-medium text-ink-700 mb-1">{label}</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Start typing a team name&hellip;"
        className="w-full border border-chalk-300 rounded px-3 py-2 bg-white focus:border-pitch-700"
      />
      {options.length > 0 && (
        <ul className="absolute z-10 w-full bg-white border border-chalk-300 rounded mt-1 shadow-lg max-h-56 overflow-auto">
          {options.map((t) => (
            <li key={t.team_id}>
              <button
                onClick={() => onSelect(t)}
                className="w-full text-left px-3 py-2 hover:bg-chalk-100 transition-colors"
              >
                {t.canonical_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && options.length === 0 && (
        <p className="text-xs text-pitch-700 mt-1 font-medium">Selected: {selected.canonical_name}</p>
      )}
    </div>
  );
}
