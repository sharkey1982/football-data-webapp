-- Live definition exported from the database (function market_goal_residuals(z_home double precision, z_away double precision, p_home double precision, p_away double precision, p_over double precision)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.market_goal_residuals(z_home double precision, z_away double precision, p_home double precision, p_away double precision, p_over double precision)
 RETURNS double precision[]
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  lh double precision := exp(z_home);
  la double precision := exp(z_away);
  a double precision[] := array_fill(0::double precision, array[11]);
  b double precision[] := array_fill(0::double precision, array[11]);
  hw double precision := 0;
  aw double precision := 0;
  un double precision := 0;
  i integer;
  j integer;
begin
  a[1] := exp(-lh);
  b[1] := exp(-la);
  for i in 1..10 loop
    a[i + 1] := a[i] * lh / i;
    b[i + 1] := b[i] * la / i;
  end loop;
  for i in 0..10 loop
    for j in 0..10 loop
      if i > j then hw := hw + a[i + 1] * b[j + 1];
      elsif j > i then aw := aw + a[i + 1] * b[j + 1];
      end if;
      if i + j <= 2 then un := un + a[i + 1] * b[j + 1]; end if;
    end loop;
  end loop;
  return array[hw - p_home, aw - p_away, 1 - un - p_over];
end $function$
;
