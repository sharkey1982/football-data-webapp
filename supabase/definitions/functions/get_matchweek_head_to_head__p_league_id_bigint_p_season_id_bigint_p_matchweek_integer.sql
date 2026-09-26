-- Live definition exported from the database (function get_matchweek_head_to_head(p_league_id bigint, p_season_id bigint, p_matchweek integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_matchweek_head_to_head(p_league_id bigint, p_season_id bigint, p_matchweek integer DEFAULT NULL::integer)
 RETURNS TABLE(fixture_id bigint, meetings bigint, home_wins bigint, draws bigint, away_wins bigint, last_meeting_date date, last_home_goals integer, last_away_goals integer, last_home_was_fixture_home boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with fx as (
    select f.fixture_id, f.home_team_id as fx_home, f.away_team_id as fx_away
    from public.fixtures f
    where f.league_id = p_league_id
      and f.season_id = p_season_id
      and (p_matchweek is null or f.matchweek = p_matchweek)
  ),
  met as (
    select fx.fixture_id, fx.fx_home, fx.fx_away,
      m.home_team_id as m_home, m.full_time_result as res,
      m.match_date, m.full_time_home_goals as hg, m.full_time_away_goals as ag
    from fx
    join public.matches m
      on (m.home_team_id = fx.fx_home and m.away_team_id = fx.fx_away)
      or (m.home_team_id = fx.fx_away and m.away_team_id = fx.fx_home)
    where m.full_time_result is not null
  ),
  agg as (
    select fixture_id,
      count(*)::bigint as meetings,
      count(*) filter (where (m_home = fx_home and res = 'H') or (m_home = fx_away and res = 'A'))::bigint as home_wins,
      count(*) filter (where res = 'D')::bigint as draws,
      count(*) filter (where (m_home = fx_away and res = 'H') or (m_home = fx_home and res = 'A'))::bigint as away_wins
    from met group by fixture_id
  ),
  latest as (
    select distinct on (fixture_id) fixture_id, match_date, hg, ag, (m_home = fx_home) as home_was_home
    from met order by fixture_id, match_date desc
  )
  select a.fixture_id, a.meetings, a.home_wins, a.draws, a.away_wins,
         l.match_date, l.hg, l.ag, l.home_was_home
  from agg a left join latest l on l.fixture_id = a.fixture_id;
$function$
;
