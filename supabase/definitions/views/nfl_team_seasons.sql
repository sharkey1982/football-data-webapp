-- Live definition exported from the database (view nfl_team_seasons).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_team_seasons with (security_invoker=true) as
 SELECT tg.season,
    tg.franchise,
    f.slug,
    f.name AS team_name,
    f.short_name,
    f.conference,
    f.division,
    count(*) AS games,
    sum(tg.points_for) AS points_for,
    sum(tg.points_against) AS points_against,
    sum(tg.plays) AS plays,
    sum(tg.attempts) AS attempts,
    sum(tg.carries) AS carries,
    sum(tg.sacks_suffered) AS sacks_suffered,
    sum(tg.pass_yards_net) AS pass_yards,
    sum(tg.rushing_yards) AS rush_yards,
    sum(tg.passing_tds) AS pass_tds,
    sum(tg.rushing_tds) AS rush_tds,
    sum(tg.first_downs) AS first_downs,
    sum(tg.giveaways) AS giveaways,
    sum(tg.takeaways) AS takeaways,
    sum(tg.def_sacks) AS def_sacks,
    sum(tg.def_st_tds) AS def_st_tds,
    sum(tg.opp_plays) AS opp_plays,
    sum(tg.opp_attempts) AS opp_attempts,
    sum(tg.opp_carries) AS opp_carries,
    sum(tg.opp_pass_yards_net) AS opp_pass_yards,
    sum(tg.opp_rushing_yards) AS opp_rush_yards,
    sum(tg.opp_passing_tds) AS opp_pass_tds,
    sum(tg.opp_rushing_tds) AS opp_rush_tds,
    sum(tg.penalties) AS penalties,
    sum(tg.penalty_yards) AS penalty_yards,
    round((sum(tg.passing_epa) + sum(tg.rushing_epa)), 1) AS offence_epa,
    sum(tg.dst_points) AS dst_points
   FROM (nfl_team_games tg
     JOIN nfl.franchises f ON ((f.franchise = tg.franchise)))
  WHERE (tg.season_type = 'REG'::text)
  GROUP BY tg.season, tg.franchise, f.slug, f.name, f.short_name, f.conference, f.division;
