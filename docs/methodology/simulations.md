# Simulations and optimisers

Derived from the code as of 2026-09-26.

## 1. Finishing-position projection (`scripts/simulate_final_table.py`)

### What it answers

The distribution of each team's final league position and its mean final points, for the current season.

### Inputs (objects)

- `fixtures`: all fixtures for the league and season. Teams are defined by the fixture list.
- `matches`: played results for the same league and season, used for current points, goal difference, goals for and matches played.

### Method

- **Remaining fixtures:** only those with `status = 'scheduled'` and a non-null `predicted_home_goals`.
- **Draws:** each remaining fixture draws $X\sim\text{Pois}(\lambda_h)$ and $Y\sim\text{Pois}(\lambda_a)$ independently. Dixon-Coles $\rho$ is deliberately not applied, as stated in the header.
- **Points:** 3 for a win, 1 for a draw, 0 for a loss, added to the actual table.
- **Ranking:** points, then goal difference, then goals for (`np.lexsort`). Exact ties keep the order of `team_id`.
- **Runs:** `N_SIMS = 20000`, `RNG_SEED = 20260916`, `LEAGUE_IDS = [1, 2, 3, 4]`. EC (the National League) is not simulated.

### Outputs (objects)

`team_finishing_position_projection`, upserted on (`league_id`, `season_id`, `team_id`). Columns:

- `projected_points_mean`
- `projected_position_mean`
- `projected_position_median`
- `current_actual_points`
- `current_played`
- `position_distribution` (JSON)
- `n_simulations`
- `simulated_at`

Each run is logged in `pipeline_runs`.

### Schedule

The last step of `fpl-projections-pipeline.yml` runs it at 06:41 and 18:41 UTC with `--season-id 13`. It can also be run manually via `simulate-final-table.yml`.

### Caveats

1. **Double-counting risk.** "Played" comes from `matches`, while "remaining" comes from `fixtures.status = 'scheduled'`. A match imported at 06:00 whose fixture is still `scheduled` is counted as played *and* simulated. That fixture status is set by the feed or by `sync_fixture_status_from_results` at 09:30 and 21:30. Unclear how often the 06:41 run hits this; it depends on `refresh_fixture_feeds` timing.
2. **Postponed fixtures are dropped.** `postponed` fixtures are not simulated, so teams with postponements are projected on fewer games.
3. **Tie-breaking is incomplete.** Head-to-head and points deductions are ignored.
4. **Uncertainty is understated.** The only randomness is match noise on fixed $\lambda$; uncertainty in the team ratings is not propagated. Current-season $\lambda$ values also include manual overrides.

### Source

`scripts/simulate_final_table.py`: `simulate_league`, `main`. `.github/workflows/fpl-projections-pipeline.yml`, `simulate-final-table.yml`.

---

## 2. Bonus-points Monte Carlo (`scripts/simulate_fixture_bonus.py`)

### What it answers

Each player's expected FPL bonus points (3/2/1 for the top three BPS) in each upcoming fixture.

### Inputs (objects)

`fpl_fixture_bps_projection_v1`, per fixture and player:

- `expected_bps_score` (mean BPS)
- `expected_goals`
- `expected_assists`
- `expected_minutes`
- `clean_sheet_probability` $= e^{-\lambda_{opp}}$

See [fpl-projections.md](fpl-projections.md) for how the mean is built.

### Method

For each fixture, with `N_SIMS = 30000` and `RNG_SEED = 20260916` (one RNG stream for the whole run):

**Clean-sheet share of BPS.** For GK and DEF only:

$$c_i = 12\cdot\min(1, m_i/60)$$

**Residual mean.** The part of BPS not explained by goals, assists or the clean sheet:

$$\mu^{res}_i = E[BPS_i] - v_i\,xG_i - 9\,xA_i - c_i\,p^{CS}_{team}$$

Here $v$ is the BPS value of a goal: 12 for GK and DEF, 18 for MID, 24 for FWD.

**Per draw.**

