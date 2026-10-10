// My team: join, pick a squad, transfers, XI, bench order, captain and vice.
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SortableTable, { type Column } from '../../components/SortableTable';
import { joinSeason, saveTeam, type SeasonData, type SfEntryRound, type SfMyTeam, type SfPlayer, type SfRound, type SfSeason } from '../../lib/sharkFantasyApi';
import { addPlayer, canAdd, emptyDraft, fromSaved, moveBench, removePlayer, setCaptain, setVice, suggest, summarise, swap, toSave, type Draft } from '../../lib/sharkFantasyDraft';
import type { PlayerInfo } from '../../sharkfantasy/fantasy/squad';
import { rulesFor, type GameRules } from '../../sharkfantasy/fantasy/rules';
import { TYPE_BY_NAME } from '../../sharkfantasy/engine/catalogue';
import { POS_ORDER, price, unavailable, when, xp } from './format';

/** A player type's one-line character ("does nothing except score"). */
const character = (name: string) => TYPE_BY_NAME.get(name)?.line ?? '';

interface Props {
  season: SfSeason; data: SeasonData; mine: SfMyTeam | null; myRounds: SfEntryRound[]; round: SfRound | null;
  signedIn: boolean; email: string; onChanged: () => Promise<void>;
}

export default function TeamTab({ season, data, mine, myRounds, round, signedIn, email, onChanged }: Props) {
  const open = round?.state === 'open';
  if (!signedIn) return <p className="text-sm text-ink-700"><Link to="/login" className="underline">Sign in</Link> to play.</p>;
  if (!mine) return open ? <JoinForm season={season} email={email} onJoined={onChanged} /> : <p className="text-sm text-ink-700">Joining opens again when the next round opens.</p>;
  if (!open) return <LockedView data={data} mine={mine} myRounds={myRounds} round={round} />;
  return <Editor season={season} data={data} mine={mine} myRounds={myRounds} round={round!} onSaved={onChanged} />;
}

