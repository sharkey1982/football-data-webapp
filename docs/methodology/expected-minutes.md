# Expected minutes, start and sub probabilities

Derived from the live view definitions exported on 2026-09-26. This covers the Premier League (E0) only: every source view filters `l.code = 'E0'` or `fpl_current_season_id()`.

## What it answers

For each (fixture, FPL player) pair, this model gives:

- `prob_starting_xi`: the probability the player starts.
- `prob_sub_appearance`: the probability the player comes off the bench.
- `expected_minutes`.
- `availability_probability`.
- `tactical_role`.
- `minutes_source`: which evidence produced the numbers.

## Which version is live

`refresh_fpl_projection_fixture_v6_impl` and `fpl_projection_v4_leaguewide_inputs` read **`fixture_player_expected_minutes_resolved_v3`**. Since migration `20260926140000_fpl_minutes_team_sheet_limits`, that view applies team-sheet limits on top of **`fixture_player_expected_minutes_resolved_v3_raw`**, which holds the previous `resolved_v3` logic unchanged.

Dependency chain (live):

```
fixture_player_lineup_consensus ─► fixture_player_expected_minutes_v2 ─► fixture_player_expected_minutes_v3 ─┐
fixture_player_expected_minutes_fallback ─────────────────────────────────────────────────────────────────────┼─► fixture_player_expected_minutes_resolved
fixture_player_tactical_consensus ────────────────────────────────────────────────────────────────────────────┘                 │
fpl_fallback_start_probability_v6 ─┐                                                                                             ▼
fpl_player_squad_state_current ────┴──────────────────────────────────────────────────────────────► fixture_player_expected_minutes_resolved_v3_raw
                                                                                                                                 ▼
                                                                                              fixture_player_expected_minutes_resolved_v3  (live)
```

`fixture_player_expected_minutes` (v1) is not referenced by the live chain.

## Inputs (objects)

| Object | Used for |
|---|---|
| `fixture_lineup_predictions`, `fixture_lineup_prediction_players`, `lineup_prediction_sources` (`active`, `source_weight`) | Predicted line-ups from external sources, with `predicted_start`, `tactical_role` and `source_start_probability` |
| `fpl_players` | FPL `status`, `chance_of_playing_next_round`/`_this_round`, `element_type`, `canonical_team_id` |
| `fpl_player_gameweeks` → `fpl_player_substitution_usage` | Season appearances (`minutes > 0`), `likely_starts` (`minutes >= 60`), `sub_appearances` (1–59 min), `avg_sub_minutes` (default 20) |
| `player_squad_hierarchy` | Depth: `squad_status` (`first_choice`/`rotation`/`backup`), `hierarchy_score` |
| `fpl_player_squad_state` → `fpl_player_squad_state_current` | Manual or sourced `start_probability_override`, `availability_probability`, effective `now()`; `manual_tactical_override` wins, then latest `effective_from` |
| `team_player_tactical_defaults`, `player_tactical_profiles` | Fallback tactical role and confidence |

## Method

### 1. Line-up consensus (`fixture_player_lineup_consensus`)

For each fixture and team, with $W$ = the summed `source_weight` of active sources:

$$c = \frac{\sum_{s:\,\text{predicted\_start}} w_s}{W}$$

The availability used here is 0 if the FPL status is `i`/`u`/`s`, otherwise `chance_of_playing_next_round`/100, otherwise 1.

### 2. Consensus path (`_v2`, `_v3`)

- **Start probability:** $p_{start} = \min(c \cdot avail,\ 0.99)$ for goalkeepers and $0.97$ for outfield players.
- **Minutes if starting:** GK 90; otherwise 80 if $p_{start}\ge0.8$, 74 if $\ge0.5$, else 68.
- **Raw sub probability** (outfield only):

  $$\min\left(0.85, \max\left(0.03, \frac{subs + 0.5}{apps + 2}\cdot k\right)\right)$$

  where $k$ = 1.15 for rotation, 1.0 for backup, 0.65 for first choice and 0.45 for unknown.
