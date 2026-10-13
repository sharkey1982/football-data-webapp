// ============================================================================
// src/components/fpl/GameweekReflection.tsx
//
// The gameweek reflection, organised around five themes (Chris, 13 Oct
// 2026): team goals; positions and playing time; injuries, suspensions and
// fixture congestion; set pieces; captaincy. Each theme reads the same way:
// a verdict, what happened against what the model expected, then a "What
// changes in the model" box saying what changed, what is being watched and
// what isn't modelled. All text comes from scripts/fpl_gameweek_report.py;
// this file lays it out.
// ============================================================================

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LINK } from '../articles/ArticleLayout';
import ReportTable from './ReportTable';
import {
  pct,
  signed,
  statusLabel,
  type CaptainRange,
  type CupGame,
  type ReflectionPayload,
  type TeamGoals,
  type ThemeKey,
} from '../../lib/fplGameweekReport';

type Chip = { label: string; tone: 'changed' | 'pending' | 'watch' | 'none' };

const CHIP: Record<Chip['tone'], string> = {
  changed: 'bg-pitch-800 text-white',
  pending: 'bg-amber-400 text-ink-900',
  watch: 'border border-pitch-800 text-pitch-800',
  none: 'border border-ink-500 text-ink-700',
};

const THEMES: { key: ThemeKey; title: string; anchor: string }[] = [
  { key: 'goals', title: 'Team goals', anchor: 'goals' },
  { key: 'minutes', title: 'Positions and playing time', anchor: 'minutes' },
  { key: 'incidents', title: 'Injuries, suspensions and congestion', anchor: 'incidents' },
  { key: 'set_pieces', title: 'Set pieces', anchor: 'set-pieces' },
  { key: 'captaincy', title: 'Captaincy', anchor: 'captaincy' },
];
const ANCHOR = Object.fromEntries(THEMES.map((t) => [t.key, t.anchor])) as Record<ThemeKey, string>;

const H3 = 'font-display uppercase tracking-wide text-base text-ink-900';
const NOTE = 'text-sm text-ink-500 max-w-prose';
const CARD = 'rounded-lg border border-chalk-300 bg-white p-3 sm:p-4';
const MONO_LABEL = 'font-mono text-[11px] uppercase tracking-widest text-ink-500';

const day = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const kick = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
const who = (p: { name: string; team: string }) => (
  <>
    {p.name}{' '}
    <span className="block text-xs text-ink-500">{p.team}</span>
  </>
);

