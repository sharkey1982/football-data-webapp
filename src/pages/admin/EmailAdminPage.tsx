// ============================================================================
// src/pages/admin/EmailAdminPage.tsx   (/admin/email)
//
// The FPL weekly email: subscriber counts, the next issue, the last sends and
// failures (no addresses anywhere), the Resend allowance, and "Send test to
// admin" (the next issue to the admin address only; the admin's own FPL ID
// and club from this browser's preferences add the "Your team" section).
// Data: public.get_email_admin / email_admin_send_test, both is_admin() only.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { useDocumentHead } from '../../hooks/useDocumentHead';
import { useAuthOptional } from '../../lib/auth';
import SortableTable, { type Column } from '../../components/SortableTable';
import { getEmailAdmin, sendTestEmail, type EmailAdmin, type EmailFailure, type EmailSend } from '../../lib/emailAdminApi';
import { readPrefs } from '../../lib/myPrefs';

const when = (t: string | null | undefined) =>
  t ? new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '—';

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="border border-chalk-300 rounded-lg bg-white p-3">
      <div className="text-[11px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="text-2xl font-semibold text-ink-900 tabular-nums">{value}</div>
      {note && <div className="text-[11px] text-ink-500 mt-0.5">{note}</div>}
    </div>
  );
}

export default function EmailAdminPage() {
  useDocumentHead({ title: 'FPL weekly email', description: 'Admin: the FPL weekly email list and sends.' });
  const isAdmin = useAuthOptional()?.isAdmin ?? false;
  const [data, setData] = useState<EmailAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const load = useCallback(() => {
    getEmailAdmin().then(setData).catch((e) => setError(e?.message ?? String(e)));
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  async function test() {
    setTestState('sending');
    try {
      const p = readPrefs();
      const fpl = /^\d{1,8}$/.test(p.fplId) ? Number(p.fplId) : null;
      await sendTestEmail(fpl, p.club?.teamId ?? null);
      setTestState('sent');
      window.setTimeout(load, 8000);
    } catch {
      setTestState('error');
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-2">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">FPL weekly email</h1>
        <p className="text-sm text-ink-700">This page is for admins.</p>
      </div>
    );
  }

  const sendCols: Column<EmailSend>[] = [
    { key: 'w', label: 'Started', render: (r) => when(r.started_at), sortValue: (r) => r.started_at, descFirst: true },
    { key: 'k', label: 'Kind', render: (r) => r.kind, sortValue: (r) => r.kind },
    { key: 'gw', label: 'GW', align: 'right', render: (r) => r.fpl_event_id ?? '—', sortValue: (r) => r.fpl_event_id },
    { key: 's', label: 'Status', render: (r) => r.status, sortValue: (r) => r.status },
    { key: 'r', label: 'Recipients', align: 'right', render: (r) => r.recipients, sortValue: (r) => r.recipients, descFirst: true },
    { key: 'ok', label: 'Sent', align: 'right', render: (r) => r.sent, sortValue: (r) => r.sent, descFirst: true },
    { key: 'f', label: 'Failed', align: 'right', render: (r) => r.failed, sortValue: (r) => r.failed, descFirst: true },
    { key: 'n', label: 'Note', className: 'hidden sm:table-cell', render: (r) => r.note ?? '', sortValue: (r) => r.note },
  ];
  const failCols: Column<EmailFailure>[] = [
    { key: 'w', label: 'When', render: (r) => when(r.created_at), sortValue: (r) => r.created_at, descFirst: true },
    { key: 'k', label: 'Kind', render: (r) => r.kind, sortValue: (r) => r.kind },
    { key: 'h', label: 'HTTP', align: 'right', render: (r) => r.http_status ?? '—', sortValue: (r) => r.http_status },
    { key: 'n', label: 'Emails', align: 'right', render: (r) => r.recipients, sortValue: (r) => r.recipients, descFirst: true },
    { key: 'e', label: 'Error', render: (r) => <span className="break-all">{r.error}</span>, sortValue: (r) => r.error },
  ];

  const c = data?.counts;
  const next = data?.next;
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display uppercase tracking-wide text-2xl text-ink-900">FPL weekly email</h1>
        <p className="text-sm text-ink-700">Sent before each FPL deadline: Thursday 18:00 UK for a Friday or Saturday deadline, otherwise 36 hours before.</p>
      </header>
      {error && <p role="alert" className="text-sm text-loss-700">Couldn&rsquo;t load: {error}</p>}
      {data && c && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Tile label="Confirmed" value={c.confirmed} note={`+${c.confirmed_7d} in 7 days`} />
            <Tile label="Football section" value={c.football} note="of the confirmed" />
            <Tile label="Pending" value={c.pending} note="expire after 7 days" />
            <Tile label="Unsubscribed" value={c.unsubscribed} note={`${c.unsubscribed_7d} in 7 days; deleted within 30`} />
            <Tile label="Sent today" value={`${data.quota.today}/${data.quota.daily_limit}`} note={`${data.quota.month}/${data.quota.monthly_limit} this month`} />
          </div>
          {c.confirmed >= data.quota.daily_limit * 0.8 && (
            <p role="alert" className="text-sm text-loss-700">
              The list is close to the daily sending allowance ({data.quota.daily_limit}). A weekly send stops at the allowance; consider a paid Resend plan.
            </p>
          )}
          <section className="space-y-2">
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Next issue</h2>
            {next?.gw ? (
              <p className="text-sm text-ink-700">
                GW{next.gw}: deadline {when(next.deadline)}; sends from {when(next.due_at)} (UK).{' '}
                {next.sent ? `Already sent: ${next.sent.status}, ${next.sent.sent} sent, ${next.sent.failed} failed.` : 'Not sent yet.'}
              </p>
            ) : <p className="text-sm text-ink-700">No upcoming gameweek.</p>}
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={test} disabled={testState === 'sending' || !data.admin_address_set}
                className="rounded bg-pitch-800 px-4 py-2 font-medium text-chalk-100 hover:bg-pitch-700 disabled:opacity-60">
                Send test to admin
              </button>
              {testState === 'sent' && <span role="status" className="text-sm text-ink-900">Asked for a test. It appears in the sends below within a minute.</span>}
              {testState === 'error' && <span role="alert" className="text-sm text-loss-700">That didn&rsquo;t work. Try again in a couple of minutes.</span>}
              {!data.admin_address_set && <span className="text-sm text-loss-700">No admin address set.</span>}
            </div>
            <p className="text-xs text-ink-500">Your FPL ID and club from My FixtureShark on this browser, if set, are used for the test&rsquo;s &ldquo;Your team&rdquo; section.</p>
          </section>
          <section className="space-y-2">
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Last sends</h2>
            {data.sends.length ? <SortableTable rows={data.sends} columns={sendCols} rowKey={(r) => String(r.send_id)} /> : <p className="text-sm text-ink-700">None yet.</p>}
          </section>
          <section className="space-y-2">
            <h2 className="font-display uppercase tracking-wide text-lg text-ink-900">Failures</h2>
            {data.failures.length ? <SortableTable rows={data.failures} columns={failCols} rowKey={(r) => String(r.failure_id)} /> : <p className="text-sm text-ink-700">None.</p>}
          </section>
          {data.signups_24h && (
            <p className="text-xs text-ink-500">
              Sign-up attempts in 24 hours: {Object.entries(data.signups_24h).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(', ')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
