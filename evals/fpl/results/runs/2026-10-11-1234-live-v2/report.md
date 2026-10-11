# Live run (2026-10-11-1234, prompt v2, repeat 2)

- Results file: `results/runs/2026-10-11-1234-live-v2/live.json`
- Provider: claude-sonnet-5
- Run at: 2026-10-11T12:34:40.452Z
- Prompt: fpl_analyst_v2
- Answers graded: 20; passed every objective check: **4/20 (20%)**

## By prompt version

| Prompt | Answers | Passed | Pass rate | output structure | source provenance | numerical accuracy | ranking claims | missing data | task correctness | Cost per 10 answers |
|---|---|---|---|---|---|---|---|---|---|---|
| fpl_analyst_v2 | 20 | 4 | 20% | 1 failed | 3 failed | 5 failed | 14 failed | 1 failed | 3 failed | $0.373 |

## Pass rate by check

| Check | Passed | Failed |
|---|---|---|
| output_structure | 19 | 1 |
| source_provenance | 17 | 3 |
| numerical_accuracy | 15 | 5 |
| ranking_claims | 6 | 14 |
| missing_data | 19 | 1 |
| task_correctness | 17 | 3 |

## Failure categories (first failing check per case)

| Category | Cases |
|---|---|
| ranking_claims | 11 |
| truncated (hit max_tokens: harness setting, not a model error) | 1 |
| source_provenance | 2 |
| numerical_accuracy | 2 |

## Cases

