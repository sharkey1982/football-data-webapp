// ============================================================================
// src/lib/emailAdminApi.ts
//
// /admin/email: list counts, recent sends and failures, and "send test to
// admin". Both RPCs check is_admin() in the database
// (supabase/migrations/20261101140000_fpl_weekly_email.sql).
// ============================================================================

import { supabase } from './supabase';

// Not in the generated types until the next schema snapshot (same pattern as siteTrafficApi.ts).
const rpc = (supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
}).rpc.bind(supabase);

export type EmailSend = {
  send_id: number; kind: 'weekly' | 'test'; fpl_event_id: number | null; subject: string | null;
  status: 'sending' | 'sent' | 'partial' | 'failed' | 'skipped'; attempts: number; recipients: number; football: number;
  sent: number; failed: number; note: string | null; started_at: string; finished_at: string | null;
};
export type EmailFailure = { failure_id: number; send_id: number | null; kind: string; http_status: number | null; error: string | null; recipients: number; created_at: string };
export type EmailAdmin = {
  counts: { pending: number; confirmed: number; unsubscribed: number; football: number; confirmed_7d: number; unsubscribed_7d: number };
  signups_24h: Record<string, number> | null;
  quota: { today: number; month: number; daily_limit: number; monthly_limit: number; sending_enabled: boolean };
  next: { gw?: number; deadline?: string; due_at?: string; due?: boolean; sent?: { status: string; sent: number; failed: number } | null };
  admin_address_set: boolean;
  sends: EmailSend[];
  failures: EmailFailure[];
};

export async function getEmailAdmin(): Promise<EmailAdmin> {
  const { data, error } = await rpc('get_email_admin');
  if (error) throw error;
  return data as EmailAdmin;
}

/** The next issue to the admin address; an FPL ID and club add "Your team". */
export async function sendTestEmail(fplId: number | null = null, clubId: number | null = null): Promise<void> {
  const { error } = await rpc('email_admin_send_test', { p_fpl_id: fplId, p_club: clubId });
  if (error) throw error;
}

// ---------------------------------------------------------------- daily site update
// The admin end-of-day email (supabase/migrations/20261102190000_admin_daily_digest.sql):
// public.admin_digest_get(p_day) previews it, public.admin_digest_send_now()
// emails today's so far to the admin (a preview: the 20:00 send still goes).

export type DigestSection = { key: string; title: string; link: string; lines: string[] };
export type DigestSend = {
  send_id: number; day: string; mode: 'scheduled' | 'preview'; status: 'queued' | 'sent' | 'failed';
  subject: string | null; note: string | null; queued_at: string; finished_at: string | null;
};
export type Digest = {
  day: string; from: string; to: string; subject: string; headline: string;
  sections: DigestSection[];
  sends: DigestSend[];
};

export async function getDigest(day: string | null = null): Promise<Digest> {
  const { data, error } = await rpc('admin_digest_get', { p_day: day });
  if (error) throw error;
  return data as Digest;
}

export async function sendDigestNow(): Promise<void> {
  const { error } = await rpc('admin_digest_send_now');
  if (error) throw error;
}
