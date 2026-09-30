// ============================================================================
// src/pages/fpl/SquadCheckPage.tsx
//
// /fpl/squad-check?id=1234567 -- a manager's real FPL squad against the
// model: projected points for their squad and line-up, the model's own squad
// at the same budget, and quick-win swaps. See src/lib/squadCheck.ts.
// The FPL ID lives in the URL (shareable) and, as a convenience, in this
// browser's storage; nothing is stored on the server.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { getDefaultMatchweek } from '../../lib/fplSeasonApi';
import { optimizeFplSquad } from '../../lib/fplOptimizerApi';
import { trackEvent } from '../../lib/analytics';
import {
  bestXi,
  buildSquad,
  fetchFplEntry,
  lineupScore,
  loadPool,
  money,
  POSITION_LABEL,
  quickWins,
  squadScore,
  type CheckPlayer,
  type FplEntry,
  type Position,
  type SquadPlayer,
} from '../../lib/squadCheck';

const STORAGE_KEY = 'fixtureshark.fplId';
const HORIZONS = [1, 3, 5];
const MIN_GAINS = [0.5, 1, 2, 3];

function readStoredId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage unavailable: the URL still carries the id */
  }
}

type Loaded = { entry: FplEntry; squad: SquadPlayer[]; pool: Map<number, CheckPlayer>; from: number; to: number };

function Tile({ value, label, detail }: { value: string; label: string; detail?: string }) {
  return (
    <div className="border border-chalk-300 rounded-lg bg-white px-3 py-2">
      <p className="font-display text-2xl text-ink-900 leading-tight">{value}</p>
      <p className="text-xs text-ink-700">{label}</p>
      {detail && <p className="text-xs text-ink-500">{detail}</p>}
    </div>
  );
}

function PlayerLink({ p }: { p: CheckPlayer }) {
  return p.slug ? (
    <Link to={`/fpl/players/${p.slug}`} className="text-pitch-800 underline underline-offset-2">
      {p.name}
    </Link>
  ) : (
    <>{p.name}</>
  );
}

