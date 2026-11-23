-- Live definition exported from the database (function tennis_refresh()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.tennis_refresh()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  perform tennis.rebuild_events();
  perform tennis.rebuild_summaries();
  perform tennis.rebuild_ratings();
  return format('%s events, %s editions, %s player totals, %s ratings',
    (select count(*) from tennis.events), (select count(*) from tennis.editions), (select count(*) from tennis.player_totals),
    (select count(*) from tennis.player_ratings));
end $function$
;
