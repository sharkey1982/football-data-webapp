-- Captain reliability against volatility (read-only).
-- Figures in src/lib/fplArticles.ts (CAPTAIN_RELIABILITY) and the reflection's
-- STREAK_HISTORY in scripts/fpl_gameweek_report.py. Seasons 2022/23-2025/26
-- (season_id 9-12). A blank is 2 points or fewer; a haul 10 or more. Double
-- gameweeks count as one gameweek (points summed).

-- 1. Do blanks run in streaks? £9m+ players who played 60+ minutes, by what
--    they scored in the previous gameweek (also 60+ minutes).
with g as (
  select season_id, fpl_code, gameweek gw, sum(total_points) pts, sum(minutes) mins, max(value) val
  from fpl_player_gameweek_history where season_id between 9 and 12 group by 1,2,3),
q as (select *, lag(pts) over w p1, lag(pts,2) over w p2, lag(mins) over w m1, lag(mins,2) over w m2,
             lag(gw) over w g1, lag(gw,2) over w g2
      from g window w as (partition by season_id, fpl_code order by gw))
select count(*) n,
  avg((pts<=2)::int) blank_rate,
  avg((pts<=2)::int) filter (where g1=gw-1 and m1>=60 and p1<=2) after_one_blank,
  count(*)           filter (where g1=gw-1 and m1>=60 and p1<=2) n_after_one,
  avg((pts<=2)::int) filter (where g1=gw-1 and g2=gw-2 and m1>=60 and m2>=60 and p1<=2 and p2<=2) after_two_blanks,
  count(*)           filter (where g1=gw-1 and g2=gw-2 and m1>=60 and m2>=60 and p1<=2 and p2<=2) n_after_two,
  avg((pts<=2)::int) filter (where g1=gw-1 and m1>=60 and p1>2) after_a_return
from q where val>=90 and mins>=60;

-- 2. Player-seasons: the 5 most-selected £7.5m+ players each season with 15+
--    appearances. Blank and haul rates per appearance, median, and the share of
--    the season's points from the best two gameweeks.
with g as (
  select season_id, fpl_code, gameweek gw, sum(total_points) pts, sum(minutes) mins, max(value) val, max(selected) sel
  from fpl_player_gameweek_history where season_id between 9 and 12 group by 1,2,3),
ps as (select season_id, fpl_code, avg(sel) sel, max(val) val,
         count(*) filter (where mins>0) wk,
         avg((pts<=2)::int) filter (where mins>0) blank, avg((pts>=10)::int) filter (where mins>0) haul,
         percentile_disc(0.5) within group (order by pts) filter (where mins>0) med,
         sum(pts) total, array_agg(pts order by pts desc) srt
       from g group by 1,2),
r as (select *, row_number() over (partition by season_id order by sel desc) rk from ps where val>=75 and wk>=15)
select r.season_id, t.web_name, wk, total, med, round(blank,2) blank, round(haul,2) haul,
       round((srt[1]+srt[2])::numeric/nullif(total,0),2) top2_share
from r left join lateral (select web_name from fpl_player_season_totals t
                          where t.season_id=r.season_id and t.fpl_code=r.fpl_code limit 1) t on true
where rk<=5 order by blank;

-- 3. This season so far (2026/27, season_id 13).
select p.web_name, array_agg(gw.pts order by gw.e) pts, sum(gw.pts) total
from (select season_id, fpl_player_id, fpl_event_id e, sum(total_points) pts
        from fpl_player_gameweeks where season_id=13 group by 1,2,3) gw
join fpl_players p using (season_id, fpl_player_id)
where p.web_name in ('Haaland','B.Fernandes','Saka','Isak','João Pedro','Semenyo')
group by 1;
