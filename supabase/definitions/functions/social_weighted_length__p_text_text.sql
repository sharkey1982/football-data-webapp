-- Live definition exported from the database (function social_weighted_length(p_text text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_weighted_length(p_text text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'public', 'extensions', 'pg_temp'
AS $function$
  with t as (select regexp_replace(coalesce(p_text, ''), 'https?://[^\s]+', repeat('x', 23), 'g') s)
  select char_length(s) + char_length(regexp_replace(s, '[\u0001-\u10FF\u2000-\u200D\u2010-\u201F\u2032-\u2037]', '', 'g'))
    from t;
$function$
;
