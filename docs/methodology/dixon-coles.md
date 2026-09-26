# Dixon-Coles match model

Derived from the code and the live database definitions exported on 2026-09-26. Where a comment and the code disagree, the code is described and the disagreement is noted.

## What it answers

- The expected goals for each side of a fixture: $\lambda_{home}$ and $\lambda_{away}$.
- From those two numbers and $\rho$: the full scoreline grid, 1X2, over/under 2.5, BTTS and clean-sheet probabilities.
- Team attack and defence ratings for each league, used by Team Strength pages, the FPL projections (via `fixtures.predicted_*`) and the final-table simulation.

## Inputs (objects)

| Object | Role |
|---|---|
| `matches` | Completed results (`full_time_home_goals`, `full_time_away_goals`, `match_date`) per `league_id`. The only data the fit uses. |
| `leagues` | League code to `league_id` (e.g. `E0` = league 1). |
| `model_fit_runs` | One row per fit attempt: `rho`, `home_advantage`, window, `status` (`accepted`/`rejected`), `validation_checks`, `model_version`, `as_of_date`, `is_retrofit`. |
| `team_ratings` | `attack_strength`, `defence_strength` per (`fit_run_id`, `team_id`); `is_estimated` marks promoted/relegated estimates. |
| `team_home_away_adjustment_v1` (view) | Premier League only: team-specific home/away deviations. |
| `team_strength_manual_override` | Manual `attack_adjustment` / `defence_adjustment` per `team_id`. |
| `fixtures` | Upcoming fixtures; receives the predictions. |
| `match_odds` | Closing market-average (`bookmaker = 'Avg'`) 1X2 prices, for the scorecard only. |

## Method

### Parametrisation

$$\lambda_{home} = \exp(h + a_{home} - d_{away}), \qquad \lambda_{away} = \exp(a_{away} - d_{home})$$

$h$ is one home advantage per league; $a$ and $d$ are per-team attack and defence (higher $d$ = better defence). The same formula appears in `fit_dixon_coles.py`, `src/lib/dixonColes.ts`, `backfill_fixture_predictions()`, `backfill_historic_fixture_predictions()` and `backfill_match_predictions()`.

Low-score correction:

$$\tau(0,0) = 1 - \lambda_h\lambda_a\rho,\quad \tau(0,1) = 1 + \lambda_h\rho,\quad \tau(1,0) = 1 + \lambda_a\rho,\quad \tau(1,1) = 1 - \rho,\quad \tau = 1 \text{ otherwise}$$

$$P(X=x, Y=y) = \tau(x,y)\,\text{Pois}(x;\lambda_h)\,\text{Pois}(y;\lambda_a)$$

### Likelihood and time decay

Weighted log-likelihood over in-window matches $i$:

$$\ell = \sum_i w_i\left[\log \tau_i + x_i\log\lambda_{h,i} - \lambda_{h,i} - \log x_i! + y_i\log\lambda_{a,i} - \lambda_{a,i} - \log y_i!\right]$$

$$w_i = 0.5^{\,\text{days\_ago}_i / 180}$$

`days_ago` is measured from `window_end_date`. $\tau$ is clipped at $10^{-10}$ before the log.

### Fit settings (`MODEL_VERSION = "dc_v1_1"`)

| Setting | Value |
|---|---|
| Window | 730 days ending today (or `--as-of` date, inclusive) |
| Half-life | 180 days |
| Optimiser | SciPy L-BFGS-B, `maxiter=2000`, `ftol=1e-12` |
| Start values | all $a,d = 0$; $h = 0.25$; $\rho = -0.05$ |
| Bounds | $a,d \in [-5, 5]$; $h \in [-2, 2]$; $\rho \in [-0.4, 0.4]$ |
| Minimum matches per team for a direct fit | 10 (teams below are dropped, together with all their matches) |
| Minimum matches to attempt | $\max(20,\ 2n_{teams}+2)$ after exclusions; below that a rejected stub row is written |

Identifiability: after optimisation every $a$ and $d$ is shifted by $c = -\overline{a}$ so that mean attack is 0. This leaves every $\lambda$ unchanged.

### Quality gates (`validate_fit`)

A fit is `rejected` if any hard gate fails; it is still written (for audit via `league_fit_status`) and the script exits non-zero.

