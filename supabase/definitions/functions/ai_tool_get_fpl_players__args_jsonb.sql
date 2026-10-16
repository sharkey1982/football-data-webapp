-- Live definition exported from the database (function ai_tool_get_fpl_players(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_get_fpl_players(args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  cur bigint := public.fpl_current_season_id();
  sid bigint; pl jsonb; t jsonb; tid bigint; pid int;
  pos int := case upper(args->>'position') when 'GK' then 1 when 'DEF' then 2 when 'MID' then 3 when 'FWD' then 4 end;
  sort text := coalesce(args->>'sort_by', 'total_points');
  lim int := least(coalesce((args->>'limit')::int, 10), 30);
  avail text := coalesce(args->>'availability', 'any');
begin
  sid := case when args->>'season' in ('last', 'last season', 'previous') then public.previous_season_id(cur)
              when args ? 'season' and args->>'season' not in ('current', 'this season', '') then
                (select season_id from seasons where label = regexp_replace(args->>'season', '[^0-9]', '', 'g')
                   or label = right(split_part(args->>'season', '/', 1), 2) || right(split_part(args->>'season', '/', 2), 2) limit 1)
              else cur end;
  if sid is null then return jsonb_build_object('error', 'Unknown season.'); end if;
  if sort not in ('total_points', 'price', 'minutes', 'goals', 'assists', 'expected_goals', 'goals_minus_xg',
                  'defensive_contribution_points', 'selected_by_percent') then
    return jsonb_build_object('error', 'Unknown sort_by.'); end if;

  if sid <> cur then
    -- Past season: final totals.
    return jsonb_build_object('tool', 'get_fpl_players', 'source', jsonb_build_array('fpl_player_season_totals'),
      'as_of', now(), 'kind', 'observed', 'season', public.ai_season_label(sid),
      'note', 'Final FPL season totals. Prices in £m.',
      'rows', coalesce((select jsonb_agg(r) from (
        select web_name player, full_name, team_name team, public.ai_fpl_position(element_type) position,
               round(start_cost / 10.0, 1) start_price, round(end_cost / 10.0, 1) end_price, total_points, minutes,
               goals_scored goals, assists, clean_sheets, bonus, selected_by_percent
          from fpl_player_season_totals
         where season_id = sid
           and (pos is null or element_type = pos)
           and (not args ? 'player' or public.ai_norm(web_name) like '%' || trim(public.ai_norm(args->>'player')) || '%'
                or public.ai_norm(full_name) like '%' || trim(public.ai_norm(args->>'player')) || '%')
           and (not args ? 'team' or public.ai_norm(team_name) like '%' || trim(public.ai_norm(args->>'team')) || '%')
         order by case sort when 'price' then end_cost when 'minutes' then minutes when 'goals' then goals_scored
                            when 'assists' then assists else total_points end desc nulls last
         limit lim) r), '[]'::jsonb));
  end if;

  if args ? 'player' then
    pl := public.ai_resolve_fpl_player(args->>'player', cur); if pl ? 'error' then return pl; end if;
    pid := (pl->>'fpl_player_id')::int;
  end if;
  if args ? 'team' then t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if; tid := (t->>'team_id')::bigint; end if;

  return jsonb_build_object('tool', 'get_fpl_players',
    'source', jsonb_build_array('fpl_players', 'fpl_player_gameweeks'), 'as_of', now(), 'kind', 'observed',
    'season', public.ai_season_label(cur),
    'note', 'Official FPL data this season. Price in £m. availability filter: injured_doubtful_or_suspended = status d/i/s; not_available = anything but a (also includes loans and departures). status: a = available, d = doubtful, i = injured, s = suspended, u = unavailable, n = not in squad. chance_of_playing is FPL''s own %. defensive_contribution_points = FPL points from the defensive contribution rule this season.',
    'rows', coalesce((select jsonb_agg(r) from (
      with dc as (
        select g.fpl_player_id, sum((s->>'points')::int) pts
          from fpl_player_gameweeks g
          cross join lateral jsonb_array_elements(g.source_payload->'explain') e
          cross join lateral jsonb_array_elements(e->'stats') s
         where g.season_id = cur and s->>'identifier' = 'defensive_contribution'
         group by g.fpl_player_id)
      select p.web_name player, p.first_name || ' ' || p.second_name full_name, tm.display_name team,
             public.ai_fpl_position(p.element_type) position, round(p.now_cost / 10.0, 1) price,
             p.total_points, p.event_points last_gameweek_points, p.minutes, p.goals_scored goals, p.assists,
             p.clean_sheets, p.bonus, round(p.expected_goals, 2) expected_goals, round(p.expected_assists, 2) expected_assists,
             round(p.goals_scored - p.expected_goals, 2) goals_minus_xg, coalesce(dc.pts, 0) defensive_contribution_points,
             p.selected_by_percent, p.status, p.chance_of_playing_next_round, nullif(p.news, '') news
        from fpl_players p
        left join teams tm on tm.team_id = p.canonical_team_id
        left join dc on dc.fpl_player_id = p.fpl_player_id
       where p.season_id = cur
         and (pid is null or p.fpl_player_id = pid)
         and (tid is null or p.canonical_team_id = tid)
         and (pos is null or p.element_type = pos)
         and (avail = 'any' or (avail = 'injured_doubtful_or_suspended' and p.status in ('d', 'i', 's'))
              or (avail = 'not_available' and p.status <> 'a'))
       order by case sort when 'price' then p.now_cost::numeric when 'minutes' then p.minutes when 'goals' then p.goals_scored
                          when 'assists' then p.assists when 'expected_goals' then p.expected_goals
                          when 'goals_minus_xg' then p.goals_scored - p.expected_goals
                          when 'defensive_contribution_points' then coalesce(dc.pts, 0)
                          when 'selected_by_percent' then p.selected_by_percent
                          else p.total_points end desc nulls last, p.total_points desc
       limit lim) r), '[]'::jsonb));
end $function$
;