export default function SquadCheckPage() {
  const [params, setParams] = useSearchParams();
  const urlId = params.get('id') ?? '';
  const [input, setInput] = useState(urlId || readStoredId());
  const [horizon, setHorizon] = useState(3);
  const [minGain, setMinGain] = useState(1);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState<{ key: string; score: number; budget: number } | { key: string; failed: true } | null>(null);

  useDocumentHead({
    title: 'Squad Check — your FPL team against the model',
    description: 'Enter your FPL ID: your squad’s projected points, the model’s best squad at your budget, and the swaps it rates most.',
    path: '/fpl/squad-check',
  });

  // Load whenever the id in the URL or the range changes.
  useEffect(() => {
    if (!/^\d{1,8}$/.test(urlId)) return;
    let live = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const from = await getDefaultMatchweek();
        const to = Math.min(38, from + horizon - 1);
        const [entry, pool] = await Promise.all([fetchFplEntry(Number(urlId)), loadPool(from, to)]);
        const squad = await buildSquad(entry, pool);
        if (!live) return;
        setLoaded({ entry, squad, pool, from, to });
        storeId(urlId);
        trackEvent('squad_check', { horizon });
      } catch (e) {
        if (live) {
          setLoaded(null);
          setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
        }
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [urlId, horizon]);

  const weeks = useMemo(() => (loaded ? Array.from({ length: loaded.to - loaded.from + 1 }, (_, i) => loaded.from + i) : []), [loaded]);
  const budget = loaded ? loaded.squad.reduce((s, p) => s + p.sell, 0) + loaded.entry.bank : 0;
  const modelKey = loaded ? `${loaded.entry.entry_id}:${loaded.from}-${loaded.to}:${budget}` : '';

  // The model's own squad at this budget (the optimiser), scored the same way.
  useEffect(() => {
    if (!loaded || model?.key === modelKey) return;
    let live = true;
    optimizeFplSquad(loaded.from, loaded.to, budget / 10)
      .then((r) => {
        if (!live) return;
        const players: CheckPlayer[] = r.squad.map((p) => ({
          id: p.id, name: p.name, slug: null, team: p.team, teamId: 0, pos: p.position as Position, price: Math.round(p.price * 10),
          gw: Object.fromEntries(Object.entries(p.gw_xpts).map(([k, v]) => [Number(k), v])), total: p.total_xpts,
        }));
        setModel({ key: modelKey, score: squadScore(players, weeks), budget });
      })
      .catch(() => live && setModel({ key: modelKey, failed: true }));
    return () => {
      live = false;
    };
  }, [loaded, modelKey, budget, weeks, model?.key]);

  const view = useMemo(() => {
    if (!loaded) return null;
    const { squad, pool, entry, from } = loaded;
    const mine = squadScore(squad, weeks);
    const next = bestXi(squad, from);
    const asPicked = lineupScore(squad, from);
    const wins = quickWins(squad, [...pool.values()], entry.bank, minGain, weeks);
    const ordered = [...squad].sort((a, b) => a.pos - b.pos || b.total - a.total);
    return { mine, next, asPicked, wins, ordered };
  }, [loaded, weeks, minGain]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const id = input.trim();
    if (!/^\d{1,8}$/.test(id)) {
      setError('Your FPL ID is a number, up to 8 digits.');
      return;
    }
    setParams({ id });
  };

  const range = loaded ? (loaded.from === loaded.to ? `GW${loaded.from}` : `GW${loaded.from}–${loaded.to}`) : '';
  const modelReady = model && model.key === modelKey && !('failed' in model) ? model : null;

  return (
    <article className="space-y-6">
      <header>
        <p className="font-mono text-xs text-pitch-700 uppercase tracking-widest">
          <Link to="/fpl" className="hover:underline">Fantasy</Link>
        </p>
        <h1 className="font-display uppercase tracking-wide text-3xl text-ink-900 mt-1">Squad Check</h1>
        <p className="text-ink-700 mt-1 max-w-prose">Your FPL squad against the model: projected points, the model&rsquo;s squad at your budget, and the swaps it rates most.</p>
      </header>

      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="text-xs font-mono uppercase tracking-widest text-ink-500">FPL ID</span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="numeric"
            placeholder="e.g. 1234567"
            className="mt-1 block w-40 border border-chalk-300 rounded px-3 py-2 text-sm bg-white"
          />
        </label>
        <button type="submit" className="px-4 py-2 rounded bg-pitch-800 text-chalk-100 text-sm font-medium">Check</button>
        <p className="w-full text-xs text-ink-500">
          Find it on the FPL site: open Points, and it&rsquo;s the number in the address (fantasy.premierleague.com/entry/<b>1234567</b>/event/5).
        </p>
      </form>

      {error && <p className="text-loss-700" role="alert">{error}</p>}
      {loading && <p className="text-ink-500 font-mono text-sm">Loading your squad&hellip;</p>}

      {loaded && view && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium text-ink-900">{loaded.entry.team_name}</span>
            {loaded.entry.overall_rank != null && <span className="text-ink-500">{`Rank ${loaded.entry.overall_rank.toLocaleString('en-GB')}`}</span>}
            <span className="text-ink-500">{`Value ${money(budget)} incl. ${money(loaded.entry.bank)} in the bank`}</span>
          </div>

          <div className="flex flex-wrap gap-2 items-center text-sm">
            <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Gameweeks</span>
            {HORIZONS.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHorizon(h)}
                aria-pressed={horizon === h}
                className={`px-3 py-1 rounded border text-sm ${horizon === h ? 'bg-pitch-800 text-chalk-100 border-pitch-800' : 'bg-white border-chalk-300'}`}
              >
                {h === 1 ? 'Next' : `Next ${h}`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Tile value={view.mine.toFixed(1)} label={`Your squad, ${range}`} detail="Best XI + captain each week" />
            <Tile
              value={modelReady ? modelReady.score.toFixed(1) : model && 'failed' in model && model.key === modelKey ? '–' : '…'}
              label={`Model’s squad, ${money(budget)}`}
              detail={modelReady ? `${(modelReady.score - view.mine).toFixed(1)} more than yours` : 'Same budget, same scoring'}
            />
            <Tile value={view.asPicked.toFixed(1)} label={`Your GW${loaded.entry.squad_event} line-up in GW${loaded.from}`} detail="As you last picked it" />
            <Tile value={view.next.points.toFixed(1)} label={`Best line-up from your squad, GW${loaded.from}`} detail={`${(view.next.points - view.asPicked).toFixed(1)} more than as picked`} />
          </div>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display uppercase tracking-wide text-xl text-ink-900 mr-2">Quick wins</h2>
              <label className="text-sm flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-widest text-ink-500">Gain at least</span>
                <select value={minGain} onChange={(e) => setMinGain(Number(e.target.value))} className="border border-chalk-300 rounded px-2 py-1 text-sm bg-white">
                  {MIN_GAINS.map((g) => (
                    <option key={g} value={g}>{`${g} pts`}</option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-xs text-ink-500 max-w-prose">
              {`One transfer each: same position, affordable from the selling price plus your bank, three per club at most. Gain is the change in your squad\u2019s projected points over ${range} (best XI and captain each week), so a bench swap counts only if the new player gets in the team.`}
            </p>
            {view.wins.length === 0 ? (
              <p className="text-sm text-ink-700">{`No single swap gains ${minGain} points or more over ${range}.`}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-ink-500">
                    <tr>
                      <th scope="col" className="text-left font-medium text-xs px-2 py-1">Out</th>
                      <th scope="col" className="text-left font-medium text-xs px-2 py-1">In</th>
                      <th scope="col" className="text-right font-medium text-xs px-2 py-1">Gain</th>
                      <th scope="col" className="text-right font-medium text-xs px-2 py-1">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.wins.map((w, i) => (
                      <tr key={w.out.id} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                        <td className="px-2 py-1.5">
                          <PlayerLink p={w.out} /> <span className="text-xs text-ink-500">{`${POSITION_LABEL[w.out.pos]} · ${w.out.total.toFixed(1)}`}</span>
                        </td>
                        <td className="px-2 py-1.5">
                          <PlayerLink p={w.in} /> <span className="text-xs text-ink-500">{`${w.in.team} · ${w.in.total.toFixed(1)}`}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums whitespace-nowrap text-pitch-800">{`+${w.gain.toFixed(1)}`}</td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums whitespace-nowrap">{w.cost > 0 ? `+${money(w.cost)}` : w.cost < 0 ? `−${money(-w.cost)}` : 'Same'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="font-display uppercase tracking-wide text-xl text-ink-900">Your squad</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-ink-500">
                  <tr>
                    <th scope="col" className="text-left font-medium text-xs px-2 py-1">Player</th>
                    <th scope="col" className="text-right font-medium text-xs px-2 py-1">Sell</th>
                    {weeks.map((w) => (
                      <th key={w} scope="col" className="text-right font-medium text-xs px-2 py-1">{`GW${w}`}</th>
                    ))}
                    {weeks.length > 1 && <th scope="col" className="text-right font-medium text-xs px-2 py-1">Total</th>}
                  </tr>
                </thead>
                <tbody>
                  {view.ordered.map((p, i) => {
                    const inXi = view.next.xi.includes(p.id);
                    return (
                      <tr key={p.id} className={i % 2 ? 'bg-chalk-100/60' : undefined}>
                        <td className="px-2 py-1.5">
                          <span className="text-xs text-ink-500 mr-1">{POSITION_LABEL[p.pos]}</span>
                          <PlayerLink p={p} />
                          {view.next.captain === p.id && <span className="ml-1 text-xs font-mono text-amber-600" title={`Model's captain for GW${loaded.from}`}>C</span>}
                          {!inXi && <span className="ml-1 text-xs text-ink-500" title={`Not in the model's best XI for GW${loaded.from}`}>bench</span>}
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums" title={p.purchaseKnown ? undefined : 'Bought before any transfer on record: selling price from the season-start price'}>
                          {money(p.sell)}
                        </td>
                        {weeks.map((w) => (
                          <td key={w} className="px-2 py-1.5 text-right font-mono text-xs tabular-nums">{(p.gw[w] ?? 0).toFixed(1)}</td>
                        ))}
                        {weeks.length > 1 && <td className="px-2 py-1.5 text-right font-mono text-xs tabular-nums font-semibold">{p.total.toFixed(1)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-500 max-w-prose">
              {`Squad as at the GW${loaded.entry.squad_event} deadline`}
              {loaded.entry.free_hit_reverted && ` (your GW${loaded.entry.current_event} Free Hit squad has reverted)`}
              {loaded.entry.pending_transfers > 0
                ? `, with ${loaded.entry.pending_transfers} transfer${loaded.entry.pending_transfers === 1 ? '' : 's'} made since.`
                : '. Transfers made since then show once FPL lists them.'}{' '}
              C and bench are the model&rsquo;s picks for GW{loaded.from}.{' '}
              <Link to="/fpl/optimal-squad" className="underline underline-offset-2">Build the model&rsquo;s squad in the Optimiser</Link>
            </p>
          </section>
        </>
      )}
    </article>
  );
}
