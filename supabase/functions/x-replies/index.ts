// ============================================================================
// supabase/functions/x-replies/index.ts
//
// Reply support for @FixtureSharkHQ (docs/social-publishing.md, "Replies";
// Chris approved 5 Nov 2026). Called by pg_cron (private.social_replies_call,
// worker token in x-social-token) or by an admin.
//
//   POST { kind: "ideas" | "mentions" | "redraft", triggered_by?: string }
//
// redraft   No X reads: redrafts open ideas from the last 36 hours that fell
//           back to the template, with Claude, when the draft passes.
//
// ideas     Once a day (17:40 UK by default). Checks any account handle not
//           yet verified (GET /2/users/by), then ONE recent search of the
//           active accounts' own posts (no replies or reposts, FPL and stats
//           words), at most 10 posts. Keeps those where our data adds
//           something (public.social_reply_facts), drafts a reply from those
//           facts only (Claude, checked by public.social_reply_check; a
//           plain template if that fails) and stores at most
//           reply_ideas_per_day a day in social_reply_ideas with a one-tap
//           intent link. X refuses automated replies to accounts that have
//           not mentioned us, so Chris posts these himself. While ideas are
//           open, our own timeline (at most 10, owned reads) shows which he
//           posted; ideas older than 3 days are marked ignored.
// mentions  Every 3 hours. @FixtureSharkHQ's mentions since the last read
//           (owned reads, 5 a page, at most 4 pages), each recorded in
//           social_mentions. Spam, abuse, bots and nothing-to-say are
//           skipped; a genuine question or comment gets a drafted reply
//           (no link) queued by public.social_mention_candidate for Chris's
//           approval (draft email, /admin/social), or for automatic posting
//           after the hold when social_settings.auto_mention_replies is on.
//
// Cost (X pay-per-use): other accounts' posts $0.005, owned reads $0.001,
// user objects $0.010, per item returned. Before each read the worst case
// goes through public.social_reply_budget (reply reads cap, default $1.50 a
// month; the $5 X budget). Each run logs posts/owned/users read and its
// estimate in social_reply_runs, as social_metrics_runs does.
//
// Secrets: X_CLIENT_ID, X_CLIENT_SECRET, ANTHROPIC_API_KEY (drafting; without
// it ideas use the template and mentions are listed without a draft).
// Tokens: Supabase Vault (via RPC), refreshed exactly as x-publish does.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const X = "https://api.x.com/2";
const COST = { post: 0.005, owned: 0.001, user: 0.01 };
// The drafter: Haiku first (cheap); if the API refuses it (model not found or
// not allowed for the key), the model ai-lab-run uses. $ per token.
const MODELS = [
  { id: "claude-haiku-4-5-20251001", in: 1 / 1e6, out: 5 / 1e6 },
  { id: "claude-sonnet-5", in: 2 / 1e6, out: 10 / 1e6 },
];
const IDEA_MAX_RESULTS = 10;   // the search minimum
const MENTION_PAGE = 5;        // the mentions minimum
const MENTION_PAGES = 4;
// Words that make a post likely to be about something we hold numbers on.
const KEYWORDS = ["FPL", "captain", "captaincy", "armband", "price", "xG", "\"expected goals\"", "differential", "transfers",
  "\"clean sheet\"", "gameweek", "GW", "fixtures", "goals", "assists", "points", "owned", "ownership", "injury", "doubt", "record", "stats"];
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Fact = { id: string; kind: string; about: string; source: string; text: string; link: string };
type XPost = {
  id: string; text: string; author_id?: string; created_at?: string; conversation_id?: string; lang?: string;
  public_metrics?: Record<string, number>; referenced_tweets?: { type: string; id: string }[];
};
type XUser = { id: string; username: string; name?: string; created_at?: string; description?: string; public_metrics?: { followers_count?: number } };
type XPage = { status: number; data: XPost[]; users: XUser[]; errors: { value?: string; detail?: string; title?: string }[]; meta: Record<string, unknown>; raw: string };
type Account = { handle: string; x_user_id: string | null; active: boolean; verified_at: string | null; checked_at: string | null };
type State = {
  me: string | null; me_username: string | null;
  settings: { reply_ideas_per_day: number; auto_mention_replies: boolean; reply_reads_budget_usd: number };
  ideas_today: number; accounts: Account[]; newest_id: string | null; timeline_newest_id: string | null;
  open_ideas: { idea_id: number; x_post_id: string; created_at: string }[]; known_mentions: string[];
};
type Draft = { skip?: boolean; score?: number; reply?: string; facts_used?: string[]; reason?: string; category?: string };

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

