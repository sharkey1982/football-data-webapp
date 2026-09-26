-- Live definition exported from the database (function get_country_league_summary()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_country_league_summary()
 RETURNS TABLE(country_id bigint, country_name text, league_code text, league_name text, season_label text, matches bigint, goals_per_game numeric, home_goals_per_game numeric, away_goals_per_game numeric, home_win_pct numeric, draw_pct numeric, away_win_pct numeric, yellows_per_game numeric, reds_per_game numeric, over_two_five_pct numeric, both_scored_pct numeric, nil_nil_pct numeric, comeback_pct numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.country_id, c.name, l.code, l.name, s.label,
    count(*)::bigint,
    round(avg(m.full_time_home_goals + m.full_time_away_goals)::numeric, 2),
    round(avg(m.full_time_home_goals)::numeric, 2),
    round(avg(m.full_time_away_goals)::numeric, 2),
    round(100.0 * avg(case when m.full_time_result = 'H' then 1 else 0 end)::numeric, 1),
    round(100.0 * avg(case when m.full_time_result = 'D' then 1 else 0 end)::numeric, 1),
    round(100.0 * avg(case when m.full_time_result = 'A' then 1 else 0 end)::numeric, 1),
    round((avg(m.home_yellow_cards + m.away_yellow_cards) filter (where m.source_file not like '%/new/%'))::numeric, 2),
    round((avg(m.home_red_cards + m.away_red_cards) filter (where m.source_file not like '%/new/%'))::numeric, 3),
    round(100.0 * avg(case when m.full_time_home_goals + m.full_time_away_goals > 2.5 then 1 else 0 end)::numeric, 1),
    round(100.0 * avg(case when m.full_time_home_goals > 0 and m.full_time_away_goals > 0 then 1 else 0 end)::numeric, 1),
    round(100.0 * avg(case when m.full_time_home_goals = 0 and m.full_time_away_goals = 0 then 1 else 0 end)::numeric, 1),
    round(100.0 * (
      count(*) filter (where m.half_time_result is not null and m.half_time_result <> 'D' and m.half_time_result <> m.full_time_result)::numeric
      / nullif(count(*) filter (where m.half_time_result is not null and m.half_time_result <> 'D'), 0)
    ), 1)
  from public.matches m
  join public.leagues l on l.league_id = m.league_id
  join public.countries c on c.country_id = l.country_id
  join public.seasons s on s.season_id = m.season_id
  where l.competition_type = 'league' and (l.tier = 1 or l.code = 'E0')
    and m.full_time_result is not null
  group by c.country_id, c.name, l.code, l.name, s.label
  order by c.name, s.label;
$function$
;
