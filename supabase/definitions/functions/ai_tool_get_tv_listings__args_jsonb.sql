-- Live definition exported from the database (function ai_tool_get_tv_listings(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_get_tv_listings(args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t jsonb; tid bigint; lim int := least(coalesce((args->>'limit')::int, 5), 20);
begin
  if args ? 'team' then t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if; tid := (t->>'team_id')::bigint; end if;
  return jsonb_build_object('tool', 'get_tv_listings', 'source', jsonb_build_array('upcoming_watch_guide'), 'as_of', now(),
    'kind', 'observed',
    'note', 'UK listings for upcoming fixtures. status not_televised = confirmed not shown live in the UK (includes the Saturday 3pm blackout rule). A fixture with no rows here has no UK listing yet (unknown, not the same as not televised).',
    'rows', coalesce((select jsonb_agg(r) from (
      select g.kickoff_date, to_char(g.kickoff_time, 'HH24:MI') kickoff_time_uk, g.league_name competition,
             g.home_team_name home_team, g.away_team_name away_team, g.status, g.is_live, g.broadcaster, g.channel,
             g.streaming_service, g.service_product, g.access_type, g.is_free_to_air, g.is_subscription, g.is_ppv,
             g.confidence, g.availability_notes, g.watch_url, g.source, g.verified_at::date verified
        from upcoming_watch_guide g
       where (tid is null or tid in (g.home_team_id, g.away_team_id))
         and (not args ? 'from_date' or g.kickoff_date >= (args->>'from_date')::date)
         and (not args ? 'to_date' or g.kickoff_date <= (args->>'to_date')::date)
       order by g.kickoff_date, g.kickoff_time limit lim) r), '[]'::jsonb));
end $function$
;
