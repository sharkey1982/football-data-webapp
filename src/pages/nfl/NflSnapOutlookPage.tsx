// ============================================================================
// src/pages/nfl/NflSnapOutlookPage.tsx
//
// /nfl/snap-outlook?team=<slug> -- "Snap Outlook": the NFL counterpart of
// FPL's Minutes Outlook (the NFL counts snaps, not minutes). One team at a
// time: each QB, RB, WR and TE's share of the team's offensive snaps game by
// game, the trend, carries + targets, the depth chart now and before the last
// game, the injury report, and an expected role for the next game. Callouts
// lift out who is gaining and losing snaps and who moved on the depth chart.
// Client-rendered (head tags at build).
// ============================================================================

import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import { NFL_HUB_PATH, NFL_SNAP_OUTLOOK_PATH, nflPlayerPath, nflTeamPath } from '../../lib/nflApi';
import { OUTLOOK_POSITIONS, loadOutlookTeams, loadSnapOutlook, type OutlookPlayer, type Role } from '../../lib/nflSnapOutlook';

const POS_LABEL: Record<string, string> = { QB: 'Quarterbacks', RB: 'Running backs', WR: 'Wide receivers', TE: 'Tight ends' };
const ROLE_TONE: Record<Role, string> = {
  Starter: 'bg-pitch-800 text-chalk-100',
  Rotation: 'bg-pitch-800/40 text-ink-900',
  Backup: 'bg-chalk-200 text-ink-700',
  Depth: 'bg-chalk-100 text-ink-500',
  Doubtful: 'bg-amber-400 text-pitch-950',
  Out: 'bg-loss-600 text-chalk-100',
};
const pct = (x: number | null) => (x == null ? '–' : `${Math.round(x * 100)}%`);
const pts = (x: number) => {
  const n = Math.round(x * 100);
  return n === 0 ? '0' : `${n > 0 ? '+' : '−'}${Math.abs(n)}`;
};

/** The last two weeks show on every screen; earlier weeks from the small breakpoint up. */
const weekCls = (i: number, n: number) => (i >= n - 2 ? '' : 'hidden sm:table-cell');

function ShareCell({ v, cls }: { v: number | null | undefined; cls: string }) {
  if (v == null) return <td className={`px-1 py-1 text-center text-[11px] text-ink-500 ${cls}`}>&ndash;</td>;
  const a = Math.max(0.06, Math.min(1, v));
  return (
    <td className={`px-1 py-1 text-center ${cls}`}>
      <span className="inline-block w-10 rounded text-[11px] font-mono tabular-nums py-0.5" style={{ backgroundColor: `rgba(27, 67, 50, ${a.toFixed(2)})`, color: v >= 0.5 ? '#f2f0e6' : '#14171a' }}>
        {Math.round(v * 100)}
      </span>
    </td>
  );
}

function PlayerName({ p }: { p: OutlookPlayer }) {
  return p.slug ? <Link to={nflPlayerPath(p.slug)} className="hover:underline">{p.name}</Link> : <span>{p.name}</span>;
}

