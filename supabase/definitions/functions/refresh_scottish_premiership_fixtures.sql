-- Live definition exported from the database (function refresh_scottish_premiership_fixtures()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_scottish_premiership_fixtures()
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  select public.refresh_feed_nearest_date('SC0', 'https://fixturedownload.com/feed/json/scottish-premiership-2026');
$function$
;
