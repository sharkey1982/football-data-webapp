-- Live definition exported from the database (function ai_fpl_position(p integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_fpl_position(p integer)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'public', 'extensions', 'pg_temp'
AS $function$
  select case p when 1 then 'GK' when 2 then 'DEF' when 3 then 'MID' when 4 then 'FWD' end
$function$
;
