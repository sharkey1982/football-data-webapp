// ============================================================================
// src/pages/nfl/NflHubPage.tsx
//
// /nfl -- one week of NFL games: results, upcoming kick-offs in UK time and
// the line. ?season= and ?week= pick another week without adding static
// pages; the bare URL shows the week the season is on and is the one page
// server-rendered at build.
// ============================================================================

import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import {
  CONFERENCES,
  DIVISIONS,
  NFL_HUB_PATH,
  lineLabel,
  loadNflWeek,
  nflStandingsPath,
  nflTeamPath,
  ukDay,
  ukKickoff,
  weekSentence,
  type NflGame,
  type NflWeekData,
} from '../../lib/nflApi';

function intParam(v: string | null): number | null {
  if (v == null || !/^\d{1,4}$/.test(v)) return null;
  return Number(v);
}

function GameRow({ g }: { g: NflGame }) {
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
        {line && <div>{`${done ? 'Closing line' : 'Line'}: ${line}${g.total_line != null ? `, O/U ${g.total_line}` : ''}`}</div>}
        {g.neutral_site && g.stadium && <div className="text-pitch-700">{g.stadium}</div>}
      </div>
    </li>
  );
}

export default function NflHubPage({ initialData }: { initialData?: NflWeekData }) {
  const [params, setParams] = useSearchParams();
  const season = intParam(params.get('season'));
  const week = intParam(params.get('week'));
  const key = `${season ?? 'now'}:${week ?? 'now'}`;
  const { data, failed, loading } = useKeyedFetch(key, () => loadNflWeek(season, week), initialData ? { key: 'now:now', data: initialData } : undefined);

  useDocumentHead({
    title: 'NFL schedule, results and standings in UK time',
    description: data ? weekSentence(data) : 'NFL results, upcoming games with UK kick-off times, standings and every team since 2002.',
    path: NFL_HUB_PATH,
  });

  const days: { day: string; games: NflGame[] }[] = [];
  for (const g of data?.games ?? []) {
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
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">NFL</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">NFL schedule and results</h1>
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

          <section aria-labelledby="week-heading" className="space-y-4">
            <h2 id="week-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">
              {`${data.season}: ${current?.label ?? `Week ${data.week}`}`}
            </h2>
            {days.map(({ day, games }) => (
              <div key={day}>
                <h3 className="font-mono text-xs uppercase tracking-widest text-ink-500 mb-2">{day}</h3>
                <ul className="space-y-2">
                  {games.map((g) => <GameRow key={g.game_id} g={g} />)}
                </ul>
              </div>
            ))}
            <p className="text-xs text-ink-500 max-w-prose">
              Line: the point spread, favourite first (KC &minus;3.5 means Kansas City are expected to win by 3.5). For finished games it is the closing line. O/U is the total-points line.
            </p>
          </section>

          <p className="text-sm">
            <Link to={nflStandingsPath(data.season)} className="text-pitch-800 underline underline-offset-2">{`${data.season} standings`}</Link>
          </p>

          <section aria-labelledby="teams-heading">
            <h2 id="teams-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">Teams</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2">
              {CONFERENCES.map((c) => (
                <div key={c}>
                  <h3 className="font-mono text-xs uppercase tracking-widest text-ink-500">{c}</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 mt-2 text-sm">
                    {DIVISIONS.map((d) => (
                      <div key={d}>
                        <p className="text-xs text-ink-500">{`${c} ${d}`}</p>
                        <ul>
                          {data.teams
                            .filter((t) => t.conference === c && t.division === d)
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((t) => (
                              <li key={t.franchise}>
                                <Link to={nflTeamPath(t.slug)} className="hover:underline">{t.name}</Link>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <p className="text-xs text-ink-500">Data: nflverse, every season since 2002. Updated daily.</p>
        </>
      )}
    </article>
  );
}
