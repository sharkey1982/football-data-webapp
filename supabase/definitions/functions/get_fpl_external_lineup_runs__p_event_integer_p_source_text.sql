-- Live definition exported from the database (function get_fpl_external_lineup_runs(p_event integer, p_source text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_external_lineup_runs(p_event integer, p_source text DEFAULT 'fantasy_football_scout'::text)
 RETURNS TABLE(team_id bigint, fetched_at timestamp with time zone, names_read integer, matched integer, unmatched text[], saved boolean, source_updated text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  select distinct on (r.team_id) r.team_id, r.fetched_at, r.names_read, r.matched, r.unmatched, r.saved, r.source_updated
    from public.fpl_external_lineup_runs r
   where r.source = p_source and r.season_id = public.fpl_current_season_id() and r.fpl_event_id = p_event
   order by r.team_id, r.fetched_at desc;
end $function$
;
