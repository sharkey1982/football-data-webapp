import { useEffect, useMemo, useState } from 'react';
import {
  computeFdrQuintiles,
  getFantasyFixtureDifficulty,
  getLeagues,
  getMostRecentFixtureSeason,
  type FantasyFixtureData,
} from '../lib/api';
import FantasyFixtureHeatmap, {
  type FantasyColourBasis,
  type FantasyFocus,
  type FantasyHeatmapCell,
  type FantasyHeatmapRow,
  type FantasyMetric,
} from '../components/FantasyFixtureHeatmap';

type FantasyDefenceMetric = 'goals' | 'cleansheet';

const DEFAULT_RANK_WINDOW = 10;

export default function FantasyFixtures() {
  const [seasonLabel, setSeasonLabel] = useState<string | null>(null);
  const [data, setData] = useState<FantasyFixtureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [focus, setFocus] = useState<FantasyFocus>('attack');
  const [colourBasis, setColourBasis] = useState<FantasyColourBasis>('model');
  const [defenceMetric, setDefenceMetric] = useState<FantasyDefenceMetric>('goals');
  const [rankWindowInput, setRankWindowInput] = useState(String(DEFAULT_RANK_WINDOW));

  // Clean sheet probability only exists as a Dixon-Coles model output --
  // there's no FDR-quintile equivalent -- so switching to it forces the
  // colour scale back to the model rather than leaving it on a stale FDR
  // selection that the clean sheet numbers can't actually honour.
  useEffect(() => {
    if (focus === 'defence' && defenceMetric === 'cleansheet' && colourBasis === 'fdr') {
      setColourBasis('model');
    }
  }, [focus, defenceMetric, colourBasis]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const leagues = await getLeagues();
        const e0 = leagues?.find((l) => l.code === 'E0');
        if (!e0) throw new Error('E0 (Premier League) not found');
        const season = await getMostRecentFixtureSeason(e0.league_id);
        if (!season) throw new Error('No fixtures found for the current Premier League season');
        if (cancelled) return;
        setSeasonLabel(season.label);
        const fixtureData = await getFantasyFixtureDifficulty(e0.league_id, season.season_id);
        if (cancelled) return;
        setData(fixtureData);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load fixture data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const fdrByTeam = useMemo(() => (data ? computeFdrQuintiles(data.ratings) : new Map()), [data]);

  const allMatchweeks = useMemo(() => {
    if (!data) return [];
    const seen = new Set<number>();
    for (const team of data.teams) {
      for (const f of team.fixtures) {
        if (f.matchweek !== null) seen.add(f.matchweek);
      }
    }
    return [...seen].sort((a, b) => a - b);
  }, [data]);

  const rankWindowSize = useMemo(() => {
    const n = parseInt(rankWindowInput, 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, allMatchweeks.length || 1);
  }, [rankWindowInput, allMatchweeks.length]);

  // The number box controls both the ranking average AND which columns are
  // shown -- there's no separate "full season" view, so the two can never
  // drift apart and confuse what's actually driving the colours on screen.
  const displayedMatchweeks = useMemo(
    () => allMatchweeks.slice(0, rankWindowSize),
    [allMatchweeks, rankWindowSize]
  );

  const rows: FantasyHeatmapRow[] = useMemo(() => {
    if (!data) return [];
    const windowSet = new Set(displayedMatchweeks);

    return data.teams
      .map((team) => {
        const cellsByMatchweek = new Map<number, FantasyHeatmapCell>();
        let windowSum = 0;
        let windowCount = 0;

        for (const f of team.fixtures) {
          if (f.matchweek === null || !windowSet.has(f.matchweek)) continue;
          const fdr = fdrByTeam.get(f.opponent_team_id) ?? { attack_fdr: 3, defence_fdr: 3 };

          const value =
            colourBasis === 'fdr'
              ? focus === 'attack'
                ? fdr.defence_fdr
                : fdr.attack_fdr
              : focus === 'attack'
                ? f.expected_goals_for
                : defenceMetric === 'cleansheet'
                  ? f.clean_sheet_probability
                  : f.expected_goals_against;

          cellsByMatchweek.set(f.matchweek, {
            matchweek: f.matchweek,
            opponent_name: f.opponent_name,
            is_home: f.is_home,
            value,
            difficulty: value, // placeholder, rescaled below for model mode
          });

          windowSum += value;
          windowCount += 1;
        }

        return {
          team_id: team.team_id,
          team_name: team.team_name,
          rankValue: windowCount > 0 ? windowSum / windowCount : Number.POSITIVE_INFINITY,
          windowTotal: windowSum,
          cellsByMatchweek,
        };
      })
      .filter((row) => row.cellsByMatchweek.size > 0);
  }, [data, displayedMatchweeks, colourBasis, focus, defenceMetric, fdrByTeam]);

  // Model mode uses raw values (expected goals, or clean sheet probability)
  // which need rescaling to the 1-5 difficulty range based on the actual
  // spread seen across every displayed fixture -- FDR mode is already on a
  // 1-5 scale so it's left as-is.
  const higherValueIsBetter = focus === 'attack' || defenceMetric === 'cleansheet';

  const scaledRows = useMemo(() => {
    if (colourBasis === 'fdr') return rows;
    const allValues = rows.flatMap((r) => [...r.cellsByMatchweek.values()].map((c) => c.value));
    if (allValues.length === 0) return rows;
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const range = max - min || 1;

    return rows.map((row) => {
      const newCells = new Map(row.cellsByMatchweek);
      for (const [mw, cell] of newCells) {
        const t = (cell.value - min) / range; // 0..1
        const orientedT = higherValueIsBetter ? 1 - t : t;
        newCells.set(mw, { ...cell, difficulty: 1 + orientedT * 4 });
      }
      const rankT = (row.rankValue - min) / range;
      const orientedRankT = higherValueIsBetter ? 1 - rankT : rankT;
      return { ...row, cellsByMatchweek: newCells, rankValue: 1 + orientedRankT * 4 };
    });
  }, [rows, colourBasis, higherValueIsBetter]);

  const sortedRows = useMemo(
    () => [...scaledRows].sort((a, b) => a.rankValue - b.rankValue),
    [scaledRows]
  );

  const metric: FantasyMetric =
    colourBasis === 'fdr' ? 'fdr' : focus === 'attack' ? 'xgf' : defenceMetric === 'cleansheet' ? 'cleansheet' : 'xga';

  const legendGoodLabel =
    metric === 'xgf'
      ? 'Most goals expected'
      : metric === 'cleansheet'
        ? 'Highest clean sheet chance'
        : metric === 'xga'
          ? 'Fewest goals conceded'
          : 'Easiest fixtures (FDR)';
  const legendBadLabel =
    metric === 'xgf'
      ? 'Fewest goals expected'
      : metric === 'cleansheet'
        ? 'Lowest clean sheet chance'
        : metric === 'xga'
          ? 'Most goals conceded'
          : 'Hardest fixtures (FDR)';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Fantasy Fixture Difficulty</h1>
        <p className="text-sm text-ink-500 mt-1">
          Premier League{seasonLabel ? ` \u2022 ${seasonLabel}` : ''} &mdash; teams ranked easiest to hardest for the
          fixtures you select below.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 bg-white border border-chalk-300 rounded-lg p-3">
        <div>
          <div className="text-xs font-medium text-ink-500 mb-1">Focus</div>
          <div className="flex rounded-md overflow-hidden border border-chalk-300">
            {(['attack', 'defence'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFocus(f)}
                className={[
                  'px-3 py-1.5 text-sm font-medium transition-colors',
                  focus === f ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100',
                ].join(' ')}
              >
                {f === 'attack' ? 'Attacking picks' : 'Defensive picks'}
              </button>
            ))}
          </div>
        </div>

        {focus === 'defence' && (
          <div>
            <div className="text-xs font-medium text-ink-500 mb-1">Defensive metric</div>
            <div className="flex rounded-md overflow-hidden border border-chalk-300">
              {(['goals', 'cleansheet'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDefenceMetric(m)}
                  className={[
                    'px-3 py-1.5 text-sm font-medium transition-colors',
                    defenceMetric === m ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-100',
                  ].join(' ')}
                >
                  {m === 'goals' ? 'Goals conceded' : 'Clean sheet %'}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="text-xs font-medium text-ink-500 mb-1">Colour scale</div>
          <div className="flex rounded-md overflow-hidden border border-chalk-300">
            {(['model', 'fdr'] as const).map((c) => {
              const fdrDisabled = c === 'fdr' && focus === 'defence' && defenceMetric === 'cleansheet';
              return (
                <button
                  key={c}
                  type="button"
                  disabled={fdrDisabled}
                  onClick={() => setColourBasis(c)}
                  title={fdrDisabled ? 'Clean sheet % is only available on the Dixon-Coles model' : undefined}
                  className={[
                    'px-3 py-1.5 text-sm font-medium transition-colors',
                    fdrDisabled
                      ? 'bg-chalk-100 text-ink-500 cursor-not-allowed opacity-60'
                      : colourBasis === c
                        ? 'bg-pitch-800 text-chalk-100'
                        : 'bg-white text-ink-700 hover:bg-chalk-100',
                  ].join(' ')}
                >
                  {c === 'model' ? 'Dixon-Coles xG' : 'Simple FDR (1-5)'}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-500 mb-1" htmlFor="rank-window">
            Rank by next
          </label>
          <div className="flex items-center gap-1.5">
            <input
              id="rank-window"
              type="number"
              min={1}
              max={allMatchweeks.length || 1}
              value={rankWindowInput}
              onChange={(e) => setRankWindowInput(e.target.value)}
              className="w-16 border border-chalk-300 rounded px-2 py-1 text-sm font-mono"
            />
            <span className="text-sm text-ink-500">fixtures</span>
          </div>
        </div>
      </div>

      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {error && <p className="text-loss-700 text-sm">{error}</p>}

      {!loading && !error && data && sortedRows.length === 0 && (
        <p className="text-ink-500 text-sm">
          No upcoming fixtures with rated teams were found for the current season yet.
        </p>
      )}

      {!loading && !error && sortedRows.length > 0 && (
        <>
          <FantasyFixtureHeatmap rows={sortedRows} matchweeks={displayedMatchweeks} metric={metric} />
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-500">
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: 'rgb(53, 117, 86)' }} />
              {legendGoodLabel}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: 'rgb(232, 228, 212)' }} /> Average
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: 'rgb(166, 61, 64)' }} />
              {legendBadLabel}
            </span>
            <span>
              Showing your next {displayedMatchweeks.length} gameweek{displayedMatchweeks.length === 1 ? '' : 's'}. Rows
              are sorted from the best matchups to the worst for the selected focus.
            </span>
          </div>
        </>
      )}
    </div>
  );
}
