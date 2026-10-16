-- Live definition exported from the database (function ai_resolve_season(p_league_id bigint, p_season text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_resolve_season(p_league_id bigint, p_season text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when p_season is null or p_season in ('', 'current', 'this season') then public.ai_current_season(p_league_id)
    when p_season in ('last', 'last season', 'previous') then
      public.previous_season_id(public.ai_current_season(p_league_id))
    else (select season_id from seasons
           where label = regexp_replace(p_season, '[^0-9]', '', 'g')
              or slug = p_season
              or label = right(split_part(p_season, '/', 1), 2) || right(split_part(p_season, '/', 2), 2)
           limit 1)
  end
$function$
;
