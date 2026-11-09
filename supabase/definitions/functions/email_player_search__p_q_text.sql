-- Live definition exported from the database (function email_player_search(p_q text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_player_search(p_q text)
 RETURNS TABLE(id integer, name text, team text, pos text, price numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select p.fpl_player_id::int, p.web_name, ft.short_name,
         case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end,
         round(p.now_cost / 10.0, 1)
    from public.fpl_players p
    left join public.fpl_teams ft on ft.season_id = p.season_id and ft.fpl_team_id = p.fpl_team_id
   where p.season_id = public.fpl_current_season_id() and p.now_cost > 0 and length(trim(coalesce(p_q, ''))) >= 2
     and (p.web_name ilike '%' || trim(p_q) || '%' or (p.first_name || ' ' || p.second_name) ilike '%' || trim(p_q) || '%'
          or public.unaccent(p.web_name) ilike '%' || public.unaccent(trim(p_q)) || '%')
   order by p.selected_by_percent desc nulls last, p.fpl_player_id
   limit 10;
$function$
;
