// ============================================================================
// src/pages/admin/SocialPage.tsx   (/admin/social)
//
// Review queue for posts to X (@FixtureSharkHQ): approve, edit, reject or
// schedule candidates from the social detector, dry-run them, and publish one
// by hand. Phase 4: automatic post types are queued with a hold time and go
// out on their own unless held; the circuit breaker stops them and is reset
// here. Also the X connection, the kill switch, limits, the weekly report,
// detector runs and the audit log.
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
  addedNumbers, disconnectX, getMetricsReport, getSocialState, hold, POST_TYPE_LABEL, publish, readMetricsNow, resolveNeedsCheck,
  review, runDetectors, startXConnect, updateSettings, weightedLength, X_RESULT_MESSAGE,
  type AuditRow, type Candidate, type Connection, type DetectorRun, type MetricsPostRow, type MetricsReport, type MetricsTypeRow,
  type PublishResult, type Settings, type WeekRow,
} from '../../lib/socialApi';

const queued = (c: Candidate) => !!c.auto && c.approval_status === 'approved' && ['unpublished', 'failed'].includes(c.publication_status);
const FILTERS = [
  { key: 'queue', label: 'Going out', test: queued },
  { key: 'review', label: 'To review', test: (c: Candidate) => c.approval_status === 'pending' && c.publication_status === 'unpublished' },
  { key: 'approved', label: 'Approved', test: (c: Candidate) => c.approval_status === 'approved' && c.publication_status !== 'published' && !queued(c) },
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
  const thread = c.thread && c.thread.length > 1 ? c.thread : null;
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

      {c.auto && !locked && (
        <div className={`flex flex-wrap items-center gap-2 text-sm rounded p-2 ${c.held ? 'bg-amber-400/20' : 'bg-pitch-700/10'}`}>
          {c.held
            ? <span>On hold: it won&rsquo;t post until you release it.</span>
            : <span>Posts automatically at <strong>{when(c.hold_until ?? null)}</strong>{c.notified_at ? ' (you were emailed)' : ''}.</span>}
          <Btn tone={c.held ? 'primary' : 'danger'} disabled={busy} onClick={() => act(() => hold(c.candidate_id, !c.held))}>
            {c.held ? 'Release' : 'Hold'}
          </Btn>
        </div>
      )}
      {thread ? (
        <ol className="space-y-1" aria-label={`Thread of candidate ${c.candidate_id}`}>
          {thread.map((p, i) => (
            <li key={i} className="font-mono text-sm border border-chalk-300 rounded p-2 bg-chalk-100 whitespace-pre-wrap">
              <span className="text-ink-500">{i + 1}/{thread.length} </span>{p}
              <span className={`ml-2 text-xs ${weightedLength(p) > 280 ? 'text-loss-700' : 'text-ink-500'}`}>({weightedLength(p)}/280)</span>
            </li>
          ))}
        </ol>
      ) : (
        <textarea value={text} onChange={(e) => setText(e.target.value)} disabled={locked || busy} rows={Math.min(9, text.split('\n').length + 1)}
          className="w-full font-mono text-sm border border-chalk-300 rounded p-2 disabled:bg-chalk-100" aria-label={`Text of candidate ${c.candidate_id}`} />
      )}
      <div className="flex flex-wrap gap-3 text-xs">
        {!thread && <span className={len > 280 ? 'text-loss-700' : 'text-ink-500'}>{len}/280</span>}
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
          {edited && !thread && <Btn tone="primary" disabled={busy || len > 280 || added.length > 0} onClick={() => act(() => review(c.candidate_id, 'edit', { text }))}>Save edit</Btn>}
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
      {num('hold_minutes', 'Hold before posting (min)')}
      {num('max_links_per_week', 'Links per week')}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.allow_urls} onChange={(e) => setV({ ...v, allow_urls: e.target.checked })} />
        Allow links ({usd(s.cost_per_post_with_url_usd)} a post v {usd(s.cost_per_post_usd)})
      </label>
      <Btn onClick={() => onSave({
        max_posts_per_day: v.max_posts_per_day, max_posts_per_month: v.max_posts_per_month,
        min_minutes_between_posts: v.min_minutes_between_posts, monthly_budget_usd: v.monthly_budget_usd, allow_urls: v.allow_urls,
        ...(v.hold_minutes != null ? { hold_minutes: v.hold_minutes } : {}),
        ...(v.max_links_per_week != null ? { max_links_per_week: v.max_links_per_week } : {}),
      })}>Save limits</Btn>
    </div>
  );
}

const pct = (n: number | null) => (n == null ? '—' : `${(Number(n) * 100).toFixed(1)}%`);
const whole = (n: number | null) => (n == null ? '—' : Math.round(Number(n)).toLocaleString('en-GB'));

