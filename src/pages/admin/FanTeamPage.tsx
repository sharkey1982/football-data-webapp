// ============================================================================
// src/pages/admin/FanTeamPage.tsx   (/admin/fanteam)
//
// Private FanTeam weekly-contest optimiser. Chris pastes the contest's price
// list (copied in his own browser), the page matches players to FPL, projects
// FanTeam points from the existing FPL projections, and finds the best
// Classic 11 lineup. Nothing here contacts FanTeam. Admin-only at the
// database; this page also refuses to render for non-admins.
// Design: Claude Docs "FanTeam private optimiser — design".
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import { getDefaultMatchweek } from '../../lib/fplSeasonApi';
import { getCurrentFplSeasonId } from '../../lib/currentSeason';
import SortableTable, { type Column } from '../../components/SortableTable';
import {
  getRules, getInputs, getLatestPaste, getPreviousPrices, getManualMaps, savePaste, setClubFix, setPlayerFix,
  type GameRules, type InputRow, type Paste, type PriceRow,
} from '../../lib/fanteam/api';
import { parsePaste, PARSER_VERSION, type ParsedRow } from '../../lib/fanteam/paste';
import { buildPlayers, health, nameKey, norm, teamsFrom, fplRefsFrom, toCandidates, type PlayerView } from '../../lib/fanteam/model';
import { solveLineup, type ContestRules, type Lineup, type SolverFn } from '../../lib/fanteam/optimiser';
import { SOT_PER_XG, type Pos, type ScoringRule } from '../../lib/fanteam/scoring';

type Tab = 'prices' | 'players' | 'lineup' | 'health';
const TABS: { key: Tab; label: string }[] = [
  { key: 'prices', label: 'Prices' }, { key: 'players', label: 'Players' },
  { key: 'lineup', label: 'Lineup' }, { key: 'health', label: 'Data health' },
];
const POS_ORDER: Record<Pos, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const errText = (e: unknown) => (e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e));

let solverPromise: Promise<SolverFn> | null = null;
function loadSolver(): Promise<SolverFn> {
  solverPromise ??= (async () => {
    const [{ default: highsLoader }, { default: wasmUrl }] = await Promise.all([
      import('highs'), import('highs/runtime?url'),
    ]);
    const highs = await highsLoader({ locateFile: () => wasmUrl });
    return (lp: string) => highs.solve(lp) as unknown as ReturnType<SolverFn>;
  })();
  return solverPromise;
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'Fresh' ? 'bg-emerald-600' : status === 'Stale' ? 'bg-amber-500' : status === 'Incomplete' ? 'bg-orange-600' : 'bg-red-600';
  return <span data-testid="fanteam-status" className={`${cls} text-white text-xs font-medium rounded px-2 py-0.5`}>{status}</span>;
}

