-- ============================================================================
-- Depth chart inputs for experiment D1, and the admin review list of
-- implausible start chances (25 Oct 2026; scripts/fpl_depth_chart.py D1).
--
--   * fpl_player_start_record: starts_last5 / available_last5 -- starts
--     while available and matches available over his last 5 team matches.
--   * get_fpl_depth_inputs(): + role_source, rank_source, starts_last,
--     avail_last (the D1 rules need them).
--   * fpl_start_flags: every player the plausibility rule flags at each
--     projections refresh (start chance >= 0.60 but <= 1 start in his last 5
--     matches while available, not a hand-set first choice), capped or not.
--     Stored by fpl_replace_start_flags(); shown on /fpl/tactical-roles so
--     roles can be fixed before the deadline. Until D1 is adopted nothing
--     is capped: the list only reports.
-- ============================================================================

alter table public.fpl_player_start_record add column if not exists starts_last5 integer;
alter table public.fpl_player_start_record add column if not exists available_last5 integer;

create or replace function pg_temp.patch_fn(p_sig text, p_old text, p_new text) returns void language plpgsql as $f$
declare d text; n integer;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_new in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, p_old, ''))) / length(p_old);
  if n <> 1 then raise exception 'patch_fn: % anchor found % times: %', p_sig, n, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end;
$f$;

select pg_temp.patch_fn('public.refresh_fpl_start_record()',
  $o$prior_rate, starts_recent, available_recent)$o$,
  $n$prior_rate, starts_recent, available_recent, starts_last5, available_last5)$n$);
select pg_temp.patch_fn('public.refresh_fpl_start_record()',
  $o$power(0.5, (row_number() over (partition by g.fpl_player_id order by g.kickoff_time desc) - 1) / 3.0) as w$o$,
  $n$power(0.5, (row_number() over (partition by g.fpl_player_id order by g.kickoff_time desc) - 1) / 3.0) as w,
      row_number() over (partition by g.fpl_player_id order by g.kickoff_time desc) as rn$n$);
select pg_temp.patch_fn('public.refresh_fpl_start_record()',
  $o$round(coalesce(sum(ga.w) filter (where ga.avail), 0), 4)
    from ga$o$,
  $n$round(coalesce(sum(ga.w) filter (where ga.avail), 0), 4),
         (count(*) filter (where ga.rn <= 5 and ga.avail and ga.st > 0))::int, (count(*) filter (where ga.rn <= 5 and ga.avail))::int
    from ga$n$);

select public.refresh_fpl_start_record();

-- The inputs, with the four D1 columns (return type changes: drop and recreate).
drop function if exists public.get_fpl_depth_inputs();
create function public.get_fpl_depth_inputs()
 returns table(fixture_id bigint, team_id bigint, formation text, fpl_player_id bigint, element_type integer, tactical_role text,
               depth_rank integer, availability double precision, rate double precision, start_if_fit double precision,
               starts double precision, available double precision, other_roles jsonb,
               role_source text, rank_source text, starts_last double precision, avail_last double precision)
 language sql stable
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
         op.roles,
         d.source_name, d.depth_rank_source,
         case when p.element_type = 1 then null else sr.starts_last5 end::float8,
         case when p.element_type = 1 then null else sr.available_last5 end::float8
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

-- The review list.
create table if not exists public.fpl_start_flags (
  fixture_id bigint not null,
  team_id bigint not null,
  fpl_player_id integer not null,
  raw_probability numeric not null,
  probability numeric not null,
  capped boolean not null default false,
  starts_last numeric,
  avail_last numeric,
  depth_rank integer,
  tactical_role text,
  role_source text,
  refreshed_at timestamptz not null default now(),
  primary key (fixture_id, fpl_player_id)
);
alter table public.fpl_start_flags enable row level security;
drop policy if exists fpl_start_flags_admin_read on public.fpl_start_flags;
create policy fpl_start_flags_admin_read on public.fpl_start_flags for select to authenticated using (public.is_admin());
grant select on public.fpl_start_flags to authenticated;
grant select, insert, update, delete on public.fpl_start_flags to service_role;

create or replace function public.fpl_replace_start_flags(p_rows jsonb)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare n integer;
begin
  delete from public.fpl_start_flags;
  insert into public.fpl_start_flags (fixture_id, team_id, fpl_player_id, raw_probability, probability, capped,
                                      starts_last, avail_last, depth_rank, tactical_role, role_source)
  select (r->>'fixture_id')::bigint, (r->>'team_id')::bigint, (r->>'fpl_player_id')::int,
         (r->>'raw_probability')::numeric, (r->>'probability')::numeric, coalesce((r->>'capped')::boolean, false),
         (r->>'starts_last')::numeric, (r->>'avail_last')::numeric, (r->>'depth_rank')::int, r->>'role', r->>'role_source'
    from jsonb_array_elements(coalesce(p_rows, '[]')) r
  on conflict (fixture_id, fpl_player_id) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.fpl_replace_start_flags(jsonb) from public, anon, authenticated;
grant execute on function public.fpl_replace_start_flags(jsonb) to service_role;

-- For the admin page: upcoming fixtures only, with names.
create or replace view public.fpl_start_flags_review with (security_invoker = true) as
select f.fixture_id, fx.kickoff_date, fx.matchweek, f.team_id, ft.name as team, f.fpl_player_id, p.web_name,
       f.raw_probability, f.probability, f.capped, f.starts_last, f.avail_last, f.depth_rank, f.tactical_role, f.role_source, f.refreshed_at
  from public.fpl_start_flags f
  join public.fixtures fx on fx.fixture_id = f.fixture_id
  join public.fpl_players p on p.season_id = public.fpl_current_season_id() and p.fpl_player_id = f.fpl_player_id
  left join public.fpl_teams ft on ft.season_id = public.fpl_current_season_id() and ft.canonical_team_id = f.team_id
 where fx.kickoff_date >= (now() at time zone 'Europe/London')::date;
grant select on public.fpl_start_flags_review to authenticated;
