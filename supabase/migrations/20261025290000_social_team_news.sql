-- ============================================================================
-- Team news on X (Chris, 25 Oct 2026: "Even if it is players not starting
-- who are owned by above x percent of players - this can be an interesting
-- post"). Facts only: no model claims, no "surprise" wording.
--
-- For each Premier League kick-off slot, once FPL's live data shows 11
-- starters per team (private.social_lineup_starters, kick-off + 5 to + 45
-- minutes on the 5-minute line-ups tick):
--   * Not starting: players owned by 10%+ of FPL managers who are not in
--     the XI, most owned first (up to 6). Players already ruled out at the
--     deadline (injured, suspended, unavailable, 0%) are left out: that is
--     not news. A short reason where our data has one: doubtful at the
--     deadline, flagged since, or started a cup/European game in the
--     previous 5 days. Nothing otherwise.
--   * Starting despite a doubt: players owned by 5%+ who start after an FPL
--     doubt flag at the deadline.
-- Nothing qualifying: no post. Queued 5 minutes after it is made; expires
-- kick-off + 60. Not in auto_post_types yet: the first real one (GW9,
-- Sat 31 Oct 12:30) is a draft for Chris to see.
-- ============================================================================

alter table public.social_post_candidates drop constraint social_post_candidates_post_type_check;
alter table public.social_post_candidates add constraint social_post_candidates_post_type_check check (post_type = any (array[
  'fpl_captaincy', 'team_xg_change', 'prediction_accuracy', 'historical_insight', 'announcement', 'fpl_price_changes',
  'gameweek_thread', 'fpl_availability', 'fpl_market', 'fpl_week_changes', 'gameweek_outlook', 'fixture_moved',
  'match_predictions', 'quiz', 'quiz_answer', 'fact', 'daily_market', 'lineup_vs_model', 'team_news']));

-- One slot's facts: who is not starting, who starts despite a doubt.
create or replace function private.social_team_news_facts(p_season bigint, p_slot timestamptz, p_wait_until_complete boolean)
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp as $$
declare v_ready integer[]; v_all integer; v_out jsonb; v_doubts jsonb; v_games jsonb;
begin
  -- Teams in the slot whose XI is in (11 with minutes for that fixture).
  with fx as (
    select ff.fpl_fixture_id, ff.fpl_event_id, ff.fpl_home_team_id th, ff.fpl_away_team_id ta
      from public.fpl_fixtures ff where ff.season_id = p_season and ff.kickoff_time = p_slot),
  st as (select f.fpl_fixture_id, s.fpl_team_id, s.fpl_player_id
           from fx f cross join lateral private.social_lineup_starters(p_season, f.fpl_fixture_id) s),
  teams as (select fpl_fixture_id, th tid from fx union all select fpl_fixture_id, ta from fx)
  select array_agg(t.tid) filter (where (select count(*) from st where st.fpl_fixture_id = t.fpl_fixture_id and st.fpl_team_id = t.tid) >= 11),
         count(*)
    into v_ready, v_all from teams t;
  if coalesce(array_length(v_ready, 1), 0) = 0 or (p_wait_until_complete and array_length(v_ready, 1) < v_all) then
    return jsonb_build_object('ready', false, 'teams_ready', coalesce(array_length(v_ready, 1), 0), 'teams', v_all);
  end if;

  with fx as (
    select ff.fpl_fixture_id, ff.fpl_event_id, ff.kickoff_time, ff.fpl_home_team_id th, ff.fpl_away_team_id ta
      from public.fpl_fixtures ff where ff.season_id = p_season and ff.kickoff_time = p_slot),
  st as (select s.fpl_team_id, s.fpl_player_id
           from fx f cross join lateral private.social_lineup_starters(p_season, f.fpl_fixture_id) s),
  squad as (
    select p.fpl_player_id, p.web_name, p.fpl_team_id, t.name team, p.selected_by_percent own,
           p.status cur_status, p.news cur_news, ds.status dl_status, ds.chance_of_playing_next_round dl_chance,
           f.fpl_event_id, f.kickoff_time,
           exists (select 1 from st where st.fpl_player_id = p.fpl_player_id) starting
      from public.fpl_players p
      join public.fpl_teams t on t.season_id = p_season and t.fpl_team_id = p.fpl_team_id
      join fx f on p.fpl_team_id in (f.th, f.ta)
      left join public.fpl_deadline_player_state ds on ds.season_id = p_season and ds.fpl_event_id = f.fpl_event_id
                                                   and ds.snapshot_kind = 'pre_deadline' and ds.fpl_player_id = p.fpl_player_id
     where p.season_id = p_season and p.fpl_team_id = any(v_ready))
  select
    (select coalesce(jsonb_agg(jsonb_build_object('id', s.fpl_player_id, 'name', s.web_name, 'team', s.team,
                                                  'own', round(s.own)::int, 'reason', s.reason) order by s.own desc, s.web_name), '[]')
       from (select q.*,
                    case
                      when q.dl_status = 'd' then format('doubtful at the deadline (%s%%)', coalesce(q.dl_chance, 50))
                      when coalesce(q.dl_status, 'a') = 'a' and q.cur_status <> 'a' then
                        'flagged since the deadline' || coalesce(': ' || nullif(lower(split_part(q.cur_news, ' - ', 1)), ''), '')
                      else (select format('started in the %s on %s', replace(l.name, 'UEFA ', ''), trim(to_char(cf.kickoff_date, 'Day')))
                              from public.cup_lineup_players c
                              join public.fixtures cf on cf.fixture_id = c.fixture_id
                              join public.leagues l on l.league_id = cf.league_id
                             where c.fpl_player_id = q.fpl_player_id and coalesce(c.started, false)
                               and cf.kickoff_date between (q.kickoff_time at time zone 'Europe/London')::date - 5
                                                       and (q.kickoff_time at time zone 'Europe/London')::date - 1
                             order by cf.kickoff_date desc limit 1)
                    end reason
               from squad q
              where not q.starting and q.own >= 10
                and coalesce(q.dl_status, 'a') not in ('i', 's', 'u', 'n')
                and coalesce(q.dl_chance, 100) > 0
              order by q.own desc limit 6) s),
    (select coalesce(jsonb_agg(jsonb_build_object('id', q.fpl_player_id, 'name', q.web_name, 'team', q.team,
                                                  'own', round(q.own)::int, 'chance', coalesce(q.dl_chance, 50)) order by q.own desc), '[]')
       from (select * from squad q where q.starting and q.own >= 5 and q.dl_status = 'd' order by q.own desc limit 4) q),
    (select jsonb_agg(jsonb_build_object('home', th.name, 'away', ta.name) order by f.fpl_fixture_id)
       from fx f join public.fpl_teams th on th.season_id = p_season and th.fpl_team_id = f.th
                 join public.fpl_teams ta on ta.season_id = p_season and ta.fpl_team_id = f.ta)
    into v_out, v_doubts, v_games;

  return jsonb_build_object('ready', true, 'teams_ready', array_length(v_ready, 1), 'teams', v_all,
                            'not_starting', v_out, 'doubts_starting', v_doubts, 'games', v_games);
end;
$$;

create or replace function private.social_detect_team_news(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_slot timestamptz; v_key text; v_f jsonb; v_out jsonb := '[]'; v_label text; v_head text;
  v_lines text; v_dlines text; v_tmp text; v_posts text[]; v_id bigint; e jsonb;
begin
  for v_slot in
    select distinct ff.kickoff_time from public.fpl_fixtures ff
     where ff.season_id = v_season and ff.kickoff_time between now() - interval '45 minutes' and now() - interval '5 minutes'
  loop
    v_key := format('team_news:%s', to_char(v_slot at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI'));
    if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then continue; end if;
    -- Wait for every team in the slot until kick-off + 25, then go with those that are in.
    v_f := private.social_team_news_facts(v_season, v_slot, now() < v_slot + interval '25 minutes');
    if not (v_f->>'ready')::boolean then
      v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'none', 'reason', 'line-ups not all in yet');
      continue;
    end if;
    if jsonb_array_length(v_f->'not_starting') = 0 and jsonb_array_length(v_f->'doubts_starting') = 0 then
      v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'none', 'reason', 'no highly owned player left out, no doubt starting');
      continue;
    end if;

    v_label := case when jsonb_array_length(v_f->'games') = 1
                    then (v_f->'games'->0->>'home') || ' v ' || (v_f->'games'->0->>'away')
                    else to_char(v_slot at time zone 'Europe/London', 'FMHH24:MI') || ' games' end;
    select string_agg(format('%s (%s, %s%% owned)%s', x->>'name', x->>'team', x->>'own', coalesce(' · ' || (x->>'reason'), '')), E'\n' order by ord)
      into v_lines from jsonb_array_elements(v_f->'not_starting') with ordinality t(x, ord);
    select string_agg(format('%s (%s, %s%% flag)', x->>'name', x->>'team', x->>'chance'), E'\n' order by ord)
      into v_dlines from jsonb_array_elements(v_f->'doubts_starting') with ordinality t(x, ord);

    v_head := format('Team news, %s (FPL ownership)', v_label);
    if v_lines is not null then
      v_posts := array[v_head || E'\n\nNot starting:\n' || v_lines];
      if v_dlines is not null then
        if public.social_weighted_length(v_posts[1] || E'\n\nStarting despite a doubt:\n' || v_dlines) <= 280 then
          v_posts[1] := v_posts[1] || E'\n\nStarting despite a doubt:\n' || v_dlines;
        else
          v_posts[1] := replace(v_posts[1], '(FPL ownership)', '(FPL ownership) 🧵');
          v_posts := v_posts || ('Starting despite a doubt:' || E'\n' || v_dlines);
        end if;
      end if;
    else
      v_posts := array[v_head || E'\n\nStarting despite a doubt:\n' || v_dlines];
    end if;
    -- Too long: drop the reasons, then the last names.
    if v_lines is not null and public.social_weighted_length(v_posts[1]) > 280 then
      select v_head || E'\n\nNot starting:\n' || string_agg(format('%s (%s, %s%%)', x->>'name', x->>'team', x->>'own'), E'\n' order by ord)
        into v_tmp from jsonb_array_elements(v_f->'not_starting') with ordinality t(x, ord);
      v_posts[1] := v_tmp;
      -- Doubts that were in post 1 move to a second post.
      if v_dlines is not null and array_length(v_posts, 1) = 1 then
        v_posts[1] := replace(v_posts[1], '(FPL ownership)', '(FPL ownership) 🧵');
        v_posts := v_posts || ('Starting despite a doubt:' || E'\n' || v_dlines);
      end if;
    end if;
    if exists (select 1 from unnest(v_posts) p where public.social_weighted_length(p) > 280) then
      v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'rejected', 'reason', 'a post is over 280 characters');
      continue;
    end if;

    insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                               expires_at, validation_status, validation_errors, detector_run_id)
    values ('team_news', array_to_string(v_posts, E'\n\n'), array_to_string(v_posts, E'\n\n'),
            case when array_length(v_posts, 1) > 1 then to_jsonb(v_posts) end,
            jsonb_build_object('season_id', v_season, 'slot', v_slot) || v_f,
            now(), v_key, v_slot + interval '60 minutes', 'passed', '[]', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'team_news', 'run_id', p_run_id));
    v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'created', 'candidate_id', v_id);
  end loop;
  return jsonb_build_object('status', case when exists (select 1 from jsonb_array_elements(v_out) e where e->>'status' = 'created') then 'created' else 'none' end,
                            'slots', v_out);
