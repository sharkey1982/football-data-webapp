# Live run (2026-10-11-1054, repeat 1)

- Results file: `results/runs/2026-10-11-1054-live-judge/live.json`
- Provider: claude-sonnet-5
- Run at: 2026-10-11T10:54:17.966Z
- Cases: 10; passed every objective check: **3/10 (30%)**

## Pass rate by check

| Check | Passed | Failed |
|---|---|---|
| output_structure | 4 | 6 |
| source_provenance | 3 | 7 |
| numerical_accuracy | 4 | 6 |
| missing_data | 4 | 6 |
| task_correctness | 4 | 6 |

## Failure categories (first failing check per case)

| Category | Cases |
|---|---|
| output_structure | 6 |
| source_provenance | 1 |

## Cases

| Case | Category | Result | Failed checks | Reasoning (advisory) | Usefulness (advisory) |
|---|---|---|---|---|---|
| T01 | captaincy | pass |  | 1 | 1 |
| T02 | comparison | pass |  | 1 | 1 |
| T03 | fdr | FAIL | **output_structure**: not a single JSON object (starts: "")<br>**source_provenance**: skipped: not a single JSON object (starts: "")<br>**numerical_accuracy**: skipped: not a single JSON object (starts: "")<br>**missing_data**: skipped: not a single JSON object (starts: "")<br>**task_correctness**: skipped: not a single JSON object (starts: "") | 0 | 0 |
| T04 | budget | FAIL | **output_structure**: not a single JSON object (starts: "")<br>**source_provenance**: skipped: not a single JSON object (starts: "")<br>**numerical_accuracy**: skipped: not a single JSON object (starts: "")<br>**missing_data**: skipped: not a single JSON object (starts: "")<br>**task_correctness**: skipped: not a single JSON object (starts: "") | 0 | 0 |
| T05 | injuries | FAIL | **output_structure**: not a single JSON object (starts: "{\n  \"answer\": \"Among the four, Tzolis is not likely to play ")<br>**source_provenance**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Among the four, Tzolis is not likely to play ")<br>**numerical_accuracy**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Among the four, Tzolis is not likely to play ")<br>**missing_data**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Among the four, Tzolis is not likely to play ")<br>**task_correctness**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Among the four, Tzolis is not likely to play ") | 1 | 0.9 |
| T06 | missing_data | pass |  | 1 | 1 |
| T07 | reddit | FAIL | **source_provenance**: did not cite required source(s) I.xp.gw8 | 1 | 0 |
| T08 | transfers | FAIL | **output_structure**: not a single JSON object (starts: "{\n  \"answer\": \"Based on FixtureShark's model, swapping Wissa")<br>**source_provenance**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Based on FixtureShark's model, swapping Wissa")<br>**numerical_accuracy**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Based on FixtureShark's model, swapping Wissa")<br>**missing_data**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Based on FixtureShark's model, swapping Wissa")<br>**task_correctness**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Based on FixtureShark's model, swapping Wissa") | 0.85 | 0.5 |
| T09 | fdr | FAIL | **output_structure**: not a single JSON object (starts: "{\n  \"answer\": \"Not quite. All four predictors beat a coin fl")<br>**source_provenance**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Not quite. All four predictors beat a coin fl")<br>**numerical_accuracy**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Not quite. All four predictors beat a coin fl")<br>**missing_data**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Not quite. All four predictors beat a coin fl")<br>**task_correctness**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"Not quite. All four predictors beat a coin fl") | 1 | 1 |
| T10 | captaincy | FAIL | **output_structure**: not a single JSON object (starts: "{\n  \"answer\": \"The projections favor Saka: he's projected fo")<br>**source_provenance**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"The projections favor Saka: he's projected fo")<br>**numerical_accuracy**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"The projections favor Saka: he's projected fo")<br>**missing_data**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"The projections favor Saka: he's projected fo")<br>**task_correctness**: skipped: not a single JSON object (starts: "{\n  \"answer\": \"The projections favor Saka: he's projected fo") | 0 | 1 |

## Tokens and cost

| | Tokens |
|---|---|
| Prompt | 21,567 |
| Completion | 13,448 |
| Total | 35,015 |

Cost: **$0.1776** for 10 cases ($0.0178 a case), at claude-sonnet-5 list prices ($2 / $10 per million input / output tokens).
