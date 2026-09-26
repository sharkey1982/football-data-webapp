-- Live definition exported from the database (function set_fpl_code_from_payload()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.set_fpl_code_from_payload()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.fpl_code is null and new.source_payload ? 'code' then
    new.fpl_code := (new.source_payload->>'code')::bigint;
  end if;
  return new;
end;
$function$
;
