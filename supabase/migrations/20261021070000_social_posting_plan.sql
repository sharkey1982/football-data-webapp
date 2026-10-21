-- ============================================================================
-- Social posting plan (Chris, 21 Oct 2026; the "FixtureShark posting plan"
-- page): daily posts in a normal gameweek.
--   * New automatic posts: availability (Tue-Fri ~12:30), market watch (daily
--     ~20:00, transfers only until the price model passes its test), the
--     week's changes (deadline + 1h) and the week ahead (the morning after the
--     reflection).
--   * Reflection: a provisional version the night the gameweek ends
--     (scripts/fpl_gameweek_report.py); if confirmed bonus changes a captaincy
--     score it gave, one reply to that thread (x-publish reads reply_to_x_id).
--   * Overnight price changes: old -> new price and ownership, low-owned
--     players grouped. Captaincy: no model line; blank chance from the preview.
--   * A candidate may carry source_data.post_after: it is not posted before.
--   * Limits: 120 posts a month; posting until midnight (the Monday-night
--     reflection). Detectors run hourly so posts go out near their times.
-- ============================================================================

alter table public.social_post_candidates drop constraint if exists social_post_candidates_post_type_check;
alter table public.social_post_candidates add constraint social_post_candidates_post_type_check
  check (post_type in ('fpl_captaincy', 'team_xg_change', 'prediction_accuracy', 'historical_insight', 'announcement',
                       'fpl_price_changes', 'gameweek_thread', 'fpl_availability', 'fpl_market', 'fpl_week_changes', 'gameweek_outlook'));

update public.social_settings
   set max_posts_per_month = greatest(max_posts_per_month, 120),
       post_hours_to = 24,
       auto_post_types = (select array_agg(distinct t order by t) from unnest(auto_post_types || array['fpl_availability', 'fpl_market', 'fpl_week_changes', 'gameweek_outlook']) t),
       updated_at = now()
 where id;

-- ============================================================================
-- Shared: a player's display bits for the new posts
-- ============================================================================
create or replace function private.social_k(n numeric)
returns text language sql immutable as $$
  -- 160173 -> '160k'; under 1,000 as it is. Signed by the caller.
  select case when abs(n) >= 1000 then round(abs(n) / 1000)::int || 'k' else abs(n)::int::text end;
$$;

create or replace function private.social_news(p_news text)
returns text language sql immutable as $$
  -- FPL's 'Knee injury - 75% chance of playing' -> 'knee injury, 75% chance of playing'
  -- Each part starts lower case, except a date-like part keeps its month.
  select nullif(string_agg(lower(left(part, 1)) || substr(part, 2), ', ' order by n), '')
    from regexp_split_to_table(btrim(coalesce(p_news, '')), '\s+-\s+') with ordinality t(part, n)
   where part <> '';
$$;

-- ============================================================================
-- Detector 7: availability (Tuesday to Friday, late morning; posts ~12:30)
-- ============================================================================
-- New FPL flags, doubts and players back since the last availability post (or
-- since yesterday), for players owned by 1%+ or in the projected top 50 for the
-- next gameweek. Nothing on the deadline day or with nothing new.
create or replace function private.social_detect_availability(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_now timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  v_gw integer; v_deadline timestamptz; v_mv text; v_ts timestamptz; v_key text; v_base jsonb; v_base_from text;
  v_state jsonb; v_rows jsonb; v_lines text[] := '{}'; v_line text; v_text text; v_more integer := 0; v_id bigint; r jsonb; v_checks jsonb := '[]';
begin
  if extract(isodow from v_now) not between 2 and 5 then
    return jsonb_build_object('status', 'none', 'reason', 'availability posts go out Tuesday to Friday');
  end if;
  if extract(hour from v_now) < 11 or extract(hour from v_now) >= 16 then
    return jsonb_build_object('status', 'none', 'reason', 'availability is checked late morning');
  end if;
  v_key := format('fpl_availability:%s:%s', v_season, v_today);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made today');
  end if;
  select fpl_event_id, deadline_time into v_gw, v_deadline
    from public.fpl_gameweeks where season_id = v_season and deadline_time > now() order by deadline_time limit 1;
  if v_gw is null then return jsonb_build_object('status', 'none', 'reason', 'no upcoming deadline'); end if;
  if (v_deadline at time zone 'Europe/London')::date = v_today then
    return jsonb_build_object('status', 'none', 'reason', 'deadline day: the team-news and deadline posts cover it');
  end if;

  select max(completed_at) into v_ts from public.fpl_ingestion_runs where status = 'success';
  v_checks := v_checks || private.social_check('FPL refreshed this morning', v_ts >= (v_today::timestamp + interval '6 hours') at time zone 'Europe/London',
                                               jsonb_build_object('last_success', v_ts));
  if v_ts < (v_today::timestamp + interval '6 hours') at time zone 'Europe/London' or v_ts is null then
    return jsonb_build_object('status', 'rejected', 'checks', v_checks);
  end if;

  -- Baseline: what the last availability post saw, else yesterday's snapshot.
  select c.source_data->'state' into v_base from public.social_post_candidates c
   where c.post_type = 'fpl_availability' and c.publication_status = 'published'
     and (c.source_data->>'season_id')::bigint = v_season and (c.source_data->>'date')::date >= v_today - 4
   order by c.candidate_id desc limit 1;
  v_base_from := 'last post';
  if v_base is null then
    select jsonb_object_agg(fpl_player_id::text, jsonb_build_object('s', status, 'c', chance_of_playing_next_round)) into v_base
      from (select distinct on (fpl_player_id) fpl_player_id, status, chance_of_playing_next_round
              from public.fpl_player_snapshots where season_id = v_season and snapshot_date = v_today - 1
             order by fpl_player_id, captured_at desc) y;
    v_base_from := 'yesterday';
  end if;
  v_checks := v_checks || private.social_check('baseline available', v_base is not null and (select count(*) from jsonb_object_keys(v_base)) >= 100,
                                               jsonb_build_object('from', v_base_from));
  if v_base is null or (select count(*) from jsonb_object_keys(v_base)) < 100 then
    return jsonb_build_object('status', 'rejected', 'checks', v_checks);
  end if;

  select model_version into v_mv from public.fpl_player_projections where season_id = v_season order by generated_at desc limit 1;
  with top as (
    select p.fpl_player_id from public.fpl_player_projections p
      join public.fpl_fixtures ff on ff.season_id = p.season_id and ff.canonical_fixture_id = p.fixture_id
     where p.season_id = v_season and ff.fpl_event_id = v_gw and p.model_version = v_mv and coalesce(p.scenario_key, 'baseline') = 'baseline'
     group by 1 order by sum(p.expected_fpl_points) desc limit 50),
  cur as (
    select pl.fpl_player_id, pl.web_name, coalesce(t.short_name, '') team, coalesce(pl.selected_by_percent, 0)::numeric own,
           pl.status, pl.chance_of_playing_next_round chance, pl.news
      from public.fpl_players pl left join public.fpl_teams t on t.season_id = pl.season_id and t.fpl_team_id = pl.fpl_team_id
     where pl.season_id = v_season and (coalesce(pl.selected_by_percent, 0) >= 1 or pl.fpl_player_id in (select fpl_player_id from top)))
  select jsonb_object_agg(fpl_player_id::text, jsonb_build_object('s', status, 'c', chance)),
         coalesce(jsonb_agg(to_jsonb(x) order by x.grp, x.own desc, x.fpl_player_id) filter (where x.grp is not null), '[]')
    into v_state, v_rows
    from (select cur.*, b.value->>'s' was_status, (b.value->>'c')::int was_chance,
                 case when cur.status in ('i', 's', 'n', 'u') and coalesce(b.value->>'s', 'a') not in ('i', 's', 'n', 'u') then 1
                      when cur.status = 'd' and (coalesce(b.value->>'s', 'a') <> 'd' or (b.value->>'c')::int is distinct from cur.chance) then 2
                      when cur.status = 'a' and b.value->>'s' is not null and b.value->>'s' <> 'a' then 3 end grp
            from cur left join lateral (select v_base->(cur.fpl_player_id::text) value) b on true) x;

  -- More than 40 changes at once means a data problem, not a news day.
  v_checks := v_checks || private.social_check('a believable number of changes', jsonb_array_length(v_rows) <= 40,
                                               jsonb_build_object('changes', jsonb_array_length(v_rows)));
  if jsonb_array_length(v_rows) > 40 then return jsonb_build_object('status', 'rejected', 'checks', v_checks); end if;
  if jsonb_array_length(v_rows) = 0 then return jsonb_build_object('status', 'none', 'reason', 'no availability changes'); end if;

  v_text := format('FPL availability, %s', to_char(v_today, 'Dy FMDD Mon'));
  for r in select e from jsonb_array_elements(v_rows) e loop
    v_line := case (r->>'grp')::int
      when 1 then format('Out: %s (%s, %s%%)%s', r->>'web_name', r->>'team', private.social_fmt((r->>'own')::numeric, 1),
                         coalesce(' ' || private.social_news(r->>'news'), ''))
      when 2 then format('Doubt: %s (%s, %s%%)%s', r->>'web_name', r->>'team', private.social_fmt((r->>'own')::numeric, 1),
                         coalesce(' ' || private.social_news(r->>'news'), ''))
      else format('Back: %s (%s, %s%%)', r->>'web_name', r->>'team', private.social_fmt((r->>'own')::numeric, 1)) end;
    if public.social_weighted_length(v_text || E'\n' || v_line || E'\n+99 more') <= 280 then
      v_text := v_text || E'\n' || v_line;
      v_lines := v_lines || v_line;
    else
      v_more := v_more + 1;
    end if;
  end loop;
  if v_more > 0 then v_text := v_text || E'\n' || format('+%s more', v_more); end if;

  insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fpl_availability', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'date', v_today, 'gw', v_gw, 'players', v_rows, 'state', v_state, 'baseline', v_base_from,
                             'checks', v_checks, 'post_after', (v_today::timestamp + interval '12 hours 30 minutes') at time zone 'Europe/London'),
          v_ts, v_key, (v_today::timestamp + interval '22 hours') at time zone 'Europe/London', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fpl_availability', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'changes', jsonb_array_length(v_rows));