- `_v2` sub probability = $(1-p_{start}) \cdot raw \cdot avail$.
- **Minutes if subbed on:** clamp(`avg_sub_minutes`, 5, 40).
- `_v3` rescales sub probabilities so that each team sums to **4.25** substitute appearances, capped at 1 per player.
- **Minutes scaling:** $raw = p_{start} \cdot m_{start} + p_{sub} \cdot m_{sub}$ is scaled so that each team sums to 990 and capped at 90 per player. The shortfall is redistributed in proportion to each player's spare capacity $(90 - m)$.

### 3. Fallback path (`fixture_player_expected_minutes_fallback`)

- **Start probability:** $avail \cdot \frac{starts+1.5}{apps+3}$. With no appearances, use the depth prior instead: first choice 0.72, rotation 0.38, backup 0.12, unknown 0.18. Capped at 0.97.
- **Sub probability:** $\min(0.75,\ avail\,(1-p_{start})\,k)$, with $k$ = 0.7 for rotation, 0.5 for backup, 0.35 for first choice and 0.3 for unknown.
- **Minutes if starting:** GK 90; otherwise 78, 72 or 68 by start band.
- Minutes are scaled to 990 per team, capped at 90 and redistributed in proportion to minutes.

### 4. Resolution (`fixture_player_expected_minutes_resolved`)

The consensus value is used where one exists; otherwise the fallback. `minutes_source` is `lineup_consensus_v3` or `fallback_history_hierarchy`. Tactical role comes from `fixture_player_tactical_consensus` if present.

### 5. Raw v3 (`fixture_player_expected_minutes_resolved_v3_raw`)

Precedence for players **without** a consensus row:

1. **Squad-state override:**
   - $p_{start}$ = `start_probability_override`.
   - Minutes = $\text{clamp}_{[0,90]}(p_{start}\cdot M + p_{sub}\cdot 20)$, where $M$ = 90 for a GK and 80 for outfield players.
   - Source = `squad_state_override`.
2. **`fpl_fallback_start_probability_v6`:**

   $$p_{start} = \min(0.98,\ avail \cdot q)$$

   | Condition | $q$ |
   |---|---|
   | apps ≥ 4, all of them starts | 0.96 |
   | apps = 3, all starts | 0.94 |
   | apps ≥ 3 and starts ≥ apps − 1 | 0.84 |
   | other apps > 0 | $\text{clamp}_{[0.05,0.90]}((starts+0.5)/(apps+1))$ |
   | no apps | depth prior 0.72 / 0.38 / 0.12 / 0.18 |

   Minutes use the same formula as the override. Source = `nailed_history_v6`, `strong_history_v6` or `fallback_history_v6`.

For these players, $p_{sub}$ is the fallback view's value and **no team total is enforced** at this stage. Players with a consensus row keep the consensus values.

Availability: squad-state value, otherwise the v6 value, otherwise the resolved value.

### 6. Team-sheet limits (`fixture_player_expected_minutes_resolved_v3`, applied 2026-09-26)

Each team's players are partitioned into goalkeepers and outfield players.

**Goalkeepers.** The GK ranked first by (expected minutes, start probability, id) keeps $\min(m, 90)$ and $\min(p_{start}, 1)$. Every other GK $j$ is scaled:

$$m_j \leftarrow m_j \cdot \min\left(1, \frac{\max(90 - m_1, 0)}{\sum_{k>1} m_k}\right), \qquad p_j \leftarrow p_j \cdot \min\left(1, \frac{\max(1 - p_1, 0)}{\sum_{k>1} p_k}\right)$$

Their sub probability is scaled by $m_j^{new}/m_j$.

**Outfield players.** Limits apply only if the team total exceeds 900 minutes or 10 starters. The excess is removed in proportion to each player's uncertain share:

$$m_i \leftarrow \max\left(0,\ m_i - (M_{team} - 900)\,\frac{m_i(1-p_i)}{\sum_j m_j(1-p_j)}\right)$$
$$p_i \leftarrow \max\left(0,\ p_i - (S_{team} - 10)\,\frac{p_i(1-p_i)}{\sum_j p_j(1-p_j)}\right)$$

Here $p$ is capped at 1 inside the weights. Evidence recorded in the migration header:

- GW4–5 average minutes: 29.6 against 29.6 actual (raw model: 32.7).
- GK error: 10.9 → 2.8 minutes.
- After the change: exactly 2 starting keepers and 180 GK minutes per fixture.

