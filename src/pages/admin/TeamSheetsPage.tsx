// ============================================================================
// src/pages/admin/TeamSheetsPage.tsx   (/admin/team-sheets)
//
// Team sheets: expected v actual (Chris, 1 Nov 2026). Every Premier League
// team-game this season: the model's predicted XI against the real one, and
// against a naive baseline (the same XI as the team's previous league game),
// with the season trend. Admin only while the model trails the baseline;
// written so it can open up later (see src/lib/teamSheetsApi.ts).
//
// Predictions are the pre-deadline snapshot -- what was published before the
// deadline. GW5 has only a model run from 17 Sep; GW1-4 have none, and are
// never back-filled.
// ============================================================================

import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import SortableTable, { type Column } from '../../components/SortableTable';
import LineChart, { ChartLegend } from '../../components/history/LineChart';
import {
  byClub, byGameweek, getTeamSheetDetail, getTeamSheets, POS, SOURCE_LABEL, summarise,
  type ClubRow, type GameweekRow, type Score, type TeamGame, type TeamSheetDetail, type TeamSheetList,
} from '../../lib/teamSheetsApi';

const pct = (n: number | null | undefined, dp = 1) => (n == null ? '—' : `${n.toFixed(dp)}%`);
const chance = (sp: number | null | undefined) => (sp == null ? '—' : `${Math.round(sp * 100)}%`);
const own = (o: number | null | undefined) => (o == null ? '—' : `${Number(o).toFixed(1)}%`);
const of11 = (n: number | null) => (n == null ? '—' : `${n}/11`);
const when = (t: string | null) =>
  t ? new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '';
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">{title}</h2>
      {note && <p className="text-xs text-ink-500">{note}</p>}
      {children}
    </section>
  );
}

function Tile({ label, value, note, testId }: { label: string; value: string; note?: string; testId?: string }) {
  return (
    <div className="border border-chalk-300 rounded-lg bg-white p-3" data-testid={testId}>
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="text-2xl font-semibold text-ink-900 tabular-nums">{value}</div>
      {note && <div className="text-[11px] text-ink-500 mt-0.5">{note}</div>}
    </div>
  );
}

/** Model v baseline, coloured by which is ahead. */
function Versus({ model, baseline }: { model: number | null; baseline: number | null }) {
  if (model == null || baseline == null) return null;
  const d = model - baseline;
  const cls = Math.abs(d) < 0.05 ? 'text-ink-500' : d > 0 ? 'text-pitch-700' : 'text-loss-700';
  return <span className={`text-xs ${cls}`}>{d > 0 ? '+' : ''}{d.toFixed(1)} pts v baseline</span>;
}

// ---------------------------------------------------------------------------
// Team-game detail
// ---------------------------------------------------------------------------

