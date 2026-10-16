-- Live definition exported from the database (function ai_tool_get_fpl_projections(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_get_fpl_projections(args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  cur bigint := public.fpl_current_season_id();
  gw int := coalesce((args->>'gameweek')::int,
                     public.ai_next_fpl_gameweek(cur));
  n_gw int := least(coalesce((args->>'gameweeks')::int, 1), 6);
  pos int := case upper(args->>'position') when 'GK' then 1 when 'DEF' then 2 when 'MID' then 3 when 'FWD' then 4 end;
  maxp numeric := (args->>'max_price')::numeric;
  lim int := least(coalesce((args->>'limit')::int, 10), 30);
  pl jsonb; t jsonb; pid int; tid bigint;
begin
  if args ? 'player' then pl := public.ai_resolve_fpl_player(args->>'player', cur); if pl ? 'error' then return pl; end if; pid := (pl->>'fpl_player_id')::int; end if;
  if args ? 'team' then t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if; tid := (t->>'team_id')::bigint; end if;
  return jsonb_build_object('tool', 'get_fpl_projections',
    'source', jsonb_build_array('fpl_projection_frontend_feed_v6', 'fixtures', 'fpl_players'), 'as_of', now(),
    'kind', 'model_estimate', 'model_version', 'leaguewide_v6',
    'gameweeks', case when n_gw = 1 then 'GW' || gw else 'GW' || gw || '-GW' || (gw + n_gw - 1) end,
    'note', 'FixtureShark projections: expected FPL points and components summed over the gameweeks requested (double gameweeks count both fixtures). These are model estimates, not FPL data. Price in £m.',
    'rows', coalesce((select jsonb_agg(r) from (
      select p.web_name player, tm.display_name team, public.ai_fpl_position(p.element_type) position,
             round(p.now_cost / 10.0, 1) price, count(*) fixtures,
             round(sum(v.expected_fpl_points), 2) expected_points, round(sum(v.expected_minutes)) expected_minutes,
             round(avg(v.start_probability), 2) avg_start_probability,
             round(sum(v.expected_goals), 2) expected_goals, round(sum(v.expected_assists), 2) expected_assists,
             round(avg(v.clean_sheet_probability), 2) avg_clean_sheet_probability, round(sum(v.expected_bonus), 2) expected_bonus
        from fpl_projection_frontend_feed_v6 v
        join fixtures f on f.fixture_id = v.fixture_id
        join fpl_players p on p.fpl_player_id = v.fpl_player_id and p.season_id = cur
        left join teams tm on tm.team_id = p.canonical_team_id
       where f.league_id = 1 and f.season_id = cur and f.matchweek between gw and gw + n_gw - 1
         and (pid is null or v.fpl_player_id = pid)
         and (tid is null or p.canonical_team_id = tid)
         and (pos is null or p.element_type = pos)
         and (maxp is null or p.now_cost <= maxp * 10)
       group by p.web_name, tm.display_name, p.element_type, p.now_cost
       order by sum(v.expected_fpl_points) desc
       limit lim) r), '[]'::jsonb));
end $function$
;