async function xGet(path: string, params: Record<string, string>, token: string): Promise<XPage> {
  const url = `${X}${path}?${new URLSearchParams(params).toString()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!res) return { status: 0, data: [], users: [], errors: [{ detail: "no response from X" }], meta: {}, raw: "" };
  const raw = await res.text().catch(() => "");
  let body: Record<string, unknown> = {};
  try { body = JSON.parse(raw); } catch { /* not JSON */ }
  const inc = (body.includes ?? {}) as { users?: XUser[] };
  return {
    status: res.status,
    data: Array.isArray(body.data) ? body.data as XPost[] : [],
    users: inc.users ?? (Array.isArray(body.data) && path.startsWith("/users/by") ? body.data as unknown as XUser[] : []),
    errors: Array.isArray(body.errors) ? body.errors as XPage["errors"] : [],
    meta: (body.meta ?? {}) as Record<string, unknown>,
    raw: raw.slice(0, 300),
  };
}

// X intent links: encodeURIComponent leaves !'()* alone, which breaks some
// mail clients' link detection.
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// ----------------------------------------------------------------- drafting
const VOICE = `You write replies on X for @FixtureSharkHQ, the account of FixtureShark (fixtureshark.com), a football and FPL data site.
Voice: UK English, plain, friendly and brief, like a knowledgeable fan sharing a number. No hype, no clickbait, no exclamation marks,
no emoji, no hashtags, no @mentions, no betting tips or betting language (bets, odds, tips, bankers, locks). Never tell people whom to
pick, buy, sell or captain: say what the numbers show. Use ONLY the facts provided, worded as you like. Every number you write must
appear in one of those facts exactly as it is written there: no rounding, no sums, no new numbers. FPL's figures are FPL's; projections
and forecasts are FixtureShark's, so say whose they are. Never state anything the facts do not say. Reply with a single JSON object only.`;

async function claude(system: string, user: string): Promise<{ draft: Draft | null; cost: number; model: string; error?: string }> {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return { draft: null, cost: 0, model: "none", error: "ANTHROPIC_API_KEY not set" };
  let cost = 0, error = "";
  for (const m of MODELS) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: m.id, max_tokens: 600, system, messages: [{ role: "user", content: user }] }),
      signal: AbortSignal.timeout(40_000),
    }).catch((e) => ({ ok: false, status: 0, json: () => Promise.resolve({ error: String(e) }) }) as unknown as Response);
    const data = await res.json().catch(() => ({}));
    cost += (data?.usage?.input_tokens ?? 0) * m.in + (data?.usage?.output_tokens ?? 0) * m.out;
    if (!res.ok) {
      error = `${error}${error ? " | " : ""}${m.id}: Anthropic ${res.status}: ${JSON.stringify(data?.error ?? data).slice(0, 200)}`;
      // A refused model (400/403/404) tries the next one; a bad key or an outage does not.
      if ([400, 403, 404].includes(res.status)) continue;
      return { draft: null, cost, model: m.id, error };
    }
    const text = (data.content ?? []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    try {
      return { draft: JSON.parse(text.slice(a, b + 1)) as Draft, cost, model: m.id };
    } catch {
      return { draft: null, cost, model: m.id, error: `${m.id} did not return JSON` };
    }
  }
  return { draft: null, cost, model: "none", error };
}

async function check(sb: SupabaseClient, text: string, facts: Fact[], allowLink: boolean): Promise<string[]> {
  const { data, error } = await sb.rpc("social_reply_check", { p_text: text, p_facts: facts, p_allow_link: allowLink });
  if (error) return [`check failed: ${error.message}`];
  return (data as string[]) ?? [];
}

