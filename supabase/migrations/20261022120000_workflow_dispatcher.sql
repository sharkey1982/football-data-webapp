-- ============================================================================
-- On-time dispatch of deadline-critical GitHub workflows from pg_cron (audit
-- P-01, 22 Oct 2026).
--
-- GitHub's own cron starts these workflows 2 to 9.5 hours late (median about
-- 5 h over 14 days), and sometimes drops runs. A workflow_dispatch starts in
-- seconds. pg_cron runs on time, so pg_cron decides when each slot is due and
-- asks the Netlify function trigger-workflow (which holds the GitHub token) to
-- dispatch it. pg_cron authenticates with a shared token kept in Vault; the
-- same value is the Netlify env var WORKFLOW_TRIGGER_TOKEN. The token is
-- generated here, inside the database, so it never appears in this public
-- repo.
--
-- Slots are either a fixed UTC time each day (the old GitHub cron times), or
-- relative to public.fpl_gameweeks.deadline_time:
--   deadline  : deadline + offset_minutes (negative = before), skipped once the
--               deadline has passed
--   team_news : the team-news update after the press conferences (the rule in
--               scripts/fpl_gameweek_report.py team_news_thread): 12:11 UK on
--               deadline day for a deadline at 17:00 UK or later, otherwise
--               16:11 UK the day before; plus offset_minutes
--
-- The GitHub cron lines stay as a fallback. When a late scheduled run arrives,
-- its first job asks public.workflow_slot_covered(workflow, cron) and skips the
-- run if pg_cron already dispatched that slot (so the work does not run twice
-- and the morning site rebuild is not repeated).
--
-- Created DISABLED: a later migration turns it on once the Netlify side is
-- deployed with the token (private.workflow_dispatch_settings.enabled).
-- Safe to re-run.
-- ============================================================================

-- The shared token, generated in the database (64 hex characters).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'workflow_trigger_token') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'workflow_trigger_token',
      'pg_cron -> Netlify trigger-workflow machine path (header x-workflow-token). Same value as Netlify env WORKFLOW_TRIGGER_TOKEN.');
  end if;
end $$;

create table if not exists private.workflow_dispatch_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  endpoint text not null default 'https://fixtureshark.com/.netlify/functions/trigger-workflow',
  grace interval not null default '45 minutes',   -- a slot missed by more than this is not dispatched late
  max_attempts int not null default 3,
  updated_at timestamptz not null default now()
);
insert into private.workflow_dispatch_settings (id) values (true) on conflict do nothing;

create table if not exists private.workflow_dispatch_slots (
  slot_key text primary key,
  workflow text not null,           -- key in trigger-workflow's allow-list
  kind text not null check (kind in ('daily', 'deadline', 'team_news')),
  at_utc time,                      -- daily slots
  offset_minutes int,               -- deadline / team_news slots
  inputs jsonb not null default '{}',
  github_crons text[] not null default '{}',  -- the workflow's cron lines this slot stands in for
  active boolean not null default true,
  notes text,
  check ((kind = 'daily') = (at_utc is not null)),
  check (kind <> 'deadline' or offset_minutes is not null)
);

create table if not exists private.workflow_dispatches (
  dispatch_id bigserial primary key,
  slot_key text not null references private.workflow_dispatch_slots (slot_key),
  workflow text not null,
  due_at timestamptz not null,
  attempt int not null,
  requested_at timestamptz not null default now(),
  request_id bigint,
  status_code int,
  outcome text not null default 'pending' check (outcome in ('pending', 'ok', 'failed')),
  detail text,
  unique (slot_key, due_at, attempt)
);
create index if not exists workflow_dispatches_workflow_due_idx on private.workflow_dispatches (workflow, due_at desc);

