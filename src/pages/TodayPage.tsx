// ============================================================================
// src/pages/TodayPage.tsx
//
// /today: the day's action on one page, personal first (Chris approved the
// mockup, 1 Nov 2026: "Go ahead with the today page"). Three boards were
// approved: a match day on desktop, the same day on a phone, and a quiet
// weekday. Sections:
//   Yours today   -- your club, your FPL gameweek, the teams you follow
//   On today      -- every game by kick-off slot, competition, UK TV, the
//                    market's favourite with ours where it differs; filters
//                    Everything / On TV / Premier League; big slots collapse
//   FPL today     -- deadline, team news, overnight and tonight's prices,
//                    most bought and sold
//   Worth knowing -- the biggest model-v-market gap, the strongest
//                    favourites (probabilities only: not a tip)
//   Results so far, then a line for the NFL when it is on.
// A day with no Premier League game uses the quiet layout: Tonight,
// yesterday's results (did the market and our model have them right?),
// Coming up. ?date=YYYY-MM-DD shows another day's games (Yesterday /
// Tomorrow); the personal and FPL sections are for today only.
//
// The static build pre-renders today's page (initialData) with its dated
// opening sentence; the app itself loads the day in the browser and keeps
// reported scores fresh every two minutes while a game is in play.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { readPrefs } from '../lib/myPrefs';
import { addIsoDays, ukToday } from '../lib/ukDate';
import { longDate } from '../lib/answerFirst';
import { formatDeadline } from '../lib/hubApi';
import { matchPath } from '../components/EntityLinks';
import { loadNflUpcoming } from '../lib/nflApi';
import {
  applyFilter, biggestGap, comingUp, daySentence, favouriteCall, getDayPage, hasScore, hiddenCompetitions, inPlay, isQuietDay,
  leagueRank, leagueShort, outcomeLabel, pctOf as pct, resultCalls, slotGroups, slotSummary, strongestFavourites, ukInstant,
  type DayFilter, type DayGame, type DayPage, type Slot,
} from '../lib/todayApi';
import {
  count, deadlineLine, getFplToday, liveGameweek, mostTransferred, overnightLine, teamNewsLine, tonightLine, type FplToday,
} from '../lib/todayFpl';
import { BUTTON, Card, EYEBROW, LINK, SectionHead, Skeleton, TAP_LINK } from '../components/today/TodayParts';
import { useLoad, type Load } from '../hooks/useLoad';
import { YoursToday } from '../components/today/YoursToday';

const POLL_MS = 120_000;
/** Rows a kick-off slot shows before "+N more". */
export const SLOT_ROWS = 5;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function dayHeading(day: string): string {
  // "Saturday 31 October" (the year is in the opening sentence).
  return longDate(day, true).replace(/ \d{4}$/, '');
}

// ---- On today ----------------------------------------------------------------

function GameRow({ g, showTime, day, now }: { g: DayGame; showTime: boolean; day: string; now: number }) {
  const call = favouriteCall(g);
  const comp = leagueShort(g);
  const tv = g.tv.length ? g.tv.join(', ') : g.notTv ? 'Not on UK TV' : '';
  const live = inPlay(g, day, now);
  const title = `${g.home} v ${g.away}`;
  return (
    <li className="py-2 sm:py-0 sm:min-h-11 sm:grid sm:grid-cols-[3.25rem_minmax(0,1fr)_6.5rem_9rem_12rem] sm:items-center sm:gap-3 text-sm" data-testid="today-game">
      <span className={`font-mono tabular-nums text-ink-500 ${showTime ? 'mr-2 sm:mr-0' : 'hidden sm:block'}`}>{showTime ? g.time : ''}</span>
      <span className="font-medium text-ink-900 min-w-0">
        {g.slug ? <Link to={matchPath(g.slug)} className="hover:underline inline-flex items-center min-h-11 sm:min-h-0">{title}</Link> : title}
        {hasScore(g) && <span className="ml-2 font-mono tabular-nums" aria-label={`score ${g.hg}–${g.ag}`}>{g.hg}–{g.ag}</span>}
        {g.status === 'postponed' && <span className="ml-2 text-ink-500">Postponed</span>}
        {live && <span className="ml-2 font-mono text-[11px] uppercase tracking-widest text-amber-700">in play</span>}
      </span>
      <span className="flex flex-wrap gap-x-1.5 text-ink-700 sm:contents">
        <span className="sm:font-mono sm:text-xs sm:text-ink-500">{comp}</span>
        {tv && <><span aria-hidden="true" className="sm:hidden">·</span><span className="sm:truncate">{tv}</span></>}
        {!tv && <span className="hidden sm:block" />}
        {call.main && (
          <>
            <span aria-hidden="true" className="sm:hidden">·</span>
            <span className="sm:text-right">
              {call.main}
              {call.ours && <span className="text-ink-500"> ({call.ours})</span>}
            </span>
          </>
        )}
      </span>
    </li>
  );
}

