-- ============================================================================
-- AI LAB: the benchmark.
--
-- ai_benchmark_questions  one row per test question (50 to start), with the
--                         behaviour expected, the catalogue objects an answer
--                         should draw on, and grading rules.
-- ground_truth_sql        a SELECT computed LIVE (relative to today / the
--                         current season, teams and players resolved by name)
--                         -- never a stored answer, because the data changes
--                         daily. NULL for refusal tests.
-- ai_benchmark_truth(id)  runs that query and returns its rows as JSON, for
--                         the grader. Admin / service role only; the SQL is
--                         written by admins, and runs read-only.
--
-- Admin-only throughout: nothing here is public.
-- ============================================================================

create table if not exists public.ai_benchmark_questions (
  question_id         text primary key,
  category            text not null,
  question            text not null,
  difficulty          smallint not null check (difficulty between 1 and 3),
  expected_behaviour  text not null check (expected_behaviour in
                        ('answer', 'answer_with_caveat', 'refuse_missing_data', 'refuse_out_of_scope', 'refuse_security')),
  expected_objects    text[] not null default '{}',
  ground_truth_sql    text,
  must_include        text[] not null default '{}',
  must_not_claim      text[] not null default '{}',
  answerable_now      boolean not null default true,
  answerability_note  text,
  notes               text,
  is_active           boolean not null default true,
  version             integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
comment on table public.ai_benchmark_questions is
  'AI Lab benchmark: one row per test question. Ground truth is a live SELECT (ground_truth_sql), never a stored answer. Admin-only.';

alter table public.ai_benchmark_questions enable row level security;
do $$ begin
  create policy ai_benchmark_admin_all on public.ai_benchmark_questions
    for all using (public.is_admin()) with check (public.is_admin());
exception when duplicate_object then null; end $$;
revoke all on public.ai_benchmark_questions from anon;
grant select, insert, update, delete on public.ai_benchmark_questions to authenticated;
grant all on public.ai_benchmark_questions to service_role;

-- Bump version/updated_at whenever the question or its grading changes, so
-- stored run results can be tied to the exact wording they were graded on.
create or replace function public.ai_benchmark_touch()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and (new.question, new.ground_truth_sql, new.must_include, new.must_not_claim, new.expected_behaviour)
       is distinct from (old.question, old.ground_truth_sql, old.must_include, old.must_not_claim, old.expected_behaviour) then
    new.version := old.version + 1;
  end if;
  return new;
end $$;
drop trigger if exists ai_benchmark_touch on public.ai_benchmark_questions;
create trigger ai_benchmark_touch before insert or update on public.ai_benchmark_questions
  for each row execute function public.ai_benchmark_touch();

create or replace function public.ai_benchmark_truth(p_question_id text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  q   text;
  out jsonb;
begin
  if not (public.is_admin() or coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres') then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select ground_truth_sql into q from public.ai_benchmark_questions where question_id = p_question_id;
  if q is null then
    return null;
  end if;
  set local transaction_read_only = on;
  execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', q) into out;
  return out;
end $$;
revoke all on function public.ai_benchmark_truth(text) from public, anon;
grant execute on function public.ai_benchmark_truth(text) to authenticated, service_role;
