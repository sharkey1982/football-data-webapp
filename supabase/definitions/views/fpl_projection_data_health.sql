-- Live definition exported from the database (view fpl_projection_data_health).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_projection_data_health as
 SELECT fixture_id,
    kickoff_date,
    has_team_xg AS team_forecast_ready,
    lineup_sources,
    lineup_player_rows,
    projection_rows,
        CASE
            WHEN (readiness_status = 'ready'::text) THEN 'ready'::text
            WHEN ((readiness_status = ANY (ARRAY['missing'::text, 'partial'::text, 'stale'::text])) AND has_team_xg AND (lineup_sources = 0)) THEN 'awaiting_player_projection'::text
            WHEN (readiness_status = ANY (ARRAY['past'::text, 'outside_horizon'::text])) THEN readiness_status
            ELSE 'incomplete'::text
        END AS projection_status,
    readiness_status,
    production_model,
    fpl_event_id
   FROM fpl_projection_fixture_readiness;