### Tactical role (`fixture_player_tactical_consensus`)

The source role with the highest $\sum w_s \cdot$ `source_start_probability` wins. Otherwise the fallback is `team_player_tactical_defaults` (confidence default 0.30), and failing that the FPL position (`GK`/`DEF`/`MID`/`CF`).

### Return from injury

No per-fixture return date is modelled. The same availability figure (`chance_of_playing_next_round`, or the squad-state row effective **now**) is applied to every fixture in the projection window.

## Outputs (objects)

`fixture_player_expected_minutes_resolved_v3` (live), consumed by `fpl_projection_v4_leaguewide_inputs`, `fpl_set_piece_fixture_exposure_v1` and `refresh_fpl_projection_fixture_v6_impl`. That function stores `expected_minutes`, `start_probability`, `sub_appearance_probability`, `availability_probability`, `minutes_source` and `lineup_confidence` in `fpl_player_projections`.

## Schedule

These are views, evaluated whenever `refresh_fpl_projection_fixture_v6` runs. That happens in `fpl-projections-pipeline.yml` at 06:41 and 18:41 UTC, for the next 3 matchweeks as determined by `scripts/get_next_matchweek_range.py`. Line-up sources and squad state are refreshed by other jobs and admin pages; their schedules are not covered here.

## Caveats

1. **`lineup_confidence` mapping never matches.** `refresh_fpl_projection_fixture_v6_impl` maps `minutes_source` to a confidence value, where `'consensus_v3'` → 0.90. No view emits `'consensus_v3'`: the actual label is `'lineup_consensus_v3'`. Consensus-based rows therefore get the default 0.55, lower than nailed-history rows (0.80).
2. **Sub probabilities are only partly capped.** The team-sheet limits cap goalkeepers and outfield starts and minutes, but not outfield **sub** probabilities. `_v3` normalises consensus-path subs to 4.25 per team without bounding $p_{sub} \le 1 - p_{start}$. The fallback-v6 path has no team sub total at all. Appearance points ($2p_{start} + p_{sub}$) can therefore still be inflated. `fpl_projection_frontend_feed_v6` clamps the *displayed* sub probability to $1 - p_{start}$, but the stored points are not recomputed.
3. **Limits only reduce.** A team whose total is under 900 minutes or 10 starters is not scaled up. The migration notes 1,966 minutes per fixture after the change, against a notional 1,980.
4. **`likely_starts` is inferred, not observed.** It is defined as `minutes >= 60`. A starter substituted before 60 minutes counts as a sub appearance.
5. **Availability and squad state are applied as of today.** They are not tied to fixture dates (see "Return from injury" above).
6. **Latent issue at season rollover.** `fixture_player_lineup_consensus` joins `fpl_players` on `canonical_team_id` with no season filter. `fixture_player_expected_minutes_v2` joins on `fpl_player_id` alone. Today `fpl_players` holds only season 13 (historic seasons live in `fpl_player_season_totals`), so there is no current effect. After the 2027/28 rollover, both joins could pick up the wrong season's rows.
7. **Unclear:** how `player_squad_hierarchy` and `lineup_prediction_sources.source_weight` are populated and refreshed. No script in `scripts/` writes them.

## Source

- `supabase/definitions/views/fixture_player_expected_minutes_resolved_v3.sql`, `…_resolved_v3_raw.sql`, `…_resolved.sql`, `…_v3.sql`, `…_v2.sql`, `…_fallback.sql`.
- `supabase/definitions/views/fixture_player_lineup_consensus.sql`, `fixture_player_tactical_consensus.sql`, `fpl_fallback_start_probability_v6.sql`, `fpl_player_squad_state_current.sql`, `fpl_player_substitution_usage.sql`, `fpl_projection_frontend_feed_v6.sql`.
- `supabase/migrations/20260926140000_fpl_minutes_team_sheet_limits.sql` (rationale and evidence; the SQL itself is in the definitions export).
- `supabase/definitions/functions/refresh_fpl_projection_fixture_v6_impl__p_fixture_id_bigint.sql` (the `lineup_confidence` CASE).
