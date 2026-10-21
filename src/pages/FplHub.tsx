// ============================================================================
// src/pages/FplHub.tsx
//
// The FPL home page (layout review, 21 Oct 2026). Opens on the coming
// gameweek -- the deadline, Rate My Team, the most projected points, price
// pressure, injury news, the gameweek log -- then every FPL page in plain
// groups, then the trivia. Every player named links to his own page.
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
import { HubCard, HubNote, HubPageList, HubPlayStrip, HUB_LINK } from '../components/hub/HubParts';

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
  const [fplId, setFplId] = useState('');
  const [deadline, setDeadline] = useState<Load<{ gw: number; deadline: string } | null>>({ status: 'loading' });
  const [top, setTop] = useState<Load<{ gw: number; picks: ProjectedPick[] } | null>>({ status: 'loading' });
  const [prices, setPrices] = useState<Load<PriceRisk[]>>({ status: 'loading' });
  const [injuries, setInjuries] = useState<Load<InjuryRow[]>>({ status: 'loading' });
  const [reports, setReports] = useState<ReportListEntry[]>([]);
  const [trivia, setTrivia] = useState<TriviaFact[]>([]);

  useEffect(() => {
    getNextDeadline().then((data) => setDeadline({ status: 'ok', data })).catch(() => setDeadline({ status: 'error' }));
    getTopProjected(5).then((data) => setTop({ status: 'ok', data })).catch(() => setTop({ status: 'error' }));
    getPriceChangeRisk().then((data) => setPrices({ status: 'ok', data })).catch(() => setPrices({ status: 'error' }));
    getInjuryReport().then((data) => setInjuries({ status: 'ok', data })).catch(() => setInjuries({ status: 'error' }));
    loadReportList().then((r) => setReports(r.slice(0, 2))).catch(() => setReports([]));
    getFplTrivia().then(setTrivia).catch(() => setTrivia([]));
  }, []);

  function rate(e: FormEvent) {
    e.preventDefault();
    const id = fplId.trim();
    if (/^\d{1,9}$/.test(id)) navigate(`/fpl/rate-my-team?id=${id}`);
  }

  const gw = deadline.status === 'ok' && deadline.data ? deadline.data.gw : top.status === 'ok' && top.data ? top.data.gw : null;
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
          {deadline.status === 'ok' && deadline.data && (
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
        <HubCard title="Most projected points" more={{ to: '/fpl/player-points', label: 'All players' }} className="flex-[999_1_34rem] min-w-0" testId="hub-projected">
          {top.status === 'loading' && <HubNote>Loading&hellip;</HubNote>}
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
                        {p.games > 1 && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-600">{p.games} games</span>}
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

        <div className="flex-[1_1_18rem] min-w-0 space-y-6">
          <HubCard title="Price pressure" more={{ to: '/fpl/price-risk', label: 'All' }} testId="hub-prices">
            {prices.status === 'loading' && <HubNote>Loading&hellip;</HubNote>}
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
            {injuries.status === 'loading' && <HubNote>Loading&hellip;</HubNote>}
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

          {reports.length > 0 && (
            <HubCard title="Gameweek log" more={{ to: '/fpl/gameweek', label: 'All' }} testId="hub-log">
              <ul className="divide-y divide-chalk-200 text-sm">
                {reports.map((r) => (
                  <li key={`${r.fpl_event_id}-${r.kind}`} className="px-4 py-2">
                    <Link to={reportPath(r.season_label, r.fpl_event_id, r.kind)} className={HUB_LINK}>{r.title}</Link>
                  </li>
                ))}
              </ul>
            </HubCard>
          )}
        </div>
      </div>

      <HubPageList title="All FPL pages" groups={hubGroups('fpl')} />

      <HubPlayStrip trivia={trivia} />
    </div>
  );
}
