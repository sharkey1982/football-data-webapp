-- Live definition exported from the database (function social_numbers(p_text text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_numbers(p_text text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'public', 'extensions', 'pg_temp'
AS $function$
  select coalesce(array_agg(m[1]), '{}') from regexp_matches(coalesce(p_text, ''), '([0-9]+(?:\.[0-9]+)?)', 'g') m;
$function$
;
