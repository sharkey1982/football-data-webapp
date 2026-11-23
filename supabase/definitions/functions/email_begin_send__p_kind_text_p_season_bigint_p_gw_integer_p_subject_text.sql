-- Live definition exported from the database (function email_begin_send(p_kind text, p_season bigint, p_gw integer, p_subject text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_begin_send(p_kind text, p_season bigint, p_gw integer, p_subject text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_key text; v_send private.email_sends; v_run bigint;
begin
  if p_kind not in ('weekly', 'test') then raise exception 'bad kind %', p_kind; end if;
  if p_kind = 'weekly' then
    v_key := format('fpl-weekly:%s:%s', p_season, p_gw);
    insert into private.email_sends (kind, issue_key, season_id, fpl_event_id, subject)
    values ('weekly', v_key, p_season, p_gw, p_subject)
    on conflict (issue_key) do nothing
    returning * into v_send;
    if v_send.send_id is null then
      update private.email_sends
         set status = 'sending', attempts = attempts + 1, started_at = now(), finished_at = null, recipients = 0, football = 0,
             sent = 0, failed = 0, note = null, subject = p_subject
       where issue_key = v_key and status = 'failed' and sent = 0 and attempts < 3 and started_at < now() - interval '30 minutes'
      returning * into v_send;
      if v_send.send_id is null then
        return jsonb_build_object('skip', 'already sent (or being sent) for this gameweek', 'issue_key', v_key);
      end if;
    end if;
  else
    if exists (select 1 from private.email_sends where kind = 'test' and started_at > now() - interval '2 minutes') then
      return jsonb_build_object('skip', 'a test was sent in the last 2 minutes');
    end if;
    insert into private.email_sends (kind, season_id, fpl_event_id, subject)
    values ('test', p_season, p_gw, p_subject) returning * into v_send;
  end if;
  insert into public.pipeline_runs (job_name, started_at, status, summary)
  values (case when p_kind = 'weekly' then 'email-weekly' else 'email-weekly-test' end, now(), 'running', format('GW%s %s send started', p_gw, p_kind))
  returning run_id into v_run;
  update private.email_sends set pipeline_run_id = v_run where send_id = v_send.send_id;
  return jsonb_build_object('send_id', v_send.send_id, 'issue_key', v_send.issue_key, 'kind', v_send.kind);
end;
$function$
;
