// ============================================================================
// src/components/admin/DailyDigestPanel.tsx   (on /admin/email)
//
// The admin end-of-day site update: a preview of today's email so far, the
// last sends, and "Send today's digest now" (a preview to the admin address;
// the scheduled 19:25 UK send still goes). Data: public.admin_digest_get /
// admin_digest_send_now, both is_admin() only.
// ============================================================================

import { useCallback, useEffect, useState } from 'react';
import { getDigest, sendDigestNow, type Digest } from '../../lib/emailAdminApi';

const when = (t: string | null | undefined) =>
  t ? new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '—';

export default function DailyDigestPanel() {
  const [digest, setDigest] = useState<Digest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const load = useCallback(() => {
    getDigest().then(setDigest).catch((e) => setError(e?.message ?? String(e)));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function send() {
    setState('sending');
    try {
      await sendDigestNow();
      setState('sent');
      window.setTimeout(load, 8000);
    } catch {
      setState('error');
    }
  }

  return (
    <section className="space-y-2" aria-labelledby="daily-digest">
      <h2 id="daily-digest" className="font-display uppercase tracking-wide text-lg text-ink-900">Daily site update</h2>
      <p className="text-sm text-ink-700">Emailed to you every day at 19:25 UK, covering the day from midnight.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={send} disabled={state === 'sending'}
          className="rounded bg-pitch-800 px-4 py-2 font-medium text-chalk-100 hover:bg-pitch-700 disabled:opacity-60">
          Send today&rsquo;s digest now
        </button>
        {state === 'sent' && <span role="status" className="text-sm text-ink-900">Sent as a preview. The 19:25 email still goes.</span>}
        {state === 'error' && <span role="alert" className="text-sm text-loss-700">That didn&rsquo;t work. Try again in a couple of minutes.</span>}
      </div>
      {error && <p role="alert" className="text-sm text-loss-700">Couldn&rsquo;t load the preview: {error}</p>}
      {digest && (
        <div className="border border-chalk-300 rounded-lg bg-white p-3 space-y-3 text-sm text-ink-900">
          <p className="font-semibold">{digest.subject}</p>
          <p>{digest.headline}</p>
          {digest.sections.map((s) => (
            <div key={s.key}>
              <h3 className="font-semibold text-pitch-800">{s.title}</h3>
              {s.lines.flatMap((l) => l.split('\n')).map((l, i) => <div key={i} className="break-words">{l}</div>)}
              <a href={s.link} className="text-xs underline text-ink-700 break-all">{s.link.replace(/^https:\/\//, '')}</a>
            </div>
          ))}
        </div>
      )}
      {digest && digest.sends.length > 0 && (
        <ul className="text-xs text-ink-500 space-y-0.5">
          {digest.sends.map((s) => (
            <li key={s.send_id}>{when(s.queued_at)}: {s.mode}, {s.status}{s.note ? ` (${s.note})` : ''}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
