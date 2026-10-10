// ============================================================================
// src/pages/admin/LineupComparePage.tsx   (/admin/lineup-compare)
//
// Our starting line-up projections next to Fantasy Football Scout's
// predicted XIs (Chris, 10 Oct 2026: "one of the most popular resources ...
// I want to easily compare and scrutinise differences").
//
// FFS's public team-news page is read twice a day (scripts/ffs_team_news.py,
// workflow ffs-team-news; "Fetch from FFS now" runs it). Line-ups can still
// be pasted or read off a screenshot. Stored admin-only; not an input to the
// projections. For each club the page shows where the two disagree: FFS
// starters we make under 50%, and our 50%+ starters FFS leaves out.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import { parseLineups, type ParsedClub, type SquadPlayer, type ClubRef } from '../../lib/externalLineupParse';
import {
  buildComparison, clearExternalLineup, getComparison, getFetchRuns, getGameweeks, getSquadsAndClubs, saveExternalLineup,
  START_LINE, type ClubComparison, type CompareRow, type FetchRun, type Gameweek,
} from '../../lib/lineupCompareApi';
import { triggerWorkflow } from '../../lib/workflowTrigger';

const BTN = 'min-h-11 px-4 rounded text-sm font-medium disabled:opacity-40';
const pct = (v: number) => `${Math.round(v * 100)}%`;
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const STATUS_LABEL: Record<string, string> = { i: 'injured', d: 'doubtful', s: 'suspended', u: 'unavailable', n: 'unavailable' };

