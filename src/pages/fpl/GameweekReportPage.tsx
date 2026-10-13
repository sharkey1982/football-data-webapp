// ============================================================================
// src/pages/fpl/GameweekReportPage.tsx
//
// /fpl/gameweek/:season/:gw/:kind -- the weekly FPL log. A reflection
// (Tuesday) shows what the gameweek did to the model: goals against the
// model's expectation, minutes and positions, set pieces, and a considered
// look at captaincy. A preview (Thursday) arrives with phase 1.
// The content is generated from the numbers by scripts/fpl_gameweek_report.py
// and stored per version; this page only lays it out. Rendered at build with
// initialData so crawlers read it without JavaScript.
// ============================================================================

import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { H2, LINK, PROSE } from '../../components/articles/ArticleLayout';
import GameweekReflection from '../../components/fpl/GameweekReflection';
import ReportTable from '../../components/fpl/ReportTable';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useKeyedFetch } from '../../hooks/useKeyedFetch';
import {
  GAMEWEEK_HUB_PATH,
  loadReport,
  pct,
  reportPath,
  seasonDisplay,
  statusLabel,
  type GameweekReport,
  type PreviewPayload,
  type PreviewPlayer,
  type ReportKind,
} from '../../lib/fplGameweekReport';
import { XG_FDR_ARTICLE } from '../../lib/fplArticles';
import NotFoundPage from '../NotFoundPage';

const H3 = 'font-display uppercase tracking-wide text-base text-ink-900';
const NOTE = 'text-sm text-ink-500 max-w-prose';
const SET_PIECE_SHORT: Record<string, string> = {
  Penalties: 'Penalties',
  'Direct free kicks': 'Free kicks',
  'Corners and indirect free kicks': 'Corners',
};
const dm = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const goals = (h: number | null, a: number | null, nd = 1) => (h === null || a === null ? '–' : `${h.toFixed(nd)}–${a.toFixed(nd)}`);
const who = (p: { name: string; team: string }) => (
  <>
    {p.name}{' '}
    <span className="block text-xs text-ink-500">{p.team}</span>
  </>
);

export function reportDescription(r: Pick<GameweekReport, 'summary' | 'fpl_event_id' | 'kind'>): string {
  return r.summary || `FPL gameweek ${r.fpl_event_id} ${r.kind}: what the gameweek did to the numbers.`;
}

