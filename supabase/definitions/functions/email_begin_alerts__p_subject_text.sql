-- Live definition exported from the database (function email_begin_alerts(p_subject text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_begin_alerts(p_subject text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_send bigint; v_run bigint;
begin
  insert into private.email_sends (kind, subject) values ('alerts', p_subject) returning send_id into v_send;
  insert into public.pipeline_runs (job_name, started_at, status, summary)
  values ('email-alerts', now(), 'running', 'injury alerts send started') returning run_id into v_run;
  update private.email_sends set pipeline_run_id = v_run where send_id = v_send;
  return jsonb_build_object('send_id', v_send);
end;
$function$
;
