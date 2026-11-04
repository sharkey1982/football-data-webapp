// ============================================================================
// supabase/functions/cf-analytics/index.ts
//
// Imports Cloudflare Web Analytics for fixtureshark.com into the private `cf`
// schema (supabase/migrations/20261104200000_cf_analytics_digest.sql).
// Cloudflare counts every visitor without cookies, so these are the site's
// real visit numbers; Google Analytics (ga.*) only sees visitors who accept
// the cookie banner.
//
//   POST { mode?: "auto" | "daily" | "backfill", triggered_by?: string }
//
//   daily     the last 3 London dates (today so far, plus the two before it,
//             so late events and yesterday's final figures land)
//   backfill  every London date Cloudflare still holds (its notOlderThan
//             limit, at most 180 days)
//   auto      backfill while cf.daily_totals holds under 28 days, else daily
//             (what pg_cron sends, so a fix to this function heals history
//             on its next run)
//
// One GraphQL request per London date (rumPageloadEventsAdaptiveGroups, the
// dataset behind the Web Analytics dashboard): page views and visits by path,
// by referrer host and by country, for the fixtureshark.com site tag and
// hosts. Dates are London dates (00:00 to 24:00 UK), matching the digest.
// Everything is written in one call to public.cf_import_store, which logs
// cf.import_runs and pipeline_runs ('cf_import').
//
// Called by pg_cron (private.cf_import_call, worker token in x-social-token)
// or by an admin JWT.
//
// Secrets: CLOUDFLARE_ANALYTICS_TOKEN (Account Analytics: Read). The account
// is found from the token (GET /accounts); else CLOUDFLARE_ACCOUNT_ID; else
// the constant below (an account ID is not a credential: it is in every
// dashboard URL).
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const API = "https://api.cloudflare.com/client/v4";
const GQL = `${API}/graphql`;
const FALLBACK_ACCOUNT_ID = "83df957cb369a7a48515dc5f05434ee8";
const HOSTS = ["fixtureshark.com", "www.fixtureshark.com"];
const DAILY_DAYS = 3;
const MAX_BACKFILL_DAYS = 180;
const AUTO_BACKFILL_BELOW = 28;
const PAGE_LIMIT = 5000;
const PARALLEL = 4;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}

async function isAdmin(req: Request, sb: SupabaseClient): Promise<boolean> {
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return false;
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return false;
  const { data: au } = await sb.from("app_users").select("is_admin").eq("user_id", u.user.id).maybeSingle();
  return !!au?.is_admin;
}

