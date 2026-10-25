// ============================================================================
// src/pages/FplHub.tsx
//
// The FPL home page (layout review, 21 Oct 2026). Opens on the coming
// gameweek -- the deadline, Rate My Team, the most projected points, price
// pressure, injury news, the gameweek log -- then every FPL page in plain
// groups, then the trivia. Every player named links to his own page.
//
// Between a deadline and the end of that gameweek's last game, a toggle
// offers the gameweek in progress (scores, top scorers, the most-captained
// player's points) or the next deadline; the rule is in
// src/lib/fplGameweekState.ts. The "Most useful tools" row is
// src/lib/popularTools.ts.
//
// The groups come from HUB_GROUPS in src/lib/journey.ts.
// ============================================================================

import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocumentHead } from '../hooks/useDocumentHead';
import { hubGroups } from '../lib/journey';
import { getFplTrivia, type TriviaFact } from '../lib/landingApi';
import { formatDeadline, getNextDeadline, getTopProjected, type ProjectedPick } from '../lib/hubApi';
import { getPriceChangeRisk, type PriceRisk } from '../lib/priceRiskApi';
import { getInjuryReport, STATUS_LABEL, type InjuryRow } from '../lib/injuryApi';
import { loadReportList, reportPath, type ReportListEntry } from '../lib/fplGameweekReport';
import { PlayerLink } from '../components/EntityLinks';
import { HubCard, HubNote, HubPageList, HubPlayStrip, HubSkeleton, HUB_LINK } from '../components/hub/HubParts';
import { PopularTools } from '../components/hub/PopularTools';
import { MyLiveScore } from '../components/fpl/MyLiveScore';
import { forgetFplId, readStoredFplId, storeFplId } from '../lib/fplIdStore';
import { getOpenGameweek, type LiveGame, type LivePlayerPoints, type OpenGameweek } from '../lib/fplGameweekState';

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: T };

