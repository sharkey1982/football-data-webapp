-- Live definition exported from the database (function ingest_cup_token_ok(p_token text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ingest_cup_token_ok(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(length(p_token) >= 32 and p_token = (select decrypted_secret from vault.decrypted_secrets where name = 'ingest_cup_token'), false)
$function$
;
