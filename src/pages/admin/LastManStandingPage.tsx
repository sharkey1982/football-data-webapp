// ============================================================================
// src/pages/admin/LastManStandingPage.tsx   (/admin/last-man-standing)
//
// Private Last Man Standing pick optimiser (SportSkins PremSkins and
// ChampSkins). Exact DP over every set of teams used, rewarded at the
// rounds where prize money is paid (the "final X" share and the winner's
// share), with game length from a simulated field. Up to 3 entries. The
// whole state is in the URL. Engine: src/lib/lastManStanding.ts; design:
// Claude Docs "Last Man Standing selector — audit and design".
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import { getCurrentSeasonId } from '../../lib/currentSeason';
import SortableTable, { type Column } from '../../components/SortableTable';
import { lineForPot, runEntries, type Candidate, type EntriesInput, type EntriesOutput, type Problem } from '../../lib/lastManStanding';
import { buildProblem, fieldRound, loadLmsData, LMS_LEAGUES, openRounds, type LmsData, type LmsLeague, type ProbSource } from '../../lib/lastManStandingApi';
import { decodeCounts, encodeCounts, fieldState, fitBeta, parsePickCounts, type BetaFit, type FieldRound, type FieldState } from '../../lib/lmsField';

const pct = (v: number, dp = 0) => `${(v * 100).toFixed(dp)}%`;
const int = (v: string | null, d: number) => {
  const n = Number(v);
  return v != null && v !== '' && Number.isFinite(n) ? n : d;
};
const SOURCE_LABEL = { price: 'Odds', market: 'Market rating', dc: 'Dixon-Coles' } as const;
const TAG_CLASS: Record<string, string> = {
  'Optimal': 'bg-amber-400 text-ink-900',
  'Best survival': 'bg-pitch-700 text-chalk-100',
  'Save': 'bg-chalk-300 text-ink-900',
  'Use now': 'bg-chalk-200 text-ink-700',
};

function cellClass(p: number): string {
  if (p >= 0.7) return 'bg-pitch-600 text-chalk-100';
  if (p >= 0.55) return 'bg-pitch-600/40 text-ink-900';
  if (p >= 0.4) return 'bg-chalk-200 text-ink-900';
  return 'bg-loss-600/20 text-ink-700';
}

function useRunner() {
  const worker = useRef<Worker | null>(null);
  const seq = useRef(0);
  useEffect(() => () => worker.current?.terminate(), []);
  return (input: EntriesInput): Promise<EntriesOutput> => {
    if (typeof Worker === 'undefined') return Promise.resolve(runEntries(input));
    if (!worker.current) worker.current = new Worker(new URL('../../workers/lmsWorker.ts', import.meta.url), { type: 'module' });
    const id = ++seq.current;
    const w = worker.current;
    return new Promise((resolve, reject) => {
      const onMsg = (e: MessageEvent<{ id: number; out?: EntriesOutput; error?: string }>) => {
        if (e.data.id !== id) return;
        w.removeEventListener('message', onMsg);
        if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.out!);
      };
      w.addEventListener('message', onMsg);
      w.postMessage({ id, input });
    });
  };
}

