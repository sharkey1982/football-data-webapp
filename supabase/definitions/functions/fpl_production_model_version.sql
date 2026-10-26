-- Live definition exported from the database (function fpl_production_model_version()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_production_model_version()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select model_version from public.production_models where component = 'fpl_player_projection'
$function$
;
