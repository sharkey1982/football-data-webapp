-- Live definition exported from the database (view fpl_prediction_actual_start_comparison).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_prediction_actual_start_comparison with (security_invoker=true) as
 SELECT f.fixture_id,
    f.matchweek,
    f.kickoff_date,
    f.kickoff_time,
    a.team_id,
    a.fpl_player_id,
    a.player_name_source,
    a.web_name,
    a.starter AS actual_started,
    a.minutes AS actual_minutes,
    p.model_version,
    p.start_probability AS predicted_start_probability,
    p.expected_minutes AS predicted_minutes,
    p.generated_at,
    (p.generated_at < ((f.kickoff_date)::timestamp without time zone + (COALESCE(f.kickoff_time, '00:00:00'::time without time zone))::interval)) AS generated_pre_kickoff
   FROM ((fixture_actual_lineup_players a
     JOIN fixtures f ON ((f.fixture_id = a.fixture_id)))
     LEFT JOIN LATERAL ( SELECT pp.model_version,
            pp.start_probability,
            pp.expected_minutes,
            pp.generated_at
           FROM fpl_player_projections pp
          WHERE ((pp.fixture_id = a.fixture_id) AND (pp.fpl_player_id = a.fpl_player_id))
          ORDER BY pp.generated_at DESC
         LIMIT 1) p ON (true))
  WHERE (a.starter OR (a.minutes > 0));
