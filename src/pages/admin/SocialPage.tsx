// ============================================================================
// src/pages/admin/SocialPage.tsx   (/admin/social)
//
// Review queue for posts to X (@FixtureSharkHQ): approve, edit, reject or
// schedule candidates from the social detector, dry-run them, and (Phase 3)
// publish one by hand. Also the X connection, the kill switch, limits, the
// weekly report, detector runs and the audit log.
//
// The page enforces nothing: every rule is in the database functions and
// Edge Functions it calls (docs/social-publishing.md).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import SortableTable, { type Column } from '../../components/SortableTable';
import {
  addedNumbers, disconnectX, getSocialState, POST_TYPE_LABEL, publish, resolveNeedsCheck, review, runDetectors,
  startXConnect, updateSettings, weightedLength, X_RESULT_MESSAGE,
  type AuditRow, type Candidate, type Connection, type DetectorRun, type PublishResult, type Settings, type WeekRow,
} from '../../lib/socialApi';

const FILTERS = [
  { key: 'review', label: 'To review', test: (c: Candidate) => c.approval_status === 'pending' && c.publication_status === 'unpublished' },
  { key: 'approved', label: 'Approved', test: (c: Candidate) => c.approval_status === 'approved' && c.publication_status !== 'published' },
  { key: 'published', label: 'Published', test: (c: Candidate) => c.publication_status === 'published' },
  { key: 'closed', label: 'Rejected', test: (c: Candidate) => c.approval_status === 'rejected' || c.approval_status === 'superseded' },
  { key: 'all', label: 'All', test: () => true },
] as const;

const when = (t: string | null) =>
  t ? new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const usd = (n: number) => `$${Number(n).toFixed(3)}`;

function Chip({ children, tone = 'grey' }: { children: React.ReactNode; tone?: 'grey' | 'green' | 'amber' | 'red' }) {
  const cls = { grey: 'bg-chalk-200 text-ink-700', green: 'bg-pitch-700 text-chalk-100', amber: 'bg-amber-400 text-ink-900', red: 'bg-loss-600 text-chalk-100' }[tone];
  return <span className={`inline-block text-[11px] rounded px-1.5 py-0.5 ${cls}`}>{children}</span>;
}

