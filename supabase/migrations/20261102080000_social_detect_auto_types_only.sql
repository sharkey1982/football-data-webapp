-- Stop filling the X queue with posts that will never go (Chris, 2 Nov 2026:
-- "There are a load of x posts sat in the queue never posted").
-- Since 31 Oct only the weekly FPL pieces post automatically
-- (social_settings.auto_post_types); the other detectors kept making drafts
-- that waited for an approval nobody gives, then expired. Now a detector runs
-- only when its post type is in auto_post_types; the rest report 'off'. Adding
-- a type back to auto_post_types turns its detector back on. Line-up checks
-- (social_lineup_checks, used for the team-sheets record) still run; the
-- after-kick-off team-news draft only when 'team_news' is an automatic type.
-- Also clears the drafts already waiting (marked superseded, not deleted).
-- Safe to re-run.

create or replace function public.social_run_detectors(p_triggered_by text default 'schedule'::text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  v_run bigint; v_res jsonb := '{}'; v_one jsonb; v_created integer := 0; d text; v_pr bigint; v_queued integer;
  v_auto text[] := (select auto_post_types from public.social_settings);
  -- detector -> the post type it makes
  v_type jsonb := jsonb_build_object(
    'captaincy', 'fpl_captaincy', 'xg_change', 'team_xg_change', 'accuracy', 'prediction_accuracy',
    'streaks', 'historical_insight', 'price_changes', 'fpl_price_changes', 'gameweek_threads', 'gameweek_thread',
    'availability', 'fpl_availability', 'market', 'fpl_market', 'week_changes', 'fpl_week_changes',
    'outlook', 'gameweek_outlook', 'fixture_moves', 'fixture_moved', 'fact', 'fact',
    'daily_market', 'daily_market', 'price_watch', 'fpl_price_watch');
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'admin only'; end if;
  if not (select detector_enabled from public.social_settings) then
    return jsonb_build_object('status', 'disabled');
  end if;
  insert into public.social_detector_runs (triggered_by) values (coalesce(p_triggered_by, 'schedule')) returning run_id into v_run;
  insert into public.pipeline_runs (job_name, started_at, status) values ('social_detect', now(), 'running') returning run_id into v_pr;

  foreach d in array array['captaincy', 'xg_change', 'accuracy', 'streaks', 'price_changes', 'gameweek_threads',
                            'availability', 'market', 'week_changes', 'outlook', 'fixture_moves', 'fact', 'daily_market', 'price_watch'] loop
    if not (v_type->>d = any (coalesce(v_auto, '{}'))) then
      v_res := v_res || jsonb_build_object(d, jsonb_build_object('status', 'off'));
      continue;
    end if;
    begin
      execute format('select private.social_detect_%s($1)', d) into v_one using v_run;
    exception when others then
      v_one := jsonb_build_object('status', 'error', 'error', sqlerrm);
    end;
    v_res := v_res || jsonb_build_object(d, v_one);
    if v_one->>'status' = 'created' then
      v_created := v_created + greatest(1, (select count(*) from jsonb_array_elements(coalesce(v_one->'fixtures', '[]')) f where f->>'status' = 'created'));
    end if;
  end loop;
  v_queued := private.social_auto_queue();

  update public.social_detector_runs set finished_at = now(), results = v_res || jsonb_build_object('auto_queued', v_queued),
         candidates_created = v_created where run_id = v_run;
  update public.pipeline_runs set finished_at = now(),
         status = case when exists (select 1 from jsonb_each(v_res) e where e.value->>'status' = 'error') then 'failed' else 'success' end,
         summary = format('%s candidate(s), %s queued automatically; %s', v_created, v_queued,
                          (select string_agg(e.key || ' ' || (e.value->>'status'), ', ') from jsonb_each(v_res) e))
   where run_id = v_pr;
  return jsonb_build_object('run_id', v_run, 'candidates_created', v_created, 'auto_queued', v_queued, 'results', v_res);
end;
$function$;

create or replace function public.social_lineups_tick()
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
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
  if 'team_news' = any (coalesce((select auto_post_types from public.social_settings), '{}')) then
    begin
      v_news := private.social_detect_team_news(v_run);
    exception when others then
      v_news := jsonb_build_object('status', 'error', 'error', sqlerrm);
    end;
  else
    v_news := jsonb_build_object('status', 'off');
  end if;
  v_q := private.social_auto_queue();
  update public.social_detector_runs set finished_at = now(),
         results = jsonb_build_object('lineups', v_res, 'team_news', v_news, 'auto_queued', v_q),
         candidates_created = (case when v_res->>'status' = 'created' then 1 else 0 end) + (case when v_news->>'status' = 'created' then 1 else 0 end)
   where run_id = v_run;
  return jsonb_build_object('lineups', v_res, 'team_news', v_news);
end;
$function$;

-- Clear the waiting drafts: not approved, not published, of a type that no
-- longer posts automatically.
update public.social_post_candidates
   set approval_status = 'superseded', updated_at = now()
 where approval_status = 'pending' and publication_status = 'unpublished'
   and not (post_type = any (coalesce((select auto_post_types from public.social_settings), '{}')));
