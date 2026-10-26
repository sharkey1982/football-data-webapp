// ============================================================================
// supabase/functions/social-notify/index.ts
//
// Emails Chris about automatic X posting (Phase 4, docs/social-publishing.md):
//   { kind: "queued", candidate_id }   a post's hold has started: what it says,
//                                      when it goes, and where to press Hold
//   { kind: "breaker", reason }        automatic posting has stopped itself
// Called only by the database (private.social_notify, pg_net) with the worker
// token in x-social-token. Sends through Resend.
//
// Secrets: RESEND_API_KEY (required), SOCIAL_NOTIFY_FROM (optional sender,
// default "FixtureShark <alerts@mail.fixtureshark.com>"; falls back to
// alerts@schoolcamp.uk while that domain isn't verified in Resend). The recipient is social_settings.notify_email, else the admin's
// address in app_users.
// Without RESEND_API_KEY nothing is sent and the audit log says so; posting
// is not affected.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_URL = "https://fixtureshark.com/admin/social?show=queue";
const LABEL: Record<string, string> = {
  fpl_price_changes: "FPL price changes",
  fpl_captaincy: "FPL captaincy",
  gameweek_thread: "Gameweek thread",
  fpl_availability: "FPL availability",
  fpl_market: "FPL market watch",
  fpl_week_changes: "FPL week's changes",
  gameweek_outlook: "The week ahead",
  fixture_moved: "Fixture moved",
  match_predictions: "Match-day predictions",
  daily_market: "Daily market view",
  lineup_vs_model: "Line-ups v our model",
  team_news: "Team news",
  fpl_price_watch: "FPL price watch",
  quiz: "Quiz question",
  quiz_answer: "Quiz answer",
  fact: "Did you know",
  prediction_accuracy: "Prediction accuracy",
  team_xg_change: "Team xG change",
  historical_insight: "Historical insight",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const ukTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: ok } = await sb.rpc("social_worker_ok", { p_token: req.headers.get("x-social-token") ?? "" });
  if (ok !== true) return new Response("forbidden", { status: 403 });

  const body = await req.json().catch(() => ({}));
  const audit = (action: string, detail: Record<string, unknown>) =>
    sb.from("social_audit_log").insert({ action, candidate_id: body?.candidate_id ?? null, detail });

  const { data: s } = await sb.from("social_settings").select("notify_email, hold_minutes").maybeSingle();
  // Recipient: the setting, else the admin's own address (app_users).
  let to: string | null = s?.notify_email ?? null;
  if (!to) {
    const { data: a } = await sb.from("app_users").select("email").eq("is_admin", true).not("email", "is", null)
      .order("created_at").limit(1).maybeSingle();
    to = a?.email ?? null;
  }
  const key = Deno.env.get("RESEND_API_KEY");
  if (!to || !key) {
    await audit("notify_skipped", { reason: !key ? "RESEND_API_KEY not set" : "no notify_email", kind: body?.kind });
    return Response.json({ ok: false, reason: "not configured" });
  }

  let subject: string, html: string;
  if (body?.kind === "queued") {
    const { data: c } = await sb.from("social_post_candidates")
      .select("candidate_id, post_type, text, thread, hold_until").eq("candidate_id", body.candidate_id).maybeSingle();
    if (!c) return Response.json({ ok: false, reason: "candidate not found" });
    const posts: string[] = Array.isArray(c.thread) && c.thread.length ? c.thread : [c.text];
    const at = ukTime(c.hold_until);
    subject = `X post at ${at}: ${LABEL[c.post_type] ?? c.post_type}`;
    html = `<p>This goes to <b>@FixtureSharkHQ</b> automatically at <b>${esc(at)}</b> (UK) unless you press <b>Hold</b>:
      <a href="${ADMIN_URL}">${ADMIN_URL}</a></p>` +
      posts.map((p, i) => `<p style="white-space:pre-wrap;border-left:3px solid #1b4332;padding:4px 10px;margin:8px 0">` +
                          `${posts.length > 1 ? `<b>${i + 1}/${posts.length}</b> ` : ""}${esc(p)}</p>`).join("") +
      `<p style="color:#666;font-size:12px">Post #${c.candidate_id}. It is checked against the data again just before it goes; if anything changed, it won't post.</p>`;
  } else if (body?.kind === "breaker") {
    subject = "Automatic X posting has stopped";
    html = `<p>Automatic posting to @FixtureSharkHQ switched itself off:</p><p><b>${esc(String(body.reason ?? "unknown"))}</b></p>
      <p>Check <a href="https://x.com/FixtureSharkHQ">@FixtureSharkHQ</a>, then reset it on <a href="${ADMIN_URL}">/admin/social</a>.</p>`;
  } else {
    return Response.json({ ok: false, reason: "unknown kind" });
  }

  // Sender: mail.fixtureshark.com once it is verified in Resend; until then
  // Resend refuses it (403/422) and the verified schoolcamp.uk sender is used.
  const send = (from: string) => fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
    signal: AbortSignal.timeout(15_000),
  }).catch((e) => ({ ok: false, status: 0, text: () => Promise.resolve(String(e)) }) as unknown as Response);
  let r = await send(Deno.env.get("SOCIAL_NOTIFY_FROM") ?? "FixtureShark <alerts@mail.fixtureshark.com>");
  if (!r.ok && (r.status === 403 || r.status === 422)) r = await send("FixtureShark alerts <alerts@schoolcamp.uk>");
  if (!r.ok) {
    await audit("notify_failed", { status: r.status, error: (await r.text()).slice(0, 300), kind: body?.kind });
    return Response.json({ ok: false, status: r.status });
  }
  await audit("notified", { kind: body?.kind, subject });
  return Response.json({ ok: true });
});
