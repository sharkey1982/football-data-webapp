-- Live definition exported from the database (function ai_tool_get_data_status(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_get_data_status(args jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object('tool', 'get_data_status',
    'source', jsonb_build_array('matches', 'fixtures', 'leagues', 'seasons', 'model_fit_runs', 'fpl_players', 'fpl_player_projections', 'fixture_broadcasts'),
    'as_of', now(), 'kind', 'observed',
    'freshness', jsonb_build_object(
      'results_last_loaded', (select max(updated_at) from matches),
      'latest_result_date', (select max(match_date) from matches),
      'fixtures_last_changed', (select max(updated_at) from fixtures),
      'latest_accepted_model_fit', (select max(fitted_at) from model_fit_runs where status = 'accepted'),
      'fpl_data_last_loaded', (select max(updated_at) from fpl_players where season_id = public.fpl_current_season_id()),
      'fpl_projections_generated', (select max(generated_at) from fpl_player_projections where model_version = 'leaguewide_v6'),
      'tv_listings_last_synced', (select max(last_synced_at) from fixture_broadcasts)),
    'coverage', (select jsonb_agg(r order by r.competition_type, r.country, r.competition) from (
      select l.name competition, l.code, c.name country, l.competition_type,
             public.ai_season_label((select s1.season_id from seasons s1 where s1.start_year = min(sn.start_year))) first_season, public.ai_season_label((select s1.season_id from seasons s1 where s1.start_year = max(sn.start_year))) latest_season,
             count(distinct m.season_id) seasons, count(*) results
        from matches m join seasons sn on sn.season_id = m.season_id join leagues l using (league_id) left join countries c on c.country_id = l.country_id
       group by l.name, l.code, c.name, l.competition_type) r),
    'fpl_seasons', (select jsonb_agg(distinct public.ai_season_label(season_id)) from fpl_player_season_totals))
$function$
;
