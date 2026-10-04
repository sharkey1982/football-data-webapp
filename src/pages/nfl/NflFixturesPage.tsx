// ============================================================================
// src/pages/nfl/NflFixturesPage.tsx
//
// /nfl/fixtures -- "Fixtures & Results", as in Football: one week of games,
// results, upcoming kick-offs in UK time, the line, and where each game is
// on in the UK (full detail on the TV Guide). Football's calendar heat map
// sits above the list: games per UK day, play-offs in the cup colour; tap
// days to list just those days, as on the football fixtures page. ?season= and ?week= pick
// another week without adding static pages; the bare URL shows the week the
// season is on and is the one version server-rendered at build.
// ============================================================================

import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import FixtureCalendarHeatmap from '../../components/FixtureCalendarHeatmap';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import {
  NFL_FIXTURES_PATH,
  NFL_HUB_PATH,
  NFL_TV_PATH,
  favourLabel,
  lineLabel,
  loadNflWeek,
  nflSeasonPath,
  nflTablePath,
  nflGamePath,
  nflTeamPath,
  ukDateKey,
  ukDay,
  ukKickoff,
  weekSentence,
  type NflGame,
  type NflGameModel,
  type NflWeekData,
} from '../../lib/nflApi';
import NflWatchLine from '../../components/nfl/NflWatchLine';

function intParam(v: string | null): number | null {
  if (v == null || !/^\d{1,4}$/.test(v)) return null;
  return Number(v);
}

function GameRow({ g, model }: { g: NflGame; model?: NflGameModel }) {
  const done = g.home_score != null && g.away_score != null;
  const awayWon = done && g.away_score! > g.home_score!;
  const homeWon = done && g.home_score! > g.away_score!;
  const line = lineLabel(g);
  return (
    <li className="border border-chalk-300 rounded-lg bg-white/60 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1" data-testid="nfl-game">
      <div className="flex-1 min-w-[14rem] grid grid-cols-[1fr_auto] gap-x-3 text-sm">
        <Link to={nflTeamPath(g.away_slug)} className={`hover:underline ${awayWon ? 'font-semibold' : ''}`}>{g.away_name}</Link>
        <span className={`font-mono tabular-nums text-right ${awayWon ? 'font-semibold' : ''}`}>{done ? g.away_score : ''}</span>
        <span>
          <span className="text-ink-500 text-xs">{g.neutral_site ? 'v ' : '@ '}</span>
          <Link to={nflTeamPath(g.home_slug)} className={`hover:underline ${homeWon ? 'font-semibold' : ''}`}>{g.home_name}</Link>
        </span>
        <span className={`font-mono tabular-nums text-right ${homeWon ? 'font-semibold' : ''}`}>{done ? g.home_score : ''}</span>
      </div>
      <div className="text-xs text-ink-500 font-mono text-right ml-auto">
        <div>{done ? `Final${g.overtime ? ' (OT)' : ''}` : ukKickoff(g)}</div>
        <div>
          <Link to={nflGamePath(g.game_id)} className="text-pitch-800 underline underline-offset-2" data-testid="nfl-game-link">
            {done ? 'Result, head-to-head & form' : 'Preview: head-to-head, form & prediction'}
          </Link>
        </div>
        {line && <div>{`${done ? 'Closing line' : 'Line'}: ${line}${g.total_line != null ? `, O/U ${g.total_line}` : ''}`}</div>}
        {model && (
          <div className="text-ink-700" data-testid="nfl-model-line">
            {`Model: ${favourLabel(g, model.p_home)}${model.market_p_home != null ? ` \u00b7 market ${favourLabel(g, model.market_p_home)}` : ''}`}
          </div>
        )}
        {g.neutral_site && g.stadium && <div className="text-pitch-700">{g.stadium}</div>}
        {!done && <NflWatchLine g={g} />}
      </div>
    </li>
  );
}

