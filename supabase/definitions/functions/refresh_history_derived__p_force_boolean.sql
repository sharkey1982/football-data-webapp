-- Live definition exported from the database (function refresh_history_derived(p_force boolean)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_history_derived(p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r record;
  v_seasons int := 0;
  v_rows bigint := 0;
  v_started timestamptz := clock_timestamp();
begin
  for r in
    select m.league_id, m.season_id
    from public.matches m join public.leagues l on l.league_id = m.league_id and l.competition_type = 'league'
    where m.full_time_home_goals is not null
    group by m.league_id, m.season_id
    having p_force
        or count(*) * 2 <> coalesce((select count(*) from public.team_match_snapshot s
                                     where s.league_id = m.league_id and s.season_id = m.season_id), 0)
        or max(m.updated_at) > coalesce((select min(s.refreshed_at) from public.team_match_snapshot s
                                         where s.league_id = m.league_id and s.season_id = m.season_id), '-infinity')
        or exists (select 1 from public.point_deductions d where d.league_id = m.league_id and d.season_id = m.season_id
                   and d.created_at > coalesce((select min(s.refreshed_at) from public.team_match_snapshot s
                                                where s.league_id = m.league_id and s.season_id = m.season_id), '-infinity'))
  loop
    v_rows := v_rows + public.refresh_team_match_snapshot(r.league_id, r.season_id);
    v_seasons := v_seasons + 1;
  end loop;

  refresh materialized view concurrently public.team_season_summary;
  refresh materialized view concurrently public.league_season_summary;
  refresh materialized view concurrently public.league_pace_benchmarks;
  refresh materialized view concurrently public.league_table_reliability;
  if v_seasons > 0 or p_force then
    refresh materialized view concurrently public.history_streaks;
  end if;

  return jsonb_build_object('league_seasons_rebuilt', v_seasons, 'snapshot_rows', v_rows,
    'seconds', round(extract(epoch from clock_timestamp() - v_started)::numeric, 1));
end;
$function$
;
