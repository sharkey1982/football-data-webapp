-- Live definition exported from the database (function penalty_import_store(p_run jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.penalty_import_store(p_run jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_id bigint;
  v_err text := nullif(p_run->>'error', '');
  v_warn text := nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(p_run->'warnings', '[]'::jsonb))), ' | '), '');
  v_status text;
  v_matches int := jsonb_array_length(coalesce(p_run->'matches', '[]'::jsonb));
  v_goals int; v_pens int; v_unmatched int;
begin
  v_status := case when v_err is not null then 'failed' when v_warn is not null then 'warning' else 'success' end;
  insert into public.penalty_import_runs (started_at, finished_at, mode, triggered_by, from_date, to_date, api_requests, matches, detail_types, warnings, error_message, status)
  values (coalesce((p_run->>'started_at')::timestamptz, now()), now(), p_run->>'mode', p_run->>'triggered_by',
          (p_run->>'from_date')::date, (p_run->>'to_date')::date, coalesce((p_run->>'api_requests')::int, 0), v_matches,
          p_run->'detail_types', left(v_warn, 4000), left(v_err, 2000), v_status)
  returning run_id into v_id;

  if v_status <> 'failed' then
    insert into public.espn_pl_matches (espn_event_id, match_date, kickoff, completed, home_name, away_name, home_score, away_score,
                                        home_team_id, away_team_id, run_id, updated_at)
    select x->>'espn_event_id', (x->>'date')::date, (x->>'kickoff')::timestamptz, coalesce((x->>'completed')::boolean, false),
           x->>'home', x->>'away', (x->>'home_score')::int, (x->>'away_score')::int,
           public.penalty_match_team(x->>'home'), public.penalty_match_team(x->>'away'), v_id, now()
      from jsonb_array_elements(coalesce(p_run->'matches', '[]'::jsonb)) x
    on conflict (espn_event_id) do update set match_date = excluded.match_date, kickoff = excluded.kickoff, completed = excluded.completed,
      home_name = excluded.home_name, away_name = excluded.away_name, home_score = excluded.home_score, away_score = excluded.away_score,
      home_team_id = excluded.home_team_id, away_team_id = excluded.away_team_id, run_id = excluded.run_id, updated_at = now();

    -- Our fixture: same teams, kickoff within a day (UK dates v UTC).
    update public.espn_pl_matches m set fixture_id = f.fixture_id
      from public.fixtures f
     where m.run_id = v_id and f.league_id = 1 and f.home_team_id = m.home_team_id and f.away_team_id = m.away_team_id
       and f.kickoff_date between m.match_date - 1 and m.match_date + 1;

    -- A re-read replaces that match's goals (ESPN corrections heal).
    delete from public.espn_pl_goals g
     where g.espn_event_id in (select x->>'espn_event_id' from jsonb_array_elements(coalesce(p_run->'matches', '[]'::jsonb)) x);
    insert into public.espn_pl_goals (goal_key, espn_event_id, team_name, player_name, espn_player_id, minute, clock_seconds,
                                      scoring, penalty, own_goal, type_text, team_id, run_id)
    select md5(concat_ws('|', x->>'espn_event_id', x->>'minute', x->>'player', x->>'type_text', x->>'clock_seconds')),
           x->>'espn_event_id', x->>'team', x->>'player', x->>'espn_player_id', x->>'minute', (x->>'clock_seconds')::numeric,
           coalesce((x->>'scoring')::boolean, true), coalesce((x->>'penalty')::boolean, false), coalesce((x->>'own_goal')::boolean, false),
           x->>'type_text', public.penalty_match_team(x->>'team'), v_id
      from jsonb_array_elements(coalesce(p_run->'goals', '[]'::jsonb)) x
     where exists (select 1 from public.espn_pl_matches m where m.espn_event_id = x->>'espn_event_id')
    on conflict (goal_key) do nothing;
    -- Own goals are credited to the other side by ESPN's team field; no player match for them.
    update public.espn_pl_goals g set fpl_player_id = public.penalty_match_player(g.team_id, g.player_name)
     where g.run_id = v_id and not g.own_goal and g.team_id is not null;
  end if;

  select count(*), count(*) filter (where penalty and scoring), count(*) filter (where fpl_player_id is null and not own_goal)
    into v_goals, v_pens, v_unmatched from public.espn_pl_goals where run_id = v_id;
  if v_status = 'success' and v_unmatched > 0 then v_status := 'warning'; end if;
  update public.penalty_import_runs set goals = v_goals, penalty_goals = v_pens, unmatched_players = v_unmatched, status = v_status where run_id = v_id;

  insert into public.pipeline_runs (job_name, started_at, finished_at, status, summary, error_message, rows_inserted)
  values ('penalty_import', coalesce((p_run->>'started_at')::timestamptz, now()), now(), v_status,
          format('%s: %s to %s, %s matches, %s goals (%s penalties), %s unmatched scorers, %s requests',
                 coalesce(p_run->>'mode', '?'), coalesce(p_run->>'from_date', '?'), coalesce(p_run->>'to_date', '?'),
                 v_matches, v_goals, v_pens, v_unmatched, coalesce(p_run->>'api_requests', '0')),
          case when v_status = 'failed' then left(v_err, 500) when v_warn is not null then left(v_warn, 500) end,
          v_goals);
  return jsonb_build_object('run_id', v_id, 'status', v_status, 'matches', v_matches, 'goals', v_goals, 'penalty_goals', v_pens, 'unmatched', v_unmatched);
end;
$function$
;
