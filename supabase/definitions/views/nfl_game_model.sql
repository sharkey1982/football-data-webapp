-- Live definition exported from the database (view nfl_game_model).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_game_model with (security_invoker=true) as
 SELECT DISTINCT ON (p.game_id) p.game_id,
    p.model_version,
    p.predicted_at,
    p.home_edge,
    p.p_home,
    p.predicted_margin,
    p.market_p_home,
    p.spread_line,
    p.total_line
   FROM (nfl.model_predictions p
     JOIN nfl.games g ON ((g.game_id = p.game_id)))
  WHERE ((g.kickoff_at IS NULL) OR (p.predicted_at < g.kickoff_at))
  ORDER BY p.game_id, p.predicted_at DESC;