end;
$$;

-- ============================================================================
-- Detector 8: market watch (evenings; posts ~20:00)
-- ============================================================================
-- The gameweek's most bought and sold players so far (FPL's net transfers).
-- Price calls are added once the price model passes its test.
create or replace function private.social_detect_market(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_now timestamp := now() at time zone 'Europe/London';
  v_today date := (now() at time zone 'Europe/London')::date;
  v_ts timestamptz; v_key text; v_in text; v_out text; v_rows jsonb; v_text text; v_id bigint; v_sum bigint;
begin
  if extract(hour from v_now) < 19 or extract(hour from v_now) >= 21 then
    return jsonb_build_object('status', 'none', 'reason', 'market watch is made in the evening');
  end if;
  v_key := format('fpl_market:%s:%s', v_season, v_today);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made today');
  end if;
  if exists (select 1 from public.fpl_gameweeks where season_id = v_season and deadline_time between now() - interval '24 hours' and now()) then
    return jsonb_build_object('status', 'none', 'reason', 'transfers have just reset after the deadline');
  end if;
  -- Today's snapshot row is rewritten at every FPL refresh (6-hourly): use it once it is recent.
  select max(captured_at) into v_ts from public.fpl_player_snapshots where season_id = v_season and snapshot_date = v_today;
  if v_ts is null or v_ts < now() - interval '4 hours' then
    return jsonb_build_object('status', 'rejected', 'checks', jsonb_build_array(private.social_check('FPL snapshot from the last 4 hours', false, jsonb_build_object('captured_at', v_ts))));
  end if;

  with t as (select s.fpl_player_id, pl.web_name, coalesce(s.transfers_in_event, 0) - coalesce(s.transfers_out_event, 0) net,
                    coalesce(s.selected_by_percent, 0)::numeric own
               from public.fpl_player_snapshots s join public.fpl_players pl on pl.season_id = s.season_id and pl.fpl_player_id = s.fpl_player_id
              where s.season_id = v_season and s.snapshot_date = v_today),
  i as (select * from t where net > 0 order by net desc, fpl_player_id limit 3),
  o as (select * from t where net < 0 order by net, fpl_player_id limit 3)
  select (select string_agg(format('%s +%s', web_name, private.social_k(net)), ', ' order by net desc, fpl_player_id) from i),
         (select string_agg(format('%s −%s', web_name, private.social_k(net)), ', ' order by net, fpl_player_id) from o),
         (select jsonb_build_object('in', (select jsonb_agg(to_jsonb(i)) from i), 'out', (select jsonb_agg(to_jsonb(o)) from o))),
         (select coalesce(sum(abs(net)), 0) from (select net from i union all select net from o) x)
    into v_in, v_out, v_rows, v_sum;
  if v_in is null or v_out is null or v_sum < 30000 then
    return jsonb_build_object('status', 'none', 'reason', 'too few transfers yet', 'moved', v_sum);
  end if;

  v_text := format(E'FPL market watch, %s\nMost bought this gameweek: %s\nMost sold: %s', to_char(v_today, 'Dy FMDD Mon'), v_in, v_out);
  insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fpl_market', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'date', v_today, 'transfers', v_rows,
                             'post_after', (v_today::timestamp + interval '20 hours') at time zone 'Europe/London'),
          v_ts, v_key, (v_today::timestamp + interval '22 hours 30 minutes') at time zone 'Europe/London', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fpl_market', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id);
end;
$$;

