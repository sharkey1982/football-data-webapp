import { useEffect, useState } from 'react';
import {
  getLeagues,
  getLatestFitRun,
  getTeamRatingsForFitRun,
  type TeamWithRating,
} from '../lib/api';
import { calculateDixonColes, type DixonColesResult } from '../lib/dixonColes';
import { formatMatchDateWithYear } from '../lib/formatDate';
import type { ModelFitRun } from '../types/database';
import { ScoreProbabilityGrid } from '../components/ScoreProbabilityGrid';

type LeagueOption = { league_id: number; code: string; name: string };

export function DixonColesPredictor() {
  const [leagues, setLeagues] = useState<LeagueOption[]>([]);
  const [leagueId, setLeagueId] = useState<number | null>(null);

  const [fitRun, setFitRun] = useState<ModelFitRun | null>(null);
  const [ratedTeams, setRatedTeams] = useState<TeamWithRating[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);

  const [homeTeamId, setHomeTeamId] = useState<number | null>(null);
  const [awayTeamId, setAwayTeamId] = useState<number | null>(null);

  const [result, setResult] = useState<DixonColesResult | null>(null);
  const [showGrid, setShowGrid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getLeagues().then((data) => setLeagues(data ?? []));
  }, []);

  // Whenever the league changes, fetch its latest fit and the teams rated
  // in THAT SPECIFIC fit -- this is what guarantees a team's rating always
  // comes from the right league's fit, never a different one.
  useEffect(() => {
    setFitRun(null);
    setRatedTeams([]);
    setHomeTeamId(null);
    setAwayTeamId(null);
    setResult(null);
    setError(null);

    if (!leagueId) return;

    setLoadingTeams(true);
    getLatestFitRun(leagueId)
      .then(async (fit) => {
        if (!fit) {
          setError('No model has been fitted for this league yet.');
          return;
        }
        setFitRun(fit);
        const teams = await getTeamRatingsForFitRun(fit.fit_run_id);
        setRatedTeams(teams);
      })
      .catch((err) => setError(err.message ?? 'Failed to load model data'))
      .finally(() => setLoadingTeams(false));
  }, [leagueId]);

  function runPrediction() {
    if (!fitRun || !homeTeamId || !awayTeamId) return;
    const home = ratedTeams.find((t) => t.team_id === homeTeamId);
    const away = ratedTeams.find((t) => t.team_id === awayTeamId);
    if (!home || !away) return;

    const calc = calculateDixonColes({
      homeAttack: home.attack_strength,
      homeDefence: home.defence_strength,
      awayAttack: away.attack_strength,
      awayDefence: away.defence_strength,
      rho: fitRun.rho,
      homeAdvantage: fitRun.home_advantage,
    });
    setResult(calc);
    setShowGrid(false);
  }

  const homeTeam = ratedTeams.find((t) => t.team_id === homeTeamId);
  const awayTeam = ratedTeams.find((t) => t.team_id === awayTeamId);

  return (
    <div className="space-y-6">
      <div className="border border-amber-500 bg-amber-400/15 rounded-lg px-4 py-3 text-sm text-ink-700">
        <strong className="font-semibold">Dixon-Coles statistical model.</strong> Fitted from each
        team&rsquo;s actual goals scored/conceded over their last 2 seasons in this specific division,
        with more recent matches weighted more heavily. Ratings are specific to one league &mdash; a
        team&rsquo;s rating here reflects their performance only within this division, not any other.
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

      {leagueId && fitRun && ratedTeams.length > 0 && (
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
                {ratedTeams.map((t) => (
                  <option key={t.team_id} value={t.team_id}>
                    {t.canonical_name}
                    {t.is_estimated ? ' (estimated)' : ''}
                  </option>
                ))}
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
                {ratedTeams
                  .filter((t) => t.team_id !== homeTeamId)
                  .map((t) => (
                    <option key={t.team_id} value={t.team_id}>
                      {t.canonical_name}
                      {t.is_estimated ? ' (estimated)' : ''}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <button
            onClick={runPrediction}
            disabled={!homeTeamId || !awayTeamId}
            className="px-4 py-2 bg-amber-500 text-ink-900 rounded font-medium text-sm hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate prediction
          </button>
        </>
      )}

      {result && homeTeam && awayTeam && (
        <div className="border border-chalk-300 rounded-lg bg-white p-6 space-y-6">
          {(homeTeam.is_estimated || awayTeam.is_estimated) && (
            <div className="border border-amber-500 bg-amber-400/15 rounded-lg px-4 py-3 text-sm text-ink-700">
              {[homeTeam, awayTeam]
                .filter((t) => t.is_estimated)
                .map((t) => (
                  <p key={t.team_id}>
                    <strong>{t.canonical_name}&rsquo;s rating is estimated</strong>, not genuinely fitted &mdash;{' '}
                    {t.estimation_note}
                  </p>
                ))}
            </div>
          )}

          <h2 className="font-display uppercase text-lg tracking-wide text-center">
            {homeTeam.canonical_name} <span className="text-ink-500">vs</span> {awayTeam.canonical_name}
          </h2>

          <div className="grid grid-cols-3 gap-3 text-center">
            <PctPanel label={`${homeTeam.canonical_name} win`} pct={result.homeWinPct} />
            <PctPanel label="Draw" pct={result.drawPct} />
            <PctPanel label={`${awayTeam.canonical_name} win`} pct={result.awayWinPct} />
          </div>

          <div className="border-t border-chalk-300 pt-4 flex items-center justify-center gap-6 font-mono">
            <div className="text-center">
              <div className="text-xs text-ink-500 uppercase tracking-wide">Expected goals</div>
              <div className="text-2xl font-bold text-pitch-800">
                {result.expectedHomeGoals.toFixed(2)} &ndash; {result.expectedAwayGoals.toFixed(2)}
              </div>
            </div>
          </div>

          <div className="text-center">
            <button
              onClick={() => setShowGrid((v) => !v)}
              className="text-sm text-pitch-700 underline hover:text-pitch-800"
            >
              {showGrid ? 'Hide' : 'Show'} the full calculation
            </button>
          </div>

          {showGrid && (
            <div className="space-y-4 border-t border-chalk-300 pt-4">
              <CalculationBreakdown
                fitRun={fitRun!}
                homeTeam={homeTeam}
                awayTeam={awayTeam}
                result={result}
              />
              <ScoreProbabilityGrid
                result={result}
                homeTeamName={homeTeam.canonical_name}
                awayTeamName={awayTeam.canonical_name}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PctPanel({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="bg-chalk-100 rounded-lg p-4">
      <div className="text-2xl font-bold font-mono text-pitch-800">{pct.toFixed(0)}%</div>
      <div className="text-xs text-ink-500 mt-1">{label}</div>
    </div>
  );
}

function CalculationBreakdown({
  fitRun,
  homeTeam,
  awayTeam,
  result,
}: {
  fitRun: ModelFitRun;
  homeTeam: TeamWithRating;
  awayTeam: TeamWithRating;
  result: DixonColesResult;
}) {
  return (
    <div className="bg-chalk-100 rounded-lg p-4 text-sm space-y-3 font-mono">
      <div className="text-xs uppercase tracking-wide text-ink-500 font-sans font-medium mb-2">
        How this was calculated
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <div className="text-ink-500 text-xs">{homeTeam.canonical_name} attack</div>
          <div>{homeTeam.attack_strength.toFixed(3)}</div>
        </div>
        <div>
          <div className="text-ink-500 text-xs">{awayTeam.canonical_name} defence</div>
          <div>{awayTeam.defence_strength.toFixed(3)}</div>
        </div>
        <div>
          <div className="text-ink-500 text-xs">{awayTeam.canonical_name} attack</div>
          <div>{awayTeam.attack_strength.toFixed(3)}</div>
        </div>
        <div>
          <div className="text-ink-500 text-xs">{homeTeam.canonical_name} defence</div>
          <div>{homeTeam.defence_strength.toFixed(3)}</div>
        </div>
        <div>
          <div className="text-ink-500 text-xs">Home advantage (league-wide)</div>
          <div>{fitRun.home_advantage.toFixed(3)}</div>
        </div>
        <div>
          <div className="text-ink-500 text-xs">Rho (low-score correction)</div>
          <div>{fitRun.rho.toFixed(3)}</div>
        </div>
      </div>
      <div className="border-t border-chalk-300 pt-3 space-y-1">
        <div className="text-ink-700">
          {homeTeam.canonical_name} expected goals = exp(home_adv + attack &minus; opponent&rsquo;s defence)
        </div>
        <div className="text-ink-700">
          = exp({fitRun.home_advantage.toFixed(3)} + {homeTeam.attack_strength.toFixed(3)} &minus;{' '}
          {awayTeam.defence_strength.toFixed(3)}) = <strong>{result.expectedHomeGoals.toFixed(3)}</strong>
        </div>
        <div className="text-ink-700 mt-2">
          {awayTeam.canonical_name} expected goals = exp(attack &minus; opponent&rsquo;s defence)
        </div>
        <div className="text-ink-700">
          = exp({awayTeam.attack_strength.toFixed(3)} &minus; {homeTeam.defence_strength.toFixed(3)}) ={' '}
          <strong>{result.expectedAwayGoals.toFixed(3)}</strong>
        </div>
      </div>
      <p className="text-xs text-ink-500 font-sans pt-2">
        These expected-goals values feed a Poisson distribution for each team, with a small adjustment
        (rho) for the tendency of low-scoring matches to differ from a pure Poisson pattern. The full
        breakdown by scoreline is in the grid below.
      </p>
      <p className="text-xs text-ink-500 font-sans">
        Fitted from {fitRun.matches_used} matches, window ending {formatMatchDateWithYear(fitRun.window_end_date)}.
      </p>
    </div>
  );
}
