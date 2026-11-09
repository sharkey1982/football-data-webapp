-- Live definition exported from the database (function get_team_sheet_accuracy(p_season_id bigint)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_team_sheet_accuracy(p_season_id bigint DEFAULT NULL::bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_season bigint := coalesce(p_season_id, public.fpl_current_season_id());
  v_out jsonb;
begin
  perform public._require_admin();

  select jsonb_build_object(
    'season_id', v_season,
    'computed_at', (select max(r.computed_at) from public.fpl_team_sheet_results r where r.season_id = v_season),
    'games', coalesce(jsonb_agg(jsonb_build_object(
        'gw', r.fpl_event_id, 'fixture_id', r.fpl_fixture_id, 'team_id', r.fpl_team_id,
        'team', t.name, 'team_short', t.short_name, 'opponent', o.name, 'opponent_short', o.short_name,
        'home', r.is_home, 'kickoff', r.kickoff_time, 'starters', r.starters, 'final', r.final,
        'model_source', r.model_source, 'model_version', r.model_version, 'model_at', r.model_at,
        'model_matched', r.model_matched, 'baseline_matched', r.baseline_matched,
        -- the starter we gave the lowest chance
        'surprise', (select jsonb_build_object('name', a->>'name', 'sp', (a->>'sp')::numeric)
                       from jsonb_array_elements(r.actual) a
                      where (a->>'predicted')::boolean is false
                      order by (a->>'sp')::numeric, a->>'name' limit 1),
        -- the predicted starter who didn't start, most owned first
        'left_out', (select jsonb_build_object('name', p->>'name', 'sp', (p->>'sp')::numeric, 'own', (p->>'own')::numeric)
                       from jsonb_array_elements(r.predicted) p
                      where (p->>'started')::boolean is false
                      order by (p->>'own')::numeric desc nulls last, (p->>'sp')::numeric desc limit 1),
        'new_in', (select coalesce(jsonb_agg(a->>'name' order by a->>'name'), '[]'::jsonb)
                     from jsonb_array_elements(r.actual) a where (a->>'in_baseline')::boolean is false)
      ) order by r.fpl_event_id, r.kickoff_time, r.fpl_fixture_id, r.is_home desc), '[]'::jsonb)
  ) into v_out
  from public.fpl_team_sheet_results r
  left join public.fpl_teams t on t.season_id = r.season_id and t.fpl_team_id = r.fpl_team_id
  left join public.fpl_teams o on o.season_id = r.season_id and o.fpl_team_id = r.opponent_fpl_team_id
  where r.season_id = v_season;

  return v_out;
end;
$function$
;
