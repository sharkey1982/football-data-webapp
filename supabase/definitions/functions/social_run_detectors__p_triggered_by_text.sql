-- Live definition exported from the database (function social_run_detectors(p_triggered_by text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.social_run_detectors(p_triggered_by text DEFAULT 'schedule'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run bigint; v_res jsonb := '{}'; v_one jsonb; v_created integer := 0; d text; v_pr bigint;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'admin only'; end if;
  if not (select detector_enabled from public.social_settings) then
    return jsonb_build_object('status', 'disabled');
  end if;
  insert into public.social_detector_runs (triggered_by) values (coalesce(p_triggered_by, 'schedule')) returning run_id into v_run;
  insert into public.pipeline_runs (job_name, started_at, status) values ('social_detect', now(), 'running') returning run_id into v_pr;

  foreach d in array array['captaincy', 'xg_change', 'accuracy', 'streaks'] loop
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

  update public.social_detector_runs set finished_at = now(), results = v_res, candidates_created = v_created where run_id = v_run;
  update public.pipeline_runs set finished_at = now(),
         status = case when exists (select 1 from jsonb_each(v_res) e where e.value->>'status' = 'error') then 'failed' else 'success' end,
         summary = format('%s candidate(s); %s', v_created,
                          (select string_agg(e.key || ' ' || (e.value->>'status'), ', ') from jsonb_each(v_res) e))
   where run_id = v_pr;
  return jsonb_build_object('run_id', v_run, 'candidates_created', v_created, 'results', v_res);
end;
$function$
;
