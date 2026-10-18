-- ============================================================================
-- Performance, round 2 (18 Oct 2026), from the first production smoke run.
--
-- 1. get_all_time_top_scorers (Football hub): 1.0 s, joining teams to every
--    match on "team_id in (home, away)". Now home and away goals summed per
--    team first (index-only scans of matches_teams_idx): ~0.19 s. Same
--    grouping (by display name) and order; compared with the old definition.
-- 2. smoke_page_results gains what the attribution pass records: API payload
--    total and the three largest responses, the LCP element and the elements
--    that moved (layout shift).
-- ============================================================================

alter table public.smoke_page_results
  add column if not exists api_kb int,
  add column if not exists largest_api jsonb,
  add column if not exists lcp_element text,
  add column if not exists cls_sources jsonb;

create or replace view public.smoke_latest as
select r.smoke_run_id, r.started_at, r.kind, r.base_url, p.page_type, p.url, p.ok, p.errors, p.warnings,
       p.ttfb_ms, p.fcp_ms, p.lcp_ms, p.cls, p.tbt_ms, p.js_kb, p.requests, p.slowest_api_ms, p.slowest_api_url,
       p.api_kb, p.largest_api, p.lcp_element, p.cls_sources
from (select * from public.smoke_runs where kind = 'production' order by started_at desc limit 1) r
join public.smoke_page_results p using (smoke_run_id);
revoke all on public.smoke_latest from anon, authenticated;
grant select on public.smoke_latest to service_role;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.get_all_time_top_scorers()'::regprocedure);
  execute replace(d, 'public.get_all_time_top_scorers(', 'public.zz_old_top_scorers(');
end $$;

create or replace function public.get_all_time_top_scorers()
returns table(display_name text, goals bigint, seasons_covered bigint)
language sql stable set search_path = public, pg_temp as $$
  with g as (
    select home_team_id as team_id, full_time_home_goals as goals from public.matches
    union all
    select away_team_id, full_time_away_goals from public.matches
  ), per_team as (
    select team_id, sum(goals) as goals from g group by team_id
  )
  select t.display_name, sum(p.goals)::bigint,
    (select count(distinct season_id) from public.matches)::bigint
  from per_team p
  join public.teams t on t.team_id = p.team_id
  group by t.display_name
  order by 2 desc
  limit 4;
$$;

do $$
declare n bigint;
begin
  select count(*) into n from (
    (select * from public.get_all_time_top_scorers() except all select * from public.zz_old_top_scorers())
    union all
    (select * from public.zz_old_top_scorers() except all select * from public.get_all_time_top_scorers())) x;
  if n <> 0 then raise exception 'top scorers differ: % rows', n; end if;
end $$;
drop function public.zz_old_top_scorers();
