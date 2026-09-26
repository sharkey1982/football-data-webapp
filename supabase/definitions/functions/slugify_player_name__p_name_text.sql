-- Live definition exported from the database (function slugify_player_name(p_name text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.slugify_player_name(p_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select nullif(
    trim(both '-' from
      regexp_replace(
        regexp_replace(
          lower(unaccent(coalesce(p_name, ''))),
          '[^a-z0-9]+', '-', 'g'
        ),
        '-{2,}', '-', 'g'
      )
    ),
  '');
$function$
;
