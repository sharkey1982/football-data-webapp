// ============================================================================
// supabase/functions/x-metrics/index.ts
//
// Reads engagement for @FixtureSharkHQ's recent posts so post types that
// don't land can be dropped (docs/social-publishing.md, "Engagement").
// Called weekly by pg_cron (private.social_metrics_call, worker token in
// x-social-token) or by an admin from /admin/social.
//
//   POST { triggered_by?: string }
//
// Every post published in the last 30 days (each post of a thread), newest
// first, at most MAX_POSTS a run, 100 ids per GET /2/tweets. Asks for organic
// and non-public metrics (our own posts, user-context token, last 30 days)
// and falls back to public metrics if X refuses them. Deleted posts come back
// as errors and are counted as missing. One row per post in
// social_post_metrics, one row per run in social_metrics_runs with the
// estimated cost (X bills owned reads per post, ~$0.001).
//
// Secrets: X_CLIENT_ID, X_CLIENT_SECRET. Tokens: Supabase Vault (via RPC),
// refreshed exactly as x-publish does.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const TWEETS_URL = "https://api.x.com/2/tweets";
const MAX_POSTS = 300;
const COST_PER_POST = 0.001;
const FULL_FIELDS = "public_metrics,non_public_metrics,organic_metrics";
const PUBLIC_FIELDS = "public_metrics";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function isAdmin(req: Request, sb: SupabaseClient): Promise<boolean> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return false;
  const { data: au } = await sb.from("app_users").select("is_admin").eq("user_id", u.user.id).maybeSingle();
  return !!au?.is_admin;
}

type Tokens = { status: string; access_token?: string; refresh_token?: string; token_version: number; access_expires_at: string | null };

async function readTokens(sb: SupabaseClient): Promise<Tokens | null> {
  const { data, error } = await sb.rpc("social_x_get_tokens");
  return error ? null : (data as Tokens);
}

// Same as x-publish: a usable access token, refreshed if it expires within 5 minutes.
async function accessToken(sb: SupabaseClient): Promise<{ token?: string; error?: string }> {
  const clientId = Deno.env.get("X_CLIENT_ID");
  const clientSecret = Deno.env.get("X_CLIENT_SECRET");
  if (!clientId || !clientSecret) return { error: "X_CLIENT_ID / X_CLIENT_SECRET not set" };
  for (let round = 0; round < 2; round++) {
    const t = await readTokens(sb);
    if (!t || t.status !== "connected" || !t.access_token || !t.refresh_token) return { error: "X account not connected" };
    const expires = t.access_expires_at ? Date.parse(t.access_expires_at) : 0;
    if (expires - Date.now() > 5 * 60_000) return { token: t.access_token };
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh_token }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    const body = r ? await r.json().catch(() => ({})) : {};
    if (r?.ok && body.access_token && body.refresh_token) {
      const { data: saved } = await sb.rpc("social_x_rotate_tokens", {
        p_expected_version: t.token_version, p_access_token: body.access_token,
        p_refresh_token: body.refresh_token, p_expires_in: body.expires_in ?? 7200,
      });
      if (saved === true) return { token: body.access_token };
      continue;
    }
    const again = await readTokens(sb);
    if (again && again.token_version !== t.token_version) continue;
    await sb.rpc("social_x_mark_error", { p_error: `token refresh failed: HTTP ${r?.status ?? "network"}` });
    return { error: "token refresh failed; reconnect the X account" };
  }
  return { error: "token refresh did not settle" };
}

