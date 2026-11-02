-- Live definition exported from the database (function fixture_derived_markets_cached(p_lambda_home numeric, p_lambda_away numeric, p_rho numeric)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fixture_derived_markets_cached(p_lambda_home numeric, p_lambda_away numeric, p_rho numeric)
 RETURNS TABLE(home_win numeric, draw numeric, away_win numeric, over_2_5 numeric, under_2_5 numeric, btts numeric, home_clean_sheet numeric, away_clean_sheet numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  (select m.home_win, m.draw, m.away_win, m.over_2_5, m.under_2_5, m.btts, m.home_clean_sheet, m.away_clean_sheet
     from public.derived_markets_memo m
    where m.lambda_home = p_lambda_home and m.lambda_away = p_lambda_away and m.rho = p_rho
   union all
   select * from public.fixture_derived_markets(p_lambda_home, p_lambda_away, p_rho))
  limit 1
$function$
;
