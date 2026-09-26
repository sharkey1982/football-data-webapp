-- Live definition exported from the database (view fpl_player_substitution_usage).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_player_substitution_usage with (security_invoker=true) as
 SELECT p.season_id,
    p.fpl_player_id,
    count(g.fpl_fixture_id) FILTER (WHERE (g.minutes > 0)) AS appearances,
    count(g.fpl_fixture_id) FILTER (WHERE (g.minutes >= 60)) AS likely_starts,
    count(g.fpl_fixture_id) FILTER (WHERE ((g.minutes >= 1) AND (g.minutes <= 59))) AS sub_appearances,
    COALESCE(avg(g.minutes) FILTER (WHERE ((g.minutes >= 1) AND (g.minutes <= 59))), (20)::numeric) AS avg_sub_minutes
   FROM (fpl_players p
     LEFT JOIN fpl_player_gameweeks g ON (((g.fpl_player_id = p.fpl_player_id) AND (g.season_id = p.season_id))))
  GROUP BY p.season_id, p.fpl_player_id;
