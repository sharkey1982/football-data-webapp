-- Live definition exported from the database (materialized_view model_scorecard_matches).
-- Do not edit here: change it with a migration; the next export will reflect it.

create materialized view public.model_scorecard_matches as
 WITH cur AS (
         SELECT max(matches.season_id) AS s
           FROM matches
          WHERE ((matches.league_id >= 1) AND (matches.league_id <= 5))
        ), preds AS (
         SELECT m.match_id,
            m.league_id,
            m.season_id,
            m.match_date AS md,
            m.home_team_id,
            m.away_team_id,
            m.full_time_home_goals AS hg,
            m.full_time_away_goals AS ag,
            (mp.predicted_home_goals)::numeric AS lh,
            (mp.predicted_away_goals)::numeric AS la,
            mp.fit_run_id
           FROM (match_predictions mp
             JOIN matches m USING (match_id))
          WHERE ((m.season_id < ( SELECT cur.s
                   FROM cur)) AND (m.full_time_home_goals IS NOT NULL))
        UNION ALL
         SELECT m.match_id,
            m.league_id,
            m.season_id,
            m.match_date,
            m.home_team_id,
            m.away_team_id,
            m.full_time_home_goals,
            m.full_time_away_goals,
            (f.predicted_home_goals)::numeric AS predicted_home_goals,
            (f.predicted_away_goals)::numeric AS predicted_away_goals,
            f.prediction_fit_run_id
           FROM (fixtures f
             JOIN matches m ON (((m.home_team_id = f.home_team_id) AND (m.away_team_id = f.away_team_id) AND (m.match_date = f.kickoff_date) AND (m.league_id = f.league_id))))
          WHERE ((f.season_id = ( SELECT cur.s
                   FROM cur)) AND (f.status = 'played'::text) AND (f.predicted_home_goals IS NOT NULL) AND (m.full_time_home_goals IS NOT NULL))
        ), mk AS (
         SELECT o.match_id,
            ((1)::numeric / o.price_home) AS ih,
            ((1)::numeric / o.price_draw) AS id,
            ((1)::numeric / o.price_away) AS ia
           FROM match_odds o
          WHERE ((o.market = '1x2'::text) AND o.is_closing AND (o.bookmaker = 'Avg'::text) AND (o.price_home > (1)::numeric) AND (o.price_draw > (1)::numeric) AND (o.price_away > (1)::numeric))
        )
 SELECT p.match_id,
    p.league_id,
    p.season_id,
    p.md AS match_date,
    p.fit_run_id,
    r.model_version,
        CASE
            WHEN (EXISTS ( SELECT 1
               FROM team_ratings t
              WHERE ((t.fit_run_id = p.fit_run_id) AND (t.team_id = ANY (ARRAY[p.home_team_id, p.away_team_id])) AND t.is_estimated))) THEN 'estimated'::text
            WHEN (EXISTS ( SELECT 1
               FROM team_season_movement v
              WHERE ((v.season_id = p.season_id) AND (v.league_id = p.league_id) AND (v.team_id = ANY (ARRAY[p.home_team_id, p.away_team_id])) AND (v.movement = 'relegated'::text)))) THEN 'relegated'::text
            WHEN (EXISTS ( SELECT 1
               FROM team_season_movement v
              WHERE ((v.season_id = p.season_id) AND (v.league_id = p.league_id) AND (v.team_id = ANY (ARRAY[p.home_team_id, p.away_team_id])) AND v.is_promoted))) THEN 'promoted'::text
            ELSE 'established'::text
        END AS team_type,
        CASE
            WHEN (EXTRACT(month FROM p.md) = ANY (ARRAY[(7)::numeric, (8)::numeric, (9)::numeric, (10)::numeric])) THEN '1 Aug-Oct'::text
            WHEN (EXTRACT(month FROM p.md) = ANY (ARRAY[(11)::numeric, (12)::numeric])) THEN '2 Nov-Dec'::text
            WHEN (EXTRACT(month FROM p.md) = ANY (ARRAY[(1)::numeric, (2)::numeric, (3)::numeric])) THEN '3 Jan-Mar'::text
            ELSE '4 Apr-May'::text
        END AS phase,
        CASE
            WHEN (p.hg > p.ag) THEN 'H'::text
            WHEN (p.hg = p.ag) THEN 'D'::text
            ELSE 'A'::text
        END AS result,
    p.hg,
    p.ag,
    p.lh,
    p.la,
    (dm.home_win / 100.0) AS p_home,
    (dm.draw / 100.0) AS p_draw,
    (dm.away_win / 100.0) AS p_away,
    (mk.ih / ((mk.ih + mk.id) + mk.ia)) AS m_home,
    (mk.id / ((mk.ih + mk.id) + mk.ia)) AS m_draw,
    (mk.ia / ((mk.ih + mk.id) + mk.ia)) AS m_away
   FROM (((preds p
     JOIN mk USING (match_id))
     LEFT JOIN model_fit_runs r ON ((r.fit_run_id = p.fit_run_id)))
     CROSS JOIN LATERAL fixture_derived_markets(p.lh, p.la, (COALESCE(r.rho, (0)::double precision))::numeric) dm(home_win, draw, away_win, over_2_5, under_2_5, btts, home_clean_sheet, away_clean_sheet));