function SlotBlock({ slot, day, now }: { slot: Slot; day: string; now: number }) {
  const [open, setOpen] = useState(false);
  const shown = open ? slot.games : slot.games.slice(0, SLOT_ROWS);
  const hidden = slot.games.slice(SLOT_ROWS);
  const anyLive = slot.games.some((g) => inPlay(g, day, now));
  const where = slot.evening ? 'this evening' : slot.key === 'tbc' ? 'with no time yet' : `at ${slot.label}`;
  return (
    <div className="bg-white border border-chalk-300 rounded-lg" data-testid="today-slot">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 py-2 bg-chalk-200 border-b border-chalk-300 rounded-t-lg">
        <h3 className="font-mono text-xs uppercase tracking-widest text-ink-900">
          {slot.label}{anyLive ? ' · in play' : ''}
        </h3>
        <span className="text-xs text-ink-500">{slotSummary(slot, day)}</span>
      </div>
      <ul className="px-4 divide-y divide-chalk-200">
        {shown.map((g) => <GameRow key={g.fixtureId} g={g} showTime={slot.evening || slot.key === 'tbc'} day={day} now={now} />)}
      </ul>
      {hidden.length > 0 && (
        <div className="px-4 border-t border-chalk-200">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`inline-flex items-center min-h-11 text-sm ${LINK}`}>
            {open ? 'Show fewer' : `+${hidden.length} more ${where}`}
            {!open && <span className="hidden sm:inline">&nbsp;({hiddenCompetitions(hidden)})</span>}
          </button>
        </div>
      )}
    </div>
  );
}

const FILTERS: { key: DayFilter; label: string }[] = [
  { key: 'all', label: 'Everything' },
  { key: 'tv', label: 'On TV' },
  { key: 'pl', label: 'Premier League' },
];