| Gate | Rule |
|---|---|
| `converged` | optimiser reports success |
| `all_parameters_finite` | no NaN/inf |
| `no_parameter_at_optimizer_bound` | no raw parameter within 0.02 of its optimiser bound |
| `attack_defence_within_sensible_bounds` | all recentred $\lvert a\rvert, \lvert d\rvert \le 2.5$ |
| `home_advantage_within_sensible_bounds` | $h \in [-0.5, 1.0]$ |
| `rho_within_sensible_bounds` | $\rho \in [-0.35, 0.35]$ |
| `sufficient_observations` | at least 50 matches used |
| `expected_goals_within_sensible_bounds` | every ordered pairing of fitted teams gives $\lambda \in [0.05, 6.0]$ |
| `scoring_level_matches_data` (added in `dc_v1_1`) | $\sum w\hat\lambda_h / \sum w x$ and $\sum w\hat\lambda_a / \sum w y$ each within 5% of 1 |

Soft check (warning only): any team whose $a$ or $d$ moved by more than 1.0 against the previous accepted fit (for retro-fits, the previous accepted fit made before the as-of date).

A daily guard, `recent_fits_scoring_level` in `check_model_integrity()`, re-applies the scoring-level test to accepted non-retro fits from the last seven days.

### Production selection and the point-in-time rule

- Nothing selects "latest fit"; every consumer filters `status = 'accepted'` and orders by `fitted_at` desc (`team_strength_current`, `fpl_team_strength_current`, `league_fit_status`, both backfill functions).
- A fit serves a match only if `fitted_at::date < kickoff/match date`. Live fits are stamped `now()`; retro-fits (`--as-of D`) are stamped `D 23:59:59 UTC` with `as_of_date = D`, `is_retrofit = true`, so they serve kick-offs from `D+1`. A partial unique index allows one accepted retro-fit per league per day.

### Promoted and relegated teams (`estimate_promoted_team_ratings.py`)

For a team in the target league's current-season fixtures but with no rating in the target's latest accepted fit:

$$\hat a = a^{source} + \operatorname{median}_{t\in B}(a^{target}_t - a^{source}_t), \qquad \hat d = d^{source} + \operatorname{median}_{t\in B}(d^{target}_t - d^{source}_t)$$

$B$ = teams rated in both leagues' latest accepted fits; at least 3 are required. The division below (promoted teams) is tried first, then the division above (relegated teams); each direction uses its own gap. Rows are inserted into the **target league's existing accepted fit** with `is_estimated = true`, `estimated_from_fit_run_id` and an `estimation_note`. A team with no rating in either adjacent division is not estimated; the script exits 2, which the daily workflow treats as a warning. Adjacency in the daily workflow: E0↔E1↔E2↔E3↔EC.

### Live prediction (`backfill_fixture_predictions()`)

For every fixture with `status IN ('scheduled','postponed')`, using the league's newest accepted fit, and only where `fitted_at::date < kickoff_date`, and only where both teams have a `team_ratings` row in that fit:

**Leagues other than E0** (`prediction_model_version = 'dc_baseline_v1'`):

$$\eta_h = h + a_H - d_A,\quad \eta_a = a_A - d_H$$

**E0 (`league_id = 1`)** (`'dc_home_away_sparse_shrink_v2'`): each team's rating is multiplied by a sparse-data factor

$$s = \begin{cases} n/(n+12) & n < 12 \\ 1 & n \ge 12\end{cases}$$

where $n$ = that team's appearances in the fit's league and window (from `matches`). Team home/away deviations are added and scaled by the same $s$:

$$\eta_h = h + s_H a_H - s_A d_A + s_H\,\delta^{att}_{H,home} - s_A\,\delta^{def}_{A,away}$$
$$\eta_a = s_A a_A - s_H d_H + s_A\,\delta^{att}_{A,away} - s_H\,\delta^{def}_{H,home}$$

The deviations come from `team_home_away_adjustment_experimental_v1` / `_v1`: E0 matches within 730 days of the **latest E0 match date**, weighted $0.5^{\Delta/180}$; raw deviation, e.g. $\ln(\max(GF_{home},0.15)/\max(GF_{all},0.15))$, shrunk by $W/(W+12)$ where $W$ is the summed weight, then centred on the weight-weighted league mean.

**Manual overrides (all leagues)**:

$$\lambda_h = \exp(\eta_h + \alpha_H - \beta_A), \qquad \lambda_a = \exp(\eta_a + \alpha_A - \beta_H)$$

with $\alpha, \beta$ = `attack_adjustment`, `defence_adjustment` from `team_strength_manual_override` (0 if absent). Written to `predicted_home_goals`/`predicted_away_goals`; the same values without overrides go to `raw_predicted_home_goals`/`raw_predicted_away_goals`. Also written: `prediction_fit_run_id`, `prediction_model_version`, `predicted_at`.

