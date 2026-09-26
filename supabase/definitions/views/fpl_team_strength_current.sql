-- Live definition exported from the database (view fpl_team_strength_current).
-- Do not edit here: change it with a migration; the next export will reflect it.

create or replace view public.fpl_team_strength_current as
 WITH latest_e0 AS (
         SELECT model_fit_runs.fit_run_id,
            model_fit_runs.league_id,
            model_fit_runs.window_start_date,
            model_fit_runs.window_end_date,
            model_fit_runs.rho,
            model_fit_runs.home_advantage,
            model_fit_runs.decay_half_life_days,
            model_fit_runs.matches_used,
            model_fit_runs.fitted_at
           FROM model_fit_runs
          WHERE ((model_fit_runs.league_id = 1) AND (model_fit_runs.status = 'accepted'::text))
          ORDER BY model_fit_runs.fitted_at DESC, model_fit_runs.fit_run_id DESC
         LIMIT 1
        ), current_teams AS (
         SELECT lf.fit_run_id,
            lf.league_id,
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
            ft.fpl_team_id,
            ft.name AS fpl_team_name,
            ft.short_name AS fpl_short_name
           FROM (((latest_e0 lf
             JOIN team_ratings tr ON ((tr.fit_run_id = lf.fit_run_id)))
             JOIN teams t ON ((t.team_id = tr.team_id)))
             JOIN fpl_teams ft ON ((ft.canonical_team_id = tr.team_id)))
        )
 SELECT fit_run_id,
    league_id,
    window_start_date,
    window_end_date,
    rho,
    home_advantage,
    decay_half_life_days,
    matches_used,
    fitted_at,
    team_id,
    canonical_name,
    attack_strength,
    defence_strength,
    is_estimated,
    fpl_team_id,
    fpl_team_name,
    fpl_short_name,
    round((((100)::double precision * percent_rank() OVER (ORDER BY attack_strength)))::numeric, 1) AS attack_score,
    round((((100)::double precision * percent_rank() OVER (ORDER BY defence_strength)))::numeric, 1) AS defence_score,
    round(((((50)::double precision * percent_rank() OVER (ORDER BY attack_strength)) + ((50)::double precision * percent_rank() OVER (ORDER BY defence_strength))))::numeric, 1) AS overall_score,
    rank() OVER (ORDER BY attack_strength DESC) AS attack_rank,
    rank() OVER (ORDER BY defence_strength DESC) AS defence_rank
   FROM current_teams c;