// A plain reply from the facts themselves: the first facts about the first
// thing named, then its link, kept under 250.
function template(facts: Fact[]): { reply: string; used: string[] } | null {
  if (!facts.length) return null;
  const about = facts[0].about;
  const pick = facts.filter((f) => f.about === about);
  const link = pick[0].link;
  const out: string[] = [], used: string[] = [];
  for (const f of pick) {
    if ([...out, f.text].join(" ").length + 24 > 250) break;
    out.push(f.text); used.push(f.id);
  }
  return out.length ? { reply: `${out.join(" ")} ${link}`, used } : null;
}

// Draft, check, one retry with the reasons, then (ideas only) the template.
async function draftReply(sb: SupabaseClient, system: string, prompt: Record<string, unknown>, facts: Fact[], allowLink: boolean,
                          useTemplate: boolean): Promise<{ draft: Draft | null; by: string; cost: number; errors: string[] }> {
  let cost = 0;
  let errors: string[] = [];
  let msg = JSON.stringify(prompt);
  let last: Draft | null = null;
  let model = "none";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await claude(system, msg);
    cost += r.cost;
    model = r.model;
    if (!r.draft) { errors = [r.error ?? "no draft"]; break; }
    last = r.draft;
    if (r.draft.skip || !r.draft.reply) return { draft: r.draft, by: model, cost, errors: [] };
    errors = await check(sb, r.draft.reply, facts, allowLink);
    if (!errors.length) return { draft: r.draft, by: model, cost, errors };
    msg = JSON.stringify({ ...prompt, previous_reply: r.draft.reply, problems: errors,
                           instruction: "Rewrite the reply so it has none of these problems. Same JSON shape." });
  }
  if (useTemplate) {
    const t = template(facts);
    if (t && !(await check(sb, t.reply, facts, allowLink)).length) {
      return { draft: { skip: false, score: last?.score ?? 5, reply: t.reply, facts_used: t.used, reason: last?.reason }, by: "template", cost, errors };
    }
  }
  // Failed the checks twice: keep the drafter's category and reason, drop its reply.
  return { draft: last ? { ...last, reply: undefined } : null, by: model, cost, errors };
}

async function factsFor(sb: SupabaseClient, text: string): Promise<Fact[]> {
  const { data } = await sb.rpc("social_reply_facts", { p_text: text });
  return ((data as { facts?: Fact[] })?.facts ?? []).filter((f) => f?.text);
}

// ------------------------------------------------------------------- ideas
function ideaPrompt(handle: string, text: string, facts: Fact[]): Record<string, unknown> {
  return {
    task: "Draft a reply to this post from our facts. Say skip if our facts add nothing a reader of this post would value.",
    post: { author: `@${handle}`, text },
    facts: facts.map((f) => ({ id: f.id, about: f.about, source: f.source, text: f.text, link: f.link })),
    rules: "Under 250 characters including one link at the end: the link of the fact you lean on most, in full (a link counts as 23). Do not start with @. Answer in this shape: {\"skip\": false, \"score\": 0-10 (how much a reader of the post would value it), \"reply\": \"...\", \"facts_used\": [\"fact ids\"], \"reason\": \"one line\"}",
  };
}