-- ============================================================================
-- Detector 9: the week's changes (after each deadline; posts deadline + 1h)
-- ============================================================================
-- From FPL's state an hour before this deadline against an hour before the
-- last one (fpl_deadline_player_state, 'pre_deadline').
create or replace function private.social_detect_week_changes(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_gw integer; v_deadline timestamptz; v_key text; v_n_a integer; v_n_b integer;
  v_up integer; v_down integer; v_up_names text; v_down_names text; v_in text; v_out text; v_own text; v_ruled text;
  v_lines text[]; v_text text; v_id bigint; v_data jsonb;
begin
  select fpl_event_id, deadline_time into v_gw, v_deadline from public.fpl_gameweeks
   where season_id = v_season and deadline_time <= now() and deadline_time > now() - interval '12 hours' order by deadline_time desc limit 1;
  if v_gw is null then return jsonb_build_object('status', 'none', 'reason', 'no deadline in the last 12 hours'); end if;
  v_key := format('fpl_week_changes:%s:%s', v_season, v_gw);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made for this deadline');
  end if;
  select count(*) filter (where fpl_event_id = v_gw), count(*) filter (where fpl_event_id = v_gw - 1) into v_n_a, v_n_b
    from public.fpl_deadline_player_state where season_id = v_season and snapshot_kind = 'pre_deadline' and fpl_event_id in (v_gw, v_gw - 1);
  if v_n_a < 500 or v_n_b < 500 then
    return jsonb_build_object('status', 'rejected', 'checks', jsonb_build_array(private.social_check('both pre-deadline snapshots exist', false,
                              jsonb_build_object('this', v_n_a, 'last', v_n_b))));
  end if;

  create temporary table if not exists _wc (fpl_player_id int, web_name text, own numeric, own_before numeric, cost int, cost_before int,
                                            net bigint, status text, status_before text) on commit drop;
  truncate _wc;
  insert into _wc
  select a.fpl_player_id, pl.web_name, coalesce(a.selected_by_percent, 0), coalesce(b.selected_by_percent, 0), a.now_cost, b.now_cost,
         coalesce(a.transfers_in_event, 0) - coalesce(a.transfers_out_event, 0), a.status, b.status
    from (select distinct on (fpl_player_id) * from public.fpl_deadline_player_state
           where season_id = v_season and fpl_event_id = v_gw and snapshot_kind = 'pre_deadline' order by fpl_player_id, snapshot_at desc) a
    join (select distinct on (fpl_player_id) * from public.fpl_deadline_player_state
           where season_id = v_season and fpl_event_id = v_gw - 1 and snapshot_kind = 'pre_deadline' order by fpl_player_id, snapshot_at desc) b
      using (fpl_player_id)
    join public.fpl_players pl on pl.season_id = v_season and pl.fpl_player_id = a.fpl_player_id;

  select count(*) filter (where cost > cost_before), count(*) filter (where cost < cost_before) into v_up, v_down from _wc;
  select string_agg(web_name, ', ' order by own desc) into v_up_names from (select * from _wc where cost > cost_before order by own desc limit 3) x;
  select string_agg(web_name, ', ' order by own desc) into v_down_names from (select * from _wc where cost < cost_before order by own desc limit 2) x;
  select format('Most bought: %s +%s (now %s%%)', web_name, private.social_k(net), private.social_fmt(own, 1)) into v_in
    from _wc where net > 0 order by net desc limit 1;
  select format('Most sold: %s −%s (now %s%%)', web_name, private.social_k(net), private.social_fmt(own, 1)) into v_out
    from _wc where net < 0 order by net limit 1;
  select format('Ownership up most: %s %s%% → %s%%', web_name, private.social_fmt(own_before, 1), private.social_fmt(own, 1)) into v_own
    from _wc where own > own_before order by own - own_before desc limit 1;
  select string_agg(web_name, ', ' order by own desc) into v_ruled
    from (select * from _wc where status in ('i', 's', 'n', 'u') and status_before in ('a', 'd') and own_before >= 1 order by own_before desc limit 4) x;

  v_lines := array_remove(array[
    case when v_up + v_down > 0 then format('Prices: %s rise%s, %s fall%s%s', v_up, case when v_up = 1 then '' else 's' end, v_down, case when v_down = 1 then '' else 's' end,
         case when v_up_names is not null or v_down_names is not null then
              '. Most-owned: ' || concat_ws('; ', v_up_names || ' up', v_down_names || ' down') end) end,
    v_in, v_out, v_own,
    case when v_ruled is not null then 'Ruled out: ' || v_ruled end], null);
  if coalesce(array_length(v_lines, 1), 0) < 2 then return jsonb_build_object('status', 'none', 'reason', 'nothing to report'); end if;
  v_text := format('FPL GW%s: what changed since the last deadline', v_gw) || E'\n' || array_to_string(v_lines, E'\n');
  -- Too long: drop the ownership line, then the ruled-out line.
  if public.social_weighted_length(v_text) > 280 then
    v_lines := array_remove(v_lines, v_own);
    v_text := format('FPL GW%s: what changed since the last deadline', v_gw) || E'\n' || array_to_string(v_lines, E'\n');
  end if;
  if public.social_weighted_length(v_text) > 280 then
    v_lines := array_remove(v_lines, 'Ruled out: ' || v_ruled);
    v_text := format('FPL GW%s: what changed since the last deadline', v_gw) || E'\n' || array_to_string(v_lines, E'\n');
  end if;
  select jsonb_build_object('rises', v_up, 'falls', v_down) into v_data;

  insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fpl_week_changes', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'gw', v_gw, 'deadline', v_deadline, 'summary', v_data,
                             'post_after', v_deadline + interval '1 hour'),
          v_deadline, v_key, v_deadline + interval '12 hours', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fpl_week_changes', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'gw', v_gw);
end;
$$;

