-- OUTSTANDING.md: "Strength views pick the latest CONVERGED fit, not the
-- latest ACCEPTED one." Confirmed live before fixing: 5 rejected fits (#2,
-- #3, #6, #7, #38) have converged = true, including the two retired for the
-- scoring-level bug (~30% too few goals). No live fit currently differs
-- between the two rules, so this changed nothing today -- it closes the door
-- for next time.
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
          WHERE (model_fit_runs.status = 'accepted')
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
          WHERE ((model_fit_runs.league_id = 1) AND (model_fit_runs.status = 'accepted'))
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

-- CREATE OR REPLACE VIEW on both dropped their anon/authenticated SELECT
-- grants (caught immediately here by verifying as anon after every change,
-- before any public request could have hit it). Restore, and add a guard:
-- an explicit, extensible list of public-facing views that must stay
-- readable by anon. Named list rather than "all views", since some views are
-- legitimately admin/service-only.
grant select on public.team_strength_current, public.fpl_team_strength_current to anon, authenticated, service_role;

do $$
declare
  def text := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  anchor text := 'having count(*) > 1) q) x;
$function$';
  n int;
begin
  if def ilike '%public_views_readable_by_anon%' then return; end if;
  n := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
  if n <> 1 then raise exception 'anchor matched % times', n; end if;
  execute replace(def, anchor, 'having count(*) > 1) q) x
  union all
  select ''public_views_readable_by_anon'', case when n = 0 then ''ok'' else ''failed'' end, n,
    ''Public-facing views anon cannot SELECT (grants silently dropped, e.g. by CREATE OR REPLACE VIEW): '' || coalesce(names, '''')
  from (select count(*) n, string_agg(v, '', '') names from (
          select unnest(array[
            ''team_strength_current'', ''fpl_team_strength_current'', ''league_standings'',
            ''model_scorecard_matches''
          ]) v) q
        where not has_table_privilege(''anon'', (''public.'' || q.v)::regclass, ''SELECT'')) x;
$function$');
end $$;
