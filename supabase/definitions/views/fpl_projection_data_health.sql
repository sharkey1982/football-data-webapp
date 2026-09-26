-- Live definition exported from the database (view fpl_projection_data_health).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_projection_data_health with (security_invoker=true) as
 SELECT fixture_id,
    kickoff_date,
    has_team_xg AS team_forecast_ready,
    lineup_sources,
    lineup_player_rows,
    projection_rows,
        CASE
            WHEN (has_team_xg AND (projection_rows > 0)) THEN 'ready'::text
            WHEN (has_team_xg AND (lineup_sources = 0)) THEN 'awaiting_player_projection'::text
            ELSE 'incomplete'::text
        END AS projection_status
   FROM fpl_projection_fixture_readiness r;
