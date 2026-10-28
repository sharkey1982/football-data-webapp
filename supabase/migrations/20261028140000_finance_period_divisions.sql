-- The division each club played in during the season its accounts cover:
-- one row per published finance period (team_id, period_end). Accounts only
-- make sense against that season's division -- revenue swings are mostly
-- promotion, relegation and parachute payments -- and the current division
-- (finance_club_divisions) is wrong for most past years.
--
-- From played league matches in the period's mapped season
-- (finance_periods.season_id), domestic leagues only; a club with matches in
-- two leagues that season (rare) takes the one with more. Public read.
create or replace view public.finance_period_divisions
with (security_invoker = true) as
with apps as (
  select m.team_id, m.season_id, m.league_id, count(*) as matches
  from (
    select league_id, season_id, home_team_id as team_id from public.matches
    union all
    select league_id, season_id, away_team_id from public.matches
  ) m
  join public.leagues l on l.league_id = m.league_id
  where l.competition_type = 'league' and l.scope = 'domestic'
  group by m.team_id, m.season_id, m.league_id
), pick as (
  select distinct on (p.team_id, p.period_end) p.team_id, p.period_end, p.season_id, a.league_id
  from public.finance_published_periods p
  join apps a on a.team_id = p.team_id and a.season_id = p.season_id
  order by p.team_id, p.period_end, a.matches desc, a.league_id
)
select
  pk.team_id,
  pk.period_end,
  pk.season_id,
  l.code as league_code,
  l.name as league_name,
  l.slug as league_slug,
  c.name as country,
  case when c.name = 'England' then 0 else 1 end as country_order,
  coalesce(l.tier, case l.code when 'E0' then 1 when 'E1' then 2 when 'E2' then 3 when 'E3' then 4 when 'EC' then 5 end, 9) as division_order
from pick pk
join public.leagues l on l.league_id = pk.league_id
left join public.countries c on c.country_id = l.country_id;

grant select on public.finance_period_divisions to anon, authenticated;

comment on view public.finance_period_divisions is
  'Division each club played in during the season a published finance period covers (from played league matches). Used to label and filter finance pages by season.';