export default function LastManStandingPage() {
  useDocumentHead({ title: 'Last Man Standing' });
  const auth = useAuthOptional();
  const isAdmin = auth?.isAdmin ?? false;
  const [params, setParams] = useSearchParams();
  const league = (params.get('lg') === 'E1' ? 'E1' : 'E0') as LmsLeague;
  const source = (params.get('src') === 'dc' ? 'dc' : 'market') as ProbSource;
  const nEntries = Math.min(3, Math.max(1, int(params.get('entries'), 1)));
  const potRaw = params.get('pot');
  // SportSkins entries are always £10 (Chris, 10 Oct 2026)
  const fee = params.get('fee') === '0' ? null : int(params.get('fee'), 10) || null;
  const rake = int(params.get('rake'), 15) / 100;
  const sideShare = int(params.get('side'), 20) / 100;
  const usedIds = [1, 2, 3].map((e) => (params.get(`e${e}`) ?? '').split(',').filter(Boolean).map(Number));

  const [data, setData] = useState<LmsData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [out, setOut] = useState<EntriesOutput | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const runner = useRunner();

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') next.delete(k); else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  useEffect(() => {
    if (!isAdmin) return;
    let live = true;
    setData(null); setOut(null); setLoadError(null);
    getCurrentSeasonId()
      .then((season) => loadLmsData(league, season))
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setLoadError(e instanceof Error ? e.message : String(e)); });
    return () => { live = false; };
  }, [league, isAdmin]);

  const rounds = useMemo(() => (data ? openRounds(data.fixtures) : []), [data]);
  const gw = int(params.get('gw'), rounds[0] ?? 0);
  const problem: Problem | null = useMemo(() => (data && gw ? buildProblem(data, gw, source) : null), [data, gw, source]);

  // the real field: pick counts pasted from each round's email, one URL parameter per gameweek (f6=1:1802,20:843,...)
  const fieldKey = [...params.entries()].filter(([k]) => /^f\d+$/.test(k)).map(([k, v]) => `${k}=${v}`).sort().join('&');
  const field = useMemo(() => {
    if (!data || !problem) return null;
    const T = problem.teams.length;
    const all: FieldRound[] = [...params.entries()]
      .filter(([k]) => /^f\d+$/.test(k))
      .map(([k, v]) => fieldRound(data, Number(k.slice(1)), source, problem.teams, decodeCounts(v)))
      .filter((r) => r.counts.some((n) => n > 0))
      .sort((a, b) => a.gw - b.gw);
    if (all.length === 0) return null;
    const before = all.filter((r) => r.gw < gw);
    const current = all.find((r) => r.gw === gw) ?? null;
    return { all, before, current, state: fieldState(all, T), stateBefore: fieldState(before, T), fit: fitBeta(all, T) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, problem, fieldKey, gw, source]);

  const entrantsStart = int(params.get('n0'), field?.state.entrants0 || 4000);
  const fieldLeft = field ? (field.before.length ? Math.round(field.stateBefore.left) : field.current ? field.current.counts.reduce((a, b) => a + b, 0) : null) : null;
  const entrantsLeft = int(params.get('n'), fieldLeft ?? entrantsStart);
  // SportSkins keeps a cut (15%, Chris 6 Oct): with a fee and no pot given, the pot is what's left of the entries
  const pot = potRaw ? int(potRaw, 0) || null : fee ? Math.round(entrantsStart * fee * (1 - rake)) : null;
  // fitted to the pasted rounds; with none, 7 (PremSkins 1 GW1 fitted 7.4: 6,704 entries, Chris 6 Oct 2026)
  const betaFitted = field?.fit ? Math.round(field.fit.beta * 10) / 10 : null;
  const beta = int(params.get('beta'), betaFitted ?? 7);
  const usedShare0 = field && field.before.length ? field.stateBefore.usedShare : undefined;
  const pickShares0 = useMemo(() => {
    if (!field?.current || !problem) return undefined;
    const c = field.current.counts.map((n, j) => (problem.cells[0]?.[j] ? n : 0));
    const tot = c.reduce((a, b) => a + b, 0);
    return tot > 0 ? c.map((n) => n / tot) : undefined;
  }, [field, problem]);

  const masks = useMemo(() => {
    if (!problem) return [];
    const idx = new Map(problem.teams.map((t, i) => [t.id, i]));
    return usedIds.slice(0, nEntries).map((ids) => ids.reduce((m, id) => (idx.has(id) ? m | (1 << idx.get(id)!) : m), 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem, nEntries, params]);

  const line = int(params.get('line'), lineForPot(pot));
  const opponents = Math.max(0, entrantsLeft - nEntries);

  useEffect(() => {
    if (!problem || problem.rounds.length === 0) return;
    let live = true;
    setRunning(true); setRunError(null);
    runner({
      problem,
      usedMasks: masks,
      field: { opponents, beta, sims: 2000, seed: 7 },
      prize: { sideShare, line, linePassed: entrantsLeft <= line },
      usedShare0,
      pickShares0,
    })
      .then((o) => { if (live) setOut(o); })
      .catch((e) => { if (live) setRunError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (live) setRunning(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problem, masks.join(','), opponents, beta, sideShare, line, entrantsLeft, usedShare0?.join(','), pickShares0?.join(',')]);

  if (auth && !auth.loading && !isAdmin) {
    return <div className="max-w-3xl mx-auto px-4 py-8"><p className="text-sm text-ink-700">This page is for admins.</p></div>;
  }

  const toggleUsed = (entry: number, teamId: number) => {
    const ids = usedIds[entry - 1];
    const next = ids.includes(teamId) ? ids.filter((x) => x !== teamId) : [...ids, teamId];
    set({ [`e${entry}`]: next.join(',') });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6" data-testid="lms-page">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-ink-900">Last Man Standing</h1>
        <p className="text-sm text-ink-700">{LMS_LEAGUES[league].game}: the pick that maximises your expected share of the pot, not just this week's survival.</p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm" aria-label="Competition">
        <label className="space-y-1"><span className="block text-ink-500">League</span>
          <select className="w-full border border-chalk-300 rounded px-2 py-1 bg-white" value={league} onChange={(e) => set({ lg: e.target.value, gw: null, e1: null, e2: null, e3: null })}>
            {Object.entries(LMS_LEAGUES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="block text-ink-500">Pick for</span>
          <select className="w-full border border-chalk-300 rounded px-2 py-1 bg-white" value={gw} onChange={(e) => set({ gw: e.target.value })}>
            {rounds.map((r) => <option key={r} value={r}>GW{r}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="block text-ink-500">Entrants at start</span>
          <input type="number" min={2} className="w-full border border-chalk-300 rounded px-2 py-1" value={entrantsStart} onChange={(e) => set({ n0: e.target.value })} />
        </label>
        <label className="space-y-1"><span className="block text-ink-500">Entrants left</span>
          <input type="number" min={1} className="w-full border border-chalk-300 rounded px-2 py-1" value={entrantsLeft} onChange={(e) => set({ n: e.target.value })} />
        </label>
        <label className="space-y-1"><span className="block text-ink-500">Pot (£)</span>
          <input type="number" min={0} className="w-full border border-chalk-300 rounded px-2 py-1" value={potRaw ?? ''} placeholder={pot ? String(pot) : 'unknown'} onChange={(e) => set({ pot: e.target.value, line: null })} />
        </label>
        <label className="space-y-1"><span className="block text-ink-500">Entry fee (£)</span>
          <input type="number" min={0} className="w-full border border-chalk-300 rounded px-2 py-1" value={fee ?? ''} placeholder="unknown" onChange={(e) => set({ fee: e.target.value, line: null })} />
        </label>
        <label className="space-y-1"><span className="block text-ink-500">Your entries</span>
          <select className="w-full border border-chalk-300 rounded px-2 py-1 bg-white" value={nEntries} onChange={(e) => set({ entries: e.target.value })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="space-y-1"><span className="block text-ink-500">Win chances</span>
          <select className="w-full border border-chalk-300 rounded px-2 py-1 bg-white" value={source} onChange={(e) => set({ src: e.target.value === 'dc' ? 'dc' : null })}>
            <option value="market">Market (odds, else ratings)</option>
            <option value="dc">Dixon-Coles</option>
          </select>
        </label>
        <details className="col-span-2 sm:col-span-1">
          <summary className="cursor-pointer text-ink-500">Advanced</summary>
          <div className="space-y-2 pt-2">
            <label className="block"><span className="text-ink-500">Final X line</span>
              <input type="number" min={1} className="w-full border border-chalk-300 rounded px-2 py-1" value={line} onChange={(e) => set({ line: e.target.value })} />
            </label>
            <label className="block"><span className="text-ink-500">Final X share (%)</span>
              <input type="number" min={0} max={100} className="w-full border border-chalk-300 rounded px-2 py-1" value={Math.round(sideShare * 100)} onChange={(e) => set({ side: e.target.value })} />
            </label>
            <label className="block"><span className="text-ink-500">Host's cut (%)</span>
              <input type="number" min={0} max={100} className="w-full border border-chalk-300 rounded px-2 py-1" value={Math.round(rake * 100)} onChange={(e) => set({ rake: e.target.value })} />
            </label>
            <label className="block"><span className="text-ink-500">Field favours favourites</span>
              <input type="number" min={0} max={30} className="w-full border border-chalk-300 rounded px-2 py-1" value={beta} onChange={(e) => set({ beta: e.target.value })} />
            </label>
          </div>
        </details>
      </section>

      {loadError && <p className="text-sm text-loss-600">Couldn't load fixtures: {loadError}</p>}
      {!data && !loadError && <p className="text-sm text-ink-500">Loading fixtures…</p>}

      {problem && (
        <section className="space-y-3" aria-label="Teams used">
          {Array.from({ length: nEntries }, (_, i) => i + 1).map((entry) => (
            <div key={entry} className="space-y-1">
              <p className="text-sm text-ink-500">{nEntries > 1 ? `Entry ${entry}: teams used` : 'Teams used'} ({usedIds[entry - 1].filter((id) => problem.teams.some((t) => t.id === id)).length})</p>
              <div className="flex flex-wrap gap-1">
                {problem.teams.map((t) => {
                  const on = usedIds[entry - 1].includes(t.id);
                  return (
                    <button key={t.id} type="button" aria-pressed={on} onClick={() => toggleUsed(entry, t.id)}
                      className={`px-2 py-0.5 rounded text-xs border ${on ? 'bg-ink-700 text-chalk-100 border-ink-700 line-through' : 'bg-white text-ink-900 border-chalk-300'}`}>
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {problem && data && (
        <FieldSection
          problem={problem}
          rounds={[...new Set([...data.fixtures.map((f) => f.matchweek).filter((r) => r != null && r <= gw)])].sort((a, b) => b - a)}
          gw={gw}
          field={field}
          fit={field?.fit ?? null}
          betaUsed={beta}
          betaManual={params.get('beta') != null}
          onAdd={(round, counts) => set({ [`f${round}`]: encodeCounts(counts), n: null, n0: null, beta: null })}
          onRemove={(round) => set({ [`f${round}`]: null, n: null, n0: null, beta: null })}
        />
      )}

      {runError && <p className="text-sm text-loss-600">The optimiser failed: {runError}</p>}
      {running && !out && <p className="text-sm text-ink-500">Working out the best picks…</p>}
      {problem && out && <Results problem={problem} out={out} running={running} nEntries={nEntries} entrantsLeft={entrantsLeft} line={line} pot={pot} sideShare={sideShare} fee={fee} rake={rake} />}
    </div>
  );
}

function FieldSection({ problem, rounds, gw, field, fit, betaUsed, betaManual, onAdd, onRemove }: {
  problem: Problem;
  rounds: number[];
  gw: number;
  field: { all: FieldRound[]; before: FieldRound[]; current: FieldRound | null; state: FieldState; stateBefore: FieldState } | null;
  fit: BetaFit | null;
  betaUsed: number;
  betaManual: boolean;
  onAdd: (round: number, counts: Map<number, number>) => void;
  onRemove: (round: number) => void;
}) {
  const [round, setRound] = useState<number>(gw);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { setRound(gw); }, [gw]);
  const name = (j: number) => problem.teams[j].name;
  const n = (v: number) => Math.round(v).toLocaleString('en-GB');

  const add = () => {
    const parsed = parsePickCounts(text, problem.teams);
    if (parsed.counts.size === 0) {
      setMsg(parsed.unknown.length ? `No team recognised (${parsed.unknown.join(', ')}).` : 'No "Team 123" lines found.');
      return;
    }
    onAdd(round, parsed.counts);
    const total = [...parsed.counts.values()].reduce((a, b) => a + b, 0);
    setMsg(`GW${round}: ${total.toLocaleString('en-GB')} picks on ${parsed.counts.size} teams.` + (parsed.unknown.length ? ` Not recognised, left out: ${parsed.unknown.join(', ')}.` : ''));
    setText('');
  };

  // the field still in, before the round being picked: who it has used
  const usedNow = field && field.before.length
    ? field.stateBefore.usedShare.map((u, j) => ({ j, u })).filter((x) => x.u >= 0.005).sort((a, b) => b.u - a.u)
    : [];

  return (
    <section className="space-y-3 text-sm" aria-label="The field" data-testid="lms-field">
      <h2 className="text-lg font-semibold text-ink-900">The field</h2>
      <p className="text-ink-700">Paste each round's pick counts from the SportSkins email. They set the entrants, the field's favouritism, which teams the surviving field has used, and (for the round being picked) the real pick shares.</p>
      <div className="grid gap-2 sm:grid-cols-[8rem_1fr_auto] items-start">
        <label className="space-y-1"><span className="block text-ink-500">Premier League GW</span>
          <select className="w-full border border-chalk-300 rounded px-2 py-1 bg-white" value={round} onChange={(e) => setRound(Number(e.target.value))} data-testid="lms-field-gw">
            {rounds.map((r) => <option key={r} value={r}>GW{r}</option>)}
          </select>
        </label>
        <label className="space-y-1 min-w-0"><span className="block text-ink-500">Pick counts</span>
          <textarea rows={4} className="w-full border border-chalk-300 rounded px-2 py-1 font-mono text-xs" placeholder={'Arsenal 1802\nChelsea 843\nMan Utd 640'} value={text} onChange={(e) => setText(e.target.value)} data-testid="lms-field-text" />
        </label>
        <button type="button" className="sm:mt-6 px-3 py-1.5 rounded bg-pitch-700 text-chalk-100" onClick={add}>Add round</button>
      </div>
      {msg && <p className="text-ink-700" data-testid="lms-field-msg">{msg}</p>}

      {field && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full max-w-2xl" data-testid="lms-field-rounds">
              <thead><tr className="text-left text-ink-500"><th className="py-1 pr-3">GW</th><th className="text-right">Entries</th><th className="text-right">Survived</th><th className="pl-3">Most picked</th><th /></tr></thead>
              <tbody>
                {field.state.rounds.map((r) => (
                  <tr key={r.gw} className="border-t border-chalk-200">
                    <td className="py-1 pr-3">{r.gw}</td>
                    <td className="text-right">{n(r.entries)}</td>
                    <td className="text-right">{r.pending ? `~${n(r.survived)}` : n(r.survived)}{r.pending && <span className="block text-xs text-ink-500">{n(r.stillToPlay)} still to play</span>}</td>
                    <td className="pl-3">{r.top.map((t) => `${name(t.team)} ${Math.round((t.n / r.entries) * 100)}%`).join(', ')}</td>
                    <td className="text-right"><button type="button" className="text-xs text-loss-600 underline" onClick={() => onRemove(r.gw)} aria-label={`Remove GW${r.gw}`}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fit && (
            <p className="text-ink-700" data-testid="lms-field-fit">
              Favouritism fitted to {fit.picks.toLocaleString('en-GB')} picks over {fit.rounds} round{fit.rounds > 1 ? 's' : ''}: {fit.beta.toFixed(1)}
              {betaManual ? ` (you've set ${betaUsed} in Advanced)` : ' (used below)'}. PremSkins 1's first round fitted 7.4.
            </p>
          )}
          {field.current && <p className="text-ink-700">GW{gw}'s real pick shares replace the model's for this round's field leverage.</p>}
          {usedNow.length > 0 && (
            <p className="text-ink-700" data-testid="lms-field-used">
              The field still in before GW{gw} has used{field.stateBefore.pending ? ' (expected, results to come)' : ''}: {usedNow.slice(0, 8).map((x) => `${name(x.j)} ${Math.round(x.u * 100)}%`).join(', ')}.
              It can't pick those again, so they matter less to it later and the teams it has saved are where it will crowd.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function Results({ problem, out, running, nEntries, entrantsLeft, line, pot, sideShare, fee, rake }: {
  problem: Problem; out: EntriesOutput; running: boolean; nEntries: number; entrantsLeft: number; line: number; pot: number | null; sideShare: number;
  fee: number | null; rake: number;
}) {
  const first = out.entries[0];
  const name = (t: number) => problem.teams[t].name;
  const fair = 1 / Math.max(entrantsLeft, 1);
  const horizon = Math.max(...out.entries.map((e) => e.horizon), 1);
  const expectedRounds = out.curve.extinct.reduce((a, v, k) => a + v * (k + 1), 0);
  const lineRound = out.curve.lineByRound.findIndex((v) => v >= 0.5);

  return (
    <div className={`space-y-6 ${running ? 'opacity-60' : ''}`}>
      <section className="space-y-2" aria-label="Best pick">
        <h2 className="text-lg font-semibold text-ink-900">GW{problem.rounds[0]}</h2>
        <p className="text-sm text-ink-700">
          Game expected to last about {expectedRounds.toFixed(1)} more rounds · final {line} reached {lineRound >= 0 ? `by GW${problem.rounds[lineRound]} (half the time)` : 'later'}
          {entrantsLeft <= line ? ' (already reached)' : ''} · horizon {horizon} rounds
        </p>
        {out.entries.map((e, i) => e.analysis.best && (
          <div key={i} className="border border-amber-500 rounded p-3 bg-white space-y-1" data-testid={`best-${i + 1}`}>
            <p className="text-sm text-ink-500">{nEntries > 1 ? `Entry ${i + 1}: best pick` : 'Best pick'}</p>
            <p className="text-lg font-semibold text-ink-900">
              {e.analysis.best.name} <span className="font-normal text-ink-700">{e.analysis.best.cell.home ? 'v' : 'at'} {e.analysis.best.cell.opponent}</span> {pct(e.analysis.best.cell.p, 1)}
            </p>
            <p className="text-sm text-ink-700">{e.analysis.why}</p>
            {e.analysis.fieldBest && e.analysis.fieldBest.team !== e.analysis.best.team && (
              <p className="text-sm text-ink-700" data-testid={`field-best-${i + 1}`}>
                Counting the field: {e.analysis.fieldBest.name} {e.analysis.fieldBest.cell.home ? 'v' : 'at'} {e.analysis.fieldBest.cell.opponent} edges it
                ({pct(e.analysis.fieldBest.pickShare ?? 0)} of the field expected on them against {pct(e.analysis.best.pickShare ?? 0)} on {e.analysis.best.name}; {e.analysis.best.name} is worth {pct(e.analysis.best.fieldRelative, 1)} of it).
              </p>
            )}
            <p className="text-xs text-ink-500">
              Expected share of the pot {pct(e.analysis.expected, 2)}{pot ? ` (£${(e.analysis.expected * pot).toFixed(2)})` : ''} · a fair share is {pct(fair, 2)}{fee ? ` (£${(fair * (pot ?? 0)).toFixed(2)} for a £${fee} entry after the ${pct(rake)} cut; break-even needs ${(1 / (1 - rake)).toFixed(2)}× a fair share)` : ''} · against the modelled field, which picks worse than a real one: use these figures to compare picks, not to judge whether entering pays
            </p>
          </div>
        ))}
      </section>

      {out.spreads.length > 0 && (
        <section className="space-y-2" aria-label="Spreading your entries">
          <h2 className="text-lg font-semibold text-ink-900">Spreading your entries</h2>
          <p className="text-sm text-ink-700">Entries' values add up, so the top row is worth most; each row below gives up a little value for a lower chance of losing every entry this round.</p>
          <SortableTable
            testId="lms-spreads"
            rows={out.spreads}
            rowKey={(s) => s.picks.join('-')}
            columns={[
              ...Array.from({ length: nEntries }, (_, i) => ({ key: `e${i}`, label: `Entry ${i + 1}`, render: (s: typeof out.spreads[number]) => name(s.picks[i]) })),
              { key: 'rel', label: 'Value v best', align: 'right' as const, render: (s) => pct(s.relative, 1), sortValue: (s) => s.relative, descFirst: true },
              { key: 'out', label: 'All out this round', align: 'right' as const, render: (s) => pct(s.allOut, 1), sortValue: (s) => s.allOut },
            ]}
          />
        </section>
      )}

      {out.entries.map((e, i) => (
        <section key={i} className="space-y-2" aria-label={`Candidates entry ${i + 1}`}>
          <h2 className="text-lg font-semibold text-ink-900">{nEntries > 1 ? `Entry ${i + 1}: every option` : 'Every option'}</h2>
          <CandidateTable rows={e.analysis.candidates} testId={`lms-candidates-${i + 1}`} />
        </section>
      ))}

      <section className="space-y-2" aria-label="Current best path">
        <h2 className="text-lg font-semibold text-ink-900">Current best path</h2>
        <p className="text-sm text-ink-700">Recalculated after every round: odds, injuries, fixtures and the field will change it.{nEntries > 1 ? ' Entry 1.' : ''}</p>
        <table className="text-sm w-full max-w-xl" data-testid="lms-path">
          <thead><tr className="text-left text-ink-500"><th className="py-1">GW</th><th>Team</th><th>Opponent</th><th className="text-right">Win</th><th className="text-right">Still in</th></tr></thead>
          <tbody>
            {first.analysis.path.map((s) => (
              <tr key={s.round} className="border-t border-chalk-200">
                <td className="py-1">{s.round}</td>
                <td>{name(s.team)}</td>
                <td>{s.cell.home ? 'v' : 'at'} {s.cell.opponent}</td>
                <td className="text-right">{pct(s.cell.p)}</td>
                <td className="text-right">{pct(s.aliveAfter, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <FixtureMatrix problem={problem} out={out} />

      <details className="text-sm space-y-2">
        <summary className="cursor-pointer text-ink-700">Behind the numbers</summary>
        <table className="w-full max-w-xl" data-testid="lms-curve">
          <thead><tr className="text-left text-ink-500"><th className="py-1">GW</th><th className="text-right">Game still on</th><th className="text-right">Others left (mean)</th><th className="text-right">Final {line} reached</th><th className="text-right">Ends here</th></tr></thead>
          <tbody>
            {problem.rounds.slice(0, horizon).map((r, k) => (
              <tr key={r} className="border-t border-chalk-200">
                <td className="py-1">{r}</td>
                <td className="text-right">{pct(out.curve.running[k])}</td>
                <td className="text-right">{Math.round(out.curve.meanLeft[k]).toLocaleString('en-GB')}</td>
                <td className="text-right">{pct(out.curve.lineByRound[k])}</td>
                <td className="text-right">{pct(out.curve.extinct[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-ink-500">
          Win chances: de-vigged average odds where posted, otherwise market-rating expected goals (Model Lab F4/P5) through a Poisson grid; Dixon-Coles if chosen.
          The field picks unused teams in proportion to exp(favouritism × win chance), simulated 2,000 times. Favouritism is fitted to the pasted pick counts (7 without any; PremSkins 1's GW1 fitted 7.4).
          Pasted rounds also set which teams the surviving field has used, assuming a survivor's earlier picks don't depend on whether they survive later (the emails give counts, not each entrant's history); a round still being played counts each team's pickers at its win chance.
          "With field" also counts this round's leverage: a win that knocks out more of the field leaves a bigger share for you (share ∝ 1 ÷ field left; only this round's results are joint).
          Prize: {pct(sideShare)} of the pot is split between those left when the field first reaches {line}; the other {pct(1 - sideShare)} goes to the last one standing; all out together splits. Solved exactly in {out.ms.toLocaleString('en-GB')} ms.
        </p>
      </details>
    </div>
  );
}

function CandidateTable({ rows, testId }: { rows: Candidate[]; testId: string }) {
  const columns: Column<Candidate>[] = [
    { key: 'team', label: 'Team', render: (c) => c.name, sortValue: (c) => c.name },
    { key: 'opp', label: 'Opponent', render: (c) => `${c.cell.home ? 'v' : 'at'} ${c.cell.opponent}`, sortValue: (c) => c.cell.opponent, className: 'hidden sm:table-cell' },
    { key: 'p', label: 'Win', align: 'right', render: (c) => pct(c.cell.p, 1), sortValue: (c) => c.cell.p, descFirst: true },
    { key: 'rel', label: 'Value v best', align: 'right', render: (c) => pct(c.relative, 1), sortValue: (c) => c.relative, descFirst: true },
    { key: 'later', label: 'Best later', render: (c) => (c.bestLater ? `GW${c.bestLater.round} ${c.bestLater.home ? 'v' : 'at'} ${c.bestLater.opponent} ${pct(c.bestLater.p)}` : '—'), sortValue: (c) => c.bestLater?.p ?? null, descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'n65', label: 'Later 65%+', align: 'right', render: (c) => c.laterAbove65, sortValue: (c) => c.laterAbove65, descFirst: true, className: 'hidden md:table-cell' },
    { key: 'own', label: 'Field picks', align: 'right', render: (c) => (c.pickShare == null ? '—' : pct(c.pickShare)), sortValue: (c) => c.pickShare, descFirst: true, className: 'hidden md:table-cell' },
    { key: 'field', label: 'With field', align: 'right', render: (c) => pct(c.fieldRelative, 1), sortValue: (c) => c.fieldRelative, descFirst: true, className: 'hidden sm:table-cell' },
    { key: 'src', label: 'Source', render: (c) => SOURCE_LABEL[c.cell.source], sortValue: (c) => c.cell.source, className: 'hidden lg:table-cell' },
    { key: 'tag', label: '', render: (c) => (c.tag ? <span className={`px-1.5 py-0.5 rounded text-xs whitespace-nowrap ${TAG_CLASS[c.tag]}`}>{c.tag}</span> : null) },
  ];
  return <SortableTable testId={testId} rows={rows} rowKey={(c) => String(c.team)} columns={columns} initialSort={{ key: 'rel', dir: 'desc' }} />;
}

function FixtureMatrix({ problem, out }: { problem: Problem; out: EntriesOutput }) {
  const cols = Math.min(problem.rounds.length, 10);
  const path = new Map(out.entries[0].analysis.path.map((s) => [`${s.round}:${s.team}`, true]));
  const available = new Set(out.entries[0].analysis.candidates.map((c) => c.team));
  const bottlenecks = new Set(out.entries[0].analysis.bottlenecks);
  const order = problem.teams.map((_, i) => i).sort((a, b) => {
    const pa = problem.cells.slice(0, cols).reduce((s, row) => s + (row[a]?.p ?? 0), 0);
    const pb = problem.cells.slice(0, cols).reduce((s, row) => s + (row[b]?.p ?? 0), 0);
    return pb - pa;
  });
  return (
    <section className="space-y-2" aria-label="Fixture matrix">
      <h2 className="text-lg font-semibold text-ink-900">Win chance by gameweek</h2>
      <p className="text-sm text-ink-700">Outlined: the current best path. Greyed: teams entry 1 has used. ! = fewer than three unused teams at 55%+.</p>
      <div className="overflow-x-auto">
        <table className="text-xs border-separate border-spacing-0.5" data-testid="lms-matrix">
          <thead>
            <tr>
              <th className="text-left pr-2 sticky left-0 bg-chalk-100">Team</th>
              {problem.rounds.slice(0, cols).map((r) => <th key={r} className="px-1 font-medium text-ink-700">{r}{bottlenecks.has(r) ? '!' : ''}</th>)}
            </tr>
          </thead>
          <tbody>
            {order.map((t) => {
              const isUsed = !available.has(t) && problem.cells[0][t] != null;
              return (
                <tr key={t}>
                  <td className={`pr-2 whitespace-nowrap sticky left-0 bg-chalk-100 ${isUsed ? 'text-ink-500 line-through' : 'text-ink-900'}`}>{problem.teams[t].name}</td>
                  {problem.rounds.slice(0, cols).map((r, k) => {
                    const c = problem.cells[k][t];
                    const onPath = path.has(`${r}:${t}`);
                    if (!c) return <td key={r} className="text-center text-ink-500 min-w-[2.75rem]">–</td>;
                    return (
                      <td key={r} title={`${c.home ? 'v' : 'at'} ${c.opponent}`}
                        className={`text-center rounded min-w-[2.75rem] py-0.5 ${isUsed ? 'bg-chalk-200/60 text-ink-500' : cellClass(c.p)} ${onPath ? 'ring-2 ring-amber-500' : ''}`}>
                        {Math.round(c.p * 100)}
                        <span className="block text-[10px] leading-tight opacity-80">{c.home ? '' : '@'}{c.opponent.slice(0, 3).toUpperCase()}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
