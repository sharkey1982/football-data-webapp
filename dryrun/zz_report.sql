\pset format unaligned
\pset tuples_only on
select 'CHK ' || a || ' ' || c.check_name || '=' || c.status || ' ' || c.found || ' ' || left(c.detail, 220)
from (select 'football' a, * from public.check_model_integrity()
      union all select 'tennis', * from public.check_tennis_integrity()
      union all select 'nfl', * from public.check_nfl_integrity()
      union all select 'jobs', * from public.check_job_health()) c where c.status <> 'ok' or c.check_name like 'tennis%';
select 'JOB ' || job_key || ' ' || health_status || ' last_success=' || coalesce(to_char(last_success,'MM-DD HH24:MI'),'-') from public.job_health where health_status not in ('success','success_changed','success_no_change','running') order by 1;
select 'BRD ' || category || ' ' || n from (select category, count(*) n from public.broadcast_unmatched_classified group by category) x;
select 'RDY ' || readiness_status || ' ' || n from (select readiness_status, count(*) n from public.fpl_projection_fixture_readiness group by 1) x;
select 'FIX ' || fixture_id || ' ' || status || ' fit ' || coalesce(prediction_fit_run_id::text,'-') from public.fixtures where fixture_id in (1123,4536,6186,1296);
