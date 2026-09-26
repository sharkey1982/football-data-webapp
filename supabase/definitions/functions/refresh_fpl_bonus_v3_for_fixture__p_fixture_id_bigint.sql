-- Live definition exported from the database (function refresh_fpl_bonus_v3_for_fixture(p_fixture_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_fpl_bonus_v3_for_fixture(p_fixture_id bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_count integer;
begin
with hist as (
 select p.fpl_player_id,p.element_type,coalesce(sum(g.minutes),0)::numeric mins,coalesce(sum(g.bps),0)::numeric bps
 from fpl_players p left join fpl_player_gameweeks g on g.season_id = (SELECT public.fpl_current_season_id()) and g.fpl_player_id=p.fpl_player_id where p.season_id = (SELECT public.fpl_current_season_id()) group by p.fpl_player_id,p.element_type
), base as (
 select a.fixture_id,a.team_id,a.fpl_player_id,a.element_type,a.expected_minutes,a.expected_goals,a.expected_assists,
 exp(-case when a.team_id=f.home_team_id then f.predicted_away_goals else f.predicted_home_goals end)::numeric cs,
 coalesce(d.defensive_contribution_probability,0::numeric) dc,h.mins,h.bps,
 case a.element_type when 1 then 15.88 when 2 then 19.27 when 3 then 27.39 when 4 then 33.24 else 20 end::numeric prior
 from fpl_projection_leaguewide_allocation_v2 a join fixtures f on f.fixture_id=a.fixture_id join hist h on h.fpl_player_id=a.fpl_player_id
 left join fpl_defensive_contribution_projection_leaguewide d on d.fixture_id=a.fixture_id and d.fpl_player_id=a.fpl_player_id
 where a.fixture_id=p_fixture_id
), score as (
 select *, (bps+prior*5)/(mins+450)*expected_minutes + expected_goals*(case element_type when 1 then 12 when 2 then 12 when 3 then 18 when 4 then 24 else 18 end) + expected_assists*9 + cs*least(1,expected_minutes/60)*(case when element_type in(1,2) then 6 else 0 end) + dc*2 expected_bps_score from base
), weights as (
 select fixture_id,fpl_player_id,exp(least(50::numeric,expected_bps_score/12::numeric)) w from score
), totals as (select sum(w) s from weights),
p1 as (select i.fpl_player_id,i.w/t.s p1 from weights i cross join totals t),
p2 as (select i.fpl_player_id,sum((j.w/t.s)*(i.w/nullif(t.s-j.w,0))) p2 from weights i join weights j on j.fpl_player_id<>i.fpl_player_id cross join totals t group by i.fpl_player_id),
p3 as (select i.fpl_player_id,sum((j.w/t.s)*(k.w/nullif(t.s-j.w,0))*(i.w/nullif(t.s-j.w-k.w,0))) p3 from weights i join weights j on j.fpl_player_id<>i.fpl_player_id join weights k on k.fpl_player_id<>i.fpl_player_id and k.fpl_player_id<>j.fpl_player_id cross join totals t group by i.fpl_player_id),
bonus as (select w.fixture_id,w.fpl_player_id,round((3*p1.p1+2*p2.p2+p3.p3)::numeric,8) bonus from weights w join p1 using(fpl_player_id) join p2 using(fpl_player_id) join p3 using(fpl_player_id))
update fpl_player_projections pr set expected_bonus=b.bonus,xpts_bonus=b.bonus,expected_fpl_points=pr.expected_fpl_points-pr.xpts_bonus+b.bonus,generated_at=now() from bonus b where pr.fixture_id=p_fixture_id and pr.fixture_id=b.fixture_id and pr.fpl_player_id=b.fpl_player_id and pr.model_version='leaguewide_v6' and pr.scenario_key='baseline';
get diagnostics v_count=row_count; return v_count;
end $function$
;