| Prompt | Case | Category | Result | Failed checks |
|---|---|---|---|---|
| fpl_analyst_v2 | T01 | captaincy | FAIL | **ranking_claims**: claim "the highest of the four" leaves out Mbeumo |
| fpl_analyst_v2 | T01 | captaincy | FAIL | **ranking_claims**: claim "His GW6 projection of 5.33 points is the highest of the four" leaves out Mbeumo / claim "the highest start probability (0.969)" leaves out Mbeumo / claim "they're the weaker picks of this shortlist" leaves out Gibbs-White, Ødegaard |
| fpl_analyst_v2 | T02 | comparison | FAIL | **ranking_claims**: claim "clearly the highest of the three" leaves out Barry / claim "joint-highest start probability" leaves out Barry / claim "the most expected minutes" leaves out Barry / claim "the highest expected goals" leaves out Barry / claim "lowest start probability" leaves out Kostoulas / claim "lowest expe |
| fpl_analyst_v2 | T02 | comparison | FAIL | **ranking_claims**: claim "projected points (6.02) are highest of the three" leaves out Barry / claim "highest expected goals (0.698) of the group" leaves out Barry / claim "Kostoulas has the lowest start probability (0.819) and expected minutes (67.4)" leaves out Kostoulas / claim "Kostoulas has more season points (28 |
| fpl_analyst_v2 | T03 | fdr | FAIL (truncated) | **output_structure**: not a single JSON object (starts: "")<br>**source_provenance**: skipped: not a single JSON object (starts: "")<br>**numerical_accuracy**: skipped: not a single JSON object (starts: "")<br>**missing_data**: skipped: not a single JSON object (starts: "")<br>**task_correctness**: skipped: not a single JSON object (starts: "")<br>**ranking_claims**: skipped: not a single JSON object (starts: "") |
| fpl_analyst_v2 | T03 | fdr | FAIL | **ranking_claims**: claim "Man City are clearly top" leaves out Man City / claim "lowest (easiest) for Fulham" leaves out Fulham / claim "Everton worst (3.5)" leaves out Everton / "dering, so a team-level 'best attacking fixt" uses "best" but no superlatives entry covers it / "City and Arsenal are the strongest attacki |
| fpl_analyst_v2 | T04 | budget | FAIL | **ranking_claims**: claim "Best midfield pair within a £13.0m budget is Marcus Tavernier (£6.1m) and Martin Ødegaard (£6.8m)": Tavernier + Groß unknown id calc(9.98); Tavernier + Szoboszlai unknown id P68.xpts+P368.xpts; Tavernier + Schade unknown id P68.xpts+P94.xpts; Tavernier + E.Le Fée unknown id P68.xpts+P542.xpts |
| fpl_analyst_v2 | T04 | budget | FAIL | **source_provenance**: calc "Gap between best pair and runner-up pair" uses unknown ids calc, calc<br>**numerical_accuracy**: answer has number(s) not in the data or facts: 0.34<br>**ranking_claims**: claim "This is the highest total projection among all valid pairs under £13.0m": Tavernier + Groß unknown id calc; Tavernier + Le Fée unknown id #n; Tavernier + Schade unknown id #n; Tavernier + Szoboszlai unknown id #n; Tavernier + Buendía unknown id #n; Tavernier + Dewsbury-Hall unknown id #n; Tav |
| fpl_analyst_v2 | T05 | injuries | FAIL | **ranking_claims**: claim "Rice has the highest model start probability" leaves out Rice / claim "Havertz leads with 3.93" leaves out Havertz |
| fpl_analyst_v2 | T05 | injuries | FAIL | **ranking_claims**: claim "Havertz leads clearly at 3.93" leaves out Havertz |
| fpl_analyst_v2 | T06 | missing_data | pass |  |
| fpl_analyst_v2 | T06 | missing_data | pass |  |
| fpl_analyst_v2 | T07 | reddit | pass |  |
| fpl_analyst_v2 | T07 | reddit | pass |  |
| fpl_analyst_v2 | T08 | transfers | FAIL | **source_provenance**: calc "Net points after -4 hit, GW6-10" uses unknown ids 4 / calc "Net points after -4 hit, GW6-11" uses unknown ids 4 / calc "Net points after -4 hit, GW6-12" uses unknown ids 4<br>**numerical_accuracy**: calc "Surplus of Calvert-Lewin over Wissa, GW6-10" = 2.39, recomputed -0.09 / calc "Wissa cumulative projected points GW6-11" = 24.51, recomputed 7.65 / calc "Calvert-Lewin cumulative projected points GW6-11" = 28.1, recomputed 8.76 / calc "Surplus of Calvert-Lewin over Wissa, GW6-11" = 3.59, recomp<br>**task_correctness**: answer misses: break-even gameweek (GW8) |
| fpl_analyst_v2 | T08 | transfers | FAIL | **numerical_accuracy**: calc "Cumulative gap GW6-GW10" = 2.39, recomputed 21.4 / calc "Net points after -4 hit through GW10" = -1.61, recomputed 3.57 / calc "Cumulative gap GW6-GW11" = 3.59, recomputed 6.68 / calc "Net points after -4 hit through GW11" = -0.41, recomputed 4.82 / calc "Cumulative gap GW6-GW12" = 6.36, recom<br>**task_correctness**: recommendation "Only take the -4 hit if you plan to keep Calvert-Lewin at least through GW12; it loses value if sold/benched by GW10." does not match /\b(no/not worth/don'?t/do not/avoid/wait/skip/free transfer)\b/i / answer misses: break-even gameweek (GW8) |
| fpl_analyst_v2 | T09 | fdr | FAIL | **ranking_claims**: claim "xG fixture rating does edge out FDR" compares fewer than two options / claim "FDR actually does better than xG" compares fewer than two options / claim "market team goals beats both in both contexts": winner "market team goals" is not among the options compared / claim "market team goals is t |
| fpl_analyst_v2 | T09 | fdr | FAIL | **ranking_claims**: claim "xG fixture rating does edge out FDR" compares fewer than two options / claim "FDR actually outperforms xG" compares fewer than two options / claim "market team goals beats both FDR and xG outright": winner "Market team goals" is not among the options compared / claim "market team goals is the |
| fpl_analyst_v2 | T10 | captaincy | FAIL | **numerical_accuracy**: answer has number(s) not in the data or facts: 50<br>**ranking_claims**: claim "a higher projected GW6 score" compares fewer than two options / claim "the bigger tilt comes from context" is not quoted exactly from the answer |
| fpl_analyst_v2 | T10 | captaincy | FAIL | **ranking_claims**: claim "Saka ahead by 0.52, a fairly close margin" compares fewer than two options |

## Tokens and cost

| | Tokens |
|---|---|
| Prompt | 52,654 |
| Completion | 64,015 |
| Total | 116,669 |

Cost: **$0.7455** for 20 cases ($0.0373 a case), at claude-sonnet-5 list prices ($2 / $10 per million input / output tokens).
