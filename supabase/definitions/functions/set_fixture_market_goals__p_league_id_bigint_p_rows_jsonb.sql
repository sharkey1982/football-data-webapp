-- Live definition exported from the database (function set_fixture_market_goals(p_league_id bigint, p_rows jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.set_fixture_market_goals(p_league_id bigint, p_rows jsonb)
 RETURNS integer
 LANGUAGE sql
 SET search_path TO 'public'
AS $function$
  with x as (
    select f.fixture_id, r.home, r.away
    from public.fixtures f
    left join jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as r(fixture_id bigint, home double precision, away double precision)
      on r.fixture_id = f.fixture_id
    where f.league_id = p_league_id and f.status = 'scheduled'
  ), u as (
    update public.fixtures f
    set market_home_goals = x.home, market_away_goals = x.away,
        market_rated_at = case when x.home is null then null else now() end
    from x where f.fixture_id = x.fixture_id
    returning (x.home is not null) as rated
  )
  select count(*) filter (where rated)::int from u
$function$
;
