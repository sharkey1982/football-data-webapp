-- Live definition exported from the database (function lab_devig_power(p_h numeric, p_d numeric, p_a numeric)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.lab_devig_power(p_h numeric, p_d numeric, p_a numeric)
 RETURNS double precision[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  rh double precision := 1 / p_h; rd double precision := 1 / p_d; ra double precision := 1 / p_a;
  lo double precision := 0.5; hi double precision := 3; k double precision; s double precision;
begin
  for i in 1..60 loop
    k := (lo + hi) / 2;
    s := power(rh, k) + power(rd, k) + power(ra, k);
    if s > 1 then lo := k; else hi := k; end if;
  end loop;
  return array[power(rh, k), power(rd, k), power(ra, k)];
end;
$function$
;
