-- Live definition exported from the database (function fpl_nb_upper_tail(p_threshold integer, p_mean double precision, p_size double precision)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_nb_upper_tail(p_threshold integer, p_mean double precision, p_size double precision)
 RETURNS double precision
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  p double precision;
  q double precision;
  pmf double precision;
  cdf double precision;
  k integer;
begin
  if p_threshold <= 0 then return 1; end if;
  if p_mean <= 0 then return 0; end if;
  p := p_size / (p_size + p_mean);
  q := 1 - p;
  pmf := exp(p_size * ln(p));
  cdf := pmf;
  for k in 0..p_threshold - 2 loop
    pmf := pmf * (k + p_size) / (k + 1) * q;
    cdf := cdf + pmf;
  end loop;
  return greatest(0, least(1, 1 - cdf));
end $function$
;