// ------------------------------------------------------------------ dates
// London date of an instant, and the UTC instant of 00:00 London on a date.
const londonDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
function londonMidnight(date: string): Date {
  // 00:00 London is 00:00 UTC (GMT) or 23:00 UTC the day before (BST).
  const utc = new Date(`${date}T00:00:00Z`);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "2-digit", hourCycle: "h23" }).format(utc));
  return new Date(utc.getTime() - (hour === 0 ? 0 : 3_600_000));
}
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ------------------------------------------------------------------ Cloudflare
// deno-lint-ignore no-explicit-any
type Gql = { data?: any; errors?: { message: string }[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
let apiRequests = 0;

async function gql(token: string, query: string): Promise<Gql> {
  apiRequests++;
  const r = await fetch(GQL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(25_000),
  });
  const body = (await r.json().catch(() => ({}))) as Gql;
  if (!r.ok && !body.errors) body.errors = [{ message: `HTTP ${r.status}` }];
  return body;
}
const errText = (g: Gql) => (g.errors ?? []).map((e) => e.message).join("; ").slice(0, 400);
const q = (s: string) => JSON.stringify(s);

async function accountId(token: string): Promise<{ id: string; source: string; note?: string }> {
  try {
    apiRequests++;
    const r = await fetch(`${API}/accounts?per_page=50`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    const b = await r.json().catch(() => ({}));
    const ids: string[] = Array.isArray(b?.result) ? b.result.map((a: { id: string }) => a.id) : [];
    if (ids.length) return { id: ids.includes(FALLBACK_ACCOUNT_ID) ? FALLBACK_ACCOUNT_ID : ids[0], source: "token" };
    const secret = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const note = `GET /accounts returned HTTP ${r.status} with no accounts`;
    return secret ? { id: secret, source: "secret", note } : { id: FALLBACK_ACCOUNT_ID, source: "constant", note };
  } catch (e) {
    const secret = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
    const note = `GET /accounts failed: ${String(e).slice(0, 120)}`;
    return secret ? { id: secret, source: "secret", note } : { id: FALLBACK_ACCOUNT_ID, source: "constant", note };
  }
}

type Row = { count?: number; sum?: { visits?: number }; avg?: { sampleInterval?: number }; dimensions?: Record<string, string> };
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);

Deno.serve(async (req) => {
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
  let mode = ["daily", "backfill", "auto"].includes(reqBody?.mode) ? String(reqBody.mode) : "auto";
  apiRequests = 0;
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  const store = async (payload: Record<string, unknown>) => {
    const { data, error } = await sb.rpc("cf_import_store", { p_run: { started_at: startedAt, mode, api_requests: apiRequests, warnings, ...payload } });
    return error ? { error: error.message } : data;
  };

  const token = Deno.env.get("CLOUDFLARE_ANALYTICS_TOKEN");
  if (!token) return json(await store({ error: "CLOUDFLARE_ANALYTICS_TOKEN not set" }));

  try {
    if (mode === "auto") {
      const { data: st } = await sb.rpc("cf_import_state");
      mode = Number(st?.days ?? 0) < AUTO_BACKFILL_BELOW ? "backfill" : "daily";
    }
    const acct = await accountId(token);
    if (acct.note) warnings.push(acct.note);

    // Retention and page size for this dataset (defaults if Cloudflare won't say).
    const today = londonDate(new Date());
    let oldest = addDays(today, -(MAX_BACKFILL_DAYS - 1));
    let limit = PAGE_LIMIT;
    const set = await gql(token, `{viewer{accounts(filter:{accountTag:${q(acct.id)}}){settings{rumPageloadEventsAdaptiveGroups{notOlderThan maxPageSize}}}}}`);
    const s = set.data?.viewer?.accounts?.[0]?.settings?.rumPageloadEventsAdaptiveGroups;
    if (s?.notOlderThan) {
      // The first whole London date inside the limit.
      const d = addDays(londonDate(new Date(Date.now() - Number(s.notOlderThan) * 1000)), 1);
      if (d > oldest) oldest = d;
    } else if (set.errors) warnings.push(`settings: ${errText(set)}`);
    if (s?.maxPageSize) limit = Math.min(limit, Number(s.maxPageSize));

    // The site tag that carries fixtureshark.com (last 7 days).
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const tags = await gql(token, `{viewer{accounts(filter:{accountTag:${q(acct.id)}}){g:rumPageloadEventsAdaptiveGroups(limit:200,filter:{datetime_geq:${q(since)},datetime_lt:${q(new Date().toISOString())}},orderBy:[count_DESC]){count dimensions{siteTag requestHost}}}}}`);
    if (tags.errors) warnings.push(`site tag lookup: ${errText(tags)}; filtering by host only`);
    const tagViews = new Map<string, number>();
    for (const g of (tags.data?.viewer?.accounts?.[0]?.g ?? []) as Row[]) {
      if (!HOSTS.includes(String(g.dimensions?.requestHost))) continue;
      const t = String(g.dimensions?.siteTag ?? "");
      if (t) tagViews.set(t, (tagViews.get(t) ?? 0) + n(g.count));
    }
    const siteTag = [...tagViews.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    if (!siteTag && !tags.errors) throw new Error(`no page views for ${HOSTS.join(" / ")} in the last 7 days on account ${acct.id.slice(0, 6)}…`);

    const first = mode === "backfill" ? oldest : addDays(today, -(DAILY_DAYS - 1));
    const dates: string[] = [];
    for (let d = first; d <= today; d = addDays(d, 1)) dates.push(d);

    const days: Record<string, unknown>[] = [], pages: Record<string, unknown>[] = [], refs: Record<string, unknown>[] = [], countries: Record<string, unknown>[] = [], hours: Record<string, unknown>[] = [];
    // Filtered by site tag; hosts are checked here (the tag could also carry
    // a preview host), and www and the bare domain are added together.
    const fetchDay = async (date: string) => {
      const from = londonMidnight(date).toISOString();
      const to = new Date(Math.min(londonMidnight(addDays(date, 1)).getTime(), Date.now())).toISOString();
      const f = `{datetime_geq:${q(from)},datetime_lt:${q(to)}${siteTag ? `,siteTag:${q(siteTag)}` : ""}}`;
      const grp = (alias: string, dim: string) =>
        `${alias}:rumPageloadEventsAdaptiveGroups(limit:${limit},filter:${f},orderBy:[count_DESC]){count sum{visits} avg{sampleInterval} dimensions{requestHost ${dim}}}`;
      const g = await gql(token, `{viewer{accounts(filter:{accountTag:${q(acct.id)}}){${grp("p", "requestPath")} ${grp("r", "refererHost")} ${grp("c", "countryName")} ${grp("h", "datetimeHour")}}}}`);
      if (g.errors) { warnings.push(`${date}: ${errText(g)}`); return; }
      const a = g.data?.viewer?.accounts?.[0] ?? {};
      const ours = (x: Row) => HOSTS.includes(String(x.dimensions?.requestHost));
      const P = (a.p ?? []) as Row[], R = (a.r ?? []) as Row[], C = (a.c ?? []) as Row[], H = (a.h ?? []) as Row[];
      if ([P, R, C, H].some((x) => x.length >= limit)) warnings.push(`${date}: a breakdown hit the ${limit}-row limit`);
      // By hour (UTC), so the digest can compare today so far with the same
      // time on the same weekday last week.
      const mh = new Map<string, { visits: number; page_views: number }>();
      const add = (m: Map<string, { visits: number; page_views: number }>, k: string, x: Row) => {
        const v = m.get(k) ?? { visits: 0, page_views: 0 };
        v.visits += n(x.sum?.visits); v.page_views += n(x.count); m.set(k, v);
      };
      const mp = new Map<string, { visits: number; page_views: number }>(), mr = new Map<string, { visits: number; page_views: number }>(), mc = new Map<string, { visits: number; page_views: number }>();
      let views = 0, visits = 0, sampled = 0;
      for (const x of P.filter(ours)) {
        views += n(x.count); visits += n(x.sum?.visits);
        sampled = Math.max(sampled, Number(x.avg?.sampleInterval ?? 1));
        add(mp, String(x.dimensions?.requestPath || "/"), x);
      }
      for (const x of R.filter(ours)) add(mr, String(x.dimensions?.refererHost ?? "").toLowerCase(), x);
      for (const x of C.filter(ours)) add(mc, String(x.dimensions?.countryName || "(unknown)"), x);
      for (const x of H.filter(ours)) if (x.dimensions?.datetimeHour) add(mh, String(x.dimensions.datetimeHour), x);
      for (const [hour, v] of mh) hours.push({ date, hour, ...v });
      for (const [path, v] of mp) pages.push({ date, path, ...v });
      for (const [host, v] of mr) refs.push({ date, host, ...v });
      for (const [country, v] of mc) countries.push({ date, country, ...v });
      days.push({ date, visits, page_views: views, sample_interval: sampled || 1, is_final: date < today });
    };
    for (let i = 0; i < dates.length; i += PARALLEL) await Promise.all(dates.slice(i, i + PARALLEL).map(fetchDay));
    if (!days.length) throw new Error(`no dates fetched: ${warnings.slice(-3).join(" | ")}`);

    const res = await store({
      site_tag: siteTag, account_source: acct.source, start_date: dates[0], end_date: today,
      days, pages, refs, countries, hours,
    });
    return json({ ok: !(res as { error?: string })?.error, mode, dates: dates.length, days_written: days.length, api_requests: apiRequests, warnings, result: res });
  } catch (e) {
    const res = await store({ error: String((e as Error)?.message ?? e).slice(0, 1000) });
    return json({ ok: false, mode, error: String(e), result: res }, 200);
  }
});
