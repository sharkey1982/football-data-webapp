-- Live definition exported from the database (function get_fpl_depth_inputs()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_depth_inputs()
 RETURNS TABLE(fixture_id bigint, team_id bigint, formation text, fpl_player_id bigint, element_type integer, tactical_role text, depth_rank integer, availability double precision, rate double precision, start_if_fit double precision, starts double precision, available double precision, other_roles jsonb, role_source text, rank_source text, starts_last double precision, avail_last double precision)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$
;
