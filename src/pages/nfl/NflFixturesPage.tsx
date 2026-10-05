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
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
  weekLabel,
  weekSentence,
  byeWeeks,
  teamResult,
  type NflGame,
  type NflTeam,
  type NflGameModel,
  type NflWeekData,
} from '../../lib/nflApi';
import NflWatchLine from '../../components/nfl/NflWatchLine';
import { againstSpread } from '../../lib/nflStory';

function intParam(v: string | null): number | null {
  if (v == null || !/^\d{1,4}$/.test(v)) return null;
  return Number(v);
}

/** Start fetching the game page's code on hover, so the click opens fast. */
const prefetchGamePage = () => void import('./NflGamePage');

/** The whole row opens the game page, as Football's fixture rows open the
 * match preview; team names still go to the team pages. */
function GameRow({ g, model }: { g: NflGame; model?: NflGameModel }) {
  const navigate = useNavigate();
  const open = () => navigate(nflGamePath(g.game_id), { state: { game: g } });
  const done = g.home_score != null && g.away_score != null;
  const awayWon = done && g.away_score! > g.home_score!;
  const homeWon = done && g.home_score! > g.away_score!;
  const line = lineLabel(g);
  return (
    <li
      className="border border-chalk-300 rounded-lg bg-white/60 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-1 cursor-pointer hover:border-pitch-700 hover:bg-white transition-colors"
      data-testid="nfl-game"
      onClick={open}
      onMouseEnter={prefetchGamePage}
      onFocus={prefetchGamePage}
    >
      <div className="flex-1 min-w-[14rem] grid grid-cols-[1fr_auto] gap-x-3 text-sm">
        <Link to={nflTeamPath(g.away_slug)} onClick={(e) => e.stopPropagation()} className={`hover:underline ${awayWon ? 'font-semibold' : ''}`}>{g.away_name}</Link>
        <span className={`font-mono tabular-nums text-right ${awayWon ? 'font-semibold' : ''}`}>{done ? g.away_score : ''}</span>
        <span>
          <span className="text-ink-500 text-xs">{g.neutral_site ? 'v ' : '@ '}</span>
          <Link to={nflTeamPath(g.home_slug)} onClick={(e) => e.stopPropagation()} className={`hover:underline ${homeWon ? 'font-semibold' : ''}`}>{g.home_name}</Link>
        </span>
        <span className={`font-mono tabular-nums text-right ${homeWon ? 'font-semibold' : ''}`}>{done ? g.home_score : ''}</span>
      </div>
      <div className="text-xs text-ink-500 font-mono text-right ml-auto">
        <div>{done ? `Final${g.overtime ? ' (OT)' : ''}` : ukKickoff(g)}</div>
        <div>
          <Link to={nflGamePath(g.game_id)} state={{ game: g }} onClick={(e) => e.stopPropagation()} className="font-sans font-medium text-pitch-700 hover:text-pitch-800" data-testid="nfl-game-link">
            Explore &rarr;
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

/** One team's season, results first and clear: Football's team mode on
 * Fixtures & Results, for the NFL. */
function TeamSeason({ team, season, games, model }: { team: NflTeam; season: number; games: NflGame[]; model: Record<string, NflGameModel> }) {
  const navigate = useNavigate();
  const mine = games
    .filter((g) => g.home_franchise === team.franchise || g.away_franchise === team.franchise)
    .sort((a, b) => (a.kickoff_at ?? a.gameday).localeCompare(b.kickoff_at ?? b.gameday));
  const rows: ({ bye: number } | { g: NflGame })[] = [...mine.map((g) => ({ g })), ...byeWeeks(mine).map((w) => ({ bye: w }))].sort((a, b) => {
    const wa = 'bye' in a ? a.bye : a.g.game_type === 'REG' ? a.g.week : 100 + a.g.week;
    const wb = 'bye' in b ? b.bye : b.g.game_type === 'REG' ? b.g.week : 100 + b.g.week;
    return wa - wb;
  });
  let w = 0, l = 0, t = 0, pf = 0, pa = 0, cover = 0, miss = 0, push = 0;
  for (const g of mine) {
    const r = teamResult(g, team.franchise);
    if (!r.letter || g.game_type !== 'REG') continue;
    if (r.letter === 'W') w++;
    else if (r.letter === 'L') l++;
    else t++;
    const home = g.home_franchise === team.franchise;
    pf += home ? g.home_score! : g.away_score!;
    pa += home ? g.away_score! : g.home_score!;
    const ats = againstSpread(g, team.franchise);
    if (ats === 'cover') cover++;
    else if (ats === 'miss') miss++;
    else if (ats === 'push') push++;
  }
  const played = w + l + t;
  return (
    <section aria-labelledby="team-heading" className="space-y-3" data-testid="nfl-team-season">
      <h2 id="team-heading" className="font-display uppercase tracking-wide text-lg text-ink-900">{`${season}: ${team.name}`}</h2>
      {played > 0 && (
        <p className="text-sm text-ink-700" data-testid="nfl-team-season-summary">
          {`Regular season ${w}-${l}${t ? `-${t}` : ''} · points ${pf}-${pa} (${pf - pa >= 0 ? '+' : ''}${pf - pa}) · against the spread ${cover}-${miss}${push ? `-${push}` : ''}`}
        </p>
      )}
      <div className="overflow-x-auto border border-chalk-300 rounded-lg bg-white">
        <table className="w-full text-sm">
          <thead className="bg-chalk-200 text-ink-500">
            <tr>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2">Week</th>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2">Opponent</th>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2">Result / kick-off (UK)</th>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2 hidden sm:table-cell">Line</th>
              <th scope="col" className="text-left font-medium text-xs px-3 py-2 hidden md:table-cell">Model</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              if ('bye' in row) {
                return (
                  <tr key={`bye-${row.bye}`} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                    <td className="px-3 py-2 text-xs text-ink-700">{`Week ${row.bye}`}</td>
                    <td colSpan={4} className="px-3 py-2 text-xs text-ink-500">Bye</td>
                  </tr>
                );
              }
              const g = row.g;
              const r = teamResult(g, team.franchise);
              const ats = againstSpread(g, team.franchise);
              const m = model[g.game_id];
              return (
                <tr
                  key={g.game_id}
                  className={`cursor-pointer hover:bg-chalk-100 ${i % 2 ? 'bg-chalk-100/60' : ''}`}
                  onClick={() => navigate(nflGamePath(g.game_id), { state: { game: g } })}
                  onMouseEnter={prefetchGamePage}
                >
                  <td className="px-3 py-2 text-xs text-ink-700 whitespace-nowrap">{weekLabel(g.game_type, g.week)}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-ink-500">{g.neutral_site || r.home ? 'v ' : '@ '}</span>
                    <Link to={nflTeamPath(r.opponentSlug)} onClick={(e) => e.stopPropagation()} className="hover:underline">{r.opponent}</Link>
                    {g.neutral_site && g.stadium && <span className="block text-xs text-pitch-700">{g.stadium}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums whitespace-nowrap">
                    {r.letter ? (
                      <Link to={nflGamePath(g.game_id)} state={{ game: g }} onClick={(e) => e.stopPropagation()} className={`hover:underline ${r.letter === 'W' ? 'font-semibold text-pitch-800' : r.letter === 'L' ? 'text-loss-600' : ''}`}>
                        {`${r.letter} ${r.score}`}
                      </Link>
                    ) : (
                      <Link to={nflGamePath(g.game_id)} state={{ game: g }} onClick={(e) => e.stopPropagation()} className="hover:underline">{ukKickoff(g)}</Link>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-500 hidden sm:table-cell whitespace-nowrap">
                    {lineLabel(g) ?? ''}
                    {ats && <span className={ats === 'cover' ? 'text-pitch-700' : undefined}>{` · ${ats === 'cover' ? 'covered' : ats === 'miss' ? 'did not cover' : 'push'}`}</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-500 hidden md:table-cell whitespace-nowrap">{m ? favourLabel(g, m.p_home) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-ink-500">Tap a game for its preview or result: head-to-head, form and the prediction.</p>
    </section>
  );
}

export default function NflFixturesPage({ initialData }: { initialData?: NflWeekData }) {
  const [params, setParams] = useSearchParams();
  const season = intParam(params.get('season'));
  const week = intParam(params.get('week'));
  const teamSlug = params.get('team');
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
  const go = (s: number, w: number | null, team: string | null = teamSlug) => {
    const p = new URLSearchParams();
    p.set('season', String(s));
    if (w != null) p.set('week', String(w));
    if (team) p.set('team', team);
    setParams(p);
  };
  const team = data && teamSlug ? data.teams.find((t) => t.slug === teamSlug) ?? null : null;
  const [teamText, setTeamText] = useState('');
  const pickTeam = (text: string) => {
    setTeamText(text);
    const hit = data?.teams.find((t) => t.name.toLowerCase() === text.trim().toLowerCase() || t.short_name.toLowerCase() === text.trim().toLowerCase());
    if (hit && data) {
      go(data.season, data.week, hit.slug);
      setTeamText('');
    }
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
          {!team && <p className="text-ink-900 max-w-prose" data-testid="nfl-week-story">{weekSentence(data)}</p>}

          <div className="flex flex-wrap items-end gap-3 text-sm">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-500">Season</span>
              <select className="border border-chalk-300 rounded px-2 py-1 bg-white" value={data.season} onChange={(e) => go(Number(e.target.value), null)}>
                {[...data.seasons].reverse().map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </label>
            {!team && <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-500">Week</span>
              <select className="border border-chalk-300 rounded px-2 py-1 bg-white" value={data.week} onChange={(e) => go(data.season, Number(e.target.value))}>
                {data.weeks.map((w) => (
                  <option key={w.week} value={w.week}>{w.label}</option>
                ))}
              </select>
            </label>}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink-500">Team</span>
              <input
                list="nfl-team-names"
                value={teamText}
                onChange={(e) => pickTeam(e.target.value)}
                placeholder={team ? team.name : 'Search a team'}
                className="border border-chalk-300 rounded px-2 py-1 bg-white w-56"
                aria-label="Search a team"
                data-testid="nfl-team-search"
              />
              <datalist id="nfl-team-names">
                {data.teams.map((t) => <option key={t.slug} value={t.name} />)}
              </datalist>
            </label>
            {team && (
              <button type="button" className="text-pitch-800 underline underline-offset-2 pb-1" onClick={() => go(data.season, data.week, null)}>
                All teams
              </button>
            )}
            {!team && <nav aria-label="Other weeks" className="flex gap-4 pb-1">
              {prev && (
                <button type="button" className="text-pitch-800 underline underline-offset-2" onClick={() => go(data.season, prev.week)}>&larr; {prev.label}</button>
              )}
              {next && (
                <button type="button" className="text-pitch-800 underline underline-offset-2" onClick={() => go(data.season, next.week)}>{next.label} &rarr;</button>
              )}
            </nav>}
          </div>

          {team && <TeamSeason team={team} season={data.season} games={data.seasonGames} model={data.model} />}

          {!team && <>
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
          </>}

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
