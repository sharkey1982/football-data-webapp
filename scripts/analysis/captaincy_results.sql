-- Run after captaincy_base.sql and captaincy_candidates.sql (same session).
-- Haaland = fpl_code 223094.
create temp table gw1 as
select season_id, gw,
  max(xpts) filter (where x_rank=1) x1, max(xpts) filter (where x_rank=2) x2,
  max(actual) filter (where x_rank=1) a1, max(actual) filter (where x_rank=2) a2,
  max(actual) filter (where o_rank=1) ao, max(fpl_code) filter (where x_rank=1) c1,
  max(fpl_code) filter (where o_rank=1) co, max(best_actual) best,
  max(actual) filter (where fpl_code=223094) a_h, max(xpts) filter (where fpl_code=223094) x_h,
  max(x_rank) filter (where fpl_code=223094) h_rank,
  max(actual) filter (where x_rank=1 and fpl_code<>223094) a1_nh,
  (array_agg(actual order by xpts desc) filter (where fpl_code<>223094))[1] a_alt
from ranked group by 1,2;

create temp table hr as
select pr.*, t.canonical_name opp, f.gw fgw
from pr join fxm f using (season_id, fixture_id)
join teams t on t.team_id = case when pr.was_home then f.away_id else f.home_id end
where fpl_code = 223094 and minutes > 0;

select json_build_object(
 'gap_bins', (select json_agg(row_to_json(b) order by bin) from (
    select case when x1-x2<0.5 then '1 <0.5' when x1-x2<1 then '2 0.5-1' when x1-x2<2 then '3 1-2' else '4 2+' end bin,
      count(*) n, round(avg(x1-x2)::numeric,2) exp_gap, round(avg(a1-a2),2) real_gap,
      round(avg((a1>a2)::int),3) p_win, round(avg((a1<a2)::int),3) p_lose
    from gw1 group by 1) b),
 'rank1', (select row_to_json(r) from (select count(*) n, round(avg((a1=best)::int),3) p_best,
      round(avg((a1<=2)::int),3) p_blank, round(avg((a1>=10)::int),3) p_haul,
      round(avg((c1=co)::int),3) p_same_as_most_owned,
      round(avg(a1-ao) filter (where c1<>co),2) gain_when_differs,
      count(*) filter (where c1<>co) n_differs from gw1) r),
 'by_season', (select json_agg(row_to_json(s) order by season_id) from (
    select season_id, count(*) gws, sum(a1) r1, sum(a2) r2, sum(ao) most_owned, sum(best) hindsight,
      sum(a_h) filter (where a_h is not null) haal_pts, count(a_h) haal_gws,
      sum(coalesce(a_h, a1)) always_haaland, sum(a1) filter (where a_h is not null) r1_same_gws,
      count(*) filter (where h_rank=1) haal_top
    from gw1 group by 1) s),
 'haaland_rank', (select json_agg(row_to_json(s) order by h_rank) from (
    select least(h_rank,4) h_rank, count(*) n, round(avg(a_h),2) haal, round(avg(a_alt),2) best_other_by_xpts,
      round(avg(x_h)::numeric,2) x_haal from gw1 where a_h is not null group by 1) s),
 'haaland_venue', (select json_agg(row_to_json(s)) from (
    select was_home, count(*) n, round(avg(pts),2) pts, round(avg(goals_scored),2) goals,
      round(avg((pts<=2)::int),3) p_blank, round(avg((pts>=10)::int),3) p_haul, round(avg(lam)::numeric,2) lam
    from hr where started group by 1) s),
 'haaland_lam', (select json_agg(row_to_json(s) order by band) from (
    select case when lam<1.5 then '1 <1.5' when lam<2 then '2 1.5-2' when lam<2.5 then '3 2-2.5' else '4 2.5+' end band,
      count(*) n, round(avg(pts),2) pts, round(avg(goals_scored),2) goals,
      round(avg((pts<=2)::int),3) p_blank, round(avg((pts>=10)::int),3) p_haul
    from hr where started group by 1) s),
 'haaland_concentration', (select json_agg(row_to_json(s) order by season_id) from (
    select season_id, count(*) apps, sum(pts) pts,
      (select sum(p) from (select pts p from hr h2 where h2.season_id=hr.season_id order by pts desc limit 5) t) top5,
      sum(pts) filter (where goals_scored>=2) multi_goal_pts, count(*) filter (where goals_scored>=2) multi_goal_games,
      count(*) filter (where pts<=2) blanks, count(*) filter (where pts>=10) hauls
    from hr group by season_id) s),
 'haaland_dist', (select json_agg(row_to_json(s) order by pts) from (
    select pts, count(*) n from hr where started group by 1) s),
 'haaland_big6_away', (select json_agg(row_to_json(s) order by seq) from (
    select season_id, gw, opp, pts, goals_scored, assists, minutes, round(lam::numeric,2) lam, seq
    from hr where not was_home and opp in ('Arsenal','Liverpool','Chelsea','Tottenham','Man United','Newcastle','Manchester United','Tottenham Hotspur','Newcastle United')) s)
) out;
