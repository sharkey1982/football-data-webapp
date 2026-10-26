-- Live definition exported from the database (function get_model_xi_history(p_season_id bigint, p_league_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_model_xi_history(p_season_id bigint DEFAULT fpl_current_season_id(), p_league_id bigint DEFAULT 1)
 RETURNS TABLE(fpl_event_id integer, actual_xi_points integer, model_xi_actual_points integer, model_xi_projected numeric, overlap_count integer, players_projected integer, generated_before_deadline boolean, deadline_time timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- p_league_id is kept for callers; FPL gameweeks are Premier League only.
  -- generated_before_deadline is true for a gameweek reviewed from its
  -- pre_deadline snapshot (fpl_review_projections_v6, 22 Oct 2026).
  with weeks as (
    select gw.fpl_event_id as e, gw.deadline_time
    from public.fpl_gameweeks gw
    where gw.season_id = p_season_id and gw.finished and gw.data_checked
  ),
  cover as (
    select pr.fpl_event_id as e,
           count(distinct pr.fpl_player_id)::int as players_projected,
           max(pr.generated_at) as last_generated
    from public.fpl_review_projections_v6 pr
    where pr.season_id = p_season_id
    group by pr.fpl_event_id
  )
  select w.e::integer, t.actual_xi_points, t.model_xi_actual_points, t.model_xi_projected,
         t.overlap_count, c.players_projected,
         (c.last_generated < w.deadline_time) as generated_before_deadline,
         w.deadline_time
  from weeks w
  join cover c on c.e = w.e
  cross join lateral public.get_totw_vs_model(w.e::int, p_season_id) t
  where c.players_projected > 0
  order by w.e;
$function$
;