function Btn({ onClick, children, disabled, tone = 'plain', title }: { onClick: () => void; children: React.ReactNode; disabled?: boolean; tone?: 'plain' | 'primary' | 'danger'; title?: string }) {
  const cls = {
    plain: 'border border-chalk-300 bg-white text-ink-900 hover:bg-chalk-100',
    primary: 'bg-pitch-800 text-chalk-100 hover:bg-pitch-700',
    danger: 'bg-loss-600 text-chalk-100 hover:bg-loss-700',
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`text-sm rounded px-3 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}>
      {children}
    </button>
  );
}

function Checks({ checks }: { checks?: { check: string; ok: boolean; detail?: unknown }[] }) {
  if (!checks?.length) return null;
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-ink-500">Checks ({checks.filter((c) => c.ok).length}/{checks.length} passed)</summary>
      <ul className="mt-1 space-y-0.5">
        {checks.map((c) => (
          <li key={c.check} className={c.ok ? 'text-ink-700' : 'text-loss-700'}>
            {c.ok ? '✓' : '✗'} {c.check}
            {c.detail != null && <span className="font-mono text-ink-500"> {JSON.stringify(c.detail)}</span>}
          </li>
        ))}
      </ul>
    </details>
  );
}

function CandidateCard({ c, settings, connection, onChanged }: { c: Candidate; settings: Settings; connection: Connection; onChanged: () => void }) {
  const [text, setText] = useState(c.text);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [schedule, setSchedule] = useState('');
  const [postId, setPostId] = useState('');

  const locked = ['publishing', 'published', 'needs_check'].includes(c.publication_status);
  const edited = text.trim() !== c.text.trim();
  const len = weightedLength(text);
  const added = addedNumbers(text, c.generated_text);
  const liveReady = !settings.kill_switch && settings.live_enabled && connection.status === 'connected';
  const canPublish = liveReady && c.approval_status === 'approved' && !edited && ['unpublished', 'failed'].includes(c.publication_status);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = (await fn()) as { ok?: boolean; errors?: string[] } | undefined;
      if (r && r.ok === false && r.errors) setMsg(r.errors.join('; '));
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const runPublish = async (mode: 'dry_run' | 'live') => {
    if (mode === 'live' && !window.confirm(`Post this to @FixtureSharkHQ now?\n\n${c.text}`)) return;
    setBusy(true);
    setMsg(null);
    try {
      setResult(await publish(c.candidate_id, mode));
      onChanged();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pubTone = c.publication_status === 'published' ? 'green' : c.publication_status === 'needs_check' || c.publication_status === 'failed' ? 'red' : 'grey';
  return (
    <div className="border border-chalk-300 rounded-lg bg-white p-3 space-y-2" data-testid="social-candidate">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
        <span className="font-semibold text-ink-900 text-sm">{POST_TYPE_LABEL[c.post_type]}</span>
        <span>#{c.candidate_id}</span>
        <Chip tone={c.validation_status === 'passed' ? 'green' : 'red'}>checks {c.validation_status}</Chip>
        <Chip tone={c.approval_status === 'approved' ? 'green' : c.approval_status === 'pending' ? 'amber' : 'grey'}>{c.approval_status}</Chip>
        <Chip tone={pubTone}>{c.publication_status.replace('_', ' ')}</Chip>
        {c.model_version && <span className="font-mono">{c.model_version}</span>}
        <span>data {when(c.snapshot_at)}</span>
        <span>expires {when(c.expires_at)}</span>
        {c.scheduled_for && <span>scheduled {when(c.scheduled_for)}</span>}
      </div>

      <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={locked || busy} rows={Math.min(9, text.split('\n').length + 1)}
        className="w-full font-mono text-sm border border-chalk-300 rounded p-2 disabled:bg-chalk-100" aria-label={`Text of candidate ${c.candidate_id}`} />
      <div className="flex flex-wrap gap-3 text-xs">
        <span className={len > 280 ? 'text-loss-700' : 'text-ink-500'}>{len}/280</span>
        {added.length > 0 && <span className="text-loss-700">New numbers not allowed: {added.join(', ')}</span>}
        {c.validation_errors?.length > 0 && <span className="text-loss-700">{c.validation_errors.join('; ')}</span>}
        {c.rejected_reason && <span className="text-ink-500">Rejected: {c.rejected_reason}</span>}
        {c.last_error && <span className="text-loss-700">Last error: {c.last_error}</span>}
        {c.x_post_id && (
          <a className="underline text-pitch-700" href={`https://x.com/FixtureSharkHQ/status/${c.x_post_id}`} target="_blank" rel="noreferrer">View post</a>
        )}
      </div>

      {!locked && (
        <div className="flex flex-wrap items-center gap-2">
          {edited && <Btn tone="primary" disabled={busy || len > 280 || added.length > 0} onClick={() => act(() => review(c.candidate_id, 'edit', { text }))}>Save edit</Btn>}
          {c.approval_status !== 'approved' && <Btn tone="primary" disabled={busy || edited} onClick={() => act(() => review(c.candidate_id, 'approve'))}>Approve</Btn>}
          {c.approval_status !== 'rejected' && (
            <Btn disabled={busy} onClick={() => {
              const reason = window.prompt('Reason (optional)') ?? undefined;
              act(() => review(c.candidate_id, 'reject', { reason }));
            }}>Reject</Btn>
          )}
          {c.approval_status === 'approved' && (
            <>
              <input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)} className="text-sm border border-chalk-300 rounded px-2 py-1" aria-label="Schedule time" />
              <Btn disabled={busy || !schedule} onClick={() => act(() => review(c.candidate_id, 'schedule', { scheduledFor: new Date(schedule).toISOString() }))}>Schedule</Btn>
              {c.scheduled_for && <Btn disabled={busy} onClick={() => act(() => review(c.candidate_id, 'unschedule'))}>Unschedule</Btn>}
            </>
          )}
          <Btn disabled={busy || edited} onClick={() => runPublish('dry_run')}>Dry run</Btn>
          <Btn tone="danger" disabled={busy || !canPublish} onClick={() => runPublish('live')}
            title={canPublish ? 'Post to @FixtureSharkHQ' : 'Needs: approved, saved, kill switch off, live publishing on, X connected'}>Publish</Btn>
        </div>
      )}

      {c.publication_status === 'needs_check' && (
        <div className="flex flex-wrap items-center gap-2 text-sm border border-amber-500 bg-amber-500/10 rounded p-2">
          <span>X did not confirm this post. Check <a className="underline" href="https://x.com/FixtureSharkHQ" target="_blank" rel="noreferrer">@FixtureSharkHQ</a>.</span>
          <input value={postId} onChange={(e) => setPostId(e.target.value.trim())} placeholder="Post id if it posted" className="border border-chalk-300 rounded px-2 py-1 font-mono text-xs" />
          <Btn disabled={busy || !/^[0-9]{5,25}$/.test(postId)} onClick={() => act(() => resolveNeedsCheck(c.candidate_id, postId))}>It posted</Btn>
          <Btn disabled={busy} onClick={() => act(() => resolveNeedsCheck(c.candidate_id, null))}>It did not post</Btn>
        </div>
      )}

      {result && (
        <div className={`text-xs rounded p-2 ${result.ok ? 'bg-pitch-700/10 text-ink-900' : 'bg-loss-600/10 text-loss-700'}`}>
          <div className="font-semibold">{result.mode === 'dry_run' ? 'Dry run' : 'Publish'}: {result.ok ? (result.outcome ?? 'would post') : 'blocked'}</div>
          {result.reasons?.length ? <ul className="list-disc ml-4">{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
          {result.estimated_cost_usd != null && <div>Estimated cost {usd(result.estimated_cost_usd)}</div>}
          {result.url && <a className="underline" href={result.url} target="_blank" rel="noreferrer">{result.url}</a>}
        </div>
      )}
      {msg && <div className="text-xs text-loss-700">{msg}</div>}
      <Checks checks={c.source_data?.checks} />
    </div>
  );
}

