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

## 2. Model baseline: claude-sonnet-5, 11 Oct 2026

**7/10 cases pass every objective check** (re-graded, see below). Two genuine reasoning errors were found, one of them not caught by any check.

| Run | Pass | Cost (answers + judge) | Notes |
|---|---|---|---|
| `runs/2026-10-11-1054-live-judge` | 3/10 | $0.18 + $0.11 | **Invalid**: `max_tokens` 1500 cut off 6 answers (the model's thinking counts against it). Logged in docs/incidents.md. |
| `runs/2026-10-11-1107-live-judge` | 5/10 | $0.30 + $0.17 | Caps 8000/4000. All answers complete. |
| same answers, re-graded (`regraded.json`, `report-regraded.md`) | **7/10** | $0 (replayed) | Three checks were stricter than the questions; corrected, then the **saved** answers re-graded rather than new ones generated, so checks weren't tuned on fresh output. Seeded faults still 10/10 caught. |

Total spent on 11 Oct: $0.75.

### Per case (re-graded)

| Case | Result | What happened |
|---|---|---|
| T01 captaincy | pass | Mbeumo, flagged as close. |
| T02 comparison | pass | |
| T03 FDR | pass, **but wrong** | Correct on Man City/Arsenal and FDR's Fulham. Then says Arsenal's 3.0 is "the highest (hardest) average FDR of the six", although its own facts list Everton at 3.5. No check reads ranking claims in prose, and the judge scored the reasoning 1.0. |
| T04 budget | **FAIL: wrong answer** | Picked Tavernier + Groß (9.98, £12.0m). Tavernier + Ødegaard (10.32, £12.9m) fits the £13.0m budget and is better. The judge rated usefulness 1.0. |
| T05 injuries | pass | |
| T06 missing data | pass | Saka only; said Watkins isn't in the data. |
| T07 Reddit | FAIL (minor) | Good reply (link, return date, under the word limit), but cites `P552.news`, an id that doesn't exist. |
| T08 transfers | FAIL | Numbers all correct (+2.39, pays the hit in GW12). Two problems: calculations built on other calculations (`inputs: ["calc","calc"]`), which the output contract can't verify; and it didn't answer "when does it break even" (GW8, cumulative gain above zero). |
| T09 FDR v xG | pass | |
| T10 captaincy | pass | Saka, medium confidence. |

### Failure categories

| Category | Cases | Kind |
|---|---|---|
| Wrong optimisation (missed best combination) | T04 | Model reasoning |
| False ranking claim in prose | T03 (passed checks) | Model reasoning; **check gap** |
| Invented source id | T07 | Model provenance (minor) |
| Calculation chained on calculations | T08 | Output contract gap |
| Part of a two-part question unanswered | T08 | Model task |

### What this shows

- **Numbers copied from the data were right in all ten.** Every error was in reasoning *about* the numbers: searching combinations, ranking, answering every part.
- **The judge didn't catch either reasoning error** (T03 1.0, T04 usefulness 1.0). Keeping it advisory was right.
- **Prompt changes worth testing (v2):** let a calculation reference an earlier one; for "best combination" questions, list the candidates checked; answer every part of a multi-part question explicitly.
- **Check to add:** ranking claims in prose ("highest", "easiest", "best of the six") checked against the data.

Single run at temperature 0; repeat (`repeat 3`) before comparing prompt versions.

## 3. Prompt v2 trial, 11 Oct 2026

Run `runs/2026-10-11-1234-live-v2` (prompt v2, all ten cases, repeat 2; no judge): **4/20 pass all six checks; 15/20 pass the five checks v1 was held to** (v1: 7/10). Cost $0.75 ($0.37 per ten answers, v1 $0.30). The planned extra v1 run was not made: v2's result settled the question without it.

**What v2 fixed**
- **T04:** the right pair (Tavernier + Ødegaard) in both runs, which v1 got wrong. "Check every combination and name the runner-up" worked. One run still failed on a reference error (below).
- **T07:** no invented source id in either run.

**What didn't work**
- **The `superlatives` contract (11 of 16 failures).** My wording was ambiguous: "over lists every option the claim covers" was read as "the options the winner beat", so the winner was left out. The model also listed comparatives ("edges out", "beats") with a single option, and in T04 wrote placeholders (`"#n"`, `"calc"`) instead of references. The check was working correctly; the instruction was the problem.
- **`#n` references:** in T08 the model counted only calculated facts (`#2` = the second calculation, not the second fact), so every chained value pointed at the wrong number.
- **Constants:** the −4 hit has no id in the data, so the model typed `"-4"` as an input, which the contract doesn't allow.
- **Cost:** 32,008 output tokens per ten answers against v1's 26,133. "List only the facts you use" was ignored (T08 listed 26 and 40). The comparison lists added length.
- **T03 cut off once at 8,000 tokens:** checking every option made it think longer.
- **T10 (one run):** an untraced "50" in the prose.

**Verdict:** keep v2's reasoning instructions (check every combination, answer every part); drop the `superlatives` contract. Recommended v3, not yet built or run:
1. Remove `superlatives` from the prompt. Catch false comparison claims with case-level checks instead (e.g. T03's "Everton hardest" must not be contradicted). This also cuts output.
2. Replace positional `#n` with named fact ids (`"id": "gain_6_10"`), which can't be miscounted.
3. Allow plain-number inputs when the number appears in the question or data text (the −4 hit).
4. Expected: cheaper than v2 and at least as accurate. One run of all ten cases is about $0.30; test T03, T04, T08 and T10 first for about $0.12.

Spent on 11 Oct in total: $1.50.

