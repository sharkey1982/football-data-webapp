# FPL expected points (xpts)

Derived from the live definitions exported on 2026-09-26. Model version string: `leaguewide_v6`. Premier League only.

## What it answers

The expected FPL points for each player in each upcoming fixture, broken into components, together with the probabilities behind them.

## Inputs (objects)

| Object | Role |
|---|---|
| `fixture_player_expected_minutes_resolved_v3` | $p_{start}$, $p_{sub}$, expected minutes $m$, availability, tactical role (see [expected-minutes.md](expected-minutes.md)) |
| `fixtures.predicted_home_goals/_away_goals` | Team expected goals $\lambda$ from Dixon-Coles, **including** manual overrides and E0 home/away deviations (see [dixon-coles.md](dixon-coles.md)) |
| `fpl_players` (current season) | Season `minutes`, `expected_goals`, `goals_scored`, `expected_assists`, `element_type` (1 = GK, 2 = DEF, 3 = MID, 4 = FWD) |
| `fpl_player_gameweeks` (current season) | Season totals of saves, cards, own goals, penalties saved/missed, BPS, and `source_payload.stats` (CBI, recoveries, tackles) |
| `tactical_role_priors` | `goal_weight` and `assist_weight` per tactical role (table; values not in the repository) |
| `set_piece_hierarchies` | Penalty, direct free-kick, corner and indirect free-kick taker `rank` per team |
| `fpl_fixture_bonus_montecarlo_v1` | Simulated expected bonus (see [simulations.md](simulations.md)) |

## Method

In the formulas below, $m$ = expected minutes and $\lambda_{opp}$ = the opponent's predicted goals.

**Prior shrinkage.** Every per-90 rate uses the same form, a prior worth 5 matches (450 minutes):

$$\text{rate}_{90} = \frac{\text{count} + \text{prior}_{90}\cdot 5}{\text{minutes} + 450}\cdot 90$$

The exception is xG and xA, which use 900 minutes (10 matches).

### Team goals to players (`fpl_projection_v4_leaguewide_inputs`, `fpl_projection_leaguewide_allocation_v2`)

**1. Finishing-adjusted xG per 90:**

$$xg90_{raw} = \frac{xG}{\text{min}}\cdot 90 \cdot \frac{G + 6}{xG + 6}$$

**2. xA per 90:** $xa90_{raw} = xA/\text{min}\cdot 90$.

**3. Shrinkage towards position priors over 900 minutes:**

$$xg90 = \frac{xg90_{raw}\cdot\text{min} + \pi_g\cdot 900}{\text{min} + 900}$$

- $\pi_g$ = 0 for GK (their $xg90$ is forced to 0), 0.0673 for DEF, 0.1650 for MID, 0.4474 for FWD.
- $\pi_a$ (same form, for xA) = 0.0040 for GK, 0.0592 for DEF, 0.1278 for MID, 0.0639 for FWD.

**4. Role-weighted scores:**

$$g_i = \max(xg90, 0.001)\sqrt{w^{goal}_{role}}\cdot m/90$$

$a_i$ is built the same way from xA; weights default to 1.

**5. Shares within the team:**

$$\text{goal share} = 0.865\,\frac{g_i}{\sum g} + 0.12\,\text{pen}_i + 0.015\,\text{fk}_i, \qquad \text{assist share} = 0.88\,\frac{a_i}{\sum a} + 0.12\,\text{sp}_i$$

Here $\text{pen}$, $\text{fk}$ and $\text{sp}$ are shares of penalty, direct free-kick and creation (corner or indirect free-kick) exposure. Each defaults to the base share if the team has no takers recorded.

Exposure $= \frac{1}{\text{rank}}\cdot p_{start}\cdot m/90$, maximised per type and normalised only if the team total exceeds 1 (`fpl_set_piece_fixture_adjustments_v1`).

**6. Expected goals and assists:**

$$E[G_i] = \lambda_{team}\cdot\frac{\text{goal share}_i}{\sum \text{goal share}}, \qquad E[A_i] = 0.72\,\lambda_{team}\cdot\frac{\text{assist share}_i}{\sum\text{assist share}}$$

### Points components (`fpl_projection_leaguewide_points`, `fpl_projection_secondary_scoring`)