insert into private.workflow_dispatch_slots (slot_key, workflow, kind, at_utc, offset_minutes, inputs, github_crons, notes) values
  ('daily-import-0600', 'daily-import', 'daily', '06:00', null, '{}', '{"0 6 * * *"}',
   'English imports, fits and predictions'),
  ('fpl-pipeline-0641', 'fpl-projections-pipeline', 'daily', '06:41', null, '{"rebuild_site": true}', '{"41 6 * * *"}',
   'Morning run: the one scheduled run that rebuilds the site'),
  ('fpl-pipeline-1841', 'fpl-projections-pipeline', 'daily', '18:41', null, '{}', '{"41 18 * * *"}', null),
  ('fpl-pipeline-team-news', 'fpl-projections-pipeline', 'team_news', null, 0, '{}', '{"11 16 * * 5","11 12 * * 2,5"}',
   'Preview update after the press conferences (Chris, 21 Oct 2026)'),
  ('fpl-pipeline-pre-deadline', 'fpl-projections-pipeline', 'deadline', null, -120, '{}', '{}',
   'Last projections before every deadline (audit P-06: the 6 h guard)'),
  ('ffs-team-news-0720', 'ffs-team-news', 'daily', '07:20', null, '{}', '{"20 7 * * *"}', null),
  ('ffs-team-news-1720', 'ffs-team-news', 'daily', '17:20', null, '{}', '{"20 17 * * *"}', null),
  ('ffs-team-news-team-news', 'ffs-team-news', 'team_news', null, -25, '{}', '{}',
   'Predicted line-ups just before the post-press-conference projections'),
  ('ffs-team-news-pre-deadline', 'ffs-team-news', 'deadline', null, -150, '{}', '{}',
   'Line-ups before the last pre-deadline projections'),
  ('gameweek-report-2120', 'gameweek-report', 'daily', '21:20', null, '{"auto": true}', '{"20 21 * * *"}', 'Provisional reflection check'),
  ('gameweek-report-2220', 'gameweek-report', 'daily', '22:20', null, '{"auto": true}', '{"20 22 * * *"}', null),
  ('gameweek-report-2250', 'gameweek-report', 'daily', '22:50', null, '{"auto": true}', '{"50 22 * * *"}', null)
on conflict (slot_key) do nothing;

-- Slot occurrences due now (within the grace window), for the dispatcher.
create or replace function private.workflow_due_slots(p_now timestamptz default now())
returns table (slot_key text, workflow text, due_at timestamptz, inputs jsonb)
language sql stable
set search_path = ''
as $$
  with s as (select grace from private.workflow_dispatch_settings where id),
  gw as (
    select g.deadline_time
      from public.fpl_gameweeks g
     where g.season_id = public.fpl_current_season_id()
       and g.deadline_time between p_now - interval '1 day' and p_now + interval '3 days'
  ),
  cand as (
    select sl.slot_key, sl.workflow, sl.inputs,
           (v.d + sl.at_utc) at time zone 'UTC' as due_at, null::timestamptz as deadline
      from private.workflow_dispatch_slots sl
     cross join (values ((p_now at time zone 'UTC')::date), ((p_now at time zone 'UTC')::date - 1)) v(d)
     where sl.active and sl.kind = 'daily'
    union all
    select sl.slot_key, sl.workflow, sl.inputs,
           gw.deadline_time + make_interval(mins => sl.offset_minutes), gw.deadline_time
      from private.workflow_dispatch_slots sl cross join gw
     where sl.active and sl.kind = 'deadline'
    union all
    select sl.slot_key, sl.workflow, sl.inputs,
           (case when extract(hour from gw.deadline_time at time zone 'Europe/London') >= 17
                 then (gw.deadline_time at time zone 'Europe/London')::date + time '12:11'
                 else ((gw.deadline_time at time zone 'Europe/London')::date - 1) + time '16:11'
            end at time zone 'Europe/London') + make_interval(mins => coalesce(sl.offset_minutes, 0)),
           gw.deadline_time
      from private.workflow_dispatch_slots sl cross join gw
     where sl.active and sl.kind = 'team_news'
  )
  select c.slot_key, c.workflow, c.due_at, c.inputs
    from cand c cross join s
   where c.due_at <= p_now
     and c.due_at > p_now - s.grace
     and (c.deadline is null or c.due_at < c.deadline)
