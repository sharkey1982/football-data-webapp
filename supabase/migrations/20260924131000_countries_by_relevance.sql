-- Powers the Country filter (Results Projections / fixtures page). Was
-- plain alphabetical, which buried England and Spain (real leagues,
-- thousands of matches) among dozens of countries that only exist because
-- one of their clubs appeared in a single Champions/Europa League fixture
-- (Germany: 7 teams, 4 matches total; most others: 1-2 matches). Sorted by
-- how many of that country's teams actually have match data -- a country
-- with real coverage to browse sorts first, alphabetical only as tiebreak.
create or replace function public.get_countries_by_relevance()
returns table(country_id bigint, name text, code text, teams_with_matches bigint)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select c.country_id, c.name, c.code,
    count(distinct t.team_id) filter (where exists (
      select 1 from matches m where m.home_team_id = t.team_id or m.away_team_id = t.team_id
    ))
  from countries c
  left join teams t on t.country_id = c.country_id
  group by c.country_id, c.name, c.code
  order by 4 desc, c.name asc;
$$;
grant execute on function public.get_countries_by_relevance() to anon, authenticated;
