-- Live definition exported from the database (function refresh_derived_markets_memo()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_derived_markets_memo()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with ins as (
    insert into public.derived_markets_memo
    select x.lh, x.la, x.rho, dm.*
    from (select distinct f.predicted_home_goals::numeric lh, f.predicted_away_goals::numeric la, r.rho::numeric rho
            from public.fixtures f join public.model_fit_runs r on r.fit_run_id = f.prediction_fit_run_id
           where f.predicted_home_goals is not null and f.predicted_away_goals is not null and r.rho is not null) x
    cross join lateral public.fixture_derived_markets(x.lh, x.la, x.rho) dm
    where not exists (select 1 from public.derived_markets_memo m where m.lambda_home = x.lh and m.lambda_away = x.la and m.rho = x.rho)
    on conflict do nothing
    returning 1)
  select count(*)::integer from ins
$function$
;