`team_strength_forward_adjustments` (dated, scenario-keyed log adjustments with `decay_fixtures`) exists in the schema but is not read by any exported view or function.

### How fixture predictions are frozen

A fixture stops being refreshed when (a) its status leaves `scheduled`/`postponed`, or (b) the newest accepted fit is dated on or after its kick-off date. Status is set by `refresh_fixture_feeds()` and, independently, by `sync_fixture_status_from_results()` (pg_cron `30 9,21 * * *`), which marks a fixture `played` when `matches` holds its score and `kickoff_date < current_date`.

Past seasons are predicted into `match_predictions` by `backfill_match_predictions(league, season)`: the newest accepted fit with `fitted_at::date < match_date` that rates both teams, plain `dc_baseline_v1` formula (no shrink, no home/away deviations, no overrides). It converges on rerun (replaces a prediction from a different fit). `backfill_historic_fixture_predictions(season)` does the same for `fixtures` rows with no prediction.

### Derived markets

`fixture_derived_markets(λh, λa, ρ)` (SQL) and `calculateDixonColes*` (TypeScript) build a 0–8 × 0–8 grid, apply $\tau$, and renormalise by the grid total. Outputs: home/draw/away, over/under 2.5, BTTS, home and away clean sheet (all in %). The page reads $\rho$ from the fit named by `prediction_fit_run_id`.

### Scorecard and calibration

- `model_scorecard_matches` (materialised view, refreshed by pg_cron `0 10,22 * * *`): past seasons from `match_predictions`; current season from `fixtures` with `status='played'`; each joined to closing `Avg` 1X2 odds. Model probabilities via `fixture_derived_markets` with the fit's $\rho$; market probabilities are $1/\text{price}$ normalised to sum to 1. Tagged by `team_type` (`estimated` / `relegated` / `promoted` / `established`) and season `phase`.
- `get_model_scorecard()`: sums of log-loss $-\ln p_{result}$ and Brier $\sum_k (p_k - o_k)^2$ for model and market, expected versus actual draws, predicted versus actual goals.
- `get_model_scorecard_calibration()`: per outcome, bins $\min(9, \lfloor 10p\rfloor)$, with count, summed $p$ and hits.
- Older, fixtures-only accuracy: `get_model_accuracy`, `get_model_accuracy_summary`, `get_model_calibration` (bands 0–10 … 60+).
- `model_experiment.py` + `score_model_experiment()`: in-memory weekly walk-forward fits with variants of half-life and a ridge penalty $\lambda\sum[(a-\bar a)^2 + (d-\bar d)^2]$, scored on matches common to all variants against the closing market.

### Model versions

`model_versions` (component `fit` or `prediction`): `legacy_pre_v1` (retired 2026-09-23), `dc_v1` (retired 2026-09-23), `dc_v1_1` (current fit), `dc_baseline_v1` and `dc_home_away_sparse_shrink_v2` (prediction). `model_fit_runs.model_version` is a foreign key to it. `model_change_log` holds before/after evidence for changes; `prediction_corrections` records re-predicted fixtures.

## Outputs (objects)

`model_fit_runs`, `team_ratings`, `fixtures.predicted_home_goals/_away_goals`, `fixtures.raw_predicted_*`, `fixtures.prediction_fit_run_id/_model_version/predicted_at`, `match_predictions`, views `team_strength_current`, `fpl_team_strength_current`, `league_fit_status`, materialised view `model_scorecard_matches`, `model_experiment_predictions`.

## Schedule

| When (UTC) | What | Where |
|---|---|---|
| 06:00 daily | Import results E0–EC → fit E0, E1, E2, E3, EC → estimate promoted/relegated → `backfill_fixture_predictions()` | `.github/workflows/daily-import.yml` |
| On save of an override | `backfill_fixture_predictions()` | `saveTeamStrengthOverride` in `src/lib/modelApi.ts` |
| 09:30, 21:30 | `sync_fixture_status_from_results()` | pg_cron (migration `20260923220000`) |
| 10:00, 22:00 | `refresh_model_scorecard()` | pg_cron (migration `20260923233000`) |
| Manual | Retro-fits and archive predictions | `retrofit-season.yml` |
| Manual | Walk-forward experiments | `model-experiment.yml` |

The international leagues imported by `daily-import-international.yml` are not fitted.

## Caveats

