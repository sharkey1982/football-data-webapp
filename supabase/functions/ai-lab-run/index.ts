// ============================================================================
// supabase/functions/ai-lab-run/index.ts
//
// AI Lab, Experiment 001 (docs/ai-lab/design.md). Answers ONE question with
// a model + prompt version, using FixtureShark tools, and records everything:
// the run, every tool call and the exact data returned, tokens and cost,
// ground truth captured now (benchmark questions), and automatic checks.
//
//   POST { question?: string, question_id?: string, model?: string,
//          prompt_id?: string, batch_id?: number }
//
// Callers: a signed-in admin (the /admin/ai-lab page), or a holder of the
// internal run token stored in ai_lab_settings (the batch queue,
// ai_lab_process_queue(), and testing). The
// Anthropic key never leaves this function (secret ANTHROPIC_API_KEY).
//
// Structure: provider adapters (only Anthropic so far) behind one interface;
// the tool loop, tools and grading are provider-independent.
// ============================================================================
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

const TOOLSET_VERSION = "ai_tools_v1";
const MAX_ROUNDS = 8;
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ai-lab-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------------------------------------------------------------- models
// USD per million tokens (platform.claude.com pricing, checked 2026-09-26).
const MODELS: Record<string, { provider: "anthropic"; in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-sonnet-5": { provider: "anthropic", in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { provider: "anthropic", in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-haiku-4-5-20251001": { provider: "anthropic", in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};
const DEFAULT_MODEL = "claude-sonnet-5";

// ---------------------------------------------------------------- tools
// Provider-neutral definitions (JSON Schema). The descriptions are part of
// what the model reads, so changing them means a new TOOLSET_VERSION.
type ToolSpec = { name: string; description: string; parameters: Record<string, unknown> };
const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });

const TOOLS: ToolSpec[] = [
  { name: "find_entity", description: "Look up a team, competition or FPL player by name. Returns the matching entity, or candidates when the name is ambiguous.",
    parameters: { type: "object", properties: { name: str("Name as the user wrote it"), kind: { type: "string", enum: ["any", "team", "competition", "player"] } }, required: ["name"] } },
  { name: "get_fixtures", description: "Upcoming (not yet played) fixtures for a team and/or competition, soonest first. Kick-off times are UK local time. Use get_results for played matches.",
    parameters: { type: "object", properties: { team: str("Team name"), competition: str("Competition name or code, e.g. Premier League"), from_date: str("YYYY-MM-DD, default today"), to_date: str("YYYY-MM-DD"), limit: int("Default 5, max 20") } } },
  { name: "get_results", description: "Played matches with full-time and half-time scores, most recent first. Can filter by team, opponent (head-to-head), competition, season and venue.",
    parameters: { type: "object", properties: { team: str("Team name"), opponent: str("Opponent name, for head-to-head"), competition: str("Competition name or code"), season: str("e.g. 2025/26, 'current' or 'last'; needs competition"), venue: { type: "string", enum: ["any", "home", "away"] }, limit: int("Default 10, max 50") } } },
  { name: "get_league_table", description: "League table for a competition and season, including any points deductions.",
    parameters: { type: "object", properties: { competition: str("Competition name or code"), season: str("e.g. 2025/26; default current") }, required: ["competition"] } },
  { name: "get_competition_summary", description: "Season totals for a competition: matches played, total goals, goals per game, home/draw/away results.",
    parameters: { type: "object", properties: { competition: str("Competition name or code"), season: str("e.g. 2025/26; default current") }, required: ["competition"] } },
  { name: "get_fpl_players", description: "Official Fantasy Premier League data for players: price, points, minutes, goals, assists, xG, defensive contribution points, availability status and news. Current season by default; past seasons give final totals.",
    parameters: { type: "object", properties: { player: str("Player name"), team: str("Team name"), position: { type: "string", enum: ["GK", "DEF", "MID", "FWD"] }, season: str("e.g. 2025/26, 'last'; default current"), availability: { type: "string", enum: ["any", "injured_doubtful_or_suspended", "not_available"] }, sort_by: { type: "string", enum: ["total_points", "price", "minutes", "goals", "assists", "expected_goals", "goals_minus_xg", "defensive_contribution_points", "selected_by_percent"] }, limit: int("Default 10, max 30") } } },
  { name: "get_fpl_projections", description: "FixtureShark's projected FPL points (model estimates, not FPL data) for the next gameweek by default, summed over one or more gameweeks. Filters: player, team, position, max price.",
    parameters: { type: "object", properties: { gameweek: int("Starting gameweek; default next"), gameweeks: int("How many gameweeks to sum, default 1, max 6"), player: str("Player name"), team: str("Team name"), position: { type: "string", enum: ["GK", "DEF", "MID", "FWD"] }, max_price: { type: "number", description: "Maximum price in £m" }, limit: int("Default 10, max 30") } } },
  { name: "get_club_accounts", description: "Published statutory accounts for a club from Companies House filings: revenue (matchday, broadcast, commercial), staff costs, profit, cash, borrowings. Set include_sources to get the filing and the original figure for each metric.",
    parameters: { type: "object", properties: { team: str("Club name"), years: int("How many most recent years, default 1, max 10"), include_sources: { type: "boolean" } }, required: ["team"] } },
  { name: "get_tv_listings", description: "UK TV and streaming listings for upcoming fixtures: broadcaster, service, whether free or subscription, and confirmed not-televised games (including the Saturday 3pm blackout).",
    parameters: { type: "object", properties: { team: str("Team name"), from_date: str("YYYY-MM-DD"), to_date: str("YYYY-MM-DD"), limit: int("Default 5, max 20") } } },
  { name: "get_data_status", description: "What FixtureShark covers (competitions and seasons) and when each kind of data was last updated.",
    parameters: { type: "object", properties: {} } },
];
const DEFAULT_LIMITS: Record<string, number> = { get_fixtures: 5, get_results: 10, get_fpl_players: 10, get_fpl_projections: 10, get_tv_listings: 5 };

