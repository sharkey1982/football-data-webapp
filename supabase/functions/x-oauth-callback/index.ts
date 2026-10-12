// ============================================================================
// supabase/functions/x-oauth-callback/index.ts
//
// X sends the browser here after the account owner approves (or refuses)
// the FixtureShark app. Public URL, entered in the X Developer Console:
//
//   https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/x-oauth-callback
//
// No Supabase sign-in reaches this request (X redirects the browser), so
// JWT verification is off (supabase/config.toml) and trust comes from the
// state instead:
//   1. state must match a single-use, unexpired row made by x-oauth-start
//      for a signed-in admin (stored as a SHA-256 hash; deleted when read)
//   2. the code is exchanged with that row's PKCE verifier and the app's
//      client secret (confidential client, HTTP Basic)
//   3. the token must carry exactly tweet.read tweet.write users.read
//      offline.access, with a refresh token
//   4. GET /2/users/me must be @FixtureSharkHQ (and, once pinned, the same
//      X user id). Any other account: its tokens are revoked at once and
//      nothing is stored.
// Tokens go to Supabase Vault through social_x_store_tokens. They are never
// logged, returned, or put in a URL; the browser only sees a redirect to
// /admin/social?x=<result>.
//
// Secrets: X_CLIENT_ID, X_CLIENT_SECRET. Optional: X_REDIRECT_URI, SITE_URL.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
const ME_URL = "https://api.x.com/2/users/me";

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256b64url(text: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))));
}

function back(site: string, result: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${site}/admin/social?x=${encodeURIComponent(result)}`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function revoke(token: string, hint: string, basic: string) {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
      body: new URLSearchParams({ token, token_type_hint: hint }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Best effort; the attempt is audited by the caller.
  }
}

Deno.serve(async (req) => {
  const site = (Deno.env.get("SITE_URL") ?? "https://fixtureshark.com").replace(/\/$/, "");
  if (req.method !== "GET") return new Response("GET only", { status: 405 });

  const clientId = Deno.env.get("X_CLIENT_ID");
  const clientSecret = Deno.env.get("X_CLIENT_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const redirectUri = Deno.env.get("X_REDIRECT_URI") ?? `${supabaseUrl}/functions/v1/x-oauth-callback`;
  if (!clientId || !clientSecret) return back(site, "not_configured");

  const q = new URL(req.url).searchParams;
  const state = q.get("state") ?? "";
  const code = q.get("code") ?? "";
  if (q.get("error")) return back(site, "denied");
  if (!state || state.length > 500 || !code || code.length > 2000) return back(site, "bad_request");

  const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1. State: single use, unexpired, made for a signed-in admin.
  const { data: rows, error: stErr } = await sb.rpc("social_oauth_consume", { p_state_hash: await sha256b64url(state) });
  const st = Array.isArray(rows) ? rows[0] : null;
  if (stErr || !st?.code_verifier) return back(site, "bad_state");

  // 2. Code -> tokens (the code is only valid for about 30 seconds).
  const basic = btoa(`${clientId}:${clientSecret}`);
  let tok: { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; token_type?: string };
  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
      body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: st.code_verifier }),
      signal: AbortSignal.timeout(15_000),
    });
    tok = await r.json().catch(() => ({}));
    if (!r.ok || !tok.access_token) {
      await sb.rpc("social_x_mark_error", { p_error: `token exchange failed: HTTP ${r.status}` });
      return back(site, "exchange_failed");
    }
  } catch {
    await sb.rpc("social_x_mark_error", { p_error: "token exchange failed: network" });
    return back(site, "exchange_failed");
  }

  // 3/4. Which account is this?
  let me: { id?: string; username?: string } = {};
  try {
    const r = await fetch(ME_URL, { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(15_000) });
    const body = await r.json().catch(() => ({}));
    me = body?.data ?? {};
  } catch {
    // handled below
  }
  if (!me.id || !me.username) {
    await revoke(tok.access_token!, "access_token", basic);
    if (tok.refresh_token) await revoke(tok.refresh_token, "refresh_token", basic);
    await sb.rpc("social_x_mark_error", { p_error: "could not identify the authorised account" });
    return back(site, "identify_failed");
  }

  const { data: stored, error: saveErr } = await sb.rpc("social_x_store_tokens", {
    p_x_user_id: me.id,
    p_username: me.username,
    p_scopes: tok.scope ?? "",
    p_access_token: tok.access_token,
    p_refresh_token: tok.refresh_token ?? "",
    p_expires_in: tok.expires_in ?? 7200,
    p_actor: st.created_by,
  });
  if (saveErr || !stored?.ok) {
    // Wrong account or wrong scopes: nothing was stored; make the tokens useless too.
    await revoke(tok.access_token!, "access_token", basic);
    if (tok.refresh_token) await revoke(tok.refresh_token, "refresh_token", basic);
    return back(site, stored?.reason ?? "save_failed");
  }
  return back(site, "connected");
});
