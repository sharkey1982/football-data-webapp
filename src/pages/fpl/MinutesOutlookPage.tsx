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

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { formatRefreshDate } from '../../lib/formatDate';
import {
  getMinutesOutlook, getOutlookTeams, ruleText, shortOpponents,
  type Outlook, type OutlookCell, type OutlookPlayer, type OutlookTeam,
} from '../../lib/minutesOutlookApi';

type Mode = 'start' | 'minutes';
const POS_ORDER: OutlookPlayer['position'][] = ['GKP', 'DEF', 'MID', 'FWD', '?'];
const POS_LABEL: Record<string, string> = { GKP: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards', '?': 'Other' };
/** Shown by default: anyone with at least this start chance in some gameweek. */
const FRINGE = 0.1;

function cellValue(c: OutlookCell, mode: Mode): number {
  // Per fixture, so a double gameweek shades like a single one.
  return mode === 'start' ? c.start / c.fixtures : c.minutes / (90 * c.fixtures);
}

function Cell({ c, mode }: { c: OutlookCell | undefined; mode: Mode }) {
  if (!c) return <td className="px-1 py-1 text-center text-ink-500 text-xs">&ndash;</td>;
  const v = Math.max(0, Math.min(1, cellValue(c, mode)));
  const out = c.availability === 0;
  const flagged = c.availability != null && c.availability > 0 && c.availability < 0.999;
  const label = mode === 'start' ? `${Math.round((c.start / c.fixtures) * 100)}` : `${Math.round(c.minutes)}`;
  const why = ruleText(c.rule, c.availability);
  const title = [
    c.opponents,
    mode === 'start' ? `${Math.round((c.start / c.fixtures) * 100)}% to start` : `${Math.round(c.minutes)} expected minutes`,
    c.fixtures > 1 ? `${c.fixtures} fixtures` : null,
    why,
  ].filter(Boolean).join(' · ');
  return (
    <td className="px-0.5 py-0.5" title={title}>
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

  const shown = useMemo(() => {
    if (!outlook) return [];
    return outlook.players.filter((p) => everyone || [...p.cells.values()].some((c) => c.start / c.fixtures >= FRINGE));
  }, [outlook, everyone]);

  const groups = useMemo(() => POS_ORDER.map((pos) => ({
    pos,
    players: shown.filter((p) => p.position === pos).sort((a, b) => b.totalMinutes - a.totalMinutes),
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
                          <span><PlayerName p={p} /> <span className="text-ink-500">{p.position}</span></span>
                          <span className="tabular-nums text-ink-700">{startAt(p, first)}% &rarr; {startAt(p, last)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </section>
          )}

          <div className="overflow-x-auto border border-chalk-300 rounded-lg bg-white" data-testid="outlook-grid">
            <table className="text-sm border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white text-left px-2 py-1 font-medium text-ink-700 min-w-28">Player</th>
                  {outlook.gameweeks.map((gw) => (
                    <th key={gw} className="px-0.5 py-1 font-medium text-ink-700 text-center">
                      <div className="text-xs">GW{gw}</div>
                      <div className="text-[10px] font-normal text-ink-500 whitespace-nowrap">{shortOpponents(outlook.opponents.get(gw) ?? '')}</div>
                    </th>
                  ))}
                  <th className="px-2 py-1 font-medium text-ink-700 text-center" title="Start chance in the last gameweek shown minus the first">Change</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <GroupRows key={g.pos} label={POS_LABEL[g.pos]} players={g.players} gameweeks={outlook.gameweeks} mode={mode} span={outlook.gameweeks.length + 2} />
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-ink-500 max-w-prose">
            {mode === 'start' ? 'Numbers are the % chance of starting' : 'Numbers are expected minutes'}; darker is more.
            <span className="text-amber-600"> &bull;</span> marks a player not certain to be available (doubt, returning, or
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

function GroupRows({ label, players, gameweeks, mode, span }: {
  label: string; players: OutlookPlayer[]; gameweeks: number[]; mode: Mode; span: number;
}) {
  return (
    <>
      <tr>
        <td colSpan={span} className="sticky left-0 bg-chalk-100 px-2 py-1 text-xs font-mono uppercase tracking-widest text-ink-500 border-t border-chalk-300">{label}</td>
      </tr>
      {players.map((p) => (
        <tr key={p.fpl_player_id}>
          <td className="sticky left-0 z-10 bg-white px-2 py-0.5 whitespace-nowrap border-t border-chalk-200" title={p.news ?? undefined}>
            <PlayerName p={p} />
          </td>
          {gameweeks.map((gw) => <Cell key={gw} c={p.cells.get(gw)} mode={mode} />)}
          <td className="px-2 text-center text-xs tabular-nums"><Trend t={p.trend} /></td>
        </tr>
      ))}
    </>
  );
}
