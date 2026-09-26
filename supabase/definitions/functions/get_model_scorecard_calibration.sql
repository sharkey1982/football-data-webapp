-- Live definition exported from the database (function get_model_scorecard_calibration()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_model_scorecard_calibration()
 RETURNS TABLE(league_id bigint, season_id bigint, outcome text, bin integer, n bigint, predicted numeric, happened bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with o as (
    select s.league_id, s.season_id, 'Home'::text outcome, s.p_home p, (s.result = 'H') hit from public.model_scorecard_matches s
    union all select s.league_id, s.season_id, 'Draw', s.p_draw, s.result = 'D' from public.model_scorecard_matches s
    union all select s.league_id, s.season_id, 'Away', s.p_away, s.result = 'A' from public.model_scorecard_matches s)
  select o.league_id, o.season_id, o.outcome, least(9, floor(o.p * 10))::int, count(*), sum(o.p), count(*) filter (where o.hit)
  from o group by 1, 2, 3, 4;
$function$
;