// Redraft open ideas that fell back to the template (no X reads, no X cost):
// with Claude's draft when it passes the checks, else unchanged.
async function runRedraft(sb: SupabaseClient): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { posts_read: 0, owned_read: 0, users_read: 0, made: 0, llm: 0 };
  const results: Record<string, unknown>[] = [];
  out.detail = { results };
  const { data: ideas } = await sb.from("social_reply_ideas").select("idea_id, x_post_id, author_handle, post_text, facts")
    .eq("status", "suggested").eq("drafted_by", "template").gte("created_at", new Date(Date.now() - 36 * 3_600_000).toISOString());
  for (const i of ideas ?? []) {
    const facts = (i.facts ?? []) as Fact[];
    const res = await draftReply(sb, VOICE, ideaPrompt(i.author_handle, i.post_text, facts), facts, true, false);
    out.llm = (out.llm as number) + res.cost;
    const d = res.draft;
    if (d?.reply && !d.skip) {
      const reply = d.reply.trim();
      await sb.from("social_reply_ideas").update({
        draft_text: reply, drafted_by: res.by, score: d.score ?? null, facts_used: facts.filter((f) => (d.facts_used ?? []).includes(f.id)),
        link: reply.match(/https:\/\/fixtureshark\.com\/\S+/)?.[0] ?? null,
        intent_url: `https://x.com/intent/post?in_reply_to=${i.x_post_id}&text=${enc(reply)}`,
      }).eq("idea_id", i.idea_id);
      out.made = (out.made as number) + 1;
      results.push({ idea_id: i.idea_id, by: res.by, score: d.score ?? null });
    } else {
      results.push({ idea_id: i.idea_id, by: res.by, kept: "template", skip: d?.skip ?? null, reason: d?.reason ?? null, errors: res.errors });
    }
  }
  return out;
}

