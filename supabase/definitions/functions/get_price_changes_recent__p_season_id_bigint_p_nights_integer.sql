-- Live definition exported from the database (function get_price_changes_recent(p_season_id bigint, p_nights integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_price_changes_recent(p_season_id bigint DEFAULT fpl_current_season_id(), p_nights integer DEFAULT 1)
 RETURNS TABLE(night date, fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, price_before numeric, price_after numeric, ownership numeric, progress numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with nights as (
    select distinct night from public.fpl_price_predictor_nights
     where season_id = p_season_id order by night desc limit greatest(p_nights, 1))
  select r.night, r.fpl_player_id::bigint, p.web_name, p.slug, t.display_name,
         case p.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' else '?' end,
         round(r.price_before / 10.0, 1), round(r.price_after / 10.0, 1), round(r.ownership, 1), round(r.progress, 1)
    from public.fpl_price_predictor_nights r
    join nights n on n.night = r.night
    join public.fpl_players p on p.season_id = r.season_id and p.fpl_player_id = r.fpl_player_id
    left join public.teams t on t.team_id = p.canonical_team_id
   where r.season_id = p_season_id and r.price_after <> r.price_before
   order by r.night desc, (r.price_after > r.price_before) desc, r.ownership desc nulls last;
$function$
;