$$;

-- Every minute from pg_cron: record responses to earlier requests, then
-- dispatch whatever is due and not yet dispatched (up to max_attempts).
create or replace function private.dispatch_due_workflows()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set record;
  v_token text;
  v_due record;
  v_attempts int;
  v_req bigint;
  v_out jsonb := '[]'::jsonb;
begin
  update private.workflow_dispatches d
     set status_code = r.status_code,
         outcome = case when r.status_code between 200 and 299 then 'ok' else 'failed' end,
         detail = left(coalesce(r.error_msg, r.content), 300)
    from net._http_response r
   where d.outcome = 'pending' and r.id = d.request_id;
  update private.workflow_dispatches
     set outcome = 'failed', detail = coalesce(detail, 'no response within 10 minutes')
   where outcome = 'pending' and requested_at < now() - interval '10 minutes';

  select * into v_set from private.workflow_dispatch_settings where id;
  if not found or not v_set.enabled then
    return jsonb_build_object('enabled', false);
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'workflow_trigger_token';
  if v_token is null then
    raise exception 'workflow_trigger_token is missing from vault';
  end if;

  for v_due in select * from private.workflow_due_slots(now()) loop
    if exists (select 1 from private.workflow_dispatches w
                where w.slot_key = v_due.slot_key and w.due_at = v_due.due_at and w.outcome in ('ok', 'pending')) then
      continue;
    end if;
    select count(*) into v_attempts from private.workflow_dispatches w
     where w.slot_key = v_due.slot_key and w.due_at = v_due.due_at;
    if v_attempts >= v_set.max_attempts then
      continue;
    end if;
    v_req := net.http_post(
      url := v_set.endpoint,
      body := jsonb_build_object('workflow', v_due.workflow, 'inputs', v_due.inputs, 'slot', v_due.slot_key),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-workflow-token', v_token),
      timeout_milliseconds := 30000);
    insert into private.workflow_dispatches (slot_key, workflow, due_at, attempt, request_id)
    values (v_due.slot_key, v_due.workflow, v_due.due_at, v_attempts + 1, v_req);
    v_out := v_out || jsonb_build_object('slot', v_due.slot_key, 'due_at', v_due.due_at, 'attempt', v_attempts + 1);
  end loop;
  return jsonb_build_object('enabled', true, 'dispatched', v_out);
end;
$$;
revoke all on function private.dispatch_due_workflows() from public, anon, authenticated;
revoke all on function private.workflow_due_slots(timestamptz) from public, anon, authenticated;

-- Asked by the first job of a scheduled (cron) run: did pg_cron already
-- dispatch the slot this cron line stands for? A daily slot recurs every 24 h,
-- so an ok dispatch in the last 23 h is this occurrence's.
create or replace function public.workflow_slot_covered(p_workflow text, p_cron text)
returns boolean
language sql stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from private.workflow_dispatches d
      join private.workflow_dispatch_slots s on s.slot_key = d.slot_key
     where s.workflow = p_workflow
       and p_cron = any (s.github_crons)
       and d.outcome = 'ok'
       and d.due_at > now() - interval '23 hours'
       and d.due_at <= now())
$$;
revoke all on function public.workflow_slot_covered(text, text) from public, anon, authenticated;
grant execute on function public.workflow_slot_covered(text, text) to service_role;

-- What was dispatched: select * from private.workflow_dispatches order by dispatch_id desc;

-- The pg_cron job (every minute; cheap when nothing is due).
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'workflow-dispatcher') then
    perform cron.schedule('workflow-dispatcher', '* * * * *', 'select private.dispatch_due_workflows()');
  end if;
end $$;

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, active, outcome_is_check, notes)
values ('workflow-dispatcher', 'infrastructure', 'supabase_cron', '* * * * *', '00:10:00', '00:02:00', 'pg_cron', '^workflow-dispatcher$', true, false,
        'Dispatches deadline-critical GitHub workflows on time (private.workflow_dispatch_slots); audit P-01')
on conflict (job_key) do nothing;
