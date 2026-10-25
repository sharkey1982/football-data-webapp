// ============================================================================
// src/pages/fpl/FplLivePage.tsx
//
// /fpl/live?id=1234567[&gw=6] (FPL Live) -- a manager's gameweek score as it
// happens: points per player, live and provisional bonus, automatic subs,
// captaincy, chips and hits, plus the points FixtureShark's deadline
// projections still expect. Polls every minute while a match is on.
// Data: public.fpl_live_entry (src/lib/fplLiveApi.ts); scoring:
// src/lib/fplLiveScore.ts. The FPL ID is shared with Rate My Team.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { trackEvent } from '../../lib/analytics';
import { fetchFplLive, shouldPoll, toScoreInput, type FplLiveData } from '../../lib/fplLiveApi';
import { fixtureState, scoreLiveTeam, type LiveFixture, type PlayerScore } from '../../lib/fplLiveScore';
import { friendlyError } from '../../lib/errorMessage';
import { readStoredFplId as readStoredId, storeFplId as storeId } from '../../lib/fplIdStore';

const POLL_MS = 60_000;
const POS: Record<number, string> = { 1: 'GKP', 2: 'DEF', 3: 'MID', 4: 'FWD' };
const CHIP: Record<string, string> = { bboost: 'Bench Boost', '3xc': 'Triple Captain', freehit: 'Free Hit', wildcard: 'Wildcard', manager: 'Assistant Manager' };


const kickoffFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const timeFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });

function fixtureLabel(f: LiveFixture): string {
  const state = fixtureState(f);
  if (state === 'not_started') return f.kickoff ? kickoffFmt.format(new Date(f.kickoff)) : 'TBC';
  if (state === 'live') return `${f.minutes}′`;
  return 'FT';
}

