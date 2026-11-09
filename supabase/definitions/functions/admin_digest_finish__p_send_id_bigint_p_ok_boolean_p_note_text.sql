-- Live definition exported from the database (function admin_digest_finish(p_send_id bigint, p_ok boolean, p_note text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.admin_digest_finish(p_send_id bigint, p_ok boolean, p_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare r private.admin_digest_sends;
begin
  update private.admin_digest_sends
     set status = case when p_ok then 'sent' else 'failed' end, note = left(p_note, 500), finished_at = now()
   where send_id = p_send_id
  returning * into r;
  if r.send_id is null then return; end if;
  insert into public.pipeline_runs (job_name, started_at, finished_at, status, summary, error_message)
  values (case when r.edition = 'morning' then 'admin-morning-digest' else 'admin-daily-digest' end
          || case when r.mode = 'scheduled' then '' else '-preview' end,
          r.queued_at, now(), case when p_ok then 'success' else 'failed' end,
          format('%s (%s)', r.subject, r.mode), case when not p_ok then left(p_note, 500) end);
end;
$function$
;
