// ============================================================================
// supabase/functions/x-publish/index.ts
//
// Publishes ONE approved social candidate to X (a single post or a thread),
// or dry-runs it. Called by an admin pressing Publish on /admin/social, or
// by the automatic worker (pg_cron social_auto_tick, Phase 4) with the
// worker token in x-social-token. Runbook: docs/social-publishing.md
//
//   POST { candidate_id: number, mode: "dry_run" | "live" }
//
// A thread's posts go out as replies to the previous one. If a later post
// fails, the thread is recorded as posted with the ids so far and the error,
// which trips the circuit breaker for automatic posts.
//
// Every check lives in the database (social_claim_for_publish): approval,
// still-true revalidation, expiry, duplicates, attempts, link cost, kill
// switch, live gate, connected account = @FixtureSharkHQ, daily/monthly
// limits, minimum gap, monthly budget. It records the attempt either way.
//
// dry_run: returns what would be posted and why it would or would not go.
//          This path never reads the tokens and never calls X.
// live:    the candidate is locked as 'publishing' by the database, the
//          access token is refreshed if it expires within 5 minutes (X
//          rotates refresh tokens; social_x_rotate_tokens stores the new
//          pair only if nobody else refreshed first), then POST /2/tweets.
//          201 -> published with its id. An X error response -> failed
//          (nothing was posted). A timeout, network error or X 5xx ->
//          needs_check: it may have posted, so it is never retried
//          automatically; an admin checks the account and settles it.
//
// Secrets: X_CLIENT_ID, X_CLIENT_SECRET. Tokens: Supabase Vault (via RPC).
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const POST_URL = "https://api.x.com/2/tweets";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function adminUser(req: Request, sb: SupabaseClient): Promise<string | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return null;
  const { data: au } = await sb.from("app_users").select("is_admin").eq("user_id", u.user.id).maybeSingle();
  return au?.is_admin ? u.user.id : null;
}

type Tokens = { status: string; access_token?: string; refresh_token?: string; token_version: number; access_expires_at: string | null };

async function readTokens(sb: SupabaseClient): Promise<Tokens | null> {
  const { data, error } = await sb.rpc("social_x_get_tokens");
  return error ? null : (data as Tokens);
}

// A usable access token, refreshing it first if it expires within 5 minutes.
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
        p_expected_version: t.token_version,
        p_access_token: body.access_token,
        p_refresh_token: body.refresh_token,
        p_expires_in: body.expires_in ?? 7200,
      });
      if (saved === true) return { token: body.access_token };
      continue; // someone else refreshed first: read theirs
    }
    // The refresh token may have been used by a concurrent refresh; re-read once.
    const again = await readTokens(sb);
    if (again && again.token_version !== t.token_version) continue;
    await sb.rpc("social_x_mark_error", { p_error: `token refresh failed: HTTP ${r?.status ?? "network"}` });
    return { error: "token refresh failed; reconnect the X account" };
  }
  return { error: "token refresh did not settle" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const workerToken = req.headers.get("x-social-token");
  let userId: string | null = null;
  if (workerToken) {
    const { data: ok } = await sb.rpc("social_worker_ok", { p_token: workerToken });
    if (ok !== true) return json({ error: "bad worker token" }, 403);
  } else {
    userId = await adminUser(req, sb);
    if (!userId) return json({ error: "admin only" }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const candidateId = Number(body?.candidate_id);
  const mode = body?.mode === "live" ? "live" : "dry_run"; // anything else is a dry run
  if (!Number.isInteger(candidateId) || candidateId <= 0) return json({ error: "candidate_id required" }, 400);

  const { data: claim, error: claimErr } = await sb.rpc("social_claim_for_publish", { p_candidate_id: candidateId, p_mode: mode, p_actor: userId });
  if (claimErr) return json({ error: claimErr.message }, 500);
  if (!claim?.ok) return json({ ok: false, mode, reasons: claim?.reasons ?? [], text: claim?.text, estimated_cost_usd: claim?.estimated_cost_usd });
  const posts: string[] = Array.isArray(claim.thread) && claim.thread.length ? claim.thread : [claim.text];

  // ---- Dry run ends here: no tokens, no X.
  if (mode === "dry_run") {
    return json({ ok: true, mode, would_post: { text: claim.text, thread: posts }, estimated_cost_usd: claim.estimated_cost_usd });
  }

  // ---- Live.
  const attemptId = claim.attempt_id as number;
  const ids: string[] = [];
  const finish = (outcome: "posted" | "failed" | "unknown", http: number | null, postId: string | null, err: string | null) =>
    sb.rpc("social_finish_publish", { p_attempt_id: attemptId, p_outcome: outcome, p_http_status: http, p_x_post_id: postId,
                                       p_error: err, p_x_post_ids: ids.length ? ids : null });

  const tok = await accessToken(sb).catch((e) => ({ error: String(e) }) as { token?: string; error?: string });
  if (!tok.token) {
    await finish("failed", null, null, tok.error ?? "no token");
    return json({ ok: false, mode, reasons: [tok.error ?? "no token"] });
  }

  for (let i = 0; i < posts.length; i++) {
    const payload: Record<string, unknown> = { text: posts[i] };
    if (i > 0) payload.reply = { in_reply_to_tweet_id: ids[i - 1] };
    let res: Response;
    try {
      res = await fetch(POST_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      const err = `no response from X on post ${i + 1} of ${posts.length}: ${String(e).slice(0, 200)}`;
      if (i === 0) {
        await finish("unknown", null, null, err);
        return json({ ok: false, mode, outcome: "needs_check", reasons: ["no response from X: check @FixtureSharkHQ before retrying"] });
      }
      await finish("posted", null, ids[0], `thread incomplete: ${err}`);
      return json({ ok: false, mode, outcome: "partial", x_post_id: ids[0], reasons: [err] });
    }
    const out = await res.json().catch(() => ({}));
    if (res.status === 201 && out?.data?.id) {
      ids.push(String(out.data.id));
      continue;
    }
    const detail = JSON.stringify(out?.errors ?? out?.detail ?? out).slice(0, 500);
    if (i > 0) {
      await finish("posted", res.status, ids[0], `thread incomplete at post ${i + 1} of ${posts.length}: X ${res.status}: ${detail}`);
      return json({ ok: false, mode, outcome: "partial", x_post_id: ids[0], reasons: [`X returned ${res.status} on post ${i + 1}`] });
    }
    if (res.ok || res.status >= 500) {
      // 2xx without an id, or an X server error: it may have posted.
      await finish("unknown", res.status, null, `X ${res.status}: ${detail}`);
      return json({ ok: false, mode, outcome: "needs_check", reasons: [`X returned ${res.status}: check @FixtureSharkHQ before retrying`] });
    }
    await finish("failed", res.status, null, `X ${res.status}: ${detail}`);
    return json({ ok: false, mode, outcome: "failed", reasons: [`X returned ${res.status}: ${detail}`] });
  }
  await finish("posted", 201, ids[0], null);
  return json({ ok: true, mode, outcome: "posted", x_post_id: ids[0], x_post_ids: ids, url: `https://x.com/FixtureSharkHQ/status/${ids[0]}` });
});
