-- Current division of every club with published finance data, for filtering
-- the finance index and comparison pages ("Premier League", "Championship" ...).
-- Derived from this season's fixtures (domestic league competitions only), so
-- promotion and relegation update it automatically at the season rollover.
-- A club appearing in two domestic leagues in one season (rare) takes the one
-- with more fixtures. Public read, like the other finance views.
create or replace view public.finance_club_divisions
with (security_invoker = true) as
with apps as (
  select f.team_id, f.league_id, count(*) as fixtures
  from (
    select league_id, season_id, home_team_id as team_id from public.fixtures
    union all
    select league_id, season_id, away_team_id from public.fixtures
  ) f
  join public.leagues l on l.league_id = f.league_id
  where f.season_id = public.current_season_id()
    and l.competition_type = 'league' and l.scope = 'domestic'
  group by f.team_id, f.league_id
), pick as (
  select distinct on (a.team_id) a.team_id, a.league_id
  from apps a
  where a.team_id in (select team_id from public.finance_published_periods)
  order by a.team_id, a.fixtures desc, a.league_id
)
select
  p.team_id,
  l.league_id,
  l.code as league_code,
  l.name as league_name,
  l.slug as league_slug,
  c.name as country,
  -- English pyramid order where tier is not recorded; other countries by tier.
  case when c.name = 'England' then 0 else 1 end as country_order,
  coalesce(l.tier, case l.code when 'E0' then 1 when 'E1' then 2 when 'E2' then 3 when 'E3' then 4 when 'EC' then 5 end, 9) as division_order
from pick p
join public.leagues l on l.league_id = p.league_id
left join public.countries c on c.country_id = l.country_id;

grant select on public.finance_club_divisions to anon, authenticated;

comment on view public.finance_club_divisions is
  'Current domestic league of each club with published finance periods (from this season''s fixtures). Used to filter the finance pages.';
