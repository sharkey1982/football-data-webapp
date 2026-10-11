# Live run (2026-10-11-1259, prompt v3, repeat 1)

- Results file: `results/runs/2026-10-11-1259-live-v3/live.json`
- Provider: claude-sonnet-5
- Run at: 2026-10-11T12:59:47.964Z
- Prompt: fpl_analyst_v3
- Answers graded: 4; passed every objective check: **1/4 (25%)**

## Pass rate by check

| Check | Passed | Failed |
|---|---|---|
| output_structure | 3 | 1 |
| source_provenance | 3 | 1 |
| numerical_accuracy | 1 | 3 |
| ranking_claims | 3 | 1 |
| missing_data | 3 | 1 |
| task_correctness | 3 | 1 |

## Failure categories (first failing check per case)

| Category | Cases |
|---|---|
| numerical_accuracy | 2 |
| truncated (hit max_tokens: harness setting, not a model error) | 1 |

## Cases

| Case | Category | Result | Failed checks |
|---|---|---|---|
| T03 | fdr | FAIL | **numerical_accuracy**: answer has number(s) not in the data or facts: 6.37, 6.12, 5.43, 4.79, 4.28, 4.49 |
| T04 | budget | FAIL | **numerical_accuracy**: answer has number(s) not in the data or facts: 0.9 |
| T08 | transfers | FAIL (truncated) | **output_structure**: not a single JSON object (starts: "{\n  \"answer\": \"Based on the FixtureShark projections, taking")<br>**source_provenance**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Based on the FixtureShark projections, taking")<br>**numerical_accuracy**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Based on the FixtureShark projections, taking")<br>**missing_data**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Based on the FixtureShark projections, taking")<br>**task_correctness**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Based on the FixtureShark projections, taking")<br>**ranking_claims**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Based on the FixtureShark projections, taking") |
| T10 | captaincy | pass |  |

## Tokens and cost

| | Tokens |
|---|---|
| Prompt | 12,837 |
| Completion | 22,292 |
| Total | 35,129 |

Cost: **$0.2486** for 4 cases ($0.0621 a case), at claude-sonnet-5 list prices ($2 / $10 per million input / output tokens).
