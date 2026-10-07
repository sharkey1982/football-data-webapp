-- Captaincy analysis base tables (read-only: temp tables in one session).
-- Seasons 2022/23-2025/26 (season_id 9-12). 2021/22 has no team names in
-- fpl_player_season_totals, so its rows can't be linked to market prices.
--
-- 1. FPL fixture -> home/away FPL team numbers (from the players' own rows).
create temp table fx as
select season_id, fixture_id, min(gameweek) gw,
  mode() within group (order by opponent_team_num) filter (where was_home) away_num,
  mode() within group (order by opponent_team_num) filter (where not was_home) home_num
from fpl_player_gameweek_history where season_id between 9 and 12 group by 1,2;

-- 2. FPL team number -> club (majority vote of the players' season team).
create temp table nm as
with row_team as (
  select h.season_id, h.fpl_code, case when h.was_home then fx.home_num else fx.away_num end team_num
  from fpl_player_gameweek_history h join fx using (season_id, fixture_id)),
vote as (
  select r.season_id, r.team_num, t.team_name,
    row_number() over (partition by r.season_id, r.team_num order by count(*) desc) rk
  from row_team r join fpl_player_season_totals t on t.season_id=r.season_id and t.fpl_code=r.fpl_code
  group by 1,2,3)
select season_id, team_num, replace(team_name, 'Sheffield Utd', 'Sheffield United') team_name from vote where rk=1;

create temp table pl_teams as
select distinct season_id, home_team_id team_id from matches where league_id=1 and season_id between 9 and 12;

create temp table tmap as
select nm.*, (select pt.team_id from pl_teams pt join teams t on t.team_id=pt.team_id
   where pt.season_id=nm.season_id and (t.canonical_name=nm.team_name or t.display_name=nm.team_name
     or exists (select 1 from team_aliases a where a.team_id=t.team_id and a.raw_name=nm.team_name)) limit 1) team_id
from nm;

-- 3. Market-implied team goals per match: the (home, away) Poisson pair that
--    best reproduces the closing 1X2 and over/under 2.5 (Avg, de-vigged).
create temp table pois as
select l.lam, k, exp(-l.lam)*power(l.lam,k)/factorial(k)::float8 p
from (select round(g::numeric,2)::float8 lam from generate_series(0.20,4.00,0.05) g) l, generate_series(0,10) k;
create temp table grid as
select a.lam lh, b.lam la,
  sum(a.p*b.p) filter (where a.k>b.k) ph, sum(a.p*b.p) filter (where a.k<b.k) pa,
  sum(a.p*b.p) filter (where a.k+b.k>=3) pover
from pois a join pois b on true group by 1,2;
create temp table mlam as
select m.match_id, m.season_id, m.home_team_id, m.away_team_id, g.lh, g.la
from market_closing_lines m cross join lateral (
  select lh, la from grid order by (ph-m.p_home)^2+(pa-m.p_away)^2+(pover-m.p_over)^2 limit 1) g
where m.league_id=1 and m.season_id between 9 and 12;

-- 4. Every player-fixture row with its team, its team's implied goals and
--    a start flag (2022/23 has no 'starts' before FPL added it: 45+ minutes).
create temp table fxm as
select fx.*, th.team_id home_id, ta.team_id away_id, ml.lh, ml.la
from fx join tmap th on th.season_id=fx.season_id and th.team_num=fx.home_num
        join tmap ta on ta.season_id=fx.season_id and ta.team_num=fx.away_num
        left join mlam ml on ml.season_id=fx.season_id and ml.home_team_id=th.team_id and ml.away_team_id=ta.team_id;

create temp table gw_has_starts as
select season_id, gameweek, sum(starts)>0 ok from fpl_player_gameweek_history where season_id between 9 and 12 group by 1,2;

create temp table pr as
select h.season_id, h.gameweek gw, h.fixture_id, h.fpl_code, h.was_home,
  case when h.was_home then f.home_id else f.away_id end team_id,
  case when h.was_home then f.lh else f.la end lam,
  h.minutes, h.total_points pts, h.goals_scored, h.assists, h.bonus, h.selected,
  case when g.ok then h.starts=1 else h.minutes>=45 end started,
  h.season_id*100+h.gameweek seq
from fpl_player_gameweek_history h
join fxm f using (season_id, fixture_id)
join gw_has_starts g on g.season_id=h.season_id and g.gameweek=h.gameweek;
