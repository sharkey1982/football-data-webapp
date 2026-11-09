-- Live definition exported from the database (function ai_tool_get_fixtures(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_get_fixtures(args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t jsonb; c jsonb; tid bigint; lid bigint;
  lim int := least(coalesce((args->>'limit')::int, 5), 20);
  d_from date := coalesce((args->>'from_date')::date, current_date);
  d_to date := (args->>'to_date')::date;
begin
  if args ? 'team' then t := public.ai_resolve_team(args->>'team'); if t ? 'error' then return t; end if; tid := (t->>'team_id')::bigint; end if;
  if args ? 'competition' then c := public.ai_resolve_competition(args->>'competition'); if c ? 'error' then return c; end if; lid := (c->>'league_id')::bigint; end if;
  if tid is null and lid is null then return jsonb_build_object('error', 'Give a team, a competition, or both.'); end if;
  return jsonb_build_object('tool', 'get_fixtures', 'source', jsonb_build_array('fixtures', 'teams', 'leagues'),
    'as_of', now(), 'kind', 'observed',
    'note', 'Scheduled fixtures from today. Kick-off times are UK local time. Results are in get_results.',
    'rows', coalesce((select jsonb_agg(r) from (
      select f.kickoff_date, to_char(f.kickoff_time, 'HH24:MI') kickoff_time_uk, l.name competition, f.round, f.matchweek,
             h.display_name home_team, a.display_name away_team, f.status
        from fixtures f join leagues l using (league_id)
        join teams h on h.team_id = f.home_team_id join teams a on a.team_id = f.away_team_id
       where f.status in ('scheduled', 'postponed') and f.kickoff_date >= d_from
         and (d_to is null or f.kickoff_date <= d_to)
         and (tid is null or tid in (f.home_team_id, f.away_team_id))
         and (lid is null or f.league_id = lid)
       order by f.kickoff_date, f.kickoff_time nulls last limit lim) r), '[]'::jsonb));
end $function$
;