end;
$$;

-- The 5-minute tick: team news from kick-off + 5, line-ups (recorded privately) from + 8 as before.
create or replace function public.social_lineups_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_run bigint; v_res jsonb; v_news jsonb; v_q integer;
begin
  if not (select detector_enabled from public.social_settings) then return jsonb_build_object('status', 'disabled'); end if;
  if not exists (select 1 from public.fpl_fixtures ff where ff.season_id = public.fpl_current_season_id()
                   and ff.kickoff_time between now() - interval '45 minutes' and now() - interval '5 minutes') then
    return jsonb_build_object('status', 'none');
  end if;
  insert into public.social_detector_runs (triggered_by) values ('lineups') returning run_id into v_run;
  begin
    v_res := private.social_detect_lineups(v_run);
  exception when others then
    v_res := jsonb_build_object('status', 'error', 'error', sqlerrm);
  end;
  begin
    v_news := private.social_detect_team_news(v_run);
  exception when others then
    v_news := jsonb_build_object('status', 'error', 'error', sqlerrm);
  end;
  v_q := private.social_auto_queue();
  update public.social_detector_runs set finished_at = now(),
         results = jsonb_build_object('lineups', v_res, 'team_news', v_news, 'auto_queued', v_q),
         candidates_created = (case when v_res->>'status' = 'created' then 1 else 0 end) + (case when v_news->>'status' = 'created' then 1 else 0 end)
   where run_id = v_run;
  return jsonb_build_object('lineups', v_res, 'team_news', v_news);
end;
$$;
revoke all on function public.social_lineups_tick() from public, anon, authenticated;

-- Queued 5 minutes after it is made, like the line-ups post.
create or replace function pg_temp.social_patch(p_sig text, p_old text, p_new text) returns void language plpgsql as $f$
declare d text; n integer;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_new in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, p_old, ''))) / length(p_old);
  if n <> 1 then raise exception 'social_patch: % anchor found % times: %', p_sig, n, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end;
$f$;
select pg_temp.social_patch('private.social_auto_queue()',
  $o$if c.post_type = 'lineup_vs_model' then$o$,
  $n$if c.post_type in ('lineup_vs_model', 'team_news') then$n$);