- One shared $B_{team}\sim\text{Bernoulli}(p^{CS}_{team})$ per team.
- Goals $\sim\text{Pois}(xG_i)$ and assists $\sim\text{Pois}(xA_i)$.
- Residual $\sim N(\mu^{res}_i, \sigma_{pos})$, with $\sigma$ = 7.32 for GK, 7.64 for DEF, 5.91 for MID and 4.56 for FWD (default 6.0).

$$BPS_i = \text{res}_i + v_i G_i + 9A_i + c_i B_{team(i)}$$

**Bonus.** Players are ranked in each draw; the top three get 3, 2 and 1. The result is the average over draws.

### Outputs (objects)

`fpl_fixture_bonus_montecarlo_v1` (`fixture_id`, `fpl_player_id`, `expected_bonus_points`, `simulated_at`). The next `refresh_fpl_projection_fixture_v6` uses it for `xpts_bonus` whenever **any** row exists for the fixture. Each run is logged in `pipeline_runs`.

### Schedule

It runs between pass 1 and pass 2 of `fpl-projections-pipeline.yml`, at 06:41 and 18:41 UTC, for the next 3 matchweeks. It can also be run manually via `simulate-fixture-bonus.yml`.

### Caveats

1. **Double-counting in the mean.** The BPS mean it inherits double-counts goal, clean-sheet and defensive BPS (see [fpl-projections.md](fpl-projections.md), caveat 4). The residual subtraction removes only the *added* terms, not the historical ones.
2. **Every rostered player is always "on the pitch".** Draws do not first decide whether a player appears. Residual SD is not scaled by minutes, so non-playing squad members can occasionally take bonus through noise.
3. **Pass 1 is not a pure fallback.** The workflow calls pass 1 the "fallback bonus estimate", but it already uses the *previous* run's Monte Carlo rows where they exist. Only fixtures never simulated fall back to `get_fpl_fixture_bonus_v4`.
4. **Stale rows are kept.** Upserts never delete rows for players no longer in the fixture pool. The projection join ignores them, so they are harmless there but stale in the table.
5. **The clean-sheet draw uses plain Poisson.** $p^{CS}$ is taken from the first player row of the team, and has no Dixon-Coles correction.

### Source

`scripts/simulate_fixture_bonus.py`: `simulate_fixture`, `main`, constants `GOAL_BPS_VALUE`, `RESIDUAL_SD_BY_POS`, `N_SIMS`. `supabase/definitions/views/fpl_fixture_bps_projection_v1.sql`. `supabase/definitions/functions/refresh_fpl_projection_fixture_v6_impl__p_fixture_id_bigint.sql`.

---

## 3. Hindsight-optimal squad (`scripts/solve-hindsight-optimal.ts`)

### What it answers

The single 15-man squad, never changed, that would have scored the most **actual** FPL points across all played gameweeks so far. It picks the best XI and captain each week with hindsight. The result is not a projection.

### Inputs (objects)

- `get_fpl_played_matchweeks(13, 1)`: distinct `fixtures.matchweek` for fixtures with any `fpl_player_gameweeks` row. This joins `fixtures.fixture_id = fpl_player_gameweeks.fpl_fixture_id`.
- `fixtures` (`fixture_id` → `matchweek`).
- `fpl_player_gameweeks` (`total_points`, `minutes`, opponent).
- `fpl_players` (`now_cost`, `element_type`, `canonical_team_id`).
- `teams` and `fpl_teams`, for names.

### Method

A mixed-integer programme solved with HiGHS over the full player pool (players with at least one gameweek row). For each player $i$ and week $w$ there are three binary variables: $x_i$ (in the squad), $s_{iw}$ (in the XI) and $c_{iw}$ (captain).

**Objective:**

$$\max \sum_{i,w} pts_{iw}(s_{iw} + c_{iw}) - 10^{-6}\sum_i price_i x_i$$

**Constraints:**

- **Linking:** $s_{iw}\le x_i$ and $c_{iw}\le s_{iw}$.
- **Squad:** $\sum x = 15$, with 2 GK, 5 DEF, 5 MID and 3 FWD.
- **Budget:** $\sum price\cdot x\le 100$, using `now_cost`/10.
- **Clubs:** at most 3 players per club.
- **Each week:**
  - $\sum_i s_{iw} = 11$
  - exactly 1 GK
  - DEF between 3 and 5
  - MID between 2 and 5
  - FWD between 1 and 3
  - $\sum_i c_{iw} = 1$