export default function FanTeamPage() {
  useDocumentHead({ title: 'FanTeam' });
  const auth = useAuthOptional();
  const isAdmin = auth?.isAdmin ?? false;

  const [tab, setTab] = useState<Tab>('prices');
  const [matchweek, setMatchweek] = useState<number | null>(null);
  const [seasonId, setSeasonId] = useState<number | null>(null);
  const [rules, setRules] = useState<{ game: GameRules; scoring: ScoringRule[] } | null>(null);
  const [inputs, setInputs] = useState<InputRow[]>([]);
  const [paste, setPaste] = useState<{ paste: Paste; rows: PriceRow[] } | null>(null);
  const [prev, setPrev] = useState<Map<string, number>>(new Map());
  const [manual, setManual] = useState<{ players: Map<string, number | null>; clubs: Map<string, number> }>({ players: new Map(), clubs: new Map() });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([getDefaultMatchweek(), getCurrentFplSeasonId()])
      .then(([mw, sid]) => { setMatchweek(mw); setSeasonId(sid); })
      .catch((e) => setError(errText(e)));
  }, [isAdmin]);

  // State is only set after the awaits, so the effect below never sets
  // state synchronously.
  const reload = useCallback(async () => {
    if (matchweek == null) return;
    try {
      const [r, inp, p, m] = await Promise.all([getRules(), getInputs(matchweek), getLatestPaste(matchweek), getManualMaps()]);
      const pr = p ? await getPreviousPrices(p.paste.paste_id) : new Map<string, number>();
      setRules(r); setInputs(inp); setPaste(p); setManual(m); setPrev(pr); setError(null);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, [matchweek]);
  // reload() sets state only after its awaits; the rule can't see through the call.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isAdmin) void reload(); }, [isAdmin, reload]);

  const views = useMemo<PlayerView[]>(() => {
    if (!rules || !paste) return [];
    return buildPlayers(paste.rows, inputs, rules.scoring, manual, paste.paste.safety_net);
  }, [rules, paste, inputs, manual]);

  const h = useMemo(() => health({
    hasRules: !!rules && rules.scoring.length > 0, inputs, pasteMatchweek: paste?.paste.matchweek ?? null,
    matchweek: matchweek ?? 0, views,
  }), [rules, inputs, paste, matchweek, views]);

  if (auth && !auth.loading && !isAdmin) {
    return <div className="max-w-3xl mx-auto px-4 py-8"><p className="text-sm text-ink-700">This page is for admins.</p></div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold text-ink-900">FanTeam</h1>
        {!loading && <StatusBadge status={h.status} />}
        <label className="text-sm text-ink-700 flex items-center gap-2 ml-auto">
          Gameweek
          <select className="border border-chalk-300 rounded px-2 py-1" value={matchweek ?? ''} onChange={(e) => setMatchweek(Number(e.target.value))}>
            {Array.from({ length: 38 }, (_, i) => i + 1).map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
      </header>
      <nav className="flex gap-1 border-b border-chalk-300">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${tab === t.key ? 'border-ink-900 text-ink-900 font-medium' : 'border-transparent text-ink-500'}`}>
            {t.label}
          </button>
        ))}
      </nav>
      {error && <p className="text-sm text-red-700 border border-red-300 bg-red-50 rounded p-2">{error}</p>}
      {loading && !error && <p className="text-sm text-ink-500">Loading…</p>}
      {!loading && rules && matchweek != null && seasonId != null && (
        <>
          {tab === 'prices' && (
            <PricesTab matchweek={matchweek} seasonId={seasonId} rules={rules} inputs={inputs} paste={paste}
              prev={prev} views={views} manual={manual} onSaved={reload} />
          )}
          {tab === 'players' && <PlayersTab views={views} />}
          {tab === 'lineup' && <LineupTab views={views} rules={rules} paste={paste} status={h.status} onFix={() => setTab('health')} />}
          {tab === 'health' && <HealthTab h={h} rules={rules} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PricesTab({ matchweek, seasonId, rules, inputs, paste, prev, views, manual, onSaved }: {
  matchweek: number; seasonId: number; rules: { game: GameRules; scoring: ScoringRule[] }; inputs: InputRow[];
  paste: { paste: Paste; rows: PriceRow[] } | null; prev: Map<string, number>; views: PlayerView[];
  manual: { players: Map<string, number | null>; clubs: Map<string, number> }; onSaved: () => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [contest, setContest] = useState('');
  const [budget, setBudget] = useState(String(rules.game.budget_m));
  const [stacking, setStacking] = useState(rules.game.stacking_penalty != null);
  const [net, setNet] = useState(rules.game.safety_net !== 'off');
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const teams = useMemo(() => teamsFrom(inputs).sort((a, b) => a.team_name.localeCompare(b.team_name)), [inputs]);
  const refs = useMemo(() => fplRefsFrom(inputs), [inputs]);

  const read = () => setParsed(parsePaste(text, teams, manual.clubs));
  const good = parsed?.filter((r) => r.price_m != null && r.position != null && r.name_raw) ?? [];

  const save = async () => {
    if (!parsed) return;
    setSaving(true); setMsg(null);
    try {
      const rows = good.map((r, i) => ({
        row_no: i + 1, name_raw: r.name_raw, club_raw: r.club_raw, position: r.position as Pos, price_m: r.price_m as number,
        team_id: null, fpl_code: null, match_method: null,
      }));
      // Record the automatic match made at paste time (history only; the page re-matches on load).
      const withMatch = buildPlayers(rows, inputs, rules.scoring, manual, false);
      const final = rows.map((r, i) => ({ ...r, team_id: withMatch[i].team_id, fpl_code: withMatch[i].fpl_code, match_method: withMatch[i].match }));
      await savePaste({
        contest_name: contest || null, season_id: seasonId, matchweek, rules_id: rules.game.rules_id,
        budget_m: Number(budget), stacking_penalty: stacking, safety_net: net, raw_text: text, parser_version: PARSER_VERSION,
      }, final);
      await onSaved();
      setText(''); setParsed(null); setMsg(`Saved ${final.length} prices for GW${matchweek}.`);
    } catch (e) {
      setMsg(`Not saved: ${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const unknownClubs = [...new Set(views.filter((v) => v.team_id == null).map((v) => v.club_raw))];
  const unmatched = views.filter((v) => v.team_id != null && v.fpl_code == null && v.match !== 'manual');
  const changes = views.filter((v) => prev.has(`${v.name}|${v.team_id}`) && prev.get(`${v.name}|${v.team_id}`) !== v.price);

  return (
    <div className="space-y-4">
      <section className="border border-chalk-300 rounded-lg bg-white p-3 space-y-3">
        <h2 className="text-sm font-medium text-ink-700">Paste prices for GW{matchweek}</h2>
        <div className="grid sm:grid-cols-4 gap-2 text-sm">
          <label className="flex flex-col gap-1 sm:col-span-2">Contest
            <input className="border border-chalk-300 rounded px-2 py-1" value={contest} onChange={(e) => setContest(e.target.value)} placeholder="EPL Weekly Special" />
          </label>
          <label className="flex flex-col gap-1">Budget (£m)
            <input className="border border-chalk-300 rounded px-2 py-1" type="number" step="0.5" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </label>
          <div className="flex flex-col gap-1 justify-end">
            <label className="flex items-center gap-2"><input type="checkbox" checked={stacking} onChange={(e) => setStacking(e.target.checked)} />Stacking penalty</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={net} onChange={(e) => setNet(e.target.checked)} />Safety net</label>
          </div>
        </div>
        <textarea aria-label="Price list" className="w-full h-40 border border-chalk-300 rounded p-2 font-mono text-xs"
          value={text} onChange={(e) => { setText(e.target.value); setParsed(null); }} placeholder="Paste the player list here" />
        <div className="flex gap-2 items-center">
          <button className="px-3 py-1.5 text-sm rounded bg-ink-900 text-white disabled:opacity-40" disabled={!text.trim()} onClick={read}>Read</button>
          {parsed && <button className="px-3 py-1.5 text-sm rounded bg-emerald-700 text-white disabled:opacity-40" disabled={saving || good.length === 0} onClick={save}>Save {good.length} rows</button>}
          {msg && <span className="text-sm text-ink-700">{msg}</span>}
        </div>
        {parsed && (
          <div className="space-y-1">
            <p className="text-sm text-ink-700">{parsed.length} rows read; {good.length} usable; {parsed.length - good.length} skipped; {parsed.filter((r) => r.issues.includes('club not recognised')).length} with an unknown club.</p>
            <SortableTable<ParsedRow>
              testId="fanteam-preview"
              rows={parsed} rowKey={(r) => String(r.row_no)} limit={60}
              columns={[
                { key: 'n', label: '#', render: (r) => r.row_no, sortValue: (r) => r.row_no },
                { key: 'name', label: 'Name', render: (r) => r.name_raw, sortValue: (r) => r.name_raw },
                { key: 'club', label: 'Club', render: (r) => r.club_raw, sortValue: (r) => r.club_raw },
                { key: 'pos', label: 'Pos', render: (r) => r.position ?? '', sortValue: (r) => r.position },
                { key: 'price', label: 'Price', align: 'right', render: (r) => (r.price_m != null ? f1(r.price_m) : ''), sortValue: (r) => r.price_m },
                { key: 'issues', label: 'Issues', render: (r) => <span className="text-red-700">{r.issues.join(', ')}</span>, sortValue: (r) => r.issues.length },
              ]}
            />
          </div>
        )}
      </section>

      {paste && (
        <p className="text-sm text-ink-700">
          Using paste of {new Date(paste.paste.pasted_at).toLocaleString('en-GB')}{paste.paste.contest_name ? ` (${paste.paste.contest_name})` : ''}: {paste.paste.row_count} players, budget £{f1(paste.paste.budget_m)}m, stacking {paste.paste.stacking_penalty ? 'on' : 'off'}, safety net {paste.paste.safety_net ? 'on' : 'off'}.
        </p>
      )}

      {unknownClubs.length > 0 && (
        <section className="border border-orange-300 rounded-lg bg-white p-3 space-y-2">
          <h2 className="text-sm font-medium text-ink-700">Unknown clubs</h2>
          {unknownClubs.map((c) => (
            <div key={c} className="flex items-center gap-2 text-sm">
              <span className="w-48 truncate">{c || '(blank)'}</span>
              <select className="border border-chalk-300 rounded px-2 py-1" defaultValue=""
                onChange={async (e) => { if (e.target.value) { await setClubFix(norm(c), Number(e.target.value)); await onSaved(); } }}>
                <option value="">Choose club…</option>
                {teams.map((t) => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
              </select>
            </div>
          ))}
        </section>
      )}

      {unmatched.length > 0 && (
        <section className="border border-orange-300 rounded-lg bg-white p-3 space-y-2">
          <h2 className="text-sm font-medium text-ink-700">Unmatched players ({unmatched.length})</h2>
          {unmatched.map((v) => (
            <div key={v.key} className="flex items-center gap-2 text-sm">
              <span className="w-56 truncate">{v.name} · {v.team_name} · {v.pos} · £{f1(v.price)}m</span>
              <select className="border border-chalk-300 rounded px-2 py-1" defaultValue=""
                onChange={async (e) => {
                  if (!e.target.value) return;
                  await setPlayerFix(nameKey(v.name), v.team_id!, e.target.value === 'none' ? null : Number(e.target.value));
                  await onSaved();
                }}>
                <option value="">Choose FPL player…</option>
                <option value="none">Not in FPL (leave out)</option>
                {refs.filter((r) => r.team_id === v.team_id).sort((a, b) => a.second_name.localeCompare(b.second_name))
                  .map((r) => <option key={r.fpl_code} value={r.fpl_code}>{r.first_name} {r.second_name} ({r.web_name})</option>)}
              </select>
            </div>
          ))}
        </section>
      )}

      {changes.length > 0 && (
        <section className="border border-chalk-300 rounded-lg bg-white p-3">
          <h2 className="text-sm font-medium text-ink-700 mb-2">Price changes since the previous paste</h2>
          <SortableTable<PlayerView>
            rows={changes} rowKey={(v) => v.key} initialSort={{ key: 'chg', dir: 'desc' }}
            columns={[
              { key: 'name', label: 'Player', render: (v) => v.name, sortValue: (v) => v.name },
              { key: 'club', label: 'Club', render: (v) => v.team_name, sortValue: (v) => v.team_name },
              { key: 'was', label: 'Was', align: 'right', render: (v) => f1(prev.get(`${v.name}|${v.team_id}`)!), sortValue: (v) => prev.get(`${v.name}|${v.team_id}`)! },
              { key: 'now', label: 'Now', align: 'right', render: (v) => f1(v.price), sortValue: (v) => v.price },
              { key: 'chg', label: 'Change', align: 'right', descFirst: true, render: (v) => f1(v.price - prev.get(`${v.name}|${v.team_id}`)!), sortValue: (v) => v.price - prev.get(`${v.name}|${v.team_id}`)! },
            ]}
          />
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function PlayersTab({ views }: { views: PlayerView[] }) {
  const [pos, setPos] = useState<Pos | 'ALL'>('ALL');
  const rows = views.filter((v) => v.fixtures > 0 && (pos === 'ALL' || v.pos === pos));
  if (!views.length) return <p className="text-sm text-ink-500">No prices for this gameweek yet. Paste them on the Prices tab.</p>;
  const cols: Column<PlayerView>[] = [
    { key: 'name', label: 'Player', render: (v) => v.name, sortValue: (v) => v.name },
    { key: 'club', label: 'Club', render: (v) => v.team_name, sortValue: (v) => v.team_name },
    { key: 'pos', label: 'Pos', render: (v) => v.pos, sortValue: (v) => POS_ORDER[v.pos] },
    { key: 'opp', label: 'Opponent', render: (v) => v.opponents, sortValue: (v) => v.opponents, className: 'hidden sm:table-cell' },
    { key: 'price', label: '£m', align: 'right', descFirst: true, render: (v) => f1(v.price), sortValue: (v) => v.price },
    { key: 's', label: 'Start', align: 'right', descFirst: true, render: (v) => pct(v.s), sortValue: (v) => v.s },
    { key: 'total', label: 'xPts', align: 'right', descFirst: true, render: (v) => f2(v.total), sortValue: (v) => v.total },
    { key: 'value', label: 'xPts (net)', align: 'right', descFirst: true, render: (v) => f2(v.value), sortValue: (v) => v.value },
    { key: 'pm', label: 'Pts/£m', align: 'right', descFirst: true, render: (v) => f2(v.perMillion), sortValue: (v) => v.perMillion },
    { key: 'sot', label: 'SoT', align: 'right', descFirst: true, render: (v) => f2(v.breakdown?.shots_on_target ?? 0), sortValue: (v) => v.breakdown?.shots_on_target ?? 0, className: 'hidden md:table-cell' },
    { key: 'imp', label: 'Impact', align: 'right', descFirst: true, render: (v) => f2(v.breakdown?.impact ?? 0), sortValue: (v) => v.breakdown?.impact ?? 0, className: 'hidden md:table-cell' },
  ];
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((p) => (
          <button key={p} onClick={() => setPos(p)} className={`px-2 py-1 text-xs rounded border ${pos === p ? 'bg-ink-900 text-white border-ink-900' : 'border-chalk-300'}`}>{p === 'ALL' ? 'All' : p}</button>
        ))}
      </div>
      <SortableTable<PlayerView> testId="fanteam-players" rows={rows} rowKey={(v) => v.key} columns={cols} initialSort={{ key: 'value', dir: 'desc' }} />
      <p className="text-xs text-ink-500">xPts (net) includes the safety net when the contest has one. Shots on target are estimated from xG ({SOT_PER_XG} per expected goal).</p>
    </div>
  );
}

// ---------------------------------------------------------------------------

function LineupTab({ views, rules, paste, status, onFix }: {
  views: PlayerView[]; rules: { game: GameRules }; paste: { paste: Paste } | null; status: string; onFix: () => void;
}) {
  const [lineups, setLineups] = useState<Lineup[]>([]);
  const [locked, setLocked] = useState<string[]>([]);
  const [banned, setBanned] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (status !== 'Fresh' || !paste) {
    return (
      <div className="text-sm text-ink-700 space-y-2">
        <p>The optimiser runs only when the data status is Fresh (now: {status}).</p>
        <button className="underline" onClick={onFix}>See what needs fixing</button>
      </div>
    );
  }
  const contest: ContestRules = {
    budget: paste.paste.budget_m, size: rules.game.starting_size, xiMin: rules.game.xi_min, xiMax: rules.game.xi_max,
    maxPerClub: rules.game.max_per_club, captainMultiplier: Number(rules.game.captain_multiplier), stacking: paste.paste.stacking_penalty,
  };
  const candidates = toCandidates(views, contest.captainMultiplier).filter((c) => !banned.includes(c.key));

  const run = async (next: boolean) => {
    setBusy(true); setErr(null);
    try {
      const solve = await loadSolver();
      const cuts = next ? lineups.map((l) => l.players.map((p) => p.key)) : [];
      const l = solveLineup(candidates, contest, solve, cuts, locked);
      setLineups(next ? [...lineups, l] : [l]);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const name = (key: string) => views.find((v) => v.key === key)?.name ?? key;
  const options = [...views].filter((v) => v.fixtures > 0 && v.fpl_code != null).sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-end text-sm">
        <label className="flex flex-col gap-1">Must include
          <select className="border border-chalk-300 rounded px-2 py-1" value="" onChange={(e) => e.target.value && setLocked([...locked, e.target.value])}>
            <option value="">Add player…</option>
            {options.filter((v) => !locked.includes(v.key)).map((v) => <option key={v.key} value={v.key}>{v.name} ({v.team_name}, £{f1(v.price)}m)</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">Exclude
          <select className="border border-chalk-300 rounded px-2 py-1" value="" onChange={(e) => e.target.value && setBanned([...banned, e.target.value])}>
            <option value="">Add player…</option>
            {options.filter((v) => !banned.includes(v.key)).map((v) => <option key={v.key} value={v.key}>{v.name} ({v.team_name}, £{f1(v.price)}m)</option>)}
          </select>
        </label>
        <button className="px-3 py-1.5 rounded bg-ink-900 text-white disabled:opacity-40" disabled={busy} onClick={() => run(false)}>Find best lineup</button>
        {lineups.length > 0 && <button className="px-3 py-1.5 rounded border border-chalk-300 disabled:opacity-40" disabled={busy} onClick={() => run(true)}>Next best</button>}
      </div>
      {(locked.length > 0 || banned.length > 0) && (
        <p className="text-xs text-ink-700">
          {locked.map((k) => <button key={k} className="mr-2 underline" onClick={() => setLocked(locked.filter((x) => x !== k))}>+ {name(k)} ×</button>)}
          {banned.map((k) => <button key={k} className="mr-2 underline" onClick={() => setBanned(banned.filter((x) => x !== k))}>− {name(k)} ×</button>)}
        </p>
      )}
      <p className="text-xs text-ink-500">Budget £{f1(contest.budget)}m · 11 players (1 GK, 3–5 DEF, 3–5 MID, 1–3 FWD) · max {contest.maxPerClub} per club · stacking {contest.stacking ? 'on' : 'off'} · safety net {paste.paste.safety_net ? 'on' : 'off'}</p>
      {err && <p className="text-sm text-red-700">{err}</p>}
      {lineups.map((l, i) => (
        <section key={i} className="border border-chalk-300 rounded-lg bg-white p-3 space-y-2" data-testid="fanteam-lineup">
          <h2 className="text-sm font-medium text-ink-700">
            {i === 0 ? 'Best lineup' : `Alternative ${i}`}: {f2(l.expectedPoints)} expected points · £{f1(l.cost)}m · £{f1(l.left)}m left
            {l.stackingPenalty > 0.005 ? ` · stacking −${f2(l.stackingPenalty)}` : ''}
          </h2>
          <SortableTable<Lineup['players'][number]>
            rows={l.players} rowKey={(p) => p.key} initialSort={{ key: 'pos', dir: 'asc' }}
            columns={[
              { key: 'pos', label: 'Pos', render: (p) => p.pos, sortValue: (p) => POS_ORDER[p.pos] * 100 - p.value },
              { key: 'name', label: 'Player', render: (p) => <>{p.name}{p.key === l.captain.key ? ' (C)' : p.key === l.vice.key ? ' (VC)' : ''}</>, sortValue: (p) => p.name },
              { key: 'club', label: 'Club', render: (p) => p.team_name, sortValue: (p) => p.team_name },
              { key: 'price', label: '£m', align: 'right', descFirst: true, render: (p) => f1(p.price), sortValue: (p) => p.price },
              { key: 's', label: 'Start', align: 'right', descFirst: true, render: (p) => pct(p.s), sortValue: (p) => p.s },
              { key: 'xp', label: 'xPts', align: 'right', descFirst: true, render: (p) => f2(p.value), sortValue: (p) => p.value },
            ]}
          />
          <p className="text-xs text-ink-500">Captain {l.captain.name} (starts {pct(l.captain.s)}); vice {l.vice.name} doubles if the captain doesn't play.</p>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

function HealthTab({ h, rules }: { h: ReturnType<typeof health>; rules: { game: GameRules } }) {
  return (
    <div className="space-y-3 text-sm">
      <ul className="space-y-1">
        {h.checks.map((c) => (
          <li key={c.label} className="flex gap-2">
            <span className={c.ok ? 'text-emerald-700' : 'text-red-700'}>{c.ok ? '✓' : '✗'}</span>
            <span className="w-48 text-ink-900">{c.label}</span>
            <span className="text-ink-700">{c.detail}</span>
          </li>
        ))}
      </ul>
      <div className="text-xs text-ink-500 space-y-1">
        <p>Scoring and Classic 11 rules: <a className="underline" href={rules.game.source_url} target="_blank" rel="noreferrer">FanTeam scoring rules</a>, checked {rules.game.verified_at}.</p>
        <p>Estimates: shots on target ({SOT_PER_XG} per expected goal, league average); impact (win/loss chance from team goals, scaled by expected minutes); full match uses the 85+ minute exit band; caused-penalty and scoring-free-kick fouls are left out.</p>
      </div>
    </div>
  );
}