function when(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

function PlayerLine({ r }: { r: CompareRow }) {
  const flag = r.status && r.status !== 'a' ? STATUS_LABEL[r.status] : null;
  return (
    <li className="flex items-baseline justify-between gap-2 py-1">
      <span className="min-w-0">
        <span className="font-medium text-ink-900">{r.web_name}</span>
        <span className="text-[11px] font-mono text-ink-500 ml-1.5">
          {r.tactical_role ?? '?'}
          {r.depth_rank ? ` · ${r.depth_rank === 1 ? '1st' : r.depth_rank === 2 ? '2nd' : `${r.depth_rank}th`}` : ''}
        </span>
        {flag && <span className="text-[11px] text-loss-700 ml-1.5" title={r.news ?? undefined}>{flag}</span>}
      </span>
      <span className="font-mono text-sm text-ink-900 shrink-0" title={`${Math.round(r.expected_minutes)} expected minutes`}>{pct(r.start_probability)}</span>
    </li>
  );
}

function ClubCard({ c, run, onClear, busy }: { c: ClubComparison; run: FetchRun | undefined; onClear: () => void; busy: boolean }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <section className="border border-chalk-300 rounded-lg bg-white p-3 space-y-2" data-testid={`club-${c.team_id}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display uppercase tracking-wide text-ink-900">{c.team_name}</h3>
        <span className={['text-xs font-mono px-2 py-0.5 rounded', c.disagreements === 0 ? 'bg-pitch-600/20 text-pitch-800' : 'bg-amber-500/20 text-amber-800'].join(' ')}>
          {c.disagreements === 0 ? 'Agree on every starter' : `${c.disagreements} difference${c.disagreements === 1 ? '' : 's'}`}
        </span>
      </header>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div>
          <h4 className="text-[11px] uppercase tracking-wide text-ink-500">FFS starts, we make it under {pct(START_LINE)}</h4>
          {c.ffsOnly.length === 0 ? <p className="text-ink-400 text-xs py-1">None</p> : <ul className="divide-y divide-chalk-200">{c.ffsOnly.map((r) => <PlayerLine key={r.fpl_player_id} r={r} />)}</ul>}
        </div>
        <div>
          <h4 className="text-[11px] uppercase tracking-wide text-ink-500">We make it {pct(START_LINE)}+, FFS leaves out</h4>
          {c.oursOnly.length === 0 ? <p className="text-ink-400 text-xs py-1">None</p> : <ul className="divide-y divide-chalk-200">{c.oursOnly.map((r) => <PlayerLine key={r.fpl_player_id} r={r} />)}</ul>}
        </div>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-ink-700 text-xs min-h-8 flex items-center">Both have him starting ({c.agree.length})</summary>
        <ul className="divide-y divide-chalk-200">{c.agree.map((r) => <PlayerLine key={r.fpl_player_id} r={r} />)}</ul>
      </details>
      {run && run.unmatched.length > 0 && (
        <p className="text-[11px] text-amber-700">
          FFS names not matched to the squad: {run.unmatched.join(', ')}{run.saved ? '' : ' \u2014 line-up not updated'}
        </p>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-500">
        <span>
          {run ? `Read from FFS ${when(run.fetched_at)}` : `Entered ${when(c.enteredAt)}`}
          {run?.source_updated ? ` \u00b7 FFS updated ${run.source_updated.replace(/^last updated\s*/i, '')}` : ''}
        </span>
        {confirm ? (
          <span className="flex gap-2">
            <button type="button" className="min-h-9 px-3 rounded bg-loss-700 text-chalk-100" disabled={busy} onClick={onClear}>Remove</button>
            <button type="button" className="min-h-9 px-3 rounded border border-chalk-300" onClick={() => setConfirm(false)}>Keep</button>
          </span>
        ) : (
          <button type="button" className="min-h-9 px-3 rounded border border-chalk-300 text-ink-700" onClick={() => setConfirm(true)}>Remove FFS line-up&hellip;</button>
        )}
      </footer>
    </section>
  );
}

function ParsedPreview({
  p, clubLabel, squad, onChange, onSave, busy,
}: {
  p: ParsedClub; clubLabel: string; squad: SquadPlayer[]; onChange: (next: ParsedClub) => void; onSave: () => void; busy: boolean;
}) {
  const n = p.matched.length;
  const remove = (id: number) => onChange({ ...p, matched: p.matched.filter((m) => m.fpl_player_id !== id) });
  const resolve = (i: number, id: number | null) => {
    const unmatched = p.unmatched.filter((_, j) => j !== i);
    const player = id == null ? null : squad.find((s) => s.fpl_player_id === id) ?? null;
    onChange({ ...p, unmatched, matched: player && !p.matched.some((m) => m.fpl_player_id === id) ? [...p.matched, player] : p.matched });
  };
  const choices = [...squad].sort((a, b) => a.web_name.localeCompare(b.web_name));
  return (
    <div className="border border-chalk-300 rounded p-2 space-y-2" data-testid={`parsed-${p.team_id}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-ink-900">{clubLabel}</span>
        <span className={['text-xs font-mono', n === 11 ? 'text-pitch-800' : 'text-amber-700'].join(' ')}>{n} of 11 found</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {p.matched.map((m) => (
          <span key={m.fpl_player_id} className="inline-flex items-center gap-1 rounded bg-chalk-100 border border-chalk-300 pl-2 text-xs">
            {m.web_name}
            <button type="button" className="px-2 min-h-8 text-ink-500 hover:text-ink-900" aria-label={`Remove ${m.web_name}`} onClick={() => remove(m.fpl_player_id)}>&times;</button>
          </span>
        ))}
      </div>
      {p.unmatched.map((u, i) => (
        <label key={`${u.text}-${i}`} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-amber-700">Not recognised: &ldquo;{u.text}&rdquo;</span>
          <select className="min-h-9 border border-chalk-300 rounded px-1 bg-white text-sm" defaultValue="" aria-label={`Match "${u.text}"`}
            onChange={(e) => resolve(i, e.target.value === 'skip' ? null : Number(e.target.value))}>
            <option value="" disabled>Choose&hellip;</option>
            <option value="skip">Ignore</option>
            {(u.options.length > 0 ? u.options : choices).map((s) => <option key={s.fpl_player_id} value={s.fpl_player_id}>{s.web_name}</option>)}
          </select>
        </label>
      ))}
      <button type="button" className={`${BTN} bg-pitch-800 text-chalk-100`} disabled={busy || n === 0 || n > 11 || p.unmatched.length > 0} onClick={onSave}>
        Save {clubLabel}
      </button>
      {p.unmatched.length > 0 && <p className="text-[11px] text-ink-500">Match or ignore the names above to save.</p>}
    </div>
  );
}

export default function LineupComparePage() {
  useDocumentHead({ title: 'Line-ups v Fantasy Football Scout', description: 'Admin: our starting line-up projections against Fantasy Football Scout.' });
  const isAdmin = useAuthOptional()?.isAdmin ?? false;
  const [params, setParams] = useSearchParams();
  const [gws, setGws] = useState<Gameweek[]>([]);
  const [event, setEvent] = useState<number | null>(params.get('gw') ? Number(params.get('gw')) : null);
  const [rows, setRows] = useState<CompareRow[] | null>(null);
  const [runs, setRuns] = useState<Map<number, FetchRun>>(new Map());
  const [squads, setSquads] = useState<Map<number, SquadPlayer[]>>(new Map());
  const [clubs, setClubs] = useState<(ClubRef & { label: string })[]>([]);
  const [text, setText] = useState('');
  const [defaultClub, setDefaultClub] = useState('');
  const [parsed, setParsed] = useState<ParsedClub[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocr, setOcr] = useState<number | null>(null);
  // null = not toggled yet: open while nothing is entered for the gameweek.
  const [addOpen, setAddOpen] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    Promise.all([getGameweeks(), getSquadsAndClubs()])
      .then(([g, sc]) => {
        if (cancelled) return;
        setGws(g.list);
        setEvent((e) => e ?? g.next);
        setSquads(sc.squads);
        setClubs(sc.clubs);
      })
      .catch((e) => { if (!cancelled) setMsg(errText(e)); });
    return () => { cancelled = true; };
  }, [isAdmin]);

  const load = useCallback(async () => {
    if (event == null) return;
    try {
      const [r, fr] = await Promise.all([getComparison(event), getFetchRuns(event).catch(() => new Map<number, FetchRun>())]);
      setRows(r);
      setRuns(fr);
    } catch (e) { setMsg(errText(e)); }
  }, [event]);
  // load() sets state only after its await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (isAdmin) void load(); }, [isAdmin, load]);

  const comparison = useMemo(() => (rows ? buildComparison(rows) : []), [rows]);
  const entered = comparison.filter((c) => c.entered);
  const notEntered = comparison.filter((c) => !c.entered);
  const label = (teamId: number) => clubs.find((c) => c.team_id === teamId)?.label ?? `Club ${teamId}`;

  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Line-ups v Fantasy Football Scout</h1>
        <p className="text-sm text-ink-700">This page is for admins.</p>
      </div>
    );
  }

  const parse = () => {
    const playing = new Set(comparison.map((c) => c.team_id));
    const res = parseLineups(text, clubs, squads, defaultClub ? Number(defaultClub) : null).filter((p) => playing.size === 0 || playing.has(p.team_id));
    setParsed(res);
    setMsg(res.length === 0 ? 'No club line-ups found. Start each with the club name (e.g. "Arsenal: Raya; ..."), or choose the club above.' : null);
  };

  const save = async (p: ParsedClub) => {
    if (event == null) return;
    setBusy(true); setMsg(null);
    try {
      await saveExternalLineup(event, p.team_id, p.matched.map((m) => m.fpl_player_id));
      setParsed((prev) => prev.filter((x) => x.team_id !== p.team_id));
      await load();
      setMsg(`Saved ${label(p.team_id)}.`);
    } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };

  const clear = async (teamId: number) => {
    if (event == null) return;
    setBusy(true);
    try { await clearExternalLineup(event, teamId); await load(); } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };

  const readShot = async (file: File) => {
    setOcr(0); setMsg(null);
    try {
      const { readImageText } = await import('../../lib/fanteam/teamPhoto');
      const t = await readImageText(file, (p) => setOcr(p));
      setText((prev) => (prev ? `${prev}\n` : '') + t);
      setMsg('Screenshot read. Check the text, choose the club if it isn’t named, then press Find players.');
    } catch (e) { setMsg(errText(e)); } finally { setOcr(null); }
  };

  const fetchNow = async () => {
    setBusy(true); setMsg(null);
    try {
      await triggerWorkflow('ffs-team-news');
      setMsg('Fetching from Fantasy Football Scout: about a minute. Reload the page after.');
    } catch (e) { setMsg(errText(e)); } finally { setBusy(false); }
  };

  const totalStarters = entered.reduce((n, c) => n + c.agree.length + c.ffsOnly.length, 0);
  const totalAgree = entered.reduce((n, c) => n + c.agree.length, 0);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Line-ups v Fantasy Football Scout</h1>
        <p className="text-sm text-ink-700 max-w-prose">
          Our chance of each player starting against Fantasy Football Scout&rsquo;s predicted XIs, read from their team-news page
          twice a day (or paste them below). Kept for admins only; they don&rsquo;t change our projections. Fix a
          difference you agree with on{' '}
          <Link to="/fpl/line-ups" className="underline underline-offset-2 text-pitch-800">Starting Lineups</Link>.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm">
        Gameweek
        <select className="min-h-11 border border-chalk-300 rounded px-2 bg-white text-base" value={event ?? ''}
          onChange={(e) => { const v = Number(e.target.value); setEvent(v); setParams({ gw: String(v) }, { replace: true }); setParsed([]); }}>
          {gws.map((g) => <option key={g.fpl_event_id} value={g.fpl_event_id}>GW{g.fpl_event_id}</option>)}
        </select>
      </label>
      <button type="button" className={`${BTN} border border-chalk-300`} disabled={busy} onClick={() => void fetchNow()}>Fetch from FFS now</button>
      </div>

      <details className="border border-chalk-300 rounded-lg bg-white p-3" open={addOpen ?? (entered.length === 0 || parsed.length > 0)} onToggle={(e) => setAddOpen(e.currentTarget.open)}>
        <summary className="cursor-pointer min-h-11 flex items-center font-display uppercase tracking-wide text-sm text-ink-900">Paste FFS line-ups</summary>
        <div className="space-y-3 mt-2 text-sm">
          <textarea className="w-full min-h-40 border border-chalk-300 rounded p-2 text-base font-mono" value={text} onChange={(e) => setText(e.target.value)}
            aria-label="FFS line-ups" placeholder={'Arsenal: Raya; Timber, Saliba, Gabriel, Calafiori; Rice, Lewis-Skelly; Saka, Odegaard, Eze; Havertz\nAston Villa: ...'} />
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              Club, if the text doesn&rsquo;t name it
              <select className="min-h-11 border border-chalk-300 rounded px-2 bg-white text-base" value={defaultClub} onChange={(e) => setDefaultClub(e.target.value)} aria-label="Club">
                <option value="">Named in the text</option>
                {clubs.map((c) => <option key={c.team_id} value={c.team_id}>{c.label}</option>)}
              </select>
            </label>
            <label className={`${BTN} border border-chalk-300 inline-flex items-center cursor-pointer`}>
              {ocr != null ? `Reading… ${Math.round(ocr * 100)}%` : 'Read a screenshot'}
              <input type="file" accept="image/*" className="sr-only" disabled={ocr != null} onChange={(e) => { const f = e.target.files?.[0]; if (f) void readShot(f); e.target.value = ''; }} />
            </label>
            <button type="button" className={`${BTN} bg-pitch-800 text-chalk-100`} disabled={!text.trim()} onClick={parse}>Find players</button>
          </div>
          {parsed.map((p) => (
            <ParsedPreview key={p.team_id} p={p} clubLabel={label(p.team_id)} squad={squads.get(p.team_id) ?? []} busy={busy}
              onChange={(next) => setParsed((prev) => prev.map((x) => (x.team_id === p.team_id ? next : x)))} onSave={() => void save(p)} />
          ))}
        </div>
      </details>

      {msg && <p className="text-sm text-ink-700" role="status">{msg}</p>}

      {rows === null ? (
        <p className="text-sm text-ink-500">Loading&hellip;</p>
      ) : (
        <>
          {entered.length > 0 && (
            <p className="text-sm text-ink-700" data-testid="compare-summary">
              {entered.length} club{entered.length === 1 ? '' : 's'} entered: FFS&rsquo;s {totalStarters} starters include {totalAgree} we make {pct(START_LINE)}+ to start;{' '}
              {entered.reduce((n, c) => n + c.disagreements, 0)} differences in all.
            </p>
          )}
          <div className="grid lg:grid-cols-2 gap-3">
            {entered.map((c) => <ClubCard key={c.team_id} c={c} run={runs.get(c.team_id)} busy={busy} onClear={() => void clear(c.team_id)} />)}
          </div>
          {notEntered.length > 0 && (
            <p className="text-xs text-ink-500">
              No FFS line-up yet for GW{event}: {notEntered.map((c) => c.team_name).join(', ')}.
            </p>
          )}
        </>
      )}
    </div>
  );
}
