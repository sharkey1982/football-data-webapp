-- Live definition exported from the database (function get_team_of_the_week(p_event_id integer, p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_team_of_the_week(p_event_id integer DEFAULT NULL::integer, p_season_id bigint DEFAULT 13)
 RETURNS TABLE(fpl_event_id integer, fpl_player_id bigint, web_name text, slug text, team_name text, position_label text, points integer, minutes integer, is_mandatory boolean, goals integer, assists integer, clean_sheets integer, bonus integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_event integer;
  v_historic boolean;
  excluded_ids bigint[] := '{}';
  offender bigint;
  guard int := 0;
begin
  select exists (select 1 from public.fpl_player_gameweek_history h where h.season_id = p_season_id)
    into v_historic;

  if v_historic then
    select coalesce(p_event_id, (
      select max(h.gameweek) from public.fpl_player_gameweek_history h where h.season_id = p_season_id
    )) into v_event;
  else
    select coalesce(p_event_id, (
      select max(f.fpl_event_id) from public.fpl_fixtures f
      where f.season_id = p_season_id
      group by f.fpl_event_id having bool_and(f.finished)
      order by max(f.fpl_event_id) desc limit 1
    )) into v_event;
  end if;

  if v_event is null then return; end if;

  loop
    guard := guard + 1;
    select k.pid into offender
    from (
      with src as (
        select h.fpl_code as pid, sum(h.total_points)::int pts, sum(h.minutes)::int mins,
               t.team_name tname, t.element_type
        from public.fpl_player_gameweek_history h
        join public.fpl_player_season_totals t on t.season_id = h.season_id and t.fpl_code = h.fpl_code
        where v_historic and h.season_id = p_season_id and h.gameweek = v_event
        group by h.fpl_code, t.team_name, t.element_type
        union all
        select g.fpl_player_id::bigint, g.total_points, g.minutes, tm.display_name, p.element_type
        from public.fpl_player_gameweeks g
        join public.fpl_players p on p.fpl_player_id = g.fpl_player_id
        left join public.teams tm on tm.team_id = p.canonical_team_id
        where not v_historic and g.season_id = p_season_id and g.fpl_event_id = v_event
          and g.total_points is not null
      ),
      ranked as (
        select *, row_number() over (partition by element_type order by pts desc, mins desc) rn
        from src where not (pid = any(excluded_ids))
      ),
      picked as (
        select * from ranked
        where (element_type=1 and rn<=1) or (element_type=2 and rn<=3)
           or (element_type=3 and rn<=3) or (element_type=4 and rn<=1)
        union all
        select * from (
          select * from ranked
          where (element_type=2 and rn between 4 and 5) or (element_type=3 and rn between 4 and 5)
             or (element_type=4 and rn between 2 and 3)
          order by pts desc, mins desc limit 3
        ) f
      )
      select pk.pid, pk.pts, pk.mins, count(*) over (partition by pk.tname) per_club from picked pk
    ) k
    where k.per_club > 3
    order by k.pts asc, k.mins asc limit 1;

    exit when offender is null or guard > 8;
    excluded_ids := excluded_ids || offender;
    offender := null;
  end loop;

  return query
  with src as (
    select h.fpl_code pid, sum(h.total_points)::int pts, sum(h.minutes)::int mins,
           sum(h.goals_scored)::int gls, sum(h.assists)::int ast,
           sum(h.clean_sheets)::int cs, sum(h.bonus)::int bns,
           t.web_name wn, null::text sl, t.team_name tname, t.element_type
    from public.fpl_player_gameweek_history h
    join public.fpl_player_season_totals t on t.season_id = h.season_id and t.fpl_code = h.fpl_code
    where v_historic and h.season_id = p_season_id and h.gameweek = v_event
    group by h.fpl_code, t.web_name, t.team_name, t.element_type
    union all
    select g.fpl_player_id::bigint, g.total_points, g.minutes,
           coalesce(g.goals_scored,0), coalesce(g.assists,0),
           coalesce(g.clean_sheets,0), coalesce(g.bonus,0),
           p.web_name, p.slug, tm.display_name, p.element_type
    from public.fpl_player_gameweeks g
    join public.fpl_players p on p.fpl_player_id = g.fpl_player_id
    left join public.teams tm on tm.team_id = p.canonical_team_id
    where not v_historic and g.season_id = p_season_id and g.fpl_event_id = v_event
      and g.total_points is not null
  ),
  ranked as (
    select *, row_number() over (partition by element_type order by pts desc, mins desc) rn
    from src where not (pid = any(excluded_ids))
  ),
  picked as (
    select *, true mand from ranked
    where (element_type=1 and rn<=1) or (element_type=2 and rn<=3)
       or (element_type=3 and rn<=3) or (element_type=4 and rn<=1)
    union all
    select * from (
      select *, false from ranked
      where (element_type=2 and rn between 4 and 5) or (element_type=3 and rn between 4 and 5)
         or (element_type=4 and rn between 2 and 3)
      order by pts desc, mins desc limit 3
    ) f
  )
  select v_event, k.pid, k.wn, k.sl, k.tname,
         case k.element_type when 1 then 'GKP' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end,
         k.pts, k.mins, k.mand, k.gls, k.ast, k.cs, k.bns
  from picked k order by k.element_type, k.pts desc;
end $function$
;
