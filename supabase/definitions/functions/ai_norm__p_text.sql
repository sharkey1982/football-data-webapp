-- Live definition exported from the database (function ai_norm(p text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_norm(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select lower(regexp_replace(public.unaccent(coalesce(p, '')), '[^a-zA-Z0-9]+', ' ', 'g'))
$function$
;
