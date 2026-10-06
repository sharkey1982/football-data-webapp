// ============================================================================
// src/components/fpl/FirstChoicePanel.tsx
//
// Admin only (the database checks is_admin on every write). Sets a player's
// start chance WHEN FIT -- e.g. Saliba, who plays every game when available
// -- where the model's estimate (from last season's starts) undersells him.
// His injury, return date and doubts still apply on top. Takes effect when
// the projections next run; "Re-run projections now" starts that run.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { getFirstChoices, removeFirstChoice, setFirstChoice, type FirstChoice, type OutlookPlayer } from '../../lib/minutesOutlookApi';
import { triggerWorkflow } from '../../lib/workflowTrigger';

const BTN = 'min-h-11 px-4 rounded text-sm font-medium disabled:opacity-40';
const today = () => new Date().toISOString().slice(0, 10);

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function FirstChoicePanel({ teamId, teamName, players }: { teamId: number; teamName: string; players: OutlookPlayer[] }) {
  const [list, setList] = useState<FirstChoice[]>([]);
  const [playerId, setPlayerId] = useState('');
  const [pct, setPct] = useState('95');
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try { setList(await getFirstChoices(teamId)); } catch (e) { setMsg(errText(e)); }
  }, [teamId]);
  // load() sets state only after its await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const options = [...players].sort((a, b) => a.web_name.localeCompare(b.web_name));
  const save = async () => {
    const v = Number(pct) / 100;
    if (!playerId || !(v > 0 && v <= 0.98)) { setMsg('Choose a player and a start chance between 1% and 98%.'); return; }
    setBusy(true); setMsg(null);
    try {
      await setFirstChoice(Number(playerId), v, from || today(), to || null, note || null);
      setPlayerId(''); setNote(''); setTo('');
      await load();
      setMsg('Saved. It shows in the projections after the next run (07:41 and 19:41 UK time), or run them now below.');
    } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  const remove = async (id: number) => {
    setBusy(true); setMsg(null);
    try { await removeFirstChoice(id); setConfirmId(null); await load(); setMsg('Removed. The model’s own estimate returns after the next run.'); }
    catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };
  const rerun = async () => {
    setBusy(true); setMsg(null);
    try { await triggerWorkflow('fpl-projections-pipeline'); setMsg('Projections re-run started: about 15 minutes. Reload this page after.'); }
    catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };

  return (
    <details className="border border-chalk-300 rounded-lg bg-white p-3" data-testid="first-choice-panel">
      <summary className="cursor-pointer min-h-11 flex items-center font-display uppercase tracking-wide text-sm text-ink-900">
        First choice when fit &middot; admin
      </summary>
      <div className="space-y-3 mt-2 text-sm">
        <p className="text-ink-700 max-w-prose">
          Set a {teamName} player&rsquo;s chance of starting <strong>when he is fit</strong>, where you know better than the
          model (e.g. a first-choice centre-back back from injury). His injury, return date and any doubt still apply, and it
          feeds his expected points.
        </p>
        {list.length > 0 && (
          <ul className="divide-y divide-chalk-200 border border-chalk-200 rounded">
            {list.map((c) => (
              <li key={c.first_choice_id} className="flex flex-wrap items-center gap-2 p-2">
                <span className="flex-1 min-w-40">
                  <span className="font-medium">{c.web_name}</span> &middot; {Math.round(c.start_if_fit * 100)}% when fit
                  <span className="text-ink-500"> &middot; from {c.effective_from}{c.effective_to ? ` to ${c.effective_to}` : ''}{c.note ? ` · ${c.note}` : ''}</span>
                </span>
                {confirmId === c.first_choice_id ? (
                  <>
                    <button type="button" className={`${BTN} bg-loss-700 text-chalk-100`} disabled={busy} onClick={() => void remove(c.first_choice_id)}>Remove</button>
                    <button type="button" className={`${BTN} border border-chalk-300`} onClick={() => setConfirmId(null)}>Keep</button>
                  </>
                ) : (
                  <button type="button" className={`${BTN} border border-chalk-300`} onClick={() => setConfirmId(c.first_choice_id)}>Remove&hellip;</button>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
          <label className="col-span-2 flex flex-col gap-1">Player
            <select className="min-h-11 border border-chalk-300 rounded px-2 bg-white text-base" value={playerId} onChange={(e) => setPlayerId(e.target.value)} aria-label="Player">
              <option value="">Choose&hellip;</option>
              {options.map((p) => <option key={p.fpl_player_id} value={p.fpl_player_id}>{p.web_name} ({p.role ?? p.position})</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">Start chance when fit (%)
            <input type="number" min={1} max={98} inputMode="numeric" className="min-h-11 border border-chalk-300 rounded px-2 text-base" value={pct} onChange={(e) => setPct(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">From
            <input type="date" className="min-h-11 border border-chalk-300 rounded px-2 text-base" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">Until (optional)
            <input type="date" className="min-h-11 border border-chalk-300 rounded px-2 text-base" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="col-span-2 sm:col-span-3 flex flex-col gap-1">Note (optional)
            <input className="min-h-11 border border-chalk-300 rounded px-2 text-base" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Plays every game when fit" />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={`${BTN} bg-pitch-800 text-chalk-100`} disabled={busy || !playerId} onClick={() => void save()}>Save</button>
          <button type="button" className={`${BTN} border border-chalk-300`} disabled={busy} onClick={() => void rerun()}>Re-run projections now</button>
        </div>
        {msg && <p className="text-ink-700" role="status">{msg}</p>}
      </div>
    </details>
  );
}