function Toggle({ label, on, onChange, disabled, confirmOn, confirmOff }: { label: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean; confirmOn?: string; confirmOff?: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={on} disabled={disabled} onChange={(e) => {
        const v = e.target.checked;
        const ask = v ? confirmOn : confirmOff;
        if (ask && !window.confirm(ask)) return;
        onChange(v);
      }} />
      {label}
    </label>
  );
}

function LimitsForm({ s, onSave }: { s: Settings; onSave: (c: Partial<Settings>) => void }) {
  const [v, setV] = useState({ ...s });
  const num = (k: keyof Settings, label: string, step = 1) => (
    <label className="text-sm flex flex-col">
      <span className="text-xs text-ink-500">{label}</span>
      <input type="number" step={step} value={Number(v[k])} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })}
        className="border border-chalk-300 rounded px-2 py-1 w-32" />
    </label>
  );
  return (
    <div className="flex flex-wrap items-end gap-3">
      {num('max_posts_per_day', 'Posts per day')}
      {num('max_posts_per_month', 'Posts per month')}
      {num('min_minutes_between_posts', 'Minutes between posts')}
      {num('monthly_budget_usd', 'Monthly budget ($)', 0.01)}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.allow_urls} onChange={(e) => setV({ ...v, allow_urls: e.target.checked })} />
        Allow links ({usd(s.cost_per_post_with_url_usd)} a post v {usd(s.cost_per_post_usd)})
      </label>
      <Btn onClick={() => onSave({
        max_posts_per_day: v.max_posts_per_day, max_posts_per_month: v.max_posts_per_month,
        min_minutes_between_posts: v.min_minutes_between_posts, monthly_budget_usd: v.monthly_budget_usd, allow_urls: v.allow_urls,
      })}>Save limits</Btn>
    </div>
  );
}

