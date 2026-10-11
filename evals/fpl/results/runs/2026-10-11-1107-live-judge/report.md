# Live run (2026-10-11-1107, repeat 1)

- Results file: `results/runs/2026-10-11-1107-live-judge/live.json`
- Provider: claude-sonnet-5
- Run at: 2026-10-11T11:07:57.399Z
- Cases: 10; passed every objective check: **5/10 (50%)**

## Pass rate by check

| Check | Passed | Failed |
|---|---|---|
| output_structure | 10 | 0 |
| source_provenance | 8 | 2 |
| numerical_accuracy | 7 | 3 |
| missing_data | 8 | 2 |
| task_correctness | 8 | 2 |

## Failure categories (first failing check per case)

| Category | Cases |
|---|---|
| numerical_accuracy | 2 |
| missing_data | 1 |
| source_provenance | 2 |

## Cases

| Case | Category | Result | Failed checks | Reasoning (advisory) | Usefulness (advisory) |
|---|---|---|---|---|---|
| T01 | captaincy | pass |  | 0.9 | 1 |
| T02 | comparison | pass |  | 1 | 1 |
| T03 | fdr | FAIL | **numerical_accuracy**: did not state Man City average market goals GW7-10 (2.21) / did not state Man City average Dixon-Coles goals GW7-10 (2.38)<br>**missing_data**: answer_type partial, expected answered | 1 | 1 |
| T04 | budget | FAIL | **numerical_accuracy**: answer has number(s) not in the data or facts: 1.0 / did not state combined projected points of the best pair (10.32) / did not state combined price of the best pair (12.9)<br>**task_correctness**: recommendation "Tavernier + Groß" does not match /(?=.*Tavernier)(?=.*Ødegaard)/is | 0.5 | 1 |
| T05 | injuries | FAIL | **missing_data**: answer_type partial, expected answered | 1 | 1 |
| T06 | missing_data | pass |  | 1 | 0.8 |
| T07 | reddit | FAIL | **source_provenance**: unknown source id P552.news / did not cite required source(s) I.xp.gw6 | 1 | 1 |
| T08 | transfers | FAIL | **source_provenance**: calc "Projected point gain GW6-10 from switching Wissa to Calvert-Lewin (before hit)" uses unknown ids calc, calc / calc "Cumulative projected gain GW6-11 (before hit)" uses unknown ids calc, calc / calc "Cumulative projected gain GW6-12 (before hit), crosses the 4-point break-even point" uses unkno<br>**numerical_accuracy**: answer has number(s) not in the data or facts: 2.39, 3.59, 6.36, 8.20, 4.20, 0.50<br>**task_correctness**: answer misses: break-even gameweek (GW8) | 1 | 1 |
| T09 | fdr | pass |  | 1 | 1 |
| T10 | captaincy | pass |  | 1 | 1 |

## Tokens and cost

| | Tokens |
|---|---|
| Prompt | 21,567 |
| Completion | 26,133 |
| Total | 47,700 |

Cost: **$0.3045** for 10 cases ($0.0304 a case), at claude-sonnet-5 list prices ($2 / $10 per million input / output tokens).

Judge: 37,568 prompt + 8,994 completion tokens, **$0.1651** (same prices). Run total **$0.4695**.