const NAME = 'font-medium text-ink-900 hover:text-pitch-700 hover:underline underline-offset-2';
const net = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(Math.round(n)).toLocaleString('en-GB')}`;

export default function FplHub() {
  useDocumentHead({
    title: 'Fantasy Premier League: projections, prices and injuries',
    description: 'The coming FPL gameweek: the deadline, the most projected points, price changes, injury news, and every tool to plan your team.',
    path: '/fpl/start',
  });

  const navigate = useNavigate();
  // The FPL ID remembered in this browser (shared with Rate My Team and FPL Live).
  const [storedId, setStoredId] = useState(readStoredFplId);
  const [fplId, setFplId] = useState(storedId);
  const [deadline, setDeadline] = useState<Load<{ gw: number; deadline: string } | null>>({ status: 'loading' });
  const [top, setTop] = useState<Load<{ gw: number; picks: ProjectedPick[] } | null>>({ status: 'loading' });
  const [prices, setPrices] = useState<Load<PriceRisk[]>>({ status: 'loading' });
  const [injuries, setInjuries] = useState<Load<InjuryRow[]>>({ status: 'loading' });
  const [reports, setReports] = useState<ReportListEntry[]>([]);
  const [open, setOpen] = useState<Load<OpenGameweek>>({ status: 'loading' });
  const [chosen, setChosen] = useState<'open' | 'next' | null>(null);
  const [trivia, setTrivia] = useState<TriviaFact[]>([]);

  useEffect(() => {
    getNextDeadline().then((data) => setDeadline({ status: 'ok', data })).catch(() => setDeadline({ status: 'error' }));
    getTopProjected(5).then((data) => setTop({ status: 'ok', data })).catch(() => setTop({ status: 'error' }));
    getPriceChangeRisk().then((data) => setPrices({ status: 'ok', data })).catch(() => setPrices({ status: 'error' }));
    getInjuryReport().then((data) => setInjuries({ status: 'ok', data })).catch(() => setInjuries({ status: 'error' }));
    loadReportList().then(setReports).catch(() => setReports([]));
    getOpenGameweek().then((data) => setOpen({ status: 'ok', data })).catch(() => setOpen({ status: 'error' }));
    getFplTrivia().then(setTrivia).catch(() => setTrivia([]));
  }, []);

  // While a game is being played, refresh the scores every two minutes.
  const anyLive = open.status === 'ok' && open.data.games.some((g) => g.state === 'live');
  useEffect(() => {
    if (!anyLive) return;
    const t = window.setInterval(() => {
      getOpenGameweek().then((data) => setOpen({ status: 'ok', data })).catch(() => undefined);
    }, 120_000);
    return () => window.clearInterval(t);
  }, [anyLive]);

  function rate(e: FormEvent) {
    e.preventDefault();
    const id = fplId.trim();
    if (/^\d{1,9}$/.test(id)) {
      storeFplId(id);
      navigate(`/fpl/rate-my-team?id=${id}`);
    }
  }

  const nextGw = deadline.status === 'ok' && deadline.data ? deadline.data.gw : top.status === 'ok' && top.data ? top.data.gw : null;
  const live = open.status === 'ok' && open.data.state.showToggle ? open.data : null;
  const view: 'open' | 'next' = live ? chosen ?? live.state.defaultView : 'next';
  const openGw = live?.state.openGw ?? null;
  const gw = view === 'open' ? openGw : nextGw;
  const reflection = openGw != null ? reports.find((r) => r.fpl_event_id === openGw && r.kind === 'reflection') : undefined;
  const logEntries = reports.slice(0, 2);
  const risers = prices.status === 'ok' ? prices.data.filter((p) => p.direction === 'rise').sort((a, b) => b.pressure - a.pressure).slice(0, 3) : [];
  const fallers = prices.status === 'ok' ? prices.data.filter((p) => p.direction === 'fall').sort((a, b) => a.pressure - b.pressure).slice(0, 3) : [];
  const flagged = injuries.status === 'ok'
    ? injuries.data.filter((r) => r.status !== 'a').sort((a, b) => (b.ownership ?? 0) - (a.ownership ?? 0)).slice(0, 5)
    : [];

  return (
    <div className="space-y-8">
      <div className="rounded-xl bg-pitch-900 text-chalk-100 p-5 sm:p-8 flex flex-wrap items-center justify-between gap-6">
        <div>
          <p className="font-mono text-xs text-amber-400 uppercase tracking-widest">{'FixtureShark · Fantasy Premier League'}</p>
          <h1 className="font-display uppercase tracking-wide text-3xl sm:text-5xl mt-1">{gw != null ? `Gameweek ${gw}` : 'Fantasy Premier League'}</h1>
          {view === 'open' && live && (
            <p className="mt-2 text-chalk-300">
              {live.state.gamesRemaining > 0
                ? <>In progress: <strong className="text-chalk-100">{live.games.length - live.state.gamesRemaining} of {live.games.length}</strong> games finished</>
                : <>All {live.games.length} games played. Bonus points are confirmed after the last one.</>}
            </p>
          )}
          {live && openGw != null && nextGw != null && (
            <div role="group" aria-label="Which gameweek" className="mt-3 inline-flex rounded-lg border border-pitch-600 overflow-hidden text-sm" data-testid="hub-gw-toggle">
              {([['open', `GW${openGw} (in progress)`], ['next', `GW${nextGw} (next deadline)`]] as const).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={view === k}
                  onClick={() => setChosen(k)}
                  className={`px-3 py-2 min-h-11 ${view === k ? 'bg-amber-500 text-ink-900 font-medium' : 'bg-pitch-950 text-chalk-300 hover:text-chalk-100'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {view === 'next' && deadline.status === 'ok' && deadline.data && (
            <p className="mt-2 text-chalk-300">
              Deadline <strong className="text-chalk-100">{formatDeadline(deadline.data.deadline)}</strong>
            </p>
          )}
        </div>
        <form onSubmit={rate} className="flex flex-col gap-1.5 min-w-[16rem]">
          <label htmlFor="hub-fpl-id" className="text-sm text-chalk-300">Rate My Team: your FPL ID</label>
          <div className="flex gap-2">
            <input
              id="hub-fpl-id"
              inputMode="numeric"
              autoComplete="off"
              placeholder="e.g. 1234567"
              value={fplId}
              onChange={(e) => setFplId(e.target.value)}
              className="flex-1 min-w-0 rounded border border-pitch-600 bg-pitch-950 text-chalk-100 px-3 py-2"
            />
            <button type="submit" className="rounded bg-amber-500 hover:bg-amber-400 text-ink-900 font-medium px-4 py-2 min-h-11">
              Rate it
            </button>
          </div>
          <Link to={fplId.trim() ? `/fpl/live?id=${encodeURIComponent(fplId.trim())}` : '/fpl/live'} className="text-sm text-amber-400 hover:text-amber-300">
            Or follow your live score &rarr;
          </Link>
        </form>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        {view === 'open' && live ? (
          <div className="flex-[999_1_34rem] min-w-0 space-y-6">
            {storedId && (
              <MyLiveScore
                key={storedId}
                fplId={storedId}
                onForget={() => {
                  forgetFplId();
                  setStoredId('');
                  setFplId('');
                }}
              />
            )}
            <InProgress data={live} reflectionTo={reflection ? reportPath(reflection.season_label, reflection.fpl_event_id, 'reflection') : null} />
          </div>
        ) : (
        <HubCard title="Most projected points" more={{ to: '/fpl/player-points', label: 'All players' }} className="flex-[999_1_34rem] min-w-0" testId="hub-projected">
          {top.status === 'loading' && <HubSkeleton rows={6} rowClass="h-11" />}
          {top.status === 'error' && <HubNote>The projections didn&rsquo;t load.</HubNote>}
          {top.status === 'ok' && (!top.data || top.data.picks.length === 0) && <HubNote>No projections for the coming gameweek yet.</HubNote>}
          {top.status === 'ok' && top.data && top.data.picks.length > 0 && (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="font-mono text-[11px] uppercase text-ink-500">
                    <th className="text-left font-normal px-4 py-1.5 w-8">#</th>
                    <th className="text-left font-normal py-1.5">Player</th>
                    <th className="text-left font-normal py-1.5 hidden sm:table-cell">Club</th>
                    <th className="text-right font-normal py-1.5">Price</th>
                    <th className="text-right font-normal px-4 py-1.5">GW{top.data.gw} pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-chalk-200">
                  {top.data.picks.map((p, i) => (
                    <tr key={p.fplPlayerId}>
                      <td className="px-4 py-2.5 font-mono text-xs text-ink-500">{i + 1}</td>
                      <td className="py-2.5">
                        <PlayerLink slug={p.slug} from="fpl_hub" className={NAME}>{p.name}</PlayerLink>
                        {p.games > 1 && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-700">{p.games} games</span>}
                        {p.status && p.status !== 'a' && (
                          // FPL's flag, shown beside the projection: the model's minutes
                          // can lag late injury news (audit 22 Oct 2026, S-13).
                          <span className="ml-1.5 text-[10px] uppercase tracking-wide text-loss-700" title="FPL availability flag">
                            {STATUS_LABEL[p.status] ?? p.status}{p.chance != null ? ` ${p.chance}%` : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-ink-700 hidden sm:table-cell">{p.team}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{p.price != null ? `£${p.price.toFixed(1)}m` : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-semibold">{p.points.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2.5 border-t border-chalk-200 text-xs text-ink-500">A double gameweek counts both games. Every name opens the player&rsquo;s page.</p>
            </>
          )}
        </HubCard>
        )}

        <div className="flex-[1_1_18rem] min-w-0 space-y-6">
          <HubCard title="Price pressure" more={{ to: '/fpl/price-risk', label: 'All' }} testId="hub-prices">
            {prices.status === 'loading' && <HubSkeleton rows={6} rowClass="h-9" />}
            {prices.status === 'error' && <HubNote>Prices didn&rsquo;t load.</HubNote>}
            {prices.status === 'ok' && risers.length + fallers.length === 0 && <HubNote>No one under pressure right now.</HubNote>}
            {prices.status === 'ok' && risers.length + fallers.length > 0 && (
              <ul className="divide-y divide-chalk-200 text-sm">
                {[...risers.map((p) => ({ p, up: true })), ...fallers.map((p) => ({ p, up: false }))].map(({ p, up }) => (
                  <li key={p.fpl_player_id} className="px-4 py-2 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span aria-label={up ? 'Rising' : 'Falling'} className={up ? 'text-pitch-700' : 'text-loss-700'}>{up ? '▲' : '▼'}</span>{' '}
                      <PlayerLink slug={p.slug} from="fpl_hub" className={NAME}>{p.web_name}</PlayerLink>
                      <span className="text-ink-500"> {p.team_name}</span>
                    </span>
                    <span className="font-mono text-xs text-ink-500 whitespace-nowrap">{net(p.net_transfers)}</span>
                  </li>
                ))}
              </ul>
            )}
          </HubCard>

          <HubCard title="Injury news" more={{ to: '/fpl/injuries', label: 'All' }} testId="hub-injuries">
            {injuries.status === 'loading' && <HubSkeleton rows={5} rowClass="h-9" />}
            {injuries.status === 'error' && <HubNote>Injury news didn&rsquo;t load.</HubNote>}
            {injuries.status === 'ok' && flagged.length === 0 && <HubNote>No one flagged.</HubNote>}
            {flagged.length > 0 && (
              <ul className="divide-y divide-chalk-200 text-sm">
                {flagged.map((r) => (
                  <li key={r.fpl_player_id} className="px-4 py-2 flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <PlayerLink slug={r.slug} from="fpl_hub" className={NAME}>{r.web_name}</PlayerLink>
                      <span className="text-ink-500"> {r.team_name}</span>
                    </span>
                    <span className="font-mono text-xs text-ink-500 whitespace-nowrap">
                      {STATUS_LABEL[r.status] ?? r.status}
                      {r.chance_next_round != null ? ` · ${r.chance_next_round}%` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {flagged.length > 0 && <p className="px-4 py-2 border-t border-chalk-200 text-xs text-ink-500">Most-owned players first.</p>}
          </HubCard>

          {logEntries.length > 0 && (
            <HubCard title="Gameweek log" more={{ to: '/fpl/gameweek', label: 'All' }} testId="hub-log">
              <ul className="divide-y divide-chalk-200 text-sm">
                {logEntries.map((r) => (
                  <li key={`${r.fpl_event_id}-${r.kind}`} className="px-4 py-2">
                    <Link to={reportPath(r.season_label, r.fpl_event_id, r.kind)} className={HUB_LINK}>{r.title}</Link>
                  </li>
                ))}
              </ul>
            </HubCard>
          )}
        </div>
      </div>

      <PopularTools from="fpl_hub" section="fpl" />

      <HubPageList title="All FPL pages" groups={hubGroups('fpl')} />

      <HubPlayStrip trivia={trivia} />
    </div>
  );
}

const STATE_LABEL: Record<LiveGame['state'], string> = { not_started: 'To play', live: 'Live', done: 'Full time' };

function score(g: LiveGame): string {
  if (g.state === 'not_started' || g.homeScore == null || g.awayScore == null) return 'v';
  return `${g.homeScore}–${g.awayScore}`;
}

/** "Sun 25 Oct, 14:00" in UK time. */
function kickoffLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  return `${day}, ${time}`;
}

function PlayerPoints({ p, note }: { p: LivePlayerPoints; note?: string }) {
  return (
    <li className="px-4 py-2 flex items-baseline justify-between gap-3">
      <span className="min-w-0 truncate">
        <PlayerLink slug={p.slug} from="fpl_hub" className={NAME}>{p.name}</PlayerLink>
        <span className="text-ink-500"> {p.team}</span>
        {note && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-ink-700">{note}</span>}
      </span>
      <span className="font-mono font-semibold whitespace-nowrap">{p.minutes > 0 || p.points !== 0 ? `${p.points} pts` : 'yet to play'}</span>
    </li>
  );
}

/** The gameweek in progress: every game with its score, then who has scored most. */
function InProgress({ data, reflectionTo }: { data: OpenGameweek; reflectionTo: string | null }) {
  const gw = data.state.openGw;
  const played = data.games.filter((g) => g.state !== 'not_started');
  const toPlay = data.games.filter((g) => g.state === 'not_started');
  const row = (g: LiveGame) => (
    <li key={g.id} className="px-4 py-2 grid grid-cols-[1fr_auto_1fr_auto] items-baseline gap-2 text-sm">
      <span className="text-right font-medium text-ink-900">{g.home}</span>
      <span className={`font-mono text-center min-w-[3rem] ${g.state === 'live' ? 'text-pitch-700 font-semibold' : 'text-ink-900'}`}>{score(g)}</span>
      <span className="font-medium text-ink-900">{g.away}</span>
      <span className="font-mono text-[11px] text-ink-500 text-right whitespace-nowrap">
        {g.state === 'not_started' ? kickoffLabel(g.kickoff) : g.state === 'live' ? `Live ${g.minutes}′` : STATE_LABEL[g.state]}
      </span>
    </li>
  );
  return (
    <>
      <HubCard title={`Gameweek ${gw} scores`} more={{ to: '/fpl/live', label: 'Your live score' }} testId="hub-gw-scores">
        {played.length > 0 && (
          <>
            <h3 className="px-4 pt-3 font-mono text-[11px] uppercase tracking-widest text-ink-500">Played</h3>
            <ul className="divide-y divide-chalk-200">{played.map(row)}</ul>
          </>
        )}
        {toPlay.length > 0 && (
          <>
            <h3 className="px-4 pt-3 font-mono text-[11px] uppercase tracking-widest text-ink-500">Still to play</h3>
            <ul className="divide-y divide-chalk-200">{toPlay.map(row)}</ul>
          </>
        )}
        <p className="px-4 py-2.5 border-t border-chalk-200 text-xs text-ink-500">
          Scores from FPL, refreshed every two minutes while a game is on.{' '}
          {reflectionTo
            ? <Link to={reflectionTo} className={HUB_LINK}>Read the Gameweek {gw} reflection</Link>
            : <>The Gameweek {gw} reflection follows on Tuesday.</>}
        </p>
      </HubCard>

      <HubCard title="Top scorers so far" more={{ to: '/fpl/live', label: 'FPL Live' }} testId="hub-gw-top">
        {data.topScorers.length === 0 ? (
          <HubNote>No points scored yet.</HubNote>
        ) : (
          <ul className="divide-y divide-chalk-200 text-sm">
            {data.topScorers.map((p) => <PlayerPoints key={p.fplPlayerId} p={p} />)}
          </ul>
        )}
        {(data.mostCaptained || data.mostSelected) && (
          <>
            <h3 className="px-4 pt-3 font-mono text-[11px] uppercase tracking-widest text-ink-500 border-t border-chalk-200">Most captained and most owned</h3>
            <ul className="divide-y divide-chalk-200 text-sm">
              {data.mostCaptained && (
                <PlayerPoints p={data.mostCaptained} note={data.mostSelected ? 'most captained' : 'most captained and owned'} />
              )}
              {data.mostSelected && (
                <PlayerPoints p={data.mostSelected} note={`most owned${data.mostSelected.ownership != null ? ` · ${data.mostSelected.ownership}%` : ''}`} />
              )}
            </ul>
          </>
        )}
        <p className="px-4 py-2.5 border-t border-chalk-200 text-xs text-ink-500">Points so far, before bonus is confirmed. A captain&rsquo;s points count double.</p>
      </HubCard>
    </>
  );
}
