-- Live definition exported from the database (function refresh_team_match_snapshot(p_league_id bigint, p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_team_match_snapshot(p_league_id bigint, p_season_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_goals_first boolean;
  v_rows integer;
begin
  select (p_league_id in (2, 3, 4) and s.start_year <= 1998) into v_goals_first
  from public.seasons s where s.season_id = p_season_id;

  delete from public.team_match_snapshot where league_id = p_league_id and season_id = p_season_id;

  with tm as (
    select m.match_id, m.match_date, m.home_team_id as team_id, m.away_team_id as opp, 'H'::text as venue,
           m.full_time_home_goals as gf, m.full_time_away_goals as ga
    from public.matches m
    where m.league_id = p_league_id and m.season_id = p_season_id
      and m.full_time_home_goals is not null and m.full_time_away_goals is not null
    union all
    select m.match_id, m.match_date, m.away_team_id, m.home_team_id, 'A',
           m.full_time_away_goals, m.full_time_home_goals
    from public.matches m
    where m.league_id = p_league_id and m.season_id = p_season_id
      and m.full_time_home_goals is not null and m.full_time_away_goals is not null
  ),
  c as (
    select tm.*,
      row_number() over w as n,
      count(*) over (partition by tm.team_id) as total_n,
      sum((tm.gf > tm.ga)::int) over w as won,
      sum((tm.gf = tm.ga)::int) over w as drawn,
      sum((tm.gf < tm.ga)::int) over w as lost,
      sum(tm.gf) over w as cgf,
      sum(tm.ga) over w as cga,
      sum(case when tm.gf > tm.ga then 3 when tm.gf = tm.ga then 1 else 0 end) over w as pts_won
    from tm
    window w as (partition by tm.team_id order by tm.match_date, tm.match_id rows unbounded preceding)
  ),
  c2 as (
    select c.*,
      coalesce((select sum(d.points) from public.point_deductions d
                where d.league_id = p_league_id and d.season_id = p_season_id and d.team_id = c.team_id
                  and (d.effective_date <= c.match_date or c.n = c.total_n)), 0)::int as ded
    from c
  ),
  c3 as (
    select c2.*, (c2.pts_won + c2.ded) as pts, (c2.cgf - c2.cga) as gd
    from c2
  ),
  teams_all as (select distinct team_id from c3),
  dates as (select distinct match_date from c3),
  j as (
    select d.match_date as asof, t.team_id, x.pts, x.gd, x.cgf,
      count(x.pts) over (partition by t.team_id order by d.match_date) as grp
    from dates d cross join teams_all t
    left join c3 x on x.team_id = t.team_id and x.match_date = d.match_date
  ),
  st as (
    select asof, team_id,
      coalesce(max(pts) over (partition by team_id, grp), 0) as pts,
      coalesce(max(gd) over (partition by team_id, grp), 0) as gd,
      coalesce(max(cgf) over (partition by team_id, grp), 0) as cgf
    from j
  ),
  pos_date as (
    select asof, team_id,
      rank() over (partition by asof order by pts desc,
        case when v_goals_first then cgf else gd end desc,
        case when v_goals_first then gd else cgf end desc) as pos,
      count(*) over (partition by asof) as teams
    from st
  ),
  pos_played as (
    select team_id, n,
      rank() over (partition by n order by pts desc,
        case when v_goals_first then cgf else gd end desc,
        case when v_goals_first then gd else cgf end desc) as pos,
      count(*) over (partition by n) as teams
    from c3
  )
  insert into public.team_match_snapshot (
    league_id, season_id, team_id, matches_played, match_id, match_date, venue, opponent_team_id,
    goals_for, goals_against, result, won, drawn, lost, cum_goals_for, cum_goals_against, goal_difference,
    points_won, deduction, points, position_on_date, teams_in_league, position_at_played, teams_at_played)
  select p_league_id, p_season_id, c3.team_id, c3.n, c3.match_id, c3.match_date, c3.venue, c3.opp,
    c3.gf, c3.ga, case when c3.gf > c3.ga then 'W' when c3.gf = c3.ga then 'D' else 'L' end,
    c3.won, c3.drawn, c3.lost, c3.cgf, c3.cga, c3.gd,
    c3.pts_won, c3.ded, c3.pts, pd.pos, pd.teams, pp.pos, pp.teams
  from c3
  join pos_date pd on pd.asof = c3.match_date and pd.team_id = c3.team_id
  join pos_played pp on pp.team_id = c3.team_id and pp.n = c3.n;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$
;
