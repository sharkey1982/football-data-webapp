-- Live definition exported from the database (function broadcast_confidence_rank(p text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.broadcast_confidence_rank(p text)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case p when 'confirmed_primary' then 4 when 'confirmed_secondary' then 3
    when 'probable' then 2 when 'needs_verification' then 1 else 3 end;
$function$
;