type Target = { candidate_id: number; x_post_id: string; position: number };
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const workerToken = req.headers.get("x-social-token");
  if (workerToken) {
    const { data: ok } = await sb.rpc("social_worker_ok", { p_token: workerToken });
    if (ok !== true) return json({ error: "bad worker token" }, 403);
  } else if (!(await isAdmin(req, sb))) {
    return json({ error: "admin only" }, 403);
  }
  const reqBody = await req.json().catch(() => ({}));
  const triggeredBy = workerToken ? String(reqBody?.triggered_by ?? "schedule") : "admin";

  const { data: run, error: runErr } = await sb.from("social_metrics_runs").insert({ triggered_by: triggeredBy }).select("run_id").single();
  if (runErr || !run) return json({ error: runErr?.message ?? "could not start a run" }, 500);
  const finish = (patch: Record<string, unknown>) =>
    sb.from("social_metrics_runs").update({ finished_at: new Date().toISOString(), ...patch }).eq("run_id", run.run_id);

  // Posts published in the last 30 days, newest first; every post of a thread.
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: cands, error: cErr } = await sb.from("social_post_candidates")
    .select("candidate_id, x_post_id, x_post_ids, published_at")
    .eq("publication_status", "published").gte("published_at", since)
    .order("published_at", { ascending: false });
  if (cErr) { await finish({ error: cErr.message }); return json({ error: cErr.message }, 500); }
  const targets: Target[] = [];
  for (const c of cands ?? []) {
    const ids: string[] = Array.isArray(c.x_post_ids) && c.x_post_ids.length ? c.x_post_ids.map(String) : c.x_post_id ? [String(c.x_post_id)] : [];
    ids.forEach((id, i) => { if (/^\d+$/.test(id)) targets.push({ candidate_id: c.candidate_id, x_post_id: id, position: i + 1 }); });
  }
  const wanted = targets.slice(0, MAX_POSTS);
  if (!wanted.length) { await finish({ posts_requested: 0 }); return json({ ok: true, run_id: run.run_id, posts_read: 0 }); }

  const tok = await accessToken(sb).catch((e) => ({ error: String(e) }) as { token?: string; error?: string });
  if (!tok.token) { await finish({ posts_requested: wanted.length, error: tok.error ?? "no token" }); return json({ ok: false, error: tok.error }); }

  let fields = FULL_FIELDS;
  const rows: Record<string, unknown>[] = [];
  let missing = 0;
  const errors: string[] = [];
  const byId = new Map(wanted.map((t) => [t.x_post_id, t]));
  for (let i = 0; i < wanted.length; i += 100) {
    const chunk = wanted.slice(i, i + 100).map((t) => t.x_post_id);
    let res: Response | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      const url = `${TWEETS_URL}?ids=${chunk.join(",")}&tweet.fields=${fields}`;
      res = await fetch(url, { headers: { Authorization: `Bearer ${tok.token}` }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
      // X refuses non-public/organic metrics in some cases (a post over 30 days old, a
      // token without access): fall back to public metrics for the rest of the run.
      if (res && !res.ok && fields !== PUBLIC_FIELDS && [400, 403].includes(res.status)) { fields = PUBLIC_FIELDS; continue; }
      break;
    }
    if (!res || !res.ok) {
      errors.push(`X ${res?.status ?? "no response"}: ${res ? (await res.text().catch(() => "")).slice(0, 200) : ""}`);
      missing += chunk.length;
      continue;
    }
    const body = await res.json().catch(() => ({}));
    const seen = new Set<string>();
    for (const d of body?.data ?? []) {
      const t = byId.get(String(d.id));
      if (!t) continue;
      seen.add(t.x_post_id);
      const pub = d.public_metrics ?? {}, org = d.organic_metrics ?? {}, np = d.non_public_metrics ?? {};
      rows.push({
        run_id: run.run_id, candidate_id: t.candidate_id, x_post_id: t.x_post_id, position: t.position,
        impressions: num(org.impression_count) ?? num(np.impression_count) ?? num(pub.impression_count),
        likes: num(pub.like_count), replies: num(pub.reply_count), reposts: num(pub.retweet_count),
        quotes: num(pub.quote_count), bookmarks: num(pub.bookmark_count),
        url_clicks: num(org.url_link_clicks) ?? num(np.url_link_clicks),
        profile_clicks: num(org.user_profile_clicks) ?? num(np.user_profile_clicks),
        metrics: { public_metrics: d.public_metrics ?? null, organic_metrics: d.organic_metrics ?? null, non_public_metrics: d.non_public_metrics ?? null },
      });
    }
    missing += chunk.filter((id) => !seen.has(id)).length;
  }
  if (rows.length) {
    const { error: insErr } = await sb.from("social_post_metrics").insert(rows);
    if (insErr) errors.push(`insert: ${insErr.message}`);
  }
  const cost = Math.round(rows.length * COST_PER_POST * 10_000) / 10_000;
  await finish({
    posts_requested: wanted.length, posts_read: rows.length, posts_missing: missing, fields, estimated_cost_usd: cost,
    error: errors.length ? errors.join(" | ").slice(0, 2000) : null,
  });
  return json({ ok: errors.length === 0, run_id: run.run_id, posts_requested: wanted.length, posts_read: rows.length, posts_missing: missing, fields, estimated_cost_usd: cost, errors });
});