After solving, `weeklyDetail` recomputes each week's best XI over formations 3-5-2, 3-4-3, 4-5-1, 4-4-2, 4-3-3, 5-4-1, 5-3-2 and 5-2-3. The captain is the week's top scorer, with vice-captain cover $(1-app_{cap})\,app_{vice}\,pts_{vice}$. Auto-subs are not modelled.

### Outputs (objects)

`fpl_hindsight_optimal_squad`, upserted on (`season_id`, `league_id`, `from_matchweek`, `to_matchweek`, `budget`, `optimiser_version = 'hindsight_v1_full_pool'`). The JSON `result` holds the squad, `weekly_plan` and notes.

### Schedule

Daily at 06:45 UTC (`hindsight-optimal.yml`), or manually.

### Caveats

1. **Double gameweeks are under-counted.** The code sets `p.gw_xpts[mw] = pts` for each gameweek row, overwriting instead of adding. A player with two fixtures in one matchweek keeps only the last fixture's points in the objective. `p.xpts` does accumulate both.
2. **It uses today's prices.** Budget uses `now_cost`, not the price paid at the time. This is unlike the Season XI, which deliberately uses August prices.
3. **Fixture IDs are assumed to match.** The code relies on `fixtures.fixture_id` equalling `fpl_fixture_id` (the header says they "happen to align numerically"). It also uses `fixtures.matchweek` rather than the FPL event, so a rearranged fixture may be assigned to the wrong week.
4. **Part-played gameweeks count as played.** Any gameweek with at least one player row is treated as played, including one in progress.
5. **Season and budget are hard-coded:** `SEASON_ID = 13`, `BUDGET = 100`.
6. **Schedule comments disagree with the cron.**
   - `fpl-projections-pipeline.yml` says it runs at "07:00 and 19:00 UTC — after … hindsight-optimal's 06:45", but its cron is 06:41 and 18:41.
   - `hindsight-optimal.yml` says it "runs after the daily projection refresh", but 06:45 is four minutes after that pipeline *starts* (it can run for up to 90 minutes).
   - Neither job depends on the other, so the ordering matters little in practice.

### Source

`scripts/solve-hindsight-optimal.ts`: `buildLp`, `bestXI`, `weeklyDetail`, `main`. `supabase/definitions/functions/get_fpl_played_matchweeks__p_season_id_bigint_p_league_id_bigint.sql`. `.github/workflows/hindsight-optimal.yml`.

---

## 4. Season best XI ("Set-and-Forget XI")

### What it answers

The best 11 players on season total points, within a budget, in a valid formation with at most 3 per club, at **start-of-season** prices.

### Method

**Completed seasons.** Read from the table `season_best_xi`. Unclear: the solver that produced it is not in the repository. The schema's guards check for 11 rows per season and at most 3 players per club.

**Season in progress.** Solved in the browser by `solveRollingXi` over `get_rolling_xi_candidates(13)`:

- **Pool:** players with minutes > 0.
- **August price:** `now_cost - cost_change_start`.
- **Budget:** `ROLLING_XI_BUDGET = 830` (£83.0m for the XI).
- **Search:** a per-position knapsack dynamic programme over the top 26 by points in each position, combined over formations with 3–5 DEF, 2–5 MID and 1–3 FWD, ignoring the club limit.
- **Club repair:** up to 30 passes swap an over-represented club's lowest scorer for the best affordable same-position player from a club with room. Returns null if no legal swap exists.

### Caveats

1. **The rolling XI may not be optimal.** The club-limit repair is greedy, so the result can fall short of the constrained optimum. Truncating to the top 26 per position is safe only if the optimum lies within them.
2. **Total points are the only criterion.** Price is only a constraint, with no tie-break on price.

### Source

`src/lib/seasonXiApi.ts`: `getSeasonBestXi`, `getRollingXiCandidates`, `solveRollingXi`, `solveUnconstrained`. `supabase/definitions/functions/get_rolling_xi_candidates__p_season_id_bigint.sql`. `supabase/schema/public.sql` (`season_best_xi`).
