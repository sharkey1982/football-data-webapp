// ============================================================================
// supabase/functions/email-weekly/index.ts
//
// Sends "FixtureShark FPL weekly" (supabase/migrations/20261101140000_fpl_weekly_email.sql).
//   { mode: "weekly" }  the issue for the next gameweek, to every confirmed
//                       subscriber; only when due, and once per gameweek
//                       (public.email_begin_send)
//   { mode: "test", fpl_id?, club_id?, watchlist? }  the same issue to the admin address
//                       only (with "Your team" when an FPL ID or club is given)
// Called only by the database (private.email_invoke: the hourly
// email-weekly-tick, or "Send test to admin" on /admin/email) with the social
// worker token in x-social-token.
//
// Resend: individual emails through the batch endpoint (100 per call); the key
// is sending-only, so no Audiences or Broadcasts. Each email carries
// List-Unsubscribe and List-Unsubscribe-Post (RFC 8058). Free-plan limits are
// counted in the database (email_quota_take); a limit or rate error from
// Resend stops the send cleanly. Failures are logged without addresses and
// email the admin (social-notify, kind email_failed).
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildWeeklyEmail, FROM, weeklySubject, type Personal, type WeeklyContent } from "./build.ts";

const BATCH = 100;

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: ok } = await sb.rpc("social_worker_ok", { p_token: req.headers.get("x-social-token") ?? "" });
  if (ok !== true) return new Response("forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === "weekly" ? "weekly" : body?.mode === "test" ? "test" : null;
  if (!mode) return Response.json({ ok: false, reason: "mode must be weekly or test" }, { status: 400 });

  const { data: issue, error: e1 } = await sb.rpc("email_weekly_issue");
  if (e1) return Response.json({ ok: false, reason: `issue: ${e1.message}` }, { status: 500 });
  if (!issue?.gw) return Response.json({ ok: false, reason: "no upcoming FPL gameweek" });
  if (mode === "weekly" && issue.due !== true) return Response.json({ ok: false, reason: "not due", due_at: issue.due_at });

  const { data: content, error: e2 } = await sb.rpc("email_weekly_content", { p_season: issue.season_id, p_gw: issue.gw });
  if (e2 || !content) return Response.json({ ok: false, reason: `content: ${e2?.message ?? "empty"}` }, { status: 500 });
  const c = content as WeeklyContent;

  const { data: begun, error: e3 } = await sb.rpc("email_begin_send", {
    p_kind: mode, p_season: issue.season_id, p_gw: issue.gw, p_subject: weeklySubject(c, mode === "test"),
  });
  if (e3) return Response.json({ ok: false, reason: `begin: ${e3.message}` }, { status: 500 });
  if (begun?.skip) return Response.json({ ok: false, reason: begun.skip });
  const sendId: number = begun.send_id;
  const idemBase = begun.issue_key ?? `test-${sendId}`;

  const finish = async (recipients: number, football: number, sent: number, failed: number, note: string | null) => {
    const { error } = await sb.rpc("email_finish_send", {
      p_send_id: sendId, p_recipients: recipients, p_football: football, p_sent: sent, p_failed: failed, p_note: note,
    });
    if (error) console.error("email_finish_send failed", error.message);
  };
  const logFailure = async (status: number | null, error: string, n: number) => {
    const { error: e } = await sb.rpc("email_log_failure", {
      p_send_id: sendId, p_kind: mode, p_http_status: status, p_error: error, p_recipients: n,
    });
    if (e) console.error("email_log_failure failed", e.message);
  };

  const key = Deno.env.get("RESEND_API_KEY");
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const { data: rows, error: e4 } = await sb.rpc("email_recipients", {
    p_send_id: sendId, p_test_fpl_id: mode === "test" ? num(body?.fpl_id) : null, p_test_club: mode === "test" ? num(body?.club_id) : null,
    p_test_watch: mode === "test" && Array.isArray(body?.watchlist) ? body.watchlist.filter((x: unknown) => Number.isInteger(x)).slice(0, 20) : [],
  });
  if (e4) {
    await logFailure(null, `recipients: ${e4.message}`, 0);
    await finish(0, 0, 0, 1, `recipients: ${e4.message}`);
    return Response.json({ ok: false, reason: e4.message }, { status: 500 });
  }
  type Row = { email: string; football: boolean; token: string | null; fpl_id: number | null; club_id: number | null; watchlist: number[] | null };
  const list = (rows ?? []) as Row[];

  // "Your team" (optional): once per FPL ID + club + watchlist in this send. Any failure
  // just leaves the section out.
  const personalCache = new Map<string, Personal | null>();
  const personalFor = async (r: Row): Promise<Personal | null> => {
    const watch = r.watchlist ?? [];
    if (r.fpl_id == null && r.club_id == null && watch.length === 0) return null;
    const k = `${r.fpl_id ?? ""}:${r.club_id ?? ""}:${watch.join(",")}`;
    if (!personalCache.has(k)) {
      const { data, error } = await sb.rpc("email_personal", {
        p_season: issue.season_id, p_gw: issue.gw, p_fpl_id: r.fpl_id, p_club: r.club_id, p_watch: watch,
      });
      if (error) console.error("email_personal failed", error.message);
      personalCache.set(k, error ? null : (data as Personal));
    }
    return personalCache.get(k) ?? null;
  };
  const football = list.filter((r) => r.football).length;
  if (list.length === 0) {
    await finish(0, 0, 0, 0, mode === "test" ? "no admin address" : "no confirmed subscribers");
    return Response.json({ ok: true, send_id: sendId, recipients: 0 });
  }
  if (!key) {
    await logFailure(null, "RESEND_API_KEY not set", list.length);
    await finish(list.length, football, 0, list.length, "RESEND_API_KEY not set");
    return Response.json({ ok: false, reason: "RESEND_API_KEY not set" });
  }

  // Free-plan allowance (as far as we know ~100/day, ~3,000/month).
  const { data: allowed, error: e5 } = await sb.rpc("email_quota_take", { p_n: list.length });
  const n = e5 ? 0 : Number(allowed ?? 0);
  let failed = 0;
  let sent = 0;
  const notes: string[] = [];
  const ids: string[] = [];
  if (n < list.length) {
    failed += list.length - n;
    notes.push(`daily/monthly allowance: ${list.length - n} not sent`);
    await logFailure(null, e5 ? `quota check: ${e5.message}` : "daily or monthly allowance reached", list.length - n);
  }

  for (let i = 0; i < n; i += BATCH) {
    const chunk = list.slice(i, Math.min(i + BATCH, n));
    const payload = [];
    for (const r of chunk) {
      const m = buildWeeklyEmail(c, { football: r.football, token: r.token, personal: await personalFor(r) }, { test: mode === "test" });
      payload.push({ from: FROM, to: [r.email], subject: m.subject, html: m.html, text: m.text, headers: m.headers });
    }
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": `${idemBase}-${i / BATCH}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    }).catch((e) => ({ ok: false, status: 0, text: () => Promise.resolve(String(e)) }) as unknown as Response);
    const raw = await res.text();
    if (!res.ok) {
      const rest = n - i;
      failed += rest;
      notes.push(`Resend ${res.status}: stopped with ${rest} not sent`);
      await logFailure(res.status, raw.slice(0, 400), rest);
      break; // a limit, rate or auth error: stop cleanly rather than hammer it
    }
    sent += chunk.length;
    try {
      for (const d of JSON.parse(raw)?.data ?? []) if (d?.id) ids.push(d.id);
    } catch { /* ids are only for the log */ }
    if (i + BATCH < n) await new Promise((r) => setTimeout(r, 600)); // Resend: 2 requests a second
  }

  if (mode === "test" && ids.length) notes.push(`Resend id ${ids[0]}`);
  await finish(list.length, football, sent, failed, notes.join("; ") || null);
  return Response.json({ ok: failed === 0, send_id: sendId, recipients: list.length, sent, failed, ids: ids.slice(0, 3) });
});