| Component | Formula | Scoring assumed |
|---|---|---|
| Appearance | $2p_{start} + p_{sub}$ | 2 points if starting, 1 if subbed on |
| Goals | $E[G]\cdot\{10,6,5,4\}$ by GK/DEF/MID/FWD | |
| Assists | $3E[A]$ | |
| Clean sheet | $\{4,4,1,0\}\cdot e^{-\lambda_{opp}}\cdot p_{start}$ | |
| Goals conceded (GK/DEF) | $-\left(\frac{\lambda_{opp}}{2} - \frac{1-e^{-2\lambda_{opp}}}{4}\right)\min(1, m/60)$ | $-1$ per 2 conceded; the bracket is $E\lfloor G/2\rfloor$ for Poisson $G$ |
| Saves (GK) | $\frac{saves + 2.8846\cdot5}{min+450}\cdot m / 3$ | 1 point per 3 saves, treated linearly |
| Defensive contribution | $2\cdot P(DC)$ | 2 points |
| Cards and own goals | $-\hat r_{yc}m - 3\hat r_{rc}m - 2\hat r_{og}m$ | per-minute rates $\hat r = (n + \text{prior}\cdot5)/(min+450)$; priors per 90: YC 0.35, RC 0.03, OG 0.02 |
| Penalties | GK: $+5\hat r_{ps}m$ (prior 0.03/90); takers with penalty exposure > 0: $-2\hat r_{pm}m$ (prior 0.02/90) | |
| Bonus | Monte Carlo expected bonus if present; else `get_fpl_fixture_bonus_v4`; else 0 | see [simulations.md](simulations.md) |

$$\text{expected\_fpl\_points} = \text{appearance} + \text{goals} + \text{assists} + \text{clean sheet} + DC + \text{bonus} + \text{saves} + \text{goals conceded} + \text{cards/OG} + \text{penalties}$$

The stored `expected_saves` is $3\times$ `xpts_saves` for goalkeepers.

### Defensive contribution (`fpl_defensive_contribution_projection_leaguewide`)

Events per 90, shrunk over 450 minutes:

- DEF: CBI only. Prior 7.143 per 90; base rate 0.255.
- MID: CBI + recoveries + tackles. Prior 7.107; base rate 0.125.
- FWD: CBI + recoveries + tackles. Prior 3.681; base rate 0.01.
- GK: $P(DC) = 0$.

$$P(DC) = \text{clamp}_{[0,0.9]}\left(p_{start}\cdot\text{base}\cdot e^{0.28(\text{events}_{90} - \text{prior}_{90})}\cdot\min(1, m/60)\right)$$

A `threshold` column (DEF 10, MID/FWD 12) is output but not used in the probability.

### BPS mean for the bonus model (`fpl_fixture_bps_projection_v1`)

$$E[BPS] = \frac{bps + \pi_{bps}\cdot5}{min+450}\,m + \{12,12,18,24\}E[G] + 9E[A] + 12\,e^{-\lambda_{opp}}\min(1,m/60)\,[GK/DEF] + \frac{(cbi_{90}+rec_{90})\,m/90}{3}$$

- $\pi_{bps}$ per 90: GK 15.88, DEF 19.27, MID 27.39, FWD 33.24.
- CBI priors per 90: GK 1.35, DEF 6.00, MID 2.20, FWD 1.21.
- Recoveries priors per 90: GK 8.62, DEF 3.41, MID 4.19, FWD 2.41.

The closed-form fallback `get_fpl_fixture_bonus_v4` takes this mean with $\sigma = \max(5, 7 + 0.1\,E[BPS])$ and computes each player's expected number of players ahead:

$$\text{ahead}_i = \sum_{j\ne i}\left[1 + e^{(\mu_i-\mu_j)/\sqrt{\sigma_i^2+\sigma_j^2}}\right]^{-1}$$

It then sets weights $w_i = e^{-0.5\,\text{ahead}_i}$ and applies Plackett–Luce top-3 probabilities with 3/2/1 bonus points.

### Writing and freezing (`refresh_fpl_projection_fixture_v6`)

- The function upserts one row per (fixture, player, `model_version='leaguewide_v6'`) into `fpl_player_projections`.
- It returns 0 without writing if the fixture's `status = 'played'`, unless `p_allow_played` is set.
- `lineup_confidence` is a fixed map from `minutes_source`: squad-state override 0.95, `consensus_v3` 0.90, nailed history 0.80, strong history 0.70, otherwise 0.55.

### Snapshots before deadlines

`snapshot_due_fpl_projections()` runs every 10 minutes (pg_cron) and captures each gameweek once:

- **`pre_deadline`:** taken when the deadline is within 60 minutes.
- **`late`:** taken if that window was missed, but only while no match in the gameweek has kicked off.

Each capture copies every `fpl_player_projections` row for the gameweek's fixtures, plus fixture $\lambda$ values, into the append-only `fpl_projection_snapshots` and `fpl_projection_fixture_snapshots`. Update and delete are refused by trigger. `manual` snapshots are also possible.

## Outputs (objects)

- Table `fpl_player_projections`: all components, probabilities, `model_version`, `generated_at`, `minutes_source`, `lineup_confidence`.
- Views `fpl_projection_frontend_feed_v6`, `fpl_season_player_projection_feed` and the optimiser feeds.
- Snapshots `fpl_projection_snapshots` and `fpl_projection_fixture_snapshots`.

## Schedule

