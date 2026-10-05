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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import { getDefaultMatchweek } from '../../lib/fplSeasonApi';
import { getCurrentFplSeasonId } from '../../lib/currentSeason';
import SortableTable, { type Column } from '../../components/SortableTable';
import {
  getRules, getInputs, getLatestPaste, getPreviousPrices, getManualMaps, savePaste, setClubFix, setPlayerFix,
  deleteClubFix, deletePlayerFix,
  type GameRules, type InputRow, type Paste, type PriceRow,
} from '../../lib/fanteam/api';
import { parsePaste, PARSER_VERSION, type FplRef, type ParsedRow, type TeamRef } from '../../lib/fanteam/paste';
import { buildPlayers, health, isUnlikely, nameKey, norm, teamsFrom, fplRefsFrom, toCandidates, type PlayerView } from '../../lib/fanteam/model';
import { solveLineup, type ContestRules, type Lineup, type SolverFn } from '../../lib/fanteam/optimiser';
import { SOT_PER_XG, type PointsBreakdown, type Pos, type ScoringRule } from '../../lib/fanteam/scoring';

type Tab = 'prices' | 'players' | 'lineup' | 'scoring' | 'health';
const TABS: { key: Tab; label: string }[] = [
  { key: 'prices', label: 'Prices' }, { key: 'players', label: 'Players' },
  { key: 'lineup', label: 'Lineup' }, { key: 'scoring', label: 'Scoring' }, { key: 'health', label: 'Data health' },
];
const POS_ORDER: Record<Pos, number> = { GK: 0, DEF: 1, MID: 2, FWD: 3 };
const f1 = (v: number) => v.toFixed(1);
const f2 = (v: number) => v.toFixed(2);
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sumBy = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
/** Three-letter club label for tight spaces. */
const SHORT: Record<string, string> = {
  'Arsenal': 'ARS', 'Aston Villa': 'AVL', 'Bournemouth': 'BOU', 'Brentford': 'BRE', 'Brighton': 'BHA', 'Burnley': 'BUR', 'Chelsea': 'CHE',
  'Coventry': 'COV', 'Crystal Palace': 'CRY', 'Everton': 'EVE', 'Fulham': 'FUL', 'Hull': 'HUL', 'Ipswich': 'IPS', 'Leeds': 'LEE',
  'Liverpool': 'LIV', 'Man City': 'MCI', 'Man United': 'MUN', 'Newcastle': 'NEW', "Nott'm Forest": 'NFO', 'Sunderland': 'SUN',
  'Tottenham': 'TOT', 'West Ham': 'WHU', 'Wolves': 'WOL',
};
const shortTeam = (name: string) => SHORT[name] ?? name.slice(0, 3).toUpperCase();
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
      <nav className="flex gap-1 border-b border-chalk-300 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 whitespace-nowrap ${tab === t.key ? 'border-ink-900 text-ink-900 font-medium' : 'border-transparent text-ink-500'}`}>
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
          {tab === 'players' && <PlayersTab views={views} captainMultiplier={Number(rules.game.captain_multiplier)} safetyNet={paste?.paste.safety_net ?? false} />}
          {tab === 'lineup' && <LineupTab views={views} rules={rules} paste={paste} status={h.status} onFix={() => setTab('health')} />}
          {tab === 'scoring' && <ScoringTab rules={rules} paste={paste?.paste ?? null} />}
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
  const [showUnlikely, setShowUnlikely] = useState(false);
  const teams = useMemo(() => teamsFrom(inputs).sort((a, b) => a.team_name.localeCompare(b.team_name)), [inputs]);
  const refs = useMemo(() => fplRefsFrom(inputs), [inputs]);

  const read = (t = text) => {
    const rows = parsePaste(t, teams, manual.clubs);
    setParsed(rows);
    const tour = rows.find((r) => r.tournament)?.tournament;
    if (tour && !contest) setContest(`FanTeam tournament ${tour}`);
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    const t = await file.text();
    setText(t);
    read(t);
  };
  const good = parsed?.filter((r) => r.price_m != null && r.position != null && r.name_raw) ?? [];

  const save = async () => {
    if (!parsed) return;
    setSaving(true); setMsg(null);
    try {
      const rows = good.map((r, i) => ({
        row_no: i + 1, name_raw: r.name_raw, club_raw: r.club_raw, position: r.position as Pos, price_m: r.price_m as number,
        team_id: null, fpl_code: null, match_method: null,
        fanteam_player_id: r.fanteam_player_id ?? null, first_name: r.first_name ?? null, surname: r.surname ?? null,
        lineup_status: r.lineup_status ?? null,
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
  // Likely starters block the optimiser; the rest are folded away.
  const unmatched = views.filter((v) => v.team_id != null && v.fpl_code == null && v.match !== 'manual')
    .sort((a, b) => b.price - a.price);
  const blocking = unmatched.filter((v) => !isUnlikely(v.lineup));
  const unlikely = unmatched.filter((v) => isUnlikely(v.lineup));
  const changes = views.filter((v) => prev.has(`${v.name}|${v.team_id}`) && prev.get(`${v.name}|${v.team_id}`) !== v.price);

  return (
    <div className="space-y-4">
      <section className="border border-chalk-300 rounded-lg bg-white p-3 space-y-3">
        <h2 className="text-sm font-medium text-ink-700">Prices for GW{matchweek}</h2>
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
          value={text} onChange={(e) => { setText(e.target.value); setParsed(null); }} placeholder="Upload FanTeam's player CSV or paste the player list here" />
        <div className="flex flex-wrap gap-2 items-center">
          <label className="px-3 py-1.5 text-sm rounded border border-chalk-300 cursor-pointer">
            Upload CSV
            <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="hidden" aria-label="Upload CSV"
              onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <button className="px-3 py-1.5 text-sm rounded bg-ink-900 text-white disabled:opacity-40" disabled={!text.trim()} onClick={() => read()}>Read</button>
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
                { key: 'lineup', label: 'Lineup', render: (r) => r.lineup_status ?? '', sortValue: (r) => r.lineup_status ?? null },
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
        <section className="border border-orange-300 rounded-lg bg-white p-3 space-y-3">
          <h2 className="text-sm font-medium text-ink-700">Unknown clubs ({unknownClubs.length})</h2>
          {unknownClubs.map((c) => <ClubFixCard key={c} club={c} teams={teams} onSaved={onSaved} />)}
        </section>
      )}

      {unmatched.length > 0 && (
        <section className="border border-orange-300 rounded-lg bg-white p-3 space-y-3" data-testid="fanteam-unmatched">
          <h2 className="text-sm font-medium text-ink-700">Unmatched players ({blocking.length} to fix)</h2>
          {blocking.length === 0 && <p className="text-sm text-ink-700">Nothing blocking the optimiser.</p>}
          {blocking.map((v) => <PlayerFixCard key={v.key} v={v} refs={refs} onSaved={onSaved} />)}
          {unlikely.length > 0 && (
            <div className="space-y-3">
              <button className="text-sm underline text-ink-700 py-1" onClick={() => setShowUnlikely(!showUnlikely)}>
                {showUnlikely ? 'Hide' : 'Show'} {unlikely.length} not expected to play
              </button>
              {showUnlikely && unlikely.map((v) => <PlayerFixCard key={v.key} v={v} refs={refs} onSaved={onSaved} />)}
            </div>
          )}
        </section>
      )}

      <SavedFixes views={views} manual={manual} refs={refs} teams={teams} onSaved={onSaved} />

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

function PlayersTab({ views, captainMultiplier, safetyNet }: { views: PlayerView[]; captainMultiplier: number; safetyNet: boolean }) {
  const [pos, setPos] = useState<Pos | 'ALL'>('ALL');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { if (selected) panel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [selected]);
  if (!views.length) return <p className="text-sm text-ink-500">No prices for this gameweek yet. Load them on the Prices tab.</p>;
  const nq = norm(q);
  const rows = views.filter((v) => v.fixtures > 0 && (pos === 'ALL' || v.pos === pos) && (!nq || norm(`${v.name} ${v.team_name}`).includes(nq)));
  const sel = views.find((v) => v.key === selected) ?? null;
  const cols: Column<PlayerView>[] = [
    { key: 'name', label: 'Player', sortValue: (v) => v.name,
      render: (v) => <button className="text-left underline decoration-dotted underline-offset-2" onClick={() => setSelected(v.key)}>{v.name}</button> },
    { key: 'club', label: 'Club', render: (v) => v.team_name, sortValue: (v) => v.team_name, className: 'hidden sm:table-cell' },
    { key: 'pos', label: 'Pos', render: (v) => v.pos, sortValue: (v) => POS_ORDER[v.pos] },
    { key: 'opp', label: 'Opp', sortValue: (v) => v.opponents,
      render: (v) => <span className="whitespace-nowrap">{v.matches.map((m) => `${shortTeam(m.opponent)} (${m.home ? 'H' : 'A'})`).join(', ')}</span> },
    { key: 'txg', label: 'Team xG', align: 'right', descFirst: true, render: (v) => (v.matches.length ? f2(sumBy(v.matches, (m) => m.teamGoals)) : ''),
      sortValue: (v) => sumBy(v.matches, (m) => m.teamGoals), className: 'hidden md:table-cell' },
    { key: 'cs', label: 'CS', align: 'right', descFirst: true, render: (v) => (v.matches.length ? pct(Math.max(...v.matches.map((m) => m.cleanSheet))) : ''),
      sortValue: (v) => Math.max(0, ...v.matches.map((m) => m.cleanSheet)), className: 'hidden md:table-cell' },
    { key: 'lineup', label: 'FanTeam', render: (v) => <span className={v.out ? 'text-red-700' : ''}>{v.lineup ?? ''}</span>, sortValue: (v) => v.lineup, className: 'hidden md:table-cell' },
    { key: 'price', label: '£m', align: 'right', descFirst: true, render: (v) => f1(v.price), sortValue: (v) => v.price },
    { key: 's', label: 'Start', align: 'right', descFirst: true, render: (v) => pct(v.s), sortValue: (v) => v.s, className: 'hidden sm:table-cell' },
    { key: 'total', label: 'xPts', align: 'right', descFirst: true, render: (v) => f2(v.total), sortValue: (v) => v.total, className: 'hidden sm:table-cell' },
    { key: 'value', label: safetyNet ? 'xPts (net)' : 'xPts', align: 'right', descFirst: true, render: (v) => f2(v.value), sortValue: (v) => v.value },
    { key: 'pm', label: 'Pts/£m', align: 'right', descFirst: true, render: (v) => f2(v.perMillion), sortValue: (v) => v.perMillion },
  ];
  return (
    <div className="space-y-3">
      <div ref={panel}>{sel && <PlayerBreakdown v={sel} captainMultiplier={captainMultiplier} safetyNet={safetyNet} onClose={() => setSelected(null)} />}</div>
      <div className="flex flex-wrap gap-2 items-center">
        <input className="min-h-11 border border-chalk-300 rounded px-2 text-base flex-1 min-w-40" placeholder="Find a player or club" aria-label="Find a player"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex gap-1">
          {(['ALL', 'GK', 'DEF', 'MID', 'FWD'] as const).map((p) => (
            <button key={p} onClick={() => setPos(p)} className={`min-h-11 px-3 text-sm rounded border ${pos === p ? 'bg-ink-900 text-white border-ink-900' : 'border-chalk-300'}`}>{p === 'ALL' ? 'All' : p}</button>
          ))}
        </div>
      </div>
      <SortableTable<PlayerView> testId="fanteam-players" rows={rows} rowKey={(v) => v.key} columns={cols} initialSort={{ key: 'value', dir: 'desc' }} />
      <p className="text-xs text-ink-500">Tap a name for the breakdown.{safetyNet ? ' xPts (net) includes the safety net.' : ''}</p>
    </div>
  );
}

const BREAKDOWN_ROWS: { key: keyof PointsBreakdown; label: string; how: string }[] = [
  { key: 'appearance', label: 'Appearance', how: 'P(start) + P(sub appearance), 1 point' },
  { key: 'minutes_60', label: '60+ minutes', how: 'P(start) × P(not off before 60)' },
  { key: 'full_match', label: 'Full match', how: 'P(start) × P(plays to the end), MID/FWD' },
  { key: 'goals', label: 'Goals', how: 'xG × goal points' },
  { key: 'assists', label: 'Assists', how: 'xA × 3' },
  { key: 'shots_on_target', label: 'Shots on target', how: `xG × ${SOT_PER_XG} × points (estimate)` },
  { key: 'clean_sheet', label: 'Clean sheet', how: 'P(60+ min and none conceded while on)' },
  { key: 'goals_conceded', label: 'Goals conceded', how: '−1 per 2 conceded while on, GK/DEF' },
  { key: 'saves', label: 'Saves', how: 'expected saves × 0.5' },
  { key: 'impact', label: 'Win/loss impact', how: '0.3 × (P(win) − P(loss)) × minutes share (estimate)' },
  { key: 'penalties', label: 'Penalties', how: 'saves +5, misses −2' },
  { key: 'cards_own_goals', label: 'Cards, own goals', how: 'yellow −1, red −3, own goal −2' },
];

function PlayerBreakdown({ v, captainMultiplier, safetyNet, onClose }: { v: PlayerView; captainMultiplier: number; safetyNet: boolean; onClose: () => void }) {
  const bd = v.breakdown;
  return (
    <section className="border border-ink-900 rounded-lg bg-white p-3 space-y-3" data-testid="fanteam-breakdown">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-medium text-ink-900">{v.name}</h2>
          <p className="text-xs text-ink-500">{v.team_name} · {v.pos} · £{f1(v.price)}m · {v.opponents || 'no fixture'}{v.lineup ? ` · FanTeam: ${v.lineup}` : ''}</p>
          {v.fpl_name && v.match !== 'exact' && <p className="text-xs text-ink-500">Matched to FPL: {v.fpl_name} ({v.match})</p>}
        </div>
        <button className={`${BTN} border border-chalk-300 shrink-0`} onClick={onClose}>Close</button>
      </div>
      {v.out && <p className="text-sm text-red-700">FanTeam lists him as {v.lineup}: scored 0 and never picked.</p>}
      {v.matches.map((m, i) => (
        <div key={i} className="border border-chalk-200 rounded p-2 space-y-2" data-testid="fanteam-match">
          <p className="text-sm font-medium text-ink-900">{v.team_name} {m.home ? 'v' : '@'} {m.opponent} <span className="text-xs text-ink-500 font-normal">{m.home ? 'home' : 'away'} · {new Date(m.kickoff).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span></p>
          <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-sm">
            {[
              [`${shortTeam(v.team_name)} goals`, f2(m.teamGoals)], [`${shortTeam(m.opponent)} goals`, f2(m.oppGoals)], ['Clean sheet', pct(m.cleanSheet)],
              ['Win', pct(m.win)], ['Draw', pct(m.draw)], ['Loss', pct(m.loss)],
            ].map(([k, val]) => (
              <div key={k}><dt className="text-xs text-ink-500">{k}</dt><dd className="font-medium tabular-nums">{val}</dd></div>
            ))}
          </dl>
        </div>
      ))}
      {v.inputs && (
        <dl className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-sm">
          {[
            ['Start', pct(v.s)], ['Sub on', pct(v.inputs.pSub)], ['Full match', v.inputs.pFull == null ? '—' : pct(v.inputs.pFull)],
            ['Minutes', f1(v.inputs.xMin)], ['xG', f2(v.inputs.xG)], ['xA', f2(v.inputs.xA)],
          ].map(([k, val]) => (
            <div key={k} className="border border-chalk-200 rounded p-2"><dt className="text-xs text-ink-500">{k}</dt><dd className="font-medium tabular-nums">{val}</dd></div>
          ))}
        </dl>
      )}
      {bd && (
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-ink-500"><th className="py-1">Points from</th><th className="py-1 text-right">xPts</th><th className="py-1 pl-3 hidden sm:table-cell">How</th></tr></thead>
          <tbody>
            {BREAKDOWN_ROWS.filter((r) => Math.abs(bd[r.key]) >= 0.005).map((r) => (
              <tr key={r.key} className="border-t border-chalk-200">
                <td className="py-1">{r.label}</td>
                <td className={`py-1 text-right tabular-nums ${bd[r.key] < 0 ? 'text-red-700' : ''}`}>{f2(bd[r.key])}</td>
                <td className="py-1 pl-3 text-xs text-ink-500 hidden sm:table-cell">{r.how}</td>
              </tr>
            ))}
            <tr className="border-t border-ink-900 font-medium"><td className="py-1">Total</td><td className="py-1 text-right tabular-nums">{f2(v.total)}</td><td className="hidden sm:table-cell" /></tr>
            {safetyNet && v.netReplacement != null && (
              <tr className="border-t border-chalk-200"><td className="py-1">With safety net</td><td className="py-1 text-right tabular-nums">{f2(v.value)}</td>
                <td className="py-1 pl-3 text-xs text-ink-500 hidden sm:table-cell">if he doesn't start: {f2(v.netReplacement)} (a cheaper team-mate swapped in, or his own minutes off the bench if none)</td></tr>
            )}
          </tbody>
        </table>
      )}
      {!v.out && v.s > 0 && (
        <p className="text-xs text-ink-500">If he starts: {f2(v.ifStart)} points. As captain: about {f2(v.value + (captainMultiplier - 1) * v.s * v.ifStart)}.</p>
      )}
    </section>
  );
}

function ScoringTab({ rules, paste }: { rules: { game: GameRules; scoring: ScoringRule[] }; paste: Paste | null }) {
  const POSS: Pos[] = ['GK', 'DEF', 'MID', 'FWD'];
  const ORDER: { code: string; label: string }[] = [
    { code: 'appearance', label: 'Appearance' }, { code: 'minutes_60', label: '60+ minutes' }, { code: 'full_match', label: 'Played full match' },
    { code: 'goal', label: 'Goal' }, { code: 'assist', label: 'Assist / fantasy assist' }, { code: 'clean_sheet', label: 'Clean sheet (60+ min)' },
    { code: 'goals_conceded', label: 'Every 2 goals conceded' }, { code: 'shot_on_target', label: 'Shot on target' }, { code: 'save', label: 'Save' },
    { code: 'penalty_save', label: 'Penalty save' }, { code: 'impact_positive', label: 'Team won while on pitch' }, { code: 'impact_negative', label: 'Team lost while on pitch' },
    { code: 'caused_penalty', label: 'Caused a penalty' }, { code: 'caused_scoring_free_kick', label: 'Foul led to free-kick goal' },
    { code: 'penalty_miss', label: 'Penalty miss' }, { code: 'own_goal', label: 'Own goal' }, { code: 'yellow_card', label: 'Yellow card' }, { code: 'red_card', label: 'Red card' },
  ];
  const pts = (code: string, p: Pos) => {
    const r = rules.scoring.find((x) => x.rule_code === code && x.position === p) ?? rules.scoring.find((x) => x.rule_code === code && x.position == null);
    return r ? Number(r.points) : null;
  };
  const fmt = (n: number | null) => (n == null ? '—' : n > 0 ? `+${n}` : String(n));
  const g = rules.game;
  return (
    <div className="space-y-4 text-sm">
      <section className="border border-chalk-300 rounded-lg bg-white p-3 space-y-2 overflow-x-auto">
        <h2 className="font-medium text-ink-700">FanTeam points</h2>
        <table className="w-full" data-testid="fanteam-scoring">
          <thead><tr className="text-xs text-ink-500 text-left"><th className="py-1">Event</th>{POSS.map((p) => <th key={p} className="py-1 text-right w-12">{p}</th>)}</tr></thead>
          <tbody>
            {ORDER.filter((o) => rules.scoring.some((r) => r.rule_code === o.code)).map((o) => (
              <tr key={o.code} className="border-t border-chalk-200">
                <td className="py-1">{o.label}</td>
                {POSS.map((p) => { const v = pts(o.code, p); return <td key={p} className={`py-1 text-right tabular-nums ${v != null && v < 0 ? 'text-red-700' : ''}`}>{fmt(v)}</td>; })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-ink-500">No bonus points or defensive contributions. A scoring shot isn't also a shot on target; woodwork isn't on target. Only regular and injury time count. Source: <a className="underline" href={g.source_url} target="_blank" rel="noreferrer">FanTeam scoring rules</a>, checked {g.verified_at}.</p>
      </section>

      <section className="border border-chalk-300 rounded-lg bg-white p-3 space-y-1">
        <h2 className="font-medium text-ink-700">This contest</h2>
        <ul className="space-y-1">
          <li>11 players: 1 GK, {g.xi_min.DEF}–{g.xi_max.DEF} DEF, {g.xi_min.MID}–{g.xi_max.MID} MID, {g.xi_min.FWD}–{g.xi_max.FWD} FWD; max {g.max_per_club} per club</li>
          <li>Budget £{f1(paste?.budget_m ?? Number(g.budget_m))}m{paste ? ` (from the ${paste.contest_name ?? 'latest'} upload)` : ''}</li>
          <li>Captain ×{Number(g.captain_multiplier)}; vice-captain ×{Number(g.captain_multiplier)} if the captain doesn't play</li>
          <li>Stacking penalty {paste ? (paste.stacking_penalty ? 'on' : 'off') : 'per contest'}: 2nd, 3rd, 4th+ GK/DEF from a club that keeps a clean sheet lose 1, 2, 3</li>
          <li>Safety net {paste ? (paste.safety_net ? 'on' : 'off') : 'per contest'}: a non-starter is swapped for a same-club, same-position player at the same or lower price</li>
        </ul>
      </section>

      <section className="border border-chalk-300 rounded-lg bg-white p-3 space-y-2">
        <h2 className="font-medium text-ink-700">How the projections are built</h2>
        <p>From FixtureShark's FPL projections for each fixture (start and sub chances, exit minutes, xG, xA, clean sheet, saves) and the market's team goals, scored with the table above using FanTeam's position for each player.</p>
        <table className="w-full">
          <tbody>
            {BREAKDOWN_ROWS.map((r) => (
              <tr key={r.key} className="border-t border-chalk-200 align-top"><td className="py-1 pr-3 whitespace-nowrap">{r.label}</td><td className="py-1 text-ink-700">{r.how}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-ink-500">Shots on target and impact are estimates. Caused-penalty and free-kick fouls are left out. FanTeam's injured or suspended players score 0.</p>
      </section>
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

// ---------------------------------------------------------------------------
// Fix cards: built for a phone. Nothing is saved until a button is pressed,
// and leaving a player out needs a second tap.
// ---------------------------------------------------------------------------

const BTN = 'min-h-11 px-4 rounded text-sm font-medium disabled:opacity-40';

function PlayerFixCard({ v, refs, onSaved }: { v: PlayerView; refs: FplRef[]; onSaved: () => Promise<void> }) {
  const [choice, setChoice] = useState('');
  const [confirmOut, setConfirmOut] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const POS_ET: Record<Pos, number> = { GK: 1, DEF: 2, MID: 3, FWD: 4 };
  // Same position first, then by surname.
  const options = refs.filter((r) => r.team_id === v.team_id)
    .sort((a, b) => Number(b.element_type === POS_ET[v.pos]) - Number(a.element_type === POS_ET[v.pos]) || a.second_name.localeCompare(b.second_name));
  const save = async (code: number | null) => {
    setBusy(true); setErr(null);
    try { await setPlayerFix(nameKey(v.name), v.team_id!, code); await onSaved(); }
    catch (e) { setErr(errText(e)); setBusy(false); }
  };
  return (
    <div className="border border-chalk-300 rounded-lg p-3 space-y-2" data-testid="fix-card">
      <div>
        <p className="font-medium text-ink-900">{v.name}</p>
        <p className="text-xs text-ink-500">{v.team_name} · {v.pos} · £{f1(v.price)}m{v.lineup ? ` · ${v.lineup}` : ''}</p>
      </div>
      <label className="block text-sm">
        <span className="sr-only">FPL player for {v.name}</span>
        <select className="w-full min-h-11 border border-chalk-300 rounded px-2 text-base bg-white" value={choice}
          onChange={(e) => { setChoice(e.target.value); setConfirmOut(false); }}>
          <option value="">Choose the FPL player…</option>
          {options.map((r) => <option key={r.fpl_code} value={r.fpl_code}>{r.web_name} — {r.first_name} {r.second_name}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        <button className={`${BTN} bg-emerald-700 text-white`} disabled={!choice || busy} onClick={() => save(Number(choice))}>Save match</button>
        {!confirmOut
          ? <button className={`${BTN} border border-chalk-300`} disabled={busy} onClick={() => { setConfirmOut(true); setChoice(''); }}>Not in FPL…</button>
          : (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-700">Leave {v.name} out?</span>
              <button className={`${BTN} bg-red-700 text-white`} disabled={busy} onClick={() => save(null)}>Yes, leave out</button>
              <button className={`${BTN} border border-chalk-300`} disabled={busy} onClick={() => setConfirmOut(false)}>Cancel</button>
            </span>
          )}
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </div>
  );
}

function ClubFixCard({ club, teams, onSaved }: { club: string; teams: TeamRef[]; onSaved: () => Promise<void> }) {
  const [choice, setChoice] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="border border-chalk-300 rounded-lg p-3 space-y-2">
      <p className="font-medium text-ink-900">{club || '(blank)'}</p>
      <select className="w-full min-h-11 border border-chalk-300 rounded px-2 text-base bg-white" value={choice} onChange={(e) => setChoice(e.target.value)}>
        <option value="">Choose the club…</option>
        {teams.map((t) => <option key={t.team_id} value={t.team_id}>{t.team_name}</option>)}
      </select>
      <button className={`${BTN} bg-emerald-700 text-white`} disabled={!choice || busy}
        onClick={async () => { setBusy(true); await setClubFix(norm(club), Number(choice)); await onSaved(); }}>Save club</button>
    </div>
  );
}

/** Every saved fix, with Undo (the player goes back to automatic matching). */
function SavedFixes({ views, manual, refs, teams, onSaved }: {
  views: PlayerView[]; manual: { players: Map<string, number | null>; clubs: Map<string, number> };
  refs: FplRef[]; teams: TeamRef[]; onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const players = [...manual.players].map(([k, code]) => {
    const [key, team] = [k.slice(0, k.lastIndexOf('|')), Number(k.slice(k.lastIndexOf('|') + 1))];
    const v = views.find((x) => nameKey(x.name) === key && x.team_id === team);
    const ref = code != null ? refs.find((r) => r.fpl_code === code) : undefined;
    return { k, key, team, name: v?.name ?? key, club: teams.find((t) => t.team_id === team)?.team_name ?? String(team),
      to: code == null ? 'Not in FPL' : ref ? `${ref.web_name} (${ref.first_name} ${ref.second_name})` : `FPL ${code}` };
  });
  const clubs = [...manual.clubs].map(([k, id]) => ({ k, to: teams.find((t) => t.team_id === id)?.team_name ?? String(id) }));
  const n = players.length + clubs.length;
  if (n === 0) return null;
  const undo = async (id: string, fn: () => Promise<void>) => { setBusy(id); try { await fn(); await onSaved(); } finally { setBusy(null); } };
  return (
    <section className="border border-chalk-300 rounded-lg bg-white p-3 space-y-2" data-testid="fanteam-saved-fixes">
      <button className="text-sm font-medium text-ink-700 py-1" onClick={() => setOpen(!open)}>
        Saved fixes ({n}) {open ? '▴' : '▾'}
      </button>
      {open && (
        <ul className="divide-y divide-chalk-200">
          {players.map((p) => (
            <li key={p.k} className="flex items-center justify-between gap-2 py-2">
              <span className="text-sm min-w-0"><span className="font-medium">{p.name}</span> <span className="text-ink-500">({p.club})</span><br />→ {p.to}</span>
              <button className={`${BTN} border border-chalk-300 shrink-0`} disabled={busy === p.k}
                onClick={() => undo(p.k, () => deletePlayerFix(p.key, p.team))}>Undo</button>
            </li>
          ))}
          {clubs.map((c) => (
            <li key={c.k} className="flex items-center justify-between gap-2 py-2">
              <span className="text-sm min-w-0"><span className="font-medium">{c.k}</span> → {c.to}</span>
              <button className={`${BTN} border border-chalk-300 shrink-0`} disabled={busy === c.k}
                onClick={() => undo(c.k, () => deleteClubFix(c.k))}>Undo</button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
