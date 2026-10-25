-- /fpl/fixtures (Chris, 25 Oct 2026: approved mock-up "FPL fixtures, with the
-- midweek games"). One read for the page: the Premier League fixtures by FPL
-- gameweek with each side's expected goals (betting market where we have it,
-- else the model), the League Cup, FA Cup and European games of Premier
-- League sides, the clubs with their most-owned FPL players, and who played in
-- recent cup games (cup_lineup_players: narrative only). From two weeks ago
-- (for rest days) to about 100 days ahead.
create or replace function public.get_fpl_fixtures_grid()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with s as (select public.fpl_current_season_id() season_id),
  t as (
    select ft.fpl_team_id, ft.canonical_team_id team_id, ft.short_name short, ft.name
      from public.fpl_teams ft cross join s where ft.season_id = s.season_id),
  pl as (
    select ff.fpl_event_id gw, ff.kickoff_time ko, ff.fpl_home_team_id h, ff.fpl_away_team_id a,
           round(coalesce(f.market_home_goals, f.predicted_home_goals)::numeric, 2) hxg,
           round(coalesce(f.market_away_goals, f.predicted_away_goals)::numeric, 2) axg,
           coalesce(ff.finished, false) finished, ff.team_h_score hs, ff.team_a_score ascore
      from public.fpl_fixtures ff cross join s
      left join public.fixtures f on f.fixture_id = ff.canonical_fixture_id
     where ff.season_id = s.season_id
       and (ff.kickoff_time is null or ff.kickoff_time between now() - interval '14 days' and now() + interval '100 days')),
  cups as (
    select f.fixture_id, f.league_id, f.kickoff_date d, f.kickoff_time tm, f.home_team_id, f.away_team_id,
           th.display_name home_name, ta.display_name away_name
      from public.fixtures f
      join public.teams th on th.team_id = f.home_team_id join public.teams ta on ta.team_id = f.away_team_id
     where f.league_id in (6, 7, 9, 10, 11) and coalesce(f.status, '') <> 'postponed'
       and f.kickoff_date between current_date - 14 and current_date + 100
       and (f.home_team_id in (select team_id from t) or f.away_team_id in (select team_id from t))),
  owned as (
    select p.fpl_team_id,
           jsonb_agg(jsonb_build_object('name', p.web_name, 'own', p.selected_by_percent) order by p.selected_by_percent desc) players
      from (select x.*, row_number() over (partition by x.fpl_team_id order by x.selected_by_percent desc nulls last) rn
              from public.fpl_players x cross join s where x.season_id = s.season_id) p
     where p.rn <= 3 group by p.fpl_team_id),
  lu as (
    select c.fixture_id, c.team_id, c.player_name, c.fpl_player_id, c.started, c.on_minute, c.off_minute,
           p.selected_by_percent own
      from public.cup_lineup_players c
      join public.fixtures f on f.fixture_id = c.fixture_id
      left join public.fpl_players p on p.season_id = (select season_id from s) and p.fpl_player_id = c.fpl_player_id
     where f.kickoff_date between current_date - 14 and current_date)
  select jsonb_build_object(
    'today', current_date,
    'gameweeks', (select coalesce(jsonb_agg(jsonb_build_object('gw', g.fpl_event_id, 'deadline', g.deadline_time,
                                                               'finished', coalesce(g.finished, false)) order by g.fpl_event_id), '[]')
                    from public.fpl_gameweeks g cross join s where g.season_id = s.season_id),
    'teams', (select coalesce(jsonb_agg(jsonb_build_object('fpl_team_id', t.fpl_team_id, 'team_id', t.team_id, 'short', t.short,
                                                           'name', t.name, 'owned', coalesce(o.players, '[]')) order by t.name), '[]')
                from t left join owned o on o.fpl_team_id = t.fpl_team_id),
    'pl', (select coalesce(jsonb_agg(to_jsonb(pl) order by pl.ko nulls last), '[]') from pl),
    'cups', (select coalesce(jsonb_agg(to_jsonb(cups) order by cups.d, cups.tm), '[]') from cups),
    'lineups', (select coalesce(jsonb_agg(to_jsonb(lu)), '[]') from lu));
$$;
revoke all on function public.get_fpl_fixtures_grid() from public;
grant execute on function public.get_fpl_fixtures_grid() to anon, authenticated, service_role;
