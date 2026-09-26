-- ============================================================================
-- AI LAB: run batches on the server.
--
-- The first Experiment 001 batch was driven by a loop in the browser and
-- stopped at 14 of 21 when the phone locked. Batches now run from a queue:
--
--   ai_batch_items          one row per question in a batch: queued -> sent
--                           -> done (or failed after 2 attempts)
--   ai_lab_enqueue_batch()  what the page calls: creates the batch + items
--   ai_lab_process_queue()  pg_cron every minute: sends up to 3 queued
--                           questions to the ai-lab-run Edge Function (with
--                           the internal token), re-queues any 'sent' item
--                           with no result after 4 minutes, and closes the
--                           batch when nothing is left.
--
-- ai-lab-run marks its item done when it saves the run. Closing the page no
-- longer stops anything.
-- ============================================================================

create table if not exists public.ai_batch_items (
  batch_id    bigint not null references public.ai_batches(batch_id) on delete cascade,
  question_id text   not null references public.ai_benchmark_questions(question_id),
  status      text   not null default 'queued' check (status in ('queued', 'sent', 'done', 'failed')),
  attempts    integer not null default 0,
  sent_at     timestamptz,
  run_id      bigint references public.ai_runs(run_id),
  primary key (batch_id, question_id)
);
alter table public.ai_batch_items enable row level security;
do $$ begin
  create policy ai_batch_items_admin_all on public.ai_batch_items for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;
revoke all on public.ai_batch_items from anon;
grant select on public.ai_batch_items to authenticated;
grant all on public.ai_batch_items to service_role;

create or replace function public.ai_lab_enqueue_batch(p_name text, p_model text, p_prompt_id text, p_question_ids text[])
returns bigint language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare b bigint;
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres') then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if coalesce(array_length(p_question_ids, 1), 0) = 0 then raise exception 'no questions'; end if;
  insert into public.ai_batches (name, provider, model, prompt_id, toolset_version, question_ids, created_by)
  values (p_name, 'anthropic', p_model, p_prompt_id, 'ai_tools_v1', p_question_ids, auth.uid())
  returning batch_id into b;
  insert into public.ai_batch_items (batch_id, question_id)
  select b, q from unnest(p_question_ids) q
  on conflict do nothing;
  return b;
end $$;
revoke all on function public.ai_lab_enqueue_batch(text, text, text, text[]) from public, anon;
grant execute on function public.ai_lab_enqueue_batch(text, text, text, text[]) to authenticated, service_role;

create or replace function public.ai_lab_process_queue()
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  tok text := (select value #>> '{}' from public.ai_lab_settings where key = 'internal_run_token');
  it record;
  sent integer := 0;
begin
  -- A 'sent' item with no result after 4 minutes: retry once, then fail.
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
end $$;
revoke all on function public.ai_lab_process_queue() from public, anon, authenticated;

select cron.schedule('ai-lab-process-queue', '* * * * *', $$select public.ai_lab_process_queue();$$);

-- Batch 1 (the first Experiment 001 run) stopped at 14 of 21 when the browser
-- loop ended. Record what it has, queue the rest.
insert into public.ai_batch_items (batch_id, question_id, status, attempts, run_id)
select 1, q, case when r.run_id is null then 'queued' else 'done' end, case when r.run_id is null then 0 else 1 end, r.run_id
  from public.ai_batches b, unnest(b.question_ids) q
  left join lateral (select run_id from public.ai_runs where batch_id = 1 and question_id = q order by run_id desc limit 1) r on true
 where b.batch_id = 1
on conflict do nothing;
update public.ai_batches set notes = coalesce(notes || ' ', '') || '14 runs from the browser loop, which stopped when the phone locked; the remaining 7 ran from the server queue about five hours later.'
 where batch_id = 1 and notes is null;
