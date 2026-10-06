// ============================================================================
// src/components/intl/IntlBits.tsx
//
// Small pieces shared by the International pages: the page header (crumb and
// title), team links, the Elo expectation and upset badge, and one game row
// used by Fixtures & Results, team pages and tournament pages.
// ============================================================================

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { intlMatchPath } from '../../lib/intlMatch';
import { INTL_DISCOVER_PATH, INTL_HUB_PATH, editionPathOf, intlTeamPath } from '../../lib/intlApi';
import { pct, eloExpectation, isUpset, scoreText, tournamentByCompetition, ukDateTime, UPSET_BELOW, type IntlFixture, type IntlMatch } from '../../lib/intlStats';

export function IntlHeader({ title, crumb, children }: { title: string; crumb?: { to: string; label: string }; children?: ReactNode }) {
  return (
    <header className="space-y-2">
      <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
        <Link to={INTL_HUB_PATH} className="hover:underline">International</Link> &middot;{' '}
        <Link to={crumb?.to ?? INTL_DISCOVER_PATH} className="hover:underline">{crumb?.label ?? 'Discover'}</Link>
      </p>
      <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900">{title}</h1>
      {children}
    </header>
  );
}

export function Section({ title, children, id, testId }: { title: string; children: ReactNode; id?: string; testId?: string }) {
  return (
    <section aria-labelledby={id} className="space-y-2" data-testid={testId}>
      <h2 id={id} className="font-display uppercase tracking-wide text-lg text-ink-900">{title}</h2>
      {children}
    </section>
  );
}

