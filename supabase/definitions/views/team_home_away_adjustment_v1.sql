-- Live definition exported from the database (view team_home_away_adjustment_v1).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.team_home_away_adjustment_v1 as
 WITH base AS (
         SELECT team_home_away_adjustment_experimental_v1.team_id,
            team_home_away_adjustment_experimental_v1.team_name,
            team_home_away_adjustment_experimental_v1.overall_gf,
            team_home_away_adjustment_experimental_v1.home_gf,
            team_home_away_adjustment_experimental_v1.away_gf,
            team_home_away_adjustment_experimental_v1.overall_ga,
            team_home_away_adjustment_experimental_v1.home_ga,
            team_home_away_adjustment_experimental_v1.away_ga,
            team_home_away_adjustment_experimental_v1.home_matches,
            team_home_away_adjustment_experimental_v1.away_matches,
            team_home_away_adjustment_experimental_v1.home_weight,
            team_home_away_adjustment_experimental_v1.away_weight,
            team_home_away_adjustment_experimental_v1.home_attack_dev,
            team_home_away_adjustment_experimental_v1.away_attack_dev,
            team_home_away_adjustment_experimental_v1.home_defence_dev,
            team_home_away_adjustment_experimental_v1.away_defence_dev,
            team_home_away_adjustment_experimental_v1.half_life_days,
            team_home_away_adjustment_experimental_v1.shrink_matches,
            team_home_away_adjustment_experimental_v1.as_of_date
           FROM team_home_away_adjustment_experimental_v1
        ), means AS (
         SELECT (sum((base.home_attack_dev * base.home_weight)) / NULLIF(sum(base.home_weight), (0)::double precision)) AS mha,
            (sum((base.away_attack_dev * base.away_weight)) / NULLIF(sum(base.away_weight), (0)::double precision)) AS maa,
            (sum((base.home_defence_dev * base.home_weight)) / NULLIF(sum(base.home_weight), (0)::double precision)) AS mhd,
            (sum((base.away_defence_dev * base.away_weight)) / NULLIF(sum(base.away_weight), (0)::double precision)) AS mad
           FROM base
        )
 SELECT b.team_id,
    b.team_name,
    b.overall_gf,
    b.home_gf,
    b.away_gf,
    b.overall_ga,
    b.home_ga,
    b.away_ga,
    b.home_matches,
    b.away_matches,
    b.home_weight,
    b.away_weight,
    b.home_attack_dev,
    b.away_attack_dev,
    b.home_defence_dev,
    b.away_defence_dev,
    b.half_life_days,
    b.shrink_matches,
    b.as_of_date,
    (b.home_attack_dev - m.mha) AS centered_home_attack_dev,
    (b.away_attack_dev - m.maa) AS centered_away_attack_dev,
    (b.home_defence_dev - m.mhd) AS centered_home_defence_dev,
    (b.away_defence_dev - m.mad) AS centered_away_defence_dev
   FROM (base b
     CROSS JOIN means m);
