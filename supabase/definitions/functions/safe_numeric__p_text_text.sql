-- Live definition exported from the database (function safe_numeric(p_text text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.safe_numeric(p_text text)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
    when p_text ~ '^-?[0-9]+(\.[0-9]+)?$' then p_text::numeric
    else null
  end;
$function$
;