export function ChipTag({ chip }: { chip: Chip }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-widest ${CHIP[chip.tone]}`}>
      {chip.label}
    </span>
  );
}

/** One label per theme saying what the model did about it. */
export function themeChips(p: ReflectionPayload): Record<ThemeKey, Chip> {
  const prem = p.captaincy.season.find((r) => r.key === 'premium');
  const form = p.captaincy.season.find((r) => r.key === 'form');
  const review = p.set_pieces.order_changes.filter((r) => r.needs_review).length;
  const congested = (p.incidents.congestion.before_next ?? []).length > 0;
  return {
    goals: p.goals.ratings.status === 'updated'
      ? { label: 'Ratings updated', tone: 'changed' }
      : { label: 'Waiting for prices', tone: 'pending' },
    minutes: p.minutes.counts.start_moves
      ? { label: `${p.minutes.counts.start_moves} start chances moved`, tone: 'changed' }
      : { label: 'No big moves', tone: 'none' },
    incidents: congested
      ? { label: 'Congestion not modelled', tone: 'none' }
      : p.incidents.worse_count + p.incidents.better_count
        ? { label: 'Flags updated', tone: 'changed' }
        : { label: 'No change', tone: 'none' },
    set_pieces: review
      ? { label: `${review} to check`, tone: 'pending' }
      : p.set_pieces.order_changes.length
        ? { label: 'Ours already agree', tone: 'changed' }
        : { label: 'No change', tone: 'none' },
    captaincy: prem && form
      ? { label: `Premium ${prem.captain_points} v form ${form.captain_points}`, tone: 'watch' }
      : { label: 'No model change', tone: 'none' },
  };
}

function Theme({ n, theme, verdict, children }: { n: number; theme: (typeof THEMES)[number]; verdict: { head: string; rest: string }; children: ReactNode }) {
  return (
    <section aria-labelledby={theme.anchor} className="space-y-4 border-t-[3px] border-ink-900 pt-4">
      <div className="space-y-1">
        <p className="font-mono text-xs text-ink-500">{n} of 5</p>
        <h2 id={theme.anchor} className="font-display uppercase tracking-wide text-2xl sm:text-3xl text-ink-900 scroll-mt-20">{theme.title}</h2>
        <p className="text-ink-900 text-base sm:text-lg leading-relaxed max-w-prose">
          <strong className="font-semibold">{verdict.head}</strong> {verdict.rest}
        </p>
      </div>
      {children}
    </section>
  );
}

function ModelBox({ chips, children, title = 'What changes in the model' }: { chips: Chip[]; children: ReactNode; title?: string }) {
  return (
    <div className="rounded-xl border-2 border-pitch-800 bg-white p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display uppercase tracking-wide text-lg text-pitch-800">{title}</h3>
        <div className="flex flex-wrap gap-1.5">{chips.map((c) => <ChipTag key={c.label} chip={c} />)}</div>
      </div>
      <div className="text-ink-700 space-y-3 max-w-prose">{children}</div>
    </div>
  );
}

function Kpis({ items }: { items: { value: string; label: string }[] }) {
  return (
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {items.map((k) => (
        <div key={k.label} className={`${CARD} flex flex-col-reverse justify-end`}>
          <dt className="mt-1 text-xs sm:text-sm text-ink-700 leading-snug">{k.label}</dt>
          <dd className="font-display text-2xl sm:text-3xl leading-none text-ink-900">{k.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---- 1. Team goals ---------------------------------------------------------

const SCALE = 5.5;
const at = (v: number, scale = SCALE) => `${Math.max(0, Math.min(100, (v / scale) * 100))}%`;

function GoalsChart({ rows }: { rows: TeamGoals[] }) {
  const max = Math.max(SCALE, ...rows.map((r) => Math.max(r.goals, r.xg ?? 0, r.exp) + 0.5));
  const ticks = Array.from({ length: Math.floor(max) + 1 }, (_, i) => i);
  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border-2 border-ink-900 bg-white" />Expected at the deadline</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2.5 w-2.5 rotate-45 bg-amber-500" />xG (chances)</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-full bg-pitch-800" />Goals</span>
      </figcaption>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Each team: expected goals at the deadline, xG and goals</caption>
          <thead>
            <tr className={MONO_LABEL}>
              <th scope="col" className="text-left font-normal pb-1 w-24 sm:w-40">Team</th>
              <th scope="col" className="font-normal pb-1 px-1.5">
                <span className="sr-only">Chart</span>
                <span aria-hidden="true" className="relative block h-4">
                  {ticks.map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: at(t, max) }}>{t}</span>)}
                </span>
              </th>
              <th scope="col" className="text-right font-normal pb-1 w-11 sm:w-20 leading-tight">Goals v exp</th>
              <th scope="col" className="text-right font-normal pb-1 w-11 sm:w-20 leading-tight">xG v exp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const lo = Math.min(r.exp, r.goals, r.xg ?? r.exp);
              const hi = Math.max(r.exp, r.goals, r.xg ?? r.exp);
              const dg = r.goals - r.exp;
              const dx = r.xg === null ? null : r.xg - r.exp;
              return (
                <tr key={r.team} className="border-t border-chalk-100">
                  <th scope="row" className="text-left font-normal py-1 pr-1 leading-tight">
                    <span className="font-semibold text-[13px] sm:text-sm">{r.team}</span>{' '}
                    <span className="block sm:inline text-xs text-ink-500">{r.home ? 'v' : '@'} {r.opp}</span>
                  </th>
                  <td className="py-1 px-1.5">
                    <div className="relative h-5" role="img" aria-label={`Expected ${r.exp.toFixed(1)}, xG ${r.xg?.toFixed(1) ?? 'unknown'}, scored ${r.goals}`}>
                      <div className="absolute inset-x-0 top-[9px] h-0.5 bg-chalk-200" />
                      <div className="absolute top-[9px] h-0.5 bg-chalk-300" style={{ left: at(lo, max), width: at(hi - lo, max) }} />
                      <span className="absolute top-1 -ml-1.5 h-3 w-3 rounded-full border-2 border-ink-900 bg-white" style={{ left: at(r.exp, max) }} />
                      {r.xg !== null ? <span className="absolute top-[5px] -ml-[5px] h-2.5 w-2.5 rotate-45 bg-amber-500" style={{ left: at(r.xg, max) }} /> : null}
                      <span className="absolute top-1 -ml-1.5 h-3 w-3 rounded-full bg-pitch-800" style={{ left: at(r.goals, max) }} />
                    </div>
                  </td>
                  <td className={`py-1 text-right font-mono ${dg >= 0.5 ? 'text-pitch-800 font-semibold' : dg <= -0.5 ? 'text-orange-800 font-semibold' : ''}`}>{signed(dg)}</td>
                  <td className={`py-1 text-right font-mono ${dx !== null && dx >= 0.5 ? 'text-pitch-800 font-semibold' : dx !== null && dx <= -0.5 ? 'text-orange-800 font-semibold' : ''}`}>{signed(dx)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

/** The week's clearest signal (chances above expectation) and noise (finishing above chances). */
function signalNoise(rows: TeamGoals[]) {
  const withXg = rows.filter((r) => r.xg !== null) as (TeamGoals & { xg: number })[];
  const signal = [...withXg].sort((a, b) => b.xg - b.exp - (a.xg - a.exp))[0];
  const noise = [...withXg].sort((a, b) => b.goals - b.xg - (a.goals - a.xg))[0];
  return {
    signal: signal && signal.xg - signal.exp >= 0.75 ? signal : null,
    noise: noise && noise.goals - noise.xg >= 1.5 ? noise : null,
  };
}

function Goals({ p }: { p: ReflectionPayload }) {
  const g = p.goals;
  const { signal, noise } = signalNoise(g.teams);
  const byAtt = [...g.season].sort((a, b) => b.attack_vs_market - a.attack_vs_market);
  const byDef = [...g.season].sort((a, b) => b.defence_vs_market - a.defence_vs_market);
  const cards = [
    { title: 'Creating more than expected', rows: byAtt.filter((r) => r.attack_vs_market >= 1).slice(0, 4).map((r) => [r.team, r.attack_vs_market] as const), up: true },
    { title: 'Creating less than expected', rows: [...byAtt].reverse().filter((r) => r.attack_vs_market <= -1).slice(0, 4).map((r) => [r.team, r.attack_vs_market] as const), up: false },
    { title: 'Allowing less than expected', rows: byDef.filter((r) => r.defence_vs_market >= 1).slice(0, 4).map((r) => [r.team, r.defence_vs_market] as const), up: true },
    { title: 'Allowing more than expected', rows: [...byDef].reverse().filter((r) => r.defence_vs_market <= -1).slice(0, 4).map((r) => [r.team, r.defence_vs_market] as const), up: false },
  ].filter((c) => c.rows.length);
  const r = g.ratings;
  return (
    <>
      <h3 className={H3}>Expected v chances v goals, by team</h3>
      <GoalsChart rows={g.teams} />
      {signal || noise ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {signal ? (
            <div className={CARD}>
              <p className={`${MONO_LABEL} !text-pitch-800`}>Signal: chances</p>
              <p className="mt-1 text-ink-900">
                {signal.team} made {signal.xg.toFixed(1)} xG against {signal.exp.toFixed(1)} expected and scored {signal.goals}. Chance creation
                running ahead of the market is the kind of result that can move a rating.
              </p>
            </div>
          ) : null}
          {noise ? (
            <div className={CARD}>
              <p className={`${MONO_LABEL} !text-orange-800`}>Noise: finishing</p>
              <p className="mt-1 text-ink-900">
                {noise.team} scored {noise.goals} from {noise.xg.toFixed(1)} xG (expected {noise.exp.toFixed(1)}). A big week for their
                attackers, but finishing streaks rarely carry into the next match.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      {cards.length ? (
        <>
          <h3 className={H3}>The season so far: where the market has been wrong</h3>
          <p className={NOTE}>Season xG compared with the goals the closing prices expected, per team. These are the gaps the ratings can still close.</p>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.title} className={CARD}>
                <p className={MONO_LABEL}>{c.title}</p>
                <ul className="mt-1 space-y-0.5 text-sm">
                  {c.rows.map(([team, v]) => (
                    <li key={team} className="flex justify-between gap-2">
                      <span>{team}</span>
                      <span className={`font-mono ${c.up ? 'text-pitch-800' : 'text-orange-800'}`}>{signed(v)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <ModelBox chips={[r.status === 'updated' ? { label: 'Changed', tone: 'changed' } : { label: 'Waiting for prices', tone: 'pending' }]}>
        <p>
          Team ratings come from bookmakers&rsquo; closing prices, not results, so they move when the market&rsquo;s view moves: results backed
          by chances tend to move it, finishing luck mostly doesn&rsquo;t.
        </p>
        {r.status === 'updated' && r.moves.length ? (
          <>
            <p>Biggest movers since the deadline, and what that does to their next five fixtures (GW{g.next5_gws[0]}–{g.next5_gws[1]}):</p>
            <ReportTable
              caption="Team rating moves since the deadline"
              rows={r.moves}
              columns={[
                { label: 'Team', render: (m) => m.team, sort: (m) => m.team, align: 'left' },
                { label: 'Attack', render: (m) => <span className="whitespace-nowrap">{m.att_before.toFixed(2)} → {m.att_now.toFixed(2)}</span>, sort: (m) => m.att_now - m.att_before },
                { label: 'Conceding', render: (m) => <span className="whitespace-nowrap">{m.def_before.toFixed(2)} → {m.def_now.toFixed(2)}</span>, sort: (m) => m.def_now - m.def_before },
                { label: 'Next 5 scored', render: (m) => (m.for5_now === null ? '–' : <span className="whitespace-nowrap">{m.for5_before?.toFixed(1)} → {m.for5_now.toFixed(1)}</span>), sort: (m) => (m.for5_now ?? 0) - (m.for5_before ?? 0) },
                { label: 'Next 5 conceded', render: (m) => (m.against5_now === null ? '–' : <span className="whitespace-nowrap">{m.against5_before?.toFixed(1)} → {m.against5_now.toFixed(1)}</span>), sort: (m) => (m.against5_now ?? 0) - (m.against5_before ?? 0) },
              ]}
            />
            <p className="text-sm text-ink-500">Attack and conceding are goals per match against an average side, at the deadline → now.</p>
          </>
        ) : (
          <p>
            This gameweek&rsquo;s closing prices hadn&rsquo;t arrived when this was written, so the ratings haven&rsquo;t moved for these
            results yet.
          </p>
        )}
      </ModelBox>
    </>
  );
}

// ---- 2. Positions and playing time ------------------------------------------

function Minutes({ p }: { p: ReflectionPayload }) {
  const m = p.minutes;
  const c = m.counts;
  const lines = m.positions.filter((r) => r.kind !== 'side');
  const watching = p.model_summary.considering.filter((x) => x.theme === 'minutes');
  return (
    <>
      <Kpis
        items={[
          { value: m.brier === null ? '–' : m.brier.toFixed(3), label: `start forecast error (Brier) over ${m.players} players; 0.25 is a coin flip` },
          { value: String(c.absences), label: `at 70%+ to start who didn’t (${c.absences_flagged} flagged by FPL)` },
          { value: String(c.starters), label: 'started from under 30%' },
          { value: String(c.line_changes), label: 'played a different line from the model’s' },
        ]}
      />
      <div className="grid gap-3 lg:grid-cols-3">
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-ink-900 mb-2">Expected to start, didn&rsquo;t</h3>
          <ReportTable
            caption="Players over 70% to start who didn't"
            rows={m.surprise_absences.slice(0, 6)}
            empty="Everyone the model had over 70% started."
            columns={[
              { label: 'Player', render: who, sort: (r) => r.name, align: 'left' },
              { label: 'Chance', render: (r) => pct(r.p), sort: (r) => r.p },
              { label: 'Mins', render: (r) => r.minutes, sort: (r) => r.minutes },
            ]}
          />
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-ink-900 mb-2">Started against the odds</h3>
          <ReportTable
            caption="Players under 30% to start who did"
            rows={[...m.surprise_starters].sort((a, b) => b.pts - a.pts).slice(0, 6)}
            empty="Nobody under 30% started."
            columns={[
              { label: 'Player', render: who, sort: (r) => r.name, align: 'left' },
              { label: 'Chance', render: (r) => pct(r.p), sort: (r) => r.p },
              { label: 'Pts', render: (r) => r.pts, sort: (r) => r.pts },
            ]}
          />
        </div>
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-ink-900 mb-2">Played a different line</h3>
          <ReportTable
            caption="Players who changed line"
            rows={lines.slice(0, 6)}
            empty="Nobody changed line."
            columns={[
              { label: 'Player', render: who, sort: (r) => r.name, align: 'left' },
              { label: 'Model', render: (r) => r.model_role, align: 'left' },
              { label: 'Played', render: (r) => r.played_role, align: 'left' },
            ]}
          />
          {c.side_changes ? <p className="mt-2 text-xs text-ink-500">Plus {c.side_changes} who changed position within the same line.</p> : null}
        </div>
      </div>
      {m.early_subs.length ? (
        <details className={CARD}>
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">Taken off early ({c.early_subs})</summary>
          <div className="mt-2">
            <ReportTable
              caption="Starters expected to play 70+ minutes who went off before 60"
              rows={m.early_subs}
              columns={[
                { label: 'Player', render: who, sort: (r) => r.name, align: 'left' },
                { label: 'Expected', render: (r) => `${r.xmin}′`, sort: (r) => r.xmin },
                { label: 'Played', render: (r) => `${r.minutes}′`, sort: (r) => r.minutes },
              ]}
            />
          </div>
        </details>
      ) : null}
      <ModelBox chips={[c.start_moves ? { label: 'Changed', tone: 'changed' } : { label: 'No big moves', tone: 'none' }, ...(watching.length ? [{ label: 'Watching', tone: 'watch' as const }] : [])]}>
        <p>GW{m.next_gw} start chances that moved most since the deadline, and why:</p>
        <ReportTable
          caption="Start chances for next gameweek now, against this gameweek's deadline"
          rows={m.next_gw_moves.slice(0, 8)}
          empty="No regular or popular player's start chance has moved by 20 points or more."
          columns={[
            { label: 'Player', render: who, sort: (r) => r.name, align: 'left' },
            { label: 'Before', render: (r) => pct(r.before), sort: (r) => r.before },
            { label: 'Now', render: (r) => <span className={r.change > 0 ? 'text-pitch-800 font-semibold' : 'text-orange-800 font-semibold'}>{pct(r.now)}</span>, sort: (r) => r.now },
            { label: 'Why', render: (r) => <span className="text-xs sm:text-sm">{r.reason}</span>, align: 'left' },
          ]}
        />
        {watching.map((w) => (
          <p key={w.text} className="flex flex-wrap items-start gap-2 rounded-lg bg-chalk-100 px-3 py-2 text-sm">
            <ChipTag chip={{ label: 'Watching', tone: 'watch' }} />
            <span>{w.text}. A new position is recorded as one the player also plays; if it repeats, his role (and goal share) changes.</span>
          </p>
        ))}
      </ModelBox>
    </>
  );
}

// ---- 3. Incidents ----------------------------------------------------------

function CongestionTable({ rows }: { rows: CupGame[] }) {
  return (
    <ReportTable
      caption="Teams with a cup or European match before their next league match"
      rows={rows}
      columns={[
        { label: 'Team', render: (r) => <span className="font-semibold">{r.team}</span>, sort: (r) => r.team, align: 'left' },
        { label: 'Midweek', render: (r) => <>{day(r.date)}: {r.opp} ({r.home ? 'h' : 'a'}){' '}<span className="block text-xs text-ink-500">{r.comp}</span></>, sort: (r) => r.date, align: 'left' },
        { label: 'League', render: (r) => <>{kick(r.league_date)}: {r.league_opp} ({r.league_home ? 'h' : 'a'})</>, sort: (r) => r.league_date, align: 'left' },
        { label: 'Rest', render: (r) => <span className={r.rest <= 3 ? 'text-orange-800 font-semibold' : ''}>{r.rest} days</span>, sort: (r) => r.rest },
      ]}
    />
  );
}

function Incidents({ p }: { p: ReflectionPayload }) {
  const i = p.incidents;
  const c = i.congestion;
  const before = c.before_gw ?? [];
  const next = c.before_next ?? [];
  const weeks = c.days_since_previous ? Math.round(c.days_since_previous / 7) : 0;
  return (
    <>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={CARD}>
          <h3 className="text-sm font-semibold text-ink-900 mb-2">New or worse since the deadline</h3>
          <ReportTable
            caption="Players whose availability got worse since the deadline"
            rows={i.worse.slice(0, 8)}
            empty="No new injuries or suspensions among popular players."
            columns={[
              { label: 'Player', render: who, sort: (r) => r.name, align: 'left' },
              { label: 'Now', render: (r) => <>{statusLabel(r.now)}{r.news ? <span className="block text-xs text-ink-500">{r.news}</span> : null}</>, align: 'left' },
            ]}
          />
          {i.worse_count > 8 ? <p className="mt-1 text-xs text-ink-500">And {i.worse_count - 8} more.</p> : null}
        </div>
        <div className={`${CARD} space-y-2 text-sm text-ink-900`}>
          <h3 className="font-semibold">Back</h3>
          <p>{i.better.length ? i.better.map((r) => r.name).join(', ') : 'Nobody.'}</p>
          <h3 className="font-semibold">Sent off</h3>
          <p>{i.red_cards.length ? i.red_cards.map((r) => `${r.name} (${r.team})`).join(', ') : 'Nobody.'}</p>
        </div>
      </div>

      <h3 className={H3}>Fixture congestion</h3>
      <p className="text-ink-700 max-w-prose">
        {before.length
          ? `Before GW${p.gw}, ${new Set(before.map((r) => r.team)).size} teams had a cup or European match; ${before.filter((r) => r.rest <= 3).length} of them had three days' rest or less.`
          : weeks >= 2
            ? `GW${p.gw} followed a ${weeks}-week break, so nobody played midweek before it.`
            : `Nobody played a cup or European match before GW${p.gw}.`}{' '}
        {next.length ? `Before GW${c.next_gw}:` : c.next_gw ? `No midweek matches before GW${c.next_gw}.` : ''}
      </p>
      {next.length ? <CongestionTable rows={next} /> : null}
      {c.later?.length ? (
        <p className={NOTE}>
          Then:{' '}
          {c.later.map((l, k) => (
            <span key={l.gw}>{k ? '; ' : ''}{l.comps.join(' and ')} ({day(l.from)}{l.from !== l.to ? `–${day(l.to)}` : ''}, {l.teams} teams) before GW{l.gw}</span>
          ))}.
        </p>
      ) : null}

      <ModelBox chips={[{ label: 'Changed', tone: 'changed' }, { label: 'Not modelled', tone: 'none' }]}>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong className="font-semibold text-ink-900">Injuries and suspensions</strong> feed straight into start chances (see the start-chance moves above).</li>
          <li>
            <strong className="font-semibold text-ink-900">Midweek matches are not modelled.</strong> Start chances ignore rest days, so regular starters
            at teams with a short turnaround may be a little high. Measuring how often regulars were rested after European matches needs past
            seasons&rsquo; European dates, which we don&rsquo;t hold yet.
          </li>
        </ul>
      </ModelBox>

      {i.prices.length ? (
        <details className={CARD}>
          <summary className="cursor-pointer text-sm font-semibold text-ink-900">Price changes since the deadline ({i.price_count})</summary>
          <div className="mt-2">
            <ReportTable
              caption="Price changes since the deadline"
              rows={i.prices}
              columns={[
                { label: 'Player', render: who, sort: (r) => r.name, align: 'left' },
                { label: 'Was', render: (r) => `£${r.before.toFixed(1)}m`, sort: (r) => r.before },
                { label: 'Now', render: (r) => `£${r.now.toFixed(1)}m`, sort: (r) => r.now - r.before },
                { label: 'Owned', render: (r) => (r.own === null ? '–' : `${r.own}%`), sort: (r) => r.own },
              ]}
            />
          </div>
        </details>
      ) : null}
    </>
  );
}