export default function GameweekReportPage({ initialData }: { initialData?: GameweekReport }) {
  const { season = '', gw: gwSeg = '', kind: kindSeg = '' } = useParams();
  const gw = Number(gwSeg);
  const kind = (kindSeg === 'preview' || kindSeg === 'reflection' ? kindSeg : null) as ReportKind | null;
  const valid = /^\d{4}-\d{2}$/.test(season) && Number.isInteger(gw) && gw >= 1 && gw <= 38 && kind !== null;
  const key = valid ? `${season}:${gw}:${kind}` : null;
  const initialKey = initialData ? `${initialData.season_label}:${initialData.fpl_event_id}:${initialData.kind}` : null;
  const { data: fetched, failed, loading } = useKeyedFetch(
    key,
    () => loadReport(season, gw, kind as ReportKind),
    initialData && initialKey ? { key: initialKey, data: initialData } : undefined
  );
  // A live preview is rebuilt into the static page only for its first and
  // locked versions; newer versions in between are fetched here.
  const [newer, setNewer] = useState<GameweekReport | null>(null);
  useEffect(() => {
    if (!fetched || fetched.kind !== 'preview' || fetched.frozen) return;
    let live = true;
    loadReport(fetched.season_label, fetched.fpl_event_id, 'preview')
      .then((r) => { if (live && r && r.version > fetched.version) setNewer(r); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [fetched]);
  const data = newer && fetched && newer.fpl_event_id === fetched.fpl_event_id ? newer : fetched;
  useDocumentHead({
    title: data ? data.title : `FPL GW${gwSeg} ${kindSeg}`,
    description: data ? reportDescription(data) : 'The weekly FPL log: a reflection each Tuesday and a preview each Thursday.',
    path: valid ? reportPath(season, gw, kind as ReportKind) : GAMEWEEK_HUB_PATH,
  });

  if (!valid || (!loading && !failed && data === null)) return <NotFoundPage />;
  if (failed) return <p className="text-ink-700">Couldn&rsquo;t load this report. Try again shortly.</p>;
  if (!data) return <p className="text-ink-500">Loading…</p>;

  return (
    <article className="space-y-8">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/fpl/start" className="hover:underline">FPL</Link> &middot;{' '}
          <Link to={GAMEWEEK_HUB_PATH} className="hover:underline">Gameweek log</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">
          GW{data.fpl_event_id} {data.kind} <span className="text-ink-500">{seasonDisplay(data.season_label)}</span>
        </h1>
        <p className="font-mono text-xs text-ink-500 mt-2">
          Published {dm(data.published_at ?? data.generated_at)}
          {data.version > 1 ? ` · version ${data.version}` : ''}
          {data.frozen ? ' · locked at the deadline' : ''}
        </p>
      </header>
      {data.payload.kind === 'reflection' ? (
        <GameweekReflection p={data.payload} />
      ) : (
        <Preview p={data.payload} />
      )}
      <nav aria-label="Where next" className="text-sm">
        <p className="text-ink-500">Where next:</p>
        <ul className="mt-1 space-y-1">
          <li><Link to={GAMEWEEK_HUB_PATH} className={LINK}>All previews and reflections</Link></li>
          <li><Link to="/fpl" className={LINK}>Match projections for the next gameweeks</Link></li>
          <li><Link to="/fpl/live" className={LINK}>FPL Live: your team&rsquo;s score as it happens</Link></li>
          <li><Link to="/fpl/articles" className={LINK}>FPL articles</Link></li>
        </ul>
      </nav>
    </article>
  );
}

// ---- Preview ---------------------------------------------------------------

const HEAT = ['bg-pitch-700/5', 'bg-pitch-700/15', 'bg-pitch-700/30', 'bg-pitch-700/50'];
/** Goals-for heat band: <1.0, 1.0-1.5, 1.5-2.0, 2.0+. */
function heat(goalsFor: number): string {
  return HEAT[goalsFor >= 2 ? 3 : goalsFor >= 1.5 ? 2 : goalsFor >= 1 ? 1 : 0];
}
const price = (v: number | null) => (v === null ? '–' : `£${v.toFixed(1)}m`);
const own = (v: number | null) => (v === null ? '–' : `${v}%`);

function playerColumns(extra: { label: string; render: (r: PreviewPlayer) => ReactNode; sort?: (r: PreviewPlayer) => number | string | null }[] = []) {
  return [
    { label: 'Player', render: who, sort: (r: PreviewPlayer) => r.name },
    { label: 'Price', render: (r: PreviewPlayer) => price(r.price), sort: (r: PreviewPlayer) => r.price },
    { label: 'GW', render: (r: PreviewPlayer) => r.gw_xpts.toFixed(1), sort: (r: PreviewPlayer) => r.gw_xpts },
    { label: '5 GW', render: (r: PreviewPlayer) => r.xpts_5.toFixed(1), sort: (r: PreviewPlayer) => r.xpts_5 },
    { label: '10 GW', render: (r: PreviewPlayer) => r.xpts_10.toFixed(1), sort: (r: PreviewPlayer) => r.xpts_10 },
    ...extra,
  ];
}

function Preview({ p }: { p: PreviewPayload }) {
  const ch = p.changes;
  const gws = p.fixture_run[0]?.weeks.map((w) => w.gw) ?? [];
  return (
    <>
      <p className={NOTE}>
        Deadline {dm(p.deadline)},{' '}
        {new Date(p.deadline).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}.{' '}
        {p.frozen ? 'Locked at the deadline: the projections as they stood before kick-off.' : `Updated after each projection run until the deadline (this version ${dm(p.generated_at)}).`}
      </p>
      {p.changes_since_last?.length && !p.frozen ? (
        <p className="rounded border border-chalk-300 bg-white px-3 py-2 text-sm text-ink-700 max-w-prose">
          <strong className="font-medium">Since the last version:</strong> {p.changes_since_last.join('; ')}.
        </p>
      ) : null}

      <section aria-label="Headlines" className="rounded-lg border-l-4 border-pitch-700 bg-chalk-100 px-4 py-3 max-w-prose">
        <p className="text-xs font-mono uppercase tracking-widest text-ink-500">This gameweek</p>
        <ul className="mt-1 space-y-1 text-ink-900">
          {p.headlines.map((h) => <li key={h}>{h}</li>)}
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="changed">
        <h2 id="changed" className={H2}>What&rsquo;s changed since GW{ch.since_gw}</h2>
        {ch.blanks.length || ch.doubles.length ? (
          <p className={PROSE}>
            {ch.doubles.length ? `Two fixtures this gameweek: ${ch.doubles.join(', ')}. ` : ''}
            {ch.blanks.length ? `No fixture this gameweek: ${ch.blanks.join(', ')}.` : ''}
          </p>
        ) : null}
        <h3 className={H3}>Availability</h3>
        <ReportTable
          caption="Availability changes since the last deadline"
          rows={ch.injuries}
          empty="No change for popular or highly projected players."
          columns={[
            { label: 'Player', render: who, sort: (r) => r.name },
            { label: 'Change', render: (r) => (<>{statusLabel(r.before)} → {statusLabel(r.now)}{r.news ? ' ' : ''}{r.news ? <span className="block text-xs text-ink-500">{r.news}</span> : null}</>), align: 'left' },
          ]}
        />
        <h3 className={H3}>Prices</h3>
        <ReportTable
          caption="Price changes since the last deadline"
          rows={ch.prices}
          empty="No price changes for popular or highly projected players."
          columns={[
            { label: 'Player', render: who, sort: (r) => r.name },
            { label: 'Was', render: (r) => price(r.before), sort: (r) => r.before },
            { label: 'Now', render: (r) => price(r.now), sort: (r) => r.now },
            { label: 'Owned', render: (r) => own(r.own), sort: (r) => r.own },
          ]}
        />
        <ul className={`${PROSE} list-disc pl-5`}>
          <li>
            Set-piece takers:{' '}
            {ch.set_pieces.length
              ? ch.set_pieces.map((c) => `${c.team} ${(SET_PIECE_SHORT[c.type] ?? c.type).toLowerCase()} ${c.before.join('/') || '–'} → ${c.now.join('/') || '–'}`).join('; ')
              : 'no change in FPL’s first choices.'}
          </li>
          <li>
            Model changes:{' '}
            {ch.model_changes.length ? (
              <ul className="list-disc pl-5 mt-1">
                {ch.model_changes.map((c) => <li key={c.date + c.title}>{dm(`${c.date}T12:00:00Z`)}: {c.title.replace(/^FPL: /, '')}</li>)}
              </ul>
            ) : 'none.'}
          </li>
        </ul>
      </section>

      <section className="space-y-3" aria-labelledby="fixtures">
        <h2 id="fixtures" className={H2}>Fixtures</h2>
        <p className={PROSE}>
          Expected goals for each side, read off the betting market where it prices the match, with each side&rsquo;s chance of a clean
          sheet and FPL&rsquo;s difficulty rating (FDR). Why both: <Link to={XG_FDR_ARTICLE.path} className={LINK}>xG or FDR?</Link>
        </p>
        <ReportTable
          caption="Fixtures: expected goals, clean-sheet chance and FDR"
          rows={p.fixtures}
          columns={[
            { label: 'Match', render: (m) => (<>{m.home}{' '}<span className="block whitespace-nowrap">v {m.away}</span></>), sort: (m) => m.home },
            { label: 'Goals', render: (m) => goals(m.goals_home, m.goals_away), sort: (m) => (m.goals_home ?? 0) + (m.goals_away ?? 0) },
            { label: 'Clean sheet', render: (m) => (m.cs_home === null || m.cs_away === null ? '–' : `${pct(m.cs_home)}/${pct(m.cs_away)}`), sort: (m) => Math.max(m.cs_home ?? 0, m.cs_away ?? 0) },
            { label: 'FDR', render: (m) => `${m.fdr_home ?? '–'}/${m.fdr_away ?? '–'}` },
          ]}
        />
      </section>

      <section className="space-y-3" aria-labelledby="captaincy-preview">
        <h2 id="captaincy-preview" className={H2}>Captaincy</h2>
        <p className={PROSE}>
          The eight highest projections, and how often each scores the most of the eight across {p.sim_worlds.toLocaleString('en-GB')} simulated
          gameweeks (team goals shared, so teammates rise and fall together). The top projection is the best pick on average, but rarely by much:
          see <Link to="/fpl/articles/always-captain-the-top-pick" className={LINK}>should you always captain the top pick</Link>.
        </p>
        <ReportTable
          caption="Captaincy: projected points and chance of the top score"
          rows={p.captains}
          columns={[
            { label: 'Player', render: who, sort: (r) => r.name },
            { label: 'xPts', render: (r) => r.gw_xpts.toFixed(1), sort: (r) => r.gw_xpts },
            { label: 'Top score', render: (r) => (r.top_chance === null ? '–' : pct(r.top_chance)), sort: (r) => r.top_chance },
            { label: 'Start', render: (r) => pct(r.start), sort: (r) => r.start },
            { label: 'Owned', render: (r) => own(r.own), sort: (r) => r.own },
          ]}
        />
      </section>

      <section className="space-y-3" aria-labelledby="picks">
        <h2 id="picks" className={H2}>Best picks by position</h2>
        <p className={PROSE}>Projected points for this gameweek, the next five and the next ten, ranked on the next five.</p>
        {(['GK', 'DEF', 'MID', 'FWD'] as const).map((pos) => (
          <div key={pos} className="space-y-1">
            <h3 className={H3}>{{ GK: 'Goalkeepers', DEF: 'Defenders', MID: 'Midfielders', FWD: 'Forwards' }[pos]}</h3>
            <ReportTable caption={`Best ${pos} picks`} rows={p.picks[pos]} columns={playerColumns()} />
          </div>
        ))}
        <h3 className={H3}>Value</h3>
        <ReportTable
          caption="Most projected points per million over five gameweeks"
          rows={p.value}
          columns={playerColumns([{ label: 'Per £m', render: (r) => (r as PreviewPlayer & { per_m: number }).per_m.toFixed(2), sort: (r) => (r as PreviewPlayer & { per_m: number }).per_m }])}
        />
        <h3 className={H3}>Differentials</h3>
        <ReportTable
          caption="Highest projected players owned by under 5%"
          rows={p.differentials}
          columns={playerColumns([{ label: 'Owned', render: (r) => own(r.own), sort: (r) => r.own }])}
        />
        <p className={NOTE}>Value and differentials: players at least 70% to start.</p>
      </section>

      <section className="space-y-3" aria-labelledby="watch">
        <h2 id="watch" className={H2}>Minutes watch</h2>
        <ReportTable
          caption="Popular or highly projected players under 70% to start"
          rows={p.minutes_watch}
          empty="Every popular or highly projected player is 70%+ to start."
          columns={[
            { label: 'Player', render: who, sort: (r) => r.name },
            { label: 'Start', render: (r) => pct(r.start), sort: (r) => r.start },
            { label: 'Owned', render: (r) => own(r.own), sort: (r) => r.own },
            { label: 'Why', render: (r) => r.why, align: 'left' },
          ]}
        />
      </section>

      <section className="space-y-3" aria-labelledby="run">
        <h2 id="run" className={H2}>The next ten gameweeks</h2>
        <p className={PROSE}>
          Each side&rsquo;s expected goals in every fixture from GW{gws[0]} to GW{gws[gws.length - 1]}, darker for more goals (under 1.0,
          1.0–1.5, 1.5–2.0, 2.0+). Opponents in capitals are at home.
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs border border-chalk-300">
            <caption className="sr-only">Expected goals by fixture for the next ten gameweeks</caption>
            <thead className="bg-chalk-200 text-ink-500">
              <tr>
                <th scope="col" className="text-left font-medium px-2 py-2">Team</th>
                <th scope="col" className="text-right font-medium px-2 py-2">For, 5 GW</th>
                {gws.map((g) => <th key={g} scope="col" className="font-medium px-1.5 py-2">GW{g}</th>)}
              </tr>
            </thead>
            <tbody>
              {p.fixture_run.map((t) => (
                <tr key={t.team} className="border-t border-chalk-200">
                  <th scope="row" className="text-left font-normal px-2 py-1 whitespace-nowrap">{t.team}</th>
                  <td className="text-right font-mono tabular-nums px-2">{t.for_5.toFixed(1)}</td>
                  {t.weeks.map((w) => (
                    <td key={w.gw} className="px-0.5 py-0.5 align-top">
                      {w.fixtures.length === 0 ? <span className="block text-center text-ink-500">–</span> : null}
                      {w.fixtures.map((x, i) => (
                        <span key={i} className={`block rounded px-1 py-0.5 text-center whitespace-nowrap ${heat(x.for)}`}>
                          {x.home ? x.opp.toUpperCase() : x.opp.toLowerCase()}{' '}
                          <span className="font-mono tabular-nums">{x.for.toFixed(1)}</span>
                        </span>
                      ))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className={NOTE}>
          For the best squad over these weeks within the budget, see the <Link to="/fpl/optimal-squad" className={LINK}>optimal squad</Link>.
        </p>
      </section>

      <section className="rounded-lg border border-chalk-300 bg-white p-4 max-w-prose text-sm text-ink-700 space-y-2" aria-labelledby="how-preview">
        <h2 id="how-preview" className={H2}>How this was worked out</h2>
        <p>
          Generated from FixtureShark&rsquo;s projections ({p.source}) on {dm(p.generated_at)}; nothing is written by hand. Team goals come
          from betting-market ratings where a price exists, otherwise from the Dixon-Coles model. Players listed are owned by 1%+ or among the
          50 highest projected for the next five gameweeks.
        </p>
      </section>
    </>
  );
}
