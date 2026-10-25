// ============================================================================
// src/pages/fpl/FplFixturesPage.tsx
//
// /fpl/fixtures -- every Premier League side's next gameweeks, coloured by
// expected goals (attack or defence), with the League Cup, FA Cup and
// European games in midweek columns, international breaks as a band, and a
// rest badge when a side played 3 or fewer days before. Logic: fplFixturesGrid.ts
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { TeamLink } from '../../components/EntityLinks';
import { useTeamSlugs } from '../../lib/teamSlugs';
import { friendlyError } from '../../lib/errorMessage';
import {
  COMP, band, buildColumns, buildRows, daysBetween, getFplFixturesGrid, lastMidweek, nextMidweek,
  type CupCell, type GridData, type PlCell, type Range, type View,
} from '../../lib/fplFixturesGrid';

const BAND_CLS = ['bg-chalk-100 text-ink-500', 'bg-red-200 text-red-950', 'bg-orange-100 text-orange-950', 'bg-chalk-200 text-ink-900', 'bg-emerald-200 text-emerald-950', 'bg-emerald-500 text-white'];
const fmtDay = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const fmtShort = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekday = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });

function Toggle<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-chalk-300 bg-white p-0.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={`px-3 py-1 text-sm rounded ${value === v ? 'bg-pitch-800 text-white' : 'text-ink-700 hover:bg-chalk-100'}`}>{l}</button>
      ))}
    </div>
  );
}

