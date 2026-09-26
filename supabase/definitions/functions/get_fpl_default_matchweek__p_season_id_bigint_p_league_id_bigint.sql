-- Live definition exported from the database (function get_fpl_default_matchweek(p_season_id bigint, p_league_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_fpl_default_matchweek(p_season_id bigint, p_league_id bigint)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with next_scheduled as (
    select min(f.matchweek) as mw
    from public.fixtures f
    where f.season_id = p_season_id and f.league_id = p_league_id and f.status = 'scheduled'
  ),
  covered as (
    select distinct f.matchweek
    from public.fpl_player_projections pr
    join public.fixtures f on f.fixture_id = pr.fixture_id
    where pr.model_version = 'leaguewide_v6' and f.season_id = p_season_id and f.league_id = p_league_id
  )
  select coalesce(
    -- exact match: next scheduled week has data
    (select mw from next_scheduled where mw in (select matchweek from covered)),
    -- next scheduled has no data yet: nearest covered week at or after it
    (select min(matchweek) from covered, next_scheduled where covered.matchweek >= next_scheduled.mw),
    -- next scheduled is beyond ALL covered weeks: nearest covered week before it (closest available)
    (select max(matchweek) from covered),
    -- no coverage at all: fall back to next scheduled itself, or week 1
    (select mw from next_scheduled),
    1
  );
$function$
;
