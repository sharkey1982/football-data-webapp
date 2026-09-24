-- Powers the new TV Guide page: every upcoming fixture with a confirmed
-- UK broadcast, joined once so the frontend doesn't need a nested select.
-- Same "no row = not yet determined" rule as everywhere else this table
-- is read -- this view only ever returns confirmed_broadcast rows, never
-- confirmed_not_televised (that state has nothing useful to show on a
-- "what's on TV" page) or fixtures with no broadcast row at all.
create or replace view public.upcoming_broadcast_fixtures as
select
  fb.broadcast_id,
  fb.market,
  fb.broadcaster,
  fb.channel,
  fb.streaming_service,
  fb.is_free_to_air,
  fb.is_subscription,
  fb.is_ppv,
  fb.watch_url,
  f.fixture_id,
  f.slug,
  f.kickoff_date,
  f.kickoff_time,
  f.league_id,
  l.code as league_code,
  l.name as league_name,
  co.name as country_name,
  ht.team_id as home_team_id,
  ht.display_name as home_team_name,
  at.team_id as away_team_id,
  at.display_name as away_team_name
from public.fixture_broadcasts fb
join public.fixtures f on f.fixture_id = fb.fixture_id
join public.leagues l on l.league_id = f.league_id
join public.countries co on co.country_id = l.country_id
join public.teams ht on ht.team_id = f.home_team_id
join public.teams at on at.team_id = f.away_team_id
where fb.status = 'confirmed_broadcast'
  and f.kickoff_date >= current_date
order by f.kickoff_date, f.kickoff_time;

grant select on public.upcoming_broadcast_fixtures to anon, authenticated, service_role;