function Callout({ title, items, testId }: { title: string; items: { p: OutlookPlayer; text: string }[]; testId: string }) {
  return (
    <div className="border border-chalk-300 rounded-lg p-3 bg-white" data-testid={testId}>
      <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">{title}</h3>
      {items.length ? (
        <ul className="mt-1 space-y-0.5 text-sm">
          {items.map(({ p, text }) => (
            <li key={p.player_id}>
              <PlayerName p={p} /> <span className="text-xs text-ink-500">{p.position}</span> <span className="font-mono text-xs">{text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-ink-500">None</p>
      )}
    </div>
  );
}

export default function NflSnapOutlookPage() {
  const [params, setParams] = useSearchParams();
  const { data: teams } = useKeyedFetch('nfl-outlook-teams', loadOutlookTeams);
  const slug = params.get('team') ?? teams?.[0]?.slug ?? null;
  const { data, failed, loading } = useKeyedFetch(`snap-outlook:${slug ?? ''}`, () => (slug ? loadSnapOutlook(slug) : Promise.resolve(null)));

  useDocumentHead({
    title: data ? `${data.team.name} snap counts and roles: NFL Snap Outlook` : 'NFL Snap Outlook: who plays, and how much',
    description: 'Every NFL team’s quarterbacks, running backs, receivers and tight ends: share of snaps each game, who is gaining or losing playing time, the depth chart and the injury report.',
    path: NFL_SNAP_OUTLOOK_PATH,
  });

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to={NFL_HUB_PATH} className="hover:underline">NFL</Link> &middot; <Link to="/nfl/predict" className="hover:underline">Predict</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Snap Outlook</h1>
        <p className="text-ink-700 mt-2 max-w-prose">
          Who plays, and how much. The NFL counts snaps rather than minutes: the share of a team&rsquo;s offensive plays each player is on the field for. With the depth chart and the injury report, it shows who has the job, who shares it, and who is gaining or losing time.
        </p>
      </header>

      <label className="flex flex-col gap-1 text-sm w-fit">
        <span className="text-xs text-ink-500">Team</span>
        <select className="border border-chalk-300 rounded px-2 py-1 bg-white" value={slug ?? ''} onChange={(e) => setParams({ team: e.target.value }, { replace: true })} data-testid="nfl-outlook-team">
          {(teams ?? []).map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
        </select>
      </label>

      {failed && <p className="text-ink-700">The snap outlook is unavailable right now.</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading&hellip;</p>}

      {data && (
        <>
          <div className="grid sm:grid-cols-3 gap-3">
            <Callout title="Gaining snaps" testId="nfl-outlook-gaining" items={data.gaining.map((p) => ({ p, text: `${pts(p.trend!)} pts` }))} />
            <Callout title="Losing snaps" testId="nfl-outlook-losing" items={data.losing.map((p) => ({ p, text: `${pts(p.trend!)} pts` }))} />
            <Callout
              title="Depth chart moves since the last game"
              testId="nfl-outlook-moves"
              items={data.depthMoves.map(({ player: p, from, to }) => ({ p, text: from == null ? `new: ${p.position}${to}` : to == null ? `off the chart (was ${p.position}${from})` : `${p.position}${from} → ${p.position}${to}` }))}
            />
          </div>

          {OUTLOOK_POSITIONS.map((pos) => {
            const rows = data.players.filter((p) => p.position === pos && (p.seasonShare != null || (p.depthNow != null && p.depthNow <= 4)));
            if (!rows.length) return null;
            return (
              <section key={pos} aria-labelledby={`pos-${pos}`} className="space-y-2">
                <h2 id={`pos-${pos}`} className="font-display uppercase tracking-wide text-lg text-ink-900">{POS_LABEL[pos]}</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden">
                    <thead className="bg-chalk-200 text-ink-500 text-xs">
                      <tr>
                        <th scope="col" className="px-2 py-2 text-left font-medium">Player</th>
                        <th scope="col" className="px-2 py-2 text-left font-medium" title="Expected role in the next game, from the injury report, the last two games' snap share and the depth chart">Next game</th>
                        <th scope="col" className="px-2 py-2 text-left font-medium hidden sm:table-cell" title="Place on today's depth chart">Depth</th>
                        {data.weeks.map((w, i) => <th key={w} scope="col" className={`px-1 py-2 text-center font-medium ${weekCls(i, data.weeks.length)}`} title={`Week ${w}: share of offensive snaps`}>{`W${w}`}</th>)}
                        <th scope="col" className="px-2 py-2 text-right font-medium" title="Average share of snaps in the games he played">Season</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium" title="The last two games against the games before (percentage points; a missed game counts as 0)">Trend</th>
                        <th scope="col" className="px-2 py-2 text-right font-medium hidden md:table-cell" title="Carries + targets per game played">Opps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p, i) => (
                        <tr key={p.player_id} className={i % 2 ? 'bg-chalk-100/60' : undefined} data-testid="nfl-outlook-row">
                          <th scope="row" className="px-2 py-1.5 text-left font-normal whitespace-nowrap">
                            <PlayerName p={p} />
                            {p.injury?.injury_status && <span className="ml-1 text-[10px] uppercase text-loss-700" title={p.injury.injury ?? ''}>{p.injury.injury_status === 'Questionable' ? 'Q' : p.injury.injury_status}</span>}
                          </th>
                          <td className="px-2 py-1.5"><span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${ROLE_TONE[p.role]}`} data-testid="nfl-outlook-role">{p.role}</span></td>
                          <td className="px-2 py-1.5 font-mono text-xs hidden sm:table-cell">{p.depthLabel ?? '–'}</td>
                          {data.weeks.map((w, i) => <ShareCell key={w} v={p.shares.get(w)} cls={weekCls(i, data.weeks.length)} />)}
                          <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums font-semibold">{pct(p.seasonShare)}</td>
                          <td className={`px-2 py-1.5 text-right font-mono text-xs tabular-nums ${p.trend != null && p.trend >= 0.1 ? 'text-pitch-800' : p.trend != null && p.trend <= -0.1 ? 'text-loss-700' : ''}`}>{p.trend == null ? '–' : pts(p.trend)}</td>
                          <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums hidden md:table-cell">{p.opportunities == null ? '–' : p.opportunities.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}

          <p className="text-xs text-ink-500 max-w-prose" data-testid="nfl-outlook-notes">
            {`${data.season} regular season. Cells: share of the team’s offensive snaps in each game; a dash means he didn’t play (injured, inactive or not yet on the team). `}
            Next game: Out or Doubtful from the injury report; otherwise Starter (60%+ of snaps in the last two games), Rotation (30&ndash;60%), Backup (under 30%), or Starter for a player listed first on the depth chart who hasn&rsquo;t played yet.
            {` Depth: place among the team’s players at the position on today’s chart${data.asOf ? ` (ESPN, ${data.asOf})` : ''}. Opps: carries plus targets per game. `}
            <Link to={nflTeamPath(data.team.slug)} className="text-pitch-800 underline underline-offset-2">{`${data.team.short_name} team page`}</Link>. Data: nflverse.
          </p>
        </>
      )}
    </article>
  );
}
