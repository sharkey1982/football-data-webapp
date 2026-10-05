// ============================================================================
// src/components/intl/Squad.tsx
//
// A nation's current squad and recent call-ups (intl_squads /
// intl_squad_players, read daily from its Wikipedia page): grouped by
// position with number, age, caps, goals and club, then the players called up
// in the last year who aren't in this squad, with their latest call-up and why
// they're out (injured, withdrew...). Credits Wikipedia (CC BY-SA).
// ============================================================================

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { POSITIONS, ageOn, leagueBreakdown, shortDate, statusText, type IntlSquad, type SquadPlayer } from '../../lib/intlStats';

const wikiUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
const today = () => new Date().toISOString().slice(0, 10);

function PlayerName({ p }: { p: SquadPlayer }) {
  return p.wiki_title ? (
    <a href={wikiUrl(p.wiki_title)} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.player}</a>
  ) : (
    <>{p.player}</>
  );
}

/** The club, linked to its FixtureShark page when we have one, with its league country when it isn't the nation's own. */
function Club({ p, nation }: { p: SquadPlayer; nation: string }) {
  if (!p.club) return null;
  const abroad = p.club_league_country && p.club_league_country !== nation;
  return (
    <>
      {p.club_slug ? <Link to={`/football/teams/${p.club_slug}`} className="hover:underline">{p.club}</Link> : p.club}
      {abroad && <span className="ml-1 text-[11px] text-ink-500">{`(${p.club_league_country})`}</span>}
    </>
  );
}