const SUBMIT: ToolSpec = {
  name: "submit_answer",
  description: "Submit your final answer. Call exactly once, at the end.",
  parameters: {
    type: "object",
    properties: {
      answer: str("The final answer for the user, in plain English"),
      answer_type: { type: "string", enum: ["answered", "partial", "refused"], description: "refused = you could not or would not answer" },
      facts_used: {
        type: "array",
        description: "Every number, name or date the answer relies on",
        items: { type: "object", properties: { value: str("The value exactly as it appears in the tool result"), meaning: str("What it is"), tool: str("Tool it came from") }, required: ["value", "meaning", "tool"] },
      },
    },
    required: ["answer", "answer_type", "facts_used"],
  },
};

// ---------------------------------------------------------------- provider
type ToolCall = { id: string; name: string; input: Record<string, unknown> };
type Turn = { text: string; toolCalls: ToolCall[]; stop: string; raw: unknown;
              usage: { in: number; out: number; cacheRead: number; cacheWrite: number } };
interface Provider {
  name: string;
  // messages are kept in the provider's own format; the adapter appends to them.
  start(question: string): unknown[];
  turn(system: string, messages: unknown[], tools: ToolSpec[], model: string): Promise<Turn>;
  addToolResults(messages: unknown[], turn: Turn, results: { id: string; content: string; isError?: boolean }[]): void;
}

class ProviderError extends Error {}

const anthropic: Provider = {
  name: "anthropic",
  start: (question) => [{ role: "user", content: question }],
  async turn(system, messages, tools, model) {
    const key = Deno.env.get("ANTHROPIC_API_KEY");
    if (!key) throw new ProviderError("ANTHROPIC_API_KEY is not set in Supabase Edge Function secrets.");
    const body = {
      model, max_tokens: 2000,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      tools: tools.map((t, i) => ({ name: t.name, description: t.description, input_schema: t.parameters,
        ...(i === tools.length - 1 ? { cache_control: { type: "ephemeral" } } : {}) })),
      messages,
    };
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) throw new ProviderError(`Anthropic API key expired or invalid (${res.status}). Replace ANTHROPIC_API_KEY in Supabase Edge Function secrets.`);
    if (!res.ok) throw new ProviderError(`Anthropic API error ${res.status}: ${JSON.stringify(data?.error ?? data).slice(0, 400)}`);
    const content = data.content ?? [];
    return {
      text: content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n"),
      toolCalls: content.filter((b: any) => b.type === "tool_use").map((b: any) => ({ id: b.id, name: b.name, input: b.input ?? {} })),
      stop: data.stop_reason,
      raw: content,
      usage: { in: data.usage?.input_tokens ?? 0, out: data.usage?.output_tokens ?? 0,
               cacheRead: data.usage?.cache_read_input_tokens ?? 0, cacheWrite: data.usage?.cache_creation_input_tokens ?? 0 },
    };
  },
  addToolResults(messages, turn, results) {
    messages.push({ role: "assistant", content: turn.raw });
    messages.push({ role: "user", content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })) });
  },
};
const PROVIDERS: Record<string, Provider> = { anthropic };

// ---------------------------------------------------------------- grading
function norm(v: unknown): string {
  return String(v ?? "").toLowerCase().replace(/[£$€,%]/g, "").trim();
}

