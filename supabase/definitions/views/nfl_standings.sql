-- Live definition exported from the database (view nfl_standings).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.nfl_standings with (security_invoker=true) as
 WITH sides AS (
         SELECT g.season,
            g.game_type,
            tc.franchise,
            g.home_code AS code,
            g.home_score AS pf,
            g.away_score AS pa,
            true AS is_home,
            g.div_game,
            ha.franchise AS me,
            aa.franchise AS opp
           FROM (((nfl.games g
             JOIN nfl.team_codes tc ON ((tc.code = g.home_code)))
             JOIN nfl.team_codes ha ON ((ha.code = g.home_code)))
             JOIN nfl.team_codes aa ON ((aa.code = g.away_code)))
          WHERE (g.home_score IS NOT NULL)
        UNION ALL
         SELECT g.season,
            g.game_type,
            tc.franchise,
            g.away_code,
            g.away_score,
            g.home_score,
            false,
            g.div_game,
            aa.franchise,
            ha.franchise
           FROM (((nfl.games g
             JOIN nfl.team_codes tc ON ((tc.code = g.away_code)))
             JOIN nfl.team_codes ha ON ((ha.code = g.home_code)))
             JOIN nfl.team_codes aa ON ((aa.code = g.away_code)))
          WHERE (g.home_score IS NOT NULL)
        ), reg AS (
         SELECT s.season,
            s.franchise,
            max(s.code) AS code,
            count(*) AS played,
            count(*) FILTER (WHERE (s.pf > s.pa)) AS won,
            count(*) FILTER (WHERE (s.pf < s.pa)) AS lost,
            count(*) FILTER (WHERE (s.pf = s.pa)) AS tied,
            sum(s.pf) AS points_for,
            sum(s.pa) AS points_against,
            count(*) FILTER (WHERE (s.is_home AND (s.pf > s.pa))) AS home_won,
            count(*) FILTER (WHERE (s.is_home AND (s.pf < s.pa))) AS home_lost,
            count(*) FILTER (WHERE ((NOT s.is_home) AND (s.pf > s.pa))) AS away_won,
            count(*) FILTER (WHERE ((NOT s.is_home) AND (s.pf < s.pa))) AS away_lost,
            count(*) FILTER (WHERE (s.div_game AND (s.pf > s.pa))) AS div_won,
            count(*) FILTER (WHERE (s.div_game AND (s.pf < s.pa))) AS div_lost,
            count(*) FILTER (WHERE (s.div_game AND (s.pf = s.pa))) AS div_tied,
            count(*) FILTER (WHERE ((fo.conference = fm.conference) AND (s.pf > s.pa))) AS conf_won,
            count(*) FILTER (WHERE ((fo.conference = fm.conference) AND (s.pf < s.pa))) AS conf_lost
           FROM ((sides s
             JOIN nfl.franchises fm ON ((fm.franchise = s.me)))
             JOIN nfl.franchises fo ON ((fo.franchise = s.opp)))
          WHERE (s.game_type = 'REG'::text)
          GROUP BY s.season, s.franchise
        ), post AS (
         SELECT sides.season,
            sides.franchise,
            max(
                CASE sides.game_type
                    WHEN 'WC'::text THEN 1
                    WHEN 'DIV'::text THEN 2
                    WHEN 'CON'::text THEN 3
                    WHEN 'SB'::text THEN 4
                    ELSE NULL::integer
                END) AS round_reached,
            bool_or(((sides.game_type = 'SB'::text) AND (sides.pf > sides.pa))) AS won_title
           FROM sides
          WHERE (sides.game_type <> 'REG'::text)
          GROUP BY sides.season, sides.franchise
        ), div_winners AS (
         SELECT sides.season,
            sides.franchise
           FROM sides
          WHERE (sides.game_type <> 'REG'::text)
          GROUP BY sides.season, sides.franchise
         HAVING (bool_or(((sides.game_type = 'WC'::text) AND sides.is_home)) OR ((NOT bool_or((sides.game_type = 'WC'::text))) AND bool_or((sides.game_type = 'DIV'::text))))
        ), seasons_done AS (
         SELECT games.season,
            bool_or(((games.game_type = 'SB'::text) AND (games.home_score IS NOT NULL))) AS complete
           FROM nfl.games
          GROUP BY games.season
        )
 SELECT r.season,
    f.franchise,
    f.slug,
    COALESCE(ts.full_name, f.name) AS team_name,
    f.short_name,
    f.conference,
    f.division,
    r.played,
    r.won,
    r.lost,
    r.tied,
    round((((r.won)::numeric + (0.5 * (r.tied)::numeric)) / (NULLIF(r.played, 0))::numeric), 3) AS win_pct,
    r.points_for,
    r.points_against,
    (r.points_for - r.points_against) AS point_diff,
    r.home_won,
    r.home_lost,
    r.away_won,
    r.away_lost,
    r.div_won,
    r.div_lost,
    r.div_tied,
    r.conf_won,
    r.conf_lost,
        CASE
            WHEN p.won_title THEN 'Won Super Bowl'::text
            WHEN (p.round_reached = 4) THEN 'Lost Super Bowl'::text
            WHEN (p.round_reached = 3) THEN 'Lost conference championship'::text
            WHEN (p.round_reached = 2) THEN 'Lost divisional round'::text
            WHEN (p.round_reached = 1) THEN 'Lost wild card round'::text
            ELSE NULL::text
        END AS playoff_result,
    COALESCE(p.round_reached, 0) AS playoff_round,
    COALESCE(sd.complete, false) AS season_complete,
    rank() OVER (PARTITION BY r.season, f.conference, f.division ORDER BY (dw.franchise IS NOT NULL) DESC, (((r.won)::numeric + (0.5 * (r.tied)::numeric)) / (NULLIF(r.played, 0))::numeric) DESC, (((r.div_won)::numeric + (0.5 * (r.div_tied)::numeric)) / (NULLIF(((r.div_won + r.div_lost) + r.div_tied), 0))::numeric) DESC NULLS LAST, (r.points_for - r.points_against) DESC) AS division_rank,
        CASE
            WHEN COALESCE(sd.complete, false) THEN (dw.franchise IS NOT NULL)
            ELSE NULL::boolean
        END AS won_division
   FROM (((((reg r
     JOIN nfl.franchises f ON ((f.franchise = r.franchise)))
     LEFT JOIN nfl.team_seasons ts ON (((ts.season = r.season) AND (ts.code = r.code))))
     LEFT JOIN post p ON (((p.season = r.season) AND (p.franchise = r.franchise))))
     LEFT JOIN seasons_done sd ON ((sd.season = r.season)))
     LEFT JOIN div_winners dw ON (((dw.season = r.season) AND (dw.franchise = r.franchise))));