function JoinForm({ season, email, onJoined }: { season: SfSeason; email: string; onJoined: () => Promise<void> }) {
  const [team, setTeam] = useState('');
  const [name, setName] = useState(email.split('@')[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await joinSeason(season.season_id, team.trim(), name.trim()); await onJoined(); }
    catch (x) { setErr(x instanceof Error ? x.message : String(x)); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="max-w-md space-y-3" data-testid="sf-join">
      <label className="block text-sm space-y-1"><span className="text-ink-500">Team name</span>
        <input required maxLength={40} className="w-full border border-chalk-300 rounded px-2 py-1" value={team} onChange={(e) => setTeam(e.target.value)} />
      </label>
      <label className="block text-sm space-y-1"><span className="text-ink-500">Manager name</span>
        <input required maxLength={40} className="w-full border border-chalk-300 rounded px-2 py-1" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="submit" disabled={busy || !team.trim() || !name.trim()} className="px-3 py-1.5 rounded bg-pitch-700 text-chalk-100 text-sm disabled:opacity-50">Join</button>
      {err && <p className="text-sm text-loss-700" role="alert">{err}</p>}
    </form>
  );
}

function LockedView({ data, mine, myRounds, round }: { data: SeasonData; mine: SfMyTeam; myRounds: SfEntryRound[]; round: SfRound | null }) {
  const snap = myRounds[myRounds.length - 1];
  const byId = new Map(data.players.map((p) => [p.player_id, p]));
  return (
    <div className="space-y-2 text-sm text-ink-700">
      <p>{round ? `Round ${round.number} is locked. Changes open again after the results.` : 'The season is over.'} <Link to="?tab=round" className="underline">Round</Link></p>
      {snap && (
        <ol className="grid sm:grid-cols-2 gap-x-6" data-testid="sf-locked-team">
          {snap.picks.slice().sort((a, b) => a.slot - b.slot).map((p) => (
            <li key={p.player_id} className={p.slot > 11 ? 'text-ink-500' : ''}>
              {p.slot > 11 ? 'Bench: ' : ''}{byId.get(p.player_id)?.name ?? p.player_id} <span className="text-ink-500">{byId.get(p.player_id)?.club}</span>{p.is_captain ? ' (C)' : p.is_vice ? ' (V)' : ''}
            </li>
          ))}
        </ol>
      )}
      <p className="text-ink-500">{mine.team_name}</p>
    </div>
  );
}

function Editor({ season, data, mine, myRounds, round, onSaved }: { season: SfSeason; data: SeasonData; mine: SfMyTeam; myRounds: SfEntryRound[]; round: SfRound; onSaved: () => Promise<void> }) {
  const players = useMemo(() => new Map(data.players.map((p) => [p.player_id, p])), [data.players]);
  const info = (id: string): PlayerInfo => { const p = players.get(id)!; return { id, clubId: p.club_id, position: p.position }; };
  const priceOf = (id: string) => players.get(id)?.price ?? 0;
  const score = (id: string) => (unavailable(players.get(id)!, round.number) ? -1 : players.get(id)?.next_x_points ?? 0);

  const [draft, setDraft] = useState<Draft>(() => (mine.picks.length ? fromSaved(mine.picks) : emptyDraft()));
  useEffect(() => { setDraft(mine.picks.length ? fromSaved(mine.picks) : emptyDraft()); }, [mine]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const firstDeadline = myRounds.length === 0;
  const R: GameRules = rulesFor(season.rules_version);
  const sum = summarise(draft, mine, priceOf, info, firstDeadline, R);
  const canWildcard = !firstDeadline && mine.wildcards_left > 0 && !mine.wildcard_this_round;

  const click = (id: string) => {
    if (!selected || selected === id) { setSelected(selected === id ? null : id); return; }
    const a = draft.xi.includes(selected), b = draft.xi.includes(id);
    if (a !== b) { setDraft(swap(draft, selected, id, info)); setSelected(null); } else setSelected(id);
  };

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await saveTeam(season.season_id, toSave(draft, info));
      setMsg({ ok: true, text: `Saved. ${firstDeadline ? '' : `${r.transfers} transfer${r.transfers === 1 ? '' : 's'} this round${r.hits_if_deadline_now ? `, −${r.hits_if_deadline_now} points` : ''}.`}` });
      setSelected(null);
      await onSaved();
    } catch (x) { setMsg({ ok: false, text: x instanceof Error ? x.message : String(x) }); }
    finally { setBusy(false); }
  };

  const card = (id: string, bench = false) => {
    const p = players.get(id)!;
    const out = unavailable(p, round.number);
    return (
      <button key={id} type="button" onClick={() => click(id)} data-testid={`sf-card-${id}`}
        className={`w-28 sm:w-32 rounded border px-2 py-1 text-left text-xs leading-tight ${selected === id ? 'border-amber-500 ring-2 ring-amber-400' : 'border-chalk-300'} ${bench ? 'bg-chalk-200' : 'bg-white'}`}>
        <span className="flex justify-between gap-1"><span className="font-medium text-ink-900">{p.name}</span>
          {draft.captain === id && <span className="px-1 rounded bg-amber-400 text-ink-900 font-semibold">C</span>}
          {draft.vice === id && <span className="px-1 rounded bg-chalk-300 text-ink-900 font-semibold">V</span>}
        </span>
        <span className="block text-ink-500">{p.club} · {price(p.price)} · {xp(p.next_x_points)}</span>
        {out && <span className="block text-loss-700">Out until round {p.available_from}</span>}
      </button>
    );
  };

  return (
    <div className="space-y-5" data-testid="sf-editor">
      <section className="rounded bg-pitch-800 p-3 space-y-2" aria-label="Your XI">
        {POS_ORDER.map((pos) => (
          <div key={pos} className="flex flex-wrap justify-center gap-2">{draft.xi.filter((id) => info(id).position === pos).map((id) => card(id))}</div>
        ))}
        {!draft.squad.length && <p className="text-center text-sm text-chalk-200 py-6">Add {R.squadSize} players from the list below.</p>}
      </section>
      {R.squadSize > 11 && <section className="space-y-1" aria-label="Bench">
        <h2 className="text-sm font-semibold text-ink-900">{R.squadSize === 12 ? 'Sub' : 'Bench'}</h2>
        <div className="flex flex-wrap gap-2">{draft.bench.map((id) => card(id, true))}</div>
      </section>}

      {selected && (
        <div className="flex flex-wrap gap-2 text-sm" data-testid="sf-actions">
          <span className="text-ink-700 self-center">{players.get(selected)?.name}:</span>
          {draft.xi.includes(selected) && <button type="button" className="px-2 py-1 rounded border border-chalk-300" onClick={() => setDraft(setCaptain(draft, selected))}>Captain</button>}
          {draft.xi.includes(selected) && <button type="button" className="px-2 py-1 rounded border border-chalk-300" onClick={() => setDraft(setVice(draft, selected))}>Vice-captain</button>}
          {draft.bench.length > 1 && draft.bench.includes(selected) && info(selected).position !== 'GK' && <>
            <button type="button" className="px-2 py-1 rounded border border-chalk-300" onClick={() => setDraft(moveBench(draft, selected, -1, info))}>Bench up</button>
            <button type="button" className="px-2 py-1 rounded border border-chalk-300" onClick={() => setDraft(moveBench(draft, selected, 1, info))}>Bench down</button>
          </>}
          <button type="button" className="px-2 py-1 rounded border border-loss-600 text-loss-700" onClick={() => { setDraft(removePlayer(draft, selected)); setSelected(null); }}>Remove</button>
          <span className="text-ink-500 self-center">Click a {draft.xi.includes(selected) ? 'bench' : 'starting'} player to swap.</span>
        </div>
      )}

      <section className="grid sm:grid-cols-4 gap-3 text-sm" aria-label="Summary" data-testid="sf-summary">
        <div><span className="block text-ink-500">Money left</span><span className={`font-mono ${sum.left < 0 ? 'text-loss-700' : 'text-ink-900'}`}>{price(sum.left)}</span></div>
        <div><span className="block text-ink-500">Transfers</span>
          <span className="text-ink-900">{sum.free ? 'Free until the first deadline' : `${sum.transfers} (free ${mine.free_transfers})`}</span></div>
        <div><span className="block text-ink-500">Points cost</span><span className={sum.hits ? 'text-loss-700' : 'text-ink-900'}>{sum.hits ? `−${sum.hits}` : '0'}</span></div>
        <div>{mine.wildcard_this_round ? <span className="text-ink-700">Wildcard played this round</span>
          : canWildcard ? <label className="flex items-center gap-2"><input type="checkbox" checked={draft.wildcard} onChange={(e) => setDraft({ ...draft, wildcard: e.target.checked })} /> Play wildcard</label>
          : !firstDeadline ? <span className="text-ink-500">Wildcard used</span> : null}</div>
      </section>

      {sum.problems.length > 0 && draft.squad.length > 0 && (
        <ul className="text-sm text-loss-700 list-disc pl-5" data-testid="sf-problems">{sum.problems.map((p) => <li key={p}>{p}</li>)}</ul>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={busy || sum.problems.length > 0 || !sum.changed} className="px-3 py-1.5 rounded bg-pitch-700 text-chalk-100 text-sm disabled:opacity-50" data-testid="sf-save">Save team</button>
        <button type="button" onClick={() => setDraft(suggest(draft, score, info, R))} disabled={draft.squad.length !== R.squadSize} className="px-3 py-1.5 rounded border border-chalk-300 text-sm disabled:opacity-50">Best XI by projection</button>
        <button type="button" onClick={() => { setDraft(mine.picks.length ? fromSaved(mine.picks) : emptyDraft()); setSelected(null); }} disabled={!sum.changed} className="px-3 py-1.5 rounded border border-chalk-300 text-sm disabled:opacity-50">Undo changes</button>
        <span className="text-xs text-ink-500 self-center">Deadline {when(round.deadline_at)}</span>
      </div>
      {msg && <p className={`text-sm ${msg.ok ? 'text-pitch-700' : 'text-loss-700'}`} role="status">{msg.text}</p>}

      <Market data={data} draft={draft} round={round} canAddId={(id) => canAdd(draft, id, info, R) && priceOf(id) <= sum.left} onAdd={(id) => setDraft(addPlayer(draft, id, info, R))} />
    </div>
  );
}

function Market({ data, draft, round, canAddId, onAdd }: { data: SeasonData; draft: Draft; round: SfRound; canAddId: (id: string) => boolean; onAdd: (id: string) => void }) {
  const [pos, setPos] = useState<string>('');
  const [club, setClub] = useState<string>('');
  const [q, setQ] = useState('');
  const rows = data.players.filter((p) => (!pos || p.position === pos) && (!club || p.club_id === club) && (!q || p.name.toLowerCase().includes(q.toLowerCase())));
  const cols: Column<SfPlayer>[] = [
    { key: 'add', label: '', render: (p) => draft.squad.includes(p.player_id) ? <span className="text-xs text-ink-500">In squad</span>
      : <button type="button" disabled={!canAddId(p.player_id)} onClick={() => onAdd(p.player_id)} className="px-2 py-0.5 rounded border border-chalk-300 text-xs disabled:opacity-40" aria-label={`Add ${p.name} (${p.club})`}>Add</button> },
    { key: 'name', label: 'Player', render: (p) => <>{p.name}{unavailable(p, round.number) && <span className="ml-1 text-xs text-loss-700">out until round {p.available_from}</span>}
      <span className="block text-xs text-ink-500">{character(p.name)}</span></>, sortValue: (p) => p.name },
    { key: 'pos', label: 'Pos', render: (p) => p.position, sortValue: (p) => POS_ORDER.indexOf(p.position) },
    { key: 'club', label: 'Club', render: (p) => p.club, sortValue: (p) => p.club },
    { key: 'price', label: 'Price', render: (p) => price(p.price), sortValue: (p) => p.price, align: 'right', descFirst: true },
    { key: 'xp', label: 'Next xP', render: (p) => xp(p.next_x_points), sortValue: (p) => p.next_x_points, align: 'right', descFirst: true },
    { key: 'pts', label: 'Points', render: (p) => p.total_points, sortValue: (p) => p.total_points, align: 'right', descFirst: true },
  ];
  return (
    <section className="space-y-2" aria-label="Players" data-testid="sf-market">
      <h2 className="text-sm font-semibold text-ink-900">Players</h2>
      <div className="flex flex-wrap gap-2 text-sm">
        {['', ...POS_ORDER].map((x) => (
          <button key={x || 'all'} type="button" onClick={() => setPos(x)} className={`px-2 py-0.5 rounded ${pos === x ? 'bg-pitch-800 text-chalk-100' : 'border border-chalk-300'}`}>{x || 'All'}</button>
        ))}
        <select className="border border-chalk-300 rounded px-2 py-0.5 bg-white" value={club} onChange={(e) => setClub(e.target.value)} aria-label="Club">
          <option value="">All clubs</option>
          {data.clubs.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.club_id} value={c.club_id}>{c.name}</option>)}
        </select>
        <input className="border border-chalk-300 rounded px-2 py-0.5" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
      </div>
      <SortableTable columns={cols} rows={rows} rowKey={(p) => p.player_id} initialSort={{ key: 'xp', dir: 'desc' }} testId="sf-market-table" />
    </section>
  );
}
