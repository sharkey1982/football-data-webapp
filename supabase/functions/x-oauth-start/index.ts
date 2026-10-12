// ============================================================================
// supabase/functions/x-oauth-start/index.ts
//
// Starts the X OAuth 2.0 authorisation (code flow with PKCE) for the
// FixtureShark publishing account. Admin only (signed-in FixtureShark admin).
//
//   POST {}  ->  { authorize_url }
//
// Makes a random state and PKCE verifier, stores the verifier against a
// hash of the state (single use, 10 minutes: social_oauth_begin), and returns
// X's authorise URL. The browser goes there, X sends it back to
// x-oauth-callback, which checks the state and the account (@FixtureSharkHQ).
//
// Secrets (Edge Function secrets, never in the repo): X_CLIENT_ID.
// Optional: X_REDIRECT_URI (defaults to <SUPABASE_URL>/functions/v1/x-oauth-callback).
// Runbook: docs/social-publishing.md
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

// Only what publishing needs: post (tweet.write; X requires tweet.read and
// users.read alongside it), identify the account (users.read), and keep
// working past the 2-hour access token (offline.access -> refresh token).
const SCOPES = ["tweet.read", "tweet.write", "users.read", "offline.access"];
const AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

async function adminUser(req: Request, sb: SupabaseClient): Promise<string | null> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return null;
  const { data: au } = await sb.from("app_users").select("is_admin").eq("user_id", u.user.id).maybeSingle();
  return au?.is_admin ? u.user.id : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const clientId = Deno.env.get("X_CLIENT_ID");
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const redirectUri = Deno.env.get("X_REDIRECT_URI") ?? `${supabaseUrl}/functions/v1/x-oauth-callback`;
  if (!clientId) return json({ error: "X_CLIENT_ID is not set (Edge Function secrets)" }, 503);

  const sb = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const userId = await adminUser(req, sb);
  if (!userId) return json({ error: "admin only" }, 403);

  const state = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64))); // 86 chars (43-128 allowed)
  const challenge = b64url(await sha256(verifier));
  const stateHash = b64url(await sha256(state));

  const { error } = await sb.rpc("social_oauth_begin", { p_state_hash: stateHash, p_code_verifier: verifier, p_actor: userId });
  if (error) return json({ error: "could not start: " + error.message }, 500);

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return json({ authorize_url: url.toString(), account: "@FixtureSharkHQ", scopes: SCOPES });
});
