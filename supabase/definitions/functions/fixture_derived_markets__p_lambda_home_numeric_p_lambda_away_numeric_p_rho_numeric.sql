-- Live definition exported from the database (function fixture_derived_markets(p_lambda_home numeric, p_lambda_away numeric, p_rho numeric)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fixture_derived_markets(p_lambda_home numeric, p_lambda_away numeric, p_rho numeric)
 RETURNS TABLE(home_win numeric, draw numeric, away_win numeric, over_2_5 numeric, under_2_5 numeric, btts numeric, home_clean_sheet numeric, away_clean_sheet numeric)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with grid as (
    select h, a,
      case
        when h = 0 and a = 0 then 1 - p_lambda_home * p_lambda_away * p_rho
        when h = 0 and a = 1 then 1 + p_lambda_home * p_rho
        when h = 1 and a = 0 then 1 + p_lambda_away * p_rho
        when h = 1 and a = 1 then 1 - p_rho
        else 1
      end
      * (exp(-p_lambda_home) * power(p_lambda_home, h) / (select coalesce(prod, 1) from (select exp(sum(ln(g))) as prod from generate_series(1, greatest(h,1)) g where h > 0) x))
      * (exp(-p_lambda_away) * power(p_lambda_away, a) / (select coalesce(prod, 1) from (select exp(sum(ln(g))) as prod from generate_series(1, greatest(a,1)) g where a > 0) y))
      as p
    from generate_series(0, 8) h, generate_series(0, 8) a
  ),
  t as (select sum(p) as total from grid)
  select
    round((sum(p) filter (where h > a) / total * 100)::numeric, 2),
    round((sum(p) filter (where h = a) / total * 100)::numeric, 2),
    round((sum(p) filter (where h < a) / total * 100)::numeric, 2),
    round((sum(p) filter (where h + a > 2) / total * 100)::numeric, 2),
    round((sum(p) filter (where h + a <= 2) / total * 100)::numeric, 2),
    round((sum(p) filter (where h > 0 and a > 0) / total * 100)::numeric, 2),
    round((sum(p) filter (where a = 0) / total * 100)::numeric, 2),
    round((sum(p) filter (where h = 0) / total * 100)::numeric, 2)
  from grid, t group by total;
$function$
;
