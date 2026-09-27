-- ============================================================================
-- LEAGUE STANDINGS: split / play-off formats (league_season_formats).
--
-- For league-seasons with a 'split' row:
--   * a pair of clubs' meetings beyond regular_meetings (in date order) are
--     post-split games; the rest are the regular season;
--   * each club goes into the group (group_sizes, in regular-season order)
--     that most of its group-phase opponents are in; groups are locked:
--     group 1 ranks above group 2 whatever the points;
--   * halved groups carry half their regular-season points (and any
--     deduction in force before the split), rounded as configured, and ties
--     are broken on the unrounded total;
--   * European / relegation play-off ties between league clubs (a club's
--     post-split games beyond its group's group_games, or games between
--     clubs of different groups) are left out of every column; the matches
--     stay in matches;
--   * clubs level on (unrounded) points are separated by the season's
--     tiebreak (head_to_head, regular_position, regular_points or
--     goal_difference), then by goal difference and goals scored as before.
-- Performance: the split logic joins on single composite keys (league*10000
-- + season, times 10^7 plus team) so the planner, which has no statistics
-- for CTEs, does not fall back to nested loops; and agg now aggregates the
-- home and away sides separately and joins them (same numbers, fewer FILTER
-- aggregates over half the rows), which pays for the split logic: a full
-- scan takes about as long as before (0.77 s against 0.74 s).
-- 'curtailed' rows override the automatic curtailed test (Scotland 2019/20
-- has more games than a double round robin but was decided on points per
-- game).
--
-- Every other league-season gives exactly the rows it gave before. Columns
-- are unchanged; two are added at the end:
--   split_group       1 = championship group, 2 = next group ... (null when
--                     the season has no split, or it has not happened yet)
--   split_adjustment  points removed (negative) by halving; points =
--                     points_won + deduction + split_adjustment
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
        ), fmt AS (
         SELECT f.league_id,
            f.season_id,
            ((f.league_id * 10000) + f.season_id) AS ls,
            f.regular_meetings,
            f.halved_groups,
            f.halving_rounding,
            f.group_sizes,
            f.group_games,
            f.tiebreak
           FROM league_season_formats f
          WHERE (f.format = 'split'::text)
        ), sm AS (
         SELECT m.match_id,
            f.ls,
            m.match_date,
            m.kickoff_time,
            ((f.ls * 10000000) + m.home_team_id) AS hk,
            ((f.ls * 10000000) + m.away_team_id) AS ak,
            m.full_time_home_goals AS hg,
            m.full_time_away_goals AS ag,
            ((row_number() OVER (PARTITION BY f.ls, LEAST(m.home_team_id, m.away_team_id), GREATEST(m.home_team_id, m.away_team_id) ORDER BY m.match_date, m.kickoff_time, m.match_id))::integer - f.regular_meetings) AS post_no
           FROM (matches m
             JOIN fmt f ON (((f.league_id = m.league_id) AND (f.season_id = m.season_id))))
          WHERE (m.full_time_home_goals IS NOT NULL)
        ), sm_side AS (
         SELECT sm.ls,
            sm.match_id,
            sm.match_date,
            sm.kickoff_time,
            sm.post_no,
            sm.hk AS tk,
            sm.ak AS ok,
            sm.hg AS gf,
            sm.ag AS ga
           FROM sm
        UNION ALL
         SELECT sm.ls,
            sm.match_id,
            sm.match_date,
            sm.kickoff_time,
            sm.post_no,
            sm.ak,
            sm.hk,
            sm.ag,
            sm.hg
           FROM sm
        ), split_start AS (
         SELECT sm.ls,
            min(sm.match_date) AS first_post_date
           FROM sm
          WHERE (sm.post_no > 0)
          GROUP BY sm.ls
        ), pre_ded AS (
         SELECT ((((d.league_id * 10000) + d.season_id) * 10000000) + d.team_id) AS tk,
            (sum(d.points))::integer AS pts
           FROM (point_deductions d
             JOIN split_start ss ON ((ss.ls = ((d.league_id * 10000) + d.season_id))))
          WHERE ((d.effective_date IS NULL) OR (d.effective_date < ss.first_post_date))
          GROUP BY ((((d.league_id * 10000) + d.season_id) * 10000000) + d.team_id)
        ), pre AS (
         SELECT s.ls,
            s.tk,
            ((sum(
                CASE
                    WHEN (s.gf > s.ga) THEN 3
                    WHEN (s.gf = s.ga) THEN 1
                    ELSE 0
                END))::integer + COALESCE(max(pd.pts), 0)) AS pre_total,
            count(*) FILTER (WHERE (s.gf > s.ga)) AS pre_wins,
            sum((s.gf - s.ga)) AS pre_gd,
            sum(s.gf) AS pre_gf
           FROM (sm_side s
             LEFT JOIN pre_ded pd ON ((pd.tk = s.tk)))
          WHERE ((s.post_no <= 0) AND (s.ls IN ( SELECT split_start.ls
                   FROM split_start)))
          GROUP BY s.ls, s.tk
        ), prov AS (
         SELECT r.ls,
            r.tk,
            r.pre_total,
            r.rnk,
            COALESCE(( SELECT min(i.i) AS min
                   FROM generate_subscripts(f.group_sizes, 1) i(i)
                  WHERE (r.rnk <= ( SELECT sum(x.x) AS sum
                           FROM unnest(f.group_sizes[1:i.i]) x(x)))), cardinality(f.group_sizes)) AS pblock
           FROM (( SELECT pre.ls,
                    pre.tk,
                    pre.pre_total,
                    row_number() OVER (PARTITION BY pre.ls ORDER BY pre.pre_total DESC, pre.pre_wins DESC, pre.pre_gd DESC, pre.pre_gf DESC, pre.tk) AS rnk
                   FROM pre) r
             JOIN fmt f ON ((f.ls = r.ls)))
        ), post_seq AS (
         SELECT s.ls,
            s.match_id,
            s.tk,
            s.ok,
            row_number() OVER (PARTITION BY s.tk ORDER BY s.match_date, s.kickoff_time, s.match_id) AS gno
           FROM sm_side s
          WHERE (s.post_no > 0)
        ), votes AS (
         SELECT v.tk,
            v.pblock,
            row_number() OVER (PARTITION BY v.tk ORDER BY v.n DESC, (v.pblock = v.own_block) DESC, v.pblock) AS rn
           FROM ( SELECT q.tk,
                    o.pblock,
                    me.pblock AS own_block,
                    count(*) AS n
                   FROM (((post_seq q
                     JOIN prov me ON ((me.tk = q.tk)))
                     JOIN prov o ON ((o.tk = q.ok)))
                     JOIN fmt f ON ((f.ls = q.ls)))
                  WHERE (q.gno <= f.group_games[me.pblock])
                  GROUP BY q.tk, o.pblock, me.pblock) v
        ), blocks AS (
         SELECT p.ls,
            p.tk,
            p.pre_total,
            p.rnk,
            COALESCE(v.pblock, p.pblock) AS blk
           FROM (prov p
             LEFT JOIN votes v ON (((v.tk = p.tk) AND (v.rn = 1))))
        ), knockout AS (
         SELECT DISTINCT q.match_id
           FROM (((post_seq q
             JOIN blocks b ON ((b.tk = q.tk)))
             JOIN blocks bo ON ((bo.tk = q.ok)))
             JOIN fmt f ON ((f.ls = q.ls)))
          WHERE ((b.blk <> bo.blk) OR (q.gno > f.group_games[b.blk]))
        ), split_team AS (
         SELECT b.tk,
            (b.blk)::smallint AS split_group,
            (b.blk = ANY (f.halved_groups)) AS halved,
            f.halving_rounding,
            b.pre_total,
            f.tiebreak,
            b.rnk AS pre_rank
           FROM (blocks b
             JOIN fmt f ON ((f.ls = b.ls)))
        ), home AS (
         SELECT m.league_id,
            m.season_id,
            m.home_team_id AS team_id,
            count(*) AS n,
            count(*) FILTER (WHERE (m.full_time_home_goals > m.full_time_away_goals)) AS w,
            count(*) FILTER (WHERE (m.full_time_home_goals = m.full_time_away_goals)) AS d,
            count(*) FILTER (WHERE (m.full_time_home_goals < m.full_time_away_goals)) AS l,
            sum(m.full_time_home_goals) AS gf,
            sum(m.full_time_away_goals) AS ga,
            count(*) FILTER (WHERE (m.full_time_away_goals = 0)) AS cs,
            count(*) FILTER (WHERE (m.full_time_home_goals = 0)) AS fts
           FROM matches m
          WHERE ((m.league_id IN ( SELECT domestic_leagues.league_id
                   FROM domestic_leagues)) AND (m.full_time_home_goals IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM knockout
                  WHERE (knockout.match_id = m.match_id)))))
          GROUP BY m.league_id, m.season_id, m.home_team_id
        ), away AS (
         SELECT m.league_id,
            m.season_id,
            m.away_team_id AS team_id,
            count(*) AS n,
            count(*) FILTER (WHERE (m.full_time_away_goals > m.full_time_home_goals)) AS w,
            count(*) FILTER (WHERE (m.full_time_away_goals = m.full_time_home_goals)) AS d,
            count(*) FILTER (WHERE (m.full_time_away_goals < m.full_time_home_goals)) AS l,
            sum(m.full_time_away_goals) AS gf,
            sum(m.full_time_home_goals) AS ga,
            count(*) FILTER (WHERE (m.full_time_home_goals = 0)) AS cs,
            count(*) FILTER (WHERE (m.full_time_away_goals = 0)) AS fts
           FROM matches m
          WHERE ((m.league_id IN ( SELECT domestic_leagues.league_id
                   FROM domestic_leagues)) AND (m.full_time_home_goals IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
                   FROM knockout
                  WHERE (knockout.match_id = m.match_id)))))
          GROUP BY m.league_id, m.season_id, m.away_team_id
        ), agg AS (
         SELECT COALESCE(h.league_id, a.league_id) AS league_id,
            COALESCE(h.season_id, a.season_id) AS season_id,
            COALESCE(h.team_id, a.team_id) AS team_id,
            (COALESCE(h.n, (0)::bigint) + COALESCE(a.n, (0)::bigint))::integer AS played,
            (COALESCE(h.w, (0)::bigint) + COALESCE(a.w, (0)::bigint))::integer AS won,
            (COALESCE(h.d, (0)::bigint) + COALESCE(a.d, (0)::bigint))::integer AS drawn,
            (COALESCE(h.l, (0)::bigint) + COALESCE(a.l, (0)::bigint))::integer AS lost,
            (COALESCE(h.gf, (0)::bigint) + COALESCE(a.gf, (0)::bigint))::integer AS goals_for,
            (COALESCE(h.ga, (0)::bigint) + COALESCE(a.ga, (0)::bigint))::integer AS goals_against,
            (COALESCE(h.cs, (0)::bigint) + COALESCE(a.cs, (0)::bigint))::integer AS clean_sheets,
            (COALESCE(h.fts, (0)::bigint) + COALESCE(a.fts, (0)::bigint))::integer AS failed_to_score,
            ((3 * (COALESCE(h.w, (0)::bigint) + COALESCE(a.w, (0)::bigint))) + (COALESCE(h.d, (0)::bigint) + COALESCE(a.d, (0)::bigint)))::integer AS points_won,
            (COALESCE(h.n, (0)::bigint))::integer AS home_played,
            ((3 * COALESCE(h.w, (0)::bigint)) + COALESCE(h.d, (0)::bigint))::integer AS home_points,
            (COALESCE(h.gf, (0)::bigint))::integer AS home_goals_for,
            (COALESCE(h.ga, (0)::bigint))::integer AS home_goals_against,
            (COALESCE(a.n, (0)::bigint))::integer AS away_played,
            ((3 * COALESCE(a.w, (0)::bigint)) + COALESCE(a.d, (0)::bigint))::integer AS away_points,
            (COALESCE(a.gf, (0)::bigint))::integer AS away_goals_for,
            (COALESCE(a.ga, (0)::bigint))::integer AS away_goals_against,
            (COALESCE(h.w, (0)::bigint))::integer AS home_won,
            (COALESCE(h.d, (0)::bigint))::integer AS home_drawn,
            (COALESCE(h.l, (0)::bigint))::integer AS home_lost,
            (COALESCE(h.cs, (0)::bigint))::integer AS home_clean_sheets,
            (COALESCE(a.w, (0)::bigint))::integer AS away_won,
            (COALESCE(a.d, (0)::bigint))::integer AS away_drawn,
            (COALESCE(a.l, (0)::bigint))::integer AS away_lost,
            (COALESCE(a.cs, (0)::bigint))::integer AS away_clean_sheets
           FROM (home h
             FULL JOIN away a ON (((a.league_id = h.league_id) AND (a.season_id = h.season_id) AND (a.team_id = h.team_id))))
        ), shape AS (
         SELECT a.league_id,
            a.season_id,
            (count(*))::integer AS teams,
            ((sum(a.played))::integer / 2) AS matches,
            (a.season_id = ( SELECT cur.season_id
                   FROM cur)) AS is_current
           FROM agg a
          GROUP BY a.league_id, a.season_id
        ), ded AS MATERIALIZED (
         SELECT ((((point_deductions.league_id * 10000) + point_deductions.season_id) * 10000000) + point_deductions.team_id) AS tk,
            (sum(point_deductions.points))::integer AS pts
           FROM point_deductions
          GROUP BY ((((point_deductions.league_id * 10000) + point_deductions.season_id) * 10000000) + point_deductions.team_id)
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
            ((a.points_won + COALESCE(d.pts, 0)) + adj.split_adjustment) AS points,
            (((a.points_won + COALESCE(d.pts, 0)))::numeric - adj.exact_cut) AS rank_points,
            COALESCE(lf.curtailed_on_ppg, ((NOT s.is_current) AND (s.matches < (s.teams * (s.teams - 1))))) AS curtailed,
            ((lg.code = ANY (ARRAY['E1'::text, 'E2'::text, 'E3'::text])) AND (se_1.start_year <= 1998)) AS goals_scored_first,
            st.split_group,
            adj.split_adjustment,
            st.tiebreak,
            st.pre_rank,
            st.pre_total,
            ((((a.league_id * 10000) + a.season_id) * 10000000) + a.team_id) AS tk
           FROM (((((((agg a
             JOIN shape s USING (league_id, season_id))
             LEFT JOIN ded d ON ((d.tk = ((((a.league_id * 10000) + a.season_id) * 10000000) + a.team_id))))
             JOIN leagues lg ON ((lg.league_id = a.league_id)))
             JOIN seasons se_1 ON ((se_1.season_id = a.season_id)))
             LEFT JOIN league_season_formats lf ON (((lf.league_id = a.league_id) AND (lf.season_id = a.season_id))))
             LEFT JOIN split_team st ON ((st.tk = ((((a.league_id * 10000) + a.season_id) * 10000000) + a.team_id))))
             CROSS JOIN LATERAL ( SELECT
                        CASE
                            WHEN COALESCE(st.halved, false) THEN (
                            CASE
                                WHEN (st.halving_rounding = 'up'::text) THEN ceil(((st.pre_total)::numeric / 2.0))
                                ELSE floor(((st.pre_total)::numeric / 2.0))
                            END - (st.pre_total)::numeric)::integer
                            ELSE 0
                        END AS split_adjustment,
                        CASE
                            WHEN COALESCE(st.halved, false) THEN ((st.pre_total)::numeric / 2.0)
                            ELSE (0)::numeric
                        END AS exact_cut) adj)
        ), tied AS MATERIALIZED (
         SELECT x.tk,
            x.tiebreak,
            x.tie_key
           FROM ( SELECT sc.tk,
                    sc.tiebreak,
                    k.tie_key,
                    count(*) OVER (PARTITION BY k.tie_key) AS n
                   FROM (scored sc
                     CROSS JOIN LATERAL ( SELECT ((((((sc.league_id * 10000) + sc.season_id))::text || '/'::text) || (sc.split_group)::text) || '/'::text || (sc.rank_points)::text ||
                                CASE
                                    WHEN (sc.tiebreak = 'regular_points'::text) THEN ('/'::text || (sc.pre_total)::text)
                                    ELSE ''::text
                                END) AS tie_key) k)
                  WHERE (sc.tiebreak = ANY (ARRAY['head_to_head'::text, 'regular_points'::text]))) x
          WHERE (x.n > 1)
        ), tied_games AS MATERIALIZED (
         SELECT s.match_id,
            s.tk,
            s.ok,
            s.post_no,
            s.gf,
            s.ga
           FROM sm_side s
          WHERE ((s.tk IN ( SELECT tied.tk
                   FROM tied)) AND (s.ok IN ( SELECT tied.tk
                   FROM tied)))
        ), h2h AS MATERIALIZED (
         SELECT a.tk,
            sum(
                CASE
                    WHEN (g.gf > g.ga) THEN 3
                    WHEN (g.gf = g.ga) THEN 1
                    ELSE 0
                END) AS pts,
            sum((g.gf - g.ga)) AS gd,
            sum(g.gf) AS gf
           FROM ((tied_games g
             JOIN tied a ON ((a.tk = g.tk)))
             JOIN tied b ON (((b.tk = g.ok) AND (b.tie_key = a.tie_key))))
          WHERE (((a.tiebreak = 'head_to_head'::text) OR (g.post_no <= 0)) AND (NOT (EXISTS ( SELECT 1
                   FROM knockout k
                  WHERE (k.match_id = g.match_id)))))
          GROUP BY a.tk
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
            sc.split_group,
            sc.split_adjustment,
            (row_number() OVER (PARTITION BY sc.league_id, sc.season_id ORDER BY COALESCE((sc.split_group)::integer, 0), (
                CASE
                    WHEN sc.curtailed THEN ((sc.points)::numeric / (NULLIF(sc.played, 0))::numeric)
                    ELSE sc.rank_points
                END) DESC, (
                CASE sc.tiebreak
                    WHEN 'regular_position'::text THEN (- sc.pre_rank)
                    WHEN 'regular_points'::text THEN (sc.pre_total)::bigint
                    ELSE COALESCE(h.pts, (0)::bigint)
                END) DESC, (
                CASE sc.tiebreak
                    WHEN 'regular_points'::text THEN COALESCE(h.pts, (0)::bigint)
                    ELSE COALESCE(h.gd, (0)::bigint)
                END) DESC, (
                CASE sc.tiebreak
                    WHEN 'regular_points'::text THEN COALESCE(h.gd, (0)::bigint)
                    ELSE COALESCE(h.gf, (0)::bigint)
                END) DESC, (
                CASE sc.tiebreak
                    WHEN 'regular_points'::text THEN COALESCE(h.gf, (0)::bigint)
                    ELSE (0)::bigint
                END) DESC, (
                CASE
                    WHEN sc.goals_scored_first THEN sc.goals_for
                    ELSE (sc.goals_for - sc.goals_against)
                END) DESC, (
                CASE
                    WHEN sc.goals_scored_first THEN (sc.goals_for - sc.goals_against)
                    ELSE sc.goals_for
                END) DESC, t.canonical_name))::integer AS "position"
           FROM ((scored sc
             JOIN teams t USING (team_id))
             LEFT JOIN h2h h ON ((h.tk = sc.tk)))
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
    se.start_year AS season_start_year,
    r.split_group,
    r.split_adjustment
   FROM ((ranked r
     JOIN leagues l USING (league_id))
     JOIN seasons se USING (season_id));

-- CREATE OR REPLACE VIEW keeps grants, but check_model_integrity watches for
-- silently dropped ones; restate them.
grant select on public.league_standings to anon, authenticated, service_role;

comment on view public.league_standings is
  'Final or current league tables for every domestic league-season: deductions applied, curtailed seasons on points per game, split formats (league_season_formats) with locked groups, halved points and play-off ties left out. split_group / split_adjustment are null / 0 without a split.';