export default function NflFixturesPage({ initialData }: { initialData?: NflWeekData }) {
  const [params, setParams] = useSearchParams();
  const season = intParam(params.get('season'));
  const week = intParam(params.get('week'));
  const key = `${season ?? 'now'}:${week ?? 'now'}`;
  const { data, failed, loading } = useKeyedFetch(key, () => loadNflWeek(season, week), initialData ? { key: 'now:now', data: initialData } : undefined);

  useDocumentHead({
    title: 'NFL fixtures and results in UK time',
    description: data ? weekSentence(data) : 'Every NFL game week by week: results, upcoming kick-offs in UK time, the line and where to watch.',
    path: NFL_FIXTURES_PATH,
  });

  // Calendar: counts per UK date across the season; the left month follows
  // the week on show until the person pages it themselves.
  const { dateCounts, dateTypes } = useMemo(() => {
    const counts: Record<string, number> = {};
    const types: Record<string, 'league' | 'cup' | 'mixed'> = {};
    for (const g of data?.seasonGames ?? []) {
      const k = ukDateKey(g);
      counts[k] = (counts[k] ?? 0) + 1;
      const t = g.game_type === 'REG' ? 'league' : 'cup';
      types[k] = types[k] && types[k] !== t ? 'mixed' : t;
    }
    return { dateCounts: counts, dateTypes: types };
  }, [data]);
  // Day selection and paging belong to the week on show: a new season or
  // week starts clean (derived from the stored key, not reset in an effect).
  const weekKey = `${data?.season}:${data?.week}`;
  const [ui, setUi] = useState<{ key: string; selected: Set<string>; view: { year: number; month: number } | null }>({ key: '', selected: new Set(), view: null });
  const selectedDates = ui.key === weekKey ? ui.selected : new Set<string>();
  const view = ui.key === weekKey ? ui.view : null;
  const firstOfWeek = data?.games[0] ? ukDateKey(data.games[0]) : null;
  const anchor = view ?? (firstOfWeek ? { year: Number(firstOfWeek.slice(0, 4)), month: Number(firstOfWeek.slice(5, 7)) - 1 } : { year: new Date().getFullYear(), month: new Date().getMonth() });
  const setView = (v: { year: number; month: number }) => setUi({ key: weekKey, selected: selectedDates, view: v });
  const setSelectedDates = (next: Set<string>) => setUi({ key: weekKey, selected: next, view });
  const toggleDate = (d: string) => {
    const next = new Set(selectedDates);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setSelectedDates(next);
  };
  const listGames = selectedDates.size > 0 ? (data?.seasonGames ?? []).filter((g) => selectedDates.has(ukDateKey(g))).sort((a, b) => (a.kickoff_at ?? a.gameday).localeCompare(b.kickoff_at ?? b.gameday)) : data?.games ?? [];

  const days: { day: string; games: NflGame[] }[] = [];
  for (const g of listGames) {
    const day = ukDay(g);
    const last = days[days.length - 1];
    if (last && last.day === day) last.games.push(g);
    else days.push({ day, games: [g] });
  }
  const idx = data ? data.weeks.findIndex((w) => w.week === data.week) : -1;
  const prev = data && idx > 0 ? data.weeks[idx - 1] : null;
  const next = data && idx >= 0 && idx < data.weeks.length - 1 ? data.weeks[idx + 1] : null;
  const go = (s: number, w: number | null) => {
    const p = new URLSearchParams();
    p.set('season', String(s));
    if (w != null) p.set('week', String(w));
    setParams(p);
  };
  const current = data?.weeks.find((w) => w.week === data.week);

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/discover" className="hover:underline">Discover</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Fixtures &amp; Results</h1>
        <p className="text-sm text-ink-500 mt-1">Kick-off times are UK time.</p>
      </header>

      {failed && <p className="text-ink-700">The NFL schedule is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <>
          <p className="text-ink-900 max-w-prose" data-testid="nfl-week-story">{weekSentence(data)}</p>

          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-500">Season</span>
              <select className="border border-chalk-300 rounded px-2 py-1 bg-white" value={data.season} onChange={(e) => go(Number(e.target.value), null)}>
                {[...data.seasons].reverse().map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-500">Week</span>
              <select className="border border-chalk-300 rounded px-2 py-1 bg-white" value={data.week} onChange={(e) => go(data.season, Number(e.target.value))}>
                {data.weeks.map((w) => (
                  <option key={w.week} value={w.week}>{w.label}</option>
                ))}
              </select>
            </label>
            <nav aria-label="Other weeks" className="flex gap-4 pb-1">
              {prev && (
                <button type="button" className="text-pitch-800 underline underline-offset-2" onClick={() => go(data.season, prev.week)}>&larr; {prev.label}</button>
              )}
              {next && (
                <button type="button" className="text-pitch-800 underline underline-offset-2" onClick={() => go(data.season, next.week)}>{next.label} &rarr;</button>
              )}
            </nav>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <FixtureCalendarHeatmap
              dateCounts={dateCounts}
              dateTypes={dateTypes}
              loading={false}
              selectedDates={selectedDates}
              onToggleDate={toggleDate}
              viewYear={anchor.year}
              viewMonth={anchor.month}
              onChangeMonth={(year, month) => setView({ year, month })}
            />
            <div className="flex-1 min-w-0 text-ink-500 text-sm pt-1" data-testid="nfl-calendar-help">
              <p>
                {selectedDates.size > 0
                  ? `The list below shows games on the ${selectedDates.size === 1 ? 'selected day' : `${selectedDates.size} selected days`} only (UK dates).`
                  : `The list below shows ${current?.label ?? `week ${data.week}`}. Darker days have more games; play-off days are in blue.`}{' '}
                Tap a day to select it, or tap again to deselect &mdash; tap more than one day to combine them.
              </p>
              {selectedDates.size > 0 && (
                <button type="button" className="mt-2 text-pitch-800 underline underline-offset-2" onClick={() => setSelectedDates(new Set())}>
                  Back to {current?.label ?? `week ${data.week}`}
                </button>
              )}
            </div>
          </div>

          <section aria-labelledby="week-heading" className="space-y-4">
            <h2 id="week-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">
              {selectedDates.size > 0 ? `${data.season}: ${selectedDates.size === 1 ? 'selected day' : `${selectedDates.size} selected days`}` : `${data.season}: ${current?.label ?? `Week ${data.week}`}`}
            </h2>
            {days.map(({ day, games }) => (
              <div key={day}>
                <h3 className="font-mono text-xs uppercase tracking-widest text-ink-500 mb-2">{day}</h3>
                <ul className="space-y-2">
                  {games.map((g) => <GameRow key={g.game_id} g={g} model={data.model[g.game_id]} />)}
                </ul>
              </div>
            ))}
            <p className="text-xs text-ink-500 max-w-prose">
              Line: the point spread, favourite first (KC &minus;3.5 means Kansas City are expected to win by 3.5). For finished games it is the closing line. O/U is the total-points line.
            </p>
            <p className="text-xs text-ink-500 max-w-prose">
              Model: FixtureShark&rsquo;s team rating (an Elo rating built from every result since 2002) and the chance it gives the side it favours, made before kick-off and never changed afterwards; market: the same from the betting odds. Tested on seasons it never saw (2025 and 2026), the model called results clearly better than home advantage alone but less well than the betting market, so it is shown beside the market rather than instead of it.
            </p>
          </section>

          <p className="text-sm flex flex-wrap gap-x-5 gap-y-1.5">
            <Link to={nflTablePath(data.season)} className="text-pitch-800 underline underline-offset-2">{`${data.season} League Table`}</Link>
            <Link to={nflSeasonPath(data.season)} className="text-pitch-800 underline underline-offset-2">{`Story of the ${data.season} season`}</Link>
            <Link to={NFL_TV_PATH} className="text-pitch-800 underline underline-offset-2">TV Guide</Link>
          </p>

          <p className="text-xs text-ink-500">Data: nflverse, every season since 2002. Updated daily.</p>
        </>
      )}
    </article>
  );
}