async function runIdeas(sb: SupabaseClient, st: State, token: string, log: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { posts_read: 0, owned_read: 0, users_read: 0, made: 0, llm: 0 };
  const detail: Record<string, unknown> = {};
  out.detail = detail;

  // 1. Handles not yet checked with X: verify, switch off any X does not know.
  const unchecked = st.accounts.filter((a) => a.active && !a.checked_at);
  if (unchecked.length) {
    const r = await xGet("/users/by", { usernames: unchecked.map((a) => a.handle).join(","), "user.fields": "public_metrics,verified" }, token);
    out.users_read = r.users.length;
    const found = new Map(r.users.map((u) => [u.username.toLowerCase(), u]));
    const dropped: string[] = [];
    // On an X error nothing is marked: the next run tries again.
    for (const a of r.status === 200 ? unchecked : []) {
      const u = found.get(a.handle.toLowerCase());
      if (u) {
        await sb.from("social_reply_accounts").update({ x_user_id: u.id, handle: u.username, display_name: u.name ?? null,
          followers: u.public_metrics?.followers_count ?? null, verified_at: new Date().toISOString(), checked_at: new Date().toISOString() })
          .eq("handle", a.handle);
        a.x_user_id = u.id; a.verified_at = new Date().toISOString(); a.handle = u.username;
      } else {
        const why = r.errors.find((e) => (e.value ?? "").toLowerCase() === a.handle.toLowerCase());
        await sb.from("social_reply_accounts").update({ active: false, checked_at: new Date().toISOString(),
          note: `not found on X ${new Date().toISOString().slice(0, 10)}${why?.detail ? `: ${why.detail}` : ""}` }).eq("handle", a.handle);
        a.active = false; dropped.push(a.handle);
      }
    }
    detail.verified = r.users.map((u) => u.username);
    detail.dropped = dropped;
  }

  // 2. Which open ideas Chris posted (our own timeline, owned reads).
  if (st.open_ideas.length && st.me) {
    const open = new Map(st.open_ideas.map((i) => [i.x_post_id, i]));
    const oldest = st.open_ideas.map((i) => i.created_at).sort()[0];
    const params: Record<string, string> = { max_results: "10", exclude: "retweets", "tweet.fields": "referenced_tweets,created_at" };
    if (st.timeline_newest_id) params.since_id = st.timeline_newest_id; else params.start_time = new Date(Date.parse(oldest)).toISOString();
    const r = await xGet(`/users/${st.me}/tweets`, params, token);
    out.owned_read = (out.owned_read as number) + r.data.length;
    out.timeline_newest_id = (r.meta.newest_id as string) ?? st.timeline_newest_id;
    let posted = 0;
    for (const t of r.data) {
      const to = (t.referenced_tweets ?? []).find((x) => x.type === "replied_to")?.id;
      if (to && open.has(to)) {
        await sb.from("social_reply_ideas").update({ status: "posted", posted_x_post_id: t.id, status_at: t.created_at ?? new Date().toISOString(),
          status_note: "found on our timeline" }).eq("x_post_id", to).eq("status", "suggested");
        posted++;
      }
    }
    detail.timeline = { read: r.data.length, posted, status: r.status };
  }
  await sb.from("social_reply_ideas").update({ status: "ignored", status_at: new Date().toISOString(), status_note: "not posted within 3 days" })
    .eq("status", "suggested").lt("created_at", new Date(Date.now() - 72 * 3_600_000).toISOString());

  // 3. One search of the accounts' newest posts.
  const remaining = Math.max(0, (st.settings.reply_ideas_per_day ?? 3) - st.ideas_today);
  const accounts = st.accounts.filter((a) => a.active && a.x_user_id);
  detail.accounts = accounts.length;
  if (!remaining) { out.note = `${st.ideas_today} ideas already today`; return out; }
  if (!accounts.length) { out.note = "no verified accounts"; return out; }
  const from = `(${accounts.map((a) => `from:${a.handle}`).join(" OR ")})`;
  let query = `${from} (${KEYWORDS.join(" OR ")}) -is:retweet -is:reply`;
  if (query.length > 512) query = `${from} -is:retweet -is:reply`;
  const params: Record<string, string> = {
    query, max_results: String(IDEA_MAX_RESULTS), sort_order: "recency", "tweet.fields": "created_at,public_metrics,author_id,lang,conversation_id",
  };
  if (st.newest_id) params.since_id = st.newest_id; else params.start_time = new Date(Date.now() - 24 * 3_600_000).toISOString();
  let r = await xGet("/tweets/search/recent", params, token);
  if (r.status === 400 && params.since_id) {
    // since_id outside the 7-day window: fall back to the last 24 hours.
    delete params.since_id; params.start_time = new Date(Date.now() - 24 * 3_600_000).toISOString();
    r = await xGet("/tweets/search/recent", params, token);
  }
  out.posts_read = r.data.length;
  if (r.status !== 200) { out.error = `search: X ${r.status}: ${r.raw}`; return out; }
  out.newest_id = (r.meta.newest_id as string) ?? st.newest_id;
  const byId = new Map(accounts.map((a) => [a.x_user_id as string, a.handle]));
  const ids = r.data.map((p) => p.id);
  const { data: seen } = ids.length ? await sb.from("social_reply_ideas").select("x_post_id").in("x_post_id", ids) : { data: [] };
  const seenIds = new Set((seen ?? []).map((s: { x_post_id: string }) => s.x_post_id));

  // 4. Posts our data has something on, most promising first.
  const cands: { post: XPost; handle: string; facts: Fact[]; rank: number }[] = [];
  for (const p of r.data) {
    if (seenIds.has(p.id)) continue;
    const facts = await factsFor(sb, p.text);
    if (!facts.length) continue;
    const abouts = new Set(facts.map((f) => f.about)).size;
    cands.push({ post: p, handle: byId.get(p.author_id ?? "") ?? "unknown", facts, rank: abouts * 2 + Math.log10(1 + (p.public_metrics?.like_count ?? 0)) });
  }
  cands.sort((a, b) => b.rank - a.rank);
  detail.read = r.data.map((p) => ({ id: p.id, author: byId.get(p.author_id ?? "") ?? p.author_id, text: clip(p.text.replace(/\s+/g, " "), 100),
                                     facts: cands.find((c) => c.post.id === p.id)?.facts.length ?? 0 }));

  // 5. Draft, then keep the best (score 5+) up to today's remaining slots.
  const drafted: { c: typeof cands[number]; d: Draft; by: string }[] = [];
  const skipped: Record<string, string>[] = [];
  const draftErrors: Record<string, string>[] = [];
  for (const c of cands.slice(0, Math.min(6, remaining * 2))) {
    const res = await draftReply(sb, VOICE, ideaPrompt(c.handle, c.post.text, c.facts), c.facts, true, true);
    out.llm = (out.llm as number) + res.cost;
    if (res.errors.length) draftErrors.push({ id: c.post.id, by: res.by, errors: res.errors.join("; ").slice(0, 400) });
    if (!res.draft || res.draft.skip || !res.draft.reply || (res.draft.score ?? 0) < 5) {
      skipped.push({ id: c.post.id, reason: [res.draft?.reason, res.errors.join("; ")].filter(Boolean).join(" | ") || "skipped" });
      continue;
    }
    drafted.push({ c, d: res.draft, by: res.by });
  }
  drafted.sort((a, b) => (b.d.score ?? 0) - (a.d.score ?? 0));
  detail.skipped = skipped;
  detail.draft_errors = draftErrors;
  for (const { c, d, by } of drafted.slice(0, remaining)) {
    const reply = (d.reply as string).trim();
    const link = reply.match(/https:\/\/fixtureshark\.com\/\S+/)?.[0] ?? null;
    const { error } = await sb.from("social_reply_ideas").insert({
      run_id: log.run_id, x_post_id: c.post.id, author_handle: c.handle, author_x_id: c.post.author_id ?? null,
      post_text: c.post.text, post_created_at: c.post.created_at ?? null, post_metrics: c.post.public_metrics ?? null,
      draft_text: reply, facts: c.facts, facts_used: c.facts.filter((f) => (d.facts_used ?? []).includes(f.id)),
      link, drafted_by: by, score: d.score ?? null,
      intent_url: `https://x.com/intent/post?in_reply_to=${c.post.id}&text=${enc(reply)}`,
      post_url: `https://x.com/${c.handle}/status/${c.post.id}`,
    });
    if (!error) out.made = (out.made as number) + 1;
    else skipped.push({ id: c.post.id, reason: `insert: ${error.message}` });
  }
  return out;
}

