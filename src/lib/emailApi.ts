// ============================================================================
// src/lib/emailApi.ts
//
// The FPL weekly email list: sign-up, confirm, unsubscribe and manage, all
// through the email-list edge function (supabase/functions/email-list). The
// list itself is in the private schema and never reachable from the browser.
// Admin calls: emailAdminApi.ts.
// ============================================================================

// The project URL is public (it is in every page's bundle); the fallback keeps
// the static form's action absolute even if the env var is missing at build.
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://ppzfmpbnojyjeblelsuz.supabase.co';
export const EMAIL_LIST_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/email-list`;

export type SubscribeState = 'check' | 'invalid' | 'error';
export type ConfirmState = 'confirmed' | 'already' | 'invalid' | 'error';
export type UnsubscribeState = 'unsubscribed' | 'already' | 'invalid' | 'error';
export type ManageResult = {
  state: 'ok' | 'invalid' | 'pending' | 'unsubscribed' | 'error';
  football?: boolean;
  fpl_id?: number | null;
  club?: { id: number; name: string } | null;
  watchlist?: WatchPlayer[];
};
export type WatchPlayer = { id: number; name: string; team: string | null; pos: string | null; price: number };
export const MAX_WATCHLIST = 20;
/** Optional personalisation: an FPL entry ID and a club (public.teams.team_id). */
export type Personalise = { fplId: number | null; clubId: number | null };
export type ManageChanges = { football?: boolean; fpl_id?: number | null; club_id?: number | null; watchlist?: number[] };

/** A valid FPL entry ID from what was typed, else null. */
export function parseFplId(v: string): number | null {
  const t = v.trim();
  if (!/^\d{1,8}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 ? n : null;
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(EMAIL_LIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as T | null;
  if (!data) throw new Error(`email-list ${res.status}`);
  return data;
}

export async function subscribe(email: string, football: boolean, website: string, me: Personalise = { fplId: null, clubId: null }): Promise<SubscribeState> {
  try {
    const r = await post<{ state?: string }>({ action: 'subscribe', email, football, website, fpl_id: me.fplId, club_id: me.clubId });
    return r.state === 'check' || r.state === 'invalid' ? r.state : 'error';
  } catch {
    return 'error';
  }
}

export async function confirmEmail(token: string): Promise<{ state: ConfirmState; manage?: string }> {
  try {
    const r = await post<{ state?: string; manage?: string }>({ action: 'confirm', token });
    return { state: r.state === 'confirmed' || r.state === 'already' || r.state === 'invalid' ? r.state : 'error', manage: r.manage };
  } catch {
    return { state: 'error' };
  }
}

export async function unsubscribeEmail(token: string): Promise<UnsubscribeState> {
  try {
    const r = await post<{ state?: string }>({ action: 'unsubscribe', token });
    return r.state === 'unsubscribed' || r.state === 'already' || r.state === 'invalid' ? r.state : 'error';
  } catch {
    return 'error';
  }
}

export async function manageEmail(token: string, changes?: ManageChanges): Promise<ManageResult> {
  try {
    const r = await post<ManageResult>({ action: 'manage', token, ...(changes ? { changes } : {}) });
    return ['ok', 'invalid', 'pending', 'unsubscribed'].includes(r.state) ? r : { state: 'error' };
  } catch {
    return { state: 'error' };
  }
}

/** This season's players by name, for the watchlist (public.email_player_search). */
export async function searchPlayers(q: string): Promise<WatchPlayer[]> {
  if (q.trim().length < 2) return [];
  const { supabase } = await import('./supabase');
  const rpc = (supabase as unknown as {
    rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
  }).rpc.bind(supabase);
  const { data, error } = await rpc('email_player_search', { p_q: q.trim() });
  if (error) throw error;
  return ((data ?? []) as WatchPlayer[]).map((p) => ({ ...p, price: Number(p.price) }));
}
