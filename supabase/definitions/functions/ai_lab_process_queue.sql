-- Live definition exported from the database (function ai_lab_process_queue()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_lab_process_queue()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  tok text := (select value #>> '{}' from public.ai_lab_settings where key = 'internal_run_token');
  it record;
  sent integer := 0;
begin
  update public.ai_batch_items
     set status = case when attempts >= 2 then 'failed' else 'queued' end
   where status = 'sent' and sent_at < now() - interval '4 minutes';

  for it in
    select i.batch_id, i.question_id, b.model, b.prompt_id
      from public.ai_batch_items i join public.ai_batches b using (batch_id)
     where i.status = 'queued' and b.status = 'running'
     order by i.batch_id, i.question_id
     limit 3
  loop
    update public.ai_batch_items set status = 'sent', attempts = attempts + 1, sent_at = now()
     where batch_id = it.batch_id and question_id = it.question_id;
    perform net.http_post(
      url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/ai-lab-run',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-ai-lab-token', tok),
      body := jsonb_build_object('question_id', it.question_id, 'model', it.model, 'prompt_id', it.prompt_id, 'batch_id', it.batch_id),
      timeout_milliseconds := 150000);
    sent := sent + 1;
  end loop;

  update public.ai_batches b set status = 'finished', finished_at = now()
   where b.status = 'running'
     and not exists (select 1 from public.ai_batch_items i where i.batch_id = b.batch_id and i.status in ('queued', 'sent'))
     and exists (select 1 from public.ai_batch_items i where i.batch_id = b.batch_id);
  return sent;
end $function$
;
