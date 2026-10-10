// Round: fixtures with live scores and match events, and my team's points.
import { useEffect, useMemo, useState } from 'react';
import { loadEvents, loadPlayerRounds, type SeasonData, type SfEntryRound, type SfEvent, type SfMyTeam, type SfPlayerRound, type SfSeason } from '../../lib/sharkFantasyApi';
import { when } from './format';

interface Props {
  season: SfSeason; data: SeasonData; mine: SfMyTeam | null; myRounds: SfEntryRound[];
  round: number | null; setRound: (r: number) => void; onLive: () => Promise<void>;
}

const EVENT_LABEL: Record<string, string> = {
  goal: 'Goal', pen_goal: 'Penalty goal', own_goal: 'Own goal', assist: 'Assist', pen_miss: 'Penalty missed', pen_save: 'Penalty saved',
  yellow: 'Yellow card', red: 'Red card', sub_on: 'On', sub_off: 'Off', injury: 'Injured', full_time: 'Full time', shootout: 'Penalties',
};
const SHOWN = new Set(['goal', 'pen_goal', 'own_goal', 'assist', 'pen_miss', 'pen_save', 'yellow', 'red', 'sub_on', 'sub_off', 'injury', 'shootout']);

export default function RoundTab({ season, data, mine, myRounds, round, setRound, onLive }: Props) {
  const played = data.fixtures.filter((f) => f.status !== 'scheduled').map((f) => f.round);
  const rounds = [...new Set(data.fixtures.map((f) => f.round))].sort((a, b) => a - b);
  const r = round ?? (played.length ? Math.max(...played) : rounds[0] ?? 1);
  const fixtures = data.fixtures.filter((f) => f.round === r);
  const live = fixtures.some((f) => f.status === 'live');
  const [events, setEvents] = useState<SfEvent[]>([]);
  const [points, setPoints] = useState<SfPlayerRound[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const ids = fixtures.map((f) => f.fixture_id).join(',');

  useEffect(() => {
    let alive = true;
    const load = () => Promise.all([loadEvents(ids ? ids.split(',').map(Number) : []), loadPlayerRounds(season.season_id, r)])
      .then(([e, p]) => { if (alive) { setEvents(e); setPoints(p); } }).catch(() => undefined);
    void load();
    // live: events appear by match minute, so look again every 30 seconds
    const t = live ? window.setInterval(() => { void load(); void onLive(); }, 30_000) : undefined;
    return () => { alive = false; if (t) window.clearInterval(t); };
  }, [ids, r, season.season_id, live, onLive]);

  const clubName = (id: string) => data.clubs.find((c) => c.club_id === id)?.name ?? id;
  const kindLabel = (k: string, i: number) => (k === 'final' ? 'Shark Shield Final' : k === 'placing' ? `Play-off for ${2 * i + 1 === 3 ? '3rd' : `${2 * i + 1}th`}` : '');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Round">
        {rounds.map((n) => (
          <button key={n} type="button" onClick={() => setRound(n)} className={`w-9 py-1 text-sm rounded ${n === r ? 'bg-pitch-800 text-chalk-100' : 'border border-chalk-300'}`}>{n}</button>
        ))}
      </div>

      <ul className="space-y-2" data-testid="sf-fixtures">
        {fixtures.map((f, i) => {
          const ev = events.filter((e) => e.fixture_id === f.fixture_id && SHOWN.has(e.type));
          return (
            <li key={f.fixture_id} className="rounded border border-chalk-300 bg-white">
              <button type="button" className="w-full flex items-center gap-3 px-3 py-2 text-sm" onClick={() => setOpen(open === f.fixture_id ? null : f.fixture_id)} aria-expanded={open === f.fixture_id}>
                <span className="flex-1 text-right text-ink-900">{clubName(f.home_id)}</span>
                {f.status === 'scheduled'
                  ? <span className="w-24 text-center text-xs text-ink-500">{when(f.kickoff_at)}</span>
                  : <span className="scoreline px-2 py-0.5 w-24 text-center">{f.home_goals}–{f.away_goals}{f.shootout ? ` (${f.shootout.home}–${f.shootout.away}p)` : ''}</span>}
                <span className="flex-1 text-ink-900">{clubName(f.away_id)}</span>
                <span className="w-24 text-xs text-ink-500">{f.status === 'live' ? 'Live' : f.status === 'full_time' ? 'Full time' : ''}{f.kind !== 'league' ? ` ${kindLabel(f.kind, i)}` : ''}</span>
              </button>
              {open === f.fixture_id && (
                <ol className="px-3 pb-2 text-xs text-ink-700 space-y-0.5" data-testid="sf-events">
                  {ev.length ? ev.map((e) => (
                    <li key={e.seq} className={`flex gap-2 ${e.side === 'away' ? 'justify-end text-right' : ''}`}>
                      <span className="font-mono text-ink-500">{e.minute}'</span><span>{EVENT_LABEL[e.type] ?? e.type}</span><span className="text-ink-900">{e.player ?? ''}</span>
                    </li>
                  )) : <li className="text-ink-500">{f.status === 'scheduled' ? 'Not started.' : 'Nothing yet.'}</li>}
                </ol>
              )}
            </li>
          );
        })}
      </ul>

      {mine && <MyRound data={data} snap={myRounds.find((x) => x.round === r) ?? null} points={points} />}
    </div>
  );
}

function MyRound({ data, snap, points }: { data: SeasonData; snap: SfEntryRound | null; points: SfPlayerRound[] }) {
  const byId = useMemo(() => new Map(data.players.map((p) => [p.player_id, p])), [data.players]);
  if (!snap) return <p className="text-sm text-ink-500">You had no team for this round.</p>;
  const pts = new Map(points.map((p) => [p.player_id, p]));
  const subsIn = new Set((snap.subs ?? []).map(([, i]) => i)), subsOut = new Set((snap.subs ?? []).map(([o]) => o));
  const picks = snap.picks.slice().sort((a, b) => a.slot - b.slot);
  return (
    <section className="space-y-2" aria-label="My team this round" data-testid="sf-my-round">
      <h2 className="text-sm font-semibold text-ink-900">My team: {snap.total ?? '–'} points{snap.hits ? ` (after −${snap.hits})` : ''}</h2>
      <table className="text-sm">
        <tbody>
          {picks.map((p) => {
            const counts = (p.slot <= 11 && !subsOut.has(p.player_id)) || subsIn.has(p.player_id);
            const base = pts.get(p.player_id)?.points ?? 0;
            const mult = snap.captain_used === p.player_id ? 2 : 1;
            return (
              <tr key={p.player_id} className={counts ? '' : 'text-ink-500'}>
                <td className="pr-3">{byId.get(p.player_id)?.name ?? p.player_id}{snap.captain_used === p.player_id ? ' (C)' : ''}</td>
                <td className="pr-3 text-ink-500">{byId.get(p.player_id)?.club}</td>
                <td className="pr-3 text-xs text-ink-500">{subsIn.has(p.player_id) ? 'came on' : subsOut.has(p.player_id) ? 'did not play' : p.slot > 11 ? 'bench' : ''}</td>
                <td className="text-right font-mono">{snap.points == null ? '' : counts ? base * mult : base}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
