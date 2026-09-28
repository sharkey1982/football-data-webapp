-- One-off analyses (not registered experiments): results written by
-- scripts in the Model Lab workflow, read back for write-ups. Private.
create table public.analysis_results (
  analysis_id text not null,
  created_at timestamptz not null default now(),
  code_ref text,
  result jsonb not null,
  primary key (analysis_id, created_at)
);
alter table public.analysis_results enable row level security;
revoke all on public.analysis_results from anon, authenticated;
grant select, insert on public.analysis_results to service_role;
comment on table public.analysis_results is 'One-off analysis outputs (e.g. squad_variance_gw, set_and_forget_2025) written by Model Lab workflow scripts. Not experiments: nothing here changes the site. Private.';
select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'One-off analysis outputs written by Model Lab workflow scripts (e.g. squad variance for a gameweek, set-and-forget squads for a season). Nothing on the site reads it.',
  refresh_note = 'Written by scripts/analysis_*.py on demand.', purpose_reviewed_at = now()
where node_key = 'object:analysis_results';
