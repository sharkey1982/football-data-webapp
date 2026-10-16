-- Live definition exported from the database (view fpl_projection_fixture_readiness).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_projection_fixture_readiness as
 WITH cfg AS (
         SELECT fpl_current_season_id() AS season_id,
            fpl_production_model_version() AS model_version,
            ai_next_fpl_gameweek(fpl_current_season_id()) AS first_gw
        ), prod AS (
         SELECT p.fixture_id,
            pl.canonical_team_id AS team_id,
            count(*) AS n_rows,
            count(DISTINCT p.fpl_player_id) AS n_players,
            max(p.generated_at) AS generated_at
           FROM ((fpl_player_projections p
             JOIN cfg ON (((cfg.season_id = p.season_id) AND (cfg.model_version = p.model_version))))
             LEFT JOIN fpl_players pl ON (((pl.season_id = p.season_id) AND (pl.fpl_player_id = p.fpl_player_id))))
          WHERE (COALESCE(p.scenario_key, 'baseline'::text) = 'baseline'::text)
          GROUP BY p.fixture_id, pl.canonical_team_id
        ), team_norm AS (
         SELECT pr.team_id,
            percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((pr.n_players)::double precision)) AS median_players
           FROM ((prod pr
             JOIN fpl_fixtures ff ON ((ff.canonical_fixture_id = pr.fixture_id)))
             JOIN cfg ON ((cfg.season_id = ff.season_id)))
          WHERE ((ff.fpl_event_id >= cfg.first_gw) AND (ff.fpl_event_id <= (cfg.first_gw + 9)))
          GROUP BY pr.team_id
        ), newest AS (
         SELECT max(pr.generated_at) AS generated_at
           FROM prod pr
        ), base AS (
         SELECT f.fixture_id,
            f.kickoff_date,
            f.home_team_id,
            f.away_team_id,
            f.predicted_home_goals,
            f.predicted_away_goals,
            cfg.model_version,
            ff.fpl_event_id,
            COALESCE(((ff.fpl_event_id >= cfg.first_gw) AND (ff.fpl_event_id <= (cfg.first_gw + 9))), false) AS in_horizon,
            (COALESCE(( SELECT sum(pr.n_rows) AS sum
                   FROM prod pr
                  WHERE (pr.fixture_id = f.fixture_id)), (0)::numeric))::bigint AS projection_rows,
            (COALESCE(( SELECT sum(pr.n_players) AS sum
                   FROM prod pr
                  WHERE (pr.fixture_id = f.fixture_id)), (0)::numeric))::bigint AS projected_players,
            ( SELECT max(pr.generated_at) AS max
                   FROM prod pr
                  WHERE (pr.fixture_id = f.fixture_id)) AS generated_at,
            (EXISTS ( SELECT 1
                   FROM ((( VALUES (f.home_team_id), (f.away_team_id)) s(team_id)
                     LEFT JOIN prod pr ON (((pr.fixture_id = f.fixture_id) AND (pr.team_id = s.team_id))))
                     JOIN team_norm tn ON ((tn.team_id = s.team_id)))
                  WHERE ((COALESCE(pr.n_players, (0)::bigint))::double precision < ((0.8)::double precision * tn.median_players)))) AS side_short,
            COALESCE(( SELECT count(*) AS count
                   FROM fpl_player_projections o
                  WHERE ((o.fixture_id = f.fixture_id) AND (o.model_version IS DISTINCT FROM cfg.model_version))), (0)::bigint) AS other_model_rows
           FROM (((fixtures f
             JOIN leagues l ON ((l.league_id = f.league_id)))
             CROSS JOIN cfg)
             LEFT JOIN fpl_fixtures ff ON (((ff.season_id = cfg.season_id) AND (ff.canonical_fixture_id = f.fixture_id))))
          WHERE ((f.season_id = cfg.season_id) AND (l.code = 'E0'::text))
        )
 SELECT fixture_id,
    kickoff_date,
    home_team_id,
    away_team_id,
    predicted_home_goals,
    predicted_away_goals,
    ((predicted_home_goals IS NOT NULL) AND (predicted_away_goals IS NOT NULL)) AS has_team_xg,
    COALESCE(( SELECT count(*) AS count
           FROM fixture_lineup_predictions lp
          WHERE (lp.fixture_id = b.fixture_id)), (0)::bigint) AS lineup_sources,
    COALESCE(( SELECT count(*) AS count
           FROM (fixture_lineup_prediction_players lpp
             JOIN fixture_lineup_predictions lp ON ((lp.lineup_prediction_id = lpp.lineup_prediction_id)))
          WHERE (lp.fixture_id = b.fixture_id)), (0)::bigint) AS lineup_player_rows,
    projection_rows,
    model_version AS production_model,
    fpl_event_id,
    in_horizon,
    projected_players,
    generated_at,
    other_model_rows,
        CASE
            WHEN ((kickoff_date < CURRENT_DATE) AND (NOT in_horizon)) THEN 'past'::text
            WHEN (NOT in_horizon) THEN 'outside_horizon'::text
            WHEN (projection_rows = 0) THEN 'missing'::text
            WHEN side_short THEN 'partial'::text
            WHEN (generated_at < (( SELECT newest.generated_at
               FROM newest) - '36:00:00'::interval)) THEN 'stale'::text
            ELSE 'ready'::text
        END AS readiness_status
   FROM base b;
