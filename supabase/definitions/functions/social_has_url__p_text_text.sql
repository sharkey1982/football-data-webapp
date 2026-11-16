-- Live definition exported from the database (function social_has_url(p_text text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_has_url(p_text text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'public', 'extensions', 'pg_temp'
AS $function$
  select coalesce(p_text, '') ~* '(https?://|www\.|\m[a-z0-9-]+\.(com|co\.uk|uk|net|org|io|app|ly|me|tv)\M)';
$function$
;
