-- Run after captaincy_base.sql in the same session.
-- Point-in-time captain candidates for every gameweek 3-38, 2022/23-2025/26.
--
-- Candidate: the 20 most-owned players (ownership at their last match) who
-- started their last match, played in one of the previous two gameweeks,
-- have 4+ starts in their record, and whose team plays this gameweek.
--
-- Expected points (a simple pre-deadline estimate, not the site's model):
--   base   = FPL points per start over the last 10 starts (any season);
--   lam    = the team's market-implied goals for each fixture this gameweek;
--   lambar = the team's average implied goals over those 10 starts;
--   xpts   = sum over fixtures of 2 + (base - 2) * lam / lambar.
-- Actual = FPL points that gameweek (0 if he didn't play).
create temp table gws as select distinct season_id, gw from fx where gw >= 3;

create temp table last_row as
select g.season_id, g.gw, p.fpl_code, p.team_id, p.started, p.selected, p.seq
from gws g cross join lateral (
  select distinct on (fpl_code) fpl_code, team_id, started, selected, seq
  from pr where pr.season_id=g.season_id and pr.gw between g.gw-2 and g.gw-1
  order by fpl_code, seq desc, started desc) p;

create temp table cand as
select * from (
  select l.*, row_number() over (partition by l.season_id, l.gw order by l.selected desc) own_rank
  from last_row l where l.started) x
where own_rank <= 20;

create temp table cand_x as
select c.*, b.base, b.lambar, b.n_starts,
  (select sum(2 + (b.base-2) * (case when f.home_id=c.team_id then f.lh else f.la end) / b.lambar)
     from fxm f where f.season_id=c.season_id and f.gw=c.gw and c.team_id in (f.home_id, f.away_id)) xpts,
  (select count(*) from fxm f where f.season_id=c.season_id and f.gw=c.gw and c.team_id in (f.home_id, f.away_id)) n_fix,
  coalesce((select sum(pts) from pr where pr.season_id=c.season_id and pr.gw=c.gw and pr.fpl_code=c.fpl_code), 0) actual
from cand c cross join lateral (
  select avg(pts)::float8 base, avg(lam) lambar, count(*) n_starts from (
    select pts, lam from pr where pr.fpl_code=c.fpl_code and pr.started and pr.seq < c.season_id*100+c.gw
    order by seq desc limit 10) s) b;

create temp table ranked as
select *, row_number() over (partition by season_id, gw order by xpts desc, selected desc) x_rank,
  row_number() over (partition by season_id, gw order by selected desc) o_rank,
  max(actual) over (partition by season_id, gw) best_actual
from cand_x where n_fix > 0 and n_starts >= 4 and lambar > 0;
