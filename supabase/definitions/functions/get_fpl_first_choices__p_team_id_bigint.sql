-- Live definition exported from the database (function get_fpl_first_choices(p_team_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_first_choices(p_team_id bigint)
 RETURNS TABLE(first_choice_id bigint, fpl_player_id bigint, web_name text, start_if_fit numeric, effective_from date, effective_to date, note text, set_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.first_choice_id, c.fpl_player_id, p.web_name, c.start_if_fit, c.effective_from, c.effective_to, c.note, c.set_at
    from public.fpl_player_first_choice c
    join public.fpl_players p on p.fpl_player_id = c.fpl_player_id and p.season_id = public.fpl_current_season_id()
   where c.removed_at is null and p.canonical_team_id = p_team_id
     and (c.effective_to is null or c.effective_to >= current_date)
   order by p.web_name;
$function$
;
