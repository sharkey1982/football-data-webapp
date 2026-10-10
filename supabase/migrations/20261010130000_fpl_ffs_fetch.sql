-- Fantasy Football Scout line-ups fetched automatically (10 Oct 2026).
-- Chris: the team-news page is public; the comparison should fill itself.
-- scripts/ffs_team_news.py (workflow ffs-team-news, twice daily and on
-- demand) reads it and saves each club's predicted XI to
-- fpl_external_lineups; each club's read is logged here so the admin page
-- can show when it was fetched and any names it couldn't match.

create table public.fpl_external_lineup_runs (
  run_row_id bigserial primary key,
  source text not null,
  season_id bigint not null,
  fpl_event_id integer not null,
  team_id bigint not null,
  fetched_at timestamptz not null default now(),
  names_read integer not null,
  matched integer not null,
  unmatched text[] not null default '{}',
  saved boolean not null,
  source_updated text
);
create index fpl_external_lineup_runs_lookup on public.fpl_external_lineup_runs (source, season_id, fpl_event_id, team_id, fetched_at desc);
alter table public.fpl_external_lineup_runs enable row level security;
create policy fpl_external_lineup_runs_admin_read on public.fpl_external_lineup_runs for select to authenticated using (public.is_admin());
grant select on public.fpl_external_lineup_runs to authenticated;
comment on table public.fpl_external_lineup_runs is 'One row per club per automatic read of Fantasy Football Scout''s team-news page (scripts/ffs_team_news.py): names read, matched, unmatched, whether saved. Admin-only.';

create or replace function public.get_fpl_external_lineup_runs(p_event integer, p_source text default 'fantasy_football_scout')
returns table(team_id bigint, fetched_at timestamptz, names_read integer, matched integer, unmatched text[], saved boolean, source_updated text)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  select distinct on (r.team_id) r.team_id, r.fetched_at, r.names_read, r.matched, r.unmatched, r.saved, r.source_updated
    from public.fpl_external_lineup_runs r
   where r.source = p_source and r.season_id = public.fpl_current_season_id() and r.fpl_event_id = p_event
   order by r.team_id, r.fetched_at desc;
end $$;
revoke all on function public.get_fpl_external_lineup_runs(integer, text) from public, anon;
grant execute on function public.get_fpl_external_lineup_runs(integer, text) to authenticated;

select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'source', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Fantasy Football Scout predicted starters for /admin/lineup-compare: read from their public team-news page twice daily (or pasted by an admin). Not a projection input.',
  refresh_note = 'scripts/ffs_team_news.py, workflow ffs-team-news (07:20 and 17:20 UTC); also pasted on /admin/lineup-compare.', purpose_reviewed_at = now()
where node_key = 'object:fpl_external_lineups';
