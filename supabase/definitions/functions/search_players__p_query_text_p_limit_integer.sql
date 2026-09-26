-- Live definition exported from the database (function search_players(p_query text, p_limit integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.search_players(p_query text, p_limit integer DEFAULT 20)
 RETURNS TABLE(fpl_code bigint, slug text, canonical_name text, latest_web_name text, latest_team text, element_type integer, seasons_played bigint, career_points bigint, first_season text, last_season text, current_slug text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with matches as (
    select i.fpl_code, i.slug, i.canonical_name, i.first_seen_season_id, i.last_seen_season_id
    from public.player_identity i
    where p_query is not null and length(trim(p_query)) >= 2
      and i.canonical_name ilike '%' || trim(p_query) || '%'
  ),
  agg as (
    select m.fpl_code, m.slug, m.canonical_name, m.first_seen_season_id, m.last_seen_season_id,
      count(*)::bigint seasons_played, sum(t.total_points)::bigint career_points,
      (array_agg(t.web_name order by t.season_id desc))[1] latest_web_name,
      (array_agg(t.team_name order by t.season_id desc))[1] latest_team,
      (array_agg(t.element_type order by t.season_id desc))[1] element_type
    from matches m
    join public.fpl_player_season_totals t on t.fpl_code = m.fpl_code
    group by m.fpl_code, m.slug, m.canonical_name, m.first_seen_season_id, m.last_seen_season_id
  )
  select a.fpl_code, a.slug, a.canonical_name, a.latest_web_name, a.latest_team, a.element_type,
    a.seasons_played, a.career_points, fs.slug, ls.slug,
    (select p.slug from public.fpl_players p where p.fpl_code = a.fpl_code and p.season_id = (SELECT public.fpl_current_season_id()) limit 1)
  from agg a
  left join public.seasons fs on fs.season_id = a.first_seen_season_id
  left join public.seasons ls on ls.season_id = a.last_seen_season_id
  order by a.career_points desc
  limit greatest(1, least(p_limit, 50));
$function$
;
