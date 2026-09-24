-- Trivia questions said "in our archive" / "in the archive" -- a database
-- reference, not a trivia fact. Both functions now also return how many
-- seasons the answer actually spans, computed fresh each call, so the
-- question can say "over the last N seasons" without ever going stale.
drop function public.get_all_time_top_scorers();
create function public.get_all_time_top_scorers()
returns table(display_name text, goals bigint, seasons_covered bigint)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  select t.display_name,
    sum(case when m.home_team_id = t.team_id then m.full_time_home_goals else m.full_time_away_goals end)::bigint,
    (select count(distinct season_id) from public.matches)::bigint
  from public.matches m
  join public.teams t on t.team_id in (m.home_team_id, m.away_team_id)
  group by t.display_name
  order by 2 desc
  limit 4;
$$;

drop function public.get_most_common_scoreline(bigint);
create function public.get_most_common_scoreline(p_league_id bigint)
returns table(home_goals integer, away_goals integer, occurrences bigint, total_matches bigint, seasons_covered bigint)
language sql stable
set search_path to 'public', 'pg_temp'
as $$
  with counts as (
    select full_time_home_goals, full_time_away_goals, count(*) as occurrences
    from public.matches
    where league_id = p_league_id
    group by full_time_home_goals, full_time_away_goals
  ), total as (
    select count(*) as total_matches, count(distinct season_id) as seasons_covered
    from public.matches where league_id = p_league_id
  )
  select c.full_time_home_goals, c.full_time_away_goals, c.occurrences, t.total_matches, t.seasons_covered
  from counts c, total t
  order by c.occurrences desc
  limit 4;
$$;
grant execute on function public.get_all_time_top_scorers() to anon, authenticated;
grant execute on function public.get_most_common_scoreline(bigint) to anon, authenticated;