function grade(q: any, run: any, steps: any[]): { checks: Record<string, { pass: boolean; detail: string }>; passed: number; total: number } {
  const checks: Record<string, { pass: boolean; detail: string }> = {};
  const refuse = String(q?.expected_behaviour ?? "").startsWith("refuse");
  checks.completed = { pass: !run.error, detail: run.error ?? "no error" };
  checks.submitted_answer = { pass: run.answer_type != null, detail: run.answer_type ? "used submit_answer" : "ended without submit_answer" };
  if (q) {
    const ok = refuse ? run.answer_type === "refused" : run.answer_type === "answered" || run.answer_type === "partial";
    checks.expected_behaviour = { pass: ok, detail: `expected ${q.expected_behaviour}, got ${run.answer_type ?? "none"}` };
  }
  const dataCalls = steps.filter((s) => s.tool_name !== "submit_answer");
  if (!refuse) checks.used_tools = { pass: dataCalls.length > 0, detail: `${dataCalls.length} data tool call(s)` };
  const corpus = norm(JSON.stringify(dataCalls.map((s) => s.result)));
  const facts: any[] = Array.isArray(run.facts_used) ? run.facts_used : [];
  const ungrounded = facts.filter((f) => { const v = norm(f?.value); return v.length > 0 && !corpus.includes(v); });
  checks.facts_grounded = { pass: ungrounded.length === 0,
    detail: ungrounded.length ? `not found in tool results: ${ungrounded.map((f) => JSON.stringify(f.value)).join(", ")}` : `${facts.length} fact(s) all found in tool results` };
  const secret = /sk-ant-[a-z0-9_-]{10,}|eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}|service_role_key/i.test(run.answer ?? "");
  checks.no_secrets = { pass: !secret, detail: secret ? "answer contains something that looks like a key" : "none" };
  const vals = Object.values(checks);
  return { checks, passed: vals.filter((c) => c.pass).length, total: vals.length };
}

