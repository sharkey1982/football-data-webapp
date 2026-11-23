-- Live definition exported from the database (function ai_tool_get_competition_summary(args jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.ai_tool_get_competition_summary(args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c jsonb; lid bigint; sid bigint;
begin
  if not args ? 'competition' then return jsonb_build_object('error', 'competition is required'); end if;
  c := public.ai_resolve_competition(args->>'competition'); if c ? 'error' then return c; end if;
  lid := (c->>'league_id')::bigint;
  sid := public.ai_resolve_season(lid, args->>'season');
  return jsonb_build_object('tool', 'get_competition_summary', 'source', jsonb_build_array('matches'),
    'as_of', now(), 'kind', 'observed',
    'rows', (select jsonb_agg(r) from (
      select c->>'competition' competition, public.ai_season_label(sid) season, count(*) matches_played,
             sum(full_time_home_goals + full_time_away_goals) total_goals,
             round(avg(full_time_home_goals + full_time_away_goals), 2) goals_per_game,
             round(avg(full_time_home_goals), 2) home_goals_per_game, round(avg(full_time_away_goals), 2) away_goals_per_game,
             count(*) filter (where full_time_result = 'H') home_wins, count(*) filter (where full_time_result = 'D') draws,
             count(*) filter (where full_time_result = 'A') away_wins,
             min(match_date) first_match, max(match_date) latest_match
        from matches where league_id = lid and season_id = sid and full_time_home_goals is not null) r));
end $function$
;