function Rows({ players, recent, nation }: { players: SquadPlayer[]; recent?: boolean; nation: string }) {
  const now = today();
  return (
    <>
      {players.map((p) => (
        <tr key={`${p.list}-${p.seq}`} className="border-t border-chalk-200">
          <td className="px-2 py-1 text-right font-mono text-xs text-ink-500 w-8">{p.number ?? ''}</td>
          <td className="px-2 py-1">
            <span className="text-ink-900"><PlayerName p={p} /></span>
            {p.status && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-loss-700">{statusText(p.status)}</span>}
            {p.club && <span className="block sm:hidden text-xs text-ink-500"><Club p={p} nation={nation} /></span>}
          </td>
          <td className="px-2 py-1 text-right font-mono text-xs tabular-nums">{p.birth_date ? ageOn(p.birth_date, now) : ''}</td>
          <td className="px-2 py-1 text-right font-mono text-xs tabular-nums">{p.caps ?? ''}</td>
          <td className="px-2 py-1 text-right font-mono text-xs tabular-nums">{p.goals ?? ''}</td>
          <td className="px-2 py-1 text-ink-700 hidden sm:table-cell"><Club p={p} nation={nation} /></td>
          <td className="px-2 py-1 text-right font-mono text-xs tabular-nums hidden md:table-cell" title={p.club_elo_rank ? `ClubElo rank ${p.club_elo_rank}` : 'Not rated by ClubElo'}>
            {p.club_elo != null ? Math.round(p.club_elo) : ''}
          </td>
          {recent && <td className="px-2 py-1 text-xs text-ink-500 hidden md:table-cell">{p.latest_text ?? (p.latest_date ? shortDate(p.latest_date) : '')}</td>}
        </tr>
      ))}
    </>
  );
}

function SquadTable({ players, recent, testId, nation }: { players: SquadPlayer[]; recent?: boolean; testId?: string; nation: string }) {
  const groups = POSITIONS.map((pos) => ({ ...pos, list: players.filter((p) => p.position === pos.code) })).filter((g) => g.list.length);
  const other = players.filter((p) => !POSITIONS.some((pos) => pos.code === p.position));
  return (
    <table className="w-full text-sm border border-chalk-300 rounded-lg overflow-hidden bg-white" data-testid={testId}>
      <thead className="bg-chalk-200 text-ink-500 text-xs">
        <tr>
          <th className="px-2 py-1 text-right font-medium">No.</th>
          <th className="px-2 py-1 text-left font-medium">Player</th>
          <th className="px-2 py-1 text-right font-medium">Age</th>
          <th className="px-2 py-1 text-right font-medium">Caps</th>
          <th className="px-2 py-1 text-right font-medium">Goals</th>
          <th className="px-2 py-1 text-left font-medium hidden sm:table-cell">Club</th>
          <th className="px-2 py-1 text-right font-medium hidden md:table-cell" title="The club's ClubElo rating (mainly European clubs)">Club Elo</th>
          {recent && <th className="px-2 py-1 text-left font-medium hidden md:table-cell">Latest call-up</th>}
        </tr>
      </thead>
      {groups.map((g) => (
        <tbody key={g.code}>
          <tr>
            {/* colSpan only over the always-visible columns: spanning hidden ones adds phantom columns on phones */}
            <th colSpan={5} className="bg-chalk-100 px-2 py-0.5 text-left text-[11px] font-medium uppercase tracking-wide text-ink-500">{g.name}</th>
            <td className="bg-chalk-100 hidden sm:table-cell" />
            <td className="bg-chalk-100 hidden md:table-cell" />
            {recent && <td className="bg-chalk-100 hidden md:table-cell" />}
          </tr>
          <Rows players={g.list} recent={recent} nation={nation} />
        </tbody>
      ))}
      {other.length > 0 && (
        <tbody>
          <Rows players={other} recent={recent} nation={nation} />
        </tbody>
      )}
    </table>
  );
}

/** Where the squad plays: at home v abroad as a bar, players per league country, the average club rating. */
function WhereTheyPlay({ players, nation }: { players: SquadPlayer[]; nation: string }) {
  const leagues = leagueBreakdown(players, nation);
  if (!leagues.length) return null;
  const known = leagues.reduce((a, l) => a + l.n, 0);
  const home = leagues.find((l) => l.home)?.n ?? 0;
  const rated = players.filter((p) => p.club_elo != null);
  const avg = rated.length ? Math.round(rated.reduce((a, p) => a + (p.club_elo ?? 0), 0) / rated.length) : null;
  const best = [...rated].sort((a, b) => (b.club_elo ?? 0) - (a.club_elo ?? 0))[0];
  return (
    <div className="rounded-lg border border-chalk-300 bg-white p-3 space-y-2" data-testid="intl-where-they-play">
      <p className="text-sm font-medium text-ink-900">Where they play</p>
      <div className="flex h-3 w-full max-w-md overflow-hidden rounded-full bg-chalk-200" aria-hidden>
        <span className="bg-pitch-700" style={{ width: `${(100 * home) / known}%` }} />
        <span className="bg-amber-500" style={{ width: `${(100 * (known - home)) / known}%` }} />
      </div>
      <p className="text-sm text-ink-900">
        <span className="text-pitch-800 font-semibold">{`${home} at home`}</span>
        {' · '}
        <span className="font-semibold">{`${known - home} abroad`}</span>
        {` in ${leagues.length - (home ? 1 : 0)} other countr${leagues.length - (home ? 1 : 0) === 1 ? 'y' : 'ies'}`}
      </p>
      <ul className="flex flex-wrap gap-1.5 text-xs">
        {leagues.map((l) => (
          <li key={l.country} className={`rounded-full border px-2 py-0.5 ${l.home ? 'border-pitch-700 bg-chalk-100 text-pitch-800' : 'border-chalk-300 text-ink-700'}`}>
            {`${l.country} ${l.n}`}
          </li>
        ))}
      </ul>
      {avg != null && (
        <p className="text-xs text-ink-700">
          {`Average club rating ${avg} (ClubElo; ${rated.length} of ${players.length} players' clubs rated, mainly European)`}
          {best ? `. Highest-rated club: ${best.club}, ranked ${best.club_elo_rank} by ClubElo.` : '.'}
        </p>
      )}
    </div>
  );
}

export default function Squad({ squad, players, team }: { squad: IntlSquad | null; players: SquadPlayer[]; team: string }) {
  const [showRecent, setShowRecent] = useState(false);
  const current = players.filter((p) => p.list === 'current');
  const recent = players.filter((p) => p.list === 'recent');
  if (!squad || !current.length) return <p className="text-sm text-ink-700">{`No current squad listed for ${team} yet.`}</p>;
  const caps = current.reduce((a, p) => a + (p.caps ?? 0), 0);
  const ages = current.filter((p) => p.birth_date).map((p) => ageOn(p.birth_date!, today()));
  const avgAge = ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : null;
  const clubs = new Map<string, number>();
  for (const p of current) if (p.club) clubs.set(p.club, (clubs.get(p.club) ?? 0) + 1);
  const topClub = [...clubs.entries()].sort((a, b) => b[1] - a[1])[0];
  return (
    <div className="space-y-3">
      {squad.intro && <p className="text-sm text-ink-900 max-w-prose">{squad.intro}</p>}
      <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm" data-testid="intl-squad-facts">
        <div><dt className="inline text-ink-500">Players </dt><dd className="inline font-semibold">{current.length}</dd></div>
        {avgAge && <div><dt className="inline text-ink-500">Average age </dt><dd className="inline font-semibold">{avgAge}</dd></div>}
        <div><dt className="inline text-ink-500">Caps between them </dt><dd className="inline font-semibold">{caps.toLocaleString('en-GB')}</dd></div>
        {topClub && topClub[1] > 1 && <div><dt className="inline text-ink-500">Most from one club </dt><dd className="inline font-semibold">{`${topClub[0]} (${topClub[1]})`}</dd></div>}
      </dl>
      <WhereTheyPlay players={current} nation={team} />
      <SquadTable players={current} testId="intl-squad" nation={team} />
      {recent.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowRecent((v) => !v)} className="text-sm text-pitch-800 underline underline-offset-2" aria-expanded={showRecent}>
            {showRecent ? 'Hide recent call-ups' : `Recent call-ups not in this squad (${recent.length})`}
          </button>
          {showRecent && <SquadTable players={recent} recent testId="intl-squad-recent" nation={team} />}
        </div>
      )}
      <p className="text-xs text-ink-500">
        {`Squad, caps and goals from `}
        <a href={wikiUrl(squad.wiki_title)} target="_blank" rel="noopener noreferrer" className="underline">{`Wikipedia: ${squad.wiki_title}`}</a>
        {` (CC BY-SA)${squad.caps_as_of ? `, caps correct as of ${squad.caps_as_of}` : ''}${squad.revision_at ? `; page last edited ${shortDate(squad.revision_at.slice(0, 10))}` : ''}. Read daily.`}
      </p>
    </div>
  );
}