// ---------------------------------------------------------------- handler
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function authorise(req: Request, sb: SupabaseClient): Promise<{ ok: boolean; userId: string | null; why?: string }> {
  const token = req.headers.get("x-ai-lab-token");
  if (token) {
    const { data } = await sb.from("ai_lab_settings").select("value").eq("key", "internal_run_token").maybeSingle();
    return data?.value && token === data.value ? { ok: true, userId: null } : { ok: false, userId: null, why: "bad internal token" };
  }
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return { ok: false, userId: null, why: "not signed in" };
  const { data: u } = await sb.auth.getUser(jwt);
  if (!u?.user) return { ok: false, userId: null, why: "not signed in" };
  const { data: au } = await sb.from("app_users").select("is_admin").eq("user_id", u.user.id).maybeSingle();
  return au?.is_admin ? { ok: true, userId: u.user.id } : { ok: false, userId: u.user.id, why: "admin only" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const auth = await authorise(req, sb);
  if (!auth.ok) return json({ error: auth.why }, 403);

  const body = await req.json().catch(() => ({}));
  const model: string = body.model ?? DEFAULT_MODEL;
  const promptId: string = body.prompt_id ?? "analyst_v1";
  const cfg = MODELS[model];
  if (!cfg) return json({ error: `Unknown model ${model}. Known: ${Object.keys(MODELS).join(", ")}` }, 400);
  const provider = PROVIDERS[cfg.provider];

  // Spend guard: recorded cost this calendar month.
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
  const [{ data: limitRow }, { data: spentRows }] = await Promise.all([
    sb.from("ai_lab_settings").select("value").eq("key", "monthly_cost_limit_usd").maybeSingle(),
    sb.from("ai_runs").select("cost_usd").gte("created_at", monthStart),
  ]);
  const spent = (spentRows ?? []).reduce((a: number, r: any) => a + Number(r.cost_usd ?? 0), 0);
  const limit = Number(limitRow?.value ?? 20);
  if (spent >= limit) return json({ error: `Monthly AI Lab limit reached: $${spent.toFixed(2)} of $${limit}.` }, 429);

  // Question: benchmark or free text.
  let q: any = null;
  let question: string = body.question ?? "";
  if (body.question_id) {
    const { data } = await sb.from("ai_benchmark_questions").select("*").eq("question_id", body.question_id).maybeSingle();
    if (!data) return json({ error: `Unknown question_id ${body.question_id}` }, 400);
    q = data; question = data.question;
  }
  if (!question.trim()) return json({ error: "question or question_id is required" }, 400);

  const { data: prompt } = await sb.from("ai_prompt_versions").select("body").eq("prompt_id", promptId).maybeSingle();
  if (!prompt) return json({ error: `Unknown prompt_id ${promptId}` }, 400);
  const today = new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const system = `${prompt.body}\n\nToday's date: ${today} (UK).`;

  // Tool loop.
  const started = Date.now();
  const steps: any[] = [];
  const usage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
  const messages = provider.start(question);
  let submitted: any = null;
  let finalText = "";
  let stop = "";
  let rounds = 0;
  let error: string | null = null;
  try {
    while (rounds < MAX_ROUNDS && !submitted) {
      rounds++;
      const turn = await provider.turn(system, messages, [...TOOLS, SUBMIT], model);
      usage.in += turn.usage.in; usage.out += turn.usage.out; usage.cacheRead += turn.usage.cacheRead; usage.cacheWrite += turn.usage.cacheWrite;
      stop = turn.stop; finalText = turn.text || finalText;
      if (!turn.toolCalls.length) break;
      const results: { id: string; content: string; isError?: boolean }[] = [];
      for (const call of turn.toolCalls) {
        const t0 = Date.now();
        if (call.name === "submit_answer") {
          submitted = call.input;
          steps.push({ step_no: steps.length + 1, tool_name: call.name, arguments: call.input, result: null, latency_ms: 0, error: null });
          results.push({ id: call.id, content: "Received." });
          continue;
        }
        const spec = TOOLS.find((t) => t.name === call.name);
        let result: any = null; let err: string | null = null;
        if (!spec) { err = `Unknown tool ${call.name}`; }
        else {
          const { data, error: e } = await sb.rpc(`ai_tool_${call.name}`, { args: call.input ?? {} });
          if (e) err = e.message; else result = data;
          const lim = Number((call.input as any)?.limit ?? DEFAULT_LIMITS[call.name] ?? 0);
          if (result && Array.isArray(result.rows) && lim > 0 && result.rows.length >= lim) {
            result.possibly_truncated = `Returned the maximum ${lim} rows; there may be more. Increase limit or narrow the filters.`;
          }
        }
        steps.push({ step_no: steps.length + 1, tool_name: call.name, arguments: call.input, result, latency_ms: Date.now() - t0, error: err });
        results.push({ id: call.id, content: err ? JSON.stringify({ error: err }) : JSON.stringify(result), isError: !!err });
      }
      if (submitted) break;
      provider.addToolResults(messages, turn, results);
    }
    if (!submitted && rounds >= MAX_ROUNDS) error = `Stopped after ${MAX_ROUNDS} rounds without submit_answer.`;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const cost = (usage.in * cfg.in + usage.out * cfg.out + usage.cacheRead * cfg.cacheRead + usage.cacheWrite * cfg.cacheWrite) / 1e6;
  const run = {
    batch_id: body.batch_id ?? null, question_id: q?.question_id ?? null, question_version: q?.version ?? null,
    question, provider: provider.name, model, prompt_id: promptId, toolset_version: TOOLSET_VERSION,
    answer: submitted?.answer ?? (finalText || null), answer_type: submitted?.answer_type ?? null,
    facts_used: submitted?.facts_used ?? null, stop_reason: stop, rounds,
    input_tokens: usage.in, output_tokens: usage.out, cache_read_tokens: usage.cacheRead, cache_write_tokens: usage.cacheWrite,
    cost_usd: Number(cost.toFixed(5)), latency_ms: Date.now() - started, error, created_by: auth.userId,
  };
  const { data: saved, error: saveErr } = await sb.from("ai_runs").insert(run).select("run_id").single();
  if (saveErr) return json({ error: `Could not save run: ${saveErr.message}`, run, steps }, 500);
  const runId = saved.run_id;
  if (steps.length) await sb.from("ai_run_steps").insert(steps.map((s) => ({ run_id: runId, ...s })));
  // Batch queue (ai_batch_items): this question is done for its batch.
  if (run.batch_id && run.question_id) {
    await sb.from("ai_batch_items").update({ status: "done", run_id: runId })
      .eq("batch_id", run.batch_id).eq("question_id", run.question_id);
  }

  let truth: unknown = null;
  if (q?.ground_truth_sql) {
    const { data, error: te } = await sb.rpc("ai_benchmark_truth", { p_question_id: q.question_id });
    truth = te ? { error: te.message } : data;
    await sb.from("ai_run_truth").insert({ run_id: runId, truth });
  }
  const g = grade(q, run, steps);
  await sb.from("ai_auto_grades").insert({ run_id: runId, grader: "checks_v1", checks: g.checks, passed: g.passed, total: g.total });

  return json({ run_id: runId, run, steps, truth, grade: g });
});
