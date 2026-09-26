-- Live definition exported from the database (view league_fit_status).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.league_fit_status with (security_invoker=true) as
 SELECT l.league_id,
    l.code AS league_code,
    l.name AS league_name,
    latest_attempt.fit_run_id AS latest_attempted_fit_run_id,
    latest_attempt.status AS latest_attempted_status,
    latest_attempt.fitted_at AS latest_attempted_fitted_at,
    latest_attempt.matches_used AS latest_attempted_matches_used,
    latest_attempt.converged AS latest_attempted_converged,
    latest_attempt.rejection_reason AS latest_attempted_rejection_reason,
    latest_attempt.validation_warnings AS latest_attempted_validation_warnings,
    accepted.fit_run_id AS accepted_fit_run_id,
    accepted.fitted_at AS accepted_fitted_at,
    accepted.matches_used AS accepted_matches_used,
    accepted.rho AS accepted_rho,
    accepted.home_advantage AS accepted_home_advantage
   FROM ((leagues l
     LEFT JOIN LATERAL ( SELECT m.fit_run_id,
            m.league_id,
            m.window_start_date,
            m.window_end_date,
            m.rho,
            m.home_advantage,
            m.decay_half_life_days,
            m.log_likelihood,
            m.converged,
            m.matches_used,
            m.fitted_at,
            m.status,
            m.rejection_reason,
            m.validation_warnings,
            m.validation_checks
           FROM model_fit_runs m
          WHERE (m.league_id = l.league_id)
          ORDER BY m.fitted_at DESC
         LIMIT 1) latest_attempt ON (true))
     LEFT JOIN LATERAL ( SELECT m.fit_run_id,
            m.league_id,
            m.window_start_date,
            m.window_end_date,
            m.rho,
            m.home_advantage,
            m.decay_half_life_days,
            m.log_likelihood,
            m.converged,
            m.matches_used,
            m.fitted_at,
            m.status,
            m.rejection_reason,
            m.validation_warnings,
            m.validation_checks
           FROM model_fit_runs m
          WHERE ((m.league_id = l.league_id) AND (m.status = 'accepted'::text))
          ORDER BY m.fitted_at DESC
         LIMIT 1) accepted ON (true))
  WHERE (l.competition_type = 'league'::text);