-- ============================================================================
-- Detector 10: the week ahead (after the reflection; posts the next 10:00)
-- ============================================================================
-- Whether the next gameweek is a normal one (Saturday deadline, games
-- Saturday to Monday, everyone once) and, if not, what is different; then the
-- cup and European games PL teams play before it.
create or replace function private.social_detect_outlook(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_gw integer; v_deadline timestamptz; v_dl timestamp; v_key text; v_refl timestamptz; v_post_after timestamp;
  v_first timestamptz; v_last timestamptz; v_prev_last timestamptz; v_days int[]; v_diffs text[] := '{}'; v_text text; v_posts text[];
  v_cups text; v_pairs text; v_blank text; v_double text; v_fri text; v_nfri integer; v_sig text; v_id bigint; v_line text;
begin
  select fpl_event_id, deadline_time into v_gw, v_deadline
    from public.fpl_gameweeks where season_id = v_season and deadline_time > now() order by deadline_time limit 1;
  if v_gw is null then return jsonb_build_object('status', 'none', 'reason', 'no upcoming deadline'); end if;
  if v_deadline < now() + interval '24 hours' then return jsonb_build_object('status', 'none', 'reason', 'deadline too close'); end if;
  v_key := format('gameweek_outlook:%s:%s', v_season, v_gw);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made for this gameweek');
  end if;
  -- After the previous gameweek's reflection (any version).
  select min(published_at) into v_refl from public.fpl_gameweek_reports
   where season_id = v_season and fpl_event_id = v_gw - 1 and kind = 'reflection' and status = 'published';
  if v_refl is null then return jsonb_build_object('status', 'none', 'reason', format('waiting for the GW%s reflection', v_gw - 1)); end if;
  v_post_after := case when extract(hour from v_refl at time zone 'Europe/London') < 9
                       then (v_refl at time zone 'Europe/London')::date + interval '10 hours'
                       else (v_refl at time zone 'Europe/London')::date + interval '1 day 10 hours' end;

  v_dl := v_deadline at time zone 'Europe/London';
  select min(kickoff_time), max(kickoff_time), array_agg(distinct extract(isodow from kickoff_time at time zone 'Europe/London')::int),
         md5(string_agg(fpl_fixture_id || '@' || coalesce(kickoff_time::text, ''), ',' order by fpl_fixture_id))
    into v_first, v_last, v_days, v_sig
    from public.fpl_fixtures where season_id = v_season and fpl_event_id = v_gw;
  if v_first is null then return jsonb_build_object('status', 'none', 'reason', 'no fixtures'); end if;
  select max(kickoff_time) into v_prev_last from public.fpl_fixtures where season_id = v_season and fpl_event_id = v_gw - 1;

  -- Teams playing 0 or 2+ times.
  with n as (select t.fpl_team_id, t.short_name,
                    (select count(*) from public.fpl_fixtures f where f.season_id = v_season and f.fpl_event_id = v_gw
                        and t.fpl_team_id in (f.fpl_home_team_id, f.fpl_away_team_id)) games
               from public.fpl_teams t where t.season_id = v_season)
  select string_agg(short_name, ', ' order by short_name) filter (where games = 0),
         string_agg(short_name, ', ' order by short_name) filter (where games >= 2)
    into v_blank, v_double from n;

  select count(*), min(th.name || ' v ' || ta.name) into v_nfri, v_fri
    from public.fpl_fixtures f join public.fpl_teams th on th.season_id = f.season_id and th.fpl_team_id = f.fpl_home_team_id
    join public.fpl_teams ta on ta.season_id = f.season_id and ta.fpl_team_id = f.fpl_away_team_id
   where f.season_id = v_season and f.fpl_event_id = v_gw and extract(isodow from f.kickoff_time at time zone 'Europe/London') = 5;

  if extract(isodow from v_dl) between 1 and 4 then
    v_diffs := v_diffs || format('it''s a midweek gameweek, %s to %s', to_char(v_first at time zone 'Europe/London', 'FMDay'),
                                 to_char(v_last at time zone 'Europe/London', 'FMDay'));
  elsif v_nfri = 1 then
    v_diffs := v_diffs || format('%s is on Friday night, so the deadline is Friday', v_fri);
  elsif v_nfri > 1 then
    v_diffs := v_diffs || format('%s games are on Friday, so the deadline is Friday', v_nfri);
  end if;
  if extract(isodow from v_dl) >= 5 and not (1 = any(v_days)) then v_diffs := v_diffs || 'there''s no Monday game'::text; end if;
  if v_blank is not null then v_diffs := v_diffs || format('%s don''t play', v_blank); end if;
  if v_double is not null then v_diffs := v_diffs || format('%s play twice', v_double); end if;

  if coalesce(array_length(v_diffs, 1), 0) = 0 then
    v_text := format('FPL GW%s is a normal week: deadline %s, games %s to %s.', v_gw, to_char(v_dl, 'Dy HH24:MI'),
                     to_char(v_first at time zone 'Europe/London', 'FMDay'), to_char(v_last at time zone 'Europe/London', 'FMDay'));
  else
    v_text := format('FPL GW%s is different: %s. Deadline %s.', v_gw, array_to_string(v_diffs, '; '), to_char(v_dl, 'Dy HH24:MI'));
  end if;

  -- Cup and European games for PL teams between the gameweeks.
  with g as (
    select l.league_id, case l.league_id when 6 then 'League Cup' when 7 then 'FA Cup' when 9 then 'Champions League'
                                         when 10 then 'Europa League' when 11 then 'Conference League' else l.name end comp,
           f.kickoff_date, t.short_name
      from public.fixtures f join public.leagues l on l.league_id = f.league_id
      join public.fpl_teams t on t.season_id = v_season and t.canonical_team_id in (f.home_team_id, f.away_team_id)
     where f.league_id in (6, 7, 9, 10, 11)
       and f.kickoff_date > coalesce((v_prev_last at time zone 'Europe/London')::date, (v_first at time zone 'Europe/London')::date - 7)
       and f.kickoff_date < (v_first at time zone 'Europe/London')::date)
  select string_agg(format('%s (%s): %s', comp, days, teams), '; ' order by first_day, league_id)
    into v_cups
    from (select league_id, comp, min(kickoff_date) first_day,
                 case when min(kickoff_date) = max(kickoff_date) then to_char(min(kickoff_date), 'Dy')
                      else to_char(min(kickoff_date), 'Dy') || '–' || to_char(max(kickoff_date), 'Dy') end days,
                 string_agg(distinct short_name, ', ') teams
            from g group by 1, 2) x;
  -- The same two teams in a cup tie and in the league this gameweek.
  select string_agg(format('%s and %s meet in the %s on %s, then in the league on %s.', th.name, ta.name,
                           case f.league_id when 6 then 'League Cup' when 7 then 'FA Cup' when 9 then 'Champions League'
                                            when 10 then 'Europa League' else 'Conference League' end,
                           to_char(f.kickoff_date, 'FMDay'), to_char(lf.kickoff_time at time zone 'Europe/London', 'FMDay')), ' ')
    into v_pairs
    from public.fixtures f
    join public.fpl_teams th on th.season_id = v_season and th.canonical_team_id = f.home_team_id
    join public.fpl_teams ta on ta.season_id = v_season and ta.canonical_team_id = f.away_team_id
    join public.fpl_fixtures lf on lf.season_id = v_season and lf.fpl_event_id = v_gw
         and ((lf.fpl_home_team_id = th.fpl_team_id and lf.fpl_away_team_id = ta.fpl_team_id)
           or (lf.fpl_home_team_id = ta.fpl_team_id and lf.fpl_away_team_id = th.fpl_team_id))
   where f.league_id in (6, 7, 9, 10, 11)
     and f.kickoff_date > coalesce((v_prev_last at time zone 'Europe/London')::date, (v_first at time zone 'Europe/London')::date - 7)
     and f.kickoff_date < (v_first at time zone 'Europe/London')::date;

  v_line := case when v_cups is null then 'No cup or European games before it.' else 'Midweek before it: ' || v_cups || '.' end;
  -- One post if it fits, otherwise a short thread.
  if public.social_weighted_length(v_text || E'\n' || v_line || coalesce(E'\n' || v_pairs, '')) <= 280 then
    v_posts := array[v_text || E'\n' || v_line || coalesce(E'\n' || v_pairs, '')];
  else
    v_posts := array_remove(array[v_text, v_line, v_pairs], null);
  end if;
  if exists (select 1 from unnest(v_posts) p where public.social_weighted_length(p) > 280) then
    return jsonb_build_object('status', 'rejected', 'reason', 'a post is over 280 characters', 'posts', to_jsonb(v_posts));
  end if;

  insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('gameweek_outlook', array_to_string(v_posts, E'\n\n'), array_to_string(v_posts, E'\n\n'),
          case when array_length(v_posts, 1) > 1 then to_jsonb(v_posts) end,
          jsonb_build_object('season_id', v_season, 'gw', v_gw, 'deadline', v_deadline, 'fixtures_sig', v_sig,
                             'post_after', v_post_after at time zone 'Europe/London'),
          now(), v_key, v_deadline, 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'gameweek_outlook', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'gw', v_gw);
end;
$$;

CREATE OR REPLACE FUNCTION private.social_auto_queue()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare s public.social_settings; c record; v_errors jsonb; v_hold timestamptz; n integer := 0;
begin
  select * into s from public.social_settings;
  if not s.auto_publish_enabled then return 0; end if;
  for c in
    select * from public.social_post_candidates
     where approval_status = 'pending' and publication_status = 'unpublished' and validation_status = 'passed'
       and post_type = any(s.auto_post_types) and expires_at > now() and created_at > now() - interval '2 days'
     order by created_at
  loop
    v_errors := private.social_revalidate(c.candidate_id);
    if jsonb_array_length(v_errors) > 0 then
      update public.social_post_candidates set validation_status = 'stale', validation_errors = v_errors, validated_at = now(), updated_at = now()
       where candidate_id = c.candidate_id;
      continue;
    end if;
    v_hold := now() + make_interval(mins => s.hold_minutes);
    if c.post_type = 'fpl_captaincy' then
      v_hold := greatest(v_hold, (c.source_data->>'deadline')::timestamptz - interval '24 hours');
    end if;
    -- A post with a set time (availability 12:30, market watch 20:00, ...) waits for it.
    if c.source_data ? 'post_after' then
      v_hold := greatest(v_hold, (c.source_data->>'post_after')::timestamptz);
    end if;
    -- One queued post per type and expiry (e.g. one captaincy post per deadline).
    update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
     where post_type = c.post_type and candidate_id <> c.candidate_id and expires_at = c.expires_at
       and coalesce(source_data->>'kind', '') = coalesce(c.source_data->>'kind', '')
       and approval_status = 'approved' and auto and publication_status in ('unpublished', 'failed');
    update public.social_post_candidates set approval_status = 'approved', approved_at = now(), approved_by = null,
           auto = true, hold_until = v_hold, updated_at = now()
     where candidate_id = c.candidate_id;
    perform private.social_audit('auto_queued', c.candidate_id, null, jsonb_build_object('hold_until', v_hold));
    n := n + 1;
  end loop;
  return n;
end;
$function$;

CREATE OR REPLACE FUNCTION private.social_revalidate(p_candidate_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c public.social_post_candidates; e jsonb := '[]'; s jsonb; v_mv text; v_top jsonb; v_n integer; v_val numeric; p text;
begin
  select * into c from public.social_post_candidates where candidate_id = p_candidate_id;
  if c.candidate_id is null then return jsonb_build_array('candidate not found'); end if;
  s := c.source_data;
  if c.expires_at <= now() then e := e || to_jsonb(format('expired at %s', c.expires_at)); end if;
  if c.validation_status <> 'passed' then e := e || to_jsonb('did not pass validation'::text); end if;
  foreach p in array private.social_posts(c) loop
    if public.social_weighted_length(p) > 280 then e := e || to_jsonb(format('too long: %s of 280', public.social_weighted_length(p))); end if;
  end loop;
  if not (public.social_numbers(c.text) <@ public.social_numbers(c.generated_text)) then
    e := e || to_jsonb('text contains a number that is not in the generated data'::text);
  end if;

  if c.post_type = 'fpl_captaincy' then
    select model_version into v_mv from public.fpl_player_projections where season_id = (s->>'season_id')::bigint order by generated_at desc limit 1;
    if v_mv is distinct from s->>'model_version' then e := e || to_jsonb(format('model version is now %s', v_mv)); end if;
    if (select deadline_time from public.fpl_gameweeks where season_id = (s->>'season_id')::bigint and fpl_event_id = (s->>'gw')::int)
       is distinct from (s->>'deadline')::timestamptz then e := e || to_jsonb('deadline changed'::text); end if;
    v_top := private.social_captaincy_top((s->>'season_id')::bigint, (s->>'gw')::int, s->>'model_version', 5);
    if (select array_agg(t->>'fpl_player_id' order by (t->>'rank')::int) from jsonb_array_elements(v_top) t where (t->>'rank')::int <= 3)
       is distinct from (select array_agg(t->>'fpl_player_id' order by (t->>'rank')::int) from jsonb_array_elements(s->'players') t where (t->>'rank')::int <= 3)
    then e := e || to_jsonb('top three has changed'::text); end if;
    select count(*) into v_n from jsonb_array_elements(s->'players') t
      join public.fpl_players pl on pl.season_id = (s->>'season_id')::bigint and pl.fpl_player_id = (t->>'fpl_player_id')::int
     where pl.now_cost <> (t->>'now_cost')::int or pl.status <> 'a';
    if v_n > 0 then e := e || to_jsonb(format('%s listed player(s) changed price or status', v_n)); end if;
    select count(*) into v_n from jsonb_array_elements(v_top) t join jsonb_array_elements(s->'players') o on o->>'fpl_player_id' = t->>'fpl_player_id'
     where round((t->>'xpts')::numeric, 1) <> round((o->>'xpts')::numeric, 1);
    if v_n > 0 then e := e || to_jsonb(format('%s projected points value(s) changed', v_n)); end if;

  elsif c.post_type = 'team_xg_change' then
    select abs(f.market_home_goals - (s->'after'->>'home')::numeric) + abs(f.market_away_goals - (s->'after'->>'away')::numeric) into v_val
      from public.fixtures f where f.fixture_id = (s->>'fixture_id')::bigint and f.kickoff_date is not distinct from (s->>'kickoff_date')::date;
    if v_val is null then e := e || to_jsonb('fixture moved or forecast missing'::text);
    elsif v_val > 0.05 then e := e || to_jsonb('forecast has changed again'::text); end if;

  elsif c.post_type = 'prediction_accuracy' then
    select count(*) into v_n from public.model_scorecard_matches
     where match_id in (select jsonb_array_elements_text(s->'match_ids')::bigint) and model_version = s->>'model_version';
    if v_n <> (s->>'n')::int then e := e || to_jsonb('scorecard rows changed'::text); end if;

  elsif c.post_type = 'historical_insight' then
    if not exists (select 1 from public.history_streaks h where h.league_id = 1 and h.team_id = (s->>'team_id')::bigint
                     and h.streak_type = s->>'streak_type' and h.start_date = (s->>'start_date')::date
                     and h.length = (s->>'length')::int and h.ongoing) then
      e := e || to_jsonb('streak has changed'::text);
    end if;

  elsif c.post_type = 'fpl_price_changes' then
    -- Every listed player still has the price the post gives.
    select count(*) into v_n from jsonb_array_elements(s->'changes') t
      join public.fpl_players pl on pl.season_id = (s->>'season_id')::bigint and pl.fpl_player_id = (t->>'fpl_player_id')::int
     where pl.now_cost <> (t->>'now')::int;
    if v_n > 0 then e := e || to_jsonb(format('%s player(s) changed price again', v_n)); end if;

  elsif c.post_type = 'gameweek_thread' then
    if exists (select 1 from public.fpl_gameweek_reports r where r.season_id = (s->>'season_id')::bigint and r.fpl_event_id = (s->>'gw')::int
                 and r.kind = case s->>'kind' when 'preview_update' then 'preview' when 'reflection_correction' then 'reflection' else s->>'kind' end
                 and r.status = 'published' and not r.frozen and r.version > (s->>'version')::int
                 and (s->>'kind' <> 'preview_update' or jsonb_array_length(coalesce(r.payload->'x_update', '[]')) >= 2)) then
      e := e || to_jsonb('a newer version of the report was published'::text);
    end if;

  elsif c.post_type = 'fpl_availability' then
    -- Every listed player still has the status the post gives.
    select count(*) into v_n from jsonb_array_elements(s->'players') t
      join public.fpl_players pl on pl.season_id = (s->>'season_id')::bigint and pl.fpl_player_id = (t->>'fpl_player_id')::int
     where pl.status is distinct from t->>'status' or pl.chance_of_playing_next_round is distinct from (t->>'chance')::int;
    if v_n > 0 then e := e || to_jsonb(format('%s player(s) changed status again', v_n)); end if;

  elsif c.post_type = 'gameweek_outlook' then
    if (select deadline_time from public.fpl_gameweeks where season_id = (s->>'season_id')::bigint and fpl_event_id = (s->>'gw')::int)
       is distinct from (s->>'deadline')::timestamptz then e := e || to_jsonb('deadline changed'::text); end if;
    if (select md5(string_agg(fpl_fixture_id || '@' || coalesce(kickoff_time::text, ''), ',' order by fpl_fixture_id))
          from public.fpl_fixtures where season_id = (s->>'season_id')::bigint and fpl_event_id = (s->>'gw')::int)
       is distinct from s->>'fixtures_sig' then e := e || to_jsonb('fixtures changed'::text); end if;
  end if;
  return e;
end;
$function$;

CREATE OR REPLACE FUNCTION private.social_detect_captaincy(p_run_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_season bigint := public.fpl_current_season_id();
  v_gw integer; v_deadline timestamptz; v_mv text;
  v_checks jsonb := '[]'; v_ok boolean;
  v_n integer; v_m integer; v_ts timestamptz; v_bad jsonb; v_top jsonb;
  v_key text; v_text text; v_line text; v_id bigint; r jsonb; v_blank text;
begin
  select fpl_event_id, deadline_time into v_gw, v_deadline
    from public.fpl_gameweeks where season_id = v_season and deadline_time > now() order by deadline_time limit 1;
  if v_gw is null then
    return jsonb_build_object('status', 'none', 'reason', 'no upcoming FPL deadline');
  end if;
  if v_deadline > now() + interval '72 hours' or v_deadline < now() + interval '3 hours' then
    return jsonb_build_object('status', 'none', 'reason', format('GW%s deadline %s is outside the 72h-3h window', v_gw, v_deadline));
  end if;

  select model_version into v_mv from public.fpl_player_projections where season_id = v_season order by generated_at desc limit 1;

  -- Fixture horizon and team mapping: every fixture in the gameweek maps to a FixtureShark fixture.
  select count(*), count(*) filter (where canonical_fixture_id is null) into v_n, v_m
    from public.fpl_fixtures where season_id = v_season and fpl_event_id = v_gw;
  v_checks := v_checks || private.social_check('gameweek fixtures mapped', v_n > 0 and v_m = 0,
                                               jsonb_build_object('gw', v_gw, 'fixtures', v_n, 'unmapped', v_m));

  -- Every fixture has projections from the latest model version, one row per player per fixture.
  select count(distinct p.fixture_id), count(*) - count(distinct (p.fixture_id, p.fpl_player_id)), min(p.generated_at)
    into v_m, v_n, v_ts
    from public.fpl_player_projections p
    join public.fpl_fixtures ff on ff.season_id = p.season_id and ff.canonical_fixture_id = p.fixture_id
   where p.season_id = v_season and ff.fpl_event_id = v_gw and p.model_version = v_mv
     and coalesce(p.scenario_key, 'baseline') = 'baseline';
  v_checks := v_checks || private.social_check('projections cover every fixture',
      v_m = (select count(*) from public.fpl_fixtures where season_id = v_season and fpl_event_id = v_gw),
      jsonb_build_object('model_version', v_mv, 'fixtures_projected', v_m));
  v_checks := v_checks || private.social_check('one projection per player per fixture', v_n = 0, jsonb_build_object('duplicates', v_n));
  v_checks := v_checks || private.social_check('projections fresh (< 30h)', v_ts >= now() - interval '30 hours',
                                               jsonb_build_object('oldest_generated_at', v_ts));

  -- FPL prices and statuses fresh.
  select max(completed_at) into v_ts from public.fpl_ingestion_runs where status = 'success';
  v_checks := v_checks || private.social_check('FPL data refreshed (< 12h)', v_ts >= now() - interval '12 hours',
                                               jsonb_build_object('last_success', v_ts));

  -- Latest projection pipeline run did not fail.
  select status into r from (select to_jsonb(status) status from public.pipeline_runs
                               where job_name = 'refresh_fpl_projections' and status in ('success', 'failed')
                               order by started_at desc limit 1) x;
  v_checks := v_checks || private.social_check('last projection run succeeded', r = to_jsonb('success'::text),
                                               jsonb_build_object('status', r));

  -- Team mapping: FPL team -> FixtureShark team agrees for every player.
  select count(*) into v_n from public.fpl_players pl join public.fpl_teams ft on ft.season_id = pl.season_id and ft.fpl_team_id = pl.fpl_team_id
   where pl.season_id = v_season and ft.canonical_team_id is distinct from pl.canonical_team_id;
  v_checks := v_checks || private.social_check('player team mapping consistent', v_n = 0, jsonb_build_object('mismatched_players', v_n));

  -- Reconcile: players' expected goals add up to the team forecast the projection used, per team per fixture.
  with tp as (
    select p.fixture_id, pl.canonical_team_id team_id, sum(p.expected_goals) player_xg
      from public.fpl_player_projections p
      join public.fpl_fixtures ff on ff.season_id = p.season_id and ff.canonical_fixture_id = p.fixture_id
      join public.fpl_players pl on pl.season_id = p.season_id and pl.fpl_player_id = p.fpl_player_id
     where p.season_id = v_season and ff.fpl_event_id = v_gw and p.model_version = v_mv
       and coalesce(p.scenario_key, 'baseline') = 'baseline'
     group by 1, 2),
  tf as (
    select tp.*, case when tp.team_id = f.home_team_id then coalesce(f.market_home_goals, f.predicted_home_goals)
                      when tp.team_id = f.away_team_id then coalesce(f.market_away_goals, f.predicted_away_goals) end team_goals,
           count(*) over (partition by tp.fixture_id) teams_in_fixture
      from tp join public.fixtures f on f.fixture_id = tp.fixture_id)
  select coalesce(jsonb_agg(jsonb_build_object('fixture_id', fixture_id, 'team_id', team_id, 'players_xg', round(player_xg, 3),
                                               'team_goals', round(team_goals::numeric, 3), 'teams_in_fixture', teams_in_fixture)), '[]')
    into v_bad from tf
   where team_goals is null or teams_in_fixture <> 2 or abs(player_xg - team_goals::numeric) > 0.05;
  v_checks := v_checks || private.social_check('player xG reconciles with team forecast (within 0.05)', jsonb_array_length(v_bad) = 0,
                                               jsonb_build_object('mismatches', v_bad));

  v_top := private.social_captaincy_top(v_season, v_gw, v_mv, 5);
  v_checks := v_checks || private.social_check('five available players ranked', jsonb_array_length(v_top) = 5, null);

  -- Each ranked player's fixtures in this gameweek include his team.
  select count(*) into v_n
    from jsonb_array_elements(v_top) t
    join public.fpl_player_projections p on p.season_id = v_season and p.fpl_player_id = (t->>'fpl_player_id')::int and p.model_version = v_mv
    join public.fpl_fixtures ff on ff.season_id = p.season_id and ff.canonical_fixture_id = p.fixture_id and ff.fpl_event_id = v_gw
    join public.fixtures f on f.fixture_id = p.fixture_id
   where (t->>'team_id')::bigint not in (f.home_team_id, f.away_team_id);
  v_checks := v_checks || private.social_check('ranked players play in their projected fixtures', v_n = 0, jsonb_build_object('wrong_fixture_rows', v_n));

  select bool_and((c->>'ok')::boolean) into v_ok from jsonb_array_elements(v_checks) c;
  if not v_ok then
    return jsonb_build_object('status', 'rejected', 'gw', v_gw, 'checks', v_checks);
  end if;

  -- Blank chance (2 points or fewer) for the top two, from the newest published preview's simulation.
  select 'Blank chance (2 pts or fewer): ' || string_agg(format('%s %s%%', t->>'web_name', round((pc->>'p_blank')::numeric * 100)), ', ' order by (t->>'rank')::int)
    into v_blank
    from jsonb_array_elements(v_top) t
    join lateral (select pc from public.fpl_gameweek_reports r, jsonb_array_elements(r.payload->'captains') pc
                   where r.season_id = v_season and r.fpl_event_id = v_gw and r.kind = 'preview' and r.status = 'published'
                     and (pc->>'id')::int = (t->>'fpl_player_id')::int and pc->>'p_blank' is not null
                   order by r.version desc limit 1) x on true
   where (t->>'rank')::int <= 2
  having count(*) = 2;
  -- Template 2 (21 Oct 2026): no model line; the blank line once the preview has it.
  v_key := format('fpl_captaincy:%s:%s:%s:%s:t2%s', v_season, v_gw, v_mv,
                  (select string_agg(t->>'fpl_player_id', '-' order by (t->>'rank')::int) from jsonb_array_elements(v_top) t where (t->>'rank')::int <= 3),
                  case when v_blank is not null then ':b' else '' end);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'top three unchanged since the last candidate', 'gw', v_gw);
  end if;

  v_text := format('FPL GW%s captaincy: FixtureShark projected points', v_gw);
  for r in select * from jsonb_array_elements(v_top) loop
    v_line := format('%s. %s (%s, £%sm) %s%s', r->>'rank', r->>'web_name', r->>'team_short',
                     private.social_fmt((r->>'now_cost')::numeric / 10, 1), private.social_fmt((r->>'xpts')::numeric, 1),
                     case when (r->>'fixtures')::int > 1 then format(' (%s fixtures)', r->>'fixtures') else '' end);
    v_text := v_text || E'\n' || v_line;
  end loop;
  if v_blank is not null then v_text := v_text || E'\n' || v_blank; end if;

  -- A newer ranking replaces older pending ones for the same gameweek.
  update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
   where post_type = 'fpl_captaincy' and approval_status = 'pending'
     and (source_data->>'season_id')::bigint = v_season and (source_data->>'gw')::int = v_gw;

  insert into public.social_post_candidates (post_type, text, generated_text, source_data, model_version, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fpl_captaincy', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'gw', v_gw, 'deadline', v_deadline, 'model_version', v_mv,
                             'players', v_top, 'checks', v_checks),
          v_mv, (select max((t->>'generated_to')::timestamptz) from jsonb_array_elements(v_top) t), v_key,
          v_deadline, 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fpl_captaincy', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'gw', v_gw, 'checks', v_checks);
end;
$function$;

CREATE OR REPLACE FUNCTION private.social_detect_gameweek_threads(p_run_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_season bigint := public.fpl_current_season_id();
  rep record; v_posts text[]; v_url text; v_key text; v_text text; v_id bigint; v_checks jsonb; v_expires timestamptz;
  v_out jsonb := '[]'; v_too_long integer;
begin
  for rep in
    select distinct on (r.kind) r.report_id, r.season_label, r.fpl_event_id gw, r.kind, r.version, r.published_at, r.x_thread
      from public.fpl_gameweek_reports r
     where r.season_id = v_season and r.status = 'published' and not r.frozen
       and r.published_at > now() - interval '4 days'
     order by r.kind, r.fpl_event_id desc, r.version desc
  loop
    if exists (select 1 from public.social_post_candidates c where c.post_type = 'gameweek_thread'
                 and (c.source_data->>'season_id')::bigint = v_season and (c.source_data->>'gw')::int = rep.gw
                 and c.source_data->>'kind' = rep.kind and c.publication_status in ('publishing', 'published', 'needs_check')) then
      v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'none', 'reason', 'already posted');
      continue;
    end if;
    v_key := format('gameweek_thread:%s:%s:%s:v%s', v_season, rep.gw, rep.kind, rep.version);
    if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
      v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'none', 'reason', 'version already queued');
      continue;
    end if;

    v_url := format('https://fixtureshark.com/fpl/gameweek/%s/%s/%s', rep.season_label, rep.gw, rep.kind);
    -- Links come out of every post; a post that was only a link ("...: <url>") goes.
    select array_agg(q order by n) into v_posts
      from (select n, btrim(regexp_replace(p, '\s*https?://\S+', '', 'g')) q
              from jsonb_array_elements_text(coalesce(rep.x_thread, '[]')) with ordinality t(p, n)) x
     where q <> '' and q !~ ':$' and not public.social_has_url(q);
    if rep.kind = 'preview' and v_posts is not null then
      v_posts[1] := v_posts[1] || ' ' || v_url;
    end if;
    select count(*) into v_too_long from unnest(coalesce(v_posts, '{}')) p where public.social_weighted_length(p) > 280;
    v_checks := jsonb_build_array(
      private.social_check('thread has posts', coalesce(array_length(v_posts, 1), 0) >= 2, jsonb_build_object('posts', coalesce(array_length(v_posts, 1), 0))),
      private.social_check('every post within 280', v_too_long = 0, jsonb_build_object('too_long', v_too_long)));
    if coalesce(array_length(v_posts, 1), 0) < 2 or v_too_long > 0 then
      v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'rejected', 'checks', v_checks);
      continue;
    end if;

    select deadline_time into v_expires from public.fpl_gameweeks
     where season_id = v_season and fpl_event_id = case when rep.kind = 'preview' then rep.gw else rep.gw + 1 end;
    v_expires := coalesce(v_expires, now() + interval '3 days');
    v_text := array_to_string(v_posts, E'\n\n');

    -- A newer version replaces an older one that hasn't gone out.
    update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
     where post_type = 'gameweek_thread' and approval_status in ('pending', 'approved') and publication_status in ('unpublished', 'failed')
       and (source_data->>'season_id')::bigint = v_season and (source_data->>'gw')::int = rep.gw and source_data->>'kind' = rep.kind;

    insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                               expires_at, validation_status, validation_errors, detector_run_id)
    values ('gameweek_thread', v_text, v_text, to_jsonb(v_posts),
            jsonb_build_object('season_id', v_season, 'gw', rep.gw, 'kind', rep.kind, 'report_id', rep.report_id,
                               'version', rep.version, 'url', v_url, 'checks', v_checks),
            rep.published_at, v_key, v_expires, 'passed', '[]', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'gameweek_thread', 'run_id', p_run_id));
    v_out := v_out || jsonb_build_object('kind', rep.kind, 'gw', rep.gw, 'status', 'created', 'candidate_id', v_id);
  end loop;

  -- The evening team-news update (after the press conferences): once per
  -- gameweek, from the newest preview version that carries one. No link.
  for rep in
    select r.report_id, r.season_label, r.fpl_event_id gw, r.version, r.published_at, r.payload->'x_update' posts
      from public.fpl_gameweek_reports r
     where r.season_id = v_season and r.kind = 'preview' and r.status = 'published' and not r.frozen
       and jsonb_typeof(r.payload->'x_update') = 'array' and jsonb_array_length(r.payload->'x_update') >= 2
       and r.published_at > now() - interval '1 day'
       and extract(hour from r.published_at at time zone 'Europe/London') >= 16
     order by r.fpl_event_id desc, r.version desc limit 1
  loop
    if exists (select 1 from public.social_post_candidates c where c.post_type = 'gameweek_thread'
                 and (c.source_data->>'season_id')::bigint = v_season and (c.source_data->>'gw')::int = rep.gw
                 and c.source_data->>'kind' = 'preview_update' and c.publication_status in ('publishing', 'published', 'needs_check')) then
      v_out := v_out || jsonb_build_object('kind', 'preview_update', 'gw', rep.gw, 'status', 'none', 'reason', 'already posted');
      continue;
    end if;
    v_key := format('gameweek_thread:%s:%s:preview_update:v%s', v_season, rep.gw, rep.version);
    if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
      v_out := v_out || jsonb_build_object('kind', 'preview_update', 'gw', rep.gw, 'status', 'none', 'reason', 'version already queued');
      continue;
    end if;
    select array_agg(q order by n) into v_posts
      from (select n, btrim(regexp_replace(p, '\s*https?://\S+', '', 'g')) q
              from jsonb_array_elements_text(rep.posts) with ordinality t(p, n)) x
     where q <> '' and q !~ ':$' and not public.social_has_url(q);
    select count(*) into v_too_long from unnest(coalesce(v_posts, '{}')) p where public.social_weighted_length(p) > 280;
    v_checks := jsonb_build_array(
      private.social_check('thread has posts', coalesce(array_length(v_posts, 1), 0) >= 2, jsonb_build_object('posts', coalesce(array_length(v_posts, 1), 0))),
      private.social_check('every post within 280', v_too_long = 0, jsonb_build_object('too_long', v_too_long)));
    if coalesce(array_length(v_posts, 1), 0) < 2 or v_too_long > 0 then
      v_out := v_out || jsonb_build_object('kind', 'preview_update', 'gw', rep.gw, 'status', 'rejected', 'checks', v_checks);
      continue;
    end if;
    select deadline_time into v_expires from public.fpl_gameweeks where season_id = v_season and fpl_event_id = rep.gw;
    if v_expires is null or v_expires < now() + interval '1 hour' then continue; end if;
    v_text := array_to_string(v_posts, E'\n\n');
    update public.social_post_candidates set approval_status = 'superseded', updated_at = now()
     where post_type = 'gameweek_thread' and approval_status in ('pending', 'approved') and publication_status in ('unpublished', 'failed')
       and (source_data->>'season_id')::bigint = v_season and (source_data->>'gw')::int = rep.gw and source_data->>'kind' = 'preview_update';
    insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                               expires_at, validation_status, validation_errors, detector_run_id)
    values ('gameweek_thread', v_text, v_text, to_jsonb(v_posts),
            jsonb_build_object('season_id', v_season, 'gw', rep.gw, 'kind', 'preview_update', 'report_id', rep.report_id,
                               'version', rep.version, 'checks', v_checks),
            rep.published_at, v_key, v_expires, 'passed', '[]', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'gameweek_thread', 'kind', 'preview_update', 'run_id', p_run_id));
    v_out := v_out || jsonb_build_object('kind', 'preview_update', 'gw', rep.gw, 'status', 'created', 'candidate_id', v_id);
  end loop;
  -- Confirmed bonus changed a captaincy score the provisional thread gave: one
  -- reply to that thread (payload.x_correction, from the confirmed version).
  for rep in
    select r.report_id, r.fpl_event_id gw, r.version, r.published_at, r.payload->'x_correction'->>0 post,
           c.x_post_ids, c.candidate_id posted_id
      from public.fpl_gameweek_reports r
      join lateral (select c.x_post_ids, c.candidate_id, (c.source_data->>'version')::int version from public.social_post_candidates c
                     where c.post_type = 'gameweek_thread' and (c.source_data->>'season_id')::bigint = v_season
                       and (c.source_data->>'gw')::int = r.fpl_event_id and c.source_data->>'kind' = 'reflection'
                       and c.publication_status = 'published' and jsonb_typeof(c.x_post_ids) = 'array'
                     order by c.candidate_id desc limit 1) c on c.version < r.version
     where r.season_id = v_season and r.kind = 'reflection' and r.status = 'published'
       and jsonb_typeof(r.payload->'x_correction') = 'array' and jsonb_array_length(r.payload->'x_correction') = 1
       and r.published_at > now() - interval '2 days'
  loop
    v_key := format('gameweek_thread:%s:%s:reflection_correction', v_season, rep.gw);
    if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then continue; end if;
    v_text := btrim(regexp_replace(rep.post, '\s*https?://\S+', '', 'g'));
    if v_text = '' or public.social_weighted_length(v_text) > 280 then
      v_out := v_out || jsonb_build_object('kind', 'reflection_correction', 'gw', rep.gw, 'status', 'rejected');
      continue;
    end if;
    insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                               expires_at, validation_status, validation_errors, detector_run_id)
    values ('gameweek_thread', v_text, v_text,
            jsonb_build_object('season_id', v_season, 'gw', rep.gw, 'kind', 'reflection_correction', 'report_id', rep.report_id,
                               'version', rep.version, 'replies_to_candidate', rep.posted_id,
                               'reply_to_x_id', rep.x_post_ids->>(jsonb_array_length(rep.x_post_ids) - 1)),
            rep.published_at, v_key, now() + interval '1 day', 'passed', '[]', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'gameweek_thread', 'kind', 'reflection_correction', 'run_id', p_run_id));
    v_out := v_out || jsonb_build_object('kind', 'reflection_correction', 'gw', rep.gw, 'status', 'created', 'candidate_id', v_id);
  end loop;
  return jsonb_build_object('status', case when exists (select 1 from jsonb_array_elements(v_out) e where e->>'status' = 'created') then 'created' else 'none' end,
                            'fixtures', v_out);
