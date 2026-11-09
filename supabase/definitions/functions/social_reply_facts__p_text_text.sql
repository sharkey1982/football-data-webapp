-- Live definition exported from the database (function social_reply_facts(p_text text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_reply_facts(p_text text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select private.social_reply_facts(p_text);
$function$
;