/** A row of toggle chips (one choice). Scrolls sideways on a phone rather than wrapping into a wall. */
export function ChipGroup<K extends string>({ options, value, onChange, label, testId }: { options: readonly { key: K; label: string; count?: number }[]; value: K; onChange: (k: K) => void; label: string; testId?: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" data-testid={testId}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          aria-pressed={o.key === value}
          onClick={() => onChange(o.key)}
          className={`shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap ${o.key === value ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'bg-white text-ink-700 border-chalk-300 hover:border-pitch-600'}`}
        >
          {o.label}
          {o.count != null && <span className={`ml-1.5 font-mono text-xs ${o.key === value ? 'text-chalk-200' : 'text-ink-500'}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** A small trophy count: "🏆 5 World Cups" style, as text badges. */
export function TitleBadges({ list }: { list: { tournament: { short: string; slug: string }; n: number }[] }) {
  if (!list.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map(({ tournament, n }) => (
        <span key={tournament.slug} className="inline-flex items-center gap-1 rounded bg-amber-400/30 border border-amber-500 px-1.5 py-0.5 text-[11px] leading-none text-ink-900 whitespace-nowrap" title={`${n} × ${tournament.short}`}>
          <span className="font-mono font-semibold">{n}</span>
          <span>{tournament.short}</span>
        </span>
      ))}
    </span>
  );
}

export function TeamLink({ slug, name, bold }: { slug: string | null | undefined; name: string; bold?: boolean }) {
  if (!slug) return <span className={bold ? 'font-semibold' : undefined}>{name}</span>;
  return (
    <Link to={intlTeamPath(slug)} className={`hover:underline ${bold ? 'font-semibold' : ''}`}>
      {name}
    </Link>
  );
}

/** "Upset" when the winner had an Elo expectation under 0.3 (text, not colour alone). */
export function UpsetBadge({ m }: { m: IntlMatch }) {
  if (!isUpset(m)) return null;
  const e = eloExpectation(m)!;
  const winnerE = m.home_score > m.away_score ? e : 1 - e;
  return (
    <span
      className="ml-1.5 inline-block rounded px-1.5 py-0.5 font-sans text-[10px] font-semibold uppercase tracking-wide align-middle bg-amber-400 text-pitch-950"
      title={`Won with an Elo expectation of ${Math.round(winnerE * 100)}% (upset below ${Math.round(UPSET_BELOW * 100)}%)`}
      data-testid="intl-upset"
    >
      Upset
    </span>
  );
}

/** Elo expectation before the game as a percentage: the home side's, or the
 * given team's on a team's own list. */
export function EloChance({ m, team }: { m: IntlMatch; team?: string }) {
  const home = eloExpectation(m);
  if (home == null) return null;
  const forAway = team != null && team === m.away_team;
  const e = forAway ? 1 - home : home;
  const who = team && (team === m.home_team || team === m.away_team) ? team : 'the home side';
  return (
    <span className="font-mono text-xs text-ink-500 tabular-nums" title={`Elo expectation for ${who} before the game (a win counts 1, a draw a half)`}>
      {`${Math.round(e * 100)}%`}
    </span>
  );
}

/** One played game: stage, teams (names at the time), score with extra time and penalties, upset. */
export function GameRow({ m, showDate, showCompetition, team }: { m: IntlMatch; showDate?: boolean; showCompetition?: boolean; team?: string }) {
  const winner = m.home_score > m.away_score ? m.home_team : m.away_score > m.home_score ? m.away_team : m.shootout_winner;
  const t = tournamentByCompetition(m.competition);
  const where = [m.stage_name && m.stage_code !== 'LP' && m.stage_code !== 'GRP' && m.stage_code !== 'ALL' ? m.stage_name : null, m.group_label ? `Group ${m.group_label}` : null].filter(Boolean).join(' · ');
  const outcome = team ? (winner === team && m.home_score !== m.away_score ? 'W' : m.home_score === m.away_score ? 'D' : 'L') : null;
  return (
    <li className="px-3 py-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm" data-testid="intl-game">
      {showDate && <span className="w-24 shrink-0 font-mono text-xs text-ink-500">{m.match_date}</span>}
      {outcome && <span className={`w-5 shrink-0 font-mono text-xs font-semibold ${outcome === 'W' ? 'text-pitch-700' : outcome === 'L' ? 'text-loss-700' : 'text-ink-500'}`}>{outcome}</span>}
      <span className="min-w-[12rem] flex-1">
        <TeamLink slug={m.home_slug} name={m.home_name} bold={winner === m.home_team} />
        <Link to={intlMatchPath(m.match_date, m.home_slug, m.away_slug)} className="font-mono tabular-nums mx-2 whitespace-nowrap hover:underline" title="Match page: prediction, head to head, squads">{scoreText({ ...m, shootout_winner: null })}</Link>
        <TeamLink slug={m.away_slug} name={m.away_name} bold={winner === m.away_team} />
        {m.shootout_winner && (
          <span className="text-xs text-ink-500">{` (${m.shootout_winner === m.home_team ? m.home_name : m.shootout_winner === m.away_team ? m.away_name : m.shootout_winner} won on penalties)`}</span>
        )}
        <UpsetBadge m={m} />
      </span>
      <span className="w-full sm:w-auto text-xs text-ink-500">
        {showCompetition && (t && m.edition_key ? <Link to={editionPathOf({ competition: m.competition, label: m.edition_key.replace(/^[A-Z]+-/, '') })} className="hover:underline">{m.competition}</Link> : m.competition)}
        {showCompetition && where ? ' · ' : ''}
        {where}
        {m.city ? `${showCompetition || where ? ' · ' : ''}${m.city}` : ''}
      </span>
      {m.competition_kind === 'reported' ? <span className="text-xs font-mono text-ink-500" title="Reported by the fixture feed; the results file has not confirmed it yet">reported</span> : <EloChance m={m} team={team} />}
    </li>
  );
}

/** One fixture from the feed: UK kick-off, teams, venue; "Result to follow" once played. */
export function FixtureRow({ f, showDate }: { f: IntlFixture; showDate?: boolean }) {
  const { date, time } = ukDateTime(f.kickoff_utc);
  const played = new Date(f.kickoff_utc).getTime() + 2.5 * 3600e3 < Date.now();
  return (
    <li className="px-3 py-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm" data-testid="intl-fixture">
      <span className="w-24 shrink-0 font-mono text-xs text-ink-500">{showDate ? `${date} ${time}` : time}</span>
      <span className="min-w-[12rem] flex-1">
        <TeamLink slug={f.home_slug} name={f.home_team} />
        <Link to={intlMatchPath(date, f.home_slug, f.away_slug)} className="font-mono mx-2 text-ink-500 hover:underline" title="Match page: prediction, head to head, squads">{f.home_score != null && f.away_score != null ? `${f.home_score}–${f.away_score}` : 'v'}</Link>
        <TeamLink slug={f.away_slug} name={f.away_team} />
      </span>
      <span className="w-full sm:w-auto text-xs text-ink-500">{[f.group_label ? `Group ${f.group_label}` : null, f.venue].filter(Boolean).join(' · ')}</span>
      {played && f.home_score == null && <span className="text-xs font-mono text-ink-500">Result to follow</span>}
      {!played && f.home_score == null && f.p_home != null && <Projection f={f} />}
      <Link to={intlMatchPath(date, f.home_slug, f.away_slug)} className="text-xs text-pitch-800 underline underline-offset-2 whitespace-nowrap" data-testid="intl-fixture-preview">
        {played || f.home_score != null ? 'Match page' : 'Preview & head to head'}
      </Link>
    </li>
  );
}

/** Model IP1's view of an unplayed fixture: win/draw/win as a bar with the
 * numbers in text (never colour alone), expected goals and the likeliest score. */
export function Projection({ f }: { f: IntlFixture }) {
  const ph = f.p_home ?? 0, pd = f.p_draw ?? 0, pa = f.p_away ?? 0;
  const top = f.scores?.[0];
  return (
    <span className="w-full flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-700" data-testid="intl-projection">
      <span className="flex h-2 w-40 overflow-hidden rounded-full bg-chalk-200" aria-hidden>
        <span className="bg-pitch-700" style={{ width: `${ph * 100}%` }} />
        <span className="bg-chalk-300" style={{ width: `${pd * 100}%` }} />
        <span className="bg-amber-500" style={{ width: `${pa * 100}%` }} />
      </span>
      <span className="font-mono tabular-nums">
        <span className="text-pitch-800">{`${f.home_team} ${pct(ph)}`}</span>
        {` · Draw ${pct(pd)} · `}
        <span className="text-ink-900">{`${f.away_team} ${pct(pa)}`}</span>
      </span>
      {f.xg_home != null && f.xg_away != null && <span className="text-ink-500">{`Expected goals ${f.xg_home.toFixed(1)}–${f.xg_away.toFixed(1)}`}</span>}
      {top && <span className="text-ink-500">{`Likeliest ${top.h}–${top.a} (${pct(top.p)})`}</span>}
    </span>
  );
}

export function GameList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <ul className="divide-y divide-chalk-300 border border-chalk-300 rounded-lg bg-white" data-testid={testId}>
      {children}
    </ul>
  );
}
