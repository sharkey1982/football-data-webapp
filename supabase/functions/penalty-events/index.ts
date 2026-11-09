// ============================================================================
// supabase/functions/penalty-events/index.ts
//
// Which Premier League goals were penalties, from ESPN's free public
// scoreboard JSON (no key, no subscription). FPL gives xG including
// penalties and penalties missed, but not penalties scored, so we take the
// goals here (Chris, 9 Nov 2026: "You shouldn't need a subscription to
// harvest penalty goals"). Stored by public.penalty_import_store
// (supabase/migrations/20261109110000_penalty_events.sql), which matches
// teams and players to ours.
//
//   POST { mode?: "auto" | "daily" | "backfill", from?: "YYYY-MM-DD", to?: "YYYY-MM-DD" }
//
//   daily     the last 4 dates (late fixtures and corrections land)
//   backfill  every date from the season start (or from/to)
//   auto      backfill while this season has no rows, else daily
//
// One request per date: site.api.espn.com/.../soccer/eng.1/scoreboard?dates=.
// Every goal is kept (with ESPN's penaltyKick and ownGoal flags) so a
// mismatch with FPL's goal counts shows up. The distinct detail type texts
// are logged on the run, so a change in ESPN's format is visible.
//
// Called by pg_cron (private.penalty_import_call, worker token in
// x-social-token) or by an admin JWT.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard";
const SEASON_START = "2026-08-21";
const DAILY_DAYS = 4;
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

const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 86_400_000).toISOString().slice(0, 10);
const today = () => new Date().toISOString().slice(0, 10);

// deno-lint-ignore no-explicit-any
type Any = any;

async function day(date: string) {
  const r = await fetch(`${BASE}?dates=${date.replaceAll("-", "")}&limit=50`, {
    headers: { Accept: "application/json", "User-Agent": "fixtureshark-data" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`ESPN ${date}: HTTP ${r.status}`);
  const j: Any = await r.json();
  const matches: Record<string, unknown>[] = [];
  const goals: Record<string, unknown>[] = [];
  const types = new Set<string>();
  for (const ev of j?.events ?? []) {
    const c: Any = ev?.competitions?.[0];
    if (!c) continue;
    const teams = new Map<string, Any>();
    for (const t of c.competitors ?? []) teams.set(String(t.team?.id ?? t.id), t);
    const home = [...teams.values()].find((t) => t.homeAway === "home");
    const away = [...teams.values()].find((t) => t.homeAway === "away");
    const completed = !!c.status?.type?.completed;
    matches.push({
      espn_event_id: String(ev.id), date: String(ev.date ?? c.date ?? "").slice(0, 10), kickoff: ev.date ?? null, completed,
      home: home?.team?.displayName ?? null, away: away?.team?.displayName ?? null,
      home_score: home?.score != null ? Number(home.score) : null, away_score: away?.score != null ? Number(away.score) : null,
    });
    for (const d of c.details ?? []) {
      const text = String(d?.type?.text ?? "");
      if (text) types.add(text);
      const penaltyText = /penalty/i.test(text);
      if (!d?.scoringPlay && !penaltyText) continue;
      if (d?.shootout) continue;
      const a = d?.athletesInvolved?.[0];
      const team = teams.get(String(d?.team?.id ?? a?.team?.id ?? ""));
      goals.push({
        espn_event_id: String(ev.id),
        team: team?.team?.displayName ?? null,
        player: a?.displayName ?? a?.fullName ?? null,
        espn_player_id: a?.id != null ? String(a.id) : null,
        minute: String(d?.clock?.displayValue ?? ""),
        clock_seconds: d?.clock?.value != null ? Number(d.clock.value) : null,
        scoring: !!d?.scoringPlay,
        penalty: d?.penaltyKick === true || penaltyText,
        own_goal: d?.ownGoal === true || /own goal/i.test(text),
        type_text: text || null,
      });
    }
  }
  return { matches, goals, types: [...types] };
}

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
  const body: Any = await req.json().catch(() => ({}));
  let mode = ["daily", "backfill", "auto"].includes(body?.mode) ? String(body.mode) : "auto";
  const startedAt = new Date().toISOString();
  const warnings: string[] = [];
  const store = async (payload: Record<string, unknown>) => {
    const { data, error } = await sb.rpc("penalty_import_store", { p_run: { started_at: startedAt, mode, triggered_by: body?.triggered_by ?? null, warnings, ...payload } });
    return error ? { error: error.message } : data;
  };

  try {
    if (mode === "auto") {
      const { data: n } = await sb.rpc("penalty_import_rows");
      mode = Number(n ?? 0) === 0 ? "backfill" : "daily";
    }
    const last = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.to ?? "")) ? String(body.to) : today();
    const first = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.from ?? "")) ? String(body.from)
      : mode === "backfill" ? SEASON_START : addDays(last, -(DAILY_DAYS - 1));
    const dates: string[] = [];
    for (let d = first; d <= last && dates.length < 400; d = addDays(d, 1)) dates.push(d);

    const matches: Record<string, unknown>[] = [], goals: Record<string, unknown>[] = [];
    const types = new Set<string>();
    let requests = 0;
    for (let i = 0; i < dates.length; i += PARALLEL) {
      const batch = await Promise.allSettled(dates.slice(i, i + PARALLEL).map((d) => day(d)));
      requests += batch.length;
      batch.forEach((b, k) => {
        if (b.status === "fulfilled") {
          matches.push(...b.value.matches); goals.push(...b.value.goals); b.value.types.forEach((t) => types.add(t));
        } else warnings.push(`${dates[i + k]}: ${String(b.reason).slice(0, 160)}`);
      });
    }
    if (requests > 0 && warnings.length === requests) throw new Error(`every request failed: ${warnings[0]}`);
    return json(await store({ from_date: first, to_date: last, api_requests: requests, matches, goals, detail_types: [...types] }));
  } catch (e) {
    return json(await store({ error: String(e).slice(0, 500) }));
  }
});
