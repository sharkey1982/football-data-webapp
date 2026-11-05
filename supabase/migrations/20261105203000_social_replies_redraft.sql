-- ============================================================================
-- X replies (5 Nov 2026): the first read cycle stored 3 real reply ideas, but
-- all 3 came from the plain template: the Claude drafter returned nothing
-- (llm_cost_usd 0) and the error was not recorded. x-replies now records the
-- drafter's errors (social_reply_runs.detail.draft_errors), falls back from
-- Haiku to claude-sonnet-5 when the API refuses a model, and has a kind
-- 'redraft' that redrafts open template ideas from the last 36 hours with
-- Claude. It reads nothing from X, so it costs nothing on X.
-- This allows the new kind, lets private.social_replies_call send it, and
-- runs it once.
-- Safe to re-run: guarded constraint change, create or replace; a redraft
-- only touches ideas still drafted by the template.
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'social_reply_runs_kind_check'
                   and pg_get_constraintdef(oid) like '%redraft%') then
    alter table public.social_reply_runs drop constraint if exists social_reply_runs_kind_check;
    alter table public.social_reply_runs add constraint social_reply_runs_kind_check check (kind in ('ideas', 'mentions', 'redraft'));
  end if;
end $$;

create or replace function private.social_replies_call(p_kind text, p_triggered_by text default 'schedule')
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_kind not in ('ideas', 'mentions', 'redraft') then raise exception 'unknown kind %', p_kind; end if;
  perform net.http_post(
    url := 'https://ppzfmpbnojyjeblelsuz.supabase.co/functions/v1/x-replies',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-social-token', (select token from private.social_worker)),
    body := jsonb_build_object('kind', p_kind, 'triggered_by', p_triggered_by), timeout_milliseconds := 120000);
end;
$$;
revoke all on function private.social_replies_call(text, text) from public, anon, authenticated;

select private.social_replies_call('redraft', 'first-run');
