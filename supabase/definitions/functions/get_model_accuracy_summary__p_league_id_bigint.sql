-- Live definition exported from the database (function get_model_accuracy_summary(p_league_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_model_accuracy_summary(p_league_id bigint DEFAULT NULL::bigint)
 RETURNS TABLE(fixtures integer, correct integer, hit_rate numeric, always_home_hit_rate numeric, model_brier numeric, uniform_brier numeric, mean_p_actual numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with a as (select * from public.get_model_accuracy(p_league_id))
  select
    count(*)::int,
    count(*) filter (where correct)::int,
    round(100.0 * count(*) filter (where correct) / nullif(count(*),0), 1),
    -- Baseline 1: always pick the home team. Home advantage alone is a
    -- surprisingly strong predictor, so beating it is the real bar.
    round(100.0 * count(*) filter (where actual = 'H') / nullif(count(*),0), 1),
    round(avg(brier), 4),
    -- Baseline 2: a model that always says 33.3/33.3/33.3 scores 0.6667.
    0.6667,
    round(avg(p_actual), 1)
  from a;
$function$
;
