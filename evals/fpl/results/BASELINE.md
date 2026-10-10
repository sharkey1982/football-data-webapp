# Baseline, 10 Oct 2026

Prompt `fpl_analyst_v1`, ten cases, data frozen at the GW6 deadline (10 Oct 2026). Promptfoo 0.124.1, Node 22.22.0.

## 1. Harness baseline (run, no API calls)

Before trusting the checks on a model, they were run on answers whose correctness is known.

| Run | Result | Files |
|---|---|---|
| Reference answers (hand-written from the DATA blocks) | **10/10 cases pass all five checks** | `baseline-2026-10-10/offline-reference.json` |
| Same answers, one seeded fault each | **10/10 faults caught, each in its intended category** | `baseline-2026-10-10/offline-faulty.json` |

Seeded faults and what caught them:

| Case | Fault | Caught by |
|---|---|---|
| T01 | "high" confidence on a 0.06-point gap | task_correctness |
| T02 | 6.02 copied as 6.2 | numerical_accuracy |
| T03 | calculation cites a fixture id that doesn't exist | source_provenance (and the unsupported 2.21 in numerical_accuracy) |
| T04 | 5.27 + 5.05 stated as 10.52 | numerical_accuracy |
| T05 | JSON wrapped in a code fence | output_structure |
| T06 | invents 5.4 points for Watkins, who isn't in the data | missing_data and numerical_accuracy |
| T07 | Compare link dropped, 151 words against a 130 limit | task_correctness |
| T08 | recommends taking the −4 hit | task_correctness |
| T09 | an invented "40000 managers" figure | numerical_accuracy |
| T10 | required fields missing | output_structure |

Regenerate both with `npm run eval:offline`.

## 2. Model baseline (not yet run)

The live run against `claude-sonnet-5` has **not** been run. This workspace has no Anthropic API key: the AI Lab's key is a Supabase edge-function secret, which can't be read from outside Supabase, and the eval doesn't go through the edge function because that answers from live data rather than frozen snapshots.

Run it either from a shell with a key set (`npm run eval:live`), or with the **FPL evals (manual)** GitHub workflow in `live` mode once the `ANTHROPIC_EVAL_API_KEY` repository secret exists. The workflow commits its report to `results/runs/`.

**Expected cost per run** (estimated from the prompts' length at ~3.5 characters a token; the live run reports exact counts):

| | Tokens (est.) | Cost at $2 / $10 per M |
|---|---|---|
| Prompts (10 cases) | 15,355 | $0.031 |
| Answers (10 cases, reference length) | 3,824 | $0.038 |
| **Objective run** | **19,179** | **$0.069** |
| Judge run (20 short grading calls) | roughly 25,000 | roughly $0.08 |

So a full baseline with the judge costs about **$0.15 (12p)**. Real answers may be longer than the reference ones; budget $0.25.

## 3. What to look for in the first live run

The failure categories most likely to show up, from how the checks work:

- **numerical_accuracy**: rounded or reworded numbers in prose ("about 7 points", "94%") are allowed when they round from a real value; any figure the model calculates in prose without listing the calculation in `facts` will fail. Expect some of these at first. They point at prompt wording, not necessarily wrong numbers, and are worth reading case by case.
- **source_provenance**: citing ids that look right but don't exist (`P12.points` instead of `P12.xpts`).
- **task_correctness on T01/T10**: calling a 0.06 or 0.52 gap "high" confidence.
- **output_structure**: code fences around the JSON. The prompt forbids them; if it still happens, it's a real format failure for anything that parses the output automatically.

Record the first live result here (date, pass rate, failures by category, tokens, cost) and keep its JSON in `results/`.
