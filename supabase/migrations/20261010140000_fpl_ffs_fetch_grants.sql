-- The FFS fetch (scripts/ffs_team_news.py, service role) needs to write its
-- tables; new tables only get service-role read by default. First run on
-- 10 Oct failed with "permission denied for table fpl_external_lineups".
grant select, insert, delete on public.fpl_external_lineups to service_role;
grant select, insert on public.fpl_external_lineup_runs to service_role;
grant usage, select on sequence public.fpl_external_lineups_external_lineup_id_seq to service_role;
grant usage, select on sequence public.fpl_external_lineup_runs_run_row_id_seq to service_role;
