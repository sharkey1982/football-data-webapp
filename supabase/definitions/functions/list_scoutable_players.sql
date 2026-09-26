-- Live definition exported from the database (function list_scoutable_players()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.list_scoutable_players()
 RETURNS TABLE(slug text, canonical_name text, career_points bigint, seasons_played bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select i.slug, i.canonical_name,
    sum(t.total_points)::bigint, count(*)::bigint
  from public.player_identity i
  join public.fpl_player_season_totals t on t.fpl_code = i.fpl_code
  group by i.slug, i.canonical_name
  having sum(t.minutes) > 0
  order by sum(t.total_points) desc;
$function$
;
