# Offline reference run (2026-10-11-0003)

- Results file: `results/runs/2026-10-11-0003-offline/reference.json`
- Provider: reference-answers
- Run at: 2026-10-11T00:03:18.416Z
- Cases: 10; passed every objective check: **10/10 (100%)**

## Pass rate by check

| Check | Passed | Failed |
|---|---|---|
| output_structure | 10 | 0 |
| source_provenance | 10 | 0 |
| numerical_accuracy | 10 | 0 |
| missing_data | 10 | 0 |
| task_correctness | 10 | 0 |

## Failure categories (first failing check per case)

None.

## Cases

| Case | Category | Result | Failed checks |
|---|---|---|---|
| T01 | captaincy | pass |  |
| T02 | comparison | pass |  |
| T03 | fdr | pass |  |
| T04 | budget | pass |  |
| T05 | injuries | pass |  |
| T06 | missing_data | pass |  |
| T07 | reddit | pass |  |
| T08 | transfers | pass |  |
| T09 | fdr | pass |  |
| T10 | captaincy | pass |  |

## Tokens and cost (ESTIMATED: offline provider, ~3.5 characters a token)

| | Tokens |
|---|---|
| Prompt | 15,355 |
| Completion | 3,648 |
| Total | 19,003 |

Cost: **$0.0672** for 10 cases ($0.0067 a case), at claude-sonnet-5 list prices ($2 / $10 per million input / output tokens).

## Self-test

```
reference: 10/10 pass every check
seeded faults: 10/10 caught in the intended category
```