| When (UTC) | What |
|---|---|
| 06:41 and 18:41 | `fpl-projections-pipeline.yml`: find the next 3 matchweeks → pass 1 refresh → bonus Monte Carlo → pass 2 refresh → final-table simulation. Site rebuild only after a successful 06:41 run. |
| Every 10 minutes | pg_cron `snapshot-fpl-projections` |
| Manual | `backfill-projections.yml` (`scripts/backfill-projections.ts`, all missing fixtures), `refresh-fpl-projections.yml` |

Fixtures beyond the 3-week window are only as fresh as their last backfill.

## Caveats

1. **Saves are biased upwards.** Save points use $E[S]/3$ rather than $E\lfloor S/3\rfloor$. For a full match this overstates by roughly 0.3 points on average (my estimate from the floor effect, not measured). Save rates also ignore the opponent's attacking strength.
2. **Defenders' defensive contribution may exclude tackles.** DEF events count CBI only, while MID and FWD count CBI + recoveries + tackles. As far as I know, the 2025/26 FPL defender rule counts tackles as well. Worth checking.
3. **Clean sheets are approximate.** They use $e^{-\lambda_{opp}}$ (plain Poisson, no Dixon-Coles $\tau$) multiplied by $p_{start}$ as a proxy for playing 60 minutes. The site's fixture pages read clean sheets from the $\tau$-corrected grid, so the two can differ.
4. **BPS mean likely double-counts.** The historical BPS rate already contains BPS from goals, assists, clean sheets and CBI/recoveries; the view then adds those terms again. `simulate_fixture_bonus.py` describes the residual as "everything … that isn't goals/assists/clean-sheet", which the view does not implement.
5. **All team goals go to players.** Allocation spreads the whole of $\lambda_{team}$ across the team's players. Part of a team's real goals arrive as opponent own goals, which credit no attacker in FPL, so player goals are inflated slightly. Own goals *conceded by* a player are modelled (−2 points, prior 0.02 per 90).
6. **Appearance points use a proxy.** They use $p_{start}$ for "60+ minutes", and uncapped outfield $p_{sub}$ (see [expected-minutes.md](expected-minutes.md), caveat 2).
7. **Freezing depends on status.** It relies on `fixtures.status = 'played'`. The 18:41 run can refresh a match-day fixture that has kicked off but is still `scheduled`, because results sync only covers `kickoff_date < current_date`. Pre-deadline snapshots are therefore the honest pre-match record.
   - The snapshot migration header says every stored projection for played matches (3,328 at 26 Sep) had been generated after kick-off by a backfill.
   - That contradicts `OUTSTANDING.md` "FPL projection history — RESOLVED (freeze-on-kickoff)".
8. **Stale rows can persist.** The upsert never deletes rows for players who drop out of the source views (for example after a transfer), so old projections can remain in `fpl_player_projections`.
9. **Season is hard-coded.** Scripts default to `--season-id 13` and `refresh_fpl_projections_range` defaults to 13, while the views use `fpl_current_season_id()`. This will need changing at rollover.
10. **`tactical_role_priors` values are not versioned** in the repository.
11. **`lineup_confidence` label mismatch:** see [expected-minutes.md](expected-minutes.md), caveat 1.

## Source

- `supabase/definitions/functions/refresh_fpl_projection_fixture_v6__p_fixture_id_bigint_p_allow_played_boolean.sql`, `refresh_fpl_projection_fixture_v6_impl__p_fixture_id_bigint.sql`, `get_fpl_fixture_bonus_v4__p_fixture_id_bigint.sql`, `snapshot_due_fpl_projections.sql`, `snapshot_fpl_projections__…sql`, `refresh_fpl_projections_range__…sql`.
- Legacy, not called by the pipeline: `refresh_fpl_bonus_v3_for_fixture__p_fixture_id_bigint.sql`.
- `supabase/definitions/views/fpl_projection_v4_leaguewide_inputs.sql`, `fpl_projection_leaguewide_allocation_v2.sql`, `fpl_projection_leaguewide_points.sql`, `fpl_projection_secondary_scoring.sql`, `fpl_projection_leaguewide_final.sql`, `fpl_defensive_contribution_projection_leaguewide.sql`, `fpl_player_defensive_contribution_usage.sql`, `fpl_fixture_bps_projection_v1.sql`, `fpl_set_piece_fixture_adjustments_v1.sql`, `fpl_set_piece_fixture_exposure_v1.sql`, `fpl_projection_frontend_feed_v6.sql`.
- `scripts/refresh_fpl_projections.py` (`main`: per-fixture RPC loop with retries), `scripts/get_next_matchweek_range.py`, `scripts/backfill-projections.ts`.
- `supabase/migrations/20260926100000_fpl_projection_snapshots.sql`.
- `.github/workflows/fpl-projections-pipeline.yml`, `refresh-fpl-projections.yml`, `backfill-projections.yml`.