function DetailPanel({ seasonId, game }: { seasonId: number; game: TeamGame }) {
  const [d, setD] = useState<TeamSheetDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getTeamSheetDetail(seasonId, game.fixture_id, game.team_id)
      .then((x) => { if (!cancelled) setD(x); })
      .catch((e) => { if (!cancelled) setError(errText(e)); });
    return () => { cancelled = true; };
  }, [seasonId, game.fixture_id, game.team_id]);

  if (error) return <p className="text-sm text-loss-700">Could not load the team sheet: {error}</p>;
  if (!d) return <p className="text-sm text-ink-500">Loading…</p>;

  const hasModel = d.model_source != null;
  const surprises = d.actual.filter((a) => a.predicted === false).sort((a, b) => (a.sp ?? 0) - (b.sp ?? 0));
  const leftOut = d.predicted.filter((p) => !p.started).sort((a, b) => (b.own ?? 0) - (a.own ?? 0));
  const newIn = d.actual.filter((a) => a.in_baseline === false);
  const dropped = d.baseline.filter((b) => !b.started);
  const role = (id: number) => d.roles[String(id)];

  return (
    <div className="space-y-3 text-sm" data-testid={`detail-${game.fixture_id}-${game.team_id}`}>
      <p className="text-xs text-ink-500">
        {hasModel
          ? `${SOURCE_LABEL[d.model_source!]} (${d.model_version ?? 'model'}, ${when(d.model_at)}).`
          : 'No stored prediction for this gameweek.'}
        {d.baseline_opponent ? ` Baseline: the XI that started v ${d.baseline_opponent}.` : ' No previous game, so no baseline.'}
        {d.formation ? ` Formation (BBC): ${d.formation}.` : ''}
      </p>

      <div className="grid gap-3 md:grid-cols-3">
        {hasModel && (
          <div>
            <h4 className="text-xs uppercase tracking-wide text-ink-500 mb-1">Predicted XI</h4>
            <ul className="divide-y divide-chalk-200">
              {d.predicted.map((p) => (
                <li key={p.id} className="flex justify-between gap-2 py-0.5">
                  <span className={p.started ? 'text-ink-900' : 'text-loss-700 line-through'}>
                    <span className="text-[11px] font-mono text-ink-500 mr-1">{POS[p.pos] ?? ''}</span>{p.name}
                  </span>
                  <span className="font-mono text-ink-700">{chance(p.sp)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h4 className="text-xs uppercase tracking-wide text-ink-500 mb-1">Actual XI</h4>
          <ul className="divide-y divide-chalk-200">
            {d.actual.map((a) => (
              <li key={a.id} className="flex justify-between gap-2 py-0.5">
                <span className={a.predicted === false ? 'text-amber-800 font-medium' : 'text-ink-900'}>
                  <span className="text-[11px] font-mono text-ink-500 mr-1">{role(a.id) ?? POS[a.pos] ?? ''}</span>{a.name}
                </span>
                <span className="font-mono text-ink-500 text-xs">{a.mins}′{hasModel ? ` · ${chance(a.sp)}` : ''}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          {hasModel && (
            <>
              <div>
                <h4 className="text-xs uppercase tracking-wide text-ink-500 mb-1">Surprise starters</h4>
                {surprises.length === 0 ? <p className="text-ink-500">None.</p> : (
                  <ul>{surprises.map((a) => <li key={a.id}>{a.name} <span className="text-ink-500">(we gave {chance(a.sp)})</span></li>)}</ul>
                )}
              </div>
              <div>
                <h4 className="text-xs uppercase tracking-wide text-ink-500 mb-1">Expected starters left out</h4>
                {leftOut.length === 0 ? <p className="text-ink-500">None.</p> : (
                  <ul>{leftOut.map((p) => (
                    <li key={p.id}>{p.name} <span className="text-ink-500">({chance(p.sp)}, owned {own(p.own)}{p.mins ? `, ${p.mins}′ off the bench` : ''})</span></li>
                  ))}</ul>
                )}
              </div>
            </>
          )}
          {d.baseline_fixture_id != null && (
            <div>
              <h4 className="text-xs uppercase tracking-wide text-ink-500 mb-1">Changes from last game</h4>
              {newIn.length === 0 ? <p className="text-ink-500">Same XI.</p> : (
                <p>In: {newIn.map((a) => a.name).join(', ')}. Out: {dropped.map((b) => b.name).join(', ')}.</p>
              )}
            </div>
          )}
          {d.subs.length > 0 && (
            <div>
              <h4 className="text-xs uppercase tracking-wide text-ink-500 mb-1">Substitutions (BBC)</h4>
              <ul>{d.subs.map((s, i) => (
                <li key={i}><span className="font-mono text-ink-500">{s.minute ?? '?'}′</span> {s.on ?? '?'} for {s.off ?? '?'}</li>
              ))}</ul>
              {d.subs_complete === false && <p className="text-xs text-ink-500">Not every substitution is recorded.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One gameweek's team-games: sortable, each row expands to its team sheet
// ---------------------------------------------------------------------------

type SortKey = 'team' | 'model' | 'baseline' | 'kickoff';

function GameweekTable({ seasonId, games }: { seasonId: number; games: TeamGame[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'kickoff', dir: 'asc' });
  const [open, setOpen] = useState<string | null>(null);
  const hasModel = games.some((g) => g.model_matched != null);
  const rows = useMemo(() => {
    const v = (g: TeamGame): string | number | null =>
      sort.key === 'team' ? g.team : sort.key === 'model' ? g.model_matched : sort.key === 'baseline' ? g.baseline_matched : g.kickoff;
    const f = sort.dir === 'asc' ? 1 : -1;
    return [...games].sort((a, b) => {
      const va = v(a); const vb = v(b);
      if (va == null || vb == null) return va == null ? (vb == null ? 0 : 1) : -1;
      return f * (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb)))
        || a.fixture_id - b.fixture_id || Number(b.home) - Number(a.home);
    });
  }, [games, sort]);
  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'team' || key === 'kickoff' ? 'asc' : 'desc' }));
  const th = (key: SortKey, label: string, right = false, cls = '') => (
    <th scope="col" className={`font-medium text-xs px-2 py-2 ${right ? 'text-right' : 'text-left'} ${cls}`}
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggle(key)} className="inline-flex items-center gap-1 hover:text-ink-900">
        {label}
        <span aria-hidden className={sort.key === key ? 'text-ink-900' : 'opacity-40'}>{sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
  const cols = 5 + (hasModel ? 1 : 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden" data-testid="gw-games">
        <thead className="bg-chalk-200 text-ink-500">
          <tr>
            {th('team', 'Team')}
            <th scope="col" className="font-medium text-xs px-2 py-2 text-left">Opponent</th>
            {th('kickoff', 'Kick-off', false, 'hidden sm:table-cell')}
            {hasModel && th('model', 'Model', true)}
            {th('baseline', 'Baseline', true)}
            <th scope="col" className="font-medium text-xs px-2 py-2 text-left">{hasModel ? 'Biggest surprise' : 'New in'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const key = `${g.fixture_id}-${g.team_id}`;
            const isOpen = open === key;
            return (
              <Fragment key={key}>
                <tr className="border-t border-chalk-200 bg-white">
                  <td className="px-2 py-1.5">
                    <button type="button" onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}
                      className="inline-flex items-center gap-1 text-left font-medium text-ink-900 hover:underline">
                      <span aria-hidden className="text-ink-500 w-3">{isOpen ? '−' : '+'}</span>{g.team}
                    </button>
                    {!g.final && <span className="ml-1 text-[11px] text-amber-800">provisional</span>}
                  </td>
                  <td className="px-2 py-1.5 text-ink-700">{g.home ? 'v' : '@'} {g.opponent_short}</td>
                  <td className="px-2 py-1.5 text-ink-500 hidden sm:table-cell">{when(g.kickoff)}</td>
                  {hasModel && <td className="px-2 py-1.5 text-right font-mono">{of11(g.model_matched)}</td>}
                  <td className="px-2 py-1.5 text-right font-mono">{of11(g.baseline_matched)}</td>
                  <td className="px-2 py-1.5 text-ink-700">
                    {hasModel
                      ? (g.surprise ? <>{g.surprise.name} <span className="text-ink-500">({chance(g.surprise.sp)})</span></> : '—')
                      : (g.new_in.length ? g.new_in.join(', ') : g.baseline_matched == null ? '—' : 'Same XI')}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="bg-chalk-100">
                    <td colSpan={cols} className="px-3 py-3"><DetailPanel seasonId={seasonId} game={g} /></td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------

const scoreCell = (s: Score) => pct(s.pct);

export default function TeamSheetsPage() {
  useDocumentHead({ title: 'Team sheets: expected v actual', description: 'Admin: predicted XIs against the real ones, and against last game\'s XI.' });
  const isAdmin = useAuthOptional()?.isAdmin ?? false;
  const [data, setData] = useState<TeamSheetList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gw, setGw] = useState<number | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    getTeamSheets()
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(errText(e)); });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const games = useMemo(() => data?.games ?? [], [data]);
  const summary = useMemo(() => summarise(games), [games]);
  const weeks = useMemo(() => byGameweek(games), [games]);
  const clubs = useMemo(() => byClub(games), [games]);
  const shownGw = gw ?? (weeks.length ? weeks[weeks.length - 1].gw : null);

  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Team sheets: expected v actual</h1>
        <p className="text-sm text-ink-700">This page is for admins.</p>
      </div>
    );
  }

  const modelWeeks = weeks.filter((w) => w.model.pct != null);
  const allPcts = weeks.flatMap((w) => [w.model.pct, w.baseline.pct]).filter((x): x is number => x != null);
  const yMin = allPcts.length ? Math.max(0, Math.floor((Math.min(...allPcts) - 5) / 5) * 5) : 0;
  const firstModelGw = modelWeeks[0]?.gw;

  const weekCols: Column<GameweekRow>[] = [
    { key: 'gw', label: 'GW', render: (r) => r.gw, sortValue: (r) => r.gw },
    { key: 'n', label: 'Team-games', align: 'right', className: 'hidden sm:table-cell', render: (r) => <>{r.teamGames}{r.provisional ? <span className="text-amber-800"> ({r.provisional} provisional)</span> : null}</>, sortValue: (r) => r.teamGames },
    { key: 'm', label: 'Model', align: 'right', render: (r) => scoreCell(r.model), sortValue: (r) => r.model.pct, descFirst: true },
    { key: 'b', label: 'Baseline', align: 'right', render: (r) => scoreCell(r.baseline), sortValue: (r) => r.baseline.pct, descFirst: true },
    { key: 'mf', label: 'Full XI: model', align: 'right', className: 'hidden sm:table-cell', render: (r) => (r.model.games ? r.model.full : '—'), sortValue: (r) => (r.model.games ? r.model.full : null), descFirst: true },
    { key: 'bf', label: 'Full XI: baseline', align: 'right', className: 'hidden sm:table-cell', render: (r) => (r.baseline.games ? r.baseline.full : '—'), sortValue: (r) => (r.baseline.games ? r.baseline.full : null), descFirst: true },
    { key: 's', label: 'Prediction', className: 'hidden md:table-cell', render: (r) => (r.source ? SOURCE_LABEL[r.source] : 'None stored'), sortValue: (r) => r.source ?? '' },
  ];
  const clubCols: Column<ClubRow>[] = [
    { key: 't', label: 'Club', render: (r) => r.team, sortValue: (r) => r.team },
    { key: 'g', label: 'Games', align: 'right', render: (r) => r.model.games, sortValue: (r) => r.model.games },
    { key: 'm', label: 'Model', align: 'right', render: (r) => scoreCell(r.model), sortValue: (r) => r.model.pct, descFirst: true },
    { key: 'b', label: 'Baseline', align: 'right', render: (r) => scoreCell(r.baseline), sortValue: (r) => r.baseline.pct, descFirst: true },
    { key: 'd', label: 'Model v baseline', align: 'right', render: (r) => (r.gap == null ? '—' : `${r.gap > 0 ? '+' : ''}${r.gap.toFixed(1)}`), sortValue: (r) => r.gap },
    { key: 'f', label: 'Full XI: model', align: 'right', className: 'hidden sm:table-cell', render: (r) => r.model.full, sortValue: (r) => r.model.full, descFirst: true },
  ];

  return (
    <div className="space-y-6" data-testid="team-sheets">
      <div className="space-y-1">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Team sheets: expected v actual</h1>
        <p className="text-sm text-ink-700">
          Premier League starting XIs: our model&apos;s prediction against the real team sheet, and against a simple
          baseline &mdash; the same XI as the team&apos;s previous league game.
        </p>
        <p className="text-xs text-ink-500">
          Predictions are the pre-deadline snapshot: what was published before the FPL deadline.
          {firstModelGw === 5 && ' GW5 uses the model run of 17 Sep, the only one kept from before that deadline.'}
          {' '}GW1–4 have no stored prediction and are shown with the baseline only. Starters come from FPL&apos;s data.
          {data?.computed_at ? ` Updated ${when(data.computed_at)}.` : ''}
        </p>
      </div>

      {error && <p className="text-sm text-loss-700">Could not load team sheets: {error}</p>}
      {!data && !error && <p className="text-sm text-ink-500">Loading…</p>}

      {data && games.length === 0 && <p className="text-sm text-ink-500">No team-games yet this season.</p>}

      {data && games.length > 0 && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <div className="border border-chalk-300 rounded-lg bg-white p-3" data-testid="tile-model">
              <div className="text-[11px] uppercase tracking-wide text-ink-500">Model: starters called</div>
              <div className="text-2xl font-semibold text-ink-900 tabular-nums">{pct(summary.model.pct)}</div>
              <Versus model={summary.model.pct} baseline={summary.baselineSame.pct} />
              <div className="text-[11px] text-ink-500 mt-0.5">{summary.model.games} team-games with a prediction</div>
            </div>
            <Tile testId="tile-baseline" label="Baseline: same games" value={pct(summary.baselineSame.pct)}
              note={`${pct(summary.baselineAll.pct)} over all ${summary.baselineAll.games} with a previous game`} />
            <Tile label="Team-games so far" value={String(summary.teamGames)}
              note={summary.provisional ? `${summary.provisional} still provisional` : 'All final'} />
            <Tile testId="tile-full" label="Whole XI right" value={`${summary.model.full} v ${summary.baselineSame.full}`}
              note="Model v baseline, same games" />
          </div>

          <Section title="Season trend" note="Share of starters called correctly, per gameweek.">
            <ChartLegend items={[
              { label: 'Model', swatchClass: 'bg-pitch-700' },
              { label: 'Baseline (last game\'s XI)', swatchClass: 'bg-cup-600', dashed: true },
            ]} />
            <LineChart
              ariaLabel="Share of starters called correctly per gameweek: model and baseline"
              xLabel="Gameweek" yLabel="% of starters" yMin={yMin} yMax={100} height={240}
              series={[
                { id: 'model', label: 'Model', strokeClass: 'stroke-pitch-700', dots: true,
                  points: modelWeeks.map((w) => ({ x: w.gw, y: Math.round(w.model.pct! * 10) / 10 })) },
                { id: 'baseline', label: 'Baseline', strokeClass: 'stroke-cup-600', dots: true, dashed: true,
                  points: weeks.filter((w) => w.baseline.pct != null).map((w) => ({ x: w.gw, y: Math.round(w.baseline.pct! * 10) / 10 })) },
              ]}
              pointTitle={(s, p) => `${s.label}, GW${p.x}: ${p.y}%`}
            />
            <SortableTable columns={weekCols} rows={weeks} rowKey={(r) => String(r.gw)} initialSort={{ key: 'gw', dir: 'asc' }} testId="by-gameweek" />
          </Section>

          <Section title="By gameweek" note="Each row opens the team sheet: predicted XI, actual XI, and formation and substitutions where the BBC line-ups are in.">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Gameweek">
              {weeks.map((w) => (
                <button key={w.gw} type="button" onClick={() => setGw(w.gw)} aria-pressed={shownGw === w.gw}
                  className={`px-3 py-1 rounded-full text-sm border ${shownGw === w.gw ? 'bg-ink-900 text-white border-ink-900' : 'bg-white text-ink-700 border-chalk-300'}`}>
                  GW{w.gw}
                </button>
              ))}
            </div>
            {shownGw != null && (
              <GameweekTable key={shownGw} seasonId={data.season_id} games={games.filter((g) => g.gw === shownGw)} />
            )}
          </Section>

          <Section title="By club" note="Team-games with both a prediction and a previous game. Clubs the model reads worst first.">
            <SortableTable columns={clubCols} rows={clubs} rowKey={(r) => String(r.team_id)} initialSort={{ key: 'm', dir: 'asc' }} testId="by-club" />
          </Section>
        </>
      )}
    </div>
  );
}
