-- Live definition exported from the database (function market_goal_lambdas(p_home double precision, p_draw double precision, p_away double precision, p_over double precision, OUT lambda_home double precision, OUT lambda_away double precision)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.market_goal_lambdas(p_home double precision, p_draw double precision, p_away double precision, p_over double precision, OUT lambda_home double precision, OUT lambda_away double precision)
 RETURNS record
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  tot double precision := p_home + p_draw + p_away;
  ph double precision := p_home / tot;
  pa double precision := p_away / tot;
  z1 double precision := ln(1.4);
  z2 double precision := ln(1.2);
  h constant double precision := 1e-6;
  r double precision[];
  r1 double precision[];
  r2 double precision[];
  j1 double precision[];
  j2 double precision[];
  a11 double precision; a12 double precision; a22 double precision;
  g1 double precision; g2 double precision; det double precision;
  d1 double precision; d2 double precision;
  it integer;
  k integer;
begin
  for it in 1..60 loop
    r := public.market_goal_residuals(z1, z2, ph, pa, p_over);
    r1 := public.market_goal_residuals(z1 + h, z2, ph, pa, p_over);
    r2 := public.market_goal_residuals(z1, z2 + h, ph, pa, p_over);
    j1 := array[(r1[1] - r[1]) / h, (r1[2] - r[2]) / h, (r1[3] - r[3]) / h];
    j2 := array[(r2[1] - r[1]) / h, (r2[2] - r[2]) / h, (r2[3] - r[3]) / h];
    a11 := 0; a12 := 0; a22 := 0; g1 := 0; g2 := 0;
    for k in 1..3 loop
      a11 := a11 + j1[k] * j1[k];
      a12 := a12 + j1[k] * j2[k];
      a22 := a22 + j2[k] * j2[k];
      g1 := g1 + j1[k] * r[k];
      g2 := g2 + j2[k] * r[k];
    end loop;
    a11 := a11 * (1 + 1e-9); a22 := a22 * (1 + 1e-9);
    det := a11 * a22 - a12 * a12;
    exit when det = 0;
    d1 := -(a22 * g1 - a12 * g2) / det;
    d2 := -(a11 * g2 - a12 * g1) / det;
    -- keep steps sane far from the solution
    d1 := greatest(-1, least(1, d1));
    d2 := greatest(-1, least(1, d2));
    z1 := z1 + d1;
    z2 := z2 + d2;
    exit when abs(d1) < 1e-12 and abs(d2) < 1e-12;
  end loop;
  lambda_home := exp(z1);
  lambda_away := exp(z2);
end $function$
;
