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
