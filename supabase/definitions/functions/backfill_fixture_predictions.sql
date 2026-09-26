-- Live definition exported from the database (function backfill_fixture_predictions()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.backfill_fixture_predictions()
 RETURNS integer
 LANGUAGE sql
 SET search_path TO 'public', 'pg_temp'
AS $function$
with latest_fit as (
 select distinct on (league_id) league_id,fit_run_id,rho,home_advantage,window_start_date,window_end_date,fitted_at from public.model_fit_runs where status='accepted' order by league_id,fitted_at desc
), appearances as (
 select lf.league_id,lf.fit_run_id,x.team_id,count(*)::numeric n
 from latest_fit lf join lateral (
   select m.home_team_id team_id from public.matches m where m.league_id=lf.league_id and m.match_date between lf.window_start_date and lf.window_end_date
   union all
   select m.away_team_id from public.matches m where m.league_id=lf.league_id and m.match_date between lf.window_start_date and lf.window_end_date
 ) x on true group by lf.league_id,lf.fit_run_id,x.team_id
), base as (
 select f.fixture_id,lf.fit_run_id,
 -- The model's own terms, with overrides deliberately NOT included --
 -- they're added separately below so both versions come from one
 -- expression rather than two that could drift apart.
 lf.home_advantage + hr.attack_strength*(case when f.league_id=1 and coalesce(ha.n,0)<12 then coalesce(ha.n,0)/(coalesce(ha.n,0)+12) else 1 end)
 - ar.defence_strength*(case when f.league_id=1 and coalesce(aa.n,0)<12 then coalesce(aa.n,0)/(coalesce(aa.n,0)+12) else 1 end)
 + case when f.league_id=1 then coalesce(hadj.centered_home_attack_dev,0)*(case when coalesce(ha.n,0)<12 then coalesce(ha.n,0)/(coalesce(ha.n,0)+12) else 1 end) - coalesce(aadj.centered_away_defence_dev,0)*(case when coalesce(aa.n,0)<12 then coalesce(aa.n,0)/(coalesce(aa.n,0)+12) else 1 end) else 0 end
 as home_exponent,
 ar.attack_strength*(case when f.league_id=1 and coalesce(aa.n,0)<12 then coalesce(aa.n,0)/(coalesce(aa.n,0)+12) else 1 end)
 - hr.defence_strength*(case when f.league_id=1 and coalesce(ha.n,0)<12 then coalesce(ha.n,0)/(coalesce(ha.n,0)+12) else 1 end)
 + case when f.league_id=1 then coalesce(aadj.centered_away_attack_dev,0)*(case when coalesce(aa.n,0)<12 then coalesce(aa.n,0)/(coalesce(aa.n,0)+12) else 1 end) - coalesce(hadj.centered_home_defence_dev,0)*(case when coalesce(ha.n,0)<12 then coalesce(ha.n,0)/(coalesce(ha.n,0)+12) else 1 end) else 0 end
 as away_exponent,
 coalesce(hov.attack_adjustment,0) - coalesce(aov.defence_adjustment,0) as home_override,
 coalesce(aov.attack_adjustment,0) - coalesce(hov.defence_adjustment,0) as away_override,
 case when f.league_id=1 then 'dc_home_away_sparse_shrink_v2' else 'dc_baseline_v1' end model_version
 from fixtures f join latest_fit lf on lf.league_id=f.league_id join team_ratings hr on hr.team_id=f.home_team_id and hr.fit_run_id=lf.fit_run_id join team_ratings ar on ar.team_id=f.away_team_id and ar.fit_run_id=lf.fit_run_id
 left join appearances ha on ha.league_id=f.league_id and ha.fit_run_id=lf.fit_run_id and ha.team_id=f.home_team_id left join appearances aa on aa.league_id=f.league_id and aa.fit_run_id=lf.fit_run_id and aa.team_id=f.away_team_id
 left join team_home_away_adjustment_v1 hadj on hadj.team_id=f.home_team_id left join team_home_away_adjustment_v1 aadj on aadj.team_id=f.away_team_id
 left join team_strength_manual_override hov on hov.team_id=f.home_team_id left join team_strength_manual_override aov on aov.team_id=f.away_team_id
 where f.status in('scheduled','postponed')
   -- Kick-off guard (2026-09-23): never refresh from a fit dated on/after kick-off.
   and lf.fitted_at::date < f.kickoff_date
), preds as (
 select fixture_id, fit_run_id, model_version,
   exp(home_exponent + home_override) as pred_home,
   exp(away_exponent + away_override) as pred_away,
   exp(home_exponent) as raw_home,
   exp(away_exponent) as raw_away
 from base
), updated as (
 update fixtures f set
   predicted_home_goals=p.pred_home, predicted_away_goals=p.pred_away,
   raw_predicted_home_goals=p.raw_home, raw_predicted_away_goals=p.raw_away,
   prediction_fit_run_id=p.fit_run_id, prediction_model_version=p.model_version, predicted_at=now()
 from preds p where p.fixture_id=f.fixture_id and f.status in('scheduled','postponed') returning f.fixture_id
) select count(*)::integer from updated;
$function$
;
