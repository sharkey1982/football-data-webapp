// Admin test controls: start a test league now, and play rounds as fast as you like.
import { useState } from 'react';
import type { SfSeason } from '../../lib/sharkFantasyApi';

export default function TestControls({ season, onDone }: { season: SfSeason | null; onDone: (universe?: string) => Promise<void> | void }) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const say = (m: string) => setLog((l) => [...l.slice(-4), m]);

  const run = async (job: () => Promise<string | void>) => {
    setBusy(true); setErr(null); setLog([]);
    try { const u = await job(); await onDone(typeof u === 'string' ? u : undefined); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const lib = () => import('../../lib/sharkFantasyTest');
  const test = season?.is_test && season.state !== 'done';

  return (
    <section className="rounded border border-dashed border-amber-500 bg-chalk-200/50 px-3 py-2 text-sm space-y-2" aria-label="Test controls" data-testid="sf-test-controls">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-ink-900">Test</span>
        <button type="button" disabled={busy} className="px-2 py-1 rounded border border-chalk-300 bg-white disabled:opacity-50"
          onClick={() => run(async () => { say('Creating a test league…'); const u = await (await lib()).newTestLeague(say); return u; })}>New test league</button>
        {test && <>
          <button type="button" disabled={busy} className="px-2 py-1 rounded bg-pitch-700 text-chalk-100 disabled:opacity-50" data-testid="sf-play-round"
            onClick={() => run(async () => { say(`Bots, deadline and round ${season.current_round}…`); await (await lib()).playNextRound(season.universe_id, say); return season.universe_id; })}>
            Lock and play round {season.current_round}</button>
          <button type="button" disabled={busy} className="px-2 py-1 rounded border border-chalk-300 bg-white disabled:opacity-50"
            onClick={() => run(async () => {
              const { playNextRound } = await lib();
              for (let i = 0; i < 10; i++) { const r = await playNextRound(season.universe_id, say); if (r === 'season over') break; }
              return season.universe_id;
            })}>Play to the end</button>
        </>}
        {busy && <span className="text-ink-500">Working…</span>}
      </div>
      {log.length > 0 && <ul className="text-xs text-ink-500 font-mono">{log.map((l, i) => <li key={i}>{l}</li>)}</ul>}
      {err && <p className="text-loss-700" role="alert">{err}</p>}
    </section>
  );
}
