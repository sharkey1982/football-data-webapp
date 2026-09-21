import { useEffect, useMemo, useState } from 'react';
import {
  computeFdrQuintiles,
  getFantasyFixtureDifficulty,
  getLeagues,
  getMostRecentFixtureSeason,
  type FantasyFixtureData,
} from '../lib/api';
import { getDefaultMatchweek, getGameweekInPlay } from '../lib/fplSeasonApi';
import GameweekRangeFilter from '../components/fpl/GameweekRangeFilter';
import FantasyFixtureHeatmap, {
  type FantasyColourBasis,
  type FantasyFocus,
  type FantasyHeatmapCell,
  type FantasyHeatmapRow,
  type FantasyMetric,
} from '../components/FantasyFixtureHeatmap';
import { FitFreshnessBanner } from '../components/FitFreshnessBanner';

type FantasyDefenceMetric = 'goals' | 'cleansheet';

const DEFAULT_RANK_WINDOW = 10;

export default function FantasyFixtures() {
  const [seasonLabel, setSeasonLabel] = useState<string | null>(null);
  const [leagueId, setLeagueId] = useState<number | null>(null);
  const [data, setData] = useState<FantasyFixtureData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [focus, setFocus] = useState<FantasyFocus>('attack');
  const [colourBasis, setColourBasis] = useState<FantasyColourBasis>('model');
  const [defenceMetric, setDefenceMetric] = useState<FantasyDefenceMetric>('cleansheet');
  // The shared gameweek filter (as on Optimal Squad and Player Projections),
  // so this page gets the in-progress-gameweek tick box too: "from" is the
  // start week, the span is how many fixtures the ranking averages.
  const [fromGw, setFromGw] = useState<number | null>(null);
  const [toGw, setToGw] = useState<number | null>(null);
  const [inPlay, setInPlay] = useState<{ gw: number; played: number; total: number } | null>(null);
  const [defaultGw, setDefaultGw] = useState<number | null>(null);
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
    // Same canonical "current gameweek" source used everywhere else in
    // the app (Optimal Squad, FPL Projections) -- fetched independently
    // of the fixture-difficulty data below so a fetch failure here never
    // blocks the heatmap itself from loading.
    getGameweekInPlay()
      .then((g) => { if (!cancelled) setInPlay(g); })
      .catch(() => { if (!cancelled) setInPlay(null); });
    getDefaultMatchweek()
      .then((gw) => {
        if (!cancelled) setDefaultGw(gw);
      })
      .catch(() => {
        /* falls back to allMatchweeks[0] below if this fails */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const leagues = await getLeagues();
        const e0 = leagues?.find((l) => l.code === 'E0');
        if (!e0) throw new Error('E0 (Premier League) not found');
        setLeagueId(e0.league_id);
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

  const earliestMatchweek = allMatchweeks[0] ?? null;

  // Fixtures come back as soon as any part of a gameweek is unplayed, so a
  // gameweek that's only partway through (some teams already played their
  // fixture, others haven't) shows up as a real column but isn't a fair
  // like-for-like comparison across teams. Left blank, this defaults to the
  // canonical current gameweek (matching every other page in the app);
  // typing a later one skips past an in-progress gameweek explicitly.
  const startMatchweek = useMemo(() => {
    return fromGw ?? defaultGw ?? earliestMatchweek ?? 1;
  }, [fromGw, defaultGw, earliestMatchweek]);

  const matchweeksFromStart = useMemo(
    () => allMatchweeks.filter((mw) => mw >= startMatchweek),
    [allMatchweeks, startMatchweek]
  );

  const rankWindowSize = useMemo(() => {
    const n = fromGw != null && toGw != null ? toGw - fromGw + 1 : DEFAULT_RANK_WINDOW;
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, matchweeksFromStart.length || 1);
  }, [fromGw, toGw, matchweeksFromStart.length]);

  // The number box controls both the ranking average AND which columns are
  // shown -- there's no separate "full season" view, so the two can never
  // drift apart and confuse what's actually driving the colours on screen.
  const displayedMatchweeks = useMemo(
    () => matchweeksFromStart.slice(0, rankWindowSize),
    [matchweeksFromStart, rankWindowSize]
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

    // ATTACK (Dixon-Coles expected goals) is on an ABSOLUTE scale (Chris):
    // 1.0 or less is fully red, 2.0 or more fully green, linear between --
    // so a colour means the same thing every week, whatever else is on screen.
    if (focus === 'attack') {
      const d = (v: number) => 1 + 4 * Math.max(0, Math.min(1, 2 - v));
      return rows.map((row) => {
        const newCells = new Map(row.cellsByMatchweek);
        for (const [mw, cell] of newCells) newCells.set(mw, { ...cell, difficulty: d(cell.value) });
        return { ...row, cellsByMatchweek: newCells, rankValue: d(row.rankValue) };
      });
    }
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
  }, [rows, colourBasis, higherValueIsBetter, focus]);

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
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Fixture Heat Map</h1>
        <p className="text-sm text-ink-500 mt-1">
          Premier League{seasonLabel ? ` \u2022 ${seasonLabel}` : ''} &mdash; teams ranked easiest to hardest for the
          fixtures you select below.
        </p>
      </div>

      {!loading && <FitFreshnessBanner leagueId={leagueId} fitRun={data?.fitRun ?? null} />}

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

        <div className="w-full">
          <GameweekRangeFilter
            inPlay={inPlay}
            defaultGw={defaultGw}
            fromGw={fromGw}
            toGw={toGw}
            onChange={(f, t) => { setFromGw(f); setToGw(t); }}
            initialPreset="next10"
            presets={['this', 'next3', 'next5', 'next10', 'custom']}
          />
        </div>
      </div>

      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}
      {error && <p className="text-loss-700 text-sm">{error}</p>}

      {!loading && !error && data && sortedRows.length === 0 && (
        <p className="text-ink-500 text-sm">
          No fixtures found from GW{startMatchweek} onwards -- try lowering "Start from GW".
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
