-- Live definition exported from the database (function email_finish_send(p_send_id bigint, p_recipients integer, p_football integer, p_sent integer, p_failed integer, p_note text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.email_finish_send(p_send_id bigint, p_recipients integer, p_football integer, p_sent integer, p_failed integer, p_note text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v private.email_sends; v_status text;
begin
  v_status := case when p_failed > 0 and p_sent = 0 then 'failed' when p_failed > 0 then 'partial'
                   when p_recipients = 0 then 'skipped' else 'sent' end;
  update private.email_sends
     set status = v_status, recipients = p_recipients, football = p_football, sent = p_sent, failed = p_failed,
         note = left(p_note, 500), finished_at = now()
   where send_id = p_send_id
  returning * into v;
  if v.send_id is null then raise exception 'unknown send %', p_send_id; end if;
  update public.pipeline_runs
     set finished_at = now(),
         status = case v_status when 'failed' then 'failed' when 'partial' then 'warning' else 'success' end,
         summary = format('GW%s %s: %s recipients (%s with the football section), %s sent, %s failed%s',
                          v.fpl_event_id, v.kind, p_recipients, p_football, p_sent, p_failed, coalesce('. ' || left(p_note, 200), '')),
         error_message = case when p_failed > 0 then left(p_note, 500) end,
         rows_read = p_recipients, rows_inserted = p_sent, rows_changed = p_sent
   where run_id = v.pipeline_run_id;
  if p_failed > 0 then
    perform private.social_notify(jsonb_build_object('kind', 'email_failed', 'send_id', v.send_id, 'gw', v.fpl_event_id,
                                                     'send_kind', v.kind, 'sent', p_sent, 'failed', p_failed, 'note', left(p_note, 300)));
  end if;
end;
$function$
;
