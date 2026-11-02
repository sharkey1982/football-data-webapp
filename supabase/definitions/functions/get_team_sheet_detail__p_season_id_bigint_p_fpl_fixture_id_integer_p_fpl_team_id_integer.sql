-- Live definition exported from the database (function get_team_sheet_detail(p_season_id bigint, p_fpl_fixture_id integer, p_fpl_team_id integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.get_team_sheet_detail(p_season_id bigint, p_fpl_fixture_id integer, p_fpl_team_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_out jsonb;
begin
  perform public._require_admin();

  select jsonb_build_object(
    'fixture_id', r.fpl_fixture_id, 'team_id', r.fpl_team_id, 'gw', r.fpl_event_id,
    'model_source', r.model_source, 'model_version', r.model_version, 'model_at', r.model_at,
    'baseline_fixture_id', r.baseline_fpl_fixture_id,
    'baseline_opponent', (select o.short_name from public.fpl_fixtures bf
                            join public.fpl_teams o on o.season_id = bf.season_id
                             and o.fpl_team_id = case when bf.fpl_home_team_id = r.fpl_team_id then bf.fpl_away_team_id else bf.fpl_home_team_id end
                           where bf.season_id = r.season_id and bf.fpl_fixture_id = r.baseline_fpl_fixture_id),
    'predicted', r.predicted, 'actual', r.actual, 'baseline', r.baseline,
    'formation', (select tm.formation from public.team_match_tactics tm
                   where tm.fixture_id = r.canonical_fixture_id and tm.team_id = r.canonical_team_id
                     and tm.source_name = 'bbc_screenshot'
                   order by tm.observed_at desc nulls last limit 1),
    'roles', (select coalesce(jsonb_object_agg(lp.fpl_player_id::text, lp.tactical_role), '{}'::jsonb)
                from public.fixture_lineup_positions lp
               where lp.fixture_id = r.canonical_fixture_id and lp.team_id = r.canonical_team_id
                 and lp.source_name = 'bbc_screenshot' and lp.fpl_player_id is not null),
    'subs', (select coalesce(jsonb_agg(jsonb_build_object(
                'minute', s.minute, 'off_id', s.player_off_fpl_id, 'on_id', s.player_on_fpl_id,
                'off', coalesce(poff.web_name, s.name_off), 'on', coalesce(pon.web_name, s.name_on))
               order by s.minute nulls last, s.name_on), '[]'::jsonb)
               from public.fixture_lineup_substitutions s
               left join public.fpl_players poff on poff.season_id = r.season_id and poff.fpl_player_id = s.player_off_fpl_id
               left join public.fpl_players pon on pon.season_id = r.season_id and pon.fpl_player_id = s.player_on_fpl_id
              where s.fixture_id = r.canonical_fixture_id and s.team_id = r.canonical_team_id
                and s.source_name = 'bbc_screenshot'),
    'subs_complete', (select bool_or(c.complete) from public.fixture_lineup_sub_coverage c
                       where c.fixture_id = r.canonical_fixture_id and c.team_id = r.canonical_team_id
                         and c.source_name = 'bbc_screenshot')
  ) into v_out
  from public.fpl_team_sheet_results r
  where r.season_id = p_season_id and r.fpl_fixture_id = p_fpl_fixture_id and r.fpl_team_id = p_fpl_team_id;

  return v_out;
end;
$function$
;
