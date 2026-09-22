-- ============================================================================
-- The model's XI v the week's best XI for every finished gameweek, WITH the
-- provenance that decides what each row means:
--
--   players_projected          how much of the league the XI was chosen from
--                              (a 64-player week is a fragment, not a pick)
--   generated_before_deadline  whether the projections pre-date the FPL
--                              deadline. If not, the XI is a RETROSPECTIVE
--                              fit -- assembled knowing how the week went.
--
-- Weeks with no projections return NO ROW, so a page can never render them as
-- "0 points against a projection of 0", which is what the Team of the Week
-- panel did for gameweeks 1-3.
--
-- Two traps found while building this:
--   * fixtures holds EVERY competition (matchweek 1 has 135 rows across
--     leagues and Europe), so the league filter is essential;
--   * "every fixture played" is not the same as "the gameweek is done" --
--     gameweek 5 is finished and scored while two fixture rows still read
--     'scheduled', so FPL's own finished/data_checked flags are used instead.
-- ============================================================================
drop function if exists public.get_model_xi_history(bigint, bigint);
drop function if exists public.get_model_xi_history(bigint);

create function public.get_model_xi_history(p_season_id bigint default 13, p_league_id bigint default 1)
returns table(
  fpl_event_id integer,
  actual_xi_points integer,
  model_xi_actual_points integer,
  model_xi_projected numeric,
  overlap_count integer,
  players_projected integer,
  generated_before_deadline boolean,
  deadline_time timestamptz
)
language sql stable set search_path to 'public','pg_temp'
as $$
  with weeks as (
    select gw.fpl_event_id as e, gw.deadline_time
    from public.fpl_gameweeks gw
    where gw.season_id = p_season_id and gw.finished and gw.data_checked
  ),
  cover as (
    select f.matchweek as e,
           count(distinct pr.fpl_player_id)::int as players_projected,
           min(pr.generated_at) as first_generated
    from public.fpl_player_projections pr
    join public.fixtures f on f.fixture_id = pr.fixture_id
    where f.season_id = p_season_id and f.league_id = p_league_id
      and pr.model_version = 'leaguewide_v6' and pr.scenario_key = 'baseline'
    group by f.matchweek
  )
  select w.e::integer, t.actual_xi_points, t.model_xi_actual_points, t.model_xi_projected,
         t.overlap_count, c.players_projected,
         (c.first_generated < w.deadline_time) as generated_before_deadline,
         w.deadline_time
  from weeks w
  join cover c on c.e = w.e
  cross join lateral public.get_totw_vs_model(w.e::int, p_season_id) t
  where c.players_projected > 0
  order by w.e;
$$;
comment on function public.get_model_xi_history(bigint, bigint) is
  'The model''s XI v the week''s best XI for each finished gameweek, with projection coverage and whether the projections pre-date the FPL deadline.';
grant execute on function public.get_model_xi_history(bigint, bigint) to anon, authenticated;
