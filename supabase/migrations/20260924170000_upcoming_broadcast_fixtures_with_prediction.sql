-- Adds the fixture's own frozen prediction (already on `fixtures`, no new
-- join) so the TV Guide can show what the model expects alongside where
-- to watch -- ties the guide back to the site's actual strength instead
-- of being a flat schedule. Nullable: a fixture with no accepted fit yet
-- (e.g. the non-English leagues, which have no fits at all right now)
-- just shows no prediction line, same "absence means not known" rule as
-- broadcast data itself.
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
  at.display_name as away_team_name,
  f.predicted_home_goals,
  f.predicted_away_goals
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