export default function SocialPage() {
  useDocumentHead({ title: 'Social publishing' });
  const isAdmin = useAuthOptional()?.isAdmin ?? false;
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<Awaited<ReturnType<typeof getSocialState>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filter = (FILTERS.find((f) => f.key === params.get('show')) ?? FILTERS[0]).key;
  const xResult = params.get('x');

  const load = useCallback(() => {
    getSocialState().then(setState).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
    return (state?.candidates ?? []).filter(f.test);
  }, [state, filter]);

  const doAct = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try { await fn(); load(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Social publishing</h1>
        <p className="text-sm text-ink-700">This page is for admins.</p>
      </div>
    );
  }
  if (!state) {
    return <div className="text-sm text-ink-700">{error ?? 'Loading…'}</div>;
  }
  const { settings: s, connection: x } = state;

  const weekCols: Column<WeekRow>[] = [
    { key: 'w', label: 'Week', render: (r) => r.week_start, sortValue: (r) => r.week_start, descFirst: true },
    { key: 't', label: 'Type', render: (r) => POST_TYPE_LABEL[r.post_type], sortValue: (r) => r.post_type },
    { key: 'g', label: 'Generated', align: 'right', render: (r) => r.generated, sortValue: (r) => r.generated, descFirst: true },
    { key: 'a', label: 'Approved', align: 'right', render: (r) => r.approved, sortValue: (r) => r.approved, descFirst: true },
    { key: 'r', label: 'Rejected', align: 'right', render: (r) => r.rejected, sortValue: (r) => r.rejected, descFirst: true },
    { key: 'p', label: 'Published', align: 'right', render: (r) => r.published, sortValue: (r) => r.published, descFirst: true },
    { key: 'f', label: 'Failed', align: 'right', render: (r) => r.failed, sortValue: (r) => r.failed, descFirst: true },
    { key: 'd', label: 'Dry runs', align: 'right', render: (r) => r.dry_runs, sortValue: (r) => r.dry_runs, descFirst: true },
    { key: 's', label: 'Spend', align: 'right', render: (r) => usd(r.spend_usd), sortValue: (r) => Number(r.spend_usd), descFirst: true },
  ];
  const auditCols: Column<AuditRow>[] = [
    { key: 'at', label: 'When', render: (r) => when(r.at), sortValue: (r) => r.at, descFirst: true },
    { key: 'a', label: 'Action', render: (r) => r.action, sortValue: (r) => r.action },
    { key: 'c', label: 'Candidate', align: 'right', render: (r) => r.candidate_id ?? '', sortValue: (r) => r.candidate_id },
    { key: 'd', label: 'Detail', render: (r) => <span className="font-mono text-[11px] break-all">{JSON.stringify(r.detail).slice(0, 160)}</span> },
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">Social publishing</h1>

      {xResult && (
        <div className={`text-sm rounded p-3 ${xResult === 'connected' ? 'bg-pitch-700/10' : 'bg-loss-600/10 text-loss-700'}`}>
          {X_RESULT_MESSAGE[xResult] ?? `X: ${xResult}`}{' '}
          <button type="button" className="underline text-xs" onClick={() => { params.delete('x'); setParams(params, { replace: true }); }}>Dismiss</button>
        </div>
      )}
      {error && <div className="text-sm text-loss-700">{error}</div>}

      <section className="border border-chalk-300 rounded-lg bg-white p-3 space-y-3" data-testid="social-controls">
        <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
          <Toggle label="Kill switch" on={s.kill_switch} disabled={busy} onChange={(v) => doAct(() => updateSettings({ kill_switch: v }))}
            confirmOff="Turn the kill switch off? Live posting will still need live publishing on and a connected account." />
          <Toggle label="Live publishing" on={s.live_enabled} disabled={busy} onChange={(v) => doAct(() => updateSettings({ live_enabled: v }))}
            confirmOn="Enable live publishing? Posts still go only when you press Publish on an approved candidate." />
          <span className="text-sm text-ink-500">Automatic publishing: off</span>
          <Toggle label="Detector" on={s.detector_enabled} disabled={busy} onChange={(v) => doAct(() => updateSettings({ detector_enabled: v }))} />
          <Btn disabled={busy} onClick={() => doAct(async () => { await runDetectors(); })}>Run detectors</Btn>
        </div>
        <div className="flex flex-wrap gap-3 items-center text-sm">
          <span>X account:</span>
          {x.status === 'connected'
            ? <Chip tone="green">@{x.x_username}</Chip>
            : <Chip tone={x.status === 'error' ? 'red' : 'grey'}>{x.status}</Chip>}
          {x.last_error && <span className="text-xs text-loss-700">{x.last_error}</span>}
          {x.status === 'connected' && <span className="text-xs text-ink-500">token renewed {when(x.last_refreshed_at)}</span>}
          <Btn disabled={busy} onClick={() => doAct(async () => { window.location.assign(await startXConnect()); })}>
            {x.status === 'connected' ? 'Reconnect' : `Connect @${s.allowed_x_username}`}
          </Btn>
          {x.status !== 'disconnected' && (
            <Btn disabled={busy} onClick={() => window.confirm('Remove the stored X tokens?') && doAct(disconnectX)}>Disconnect</Btn>
          )}
        </div>
        <LimitsForm key={s.updated_at} s={s} onSave={(c) => doAct(() => updateSettings(c))} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => { params.set('show', f.key); setParams(params, { replace: true }); }}
              className={`text-sm rounded px-3 py-1 ${filter === f.key ? 'bg-pitch-800 text-chalk-100' : 'bg-chalk-200 text-ink-900'}`}>
              {f.label} ({(state.candidates ?? []).filter(f.test).length})
            </button>
          ))}
        </div>
        {shown.length === 0 && <p className="text-sm text-ink-500">None.</p>}
        {shown.map((c) => <CandidateCard key={`${c.candidate_id}:${c.text}`} c={c} settings={s} connection={x} onChanged={load} />)}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink-900">Weekly report</h2>
        <SortableTable columns={weekCols} rows={state.weeks} rowKey={(r) => `${r.week_start}-${r.post_type}`} empty="Nothing yet." />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink-900">Detector runs</h2>
        {state.runs.length === 0 && <p className="text-sm text-ink-500">None yet.</p>}
        {state.runs.map((r: DetectorRun) => (
          <div key={r.run_id} className="border border-chalk-300 rounded bg-white p-2 text-xs space-y-1">
            <div className="text-ink-700">{when(r.started_at)} · {r.triggered_by} · {r.candidates_created} created</div>
            {Object.entries(r.results ?? {}).map(([k, v]) => (
              <div key={k}>
                <span className="font-semibold">{k}</span>: {v.status}{v.reason ? ` (${v.reason})` : ''}
                {v.status === 'rejected' && <Checks checks={v.checks} />}
              </div>
            ))}
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-ink-900">Audit log</h2>
        <SortableTable columns={auditCols} rows={state.audit} rowKey={(r) => String(r.audit_id)} empty="Nothing yet." />
      </section>
    </div>
  );
}
