-- ============================================================================
-- LEAGUE STANDINGS: use the Football League's own tie-break before 1999/2000.
--
-- Until 1998/99 the Football League (tiers 2-4) separated clubs level on
-- points by GOALS SCORED, then goal difference. It switched to goal
-- difference first from 1999/2000. The Premier League has always used goal
-- difference first.
--
-- With the 1992/93-2013/14 backfill this matters, e.g. 1996/97 Third
-- Division: Brighton (47 pts, 53 scored) stayed up and Hereford (47 pts, 50
-- scored, better goal difference) went down.
--
-- Only the ORDER BY of the position window changes; columns are unchanged.
-- ============================================================================

create or replace view public.league_standings as
 WITH domestic_leagues AS (
         SELECT leagues.league_id,
            leagues.country_id
           FROM leagues
          WHERE (leagues.competition_type = 'league'::text)
        ), cur AS (
         SELECT se_cur.season_id
           FROM seasons se_cur
          WHERE (se_cur.start_year = ( SELECT max(se_m.start_year) AS max
                   FROM seasons se_m
                  WHERE (se_m.season_id IN ( SELECT matches.season_id
                           FROM matches
                          WHERE (matches.league_id IN ( SELECT domestic_leagues.league_id
                                   FROM domestic_leagues))))))
        ), res AS (
         SELECT matches.league_id,
            matches.season_id,
            matches.home_team_id AS team_id,
            'home'::text AS venue,
            matches.full_time_home_goals AS gf,
            matches.full_time_away_goals AS ga
           FROM matches
          WHERE ((matches.league_id IN ( SELECT domestic_leagues.league_id
                   FROM domestic_leagues)) AND (matches.full_time_home_goals IS NOT NULL))
        UNION ALL
         SELECT matches.league_id,
            matches.season_id,
            matches.away_team_id,
            'away'::text AS text,
            matches.full_time_away_goals,
            matches.full_time_home_goals
           FROM matches
          WHERE ((matches.league_id IN ( SELECT domestic_leagues.league_id
                   FROM domestic_leagues)) AND (matches.full_time_home_goals IS NOT NULL))
        ), agg AS (
         SELECT res.league_id,
            res.season_id,
            res.team_id,
            (count(*))::integer AS played,
            (count(*) FILTER (WHERE (res.gf > res.ga)))::integer AS won,
            (count(*) FILTER (WHERE (res.gf = res.ga)))::integer AS drawn,
            (count(*) FILTER (WHERE (res.gf < res.ga)))::integer AS lost,
            (sum(res.gf))::integer AS goals_for,
            (sum(res.ga))::integer AS goals_against,
            (count(*) FILTER (WHERE (res.ga = 0)))::integer AS clean_sheets,
            (count(*) FILTER (WHERE (res.gf = 0)))::integer AS failed_to_score,
            (((3 * count(*) FILTER (WHERE (res.gf > res.ga))) + count(*) FILTER (WHERE (res.gf = res.ga))))::integer AS points_won,
            (count(*) FILTER (WHERE (res.venue = 'home'::text)))::integer AS home_played,
            (((3 * count(*) FILTER (WHERE ((res.venue = 'home'::text) AND (res.gf > res.ga)))) + count(*) FILTER (WHERE ((res.venue = 'home'::text) AND (res.gf = res.ga)))))::integer AS home_points,
            (COALESCE(sum(res.gf) FILTER (WHERE (res.venue = 'home'::text)), (0)::bigint))::integer AS home_goals_for,
            (COALESCE(sum(res.ga) FILTER (WHERE (res.venue = 'home'::text)), (0)::bigint))::integer AS home_goals_against,
            (count(*) FILTER (WHERE (res.venue = 'away'::text)))::integer AS away_played,
            (((3 * count(*) FILTER (WHERE ((res.venue = 'away'::text) AND (res.gf > res.ga)))) + count(*) FILTER (WHERE ((res.venue = 'away'::text) AND (res.gf = res.ga)))))::integer AS away_points,
            (COALESCE(sum(res.gf) FILTER (WHERE (res.venue = 'away'::text)), (0)::bigint))::integer AS away_goals_for,
            (COALESCE(sum(res.ga) FILTER (WHERE (res.venue = 'away'::text)), (0)::bigint))::integer AS away_goals_against,
            (count(*) FILTER (WHERE ((res.venue = 'home'::text) AND (res.gf > res.ga))))::integer AS home_won,
            (count(*) FILTER (WHERE ((res.venue = 'home'::text) AND (res.gf = res.ga))))::integer AS home_drawn,
            (count(*) FILTER (WHERE ((res.venue = 'home'::text) AND (res.gf < res.ga))))::integer AS home_lost,
            (count(*) FILTER (WHERE ((res.venue = 'home'::text) AND (res.ga = 0))))::integer AS home_clean_sheets,
            (count(*) FILTER (WHERE ((res.venue = 'away'::text) AND (res.gf > res.ga))))::integer AS away_won,
            (count(*) FILTER (WHERE ((res.venue = 'away'::text) AND (res.gf = res.ga))))::integer AS away_drawn,
            (count(*) FILTER (WHERE ((res.venue = 'away'::text) AND (res.gf < res.ga))))::integer AS away_lost,
            (count(*) FILTER (WHERE ((res.venue = 'away'::text) AND (res.ga = 0))))::integer AS away_clean_sheets
           FROM res
          GROUP BY res.league_id, res.season_id, res.team_id
        ), shape AS (
         SELECT a.league_id,
            a.season_id,
            (count(*))::integer AS teams,
            ((sum(a.played))::integer / 2) AS matches,
            (a.season_id = ( SELECT cur.season_id
                   FROM cur)) AS is_current
           FROM agg a
          GROUP BY a.league_id, a.season_id
        ), ded AS (
         SELECT point_deductions.league_id,
            point_deductions.season_id,
            point_deductions.team_id,
            (sum(point_deductions.points))::integer AS pts
           FROM point_deductions
          GROUP BY point_deductions.league_id, point_deductions.season_id, point_deductions.team_id
        ), scored AS (
         SELECT a.league_id,
            a.season_id,
            a.team_id,
            a.played,
            a.won,
            a.drawn,
            a.lost,
            a.goals_for,
            a.goals_against,
            a.clean_sheets,
            a.failed_to_score,
            a.points_won,
            a.home_played,
            a.home_points,
            a.home_goals_for,
            a.home_goals_against,
            a.away_played,
            a.away_points,
            a.away_goals_for,
            a.away_goals_against,
            a.home_won,
            a.home_drawn,
            a.home_lost,
            a.home_clean_sheets,
            a.away_won,
            a.away_drawn,
            a.away_lost,
            a.away_clean_sheets,
            s.teams,
            s.is_current,
            COALESCE(d.pts, 0) AS deduction,
            (a.points_won + COALESCE(d.pts, 0)) AS points,
            ((NOT s.is_current) AND (s.matches < (s.teams * (s.teams - 1)))) AS curtailed,
            -- Football League (tiers 2-4, England) before 1999/2000: goals scored first.
            (lg.code IN ('E1', 'E2', 'E3') AND se.start_year <= 1998) AS goals_scored_first
           FROM ((((agg a
             JOIN shape s USING (league_id, season_id))
             LEFT JOIN ded d USING (league_id, season_id, team_id))
             JOIN leagues lg ON ((lg.league_id = a.league_id)))
             JOIN seasons se ON ((se.season_id = a.season_id)))
        ), ranked AS (
         SELECT sc.league_id,
            sc.season_id,
            sc.team_id,
            sc.played,
            sc.won,
            sc.drawn,
            sc.lost,
            sc.goals_for,
            sc.goals_against,
            sc.clean_sheets,
            sc.failed_to_score,
            sc.points_won,
            sc.home_played,
            sc.home_points,
            sc.home_goals_for,
            sc.home_goals_against,
            sc.away_played,
            sc.away_points,
            sc.away_goals_for,
            sc.away_goals_against,
            sc.home_won,
            sc.home_drawn,
            sc.home_lost,
            sc.home_clean_sheets,
            sc.away_won,
            sc.away_drawn,
            sc.away_lost,
            sc.away_clean_sheets,
            sc.teams,
            sc.is_current,
            sc.deduction,
            sc.points,
            sc.curtailed,
            (row_number() OVER (PARTITION BY sc.league_id, sc.season_id ORDER BY
                CASE
                    WHEN sc.curtailed THEN ((sc.points)::numeric / (NULLIF(sc.played, 0))::numeric)
                    ELSE (sc.points)::numeric
                END DESC,
                CASE WHEN sc.goals_scored_first THEN sc.goals_for ELSE (sc.goals_for - sc.goals_against) END DESC,
                CASE WHEN sc.goals_scored_first THEN (sc.goals_for - sc.goals_against) ELSE sc.goals_for END DESC,
                t.canonical_name))::integer AS "position"
           FROM (scored sc
             JOIN teams t USING (team_id))
        )
 SELECT r.league_id,
    l.code AS league_code,
    league_name_for_season(r.league_id, r.season_id) AS league_name,
    (r.league_id)::integer AS tier,
    r.season_id,
    se.label AS season_label,
    r.team_id,
    r."position",
    (r."position" + (COALESCE(( SELECT sum(s2.teams) AS sum
           FROM (shape s2
             JOIN leagues l2 ON ((l2.league_id = s2.league_id)))
          WHERE ((s2.season_id = r.season_id) AND (s2.league_id < r.league_id) AND (l2.country_id = l.country_id))), (0)::bigint))::integer) AS pyramid_position,
    r.teams,
    (NOT r.is_current) AS is_final,
    r.curtailed,
        CASE
            WHEN r.curtailed THEN 'points per game'::text
            ELSE 'points'::text
        END AS ranked_on,
    r.played,
    r.won,
    r.drawn,
    r.lost,
    r.goals_for,
    r.goals_against,
    r.clean_sheets,
    r.failed_to_score,
    r.points_won,
    r.deduction,
    r.points,
    round(((r.points)::numeric / (NULLIF(r.played, 0))::numeric), 2) AS ppg,
    r.home_played,
    r.home_points,
    r.home_goals_for,
    r.home_goals_against,
    r.away_played,
    r.away_points,
    r.away_goals_for,
    r.away_goals_against,
    r.home_won,
    r.home_drawn,
    r.home_lost,
    r.home_clean_sheets,
    r.away_won,
    r.away_drawn,
    r.away_lost,
    r.away_clean_sheets,
    se.start_year AS season_start_year
   FROM ((ranked r
     JOIN leagues l USING (league_id))
     JOIN seasons se USING (season_id));

update public.meta_flow_nodes
   set purpose = replace(purpose, 'tie-breaks are GD, GF, then name (not official rules).',
         'tie-breaks are GD, GF, then name, except the Football League (E1-E3) up to 1998/99, which used goals scored before goal difference (as it did at the time); other official tie-breaks such as head-to-head are not modelled. point_deductions covers England 1992/93 onwards.'),
       purpose_reviewed_at = now()
 where node_key = 'object:league_standings';
