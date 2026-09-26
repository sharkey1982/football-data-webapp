-- Live definition exported from the database (function get_best_defence_rating(p_league_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_best_defence_rating(p_league_id bigint)
 RETURNS TABLE(canonical_name text, goals_against_per_game numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with latest_fit as (
    select fit_run_id from public.model_fit_runs
    where league_id = p_league_id and status = 'accepted'
    order by fitted_at desc
    limit 1
  )
  select t.canonical_name,
    exp(-(tr.defence_strength + coalesce(o.defence_adjustment, 0))) as goals_against_per_game
  from public.team_ratings tr
  join latest_fit lf on lf.fit_run_id = tr.fit_run_id
  join public.teams t on t.team_id = tr.team_id
  left join public.team_strength_manual_override o on o.team_id = tr.team_id
  order by goals_against_per_game asc
  limit 4;
$function$
;
