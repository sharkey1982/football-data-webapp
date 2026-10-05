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
import { POSITIONS, ageOn, shortDate, statusText, type IntlSquad, type SquadPlayer } from '../../lib/intlStats';

const wikiUrl = (title: string) => `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
const today = () => new Date().toISOString().slice(0, 10);

function PlayerName({ p }: { p: SquadPlayer }) {
  return p.wiki_title ? (
    <a href={wikiUrl(p.wiki_title)} target="_blank" rel="noopener noreferrer" className="hover:underline">{p.player}</a>
  ) : (
    <>{p.player}</>
  );
}

function Rows({ players, recent }: { players: SquadPlayer[]; recent?: boolean }) {
  const now = today();
  return (
    <tbody>
      {players.map((p) => (
        <tr key={`${p.list}-${p.seq}`} className="border-t border-chalk-200">
          <td className="px-2 py-1 text-right font-mono text-xs text-ink-500 w-8">{p.number ?? ''}</td>
          <td className="px-2 py-1">
            <span className="text-ink-900"><PlayerName p={p} /></span>
            {p.status && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-loss-700">{statusText(p.status)}</span>}
          </td>
          <td className="px-2 py-1 text-right font-mono text-xs tabular-nums">{p.birth_date ? ageOn(p.birth_date, now) : ''}</td>
          <td className="px-2 py-1 text-right font-mono text-xs tabular-nums">{p.caps ?? ''}</td>
          <td className="px-2 py-1 text-right font-mono text-xs tabular-nums">{p.goals ?? ''}</td>
          <td className="px-2 py-1 text-ink-700 hidden sm:table-cell">{p.club ?? ''}</td>
          {recent && <td className="px-2 py-1 text-xs text-ink-500 hidden md:table-cell">{p.latest_text ?? (p.latest_date ? shortDate(p.latest_date) : '')}</td>}
        </tr>
      ))}
    </tbody>
  );
}

function SquadTable({ players, recent, testId }: { players: SquadPlayer[]; recent?: boolean; testId?: string }) {
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
          {recent && <th className="px-2 py-1 text-left font-medium hidden md:table-cell">Latest call-up</th>}
        </tr>
      </thead>
      {groups.map((g) => (
        <tbody key={g.code}>
          <tr>
            {/* colSpan only over the always-visible columns: spanning hidden ones adds phantom columns on phones */}
            <th colSpan={5} className="bg-chalk-100 px-2 py-0.5 text-left text-[11px] font-medium uppercase tracking-wide text-ink-500">{g.name}</th>
            <td className="bg-chalk-100 hidden sm:table-cell" />
            {recent && <td className="bg-chalk-100 hidden md:table-cell" />}
          </tr>
          <Rows players={g.list} recent={recent} />
        </tbody>
      ))}
      {other.length > 0 && <Rows players={other} recent={recent} />}
    </table>
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
      <SquadTable players={current} testId="intl-squad" />
      {recent.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => setShowRecent((v) => !v)} className="text-sm text-pitch-800 underline underline-offset-2" aria-expanded={showRecent}>
            {showRecent ? 'Hide recent call-ups' : `Recent call-ups not in this squad (${recent.length})`}
          </button>
          {showRecent && <SquadTable players={recent} recent testId="intl-squad-recent" />}
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
