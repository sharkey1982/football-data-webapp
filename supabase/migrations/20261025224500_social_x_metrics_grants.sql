-- x-metrics writes social_metrics_runs / social_post_metrics with the service
-- role; this project gives new tables no default service-role privileges, so
-- the first run (20261025223000) failed with "permission denied for table
-- social_metrics_runs". Grant them, then read once more. Safe to re-run.
grant select, insert, update on public.social_metrics_runs to service_role;
grant select, insert on public.social_post_metrics to service_role;
grant usage, select on sequence public.social_metrics_runs_run_id_seq, public.social_post_metrics_metric_id_seq to service_role;
grant select on public.social_post_candidates to service_role;

select private.social_metrics_call();
