-- FPL: compare our starting line-ups with Fantasy Football Scout's
-- (10 Oct 2026, admin only).
--
-- Chris: "in the admin section I think there needs to be a comparison of
-- fixture shark starting lineup projections and fantasy football scout - as
-- this is one of the most popular resources ... I want to easily compare and
-- scrutinise differences."
--
-- FFS is a subscription site, so its line-ups are not fetched: an admin
-- pastes (or photographs) them on /admin/lineup-compare and they are stored
-- here, admin-readable only. They are NOT an input to the projections --
-- this is for scrutiny; feeding them in would be a separate decision.
--
-- 1. fpl_external_lineups: one row per predicted starter (source, GW, club).
-- 2. fpl_save_external_lineup / fpl_clear_external_lineup (admin).
-- 3. get_fpl_lineup_comparison(gw) (admin): every squad player of every
--    club playing that gameweek, with our start chance and expected minutes
--    and whether FFS has him starting.

create table public.fpl_external_lineups (
  external_lineup_id bigserial primary key,
  source text not null default 'fantasy_football_scout' check (source in ('fantasy_football_scout')),
  season_id bigint not null default public.fpl_current_season_id(),
  fpl_event_id integer not null,
  team_id bigint not null,
  fpl_player_id bigint not null,
  entered_by uuid default auth.uid(),
  entered_at timestamptz not null default now(),
  unique (source, season_id, fpl_event_id, team_id, fpl_player_id)
);
alter table public.fpl_external_lineups enable row level security;
create policy fpl_external_lineups_admin_read on public.fpl_external_lineups for select to authenticated using (public.is_admin());
grant select on public.fpl_external_lineups to authenticated;
comment on table public.fpl_external_lineups is 'Predicted starters from other sources (Fantasy Football Scout), entered by an admin on /admin/lineup-compare for comparison with our projections. Admin-only; not a projection input.';

create or replace function public.fpl_save_external_lineup(p_source text, p_event integer, p_team_id bigint, p_players bigint[])
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_season bigint := public.fpl_current_season_id(); v_bad integer; v_n integer;
begin
  perform public._require_admin();
  if coalesce(array_length(p_players, 1), 0) = 0 or array_length(p_players, 1) > 11 then
    raise exception 'a line-up needs 1 to 11 players';
  end if;
  select count(*) into v_bad from unnest(p_players) x(id)
   where not exists (select 1 from public.fpl_players p where p.fpl_player_id = x.id and p.season_id = v_season and p.canonical_team_id = p_team_id);
  if v_bad > 0 then raise exception '% player(s) are not in this club''s squad', v_bad; end if;
  delete from public.fpl_external_lineups
   where source = p_source and season_id = v_season and fpl_event_id = p_event and team_id = p_team_id;
  insert into public.fpl_external_lineups (source, season_id, fpl_event_id, team_id, fpl_player_id)
  select p_source, v_season, p_event, p_team_id, x.id from (select distinct unnest(p_players) id) x;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.fpl_save_external_lineup(text, integer, bigint, bigint[]) from public, anon;
grant execute on function public.fpl_save_external_lineup(text, integer, bigint, bigint[]) to authenticated;

create or replace function public.fpl_clear_external_lineup(p_source text, p_event integer, p_team_id bigint)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  perform public._require_admin();
  delete from public.fpl_external_lineups
   where source = p_source and season_id = public.fpl_current_season_id() and fpl_event_id = p_event and team_id = p_team_id;
end $$;
revoke all on function public.fpl_clear_external_lineup(text, integer, bigint) from public, anon;
grant execute on function public.fpl_clear_external_lineup(text, integer, bigint) to authenticated;

create or replace function public.get_fpl_lineup_comparison(p_event integer, p_source text default 'fantasy_football_scout')
returns table(team_id bigint, team_name text, fpl_player_id bigint, web_name text, element_type integer, tactical_role text,
              depth_rank integer, status text, news text, start_probability numeric, expected_minutes numeric,
              source_start boolean, source_entered_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
#variable_conflict use_column
begin
  perform public._require_admin();
  return query
  with v as (select public.fpl_current_season_id() s),
  ours as (
    select f.team_id, f.fpl_player_id, max(f.start_probability) sp, max(f.expected_minutes) em
      from public.fpl_projection_frontend_feed_v6 f
      join public.fixtures fx on fx.fixture_id = f.fixture_id
      join public.fpl_fixtures ff on ff.canonical_fixture_id = f.fixture_id and ff.season_id = fx.season_id
     where ff.fpl_event_id = p_event
     group by f.team_id, f.fpl_player_id
  ), ext as (
    select e.team_id, e.fpl_player_id, e.entered_at
      from public.fpl_external_lineups e, v
     where e.source = p_source and e.season_id = v.s and e.fpl_event_id = p_event
  ), entered as (select ext.team_id, max(ext.entered_at) as last_at from ext group by ext.team_id)
  select o.team_id::bigint, t.display_name::text, o.fpl_player_id::bigint, p.web_name::text, p.element_type::integer,
         d.tactical_role::text, d.depth_rank::integer, p.status::text, nullif(p.news, '')::text,
         round(o.sp, 3), round(o.em, 1),
         case when en.team_id is null then null else (x.fpl_player_id is not null) end,
         en.last_at
    from ours o
    join v on true
    join public.fpl_players p on p.fpl_player_id = o.fpl_player_id and p.season_id = v.s
    join public.teams t on t.team_id = o.team_id
    left join public.team_player_tactical_defaults d on d.fpl_player_id = o.fpl_player_id and d.team_id = o.team_id and d.season_id = v.s
    left join ext x on x.team_id = o.team_id and x.fpl_player_id = o.fpl_player_id
    left join entered en on en.team_id = o.team_id;
end $$;
revoke all on function public.get_fpl_lineup_comparison(integer, text) from public, anon;
grant execute on function public.get_fpl_lineup_comparison(integer, text) to authenticated;

select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'source', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Fantasy Football Scout predicted starters, pasted in by an admin, for comparison with our projections on /admin/lineup-compare. Not a projection input.',
  refresh_note = 'Entered by hand each gameweek on /admin/lineup-compare.', purpose_reviewed_at = now()
where node_key = 'object:fpl_external_lineups';
