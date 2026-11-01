// ============================================================================
// supabase/functions/email-list/index.ts
//
// The public side of the FPL weekly email list (deployed with verify_jwt off;
// it does its own checks). Everything goes through service_role-only database
// functions (supabase/migrations/20261101140000_fpl_weekly_email.sql).
//
//   POST JSON {action:"subscribe", email, football, fpl_id?, club_id?, website}
//   POST form (the static HTML form, no JavaScript): same fields, answered
//        with a 303 to /email/confirm?state=check|invalid
//        -> always "check your email": the answer never says whether an
//           address is already on the list. A confirmed address gets an
//           "already subscribed" email with its manage link instead.
//           website is a honeypot: filled in = pretend, send nothing.
//   POST JSON {action:"confirm", token}        /email/confirm
//   POST JSON {action:"unsubscribe", token}    /email/unsubscribe
//   POST JSON {action:"manage", token, changes?}  /email/manage
//        changes: {football?: boolean, fpl_id?: number|null, club_id?: number|null, watchlist?: number[]}
//   POST ?a=one-click&t=<token>, body "List-Unsubscribe=One-Click"
//        RFC 8058 one-click unsubscribe from the mail client.
//
// Rate limits (per salted IP hash, per address, overall) live in
// public.email_signup. Confirmation emails count against the same Resend
// allowance as the weekly send (email_quota_take).
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://fixtureshark.com";
const FROM = "FixtureShark <weekly@mail.fixtureshark.com>";

const allowedOrigin = (o: string | null) =>
  o && (/^https:\/\/(www\.)?fixtureshark\.com$/.test(o) || /^https:\/\/[a-z0-9-]+--[a-z0-9-]+\.netlify\.app$/.test(o) ||
        /^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) ? o : SITE;
