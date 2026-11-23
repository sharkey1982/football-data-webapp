-- Live definition exported from the database (function lab_devig_shin(p_h numeric, p_d numeric, p_a numeric)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.lab_devig_shin(p_h numeric, p_d numeric, p_a numeric)
 RETURNS double precision[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r double precision[] := array[1 / p_h::double precision, 1 / p_d::double precision, 1 / p_a::double precision];
  b double precision := r[1] + r[2] + r[3];
  lo double precision := 0; hi double precision := 0.4; z double precision; s double precision;
  p double precision[] := array[0, 0, 0]::double precision[];
begin
  if b <= 1 then
    return array[r[1] / b, r[2] / b, r[3] / b];
  end if;
  for i in 1..60 loop
    z := (lo + hi) / 2;
    s := 0;
    for j in 1..3 loop
      p[j] := (sqrt(z * z + 4 * (1 - z) * r[j] * r[j] / b) - z) / (2 * (1 - z));
      s := s + p[j];
    end loop;
    if s > 1 then lo := z; else hi := z; end if;
  end loop;
  return p;
end;
$function$
;
