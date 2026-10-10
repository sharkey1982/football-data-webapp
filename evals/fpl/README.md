# FPL eval pilot (Promptfoo)

A development-only test suite for FixtureShark's AI-written FPL analysis. It asks a model ten representative FPL questions against **frozen** FixtureShark data and checks the answers with deterministic code: are the numbers right, can every number be traced to its source, is missing data admitted, is the output in the agreed shape, and is the recommendation the one the data supports.

Nothing here is part of the website. It has its own `package.json` (Promptfoo is a dev dependency of this folder only), it never connects to Supabase, and it changes no site code, schema, Netlify setting or scheduled job. It runs only when someone runs it.

## Quick start

Node 22.22 or newer (Promptfoo's requirement). From this folder:

```
cd evals/fpl
```

```
npm install --no-audit --no-fund
```

**Free check of the harness (no API calls):**

```
npm run eval:offline
```

This runs the suite against hand-written reference answers (all must pass) and against the same answers with one deliberate fault each (each must fail in the category it targets). Expected output ends with `reference: 10/10` and `seeded faults: 10/10`.

**Live run against the model (costs money, about $0.07–0.10 a run):**

Set the key for this shell only. Never put it in a file in the repo.

```
export ANTHROPIC_API_KEY=...
```

```
npm run eval:live
```

```
npm run report -- results/live-<stamp>.json
```

**Advisory quality judge on that run (about $0.10 more):**

```
npm run eval:judge -- results/live-<stamp>.json
```

```
npm run report -- results/live-<stamp>.json --judge results/live-<stamp>.judge.json
```

To measure run-to-run variation, repeat each case: `npm run eval:live -- --repeat 3` (three times the cost).

To browse results in Promptfoo's own viewer (local only):

```
PROMPTFOO_CONFIG_DIR=.promptfoo npx promptfoo view
```

## What's in the folder

| Path | What it is |
|---|---|
| `promptfooconfig.yaml` | Objective suite: prompt, provider (`anthropic:messages:claude-sonnet-5`, the AI Lab's default model), tests. The pass/fail verdict. |
| `promptfooconfig.judge.yaml` | Advisory LLM judge. Replays a saved run; never changes the objective verdict. |
| `prompts/` | `fpl_analyst_v1`: the AI Lab's `analyst_v1` rules plus a JSON output contract in which every fact carries its source id. |
| `fixtures/snapshots/` | Frozen data and `MANIFEST.json` (source tables, query time, hashes). See below. |
| `fixtures/reference/answers.json` | Hand-written correct answers, used only to test the checks. |
| `lib/snapshot.mjs` | Loads the snapshots and builds each case's DATA block, giving every value a source id such as `[P12.xpts]`. |
| `lib/cases.mjs` | The ten cases. Expected answers are **computed** from the snapshot, not typed in. |
| `tests/` | Turn the cases into Promptfoo tests (objective and judge). |
| `assertions/objective.mjs` | The deterministic checks. |
| `providers/` | Offline providers: `reference`, `faulty` (seeded faults), `replay` (re-reads a saved run). |
| `scripts/` | `run.mjs` (runs steps with the right environment), `report.mjs`, `self-test.mjs`, `check-snapshots.mjs`, `show-cases.mjs`. |
| `results/` | Saved runs and `BASELINE.md`. `results/scratch/` is ignored by git. |

## The data is frozen

Every input comes from files in `fixtures/snapshots/`, never from the live database, so a rerun next month asks exactly the same questions about exactly the same numbers.

- **`raw/gw6_players.psv`**: the GW6 pre-deadline capture (10 Oct 2026, 09:00 UTC; deadline 10:00 UTC) from `fpl_projection_snapshots` (model `leaguewide_v6`) joined to `fpl_deadline_player_state` taken at the same moment. 230 of 667 players.
- **`raw/gw6_10_fixtures.psv`**: GW6–10 fixtures with FPL's FDR, market-implied goals and Dixon-Coles goals as stored on 10 Oct.
- **`articles.json`**: fixed figures from the published FPL articles (Haaland history, the 9 Oct transfer projections, the xG v FDR study).

The two database files were checked byte for byte against an md5 computed in Postgres when they were captured. `npm run check:snapshots` (run automatically before every eval) fails if any file has changed.

**Never edit a snapshot in place.** To use newer data, capture a new dated file alongside the old ones, add it to `MANIFEST.json`, run `node scripts/check-snapshots.mjs --write`, and point new cases at it. Old cases keep their old data, so old and new runs stay comparable.

## The checks

Each case gets five deterministic checks. A case passes only if all five pass.

| Check | Fails when |
|---|---|
| `output_structure` | The output isn't one JSON object in the agreed shape (missing fields, wrong enums, code fences). |
| `source_provenance` | A fact cites a source id that isn't in the DATA block, or a required source isn't cited. |
| `numerical_accuracy` | A copied value differs from its source; a calculation (sum, difference, mean…) doesn't recompute; a number in the answer text can't be traced to the data or a checked calculation; a required figure (e.g. the best pair's total) is missing or wrong. |
| `missing_data` | The answer type is wrong for the data available, a missing item isn't named, or something is claimed about a player who isn't in the data. |
| `task_correctness` | The recommendation, ranking order or confidence contradicts what the data supports, required content (link, return date, break-even week) is missing, or the reply is over its word limit. |

The number tracing ignores gameweek numbers, dates, seasons, links, numbers from the question and whole numbers up to 10 (counts like "two options"). Everything else in the answer must match a value in the data (rounding and percentages allowed) or a calculation that recomputes correctly.

**The judge is separate on purpose.** `promptfooconfig.judge.yaml` scores reasoning and usefulness with an LLM rubric, on the exact outputs the objective run saw (replayed, not regenerated). Its scores appear beside the verdict in the report. A high judge score can't rescue a failed numerical check, because the two are different runs and only the objective run decides pass or fail.

## The ten cases

| Case | Area | What it tests |
|---|---|---|
| T01 | Captaincy | Mid-price shortlist where the top two are 0.06 apart: must pick Mbeumo and not claim high confidence. |
| T02 | Comparison | Barry v Gonzalo v Kostoulas: ranking, minutes risk. |
| T03 | FDR | FDR says Fulham; market and Dixon-Coles both say Man City then Arsenal. Applies the site's rule of claiming only where the two models agree. |
| T04 | Budget | Best two midfielders within £13.0m: an exact optimum (Tavernier + Ødegaard, 10.32). |
| T05 | Injuries | Three doubtful Arsenal players and one ruled out (Tzolis, back 24 Oct). |
| T06 | Missing data | Asks about Watkins, who isn't in the data: must answer for Saka only and say so. |
| T07 | Reddit | Draft reply on Isidor while Brobbey is out: under 130 words, the Compare Players link, the return date. |
| T08 | Transfers | Wissa → Calvert-Lewin for a −4 hit over five weeks: +2.39, so no; breaks even GW8, pays the hit GW12. |
| T09 | FDR | "FDR is useless": the study says it depends, and market goals beat both. |
| T10 | Captaincy | Haaland away at Liverpool v Saka at home: Saka by 0.52, a close call. |

`npm run cases` prints each case's computed expectations; `node scripts/show-cases.mjs --context T03` prints the DATA block the model sees.

## After a change, rerun

1. **Prompt change**: copy `prompts/system_fpl_analyst_v1.md` to a new version (`_v2`), point `promptfooconfig.yaml` at it, run `eval:live`, and compare the report with the last saved run. Keep old versions so results stay comparable.
2. **Model change**: edit the provider id in `promptfooconfig.yaml` (Promptfoo knows the prices of current Claude models), or compare two at once by listing both providers.
3. **Check change**: run `npm run eval:offline` first. Both lines must stay at 10/10; if a new check fails a reference answer, the check or the reference is wrong.
4. **New data**: add a new dated snapshot (above), never edit the old one.

Save each live run's JSON in `results/` with a short note in `BASELINE.md` (date, prompt, model, pass rate, cost).

## Adding a case

Add a block in `lib/cases.mjs`: build the DATA block from the snapshot with `Context`, compute what's expected from the same data, and add a reference answer to `fixtures/reference/answers.json`. If it introduces a new kind of mistake worth catching, add a seeded fault to `providers/faulty.mjs`. Then `npm run eval:offline` must show 100% on both lines.

## Cost and safety

- Live runs call the Anthropic API directly with the key in your shell. They do **not** go through the AI Lab edge function, so they don't appear in `ai_runs` and aren't counted by its monthly limit. Use a separate key with its own spend limit in the Anthropic console.
- Nothing runs on a schedule and there is no CI job. Promptfoo's telemetry, sharing and update checks are switched off by `scripts/run.mjs`, and its local database lives in `.promptfoo/` (ignored by git).
