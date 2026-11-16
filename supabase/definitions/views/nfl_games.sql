-- Live definition exported from the database (view nfl_games).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_games with (security_invoker=true) as
 SELECT g.game_id,
    g.season,
    g.game_type,
    g.week,
    g.gameday,
    g.kickoff_at,
    ha.franchise AS home_franchise,
    hf.slug AS home_slug,
    COALESCE(hs.full_name, hf.name) AS home_name,
    hf.short_name AS home_short,
    aa.franchise AS away_franchise,
    af.slug AS away_slug,
    COALESCE(aws.full_name, af.name) AS away_name,
    af.short_name AS away_short,
    g.home_score,
    g.away_score,
    g.overtime,
    g.neutral_site,
    g.div_game,
    g.spread_line,
    g.total_line,
    g.stadium,
    g.roof,
    g.surface,
    g.home_qb_name,
    g.away_qb_name
   FROM ((((((nfl.games g
     JOIN nfl.team_codes ha ON ((ha.code = g.home_code)))
     JOIN nfl.franchises hf ON ((hf.franchise = ha.franchise)))
     JOIN nfl.team_codes aa ON ((aa.code = g.away_code)))
     JOIN nfl.franchises af ON ((af.franchise = aa.franchise)))
     LEFT JOIN nfl.team_seasons hs ON (((hs.season = g.season) AND (hs.code = g.home_code))))
     LEFT JOIN nfl.team_seasons aws ON (((aws.season = g.season) AND (aws.code = g.away_code))));
