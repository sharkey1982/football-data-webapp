-- Live definition exported from the database (function get_fpl_lineup_comparison(p_event integer, p_source text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_lineup_comparison(p_event integer, p_source text DEFAULT 'fantasy_football_scout'::text)
 RETURNS TABLE(team_id bigint, team_name text, fpl_player_id bigint, web_name text, element_type integer, tactical_role text, depth_rank integer, status text, news text, start_probability numeric, expected_minutes numeric, source_start boolean, source_entered_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  with v as (select public.fpl_current_season_id() s),
  ours as (
    select f.team_id, f.fpl_player_id, max(f.start_probability) sp, max(f.expected_minutes) em
      from public.fpl_projection_frontend_feed_v6 f
      join public.fixtures fx on fx.fixture_id = f.fixture_id
      join public.fpl_fixtures ff on ff.canonical_fixture_id = f.fixture_id and ff.season_id = fx.season_id
     where ff.fpl_event_id = p_event
     group by f.team_id, f.fpl_player_id
  ), ext as (
    select e.team_id, e.fpl_player_id, e.entered_at
      from public.fpl_external_lineups e, v
     where e.source = p_source and e.season_id = v.s and e.fpl_event_id = p_event
  ), entered as (select ext.team_id, max(ext.entered_at) as last_at from ext group by ext.team_id)
  select o.team_id::bigint, t.display_name::text, o.fpl_player_id::bigint, p.web_name::text, p.element_type::integer,
         d.tactical_role::text, d.depth_rank::integer, p.status::text, nullif(p.news, '')::text,
         round(o.sp, 3), round(o.em, 1),
         case when en.team_id is null then null else (x.fpl_player_id is not null) end,
         en.last_at
    from ours o
    join v on true
    join public.fpl_players p on p.fpl_player_id = o.fpl_player_id and p.season_id = v.s
    join public.teams t on t.team_id = o.team_id
    left join public.team_player_tactical_defaults d on d.fpl_player_id = o.fpl_player_id and d.team_id = o.team_id and d.season_id = v.s
    left join ext x on x.team_id = o.team_id and x.fpl_player_id = o.fpl_player_id
    left join entered en on en.team_id = o.team_id;
end $function$
;
