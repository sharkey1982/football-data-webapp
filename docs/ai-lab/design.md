# AI Lab: design for approval

Status: **proposed, 2026-09-26**. Nothing in this document has been built except the benchmark table (`ai_benchmark_questions`, PR #107) and the data catalogue it depends on (PR #106). The rest waits for approval.

The goal is not a chatbot. It is a controlled FixtureShark environment for learning how AI applications are built, measured and improved: prompting, tool calling, structured output, evals, human review, model comparison, and later retrieval and optimisation. Each stage should be small enough that its results can be explained.

---

## 1. Where it fits

```
/admin/ai-lab (React, admin only)          /review (React, reviewers only)
        │  user JWT                               │  user JWT
        ▼                                         ▼
Supabase Edge Function  ai-lab-run         Supabase tables (RLS)
  ├─ checks caller is admin                  ai_human_reviews …
  ├─ provider adapter ── Claude API (key in Edge Function secret)
  ├─ tool executor ───── fixed, parameterised queries (service role)
  └─ writes run + steps + truth + grades to ai_* tables
```

- **Edge Function, not Netlify.** It sits next to the data, holds the key as a Supabase secret, and costs no Netlify credits. The website never sees the key.
- **Nothing existing changes.** The Lab only reads through its own tool queries and writes to its own `ai_*` tables. Ingestion, predictions, FPL and the public pages are untouched.
- **The catalogue is the boundary.** A tool may only read objects that `meta_flow_nodes` marks `ai_relevant = true` and `status = 'current'`. The daily `catalogue_current` check flags any of them whose definition changes, so a tool can't silently start reading something different.

## 2. Tables (minimal)

| Table | One row per | Key columns |
|---|---|---|
| `ai_benchmark_questions` *(exists)* | test question | question, category, difficulty, expected behaviour, expected objects, `ground_truth_sql`, must include / must not claim, **`version`** (bumps on any wording or grading change). Add: `expected_entities`, `volatility` (stable / live). |
| `ai_prompt_versions` | prompt version | `prompt_id` (e.g. `analyst_v1`), text, created_at. **Immutable**: a trigger refuses edits, so a changed prompt must be a new id. |
| `ai_batches` | experiment run | name (`exp001`), provider, model, prompt_id, toolset version, **as_of** timestamp, question set, total cost, notes |
| `ai_runs` | one question answered | batch (nullable for ad hoc runs), question_id + question version (or free text), provider, model, prompt_id, final answer, structured output, stop reason, input/output tokens, cost, latency, error |
| `ai_run_steps` | tool call | run, step number, tool name, arguments, result (the exact data the model saw), latency, error |
| `ai_run_truth` | run | ground-truth rows captured **at the moment the run was graded**, and when |
| `ai_auto_grades` | run × grader | grader (`checks_v1`, later `judge_v1`), individual check results, score |
| `ai_human_reviews` | run × reviewer | factually correct (yes / unsure / no), usefulness 1–5, unsupported claims, comment, ideal answer; unique per reviewer and run |
| `ai_pairwise_reviews` *(later)* | reviewer judgement | run A, run B, order shown, preference −2…+2. Designed now so nothing blocks it; not built yet. |

Reviewers: add a `role` column to `app_users` (`admin` / `reviewer` / `user`). The sign-up allowlist (`admin_bootstrap_emails`) already stops strangers from creating accounts.

## 3. Provider abstraction

One small interface in the Edge Function:

```ts
interface Provider {
  name: 'anthropic' | 'openai' | 'google';
  run(req: { system: string; messages: Msg[]; tools: ToolSpec[]; model: string; maxTokens: number })
    : Promise<{ blocks: Block[]; toolCalls: ToolCall[]; usage: { in: number; out: number }; stop: string }>;
}
```

- Tools are defined **once**, as provider-neutral JSON Schema. Each adapter translates to its provider's format.
- The tool loop (ask → execute tools → return results → repeat, maximum 6 rounds) lives outside the adapters, so every provider is tested the same way.
- Only the Claude adapter is built now. GPT and Gemini are later adapters plus an extra secret each, with no other changes.

## 4. First tools (10)

Each tool is a fixed, parameterised query over catalogued objects. The model never writes SQL. Results are small and deterministic, and each carries its **source object**, **as-of time** and whether the values are **observed** or **model estimates**.

| Tool | Answers | Reads |
|---|---|---|
| `find_entity(name, kind?)` | "Which Arsenal / which Palmer?" Returns ids plus candidates when a name is ambiguous | `teams`, `team_aliases`, `search_players`, `leagues` |
| `get_fixtures(team?, competition?, from?, to?, status?, limit?)` | Next / previous fixtures, with scores where played | `fixtures`, `matches` |
| `get_team_results(team, last_n?, venue?, competition?)` | Form, record, goals for/against | `matches` |
| `get_league_table(competition, season?)` | Standings including point deductions | `league_standings` |
| `get_fpl_player(player)` | FPL price, points, minutes, xG/xA, status, news, this season and past seasons | `fpl_players`, `fpl_player_season_totals`, `get_player_career` |
| `get_fpl_projections(gameweek?, position?, max_price?, team?, limit?)` | FixtureShark's projected points (**model estimates**) | `fpl_projection_frontend_feed_v6` |
| `get_club_accounts(team, years?)` | Published club accounts and where each figure came from | `finance_published_periods`, `finance_published_provenance`, `finance_metric_dictionary` |
| `get_data_status()` | What's covered and how fresh it is | `matches`, `fixtures`, `model_fit_runs`, `fpl_players`, `fpl_player_projections`, `fixture_broadcasts` |
| `get_competition_summary(competition, season?)` | Goals per game, results split | `matches` |
| `get_tv_listings(team?, from?, to?)` | UK TV for upcoming fixtures, incl. the 3pm blackout | `upcoming_watch_guide` |

As built (toolset `ai_tools_v1`, migration `20260926211000_ai_lab_tools.sql`): `get_fixtures` covers upcoming fixtures only and `get_results` covers played matches (the head-to-head question needs past seasons, which `fixtures` doesn't hold); `get_fpl_player` became `get_fpl_players` so one call can answer "which Newcastle players are injured"; `get_competition_summary` and `get_tv_listings` were added because Experiment 001 includes B10 and I41.

Deliberately left out for Experiment 001: match predictions, model internals, lineups and set pieces, the Watch Guide, and anything that recommends. These come in Experiment 002 and later, once factual retrieval is shown to work.

## 5. The `/admin/ai-lab` page

A developer console, not a chat window.

- **Run panel:** question (free text, or pick a benchmark question), provider, model, prompt version, Run.
- **Trace:** each tool call with its arguments and the exact JSON returned, in order, with timings.
- **Answer:** the final text and any structured output.
- **Meter:** latency, input/output tokens, cost.
- **Grading:** automatic checks with pass/fail per check, the ground truth captured for this run, and your review form.
- **Batches tab:** run a question set with one configuration, then compare batches side by side (score, cost, latency), with a per-question drill-down.

## 6. Review and evaluation

- **Automatic checks (objective):**
  - Were the expected tools called?
  - Was the right entity identified (the id in the tool arguments matches the ground truth)?
  - Was the expected behaviour followed (answered or refused)?
  - Is anything from `must_not_claim` present?
- **Checking numbers in free text is unreliable.** So from Experiment 001 the model will also return a small structured `facts_used` list (value, what it is, which tool it came from) alongside the prose. Numbers can then be checked against the tool results and the ground truth mechanically. This brings a little of "structured output" forward, because the grading depends on it.
- **Human review (judgement):** you first, then reviewers. Reviewer mode (`/review`) shows only the question and answer, plus the form. No prompts, traces, keys or admin controls. Several reviewers per run allows agreement to be measured.
- **LLM-as-judge:** later, and only trusted to the extent it agrees with the human reviews on the same runs.

## 7. Security

- **The API key** lives only in the Supabase secret `ANTHROPIC_API_KEY`. It is never sent to the browser, logged, or stored in a table.
- **Callers:** the Edge Function checks the caller's JWT, and only `is_admin()` can run the model. Reviewers can only read the runs assigned to them and write their own reviews (RLS). They can never trigger model calls, so they can never spend money.
- **No SQL from the model:** tools are fixed queries with typed arguments, and only catalogue objects marked `ai_relevant` are read. The benchmark table is admin-only and never exposed as a tool, so the model can't see the answers.
- **Injection through data:** some fields contain outside text (FPL news, broadcast notes). The system prompt treats tool results as data, never instructions, and J50 plus future adversarial questions test this.
- **Spend:**
  - the $25/month workspace cap in the Console;
  - a per-batch estimate shown before running;
  - a hard stop in the function if month-to-date recorded cost passes a limit set in the database.

## 8. Keeping results meaningful as the data changes

The football data changes every day, so a stored "correct answer" goes stale. The design handles this in four ways:

1. **Ground truth is a live query** (`ground_truth_sql`), captured into `ai_run_truth` at grading time. Each run is judged against the truth at the moment it ran, and that record never changes. So a run from today stays interpretable next year.
2. **Everything the model saw is stored** (`ai_run_steps`). Any answer can be explained after the fact, even once the underlying tables have moved on.
3. **Comparisons are made within a batch.** Prompt v1 and v2, or Claude and GPT, are compared by running them in the same batch window, so the data they faced was the same. Comparing batches from different weeks is labelled as such.
4. **A stable subset.** Questions about completed seasons ("last season's top scorer", "Arsenal's 2024/25 revenue") are tagged `stable`; their truth never changes. They form a regression set whose scores are comparable across any dates.

True replay of an old day's data isn't possible in general, because most tables are overwritten. FPL projections are the exception: `fpl_projection_snapshots` (from gameweek 6) preserves pre-deadline projections, which later allows honest "what did the model say before kick-off" questions.

## 9. Cost

Claude Sonnet 5 is $2 per million input tokens and $10 per million output tokens (Opus 5.5 is $4 / $20, Haiku 4.5 is $1 / $5).

- A factual question with 2–3 tool rounds is roughly 10–15k input tokens and about 600 output tokens: **about 3–4p on Sonnet**.
- Experiment 001 (21 questions) costs **about 30p to £1 per batch**. The first real run (A01) cost $0.014: 2 rounds, 1 tool call, 5.6 seconds.
- The full 50 costs about £2.
- Prompt caching of the system prompt and tool definitions cuts repeat input cost by up to 90%.
- The $25 cap covers roughly 20 full-benchmark batches a month on Sonnet.

## 10. Experiment 001: plan

**Question:** can Claude answer about 20 factual FixtureShark questions reliably, using tools, without inventing anything?

**Questions (21):**
- Fixtures and results: A01–A05
- Standings: B06, B09, B10
- FPL facts: E21, E22, E23, F26 (the projection is read as a fact: "what does FixtureShark project?")
- Availability: G33
- Finance: H36, H39
- Watch guide: I41
- Data status: I43, I45
- Refusals: J46, J49, J50

**What it measures:**
- entity recognition;
- tool choice;
- arguments;
- factual accuracy against the captured truth;
- observed vs estimate labelling;
- unsupported claims;
- refusals.

**Build steps, each ending with a short "what this taught us" note:**

1. Tables from section 2 (without reviewer mode) and prompt `analyst_v1`, stored and immutable.
2. Edge Function with the Claude adapter, the 8 tools and run logging. Test one question end to end, with you watching the trace.
3. `/admin/ai-lab` run panel and trace view.
4. Automatic checks plus truth capture. Run the batch. You review all 22 answers.
5. **Readout:** where it failed, why (wrong tool, wrong entity, misread data, invented facts), and which one change would fix the biggest failure class. That change becomes `analyst_v2`, re-run in the same batch window.

**Success:** at least 90% factually correct on the answerable questions, 3 of 3 refusals correct, and zero invented numbers.

**Failure is also useful:** it tells us whether the problem is the tools (the data wasn't reachable), the prompt (behaviour), or the model (reasoning). Each has a different fix.

**Not in Experiment 001:** reviewer mode, pairwise review, LLM-as-judge, GPT/Gemini, retrieval, recommendations.

## Where this differs from the handoff brief

1. **Structured `facts_used` from the start.** Without it, "do the numbers match FixtureShark" can't be checked automatically.
2. **Retrieval (RAG) for finance is less obviously needed than the brief suggests.** The finance data is already structured figures from the filings' iXBRL. RAG only helps with the narrative text of annual reports, which FixtureShark doesn't store yet; that would be a new ingestion job first.
3. **Reviewer mode needs an auth change** (a reviewer role, and adding reviewers to the sign-up allowlist). That's why it waits until after Experiment 001.
4. **`expected_tools` becomes `expected_objects`.** The benchmark records the catalogue objects a correct answer needs rather than tool names, so questions stay valid when tools are renamed or split.
