-- Final (or current) league position for every team, every season, all five
-- divisions, plus a pyramid position across them (1 = top of the Premier League,
-- the Championship continues from 21, and so on -- counted from the actual
-- number of teams in each division that season).
--
-- Ranking: points after recorded deductions (point_deductions), then goal
-- difference, then goals scored. Seasons that were CURTAILED (fewer matches
-- than a full double round robin, and not the current season) rank on points
-- per game, as the leagues did: League One, League Two and the National League
-- 2019/20, and the National League 2020/21. Beyond goals scored, real tables use
-- head-to-head; exact ties that deep are broken alphabetically here.
--
-- Verified 2026-09-23: every Premier League champion and points total
-- 2014/15-2025/26; Everton 15th on 40 after -8 in 2023/24; and against
-- promotion/relegation -- 1,389 team-seasons, 328 moves, the only four
-- exceptions being real history (AFC Wimbledon and Stevenage reprieved in
-- 2019/20, Macclesfield wound up, Bury expelled).
-- KNOWN GAP: no National League deductions are recorded in point_deductions.
create or replace view public.league_standings as
with cur as (
  select max(season_id) as season_id from public.matches where league_id between 1 and 5
),
res as (
  select league_id, season_id, home_team_id as team_id, 'home'::text as venue,
         full_time_home_goals as gf, full_time_away_goals as ga
  from public.matches where league_id between 1 and 5 and full_time_home_goals is not null
  union all
  select league_id, season_id, away_team_id, 'away',
         full_time_away_goals, full_time_home_goals
  from public.matches where league_id between 1 and 5 and full_time_home_goals is not null
),
agg as (
  select league_id, season_id, team_id,
    count(*)::int as played,
    count(*) filter (where gf > ga)::int as won,
    count(*) filter (where gf = ga)::int as drawn,
    count(*) filter (where gf < ga)::int as lost,
    sum(gf)::int as goals_for,
    sum(ga)::int as goals_against,
    count(*) filter (where ga = 0)::int as clean_sheets,
    count(*) filter (where gf = 0)::int as failed_to_score,
    (3 * count(*) filter (where gf > ga) + count(*) filter (where gf = ga))::int as points_won,
    count(*) filter (where venue = 'home')::int as home_played,
    (3 * count(*) filter (where venue = 'home' and gf > ga) + count(*) filter (where venue = 'home' and gf = ga))::int as home_points,
    coalesce(sum(gf) filter (where venue = 'home'), 0)::int as home_goals_for,
    coalesce(sum(ga) filter (where venue = 'home'), 0)::int as home_goals_against,
    count(*) filter (where venue = 'away')::int as away_played,
    (3 * count(*) filter (where venue = 'away' and gf > ga) + count(*) filter (where venue = 'away' and gf = ga))::int as away_points,
    coalesce(sum(gf) filter (where venue = 'away'), 0)::int as away_goals_for,
    coalesce(sum(ga) filter (where venue = 'away'), 0)::int as away_goals_against,
    count(*) filter (where venue = 'home' and gf > ga)::int as home_won,
    count(*) filter (where venue = 'home' and gf = ga)::int as home_drawn,
    count(*) filter (where venue = 'home' and gf < ga)::int as home_lost,
    count(*) filter (where venue = 'home' and ga = 0)::int as home_clean_sheets,
    count(*) filter (where venue = 'away' and gf > ga)::int as away_won,
    count(*) filter (where venue = 'away' and gf = ga)::int as away_drawn,
    count(*) filter (where venue = 'away' and gf < ga)::int as away_lost,
    count(*) filter (where venue = 'away' and ga = 0)::int as away_clean_sheets
  from res group by 1, 2, 3
),
shape as (
  select a.league_id, a.season_id, count(*)::int as teams, sum(a.played)::int / 2 as matches,
         (a.season_id = (select season_id from cur)) as is_current
  from agg a group by 1, 2
),
ded as (
  select league_id, season_id, team_id, sum(points)::int as pts
  from public.point_deductions group by 1, 2, 3
),
scored as (
  select a.*, s.teams, s.is_current,
    coalesce(d.pts, 0) as deduction,
    a.points_won + coalesce(d.pts, 0) as points,
    (not s.is_current and s.matches < s.teams * (s.teams - 1)) as curtailed
  from agg a
  join shape s using (league_id, season_id)
  left join ded d using (league_id, season_id, team_id)
),
ranked as (
  select sc.*,
    row_number() over (
      partition by sc.league_id, sc.season_id
      order by case when sc.curtailed then sc.points::numeric / nullif(sc.played, 0) else sc.points end desc,
               sc.goals_for - sc.goals_against desc, sc.goals_for desc, t.canonical_name
    )::int as position
  from scored sc join public.teams t using (team_id)
)
select r.league_id, l.code as league_code, l.name as league_name, r.league_id::int as tier,
  r.season_id, se.label as season_label, r.team_id,
  r.position,
  r.position + coalesce((select sum(s2.teams) from shape s2
     where s2.season_id = r.season_id and s2.league_id < r.league_id), 0)::int as pyramid_position,
  r.teams, not r.is_current as is_final, r.curtailed,
  case when r.curtailed then 'points per game' else 'points' end as ranked_on,
  r.played, r.won, r.drawn, r.lost, r.goals_for, r.goals_against,
  r.clean_sheets, r.failed_to_score, r.points_won, r.deduction, r.points,
  round(r.points::numeric / nullif(r.played, 0), 2) as ppg,
  r.home_played, r.home_points, r.home_goals_for, r.home_goals_against,
  r.away_played, r.away_points, r.away_goals_for, r.away_goals_against,
  r.home_won, r.home_drawn, r.home_lost, r.home_clean_sheets,
  r.away_won, r.away_drawn, r.away_lost, r.away_clean_sheets
from ranked r
join public.leagues l using (league_id)
join public.seasons se using (season_id);

grant select on public.league_standings to anon, authenticated;

-- One team's league record by calendar month, home and away, across every
-- season in the archive (all five divisions). Months in season order, July first.
create or replace function public.get_team_month_profile(p_team_id bigint)
returns table(month_num integer, month_label text, venue text, played integer, points integer,
  goals_for integer, goals_against integer, ppg numeric)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  with res as (
    select extract(month from m.match_date)::int as mo, 'home'::text as v,
           m.full_time_home_goals as gf, m.full_time_away_goals as ga
    from public.matches m
    where m.home_team_id = p_team_id and m.league_id between 1 and 5 and m.full_time_home_goals is not null
    union all
    select extract(month from m.match_date)::int, 'away',
           m.full_time_away_goals, m.full_time_home_goals
    from public.matches m
    where m.away_team_id = p_team_id and m.league_id between 1 and 5 and m.full_time_home_goals is not null
  )
  select mo, to_char(make_date(2000, mo, 1), 'Mon'), v, count(*)::int,
    (3 * count(*) filter (where gf > ga) + count(*) filter (where gf = ga))::int,
    sum(gf)::int, sum(ga)::int,
    round((3 * count(*) filter (where gf > ga) + count(*) filter (where gf = ga))::numeric / count(*), 2)
  from res group by mo, v
  order by (mo + 5) % 12, v;
$$;
grant execute on function public.get_team_month_profile(bigint) to anon, authenticated;
