-- FPL depth chart: players sharing a rank split the places by start rate
-- (10 Oct 2026). Change is in scripts/fpl_depth_chart.py
-- (TIE_WEIGHT_BY_RATE = True); this records it.
insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
values ('2026-10-10', 'prediction',
  'FPL: tied pecking-order ranks share places by start rate',
  'Arsenal''s three 2nd-choice midfielders were 43% each to start, and Match Projections showed Zubimendi (0 starts in 5) beside Rice rather than Lewis-Skelly (4 in 5).',
  'Within a tied rank the places that reach the tier are shared in proportion to ready x start rate, capped at the chance a place is open; the tier''s total is unchanged. Registered backtest (scripts/backtest_depth_ties.py, GW3-5, 1,761 player-matches): Brier 0.07836 -> 0.07830, log loss 0.27046 -> 0.27018; tied players 0.07661 -> 0.07615. Small but better on both, as the rule required.',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261010070000');