1. **Promoted-team estimates are largely undone in E0.** The E0 prediction multiplies ratings by $n/(n+12)$ where $n$ counts the team's E0 matches in the window. An estimated promoted team with 0–3 E0 matches is therefore predicted as nearly a league-average side, not from its estimate. Whether this is intended is unclear; `model_versions` describes it only as "shrinkage for teams with few matches".
2. **E0 live predictions are not point-in-time.** The home/away deviations use data up to the latest E0 match date, whatever the fit's date. `model_versions` says this explicitly. `dc_home_away_sparse_shrink_v2` has not been evaluated point-in-time.
3. **Overrides are unscoped.** `team_strength_manual_override` has no league, season or date. It applies to every future fixture of that team in any league and keeps no history beyond `updated_at`. The model-version description of `dc_baseline_v1` ("ratings alone") is inaccurate for live non-E0 fixtures, which also receive overrides.
4. **Stale predictions can persist.** If a team has no rating in the newest accepted fit (for example, estimation exit 2), its fixtures are silently skipped and keep whatever prediction they had.
5. **Scorecard mixes prediction methods.** Current-season rows use live predictions (E0 includes deviations and overrides); archive rows use plain `dc_baseline_v1`. `model_version` in the scorecard is the fit's version, not `prediction_model_version`.
6. **Estimated ratings bypass the gates.** They are inserted into an already accepted fit after validation. The scoring-level integrity guard excludes them.
7. **Grid truncation.** The grid is truncated at 8 goals and renormalised. `model_experiment.py` uses 10, a small inconsistency with production.
8. **Nulls in the fit query.** `fit_dixon_coles.py` does not filter null scores in its `matches` query (the experiment script and the views do). Unclear: whether `matches` can hold rows with null goals.
9. **Status lag on match day.** The feed can leave played fixtures `scheduled`, and results-based sync only fires for `kickoff_date < current_date`. The kick-off guard (fit date < kick-off date) is what prevents hindsight in the Dixon-Coles predictions. See `docs/incidents.md` 2026-09-23.
10. **Comment and record disagreements.**
    - `refresh-predictions.ts` says it uses each league's "LATEST model_fit_run". The SQL uses the latest *accepted* fit plus the kick-off guard.
    - `dixonColes.ts` refers to the fitter being "in the importer project". It is in this repository.
    - Migration `20260923160000` records fit #2 as an opposite sign convention. Migration `20260923200000` and `docs/incidents.md` correct this to a scoring-level offset (~+0.37 on defence).

## Source

- `scripts/fit_dixon_coles.py`: `negative_log_likelihood`, `validate_fit`, `fit_league`, `previous_accepted_ratings`, constants at the top of the file.
- `scripts/estimate_promoted_team_ratings.py`: `latest_fit_run`, `compute_gap`, `current_season_team_ids`, `season_team_ids_as_of`, `main`.
- `src/lib/dixonColes.ts`: `dixonColesTau`, `calculateDixonColes`, `calculateDixonColesFromExpectedGoals`, `calculateDixonColesVsCategory`.
- `scripts/refresh-predictions.ts` → `supabase/definitions/functions/backfill_fixture_predictions.sql`.
- `supabase/definitions/functions/backfill_historic_fixture_predictions__target_season_id_bigint.sql`, `backfill_match_predictions__p_league_id_bigint_p_season_id_bigint.sql`, `fixture_derived_markets__…sql`, `sync_fixture_status_from_results.sql`, `get_model_scorecard.sql`, `get_model_scorecard_calibration.sql`, `get_model_accuracy__p_league_id_bigint.sql`, `get_model_calibration__p_league_id_bigint.sql`, `score_model_experiment__p_experiment_text.sql`, `check_model_integrity.sql`.
- `supabase/definitions/views/team_home_away_adjustment_experimental_v1.sql`, `team_home_away_adjustment_v1.sql`, `team_strength_current.sql`, `fpl_team_strength_current.sql`, `league_fit_status.sql`.
- `supabase/definitions/materialized_views/model_scorecard_matches.sql`.
- `supabase/migrations/20260923090000_retrofit_fits_and_match_predictions.sql`, `20260923160000_retire_fit2_kickoff_guard_corrections.sql`, `20260923200000_model_versions_and_change_log.sql`, `20260923220000_integrity_guards.sql`, `20260923233000_model_scorecard.sql`, `20260924000000_model_experiments.sql`.
- `scripts/model_experiment.py`: `objective`, `fit`, `probs_1x2`.
- `.github/workflows/daily-import.yml`, `retrofit-season.yml`, `model-experiment.yml`.
- `docs/incidents.md`; `OUTSTANDING.md` sections "Half-life/shrinkage grid" and "Premier League 'estimated ratings' gap".