end;
$function$;

CREATE OR REPLACE FUNCTION public.social_run_detectors(p_triggered_by text DEFAULT 'schedule'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_run bigint; v_res jsonb := '{}'; v_one jsonb; v_created integer := 0; d text; v_pr bigint; v_queued integer;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'admin only'; end if;
  if not (select detector_enabled from public.social_settings) then
    return jsonb_build_object('status', 'disabled');
  end if;
  insert into public.social_detector_runs (triggered_by) values (coalesce(p_triggered_by, 'schedule')) returning run_id into v_run;
  insert into public.pipeline_runs (job_name, started_at, status) values ('social_detect', now(), 'running') returning run_id into v_pr;

  foreach d in array array['captaincy', 'xg_change', 'accuracy', 'streaks', 'price_changes', 'gameweek_threads',
                            'availability', 'market', 'week_changes', 'outlook'] loop
    begin
      execute format('select private.social_detect_%s($1)', d) into v_one using v_run;
    exception when others then
      v_one := jsonb_build_object('status', 'error', 'error', sqlerrm);
    end;
    v_res := v_res || jsonb_build_object(d, v_one);
    if v_one->>'status' = 'created' then
      v_created := v_created + greatest(1, (select count(*) from jsonb_array_elements(coalesce(v_one->'fixtures', '[]')) f where f->>'status' = 'created'));
    end if;
  end loop;
  v_queued := private.social_auto_queue();

  update public.social_detector_runs set finished_at = now(), results = v_res || jsonb_build_object('auto_queued', v_queued),
         candidates_created = v_created where run_id = v_run;
  update public.pipeline_runs set finished_at = now(),
         status = case when exists (select 1 from jsonb_each(v_res) e where e.value->>'status' = 'error') then 'failed' else 'success' end,
         summary = format('%s candidate(s), %s queued automatically; %s', v_created, v_queued,
                          (select string_agg(e.key || ' ' || (e.value->>'status'), ', ') from jsonb_each(v_res) e))
   where run_id = v_pr;
  return jsonb_build_object('run_id', v_run, 'candidates_created', v_created, 'auto_queued', v_queued, 'results', v_res);
end;
$function$;

CREATE OR REPLACE FUNCTION private.social_detect_price_changes(p_run_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_season bigint := public.fpl_current_season_id();
  v_today date := (now() at time zone 'Europe/London')::date;
  v_checks jsonb := '[]'; v_ok boolean; v_ts timestamptz; v_n integer;
  v_rows jsonb; v_key text; v_text text; v_line text; v_id bigint; r jsonb; v_up text[] := '{}'; v_down text[] := '{}';
  v_nup integer; v_ndown integer; v_shown_up integer := 0; v_shown_down integer := 0;
begin
  if false then
    return jsonb_build_object('status', 'none', 'reason', 'price changes are checked in the morning');
  end if;
  v_key := format('fpl_price_changes:%s:%s', v_season, v_today);
  if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then
    return jsonb_build_object('status', 'none', 'reason', 'already made today');
  end if;

  select max(completed_at) into v_ts from public.fpl_ingestion_runs where status = 'success';
  v_checks := v_checks || private.social_check('FPL refreshed after the overnight price update',
      v_ts >= (v_today::timestamp + interval '2 hours') at time zone 'Europe/London', jsonb_build_object('last_success', v_ts));
  select count(*) into v_n from public.fpl_player_snapshots where season_id = v_season and snapshot_date = v_today - 1;
  v_checks := v_checks || private.social_check('yesterday''s price snapshot exists', v_n >= 500, jsonb_build_object('players', v_n));

  with y as (select distinct on (fpl_player_id) fpl_player_id, now_cost from public.fpl_player_snapshots
              where season_id = v_season and snapshot_date = v_today - 1 order by fpl_player_id, captured_at desc),
  ch as (select p.fpl_player_id, p.web_name, coalesce(t.short_name, '') team, y.now_cost before, p.now_cost now,
                coalesce(p.selected_by_percent, 0)::numeric own
           from public.fpl_players p join y using (fpl_player_id)
           left join public.fpl_teams t on t.season_id = p.season_id and t.fpl_team_id = p.fpl_team_id
          where p.season_id = v_season and p.now_cost is distinct from y.now_cost and p.now_cost is not null and y.now_cost is not null)
  select coalesce(jsonb_agg(to_jsonb(ch) order by own desc, fpl_player_id), '[]') into v_rows from ch;

  select bool_and((c->>'ok')::boolean) into v_ok from jsonb_array_elements(v_checks) c;
  if not v_ok then return jsonb_build_object('status', 'rejected', 'checks', v_checks); end if;
  -- More than 60 moves in a night means a snapshot problem, not a market.
  v_checks := v_checks || private.social_check('a believable number of changes', jsonb_array_length(v_rows) <= 60,
                                               jsonb_build_object('changes', jsonb_array_length(v_rows)));
  if jsonb_array_length(v_rows) > 60 then return jsonb_build_object('status', 'rejected', 'checks', v_checks); end if;
  if jsonb_array_length(v_rows) = 0 then return jsonb_build_object('status', 'none', 'reason', 'no price changes overnight'); end if;

  select count(*) filter (where (e->>'now')::int > (e->>'before')::int), count(*) filter (where (e->>'now')::int < (e->>'before')::int)
    into v_nup, v_ndown from jsonb_array_elements(v_rows) e;
  -- Template 2 (21 Oct 2026): old and new price and ownership, most-owned first;
  -- whatever doesn't fit is counted at the end.
  v_text := 'FPL price changes overnight';
  for r in select e from jsonb_array_elements(v_rows) e
            order by ((e->>'now')::int > (e->>'before')::int) desc, (e->>'own')::numeric desc, (e->>'fpl_player_id')::int loop
    v_line := format('%s %s (%s) £%sm → £%sm, %s%% owned',
                     case when (r->>'now')::int > (r->>'before')::int then '⬆️' else '⬇️' end, r->>'web_name', r->>'team',
                     private.social_fmt((r->>'before')::numeric / 10, 1), private.social_fmt((r->>'now')::numeric / 10, 1),
                     private.social_fmt((r->>'own')::numeric, 1));
    if public.social_weighted_length(v_text || E'\n' || v_line || E'\n99 more rose, all under 1% owned' || E'\n99 more fell, all under 1% owned') <= 280
       and ((r->>'own')::numeric >= 1 or v_shown_up + v_shown_down < 3) then
      v_text := v_text || E'\n' || v_line;
      if (r->>'now')::int > (r->>'before')::int then v_shown_up := v_shown_up + 1; else v_shown_down := v_shown_down + 1; end if;
      v_up := v_up || (r->>'fpl_player_id');
    end if;
  end loop;
  -- The rest, counted ('all under 1% owned' only when that is true).
  if v_nup > v_shown_up then
    v_text := v_text || E'\n' || format('%s %s rose%s', v_nup - v_shown_up, case when v_shown_up > 0 then 'more' else 'players' end,
      case when not exists (select 1 from jsonb_array_elements(v_rows) e where (e->>'now')::int > (e->>'before')::int
                              and (e->>'own')::numeric >= 1 and not (e->>'fpl_player_id' = any(v_up))) then ', all under 1% owned' else '' end);
  end if;
  if v_ndown > v_shown_down then
    v_text := v_text || E'\n' || format('%s %s fell%s', v_ndown - v_shown_down, case when v_shown_down > 0 then 'more' else 'players' end,
      case when not exists (select 1 from jsonb_array_elements(v_rows) e where (e->>'now')::int < (e->>'before')::int
                              and (e->>'own')::numeric >= 1 and not (e->>'fpl_player_id' = any(v_up))) then ', all under 1% owned' else '' end);
  end if;

  insert into public.social_post_candidates (post_type, text, generated_text, source_data, snapshot_at, dedupe_key,
                                             expires_at, validation_status, validation_errors, detector_run_id)
  values ('fpl_price_changes', v_text, v_text,
          jsonb_build_object('season_id', v_season, 'date', v_today, 'changes', v_rows, 'checks', v_checks),
          coalesce(v_ts, now()), v_key, (v_today::timestamp + interval '21 hours') at time zone 'Europe/London', 'passed', '[]', p_run_id)
  returning candidate_id into v_id;
  perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'fpl_price_changes', 'run_id', p_run_id));
  return jsonb_build_object('status', 'created', 'candidate_id', v_id, 'changes', jsonb_array_length(v_rows), 'checks', v_checks);
end;
$function$;

-- Hourly detectors (were 4 a day), so posts go out near their set times.
select cron.unschedule('social-detect-candidates') where exists (select 1 from cron.job where jobname = 'social-detect-candidates');
select cron.schedule('social-detect-candidates', '25 * * * *', $$select public.social_run_detectors('schedule')$$);

update public.job_registry set schedule = '25 * * * *', expected_interval = interval '2 hours'
 where job_key = 'social-detect-candidates';
