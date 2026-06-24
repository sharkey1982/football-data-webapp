import { useEffect, useState } from 'react';
import { getTeams, getMatchesForTeam, getHeadToHead, summarizeForm } from '../lib/api';

type TeamOption = { team_id: number; canonical_name: string };

export function SimplePredictor() {
  const [homeQuery, setHomeQuery] = useState('');
  const [awayQuery, setAwayQuery] = useState('');
  const [homeOptions, setHomeOptions] = useState<TeamOption[]>([]);
  const [awayOptions, setAwayOptions] = useState<TeamOption[]>([]);
  const [homeTeam, setHomeTeam] = useState<TeamOption | null>(null);
  const [awayTeam, setAwayTeam] = useState<TeamOption | null>(null);

  const [result, setResult] = useState<null | {
    winPct: number;
    drawPct: number;
    lossPct: number;
    expectedHomeGoals: number;
    expectedAwayGoals: number;
    sampleSize: number;
  }>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (homeQuery.trim() === '') return setHomeOptions([]);
    const h = setTimeout(() => getTeams(homeQuery).then((d) => setHomeOptions(d ?? [])), 250);
    return () => clearTimeout(h);
  }, [homeQuery]);

  useEffect(() => {
    if (awayQuery.trim() === '') return setAwayOptions([]);
    const h = setTimeout(() => getTeams(awayQuery).then((d) => setAwayOptions(d ?? [])), 250);
    return () => clearTimeout(h);
  }, [awayQuery]);

  async function runEstimate() {
    if (!homeTeam || !awayTeam) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      // Blend two simple signals: each team's recent overall scoring rate,
      // and head-to-head history between these two specifically. This is a
      // transparent statistical baseline, not a trained model -- see the
      // explanation panel below for exactly what it does and doesn't account for.
      const [homeRecent, awayRecent, h2h] = await Promise.all([
        getMatchesForTeam(homeTeam.team_id, 20),
        getMatchesForTeam(awayTeam.team_id, 20),
        getHeadToHead(homeTeam.team_id, awayTeam.team_id, 20),
      ]);

      const homeForm = summarizeForm(homeRecent, homeTeam.team_id);
      const awayForm = summarizeForm(awayRecent, awayTeam.team_id);

      const homeAvgScored = homeForm.played > 0 ? homeForm.goalsFor / homeForm.played : 1.3;
      const homeAvgConceded = homeForm.played > 0 ? homeForm.goalsAgainst / homeForm.played : 1.1;
      const awayAvgScored = awayForm.played > 0 ? awayForm.goalsFor / awayForm.played : 1.1;
      const awayAvgConceded = awayForm.played > 0 ? awayForm.goalsAgainst / awayForm.played : 1.3;

      // Expected goals: simple average of "how much this team tends to
      // score" and "how much the opponent tends to concede", with a small
      // fixed home-advantage bump -- a known, real effect in football
      // (roughly +0.2-0.3 expected goals historically), not a per-team fit.
      const HOME_ADVANTAGE = 0.25;
      const expectedHomeGoals = (homeAvgScored + awayAvgConceded) / 2 + HOME_ADVANTAGE;
      const expectedAwayGoals = (awayAvgScored + homeAvgConceded) / 2;

      // Win/draw/loss from a simple Poisson-style comparison of expected
      // goals, lightly nudged by head-to-head history if there's enough of it.
      const goalDiff = expectedHomeGoals - expectedAwayGoals;
      let winPct = 33 + goalDiff * 12;
      let lossPct = 33 - goalDiff * 12;
      let drawPct = 100 - winPct - lossPct;

      if (h2h.length >= 3) {
        const h2hForm = summarizeForm(h2h, homeTeam.team_id);
        const h2hWinPct = (h2hForm.wins / h2hForm.played) * 100;
        const h2hLossPct = (h2hForm.losses / h2hForm.played) * 100;
        // Blend: 75% model, 25% head-to-head history.
        winPct = winPct * 0.75 + h2hWinPct * 0.25;
        lossPct = lossPct * 0.75 + h2hLossPct * 0.25;
        drawPct = 100 - winPct - lossPct;
      }

      // Clamp to sane bounds and renormalise to 100.
      winPct = Math.max(5, Math.min(85, winPct));
      lossPct = Math.max(5, Math.min(85, lossPct));
      drawPct = Math.max(5, 100 - winPct - lossPct);
      const total = winPct + drawPct + lossPct;

      setResult({
        winPct: (winPct / total) * 100,
        drawPct: (drawPct / total) * 100,
        lossPct: (lossPct / total) * 100,
        expectedHomeGoals,
        expectedAwayGoals,
        sampleSize: h2h.length,
      });
    } catch (err: any) {
      setError(err.message ?? 'Failed to compute estimate');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="border border-amber-500 bg-amber-400/15 rounded-lg px-4 py-3 text-sm text-ink-700">
        <strong className="font-semibold">This is a simple statistical baseline, not a trained model.</strong>{' '}
        It blends each team&rsquo;s recent scoring/conceding rate with their head-to-head history and a fixed
        home-advantage adjustment. It does not account for injuries, form trends, manager changes, or anything
        outside this dataset. Treat it as a starting point, not a forecast.
      </div>

      <div className="grid sm:grid-cols-2 gap-4 max-w-2xl">
        <TeamPicker
          label="Home team"
          query={homeQuery}
          setQuery={setHomeQuery}
          options={homeOptions}
          onSelect={(t) => {
            setHomeTeam(t);
            setHomeQuery(t.canonical_name);
            setHomeOptions([]);
          }}
        />
        <TeamPicker
          label="Away team"
          query={awayQuery}
          setQuery={setAwayQuery}
          options={awayOptions}
          onSelect={(t) => {
            setAwayTeam(t);
            setAwayQuery(t.canonical_name);
            setAwayOptions([]);
          }}
        />
      </div>

      <button
        onClick={runEstimate}
        disabled={!homeTeam || !awayTeam || loading}
        className="px-4 py-2 bg-amber-500 text-ink-900 rounded font-medium text-sm hover:bg-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? 'Calculating&hellip;' : 'Generate estimate'}
      </button>

      {error && (
        <div className="border border-loss-600 bg-loss-600/10 text-loss-700 px-4 py-3 rounded">{error}</div>
      )}

      {result && homeTeam && awayTeam && (
        <div className="border border-chalk-300 rounded-lg bg-white p-6 space-y-6">
          <h2 className="font-display uppercase text-lg tracking-wide text-center">
            {homeTeam.canonical_name} <span className="text-ink-500">vs</span> {awayTeam.canonical_name}
          </h2>

          <div className="grid grid-cols-3 gap-3 text-center">
            <PctPanel label={`${homeTeam.canonical_name} win`} pct={result.winPct} />
            <PctPanel label="Draw" pct={result.drawPct} />
            <PctPanel label={`${awayTeam.canonical_name} win`} pct={result.lossPct} />
          </div>

          <div className="border-t border-chalk-300 pt-4 flex items-center justify-center gap-6 font-mono">
            <div className="text-center">
              <div className="text-xs text-ink-500 uppercase tracking-wide">Expected goals</div>
              <div className="text-2xl font-bold text-pitch-800">
                {result.expectedHomeGoals.toFixed(2)} &ndash; {result.expectedAwayGoals.toFixed(2)}
              </div>
            </div>
          </div>

          {result.sampleSize >= 3 && (
            <p className="text-xs text-ink-500 text-center">
              Includes head-to-head history from {result.sampleSize} previous meetings in the archive.
            </p>
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

function TeamPicker({
  label,
  query,
  setQuery,
  options,
  onSelect,
}: {
  label: string;
  query: string;
  setQuery: (v: string) => void;
  options: TeamOption[];
  onSelect: (t: TeamOption) => void;
}) {
  return (
    <div className="relative">
      <label className="block text-sm font-medium text-ink-700 mb-1">{label}</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search for a team&hellip;"
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
    </div>
  );
}