function OnToday({ page, title, now, followed }: { page: DayPage; title: string; now: number; followed: Set<number> }) {
  const [filter, setFilter] = useState<DayFilter>('all');
  const games = applyFilter(page.games, filter);
  const slots = slotGroups(games, followed);
  const anyMarket = page.games.some((g) => g.market);
  return (
    <section aria-labelledby="today-on" className="space-y-3" data-testid="today-on">
      <SectionHead id="today-on" title={title} />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`${BUTTON} ${filter === f.key ? 'border-pitch-900 bg-pitch-900 text-chalk-100' : 'border-chalk-300 bg-white text-ink-900 hover:bg-chalk-200'}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <p className="text-sm text-ink-700">
        {anyMarket
          ? 'Favourite and chance: the betting market, with our model in brackets where it differs by 5 points or more.'
          : 'Our model’s favourite. The market’s view is added once prices are in, usually the day before.'}
      </p>
      {slots.length === 0 ? (
        <p className="text-sm text-ink-700">{filter === 'all' ? 'No games in the competitions we cover.' : filter === 'tv' ? 'No game confirmed for UK TV.' : 'No Premier League game.'}</p>
      ) : (
        <div className="space-y-3">{slots.map((s) => <SlotBlock key={s.key} slot={s} day={page.day} now={now} />)}</div>
      )}
      <p className="text-sm"><Link to="/tv-guide" className={TAP_LINK}>The full TV guide</Link></p>
    </section>
  );
}

// ---- Results --------------------------------------------------------------------

function Call({ label, right }: { label: string; right: boolean | null }) {
  if (right == null) return null;
  return (
    <span className={right ? 'text-pitch-800' : 'text-ink-500'}>
      {label} <span aria-hidden="true">{right ? '✓' : '✗'}</span>
      <span className="sr-only">{right ? 'had it right' : 'had it wrong'}</span>
    </span>
  );
}

function ResultsList({ games, testId }: { games: DayGame[]; testId: string }) {
  const [open, setOpen] = useState(false);
  const done = games.filter(hasScore).sort((a, b) => leagueRank(a.leagueId) - leagueRank(b.leagueId) || (b.time ?? '').localeCompare(a.time ?? ''));
  const shown = open ? done : done.slice(0, 10);
  return (
    <>
      <ul className="divide-y divide-chalk-200" data-testid={testId}>
        {shown.map((g) => {
          const c = resultCalls(g);
          return (
            <li key={g.fixtureId} className="py-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
              <span className="text-ink-900">
                {g.slug ? <Link to={matchPath(g.slug)} className="hover:underline">{g.home} {g.hg}–{g.ag} {g.away}</Link> : <>{g.home} {g.hg}–{g.ag} {g.away}</>}
                <span className="ml-2 font-mono text-xs text-ink-500">{leagueShort(g)}</span>
                {!g.confirmed && <span className="ml-2 text-xs text-ink-500">reported</span>}
              </span>
              <span className="flex gap-3 text-xs"><Call label="Market" right={c.market} /><Call label="Our model" right={c.model} /></span>
            </li>
          );
        })}
      </ul>
      {done.length > 10 && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={`inline-flex items-center min-h-11 text-sm ${LINK}`}>
          {open ? 'Show fewer' : `All ${done.length} results`}
        </button>
      )}
    </>
  );
}

function firstResultAt(page: DayPage): string | null {
  const first = page.games.filter((g) => g.time && g.status !== 'postponed').map((g) => g.time!).sort()[0];
  if (!first) return null;
  const t = new Date(ukInstant(page.day, first) + 115 * 60_000);
  return t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

function ResultsSoFar({ page }: { page: DayPage }) {
  const any = page.games.some(hasScore);
  const at = firstResultAt(page);
  return (
    <section aria-labelledby="today-results" className="space-y-2" data-testid="today-results">
      <SectionHead id="today-results" title="Results so far" />
      {any ? <ResultsList games={page.games} testId="today-results-list" /> : (
        <p className="text-sm text-ink-700">
          {at ? `The first results arrive from about ${at}. ` : ''}Each shows the score and whether it went the way the market and our model expected.
        </p>
      )}
    </section>
  );
}

function YesterdayResults({ day }: { day: string }) {
  const yesterday = addIsoDays(day, -1);
  const load = useLoad<DayPage>(`day:${yesterday}`, () => getDayPage(yesterday));
  const games = load.status === 'ok' ? load.data.games.filter((g) => hasScore(g) && (g.model || g.market)) : [];
  return (
    <section aria-labelledby="today-yesterday-h" className="space-y-2" data-testid="today-yesterday">
      <SectionHead id="today-yesterday-h" title="Yesterday’s results" />
      {load.status === 'loading' && <Skeleton rows={3} />}
      {load.status === 'error' && <p className="text-sm text-ink-700">Yesterday&rsquo;s results didn&rsquo;t load.</p>}
      {load.status === 'ok' && (games.length ? <ResultsList games={games} testId="today-yesterday-list" /> : <p className="text-sm text-ink-700">No results from yesterday in our data.</p>)}
    </section>
  );
}

// ---- FPL today ----------------------------------------------------------------------

function FplTodaySection({ fpl, page }: { fpl: Load<FplToday>; page: DayPage }) {
  const data = fpl.status === 'ok' ? fpl.data : null;
  const live = data ? liveGameweek(data.open) : null;
  const deadline = data ? deadlineLine(data, page.day, formatDeadline) : null;
  const moved = data ? mostTransferred(data.risk) : null;
  const overnight = data ? overnightLine(data.changes, page.day) : null;
  const tonight = data ? tonightLine(data.risk) : null;
  return (
    <section aria-labelledby="today-fpl" className="space-y-3" data-testid="today-fpl">
      <SectionHead id="today-fpl" title="FPL today" />
      {fpl.status === 'loading' && <Card><Skeleton rows={3} /></Card>}
      {fpl.status === 'error' && <Card><p className="text-sm text-ink-700">FPL didn&rsquo;t load.</p></Card>}
      {data && (
        <div className="grid gap-3 md:grid-cols-3">
          <Card>
            <p className={EYEBROW}>Gameweek</p>
            {deadline && <p className="text-sm text-ink-900 font-medium">{deadline}.</p>}
            {moved && (
              <p className="text-sm text-ink-700">
                Most bought: {moved.inName} (+{count(moved.inCount)}). Most sold: {moved.outName} (&minus;{count(moved.outCount)}).
              </p>
            )}
            <Link to={live != null ? '/fpl/live' : '/fpl/start'} className={`${TAP_LINK} text-sm`}>{live != null ? `Gameweek ${live} live` : 'FPL this week'} &rarr;</Link>
          </Card>
          <Card>
            <p className={EYEBROW}>Team news</p>
            {page.teamNews.length > 0 ? (
              <ul className="space-y-1 text-sm text-ink-700" data-testid="today-team-news">
                {page.teamNews.map((s) => <li key={s.slot}>{teamNewsLine(s)}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-ink-700">No Premier League game today.</p>
            )}
            <Link to="/fpl/injuries" className={`${TAP_LINK} text-sm`}>Injuries and doubts &rarr;</Link>
          </Card>
          <Card>
            <p className={EYEBROW}>Prices</p>
            <p className="text-sm text-ink-700">{overnight ? <><strong className="text-ink-900">Overnight:</strong> {overnight}</> : 'No price changes overnight.'}</p>
            {tonight && <p className="text-sm text-ink-700">{tonight}</p>}
            <Link to="/fpl/price-risk" className={`${TAP_LINK} text-sm`}>Price changes &rarr;</Link>
          </Card>
        </div>
      )}
    </section>
  );
}

// ---- Worth knowing ------------------------------------------------------------------

function WorthKnowing({ games }: { games: DayGame[] }) {
  const gap = biggestGap(games);
  const favs = strongestFavourites(games);
  if (!gap && favs.length === 0) return null;
  return (
    <section aria-labelledby="today-wk" className="space-y-3" data-testid="today-worth-knowing">
      <SectionHead id="today-wk" title="Worth knowing" />
      <div className="grid gap-3 md:grid-cols-2">
        {gap && (
          <Card testId="today-gap">
            <p className={EYEBROW}>Biggest model v market gap</p>
            <p className="font-semibold text-ink-900">
              {gap.game.slug ? <Link to={matchPath(gap.game.slug)} className="hover:underline">{gap.game.home} v {gap.game.away}</Link> : `${gap.game.home} v ${gap.game.away}`}
              {gap.game.time ? `, ${gap.game.time}` : ''}
            </p>
            <p className="text-sm text-ink-700">
              Market: {outcomeLabel(gap.game, gap.outcome)} {pct(gap.market)}. Our model: {outcomeLabel(gap.game, gap.outcome)} {pct(gap.model)}.
            </p>
          </Card>
        )}
        {favs.length > 0 && (
          <Card testId="today-favourites">
            <p className={EYEBROW}>Strongest favourites</p>
            <p className="text-sm text-ink-700">
              {favs.map((f, i) => (
                <span key={f.game.fixtureId}>
                  {i > 0 && ' · '}
                  <span className="text-ink-900 font-medium">{f.team} {pct(f.p)}</span> v {f.opponent}
                </span>
              ))}
            </p>
            {favs.some((f) => f.source === 'model') && <p className="text-xs text-ink-500">Our model where there is no market price yet.</p>}
          </Card>
        )}
      </div>
      <p className="text-xs text-ink-500">Not a tip, just the probabilities: the betting market&rsquo;s, with the bookmakers&rsquo; margin removed, and our model&rsquo;s.</p>
    </section>
  );
}

// ---- Elsewhere -----------------------------------------------------------------------

function Elsewhere({ day }: { day: string }) {
  const load = useLoad(`nfl:${day}`, () => loadNflUpcoming());
  if (load.status !== 'ok' || !load.data) return null;
  const tomorrow = addIsoDays(day, 1);
  const on = load.data.games.filter((g) => g.gameday === day || g.gameday === tomorrow);
  if (on.length === 0) return null;
  const when = on.some((g) => g.gameday === day) ? 'today' : 'tomorrow';
  const first = on.filter((g) => g.kickoff_at).map((g) => g.kickoff_at!).sort()[0];
  const firstUk = first ? new Date(first).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : null;
  const games = on.filter((g) => g.gameday === (when === 'today' ? day : tomorrow)).length;
  return (
    <section aria-labelledby="today-else" className="space-y-1" data-testid="today-elsewhere">
      <h2 id="today-else" className="font-display uppercase tracking-wide text-lg text-ink-900">Elsewhere</h2>
      <p className="text-sm text-ink-700">
        NFL: Week {on[0].week} is {when}, {games} game{games === 1 ? '' : 's'}{firstUk ? ` from ${firstUk} UK` : ''}.{' '}
        <Link to="/nfl/fixtures" className={TAP_LINK}>Games and our picks</Link>
      </p>
    </section>
  );
}

// ---- Page -------------------------------------------------------------------------------

export default function TodayPage({ initialData }: { initialData?: { page: DayPage; now?: string } } = {}) {
  const [params] = useSearchParams();
  const today = initialData?.page.day ?? ukToday();
  const asked = params.get('date');
  const day = asked && DATE_RE.test(asked) ? asked : today;
  const isToday = day === today;
  const [prefs] = useState(readPrefs);
  const [now, setNow] = useState(() => (initialData?.now ? Date.parse(initialData.now) : Date.now()));
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);

  const [page, setPage] = useState<{ day: string; data: DayPage | null; error: boolean }>(() => ({
    day, data: initialData && initialData.page.day === day ? initialData.page : null, error: false,
  }));
  if (page.day !== day) setPage({ day, data: null, error: false });

  useEffect(() => {
    if (initialData && initialData.page.day === day) return;
    let live = true;
    getDayPage(day)
      .then((data) => { if (live) { setPage({ day, data, error: false }); setFetchedAt(Date.now()); } })
      .catch(() => { if (live) setPage((p) => (p.day === day ? { ...p, error: true } : p)); });
    return () => { live = false; };
  }, [day, initialData]);

  // The clock, for "in play": a minute's resolution is plenty.
  useEffect(() => {
    if (!isToday) return;
    const t = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(t);
  }, [isToday]);

  // Scores as they reach us: every two minutes while a game is in play.
  const data = page.day === day ? page.data : null;
  const polling = isToday && !!data && data.games.some((g) => inPlay(g, day, now));
  useEffect(() => {
    if (!polling) return;
    const t = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      getDayPage(day).then((d) => { setPage({ day, data: d, error: false }); setFetchedAt(Date.now()); }).catch(() => undefined);
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [polling, day]);

  const fpl = useLoad<FplToday>(isToday ? `fpl:${day}` : null, getFplToday);
  const sentence = data ? daySentence(day, data.games) : null;
  const quiet = data ? isQuietDay(data.games) : false;
  const followed = useMemo(
    () => new Set([prefs.club, ...prefs.followed].filter((c): c is NonNullable<typeof c> => !!c).map((c) => c.teamId)),
    [prefs],
  );
  const live = fpl.status === 'ok' ? liveGameweek(fpl.data.open) : null;

  useDocumentHead({
    title: isToday ? 'Today: football, TV and FPL' : `${longDate(day, true)}: football and TV`,
    description: sentence ?? 'Today’s football: every game with UK TV, our model’s and the market’s favourite, results so far, FPL deadline, team news and price changes.',
    path: '/today',
  });

  const updated = fetchedAt == null ? null : new Date(fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

  return (
    <div className="space-y-8" data-testid="today-page" data-layout={data ? (quiet ? 'quiet' : 'match-day') : 'loading'}>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5 min-w-0">
          <p className="font-mono text-xs uppercase tracking-widest text-amber-700">
            {isToday ? 'Today' : day < today ? 'Earlier' : 'Coming up'}
            {isToday && updated ? ` · updated ${updated}` : ''}
          </p>
          <h1 className="font-display uppercase tracking-wide text-3xl sm:text-5xl text-ink-900">{dayHeading(day)}</h1>
          <p className="text-sm sm:text-base text-ink-700 max-w-prose" data-testid="today-lead">
            {sentence ?? (page.error ? 'The day’s games didn’t load. Try again shortly.' : ' ')}
            {live != null && isToday ? ` FPL Gameweek ${live} is live.` : ''}
          </p>
        </div>
        <nav aria-label="Other days" className="flex gap-2">
          <Link to={addIsoDays(day, -1) === today ? '/today' : `/today?date=${addIsoDays(day, -1)}`} className={`${BUTTON} border-chalk-300 bg-white text-ink-900 hover:bg-chalk-200`}>&larr; Yesterday</Link>
          <Link to={addIsoDays(day, 1) === today ? '/today' : `/today?date=${addIsoDays(day, 1)}`} className={`${BUTTON} border-chalk-300 bg-white text-ink-900 hover:bg-chalk-200`}>Tomorrow &rarr;</Link>
        </nav>
      </header>

      {isToday && <YoursToday prefs={prefs} day={day} games={data?.games ?? []} fpl={fpl} quiet={quiet} />}

      {!data && !page.error && <Card><Skeleton rows={6} /></Card>}

      {data && (
        <>
          <OnToday page={data} title={!isToday ? 'Games' : quiet && data.games.length > 0 && data.games.every((g) => (g.time ?? '') >= '17:00') ? 'Tonight' : 'On today'} now={now} followed={followed} />
          {quiet ? (
            <>
              {isToday && (data.games.some(hasScore) ? <ResultsSoFar page={data} /> : null)}
              <YesterdayResults day={day} />
              {isToday && <FplTodaySection fpl={fpl} page={data} />}
              <WorthKnowing games={data.games} />
              <ComingUp page={data} />
            </>
          ) : (
            <>
              {(isToday || data.games.some(hasScore)) && <ResultsSoFar page={data} />}
              {isToday && <FplTodaySection fpl={fpl} page={data} />}
              <WorthKnowing games={data.games} />
            </>
          )}
          {isToday && <Elsewhere day={day} />}
        </>
      )}
    </div>
  );
}

function ComingUp({ page }: { page: DayPage }) {
  const lines = comingUp(page.ahead);
  if (lines.length === 0) return null;
  const weekday = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  return (
    <section aria-labelledby="today-next" className="space-y-2" data-testid="today-coming-up">
      <SectionHead id="today-next" title="Coming up" />
      <ul className="space-y-1 text-sm text-ink-700">
        {lines.map((l) => (
          <li key={l.date}>
            <Link to={`/today?date=${l.date}`} className={`${LINK} font-medium`}>{weekday(l.date)}</Link>: {l.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
