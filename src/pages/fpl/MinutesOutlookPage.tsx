// ============================================================================
// src/pages/fpl/MinutesOutlookPage.tsx
//
// Minutes Outlook (Chris, 5 Oct 2026: "I want to see 2nd choice players
// dropping out over time for returning first choice players").
//
// One club at a time: every player's start chance (or expected minutes)
// for each of the next 10 gameweeks, shaded, with the availability reason
// on each cell. "Gaining a place" / "Losing minutes" lift out the players
// whose chance changes most across the window -- the returner and the
// stand-in he displaces.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { formatRefreshDate } from '../../lib/formatDate';
import {
  compareByRole, getMinutesOutlook, getOutlookTeams, ruleText, shortOpponents,
  type Outlook, type OutlookActual, type OutlookCell, type OutlookPlayer, type OutlookTeam,
} from '../../lib/minutesOutlookApi';

type Mode = 'start' | 'minutes';
const POS_ORDER: OutlookPlayer['position'][] = ['GKP', 'DEF', 'MID', 'FWD', '?'];
const POS_LABEL: Record<string, string> = { GKP: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards', '?': 'Other' };
/** Shown by default: anyone with at least this start chance in some gameweek. */
const FRINGE = 0.1;

/** The numbers shown: expected (default) or if fit. null = nothing to show (out all window). */
function shownValues(c: OutlookCell, fit: boolean): { start: number; minutes: number } | null {
  if (!fit) return { start: c.start, minutes: c.minutes };
  return c.fitStart == null || c.fitMinutes == null ? null : { start: c.fitStart, minutes: c.fitMinutes };
}

function Cell({ c, mode, fit, divider = false }: { c: OutlookCell | undefined; mode: Mode; fit: boolean; divider?: boolean }) {
  const edge = divider ? ' border-l-2 border-ink-500/40 pl-1' : '';
  if (!c) return <td className={`px-1 py-1 text-center text-ink-500 text-xs${edge}`}>&ndash;</td>;
  const shown = shownValues(c, fit);
  // If fit, an injured player still shows his value (with the dot); only
  // "out for the whole window" stays out.
  const out = shown == null || (!fit && c.availability === 0);
  const sv = shown ?? { start: 0, minutes: 0 };
  // Per fixture, so a double gameweek shades like a single one.
  const v = Math.max(0, Math.min(1, mode === 'start' ? sv.start / c.fixtures : sv.minutes / (90 * c.fixtures)));
  const flagged = c.availability != null && c.availability < 0.999 && (fit || c.availability > 0);
  const label = mode === 'start' ? `${Math.round((sv.start / c.fixtures) * 100)}` : `${Math.round(sv.minutes)}`;
  const why = ruleText(c.rule, c.availability);
  const title = [
    c.opponents,
    mode === 'start' ? `${Math.round((sv.start / c.fixtures) * 100)}% to start${fit ? ' if fit' : ''}` : `${Math.round(sv.minutes)} ${fit ? 'minutes if fit' : 'expected minutes'}`,
    c.fixtures > 1 ? `${c.fixtures} fixtures` : null,
    why,
  ].filter(Boolean).join(' · ');
  return (
    <td className={`px-0.5 py-0.5${edge}`} title={title}>
      <div
        className={`rounded text-center text-xs tabular-nums leading-7 min-w-10 ${v > 0.55 ? 'text-chalk-100' : 'text-ink-900'}`}
        style={{ backgroundColor: out ? 'transparent' : `color-mix(in srgb, var(--color-pitch-600) ${Math.round(v * 100)}%, transparent)` }}
      >
        {out ? (
          <span className="text-loss-700 font-medium">out</span>
        ) : (
          <>
            {flagged && <span className="text-amber-600" aria-label="availability doubt">&bull;</span>}
            {label}
            {c.fixtures > 1 && <sup className="ml-px">&times;{c.fixtures}</sup>}
          </>
        )}
      </div>
    </td>
  );
}

/** What actually happened, in grey so it reads apart from the green projections. */
function ActualCell({ a, gw }: { a: OutlookActual | undefined; gw: number }) {
  if (!a) return <td className="px-0.5 py-0.5 text-center text-ink-500 text-xs" title={`GW${gw}: no record (not at the club yet)`}>&ndash;</td>;
  const out = !a.available && a.minutes === 0;
  const what = out ? 'Injured or suspended' : a.minutes === 0 ? 'Unused' : a.started ? `Started, ${a.minutes} minutes` : `Came off the bench, ${a.minutes} minutes`;
  const v = Math.min(1, a.minutes / 90);
  return (
    <td className="px-0.5 py-0.5" title={`GW${gw} actual: ${what}`}>
      <div
        className={`rounded text-center text-xs tabular-nums leading-7 min-w-10 ${v > 0.55 ? 'text-chalk-100' : 'text-ink-700'}`}
        style={{ backgroundColor: out ? 'transparent' : `color-mix(in srgb, var(--color-ink-500) ${Math.round(v * 70)}%, transparent)` }}
      >
        {out ? <span className="text-loss-700 font-medium">out</span> : <>{a.minutes}{a.minutes > 0 && !a.started && <sup className="ml-px">s</sup>}</>}
      </div>
    </td>
  );
}

function Trend({ t }: { t: number }) {
  const pts = Math.round(t * 100);
  if (Math.abs(pts) < 3) return <span className="text-ink-500">&ndash;</span>;
  return <span className={pts > 0 ? 'text-pitch-700 font-medium' : 'text-loss-700 font-medium'}>{pts > 0 ? `+${pts}` : `−${-pts}`}</span>;
}

function PlayerName({ p }: { p: OutlookPlayer }) {
  return p.slug ? (
    <Link to={`/fpl/players/${p.slug}`} className="text-pitch-800 underline underline-offset-2">{p.web_name}</Link>
  ) : <>{p.web_name}</>;
}

export default function MinutesOutlookPage() {
  const [params, setParams] = useSearchParams();
  const [teams, setTeams] = useState<OutlookTeam[] | null>(null);
  const [outlook, setOutlook] = useState<Outlook | null>(null);
  const [error, setError] = useState(false);
  const [mode, setMode] = useState<Mode>('start');
  const [everyone, setEveryone] = useState(false);
  const [fit, setFit] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  useDocumentHead({
    title: 'Minutes Outlook — who plays over the next 10 gameweeks',
    description: 'Each club’s players gameweek by gameweek: projected start chance and minutes, with injuries, return dates and doubts, so you can see who loses their place when a first-choice player returns.',
    path: '/fpl/minutes',
  });

  useEffect(() => {
    getOutlookTeams().then(setTeams).catch(() => { setTeams([]); setError(true); });
  }, []);

  const team = useMemo(() => {
    if (!teams?.length) return null;
    const slug = params.get('team');
    return teams.find((t) => t.slug === slug) ?? teams[0];
  }, [teams, params]);

  useEffect(() => {
    if (!team) return;
    let live = true;
    // Cleared after the await, not synchronously in the effect body.
    getMinutesOutlook(team.team_id)
      .then((o) => { if (live) { setOutlook(o); setError(false); } })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [team]);

  // On a narrow screen the played columns would fill the view: open with the
  // last two played gameweeks and the projections in sight (swipe back for more).
  useEffect(() => {
    const el = gridRef.current;
    if (!el || !outlook) return;
    const firstProj = el.querySelector<HTMLElement>('th[data-first-proj]');
    const played = el.querySelectorAll<HTMLElement>('th[data-played]');
    const sticky = el.querySelector<HTMLElement>('th')?.offsetWidth ?? 0;
    if (!firstProj || played.length < 3) return;
    el.scrollLeft = Math.max(0, played[played.length - 2].offsetLeft - sticky);
  }, [outlook, mode, everyone, fit]);

  const shown = useMemo(() => {
    if (!outlook) return [];
    return outlook.players.filter((p) => everyone || [...p.cells.values()].some((c) => c.start / c.fixtures >= FRINGE));
  }, [outlook, everyone]);

  const groups = useMemo(() => POS_ORDER.map((pos) => ({
    pos,
    // By playing role (left to right), so rivals for the same spot sit together.
    players: shown.filter((p) => p.position === pos).sort(compareByRole),
  })).filter((g) => g.players.length > 0), [shown]);

  const gaining = useMemo(() => (outlook?.players ?? []).filter((p) => p.trend >= 0.15).sort((a, b) => b.trend - a.trend).slice(0, 6), [outlook]);
  // A returner's gain is usually spread over several team-mates, so the
  // losses are smaller than the gain: a lower bar for "losing".
  const losing = useMemo(() => (outlook?.players ?? []).filter((p) => p.trend <= -0.03).sort((a, b) => a.trend - b.trend).slice(0, 6), [outlook]);

  const first = outlook?.gameweeks[0], last = outlook?.gameweeks[outlook.gameweeks.length - 1];
  const startAt = (p: OutlookPlayer, gw: number | undefined) => {
    const c = gw == null ? undefined : p.cells.get(gw);
    return c ? Math.round((c.start / c.fixtures) * 100) : 0;
  };

  return (
    <article className="space-y-5">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">Fantasy &middot; Predict</p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Minutes Outlook</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Who the model expects to play for each club over the next 10 gameweeks. Injured players come back on their
          expected return date (75%, then 90%, then fit), a doubt counts for the next gameweek only, and a player&rsquo;s
          chance of starting comes from the matches he was fit for &mdash; so you can see a first-choice player taking
          minutes back from his stand-in.
        </p>
      </header>

      <div className="flex flex-wrap gap-3 items-end">
        <label className="flex flex-col gap-1 text-sm text-ink-700">Club
          <select
            className="min-h-11 border border-chalk-300 rounded px-2 bg-white text-base text-ink-900"
            value={team?.slug ?? ''}
            onChange={(e) => setParams({ team: e.target.value }, { replace: true })}
            aria-label="Club"
          >
            {(teams ?? []).map((t) => <option key={t.team_id} value={t.slug ?? ''}>{t.team_name}</option>)}
          </select>
        </label>
        <div className="flex rounded border border-chalk-300 overflow-hidden" role="group" aria-label="Show">
          {([['start', 'Start chance'], ['minutes', 'Minutes']] as [Mode, string][]).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k}
              className={`min-h-11 px-3 text-sm ${mode === k ? 'bg-pitch-800 text-chalk-100' : 'bg-white text-ink-700 hover:bg-chalk-200'}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700 min-h-11" title="Show each player's chance and minutes assuming he is available">
          <input type="checkbox" className="h-5 w-5" checked={fit} onChange={(e) => setFit(e.target.checked)} />
          If fit
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700 min-h-11">
          <input type="checkbox" className="h-5 w-5" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
          Include fringe players
        </label>
      </div>

      {error && <p className="text-loss-700 text-sm">The outlook couldn&rsquo;t be loaded. Try again shortly.</p>}
      {!outlook && !error && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {outlook && outlook.players.length === 0 && !error && (
        <p className="text-ink-700 text-sm">No projections for {team?.team_name ?? 'this club'} in the next 10 gameweeks yet.</p>
      )}

      {outlook && outlook.players.length > 0 && (
        <>
          {(gaining.length > 0 || losing.length > 0) && (
            <section className="grid sm:grid-cols-2 gap-3" data-testid="outlook-changes">
              {[['Gaining a place', gaining], ['Losing minutes', losing]].map(([title, list]) => (
                <div key={title as string} className="border border-chalk-300 rounded-lg bg-white p-3">
                  <h2 className="font-display uppercase tracking-wide text-sm text-ink-900">{title as string}</h2>
                  <p className="text-xs text-ink-500 mt-0.5">Start chance, GW{first} &rarr; GW{last}</p>
                  {(list as OutlookPlayer[]).length === 0 ? <p className="text-sm text-ink-500 mt-2">No big changes.</p> : (
                    <ul className="mt-2 space-y-1 text-sm">
                      {(list as OutlookPlayer[]).map((p) => (
                        <li key={p.fpl_player_id} className="flex justify-between gap-2">
                          <span><PlayerName p={p} /> <span className="text-ink-500">{p.role ?? p.position}</span></span>
                          <span className="tabular-nums text-ink-700">{startAt(p, first)}% &rarr; {startAt(p, last)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )}

          <div ref={gridRef} className="overflow-x-auto border border-chalk-300 rounded-lg bg-white" data-testid="outlook-grid">
            <table className="text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white text-left px-2 py-1 font-medium text-ink-700 min-w-28">Player</th>
                  {outlook.pastGameweeks.map((gw) => (
                    <th key={`a${gw}`} data-played="" className="px-0.5 py-1 font-medium text-ink-500 text-center">
                      <div className="text-xs">GW{gw}</div>
                      <div className="text-[10px] font-normal italic">played</div>
                    </th>
                  ))}
                  {outlook.gameweeks.map((gw, j) => (
                    <th key={gw} data-first-proj={j === 0 ? '' : undefined} className={`px-0.5 py-1 font-medium text-ink-700 text-center${j === 0 && outlook.pastGameweeks.length > 0 ? ' border-l-2 border-ink-500/40 pl-1' : ''}`}>
                      <div className="text-xs">GW{gw}</div>
                      <div className="text-[10px] font-normal text-ink-500 whitespace-nowrap">{shortOpponents(outlook.opponents.get(gw) ?? '')}</div>
                    </th>
                  ))}
                  <th className="px-2 py-1 font-medium text-ink-700 text-center" title="Start chance in the last gameweek shown minus the first">Change</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.pos} label={POS_LABEL[g.pos]} players={g.players} gameweeks={outlook.gameweeks} mode={mode} fit={fit} span={outlook.pastGameweeks.length + outlook.gameweeks.length + 2} pastGameweeks={outlook.pastGameweeks} />
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-ink-500 max-w-prose">
            {mode === 'start' ? 'Numbers are the % chance of starting' : 'Numbers are expected minutes'}
            {fit ? ' if the player is fit' : ''}; darker is more.
            {fit
              ? ' "If fit" divides out the chance of being available, so an injured player shows what he would get once back; expected points still use the normal view, which allows for him not being back yet.'
              : ''}
            Grey columns are what actually happened (minutes; <sup>s</sup> = came off the bench;{' '}
            <span className="text-loss-700">out</span> = injured or suspended at the time); green columns are the projections.
            Players are listed by playing role (left to right), so the ones competing for the same spot sit
            together. <span className="text-amber-600">&bull;</span> marks a player not certain to be available (doubt, returning, or
            injured with no return date); <span className="text-loss-700">out</span> means not available. Hover a cell for
            the opponent and the reason. A club&rsquo;s start chances add up to about eleven a match, so a returning
            player&rsquo;s gain is someone else&rsquo;s loss.
            {outlook.generatedAt && <> Projections updated {formatRefreshDate(outlook.generatedAt)}.</>}
          </p>
        </>
      )}
    </article>
  );
}

function GroupRows({ label, players, gameweeks, pastGameweeks, mode, fit, span }: {
  label: string; players: OutlookPlayer[]; gameweeks: number[]; pastGameweeks: number[]; mode: Mode; fit: boolean; span: number;
}) {
  return (
    <>
      <tr>
        {/* The label itself is sticky: a sticky full-width cell scrolls away with the grid. */}
        <td colSpan={span} className="bg-chalk-100 px-2 py-1 text-xs font-mono uppercase tracking-widest text-ink-500 border-t border-chalk-300">
          <span className="sticky left-2">{label}</span>
        </td>
      </tr>
      {players.map((p, i) => (
        <tr key={p.fpl_player_id}>
          {/* A darker line where the role changes: each block is one spot's contenders. */}
          <td className={`sticky left-0 z-10 bg-white px-2 py-0.5 whitespace-nowrap border-t ${i > 0 && p.role !== players[i - 1].role ? 'border-ink-500/50' : 'border-chalk-200'}`} title={p.news ?? undefined}>
            <span className="inline-block w-9 font-mono text-[11px] text-ink-500" title={p.role ? 'Playing role in the projections' : 'No specific role known'}>
              {p.role && p.role !== 'GK' ? p.role : p.role ? '' : '\u2013'}
            </span>
            <PlayerName p={p} />
          </td>
          {pastGameweeks.map((gw) => <ActualCell key={`a${gw}`} a={p.actual.get(gw)} gw={gw} />)}
          {gameweeks.map((gw, j) => <Cell key={gw} c={p.cells.get(gw)} mode={mode} fit={fit} divider={j === 0 && pastGameweeks.length > 0} />)}
          <td className="px-2 text-center text-xs tabular-nums"><Trend t={p.trend} /></td>
        </tr>
      ))}
    </>
  );
}