const cors = (req: Request) => ({
  "Access-Control-Allow-Origin": allowedOrigin(req.headers.get("origin")),
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Vary": "Origin",
});

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function message(kind: "confirm" | "already", token: string, football: boolean) {
  const shell = (body: string) =>
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"></head>` +
    `<body style="margin:0;padding:0;background:#ffffff"><div style="max-width:560px;margin:0 auto;padding:20px 16px;` +
    `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">` +
    body + `<p style="color:#555555;font-size:13px">FixtureShark · <a href="${SITE}/privacy" style="color:#1b4332">Privacy</a></p></div></body></html>`;
  const btn = (href: string, t: string) =>
    `<p><a href="${esc(href)}" style="display:inline-block;background:#1b4332;color:#ffffff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600">${esc(t)}</a></p>`;
  if (kind === "confirm") {
    const url = `${SITE}/email/confirm?t=${token}`;
    return {
      subject: "Confirm your FixtureShark FPL weekly email",
      html: shell(`<p>Please confirm you want <b>FixtureShark FPL weekly</b>: one email before each FPL deadline with a captain pick, ` +
        `who to think about changing, minutes risks and price moves${football ? ", plus where our model and the market disagree on the weekend's games" : ""}.</p>` +
        btn(url, "Confirm my email") +
        `<p style="color:#555555;font-size:13px">Or paste this link into your browser: ${esc(url)}</p>` +
        `<p style="color:#555555;font-size:13px">Didn't ask for this? Ignore it and you won't hear from us. The link stops working after 7 days.</p>`),
      text: `Please confirm you want FixtureShark FPL weekly: one email before each FPL deadline.\n\nConfirm: ${url}\n\n` +
        `Didn't ask for this? Ignore it and you won't hear from us. The link stops working after 7 days.\n\nPrivacy: ${SITE}/privacy`,
    };
  }
  const manage = `${SITE}/email/manage?t=${token}`;
  const unsub = `${SITE}/email/unsubscribe?t=${token}`;
  return {
    subject: "You're already getting FixtureShark FPL weekly",
    html: shell(`<p>Someone (probably you) asked to sign this address up for <b>FixtureShark FPL weekly</b>. It's already on the list, so nothing has changed.</p>` +
      btn(manage, "Change what you get") +
      `<p style="color:#555555;font-size:13px">Don't want it any more? <a href="${esc(unsub)}" style="color:#1b4332">Unsubscribe</a>.</p>`),
    text: `This address is already getting FixtureShark FPL weekly, so nothing has changed.\n\nChange what you get: ${manage}\nUnsubscribe: ${unsub}\n\nPrivacy: ${SITE}/privacy`,
  };
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
  if (req.method !== "POST") return new Response("POST only", { status: 405, headers: h });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const url = new URL(req.url);
  const json = (b: unknown, status = 200) => Response.json(b, { status, headers: h });

  // RFC 8058 one-click unsubscribe (mail clients POST this; no CORS involved).
  if (url.searchParams.get("a") === "one-click") {
    const { error } = await sb.rpc("email_unsubscribe", { p_token: url.searchParams.get("t") ?? "" });
    if (error) console.error("one-click unsubscribe failed", error.message);
    return new Response(error ? "error" : "unsubscribed", { status: error ? 500 : 200 });
  }

  const ctype = req.headers.get("content-type") ?? "";
  const isForm = ctype.includes("application/x-www-form-urlencoded") || ctype.includes("multipart/form-data");
  let b: Record<string, unknown> = {};
  if (isForm) {
    const f = await req.formData().catch(() => null);
    if (f) for (const [k, v] of f.entries()) b[k] = typeof v === "string" ? v : "";
    b.action = b.action ?? "subscribe";
  } else {
    b = await req.json().catch(() => ({}));
  }
  const action = String(b.action ?? "");
  const token = String(b.token ?? "");

  if (action === "subscribe") {
    const football = b.football === true || b.football === "1" || b.football === "on" || b.football === "true";
    const done = (state: "check" | "invalid") =>
      isForm ? new Response(null, { status: 303, headers: { ...h, Location: `${SITE}/email/confirm?state=${state}` } })
             : json({ ok: state === "check", state });
    if (String(b.website ?? "").trim() !== "") return done("check"); // honeypot
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || (req.headers.get("cf-connecting-ip") ?? "");
    const idOf = (v: unknown) => { const n = Number(String(v ?? "").trim()); return Number.isInteger(n) && n > 0 && n <= 99999999 ? n : null; };
    const { data: r, error } = await sb.rpc("email_signup", {
      p_email: String(b.email ?? ""), p_football: football, p_ip: ip, p_fpl_id: idOf(b.fpl_id), p_club: idOf(b.club_id),
    });
    if (error) {
      console.error("email_signup failed", error.message);
      return isForm ? done("check") : json({ ok: false, state: "error" }, 500);
    }
    if (r?.action === "invalid") return done("invalid");
    if (r?.action === "confirm" || r?.action === "already") {
      const key = Deno.env.get("RESEND_API_KEY");
      const { data: allowed } = await sb.rpc("email_quota_take", { p_n: 1 });
      const m = message(r.action, r.token, !!r.football);
      let status = 0, err = "";
      if (!key) err = "RESEND_API_KEY not set";
      else if (Number(allowed ?? 0) < 1) err = "daily or monthly allowance reached";
      else {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM, to: [r.email], subject: m.subject, html: m.html, text: m.text }),
          signal: AbortSignal.timeout(15_000),
        }).catch((e) => ({ ok: false, status: 0, text: () => Promise.resolve(String(e)) }) as unknown as Response);
        if (!res.ok) { status = res.status; err = (await res.text()).slice(0, 400); }
      }
      if (err) {
        const { error: e } = await sb.rpc("email_log_failure", { p_send_id: null, p_kind: r.action, p_http_status: status || null, p_error: err, p_recipients: 1 });
        if (e) console.error("email_log_failure failed", e.message);
      }
    }
    return done("check");
  }

  if (action === "confirm") {
    const { data, error } = await sb.rpc("email_confirm", { p_token: token });
    return error ? json({ state: "error" }, 500) : json(data);
  }
  if (action === "unsubscribe") {
    const { data, error } = await sb.rpc("email_unsubscribe", { p_token: token });
    return error ? json({ state: "error" }, 500) : json(data);
  }
  if (action === "manage") {
    const ch = b.changes && typeof b.changes === "object" ? b.changes as Record<string, unknown> : null;
    const changes: Record<string, unknown> = {};
    if (ch) {
      if (typeof ch.football === "boolean") changes.football = ch.football;
      for (const k of ["fpl_id", "club_id"]) {
        if (k in ch) changes[k] = typeof ch[k] === "number" && Number.isInteger(ch[k]) ? ch[k] : null;
      }
      if (Array.isArray(ch.watchlist)) changes.watchlist = ch.watchlist.filter((x) => Number.isInteger(x)).slice(0, 20);
    }
    const { data, error } = await sb.rpc("email_manage", { p_token: token, p_changes: ch ? changes : null });
    return error ? json({ state: "error" }, 500) : json(data);
  }
  return json({ state: "error", reason: "unknown action" }, 400);
});
