-- Live definition exported from the database (function social_oauth_consume(p_state_hash text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_oauth_consume(p_state_hash text)
 RETURNS TABLE(code_verifier text, created_by uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  delete from private.social_oauth_states where state_hash = p_state_hash and expires_at > now()
  returning code_verifier, created_by;
$function$
;