/** Engagement by post type (x-metrics, weekly): which posts land. */
function Engagement() {
  const [report, setReport] = useState<MetricsReport | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    getMetricsReport().then(setReport).catch((e) => setMsg(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);
  const readNow = async () => {
    if (!window.confirm('Read the last 30 days of posts from X now? About $0.001 a post, at most 300 posts.')) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await readMetricsNow();
      setMsg(`Read ${r.posts_read} post(s), ${r.posts_missing} missing (deleted), about ${usd(r.estimated_cost_usd)}.`);
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const typeCols: Column<MetricsTypeRow>[] = [
    { key: 't', label: 'Type', render: (r) => POST_TYPE_LABEL[r.post_type] ?? r.post_type, sortValue: (r) => r.post_type },
    { key: 'n', label: 'Posts', align: 'right', render: (r) => r.posts, sortValue: (r) => r.posts, descFirst: true },
    { key: 'i', label: 'Median views', align: 'right', render: (r) => whole(r.median_impressions), sortValue: (r) => r.median_impressions, descFirst: true },
    { key: 'e', label: 'Median engagements', align: 'right', render: (r) => whole(r.median_engagements), sortValue: (r) => r.median_engagements, descFirst: true },
    { key: 'r', label: 'Engagement rate', align: 'right', render: (r) => pct(r.engagement_rate), sortValue: (r) => r.engagement_rate, descFirst: true },
    { key: 'l', label: 'Likes', align: 'right', render: (r) => whole(r.likes), sortValue: (r) => r.likes, descFirst: true },
    { key: 'p', label: 'Replies', align: 'right', render: (r) => whole(r.replies), sortValue: (r) => r.replies, descFirst: true },
    { key: 's', label: 'Reposts', align: 'right', render: (r) => whole(r.reposts), sortValue: (r) => r.reposts, descFirst: true },
  ];
  const postList = (title: string, rows: MetricsPostRow[]) => (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
      {rows.length === 0 && <p className="text-xs text-ink-500">None yet.</p>}
      <ul className="space-y-1">
        {rows.map((p) => (
          <li key={p.candidate_id} className="text-xs border border-chalk-300 rounded bg-white p-2">
            <span className="font-semibold">{pct(p.rate)}</span> · {whole(p.impressions)} views · {p.engagements} engagements ·{' '}
            {POST_TYPE_LABEL[p.post_type] ?? p.post_type} · {when(p.published_at)}{' '}
            <a className="underline" href={`https://x.com/FixtureSharkHQ/status/${p.x_post_id}`} target="_blank" rel="noreferrer">view</a>
            <div className="text-ink-700 mt-0.5">{p.text}</div>
          </li>
        ))}
      </ul>
    </div>
  );
  const run = report?.last_run;
  return (
    <section className="space-y-2" data-testid="social-engagement">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-semibold text-ink-900">Engagement</h2>
        <Btn disabled={busy} onClick={readNow}>Read from X now</Btn>
      </div>
      <p className="text-xs text-ink-500">
        Read from X every Monday at 07:40 (posts from the last 30 days). Posts under 24 hours old at the last read are left out
        ({report?.fresh_posts ?? 0} now). Engagements: likes, replies, reposts, quotes, bookmarks and link clicks; a thread counts once,
        with the views of its first post.
        {run && <> Last read {when(run.started_at)}: {run.posts_read} post(s), {usd(run.estimated_cost_usd)}{run.error ? `, error: ${run.error}` : ''}.</>}
      </p>
      {msg && <p className="text-xs text-ink-700">{msg}</p>}
      <SortableTable columns={typeCols} rows={report?.types ?? []} rowKey={(r) => r.post_type} empty="No reads yet." />
      <div className="grid gap-3 md:grid-cols-2">
        {postList('Best five (engagement rate, 20+ views)', report?.top ?? [])}
        {postList('Worst five', report?.bottom ?? [])}
      </div>
    </section>
  );
}

export default function SocialPage() {
  useDocumentHead({ title: 'Social publishing' });
  const isAdmin = useAuthOptional()?.isAdmin ?? false;
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState<Awaited<ReturnType<typeof getSocialState>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Default tab: what's going out if anything is queued, else what needs review.
  const defaultTab = (state?.candidates ?? []).some(queued) ? 'queue' : 'review';
  const filter = (FILTERS.find((f) => f.key === params.get('show')) ?? FILTERS.find((f) => f.key === defaultTab)!).key;
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
      {s.breaker_tripped_at && (
        <div className="flex flex-wrap items-center gap-2 text-sm rounded p-3 bg-loss-600/10 text-loss-700" role="alert">
          <span><strong>Automatic posting stopped</strong> {when(s.breaker_tripped_at)}: {s.breaker_reason}. Check @FixtureSharkHQ, then reset.</span>
          <Btn disabled={busy} onClick={() => doAct(() => updateSettings({ reset_breaker: true }))}>Reset and resume</Btn>
        </div>
      )}

      <section className="border border-chalk-300 rounded-lg bg-white p-3 space-y-3" data-testid="social-controls">
        <div className="flex flex-wrap gap-x-6 gap-y-2 items-center">
          <Toggle label="Kill switch" on={s.kill_switch} disabled={busy} onChange={(v) => doAct(() => updateSettings({ kill_switch: v }))}
            confirmOff="Turn the kill switch off? Live posting will still need live publishing on and a connected account." />
          <Toggle label="Live publishing" on={s.live_enabled} disabled={busy} onChange={(v) => doAct(() => updateSettings({ live_enabled: v }))}
            confirmOn="Enable live publishing? Posts still go only when you press Publish on an approved candidate." />
          <Toggle label="Automatic posting" on={s.auto_publish_enabled} disabled={busy} onChange={(v) => doAct(() => updateSettings({ auto_publish_enabled: v }))}
            confirmOn="Turn automatic posting on? Queued posts go out after their hold time unless you hold them." />
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

      <Engagement />

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
