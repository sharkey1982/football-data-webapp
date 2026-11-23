-- Live definition exported from the database (function nfl_insert_predictions(rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.nfl_insert_predictions(rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare n int;
begin
  insert into nfl.model_predictions (game_id, model_version, home_rating, away_rating, home_edge, p_home,
    predicted_margin, market_p_home, spread_line, total_line, home_moneyline, away_moneyline)
  select r->>'game_id', r->>'model_version', (r->>'home_rating')::numeric, (r->>'away_rating')::numeric,
    (r->>'home_edge')::numeric, (r->>'p_home')::numeric, (r->>'predicted_margin')::numeric,
    (r->>'market_p_home')::numeric, (r->>'spread_line')::numeric, (r->>'total_line')::numeric,
    (r->>'home_moneyline')::int, (r->>'away_moneyline')::int
  from jsonb_array_elements(rows) r
  join nfl.games g on g.game_id = r->>'game_id'
  where g.home_score is null and (g.kickoff_at is null or g.kickoff_at > now());
  get diagnostics n = row_count;
  return n;
end $function$
;
