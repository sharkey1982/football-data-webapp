-- Live definition exported from the database (function social_lineups_tick()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_lineups_tick()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_run bigint; v_res jsonb; v_news jsonb; v_q integer;
begin
  if not (select detector_enabled from public.social_settings) then return jsonb_build_object('status', 'disabled'); end if;
  if not exists (select 1 from public.fpl_fixtures ff where ff.season_id = public.fpl_current_season_id()
                   and ff.kickoff_time between now() - interval '45 minutes' and now() - interval '5 minutes') then
    return jsonb_build_object('status', 'none');
  end if;
  insert into public.social_detector_runs (triggered_by) values ('lineups') returning run_id into v_run;
  begin
    v_res := private.social_detect_lineups(v_run);
  exception when others then
    v_res := jsonb_build_object('status', 'error', 'error', sqlerrm);
  end;
  begin
    v_news := private.social_detect_team_news(v_run);
  exception when others then
    v_news := jsonb_build_object('status', 'error', 'error', sqlerrm);
  end;
  v_q := private.social_auto_queue();
  update public.social_detector_runs set finished_at = now(),
         results = jsonb_build_object('lineups', v_res, 'team_news', v_news, 'auto_queued', v_q),
         candidates_created = (case when v_res->>'status' = 'created' then 1 else 0 end) + (case when v_news->>'status' = 'created' then 1 else 0 end)
   where run_id = v_run;
  return jsonb_build_object('lineups', v_res, 'team_news', v_news);
end;
$function$
;
