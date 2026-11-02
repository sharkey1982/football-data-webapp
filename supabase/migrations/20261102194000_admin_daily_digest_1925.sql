-- Admin daily site update: send at 19:25 Europe/London instead of 20:00
-- (Chris, 2 Nov 2026). pg_cron runs in UTC, so the tick runs at minute 25 of
-- 18:00 and 19:00 UTC and sends only when the London hour is 19 (right in
-- both GMT and BST); still one send per London date
-- (private.admin_digest_sends). The window stays 00:00 London to send time.
-- Safe to re-run: create or replace, cron.alter_job, guarded updates.

create or replace function private.admin_digest_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if extract(hour from now() at time zone 'Europe/London') <> 19 then
    return jsonb_build_object('status', 'not due');
  end if;
  return private.admin_digest_send((now() at time zone 'Europe/London')::date, 'scheduled');
end;
$$;
revoke all on function private.admin_digest_tick() from public, anon, authenticated;

do $$
declare v_id bigint;
begin
  select jobid into v_id from cron.job where jobname = 'admin-daily-digest-tick';
  if v_id is null then
    perform cron.schedule('admin-daily-digest-tick', '25 18,19 * * *', 'select private.admin_digest_tick()');
  else
    perform cron.alter_job(v_id, schedule := '25 18,19 * * *');
  end if;
end $$;

update public.job_registry
   set schedule = '25 18,19 * * *',
       notes = 'Minute 25 of 18:00 and 19:00 UTC: private.admin_digest_tick(); sends the admin end-of-day email only when the London hour is 19 (19:25 UK)'
 where job_key = 'admin-daily-digest-tick' and schedule is distinct from '25 18,19 * * *';

update public.job_registry
   set schedule = 'daily 19:25 Europe/London'
 where job_key = 'admin-daily-digest' and schedule is distinct from 'daily 19:25 Europe/London';