function Tile({ value, label, detail, testId }: { value: string; label: string; detail?: string; testId?: string }) {
  return (
    <div className="border border-chalk-300 rounded-lg bg-white px-3 py-2" data-testid={testId}>
      <p className="font-display text-2xl text-ink-900 leading-tight tabular-nums">{value}</p>
      <p className="text-xs text-ink-700">{label}</p>
      {detail && <p className="text-xs text-ink-500">{detail}</p>}
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function FplLivePage() {
  const [params, setParams] = useSearchParams();
  const urlId = params.get('id') ?? '';
  const urlGw = Number(params.get('gw')) || undefined;
  const [input, setInput] = useState(urlId || readStoredId());
  const [data, setData] = useState<FplLiveData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const reqRef = useRef(0);

  useDocumentHead({
    title: 'FPL Live — your gameweek score as it happens',
    description: 'Enter your FPL ID for your live gameweek score: bonus points as they stand, automatic subs, captaincy, chips and hits, and the points still to come.',
    path: '/fpl/live',
  });

  // First load whenever the team or gameweek in the URL changes.
  useEffect(() => {
    if (!/^\d{1,8}$/.test(urlId)) return;
    const req = ++reqRef.current;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await fetchFplLive(Number(urlId), urlGw);
        if (req !== reqRef.current) return;
        setData(d);
        setCheckedAt(new Date());
        storeId(urlId);
        trackEvent('fpl_live', { gw: d.event.id });
      } catch (e) {
        if (req !== reqRef.current) return;
        setData(null);
        setError(friendlyError(e, 'Something went wrong'));
      } finally {
        if (req === reqRef.current) setLoading(false);
      }
    })();
  }, [urlId, urlGw]);

  // Quiet refresh while matches are on; a failed one keeps the last good figures.
  const refresh = useCallback(async () => {
    if (!/^\d{1,8}$/.test(urlId)) return;
    const req = ++reqRef.current;
    try {
      const d = await fetchFplLive(Number(urlId), urlGw);
      if (req !== reqRef.current) return;
      setData(d);
      setError(null);
      setCheckedAt(new Date());
    } catch (e) {
      if (req !== reqRef.current) return;
      console.error('FPL live refresh:', e);
      setError('Couldn\u2019t refresh. Showing the last figures.');
    }
  }, [urlId, urlGw]);

  const polling = !!data && shouldPoll(data.fixtures);
  useEffect(() => {
    if (!polling) return;
    const t = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [polling, refresh]);

  const score = useMemo(() => (data ? scoreLiveTeam(toScoreInput(data)) : null), [data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = input.trim();
    if (!/^\d{1,8}$/.test(id)) {
      setError('That doesn’t look like an FPL ID: it’s a number of up to 8 digits.');
      return;
    }
    setParams({ id });
  };

  const setGw = (gw: number) => {
    const next: Record<string, string> = { id: urlId };
    if (data && gw !== data.event.currentEvent) next.gw = String(gw);
    setParams(next);
  };

  const team = (id: number) => data?.teams.get(id)?.short ?? '';
  const fixturesFor = (p: PlayerScore) => data?.fixtures.filter((f) => f.teamH === p.team || f.teamA === p.team) ?? [];
  const slugOf = (id: number) => data?.players.find((p) => p.id === id)?.slug ?? null;
  const nameOf = (id: number) => data?.players.find((p) => p.id === id)?.webName ?? String(id);

  const starters = score?.players.filter((p) => p.position <= 11) ?? [];
  const bench = score?.players.filter((p) => p.position > 11) ?? [];
  const xiPlayed = starters.filter((p) => p.done || p.minutes > 0).length;
  const anyProjection = !!data && data.projections.size > 0;

  const row = (p: PlayerScore) => {
    const fx = fixturesFor(p);
    const slug = slugOf(p.element);
    const counted = p.multiplier > 0;
    return (
      <tr key={p.element} className={counted ? undefined : 'text-ink-500'} data-testid={`live-player-${p.element}`}>
        <td className="px-2 py-1.5">
          <span className="text-xs text-ink-500 mr-1">{POS[p.type] ?? ''}</span>
          {slug ? (
            <Link to={`/fpl/players/${slug}`} className="text-pitch-800 underline underline-offset-2">{p.webName}</Link>
          ) : (
            p.webName
          )}
          {p.multiplier >= 2 && <span className="ml-1 text-xs font-mono text-amber-700" title={p.multiplier === 3 ? 'Triple captain' : 'Captain'}>{p.multiplier === 3 ? 'TC' : 'C'}</span>}
          {p.isViceCaptain && p.multiplier < 2 && <span className="ml-1 text-xs font-mono text-ink-500" title="Vice-captain">V</span>}
          {p.subbedIn && <span className="ml-1 text-xs text-pitch-700" title="Automatic sub: on">&uarr; on</span>}
          {p.subbedOut && <span className="ml-1 text-xs text-loss-700" title="Automatic sub: off">&darr; off</span>}
          {p.mayBeSubbed && <span className="ml-1 text-xs text-ink-500" title="Hasn't played yet; if he doesn't, a bench player may come on">may be subbed</span>}
          <span className="block text-xs text-ink-500">
            {fx.length === 0
              ? 'No match this gameweek'
              : fx
                  .map((f) => {
                    const home = f.teamH === p.team;
                    const opp = team(home ? f.teamA : f.teamH);
                    const st = fixtureState(f);
                    const sc = st === 'not_started' ? '' : ` ${f.scoreH ?? 0}–${f.scoreA ?? 0}`;
                    return `${opp} (${home ? 'H' : 'A'})${sc} · ${fixtureLabel(f)}`;
                  })
                  .join(', ')}
          </span>
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{p.hasFixture ? `${p.minutes}′` : '–'}</td>
        <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">
          {p.bonus > 0 ? (
            <span title={p.bonusState === 'confirmed' ? 'Bonus confirmed' : p.bonusState === 'live' ? 'Bonus if the match ended now (from BPS)' : 'Bonus at full time, not yet confirmed by FPL'}>
              {p.bonus}
              {p.bonusState !== 'confirmed' && <span className="text-ink-500">*</span>}
            </span>
          ) : (
            ''
          )}
        </td>
        <td className="px-2 py-1.5 text-right font-mono text-sm tabular-nums font-semibold">
          {counted ? fmt(p.points * p.multiplier) : <span className="font-normal">{fmt(p.points)}</span>}
        </td>
        {anyProjection && (
          <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums text-ink-500">
            {counted && p.projectedRemaining >= 0.05 ? `+${(p.projectedRemaining * p.multiplier).toFixed(1)}` : ''}
          </td>
        )}
      </tr>
    );
  };

  const head = (
    <thead className="text-ink-500">
      <tr>
        <th scope="col" className="text-left font-medium text-xs px-2 py-1">Player</th>
        <th scope="col" className="text-right font-medium text-xs px-2 py-1">Mins</th>
        <th scope="col" className="text-right font-medium text-xs px-2 py-1">Bonus</th>
        <th scope="col" className="text-right font-medium text-xs px-2 py-1">Pts</th>
        {anyProjection && <th scope="col" className="text-right font-medium text-xs px-2 py-1" title="Points the deadline projection still expects">To come</th>}
      </tr>
    </thead>
  );

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/fpl" className="hover:underline">Fantasy</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">FPL Live</h1>
        <p className="text-ink-700 mt-1 max-w-prose">
          Your gameweek score as it happens: bonus points as they stand, automatic subs, captaincy, chips and hits, and the points still to come.
        </p>
      </header>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">FPL ID</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 1234567"
            className="mt-1 block w-40 border border-chalk-300 rounded px-3 py-2 text-sm bg-white"
          />
        </label>
        <button type="submit" className="px-4 py-2 rounded bg-pitch-800 text-chalk-100 text-sm font-medium">Show my score</button>
        <p className="w-full text-xs text-ink-500">
          Find it on the FPL site: open Points, and it&rsquo;s the number in the address (fantasy.premierleague.com/entry/<b>1234567</b>/event/5).
        </p>
      </form>

      {error && <p className="text-loss-700" role="alert">{error}</p>}
      {loading && !data && <p className="text-ink-500 font-mono text-sm">Loading your gameweek&hellip;</p>}

      {data && score && (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium text-ink-900">{data.entry.name}</span>
            {data.entry.playerName && <span className="text-ink-500">{data.entry.playerName}</span>}
            <label className="flex items-center gap-2 ml-auto">
              <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Gameweek</span>
              <select
                value={data.event.id}
                onChange={(e) => setGw(Number(e.target.value))}
                className="border border-chalk-300 rounded px-2 py-1 text-sm bg-white"
              >
                {Array.from({ length: data.event.currentEvent }, (_, i) => data.event.currentEvent - i).map((gw) => (
                  <option key={gw} value={gw}>{`GW${gw}`}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Tile
              testId="live-points"
              value={fmt(score.net)}
              label={`GW${data.event.id} points${score.allDone ? '' : ' so far'}`}
              detail={score.hits > 0 ? `${fmt(score.points)} minus a ${score.hits}-point hit` : 'No transfer hits'}
            />
            <Tile
              testId="live-projected"
              value={anyProjection && !score.allDone ? score.projectedFinal.toFixed(1) : fmt(score.net)}
              label={score.allDone ? 'Final score' : 'Projected final'}
              detail={anyProjection && !score.allDone ? `+${score.projectedRemaining.toFixed(1)} still to come (projection)` : score.allDone ? 'Every match finished, bonus confirmed' : 'No projection for this gameweek'}
            />
            <Tile value={`${xiPlayed} of 11`} label="Starters played or done" detail={score.chip ? CHIP[score.chip] ?? score.chip : 'No chip'} />
            <Tile
              value={checkedAt ? timeFmt.format(checkedAt) : '–'}
              label="Last checked"
              detail={polling ? 'Updates every minute while matches are on' : score.allDone ? 'Gameweek complete' : 'No match in play'}
            />
          </div>

          <p className="text-sm text-ink-700" data-testid="live-captain">
            {score.captain === null
              ? 'Neither your captain nor vice-captain played: no armband points this week.'
              : score.viceCaptainActive
                ? `${nameOf(score.captain)} has the armband: your captain didn’t play.`
                : `Captain: ${nameOf(score.captain)}.`}
            {score.autoSubs.length > 0 &&
              ` Automatic subs: ${score.autoSubs.map((s) => `${nameOf(s.in)} for ${nameOf(s.out)}${s.provisional ? ' (provisional)' : ''}`).join(', ')}.`}
          </p>

          <section className="space-y-2">
            <h2 className="font-display uppercase tracking-wide text-xl text-ink-900">Starting XI</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="live-xi">
                {head}
                <tbody>{starters.map(row)}</tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="font-display uppercase tracking-wide text-xl text-ink-900">Bench</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="live-bench">
                {head}
                <tbody>{bench.map(row)}</tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="font-display uppercase tracking-wide text-xl text-ink-900">{`GW${data.event.id} matches`}</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2" data-testid="live-fixtures">
              {data.fixtures.map((f) => {
                const st = fixtureState(f);
                return (
                  <li key={f.id} className="border border-chalk-300 rounded-lg bg-white px-3 py-2 text-sm flex items-center gap-2">
                    <span className="flex-1 text-right">{team(f.teamH)}</span>
                    <span className="font-mono tabular-nums w-14 text-center">
                      {st === 'not_started' ? 'v' : `${f.scoreH ?? 0}–${f.scoreA ?? 0}`}
                    </span>
                    <span className="flex-1">{team(f.teamA)}</span>
                    <span className={`text-xs font-mono w-20 text-right ${st === 'live' ? 'text-pitch-700' : 'text-ink-500'}`}>
                      {fixtureLabel(f)}
                      {st === 'done' && !f.finished ? '*' : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="text-xs text-ink-500 max-w-prose space-y-1">
            <p>
              Points come from FPL&rsquo;s live feed, checked every minute while a match is on. Bonus marked * isn&rsquo;t final:
              during a match it&rsquo;s what the bonus points system (BPS) would give if it ended now; after full time it&rsquo;s
              FPL&rsquo;s figure until FPL confirms it.
            </p>
            <p>
              Automatic subs follow FPL&rsquo;s rules: once a starter&rsquo;s matches are over and he hasn&rsquo;t played, the first
              bench player (in your order) who has played comes on, keeping at least three defenders and one forward; the goalkeeper
              only swaps with the bench goalkeeper. &ldquo;To come&rdquo; is FixtureShark&rsquo;s projection at the deadline for matches
              not yet played, and the rest of matches in play; it&rsquo;s an estimate, not FPL&rsquo;s figure.
            </p>
            <p>
              <Link to={`/fpl/rate-my-team?id=${data.entry.id}`} className="underline underline-offset-2">Rate My Team</Link> shows the
              same squad against the model over the next ten gameweeks.
            </p>
          </section>
        </>
      )}
    </article>
  );
}
