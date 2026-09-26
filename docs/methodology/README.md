# FixtureShark model methodology

How each model works, written from the code and the live database definitions (`supabase/definitions/`, exported 2026-09-26). The live definitions are authoritative over migrations. Where the code and its comments disagree, the documents say so; where something could not be established, they say "Unclear".

| Document | Covers |
|---|---|
| [dixon-coles.md](dixon-coles.md) | Match model: likelihood, time decay, $\rho$, home advantage, fit window, quality gates, point-in-time rule, promoted-team estimates, manual overrides, freezing, scorecard, `model_versions` |
| [expected-minutes.md](expected-minutes.md) | Start and sub probabilities and expected minutes: live view version, line-up consensus, squad state, availability, depth, team-sheet limits |
| [fpl-projections.md](fpl-projections.md) | Expected FPL points: every xpts component, scoring rules, xG/xA shrinkage, clean sheets, defensive contributions, saves, cards and own goals, set pieces, bonus, snapshots |
| [simulations.md](simulations.md) | Final-table Monte Carlo, bonus Monte Carlo, hindsight-optimal squad, Season XI |

## Pipeline at a glance (UTC)

| Time | Job | Effect |
|---|---|---|
| 06:00 | `daily-import.yml` | Import results E0–EC → fit Dixon-Coles per league → estimate promoted/relegated teams → `backfill_fixture_predictions()` |
| 06:41, 18:41 | `fpl-projections-pipeline.yml` | Next 3 matchweeks: projections pass 1 → bonus Monte Carlo → projections pass 2 → final-table simulation → site rebuild (06:41, success only) |
| 06:45 | `hindsight-optimal.yml` | Hindsight-optimal squad |
| 09:30, 21:30 | pg_cron | `sync_fixture_status_from_results()` |
| 10:00, 22:00 | pg_cron | `refresh_model_scorecard()` |
| every 10 minutes | pg_cron | `snapshot_due_fpl_projections()` |

## Known limitations

Issues found in the code, or recorded in `OUTSTANDING.md` and `docs/incidents.md`. The most material come first. Each links to the detailed caveat.

1. **Promoted-team estimates are shrunk to average in E0.** `backfill_fixture_predictions()` multiplies E0 ratings by $n/(n+12)$ when a team has fewer than 12 in-window E0 matches. A newly promoted team's estimated rating (from `estimate_promoted_team_ratings.py`) is therefore mostly replaced by a league-average side early in the season. See [dixon-coles.md](dixon-coles.md), caveat 1.
2. **E0 live predictions are not point-in-time.** The home/away deviations are computed from data up to the latest E0 match, not the fit date. This is acknowledged in `model_versions`. See [dixon-coles.md](dixon-coles.md), caveat 2.
3. **Minutes and team-sheet caps.** Migration `20260926140000_fpl_minutes_team_sheet_limits` **fixes the goalkeeper excess** (previously ~1.37 starting GKs and 133 GK minutes per team) and **caps outfield starts and minutes** at 10 and 900. It does not cap outfield **sub** probabilities, and does not bound $p_{sub}\le1-p_{start}$. It only scales down, never up. Appearance points can still be inflated through $p_{sub}$. See [expected-minutes.md](expected-minutes.md), caveats 2–3.
4. **Own goals.** Own goals *conceded* are modelled: −2 × a shrunk per-minute rate, prior 0.02 per 90, in `fpl_projection_secondary_scoring`. However, the team's whole $\lambda$ is allocated to its players, so goals that would really be opponent own goals are credited to attackers. See [fpl-projections.md](fpl-projections.md), caveat 5.
5. **Saves points are overstated.** They use $E[S]/3$ instead of $E\lfloor S/3\rfloor$, and ignore the opponent. See [fpl-projections.md](fpl-projections.md), caveat 1.
6. **BPS mean double-counts.** The historical BPS rate already includes goal, clean-sheet and CBI/recovery BPS, which are then added again. This feeds both the bonus Monte Carlo and the closed-form fallback. See [fpl-projections.md](fpl-projections.md), caveat 4.
7. **Fixed 2026-09-26.** **`lineup_confidence` label mismatch.** The mapping expects `'consensus_v3'`, but the views emit `'lineup_consensus_v3'`, so consensus-based rows show 0.55 instead of 0.90. See [expected-minutes.md](expected-minutes.md), caveat 1.
8. **Defender defensive contribution may miss tackles.** DEF events count CBI only, while MID and FWD include recoveries and tackles. See [fpl-projections.md](fpl-projections.md), caveat 2.
9. **The final-table simulation can double-count.** It combines played results from `matches` with fixtures still marked `scheduled`, so a match can be counted as both played and remaining. It also drops `postponed` fixtures and ignores $\rho$. See [simulations.md](simulations.md), §1.
10. **Hindsight solver under-counts double gameweeks.** `gw_xpts[mw] = pts` overwrites, keeping only one fixture's points per week. It also uses today's prices and assumes `fixture_id = fpl_fixture_id`. See [simulations.md](simulations.md), §3.
11. **Freezing FPL projections depends on status.** Fixtures that have kicked off but are still `scheduled` can be refreshed on match day. The snapshot migration says all 3,328 stored played-match projections were generated after kick-off, which contradicts `OUTSTANDING.md` "freeze-on-kickoff — RESOLVED". Pre-deadline snapshots (from 26 Sep) are the honest record.
12. **Manual overrides are unscoped and unversioned.** They have no league, season, date or history, and apply to non-E0 fixtures labelled `dc_baseline_v1`. `team_strength_forward_adjustments` (dated, decaying) exists but is not wired into any view or function.
13. **Clean sheets are inconsistent across the site.** FPL clean sheets use $e^{-\lambda}$ without the Dixon-Coles $\tau$; the fixture pages use the $\tau$-corrected grid.
14. **Fixture feed is not fully reliable (open incident).** `refresh_fixture_feeds` under-updates statuses; the root cause is not found (`docs/incidents.md`, 2026-09-23). The kick-off guard protects Dixon-Coles predictions, but not FPL projections or the final-table simulation.
15. **Season 13 is hard-coded.** It appears in scripts and workflows (`refresh_fpl_projections.py`, `simulate_fixture_bonus.py`, `simulate_final_table.py`, `solve-hindsight-optimal.ts`, `refresh_fpl_projections_range`), while the views use `fpl_current_season_id()`. There are also latent cross-season joins in the line-up consensus views.
16. **Model accuracy is modest (`OUTSTANDING.md`).**
    - The early live record did not beat "always pick home" on hit rate.
    - It was well calibrated in the 20–50% bands, but overconfident at 60%+ on a small sample.
    - The half-life/shrinkage grid showed no significant improvement on held-out data.
    - The PL estimated-ratings gap traces mostly to Sunderland 2025/26.
17. **No staged publication.** A failed FPL run leaves a mix of model generations until the next run repairs it. The rebuild is now `if: success()`, but staged publication needs a schema change (`docs/incidents.md`, 2026-09-25).
18. **Undocumented inputs.** The values in `tactical_role_priors`, and how `player_squad_hierarchy` and `lineup_prediction_sources.source_weight` are maintained, are not in the repository.