// ---------------------------------------------------------------- mentions
const SPAM = /\b(giveaway|airdrop|crypto|nft|bitcoin|btc|usdt|forex|dm me|check my bio|follow back|onlyfans|promo code|investment|whatsapp)\b/i;

async function runMentions(sb: SupabaseClient, st: State, token: string, log: Record<string, unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { posts_read: 0, owned_read: 0, users_read: 0, made: 0, llm: 0 };
  const detail: Record<string, unknown> = {};
  out.detail = detail;
  if (!st.me) { out.error = "X account not connected"; return out; }
  const known = new Set(st.known_mentions);
  const posts: XPost[] = [];
  const users = new Map<string, XUser>();
  let next: string | undefined;
  for (let page = 0; page < MENTION_PAGES; page++) {
    if (page > 0) {
      const { data: b } = await sb.rpc("social_reply_budget", { p_kind: "mentions", p_estimate: MENTION_PAGE * (COST.owned + COST.user) });
      if (!b?.ok) { detail.stopped = (b?.reasons ?? []).join("; "); break; }
    }
    const params: Record<string, string> = {
      max_results: String(MENTION_PAGE),
      "tweet.fields": "created_at,author_id,conversation_id,in_reply_to_user_id,referenced_tweets,public_metrics,lang",
      expansions: "author_id", "user.fields": "username,name,created_at,public_metrics,description",
    };
    if (st.newest_id) params.since_id = st.newest_id; else params.start_time = new Date(Date.now() - 3 * 86_400_000).toISOString();
    if (next) params.pagination_token = next;
    const r = await xGet(`/users/${st.me}/mentions`, params, token);
    if (r.status !== 200) { out.error = `mentions: X ${r.status}: ${r.raw}`; break; }
    out.owned_read = (out.owned_read as number) + r.data.length;
    out.users_read = (out.users_read as number) + r.users.length;
    if (page === 0) out.newest_id = (r.meta.newest_id as string) ?? st.newest_id;
    posts.push(...r.data);
    r.users.forEach((u) => users.set(u.id, u));
    next = r.meta.next_token as string | undefined;
    if (!next) break;
  }
  detail.read = posts.length;

  // Our own posts they replied to (free: we hold them).
  const repliedTo = [...new Set(posts.map((p) => (p.referenced_tweets ?? []).find((x) => x.type === "replied_to")?.id).filter(Boolean) as string[])];
  const ours = new Map<string, string>();
  if (repliedTo.length) {
    const { data } = await sb.from("social_post_candidates").select("x_post_id, x_post_ids, text, thread")
      .eq("publication_status", "published").gte("published_at", new Date(Date.now() - 60 * 86_400_000).toISOString());
    for (const c of data ?? []) {
      const ids: string[] = Array.isArray(c.x_post_ids) && c.x_post_ids.length ? c.x_post_ids.map(String) : [String(c.x_post_id)];
      const texts: string[] = Array.isArray(c.thread) && c.thread.length ? c.thread : [c.text];
      ids.forEach((id, i) => ours.set(id, texts[i] ?? c.text));
    }
  }

  const tally: Record<string, number> = {};
  for (const p of posts.slice().reverse()) {   // oldest first
    if (known.has(p.id)) continue;
    const u = users.get(p.author_id ?? "");
    const to = (p.referenced_tweets ?? []).find((x) => x.type === "replied_to")?.id ?? null;
    const bare = p.text.replace(/@\w+/g, "").replace(/https?:\/\/\S+/g, "").trim();
    const ageDays = u?.created_at ? (Date.now() - Date.parse(u.created_at)) / 86_400_000 : null;
    let category: string | null = null, reason: string | null = null;
    if (p.author_id === st.me) { category = "own"; reason = "our own post"; }
    else if (SPAM.test(p.text) || SPAM.test(u?.description ?? "")) { category = "spam"; reason = "spam words"; }
    else if (ageDays !== null && ageDays < 14 && (u?.public_metrics?.followers_count ?? 0) < 5) { category = "bot"; reason = "new account with almost no followers"; }
    else if (bare.replace(/[^\p{L}\p{N}]/gu, "").length < 2) { category = "not_worth"; reason = "only a tag, link or emoji"; }
    const row = {
      x_post_id: p.id, run_id: log.run_id, author_x_id: p.author_id ?? null, author_username: u?.username ?? null, author_name: u?.name ?? null,
      author_followers: u?.public_metrics?.followers_count ?? null, author_created_at: u?.created_at ?? null, text: p.text,
      created_at_x: p.created_at ?? null, conversation_id: p.conversation_id ?? null, replied_to_x_id: to, replied_to_ours: !!(to && ours.has(to)),
      category, reason,
    };
    const { error: insErr } = await sb.from("social_mentions").upsert(row, { onConflict: "x_post_id", ignoreDuplicates: true });
    if (insErr) { tally.error = (tally.error ?? 0) + 1; continue; }
    if (category) { tally[category] = (tally[category] ?? 0) + 1; continue; }

    // Classify and draft.
    const ourPost = to ? ours.get(to) ?? null : null;
    const facts = await factsFor(sb, `${p.text}\n${ourPost ?? ""}`);
    const prompt = {
      task: "Someone mentioned or replied to @FixtureSharkHQ. Decide the category: question (asks us something), comment (a genuine remark worth a short reply), spam, abuse, bot, or not_worth (nothing to add, e.g. a bare tag or a pile-on). For question or comment, write a short reply.",
      mention: { author: u ? `@${u.username}` : "unknown", followers: u?.public_metrics?.followers_count ?? null, text: p.text },
      our_post_they_replied_to: ourPost,
      facts: facts.map((f) => ({ id: f.id, about: f.about, source: f.source, text: f.text })),
      rules: "No link. Under 240 characters. If they ask something our facts cannot answer, say plainly and briefly that we don't have that, rather than guessing. Thanks are fine; never argue. Answer in this shape: {\"category\": \"question|comment|spam|abuse|bot|not_worth\", \"reply\": \"...\" (empty unless question or comment), \"facts_used\": [\"fact ids\"], \"reason\": \"one line\"}",
    };
    const res = await draftReply(sb, VOICE, prompt, facts, false, false);
    out.llm = (out.llm as number) + res.cost;
    const d = res.draft;
    const cat = d?.category && ["question", "comment", "spam", "abuse", "bot", "not_worth"].includes(d.category) ? d.category
              : (d ? "not_worth" : "comment");
    tally[cat] = (tally[cat] ?? 0) + 1;
    let why = d?.reason ?? null;
    if (["question", "comment"].includes(cat)) {
      if (d?.reply) {
        const { data: made } = await sb.rpc("social_mention_candidate", {
          p_mention_id: p.id, p_text: d.reply, p_facts: facts,
          p_detail: { model: res.by, facts_used: d.facts_used ?? [], our_post: ourPost, reason: d.reason ?? null },
        });
        if (made?.ok) out.made = (out.made as number) + 1;
        else why = `draft failed checks: ${(made?.errors ?? []).join("; ")}`;
      } else {
        why = res.errors.length ? `no draft: ${res.errors.join("; ")}` : (why ?? "no draft");
      }
    }
    await sb.from("social_mentions").update({ category: cat, reason: why ? clip(why, 300) : null }).eq("x_post_id", p.id);
  }
  detail.categories = tally;
  return out;
}

