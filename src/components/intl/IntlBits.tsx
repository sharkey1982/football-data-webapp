// ============================================================================
// src/components/intl/IntlBits.tsx
//
// Small pieces shared by the International pages: the page header (crumb and
// title), team links, the Elo expectation and upset badge, and one game row
// used by Fixtures & Results, team pages and tournament pages.
// ============================================================================

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { INTL_DISCOVER_PATH, INTL_HUB_PATH, editionPathOf, intlTeamPath } from '../../lib/intlApi';
import { eloExpectation, isUpset, scoreText, tournamentByCompetition, ukDateTime, UPSET_BELOW, type IntlFixture, type IntlMatch } from '../../lib/intlStats';

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
  const where = [m.stage_name && m.stage_code !== 'LP' && m.stage_code !== 'GRP' ? m.stage_name : null, m.group_label ? `Group ${m.group_label}` : null].filter(Boolean).join(' · ');
  const outcome = team ? (winner === team && m.home_score !== m.away_score ? 'W' : m.home_score === m.away_score ? 'D' : 'L') : null;
  return (
    <li className="px-3 py-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm" data-testid="intl-game">
      {showDate && <span className="w-24 shrink-0 font-mono text-xs text-ink-500">{m.match_date}</span>}
      {outcome && <span className={`w-5 shrink-0 font-mono text-xs font-semibold ${outcome === 'W' ? 'text-pitch-700' : outcome === 'L' ? 'text-loss-700' : 'text-ink-500'}`}>{outcome}</span>}
      <span className="min-w-0 flex-1">
        <TeamLink slug={m.home_slug} name={m.home_name} bold={winner === m.home_team} />
        <span className="font-mono tabular-nums mx-2">{scoreText({ ...m, shootout_name: m.shootout_winner === m.home_team ? m.home_name : m.shootout_winner === m.away_team ? m.away_name : m.shootout_winner })}</span>
        <TeamLink slug={m.away_slug} name={m.away_name} bold={winner === m.away_team} />
        <UpsetBadge m={m} />
      </span>
      <span className="text-xs text-ink-500">
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
      <span className="min-w-0 flex-1">
        <TeamLink slug={f.home_slug} name={f.home_team} />
        <span className="font-mono mx-2 text-ink-500">{f.home_score != null && f.away_score != null ? `${f.home_score}–${f.away_score}` : 'v'}</span>
        <TeamLink slug={f.away_slug} name={f.away_team} />
      </span>
      <span className="text-xs text-ink-500">{[f.group_label ? `Group ${f.group_label}` : null, f.venue].filter(Boolean).join(' · ')}</span>
      {played && f.home_score == null && <span className="text-xs font-mono text-ink-500">Result to follow</span>}
    </li>
  );
}

export function GameList({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <ul className="divide-y divide-chalk-300 border border-chalk-300 rounded-lg bg-white" data-testid={testId}>
      {children}
    </ul>
  );
}
