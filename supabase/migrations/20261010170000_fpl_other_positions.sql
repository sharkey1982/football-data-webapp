-- FPL: players who play more than one position (10 Oct 2026).
--
-- Chris (Arsenal v Leeds team news: Madueke started on the left for Tzolis,
-- not Eze): "players can play multiple positions - especially fringe players.
-- We need a solution."
--
-- 1. team_player_other_positions: extra positions per player, each with his
--    rank there ("Also plays" on Starting Lineups; admins edit).
-- 2. get_fpl_depth_inputs returns them (other_roles) -- recreated, new column.
-- 3. fpl_depth_start_store.group_shares: where each player is expected to
--    start ({"LW": 0.31, "RW": 0.05}); the pitches stack him under each.
-- 4. fpl_replace_depth_start stores group_shares.
-- Clubs with no other positions entered are computed exactly as before; a
-- club with any is simulated (scripts/fpl_depth_chart.allocate_sim), which
-- matches the old numbers to within ~0.05 when nothing extra is entered.

create table public.team_player_other_positions (
  season_id bigint not null default public.fpl_current_season_id(),
  team_id bigint not null,
  fpl_player_id bigint not null,
  tactical_role text not null,
  depth_rank integer not null check (depth_rank between 1 and 5),
  set_at timestamptz not null default now(),
  primary key (season_id, team_id, fpl_player_id, tactical_role)
);
alter table public.team_player_other_positions enable row level security;
create policy team_player_other_positions_read on public.team_player_other_positions for select using (true);
create policy team_player_other_positions_admin_write on public.team_player_other_positions for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.team_player_other_positions to anon, authenticated;
grant insert, update, delete on public.team_player_other_positions to authenticated;
comment on table public.team_player_other_positions is 'Extra positions a player plays, with his rank in each (Starting Lineups "Also plays"). Read by get_fpl_depth_inputs: the depth chart lets him fill any of them, once.';

alter table public.fpl_depth_start_store add column if not exists group_shares jsonb;
comment on column public.fpl_depth_start_store.group_shares is 'Chance of starting in each place group, e.g. {"LW": 0.31, "RW": 0.05}; sums to start_probability.';

create or replace function public.fpl_replace_depth_start(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare n integer;
begin
  delete from public.fpl_depth_start_store where true;
  insert into public.fpl_depth_start_store (fixture_id, fpl_player_id, team_id, start_probability, depth_group, depth_rank, group_shares)
  select r.fixture_id, r.fpl_player_id, r.team_id, round(least(0.98, greatest(0, r.start_probability)), 4), r.depth_group, r.depth_rank, r.group_shares
    from jsonb_to_recordset(p_rows) as r(fixture_id bigint, fpl_player_id bigint, team_id bigint,
                                         start_probability numeric, depth_group text, depth_rank integer, group_shares jsonb);
  get diagnostics n = row_count;
  analyze public.fpl_depth_start_store;
  return n;
end $$;
revoke all on function public.fpl_replace_depth_start(jsonb) from public, anon, authenticated;
grant execute on function public.fpl_replace_depth_start(jsonb) to service_role;

drop function if exists public.get_fpl_depth_inputs();
create function public.get_fpl_depth_inputs()
 returns table(fixture_id bigint, team_id bigint, formation text, fpl_player_id bigint, element_type integer, tactical_role text, depth_rank integer, availability double precision, rate double precision, start_if_fit double precision, starts double precision, available double precision, other_roles jsonb)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select a.fixture_id::bigint, a.team_id::bigint, coalesce(c.formation, ''),
         d.fpl_player_id::bigint, p.element_type::integer, d.tactical_role, d.depth_rank::integer,
         a.availability::float8,
         case when p.element_type = 1 then null
              else least(0.97, (coalesce(sr.starts_recent, sr.starts, 0) + coalesce(sr.prior_rate, 0.20)) / (coalesce(sr.available_recent, sr.available_matches, 0) + 1.0)) end::float8,
         fc.start_if_fit::float8,
         case when p.element_type = 1 then null else coalesce(sr.starts_recent, sr.starts, 0) end::float8,
         case when p.element_type = 1 then null else coalesce(sr.available_recent, sr.available_matches, 0) end::float8,
         op.roles
    from public.fpl_fixture_availability_store a
    join public.team_player_tactical_defaults d
      on d.fpl_player_id = a.fpl_player_id and d.team_id = a.team_id and d.season_id = public.fpl_current_season_id()
    join public.fpl_players p on p.fpl_player_id = a.fpl_player_id and p.season_id = public.fpl_current_season_id()
    left join public.fixture_team_tactical_consensus c on c.fixture_id = a.fixture_id and c.team_id = a.team_id
    left join public.fpl_player_start_record sr on sr.fpl_player_id = a.fpl_player_id
    left join lateral (
      select x.start_if_fit from public.fpl_player_first_choice x
       where x.fpl_player_id = a.fpl_player_id and x.removed_at is null
         and a.kickoff_date between x.effective_from and coalesce(x.effective_to, '9999-12-31'::date)
       order by x.set_at desc limit 1) fc on true
    left join lateral (
      select jsonb_agg(jsonb_build_object('role', o.tactical_role, 'rank', o.depth_rank) order by o.depth_rank) roles
        from public.team_player_other_positions o
       where o.season_id = d.season_id and o.team_id = d.team_id and o.fpl_player_id = d.fpl_player_id) op on true;
$function$;
revoke all on function public.get_fpl_depth_inputs() from public, anon, authenticated;
grant execute on function public.get_fpl_depth_inputs() to service_role;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
values ('2026-10-10', 'prediction',
  'FPL: players can be listed in more than one position',
  'Each player had one role in the pecking order, so a backup could only cover another position after its own backups (Madueke started at LW for Tzolis; the model had Eze).',
  'team_player_other_positions (Starting Lineups "Also plays", with a rank in each). Clubs with any are simulated (each player fills at most one place); others unchanged. fpl_depth_start_store.group_shares gives the chance by position for the pitches. Depth-chart formation templates added: 3-4-2-1, 4-3-3, 4-4-2, 4-4-1-1, 4-1-4-1, 3-5-2, 5-3-2, 5-4-1.',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261010170000');

select public.meta_refresh_flow();
update public.meta_flow_nodes set layer = 'model', status = 'current', is_public = true, ai_relevant = false,
  purpose = 'Extra positions players play, with a rank in each (Starting Lineups "Also plays"); the depth chart lets a player fill any of them.',
  refresh_note = 'Edited by admins on Starting Lineups.', purpose_reviewed_at = now()
where node_key = 'object:team_player_other_positions';
