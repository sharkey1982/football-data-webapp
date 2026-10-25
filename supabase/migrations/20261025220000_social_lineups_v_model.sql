-- ============================================================================
-- Line-ups v our model on X (Chris, 25 Oct 2026: "one of the most interesting
-- posts you could make is lineup info and how it compares to the model").
--
-- About 10 minutes after each Premier League kick-off slot, one thread:
--   * opener: how many starters our model expected, and the biggest surprise
--     (a highly owned player we rated a likely starter left out, or a player
--     we gave little chance starting);
--   * one post per game: per team, how many of the 11 we expected, who
--     started that we didn't expect (with the chance we gave), who we
--     expected that didn't start (with the chance and FPL ownership).
-- Starters: FPL live data (fpl_live_elements.explain, minutes per fixture,
-- so double gameweeks are right): the 11 with most minutes, once every team
-- in the slot has 11 players on. Model XI: the 11 highest start
-- probabilities in the pre-deadline snapshot (fpl_deadline_player_horizon),
-- so it is what we published before the deadline, not a later revision.
--
-- Runs every 5 minutes from kick-off + 8 to + 45; queued 5 minutes after it
-- is made; expires kick-off + 60. Daily post limit 5 -> 8 (a Saturday can
-- have three kick-off slots on top of the regular posts).
-- ============================================================================

update public.social_settings set max_posts_per_day = 8, updated_at = now() where id and max_posts_per_day < 8;

alter table public.social_post_candidates drop constraint social_post_candidates_post_type_check;
alter table public.social_post_candidates add constraint social_post_candidates_post_type_check check (post_type = any (array[
  'fpl_captaincy', 'team_xg_change', 'prediction_accuracy', 'historical_insight', 'announcement', 'fpl_price_changes',
  'gameweek_thread', 'fpl_availability', 'fpl_market', 'fpl_week_changes', 'gameweek_outlook', 'fixture_moved',
  'match_predictions', 'quiz', 'quiz_answer', 'fact', 'daily_market', 'lineup_vs_model']));

-- One FPL fixture: per team, starters v the model's pre-deadline XI.
create or replace function private.social_lineup_fixture(p_season bigint, p_fpl_fixture_id integer)
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  with fx as (
    select ff.fpl_fixture_id, ff.fpl_event_id ev, ff.canonical_fixture_id cf, ff.fpl_home_team_id th, ff.fpl_away_team_id ta
      from public.fpl_fixtures ff where ff.season_id = p_season and ff.fpl_fixture_id = p_fpl_fixture_id),
  mins as (
    select e.fpl_player_id, p.fpl_team_id, (s->>'value')::int m
      from fx
      join public.fpl_live_elements e on e.season_id = p_season and e.fpl_event_id = fx.ev
      cross join lateral jsonb_array_elements(coalesce(e.explain, '[]')) x
      cross join lateral jsonb_array_elements(coalesce(x->'stats', '[]')) s
      join public.fpl_players p on p.season_id = p_season and p.fpl_player_id = e.fpl_player_id
     where (x->>'fixture')::int = fx.fpl_fixture_id and s->>'identifier' = 'minutes' and (s->>'value')::int > 0
       and p.fpl_team_id in (fx.th, fx.ta)),
  starters as (
    select * from (select mins.*, row_number() over (partition by fpl_team_id order by m desc, fpl_player_id) rn from mins) z where rn <= 11),
  snap as (
    select distinct on (h.fpl_player_id) h.fpl_player_id, p.fpl_team_id, h.start_probability sp
      from fx
      join public.fpl_deadline_player_horizon h on h.season_id = p_season and h.fpl_event_id = fx.ev
                                                and h.snapshot_kind = 'pre_deadline' and h.fixture_id = fx.cf
      join public.fpl_players p on p.season_id = p_season and p.fpl_player_id = h.fpl_player_id
     where p.fpl_team_id in (fx.th, fx.ta)
     order by h.fpl_player_id, h.snapshot_at desc),
  model as (
    select * from (select snap.*, row_number() over (partition by fpl_team_id order by sp desc, fpl_player_id) rn from snap) z where rn <= 11),
  teams as (select fx.th tid, 'home' side from fx union all select fx.ta, 'away' from fx)
  select jsonb_build_object(
    'fpl_fixture_id', p_fpl_fixture_id,
    'teams', jsonb_agg(jsonb_build_object(
      'side', t.side,
      'team', (select ft.name from public.fpl_teams ft where ft.season_id = p_season and ft.fpl_team_id = t.tid),
      'started', (select count(*) from starters s where s.fpl_team_id = t.tid),
      'model', (select count(*) from model m where m.fpl_team_id = t.tid),
      'matched', (select count(*) from starters s join model m using (fpl_player_id) where s.fpl_team_id = t.tid),
      'ins', (select coalesce(jsonb_agg(jsonb_build_object('id', s.fpl_player_id, 'name', p.web_name,
                                                           'sp', round(coalesce(sn.sp, 0), 2), 'own', p.selected_by_percent)
                                        order by coalesce(sn.sp, 0), p.web_name), '[]')
                from starters s join public.fpl_players p on p.season_id = p_season and p.fpl_player_id = s.fpl_player_id
                left join snap sn on sn.fpl_player_id = s.fpl_player_id
               where s.fpl_team_id = t.tid and not exists (select 1 from model m where m.fpl_player_id = s.fpl_player_id)),
      'outs', (select coalesce(jsonb_agg(jsonb_build_object('id', m.fpl_player_id, 'name', p.web_name,
                                                            'sp', round(m.sp, 2), 'own', p.selected_by_percent)
                                         order by p.selected_by_percent desc nulls last, m.sp desc), '[]')
                 from model m join public.fpl_players p on p.season_id = p_season and p.fpl_player_id = m.fpl_player_id
                where m.fpl_team_id = t.tid and not exists (select 1 from starters s where s.fpl_player_id = m.fpl_player_id))
    ) order by t.side desc))
  from teams t
$$;

-- "Merino (15%), Gyökeres (6%)"; owners shown when 5%+ own a player.
create or replace function private.social_lineup_names(p jsonb, p_max integer default 3)
returns text language sql immutable as $$
  select string_agg(format('%s (%s%s)', e->>'name', round((e->>'sp')::numeric * 100)::int || '%',
                           case when coalesce((e->>'own')::numeric, 0) >= 5 then ', ' || round((e->>'own')::numeric)::int || '% owned' else '' end), ', ' order by ord)
         || case when jsonb_array_length(p) > p_max then format(' +%s more', jsonb_array_length(p) - p_max) else '' end
    from jsonb_array_elements(p) with ordinality t(e, ord) where ord <= p_max
$$;

create or replace function private.social_detect_lineups(p_run_id bigint)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_slot timestamptz; v_key text; v_out jsonb := '[]'; v_fx jsonb; v_all jsonb; r record; t jsonb;
  v_posts text[]; v_p text; v_matched integer; v_total integer; v_sur jsonb; v_sur_team text; v_kind text;
  v_label text; v_exact text; v_id bigint; v_ready boolean; v_n integer;
begin
  for v_slot in
    select distinct ff.kickoff_time from public.fpl_fixtures ff
     where ff.season_id = v_season and ff.kickoff_time between now() - interval '45 minutes' and now() - interval '8 minutes'
  loop
    v_key := format('lineups:%s', to_char(v_slot at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI'));
    if exists (select 1 from public.social_post_candidates where dedupe_key = v_key) then continue; end if;

    v_all := '[]'; v_ready := true; v_n := 0;
    for r in select ff.fpl_fixture_id from public.fpl_fixtures ff
              where ff.season_id = v_season and ff.kickoff_time = v_slot order by ff.fpl_fixture_id loop
      v_fx := private.social_lineup_fixture(v_season, r.fpl_fixture_id);
      v_n := v_n + 1;
      if exists (select 1 from jsonb_array_elements(v_fx->'teams') e where (e->>'started')::int < 11 or (e->>'model')::int < 11) then
        v_ready := false;
      else
        v_all := v_all || jsonb_build_array(v_fx);
      end if;
    end loop;
    -- Wait for every game in the slot; after kick-off + 25 go with the games that are ready.
    if not v_ready and (now() < v_slot + interval '25 minutes' or jsonb_array_length(v_all) = 0) then
      v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'none', 'reason', 'line-ups or model XI not complete yet');
      continue;
    end if;

    select sum((e->>'matched')::int), sum((e->>'started')::int)
      into v_matched, v_total from jsonb_array_elements(v_all) f cross join lateral jsonb_array_elements(f->'teams') e;

    -- Biggest surprise: a likely starter (60%+) left out, most owned first (5%+ owned);
    -- else the starter we rated least likely.
    select o || jsonb_build_object('team', e->>'team'), 'out' into v_sur, v_kind
      from jsonb_array_elements(v_all) f cross join lateral jsonb_array_elements(f->'teams') e
      cross join lateral jsonb_array_elements(e->'outs') o
     where (o->>'sp')::numeric >= 0.60 and coalesce((o->>'own')::numeric, 0) >= 5
     order by (o->>'own')::numeric desc, (o->>'sp')::numeric desc limit 1;
    if v_sur is null then
      select i || jsonb_build_object('team', e->>'team'), 'in' into v_sur, v_kind
        from jsonb_array_elements(v_all) f cross join lateral jsonb_array_elements(f->'teams') e
        cross join lateral jsonb_array_elements(e->'ins') i
       order by (i->>'sp')::numeric, coalesce((i->>'own')::numeric, 0) desc limit 1;
    end if;

    v_label := case when jsonb_array_length(v_all) = 1 then
                 (select string_agg(e->>'team', ' v ' order by e->>'side' desc) from jsonb_array_elements(v_all->0->'teams') e)
               else to_char(v_slot at time zone 'Europe/London', 'FMHH24:MI') || ' kick-offs' end;
    v_p := format(E'%s: the line-ups v our model 🧵\nOur pre-deadline model expected %s of the %s starters.', v_label, v_matched, v_total);
    if v_sur is not null then
      v_p := v_p || case v_kind
        when 'out' then format(E'\n\nBiggest surprise: %s (%s) not starting. We gave him %s to start, and %s of FPL managers own him.',
                               v_sur->>'name', v_sur->>'team', round((v_sur->>'sp')::numeric * 100)::int || '%',
                               round((v_sur->>'own')::numeric)::int || '%')
        else format(E'\n\nBiggest surprise: %s (%s) starts. We gave him %s.',
                    v_sur->>'name', v_sur->>'team', round((v_sur->>'sp')::numeric * 100)::int || '%') end;
    end if;
    -- Games where both XIs were exactly as expected: one line, no post of their own.
    select string_agg((select string_agg(e->>'team', ' v ' order by e->>'side' desc) from jsonb_array_elements(f->'teams') e), ', ')
      into v_exact from jsonb_array_elements(v_all) f
     where not exists (select 1 from jsonb_array_elements(f->'teams') e where (e->>'matched')::int < 11);
    if v_exact is not null then v_p := v_p || E'\n\nBoth XIs exactly as expected: ' || v_exact || '.'; end if;
    v_posts := array[v_p];

    for v_fx in select f from jsonb_array_elements(v_all) f
                 where exists (select 1 from jsonb_array_elements(f->'teams') e where (e->>'matched')::int < 11) loop
      v_p := (select string_agg(e->>'team', ' v ' order by e->>'side' desc) from jsonb_array_elements(v_fx->'teams') e);
      for t in select e from jsonb_array_elements(v_fx->'teams') e order by e->>'side' desc loop
        v_p := v_p || format(E'\n\n%s: %s of 11 as expected', t->>'team', t->>'matched')
                   || case when jsonb_array_length(t->'ins') > 0 then E'\nSurprise starters: ' || private.social_lineup_names(t->'ins') else '' end
                   || case when jsonb_array_length(t->'outs') > 0 then E'\nLeft out: ' || private.social_lineup_names(t->'outs') else '' end;
      end loop;
      if public.social_weighted_length(v_p) > 280 then
        -- Shorter lists.
        v_p := (select string_agg(e->>'team', ' v ' order by e->>'side' desc) from jsonb_array_elements(v_fx->'teams') e);
        for t in select e from jsonb_array_elements(v_fx->'teams') e order by e->>'side' desc loop
          v_p := v_p || format(E'\n\n%s: %s of 11 as expected', t->>'team', t->>'matched')
                     || case when jsonb_array_length(t->'ins') > 0 then E'\nSurprise starters: ' || private.social_lineup_names(t->'ins', 1) else '' end
                     || case when jsonb_array_length(t->'outs') > 0 then E'\nLeft out: ' || private.social_lineup_names(t->'outs', 1) else '' end;
        end loop;
      end if;
      v_posts := v_posts || v_p;
    end loop;
    -- A single game fits in one post when it can.
    if array_length(v_posts, 1) = 1 then v_posts[1] := replace(v_posts[1], ' 🧵', ''); end if;
    if array_length(v_posts, 1) = 2 and public.social_weighted_length(replace(v_posts[1], ' 🧵', '') || E'\n\n' || v_posts[2]) <= 280 then
      v_posts := array[replace(v_posts[1], ' 🧵', '') || E'\n\n' || substr(v_posts[2], position(E'\n\n' in v_posts[2]) + 2)];
    end if;
    if exists (select 1 from unnest(v_posts) p where public.social_weighted_length(p) > 280) then
      v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'rejected', 'reason', 'a post is over 280 characters');
      continue;
    end if;

    insert into public.social_post_candidates (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key,
                                               expires_at, validation_status, validation_errors, detector_run_id)
    values ('lineup_vs_model', array_to_string(v_posts, E'\n\n'), array_to_string(v_posts, E'\n\n'),
            case when array_length(v_posts, 1) > 1 then to_jsonb(v_posts) end,
            jsonb_build_object('season_id', v_season, 'slot', v_slot, 'fixtures', v_all, 'games_in_slot', v_n,
                               'matched', v_matched, 'starters', v_total, 'surprise', v_sur),
            now(), v_key, v_slot + interval '60 minutes', 'passed', '[]', p_run_id)
    returning candidate_id into v_id;
    perform private.social_audit('candidate_created', v_id, null, jsonb_build_object('post_type', 'lineup_vs_model', 'run_id', p_run_id));
    v_out := v_out || jsonb_build_object('slot', v_key, 'status', 'created', 'candidate_id', v_id);
  end loop;
  return jsonb_build_object('status', case when exists (select 1 from jsonb_array_elements(v_out) e where e->>'status' = 'created') then 'created' else 'none' end,
                            'slots', v_out);
end;
$$;

-- Every 5 minutes; does nothing unless a Premier League slot kicked off 8-45 minutes ago.
create or replace function public.social_lineups_tick()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_run bigint; v_res jsonb; v_q integer;
begin
  if not (select detector_enabled from public.social_settings) then return jsonb_build_object('status', 'disabled'); end if;
  if not exists (select 1 from public.fpl_fixtures ff where ff.season_id = public.fpl_current_season_id()
                   and ff.kickoff_time between now() - interval '45 minutes' and now() - interval '8 minutes') then
    return jsonb_build_object('status', 'none');
  end if;
  insert into public.social_detector_runs (triggered_by) values ('lineups') returning run_id into v_run;
  begin
    v_res := private.social_detect_lineups(v_run);
  exception when others then
    v_res := jsonb_build_object('status', 'error', 'error', sqlerrm);
  end;
  v_q := private.social_auto_queue();
  update public.social_detector_runs set finished_at = now(), results = jsonb_build_object('lineups', v_res, 'auto_queued', v_q),
         candidates_created = case when v_res->>'status' = 'created' then 1 else 0 end where run_id = v_run;
  return v_res;
end;
$$;
revoke all on function public.social_lineups_tick() from public, anon, authenticated;

do $$ begin
  if exists (select 1 from cron.job where jobname = 'social-lineups') then perform cron.unschedule('social-lineups'); end if;
  perform cron.schedule('social-lineups', '*/5 * * * *', 'select public.social_lineups_tick()');
end $$;

-- Queued 5 minutes after it is made (a line-up post is stale within the hour).
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
  $o$    -- A post with a set time$o$,
  $n$    if c.post_type = 'lineup_vs_model' then v_hold := now() + interval '5 minutes'; end if;
    -- A post with a set time$n$);

-- Not automatic yet: the first real one (25 Oct, 14:00 games) is a draft for
-- Chris to see; a one-line migration adds it to auto_post_types after.