// -------------------------------------------------------------------- main
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
  const body = await req.json().catch(() => ({}));
  const kind = ["ideas", "mentions", "redraft"].includes(body?.kind) ? String(body.kind) : null;
  if (!kind) return json({ error: "kind must be ideas, mentions or redraft" }, 400);
  const triggeredBy = workerToken ? String(body?.triggered_by ?? "schedule").slice(0, 40) : "admin";

  const { data: run, error: runErr } = await sb.from("social_reply_runs").insert({ kind, triggered_by: triggeredBy }).select("run_id").single();
  if (runErr || !run) return json({ error: runErr?.message ?? "could not start a run" }, 500);
  const finish = async (status: "ok" | "skipped" | "error", r: Record<string, unknown>) => {
    const posts = Number(r.posts_read ?? 0), owned = Number(r.owned_read ?? 0), users = Number(r.users_read ?? 0);
    const cost = Math.round((posts * COST.post + owned * COST.owned + users * COST.user) * 10_000) / 10_000;
    const patch = {
      finished_at: new Date().toISOString(), status, posts_read: posts, owned_read: owned, users_read: users, estimated_cost_usd: cost,
      llm_cost_usd: Math.round(Number(r.llm ?? 0) * 10_000) / 10_000, newest_id: r.newest_id ?? null, timeline_newest_id: r.timeline_newest_id ?? null,
      made: Number(r.made ?? 0), note: r.note ? String(r.note).slice(0, 500) : null, error: r.error ? String(r.error).slice(0, 2000) : null,
      detail: r.detail ?? {},
    };
    await sb.from("social_reply_runs").update(patch).eq("run_id", run.run_id);
    return json({ ok: status !== "error", run_id: run.run_id, kind, ...patch });
  };

  // Redraft reads nothing from X: no budget check, no token.
  if (kind === "redraft") {
    try {
      return finish("ok", await runRedraft(sb));
    } catch (e) {
      return finish("error", { error: `crashed: ${String(e).slice(0, 500)}` });
    }
  }

  const { data: st, error: stErr } = await sb.rpc("social_reply_state", { p_kind: kind });
  if (stErr || !st) return finish("error", { error: stErr?.message ?? "no state" });
  const state = st as State;
  if (!state.me) return finish("skipped", { note: "X account not connected" });

  // Worst case for this run, before any read.
  const unchecked = state.accounts.filter((a) => a.active && !a.checked_at).length;
  const estimate = kind === "ideas"
    ? IDEA_MAX_RESULTS * COST.post + (state.open_ideas.length ? 10 * COST.owned : 0) + unchecked * COST.user
    : MENTION_PAGE * (COST.owned + COST.user);
  const { data: budget } = await sb.rpc("social_reply_budget", { p_kind: kind, p_estimate: estimate });
  if (!budget?.ok) return finish("skipped", { note: (budget?.reasons ?? ["budget check failed"]).join("; "), detail: { budget } });

  const tok = await accessToken(sb).catch((e) => ({ error: String(e) }) as { token?: string; error?: string });
  if (!tok.token) return finish("error", { error: tok.error ?? "no token" });

  try {
    const r = kind === "ideas" ? await runIdeas(sb, state, tok.token, { run_id: run.run_id })
                               : await runMentions(sb, state, tok.token, { run_id: run.run_id });
    (r.detail as Record<string, unknown>).budget_before = budget;
    return finish(r.error ? "error" : "ok", r);
  } catch (e) {
    return finish("error", { error: `crashed: ${String(e).slice(0, 500)}` });
  }
});
