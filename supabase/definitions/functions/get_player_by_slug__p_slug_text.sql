-- Live definition exported from the database (function get_player_by_slug(p_slug text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_player_by_slug(p_slug text)
 RETURNS TABLE(fpl_code bigint, slug text, canonical_name text, latest_web_name text, latest_team text, element_type integer, seasons_played bigint, career_points bigint, career_minutes bigint, first_season text, last_season text, current_slug text, current_fpl_player_id bigint, current_total_points integer, current_minutes integer, current_goals integer, current_assists integer, current_bonus integer, current_now_cost integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select i.fpl_code, i.slug, i.canonical_name,
    (array_agg(t.web_name order by t.season_id desc))[1],
    (array_agg(t.team_name order by t.season_id desc))[1],
    (array_agg(t.element_type order by t.season_id desc))[1],
    count(t.season_id)::bigint,
    coalesce(sum(t.total_points), 0)::bigint,
    coalesce(sum(t.minutes), 0)::bigint,
    fs.slug, ls.slug,
    cur.slug,
    cur.fpl_player_id::bigint,
    cur.total_points, cur.minutes, cur.goals_scored, cur.assists, cur.bonus, cur.now_cost
  from public.player_identity i
  left join public.fpl_player_season_totals t on t.fpl_code = i.fpl_code
  left join public.seasons fs on fs.season_id = i.first_seen_season_id
  left join public.seasons ls on ls.season_id = i.last_seen_season_id
  -- Current squad only. A player who has left has no row here, and every
  -- current_* column comes back null.
  left join public.fpl_players cur on cur.fpl_code = i.fpl_code and cur.season_id = (SELECT public.fpl_current_season_id())
  where i.slug = p_slug
  group by i.fpl_code, i.slug, i.canonical_name, fs.slug, ls.slug,
    cur.slug, cur.fpl_player_id, cur.total_points, cur.minutes,
    cur.goals_scored, cur.assists, cur.bonus, cur.now_cost;
$function$
;
