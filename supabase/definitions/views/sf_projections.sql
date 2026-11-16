-- Live definition exported from the database (view sf_projections).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.sf_projections with (security_invoker=true) as
 SELECT season_id,
    round,
    player_id,
    made_after_round,
    x_points,
    p_start,
    x_minutes,
    x_goals,
    x_assists,
    p_clean_sheet
   FROM sf.projections;