// ---- 4. Set pieces ---------------------------------------------------------

const SET_PIECE_SHORT: Record<string, string> = {
  Penalties: 'Penalties',
  'Direct free kicks': 'Free kicks',
  'Corners and indirect free kicks': 'Corners, indirect FKs',
};

function SetPieces({ p }: { p: ReflectionPayload }) {
  const s = p.set_pieces;
  const review = s.order_changes.filter((r) => r.needs_review);
  return (
    <>
      {s.order_changes.length ? (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Changes in FPL's first-choice set-piece takers since the deadline">
          {s.order_changes.map((r) => (
            <li key={r.team + r.type} className={`${CARD} space-y-1.5`}>
              <p className={MONO_LABEL}>{r.team} · {SET_PIECE_SHORT[r.type] ?? r.type}</p>
              <p className="text-ink-900">
                {r.before.join(', ') || 'Nobody'} → <strong className="font-semibold">{r.now.join(', ') || 'nobody'}</strong>
              </p>
              <p className="text-sm text-ink-700">
                Ours: {r.model.map((m) => `${m.name} (${m.type})`).join(', ') || 'none recorded'}
              </p>
              <ChipTag chip={r.needs_review ? { label: 'To check', tone: 'pending' } : { label: `Agrees on ${r.model_agrees.join(', ')}`, tone: 'changed' }} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-500">No change in FPL&rsquo;s first-choice set-piece takers since the deadline.</p>
      )}
      <Kpis
        items={[
          { value: String(s.penalties_missed.length), label: s.penalties_missed.length ? `penalties missed: ${s.penalties_missed.map((r) => r.name).join(', ')}` : 'penalties missed' },
          { value: s.model_mismatches.length ? String(s.model_mismatches.length) : `${s.penalty_teams_compared} of ${s.penalty_teams_compared}`,
            label: s.model_mismatches.length ? 'clubs where our penalty taker differs from FPL’s' : 'clubs where our penalty taker matches FPL’s' },
          { value: s.hierarchy_updated ? day(s.hierarchy_updated) : '–', label: 'our set-piece hierarchy last reviewed' },
        ]}
      />
      <ModelBox chips={[review.length ? { label: 'To check', tone: 'pending' } : { label: 'No change needed', tone: 'none' }, { label: 'Data gap', tone: 'pending' }]}>
        <p>
          The projection gives set-piece chances to the takers in our own hierarchy (left and right corners, free kicks, penalties), which is
          reviewed by hand. FPL&rsquo;s order is a cross-check, not an input.
        </p>
        {review.length ? (
          <p>
            To check: {review.map((r) => `${r.team} (${(SET_PIECE_SHORT[r.type] ?? r.type).toLowerCase()}: FPL now has ${r.now.join(', ')})`).join('; ')}.
            Until ours changes, the projection keeps the old taker.
          </p>
        ) : s.order_changes.length ? (
          <p>Our hierarchy already has the new first choices.</p>
        ) : null}
        {s.model_mismatches.length ? (
          <p>Penalty takers that differ: {s.model_mismatches.map((m) => `${m.team} (FPL ${m.fpl.join('/')}; ours ${m.model})`).join('; ')}.</p>
        ) : null}
        <p>
          <strong className="font-semibold text-ink-900">We can&rsquo;t see who took each penalty.</strong> FPL&rsquo;s data doesn&rsquo;t say which goals
          were penalties, so a new taker only shows up when FPL changes its order. A source for penalty events would let us spot it sooner.
        </p>
      </ModelBox>
    </>
  );
}

// ---- 5. Captaincy ----------------------------------------------------------

function RangeChart({ rows, blankAt, haulAt }: { rows: CaptainRange[]; blankAt: number; haulAt: number }) {
  const max = Math.max(20, ...rows.map((r) => Math.max(r.p90, r.pts) + 1));
  const ticks = Array.from({ length: Math.floor(max / 5) + 1 }, (_, i) => i * 5);
  return (
    <figure className="space-y-2">
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-700">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-2.5 w-7 rounded-sm bg-chalk-300" />Middle 80% of simulated outcomes</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-3.5 w-0.5 bg-ink-900" />Median</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-full bg-pitch-800" />What he scored</span>
      </figcaption>
      <div className={`${CARD} overflow-x-auto`}>
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Captain candidates: simulated range of points at the deadline and actual points</caption>
          <thead>
            <tr className={MONO_LABEL}>
              <th scope="col" className="text-left font-normal pb-1 w-24 sm:w-40">Candidate</th>
              <th scope="col" className="font-normal pb-1 px-1.5">
                <span className="sr-only">Range</span>
                <span aria-hidden="true" className="relative block h-4">
                  {ticks.map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: at(t, max) }}>{t}</span>)}
                </span>
              </th>
              <th scope="col" className="text-right font-normal pb-1 w-10 sm:w-14">≤{blankAt}</th>
              <th scope="col" className="text-right font-normal pb-1 w-10 sm:w-14">{haulAt}+</th>
              <th scope="col" className="text-right font-normal pb-1 w-8 sm:w-12">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-chalk-100">
                <th scope="row" className="text-left font-normal py-1.5 pr-2 leading-tight">
                  <span className="font-semibold">{r.name}</span> <span className="block text-xs text-ink-500">{r.tag}</span>
                </th>
                <td className="py-1.5 px-1.5">
                  <div className="relative h-5" role="img" aria-label={`Middle 80%: ${r.p10} to ${r.p90} points, median ${r.p50}; scored ${r.pts}`}>
                    <div className="absolute inset-x-0 top-[9px] h-0.5 bg-chalk-100" />
                    <div className="absolute top-[5px] h-2.5 rounded-sm bg-chalk-300" style={{ left: at(r.p10, max), width: at(r.p90 - r.p10, max) }} />
                    <div className="absolute top-0.5 h-4 w-0.5 bg-ink-900" style={{ left: at(r.p50, max) }} />
                    <span className="absolute top-1 -ml-1.5 h-3 w-3 rounded-full bg-pitch-800 ring-2 ring-white" style={{ left: at(r.pts, max) }} />
                  </div>
                </td>
                <td className="py-1.5 text-right font-mono">{pct(r.p_blank)}</td>
                <td className="py-1.5 text-right font-mono">{pct(r.p_haul)}</td>
                <td className="py-1.5 text-right font-mono font-semibold">{r.pts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

function Captaincy({ p }: { p: ReflectionPayload }) {
  const cap = p.captaincy;
  const rows = cap.season.filter((r) => r.key !== 'model');
  const model = cap.season.find((r) => r.key === 'model');
  return (
    <>
      {cap.ranges.length ? (
        <>
          <h3 className={H3}>This week: the range at the deadline, and where each landed</h3>
          <RangeChart rows={cap.ranges} blankAt={cap.blank_at} haulAt={cap.haul_at} />
          <p className={NOTE}>
            ≤{cap.blank_at}: chance of {cap.blank_at} points or fewer. {cap.haul_at}+: chance of {cap.haul_at} or more (before doubling). From
            20,000 simulated gameweeks using the projections at the deadline.
          </p>
        </>
      ) : null}
      {cap.span && rows.length ? (
        <>
          <h3 className={H3}>Season so far: return and volatility (GW{cap.span[0]}–{cap.span[1]})</h3>
          <ReportTable
            caption="Captain points by approach this season"
            rows={rows}
            columns={[
              { label: 'Approach', render: (r) => <span className="font-semibold">{r.label}</span>, sort: (r) => r.label, align: 'left' },
              { label: 'Captain points', render: (r) => r.captain_points, sort: (r) => r.captain_points },
              { label: 'Per week', render: (r) => r.mean?.toFixed(1) ?? '–', sort: (r) => r.mean },
              { label: 'Spread', render: (r) => r.sd?.toFixed(1) ?? '–', sort: (r) => r.sd },
              { label: 'Worst', render: (r) => r.worst ?? '–', sort: (r) => r.worst },
              { label: 'Best', render: (r) => r.best ?? '–', sort: (r) => r.best },
              { label: 'Blanks', render: (r) => r.blanks, sort: (r) => r.blanks },
              { label: `${cap.haul_at}+`, render: (r) => r.hauls, sort: (r) => r.hauls },
            ]}
          />
          <ul className={`${NOTE} list-disc pl-5`}>
            {cap.season.map((r) => <li key={r.key}><strong className="font-medium text-ink-700">{r.label}:</strong> {r.definition}.</li>)}
            <li>Per week, worst and best are points before doubling; spread is the standard deviation; a blank is {cap.blank_at} points or fewer.</li>
          </ul>
          {model ? (
            <p className="text-ink-700 max-w-prose">
              The model&rsquo;s top projection has been saved since GW6: {model.captain_points} captain points so far against{' '}
              {2 * (model.premium_same_weeks ?? 0)} for the premium in the same weeks.
            </p>
          ) : null}
        </>
      ) : null}
      <ModelBox title="Over four seasons" chips={[{ label: 'No model change', tone: 'none' }]}>
        <p>
          The most-captained player blanked in {cap.context.top_pick_blank_rate}% of gameweeks from {cap.context.seasons} and was the best choice
          in only {cap.context.top_pick_best_rate}%, yet scored the most over the four seasons. A few weeks of this season decide very little. See{' '}
          <Link to={cap.context.article} className={LINK}>should you always captain the top pick</Link> and{' '}
          <Link to={cap.context.haaland_article} className={LINK}>should you always captain Haaland</Link>.
        </p>
      </ModelBox>
      <details className={CARD}>
        <summary className="cursor-pointer text-sm font-semibold text-ink-900">Week by week</summary>
        <div className="mt-2">
          <ReportTable
            caption="Captain choices week by week (points)"
            rows={cap.weeks}
            columns={[
              { label: 'GW', render: (w) => w.gw, sort: (w) => w.gw },
              { label: 'Premium', render: (w) => (w.premium ? <>{w.premium.name}{' '}<span className="block font-mono text-xs">{w.premium.pts}</span></> : '–'), align: 'left' },
              { label: 'Form', render: (w) => (w.form ? <>{w.form.name}{' '}<span className="block font-mono text-xs">{w.form.pts}</span></> : '–'), align: 'left' },
              { label: 'Model', render: (w) => (w.model ? <>{w.model.name}{' '}<span className="block font-mono text-xs">{w.model.pts}</span></> : '–'), align: 'left' },
              { label: 'Best', render: (w) => (w.best ? <>{w.best.name}{' '}<span className="block font-mono text-xs">{w.best.pts}</span></> : '–'), align: 'left' },
            ]}
          />
        </div>
      </details>
    </>
  );
}

// ---- The page body ---------------------------------------------------------

export default function GameweekReflection({ p }: { p: ReflectionPayload }) {
  const chips = themeChips(p);
  const ms = p.model_summary;
  const body: Record<ThemeKey, ReactNode> = {
    goals: <Goals p={p} />,
    minutes: <Minutes p={p} />,
    incidents: <Incidents p={p} />,
    set_pieces: <SetPieces p={p} />,
    captaincy: <Captaincy p={p} />,
  };
  return (
    <>
      {!p.gameweek_finished || !p.bonus_confirmed ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-ink-700 max-w-prose">
          Written before FPL confirmed every result and bonus for the gameweek; matches not yet played are left out.
        </p>
      ) : null}

      <section aria-labelledby="in-five" className="space-y-3">
        <h2 id="in-five" className="font-display uppercase tracking-wide text-xl text-ink-900">The week in five lines</h2>
        <ol className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {THEMES.map((t, k) => (
            <li key={t.key}>
              <a href={`#${t.anchor}`} className="flex h-full flex-col gap-2 rounded-lg border border-chalk-300 bg-white p-3 hover:border-pitch-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-pitch-700">
                <span className={MONO_LABEL}>{k + 1} · {t.title}</span>
                <span className="text-sm font-semibold leading-snug text-ink-900">{p.verdicts[t.key].head}</span>
                <span className="mt-auto"><ChipTag chip={chips[t.key]} /></span>
              </a>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="model-changed" className="rounded-xl bg-pitch-900 p-4 sm:p-5 text-chalk-100 space-y-3">
        <h2 id="model-changed" className="font-display uppercase tracking-wide text-xl text-amber-400">What the model changed this week</h2>
        <div className="grid gap-4 md:grid-cols-3 text-sm">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-chalk-200">Updated automatically</p>
            <ul className="mt-1 list-disc pl-5 space-y-1 leading-snug">
              {ms.automatic.map((a) => <li key={a.text}>{a.text} (<a href={`#${ANCHOR[a.theme]}`} className="text-amber-400 underline underline-offset-2">see</a>)</li>)}
            </ul>
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-chalk-200">Method changes since the GW{p.gw} deadline</p>
            {ms.method.length ? (
              <ul className="mt-1 list-disc pl-5 space-y-1 leading-snug">
                {ms.method.map((c) => <li key={c.date + c.title}>{c.title.replace(/^FPL: /, '')} ({day(c.date)})</li>)}
              </ul>
            ) : <p className="mt-1">None.</p>}
          </div>
          <div>
            <p className="font-mono text-[11px] uppercase tracking-widest text-chalk-200">Watching and considering</p>
            <ul className="mt-1 list-disc pl-5 space-y-1 leading-snug">
              {ms.considering.map((c) => <li key={c.text}>{c.text}</li>)}
            </ul>
          </div>
        </div>
      </section>

      {THEMES.map((t, k) => (
        <Theme key={t.key} n={k + 1} theme={t} verdict={p.verdicts[t.key]}>{body[t.key]}</Theme>
      ))}

      <section className="rounded-lg border border-chalk-300 bg-white p-4 max-w-prose text-sm text-ink-700 space-y-2" aria-labelledby="how">
        <h2 id="how" className="font-display uppercase tracking-wide text-lg text-ink-900">How this was worked out</h2>
        <p>
          Generated from the data on {day(p.generated_at)}; nothing is written by hand. Expected goals at the deadline: {p.goals.expected_from}.
          Start chances and roles are the ones the projections had at the deadline ({day(p.deadline)}). xG is FPL&rsquo;s. Team ratings come from
          bookmakers&rsquo; closing prices{p.prices_in ? ', including this gameweek’s' : '; this gameweek’s hadn’t arrived yet'}. Players listed are
          owned by 1%+ or among the 50 highest projected for the next five gameweeks.
        </p>
      </section>
    </>
  );
}
