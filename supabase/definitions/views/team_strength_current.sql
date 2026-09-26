-- Live definition exported from the database (view team_strength_current).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.team_strength_current as
 WITH latest_fit AS (
         SELECT DISTINCT ON (model_fit_runs.league_id) model_fit_runs.fit_run_id,
            model_fit_runs.league_id,
            model_fit_runs.window_start_date,
            model_fit_runs.window_end_date,
            model_fit_runs.rho,
            model_fit_runs.home_advantage,
            model_fit_runs.decay_half_life_days,
            model_fit_runs.matches_used,
            model_fit_runs.fitted_at
           FROM model_fit_runs
          WHERE (model_fit_runs.status = 'accepted'::text)
          ORDER BY model_fit_runs.league_id, model_fit_runs.fitted_at DESC, model_fit_runs.fit_run_id DESC
        ), rated AS (
         SELECT lf.league_id,
            lf.fit_run_id,
            lf.window_start_date,
            lf.window_end_date,
            lf.rho,
            lf.home_advantage,
            lf.decay_half_life_days,
            lf.matches_used,
            lf.fitted_at,
            tr.team_id,
            t.canonical_name,
            tr.attack_strength,
            tr.defence_strength,
            tr.is_estimated,
            round((((100)::double precision * percent_rank() OVER (PARTITION BY lf.fit_run_id ORDER BY tr.attack_strength)))::numeric, 1) AS attack_score,
            round((((100)::double precision * percent_rank() OVER (PARTITION BY lf.fit_run_id ORDER BY tr.defence_strength)))::numeric, 1) AS defence_score,
            rank() OVER (PARTITION BY lf.fit_run_id ORDER BY tr.attack_strength DESC) AS attack_rank,
            rank() OVER (PARTITION BY lf.fit_run_id ORDER BY tr.defence_strength DESC) AS defence_rank
           FROM ((latest_fit lf
             JOIN team_ratings tr ON ((tr.fit_run_id = lf.fit_run_id)))
             JOIN teams t ON ((t.team_id = tr.team_id)))
        )
 SELECT r.league_id,
    r.fit_run_id,
    r.window_start_date,
    r.window_end_date,
    r.rho,
    r.home_advantage,
    r.decay_half_life_days,
    r.matches_used,
    r.fitted_at,
    r.team_id,
    r.canonical_name,
    r.attack_strength,
    r.defence_strength,
    r.is_estimated,
    r.attack_score,
    r.defence_score,
    r.attack_rank,
    r.defence_rank,
    round(((r.attack_score + r.defence_score) / (2)::numeric), 1) AS overall_score,
    ft.fpl_team_id,
    ft.name AS fpl_team_name,
    ft.short_name AS fpl_short_name
   FROM (rated r
     LEFT JOIN fpl_teams ft ON ((ft.canonical_team_id = r.team_id)));