export default function FplFixturesPage() {
  useDocumentHead({
    title: 'FPL fixtures: gameweek difficulty with cup and European games',
    description: 'Every Premier League side’s next FPL gameweeks coloured by expected goals, with League Cup, FA Cup and European midweek games, short rest and international breaks.',
    path: '/fpl/fixtures',
  });
  const slugs = useTeamSlugs();
  const [data, setData] = useState<GridData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>('attack');
  const [range, setRange] = useState<Range>('next6');
  const [sort, setSort] = useState<'az' | 'ease'>('az');
  const [showMid, setShowMid] = useState(true);

  useEffect(() => {
    let live = true;
    getFplFixturesGrid().then((d) => { if (live) setData(d); }).catch((e) => { if (live) setErr(friendlyError(e, 'the fixtures')); });
    return () => { live = false; };
  }, []);

  const cols = useMemo(() => (data ? buildColumns(data, range).filter((c) => showMid || c.kind !== 'mid') : []), [data, range, showMid]);
  const rows = useMemo(() => {
    if (!data) return [];
    const r = buildRows(data, cols, view);
    return sort === 'az' ? r.sort((a, b) => a.team.name.localeCompare(b.team.name)) : r.sort((a, b) => b.ease - a.ease || a.team.name.localeCompare(b.team.name));
  }, [data, cols, view, sort]);
  const mid = useMemo(() => (data ? nextMidweek(data) : null), [data]);
  const last = useMemo(() => (data ? lastMidweek(data) : []), [data]);

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/fpl/start" className="hover:underline">FPL</Link> &middot; <Link to="/fpl/start/predict" className="hover:underline">Predict</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Fixtures</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Each side’s next gameweeks, coloured by the goals they are expected to score (attack) or concede (defence),
          with cup and European games in between. A <span className="font-mono text-xs bg-amber-100 text-amber-900 rounded px-1">3d</span> badge
          means that side played 3 or fewer days before, cup games included.
        </p>
      </header>

      <div className="flex flex-wrap gap-2 items-center">
        <Toggle label="Colour by" value={view} onChange={setView} options={[['attack', 'Attack'], ['defence', 'Defence']]} />
        <Toggle label="Range" value={range} onChange={setRange} options={[['gw', 'Gameweek'], ['next6', 'Next 6'], ['month', 'Month']]} />
        <Toggle label="Sort" value={sort} onChange={setSort} options={[['az', 'A–Z'], ['ease', 'Best next 3']]} />
        <label className="inline-flex items-center gap-1.5 text-sm text-ink-700">
          <input type="checkbox" checked={showMid} onChange={(e) => setShowMid(e.target.checked)} /> Midweek games
        </label>
      </div>

      {err && <p className="text-sm text-red-800">{err}</p>}
      {!data && !err && <p className="text-sm text-ink-500">Loading fixtures…</p>}

      {data && (
        <div className="overflow-x-auto rounded-lg border border-chalk-300 bg-white">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-chalk-100 text-ink-700">
                <th scope="col" className="sticky left-0 z-10 bg-chalk-100 text-left px-2 py-2 font-semibold">Team</th>
                {cols.map((c) => (
                  <th key={c.key} scope="col" className={`px-1.5 py-2 font-semibold whitespace-nowrap ${c.kind === 'gw' ? 'text-center' : 'text-center text-ink-500 font-normal italic'}`}>
                    {c.kind === 'gw' && <>GW{c.gw}<div className="font-normal text-[10px] text-ink-500">{fmtShort(c.first)}{c.last !== c.first ? `–${fmtShort(c.last)}` : ''}</div></>}
                    {c.kind === 'mid' && <>Midweek<div className="text-[10px]">{fmtShort(c.from)}{c.to !== c.from ? `–${fmtShort(c.to)}` : ''}</div></>}
                    {c.kind === 'break' && <>Break<div className="text-[10px]">{fmtShort(c.from)}–{fmtShort(c.to)}</div></>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.team.fpl_team_id} className="border-t border-chalk-200">
                  <th scope="row" className="sticky left-0 z-10 bg-white text-left px-2 py-1.5 font-semibold text-ink-900 whitespace-nowrap">
                    <TeamLink slug={slugs.get(r.team.team_id)} from="/fpl/fixtures">{r.team.short}</TeamLink>
                    <span className="hidden sm:inline font-normal text-ink-500"> {r.team.name}</span>
                  </th>
                  {cols.map((c) => {
                    if (c.kind === 'break') {
                      return i === 0 ? (
                        <td key={c.key} rowSpan={rows.length} className="bg-chalk-200 text-ink-500 text-center align-middle px-1 [writing-mode:vertical-rl] rotate-180 font-mono text-[10px] uppercase tracking-widest">
                          International break
                        </td>
                      ) : null;
                    }
                    const cell = r.cells[c.key] ?? [];
                    if (c.kind === 'mid') {
                      const cups = cell as CupCell[];
                      return (
                        <td key={c.key} className="px-1 py-1 bg-chalk-100/60 align-middle">
                          {cups.map((x, k) => (
                            <div key={k} title={`${COMP[x.comp]?.name ?? 'Cup'} ${x.home ? 'v' : 'at'} ${x.opp}, ${fmtDay(x.date)}`}
                              className="whitespace-nowrap rounded bg-indigo-100 text-indigo-950 px-1 py-0.5 my-0.5 text-[10px]">
                              <b>{COMP[x.comp]?.short ?? 'Cup'}</b> {x.home ? 'v' : 'at'} {x.opp} · {weekday(x.date)}
                            </div>
                          ))}
                        </td>
                      );
                    }
                    const pls = cell as PlCell[];
                    if (!pls.length) return <td key={c.key} className="px-1 py-1 text-center text-ink-500 bg-chalk-100">Blank</td>;
                    return (
                      <td key={c.key} className="px-1 py-1 align-middle">
                        <div className="flex flex-col gap-0.5">
                          {pls.map((p, k) => {
                            const xg = view === 'attack' ? p.xgFor : p.xgAgainst;
                            const b = p.finished ? 0 : band(xg, view);
                            return (
                              <div key={k} className={`relative min-w-[4.5rem] rounded px-1.5 py-1 text-center ${BAND_CLS[b]}`}
                                title={`${p.home ? 'Home' : 'Away'} v ${p.opp?.name ?? '?'}${p.date ? `, ${fmtDay(p.date)}` : ''}${xg != null ? `. Expected goals ${view === 'attack' ? 'for' : 'against'}: ${xg.toFixed(2)}` : ''}${p.rest != null ? `. ${p.rest} days since previous game` : ''}`}>
                                <span className="font-semibold">{p.opp?.short ?? '?'}</span> <span className="opacity-75">({p.home ? 'H' : 'A'})</span>
                                <div className="text-[10px] opacity-80">{p.score ?? (xg != null ? xg.toFixed(1) : '–')}</div>
                                {p.rest != null && p.rest <= 3 && !p.finished && (
                                  <span className="absolute -top-1 -right-1 rounded bg-amber-100 text-amber-900 border border-amber-300 px-0.5 text-[9px] font-mono">{p.rest}d</span>
                                )}
                              </div>
                            );
                          })}
                          {pls.length > 1 && <span className="text-[9px] text-pitch-800 font-semibold text-center">Double</span>}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-700">
          <span>{view === 'attack' ? 'Expected goals for:' : 'Expected goals against:'}</span>
          {[1, 2, 3, 4, 5].map((b) => <span key={b} className={`rounded px-2 py-0.5 ${BAND_CLS[b]}`}>{b === 1 ? 'Hardest' : b === 5 ? 'Easiest' : ' '}</span>)}
          <span className="text-ink-500">From betting markets where priced, otherwise our model. Played games show the score.</span>
        </div>
      )}

      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-chalk-300 bg-white p-4">
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Midweek {mid ? `· ${fmtShort(mid.from)}${mid.to !== mid.from ? `–${fmtShort(mid.to)}` : ''}` : ''}</h2>
            {!mid && <p className="text-sm text-ink-500 mt-2">No cup or European games for Premier League sides coming up.</p>}
            {mid && (
              <ul className="mt-2 space-y-3 text-sm">
                {mid.games.map((g) => (
                  <li key={g.fixture_id}>
                    <p className="text-ink-900"><b>{COMP[g.league_id]?.short}</b> {g.home_name} v {g.away_name} <span className="text-ink-500">· {fmtDay(g.d)}{g.tm ? ` ${g.tm.slice(0, 5)}` : ''}</span></p>
                    {g.sides.map((s) => (
                      <p key={s.team.team_id} className="text-xs text-ink-700 mt-0.5">
                        {s.team.short}: {s.next ? <>{daysBetween(g.d, s.next.date)} days to {s.next.home ? 'v' : 'at'} {s.next.opp?.short ?? '?'}</> : 'no PL game yet'}
                        {s.team.owned.length > 0 && <span className="text-ink-500"> · most owned: {s.team.owned.map((o) => `${o.name} ${Number(o.own).toFixed(0)}%`).join(', ')}</span>}
                      </p>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-lg border border-chalk-300 bg-white p-4">
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Last midweek: who played</h2>
            {!last.length && <p className="text-sm text-ink-500 mt-2">No cup line-ups in the last two weeks yet.</p>}
            <ul className="mt-2 space-y-3 text-sm">
              {last.map((l) => {
                const owned = (xs: typeof l.started) => xs.filter((x) => (x.own ?? 0) >= 5);
                const st = owned(l.started); const sb = owned(l.subs); const un = owned(l.unused);
                return (
                  <li key={`${l.cup.fixture_id}-${l.team.team_id}`}>
                    <p className="text-ink-900"><b>{l.team.short}</b> <span className="text-ink-500">{COMP[l.cup.league_id]?.short} {l.cup.home_team_id === l.team.team_id ? 'v' : 'at'} {l.cup.home_team_id === l.team.team_id ? l.cup.away_name : l.cup.home_name} · {fmtDay(l.cup.d)}</span></p>
                    <p className="text-xs text-ink-700 mt-0.5">
                      {st.length ? <>Started (FPL owned 5%+): {st.map((x) => x.player_name).join(', ')}. </> : 'No widely owned FPL players started. '}
                      {sb.length > 0 && <>Off the bench: {sb.map((x) => x.player_name).join(', ')}. </>}
                      {un.length > 0 && <>Unused: {un.map((x) => x.player_name).join(', ')}.</>}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </article>
  );
}
