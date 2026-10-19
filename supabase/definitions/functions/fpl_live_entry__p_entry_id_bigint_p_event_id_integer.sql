-- Live definition exported from the database (function fpl_live_entry(p_entry_id bigint, p_event_id integer)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.fpl_live_entry(p_entry_id bigint, p_event_id integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
 SET statement_timeout TO '9s'
AS $function$
declare
  hdr json := nullif(current_setting('request.headers', true), '')::json;
  v_season bigint := public.fpl_current_season_id();
  v_current int;
  ev int;
  gw record;
  cached record;
  who text;
  st int;
  body text;
  entry_json jsonb;
  picks_json jsonb;
  elements int[];
  v_model text;
  v_snapshot timestamptz;
begin
  if p_entry_id is null or p_entry_id < 1 or p_entry_id > 99999999 then
    return jsonb_build_object('status', 'bad_id');
  end if;

  select g.fpl_event_id into v_current from public.fpl_gameweeks g
   where g.season_id = v_season and g.is_current order by g.fpl_event_id desc limit 1;
  if v_current is null then
    return jsonb_build_object('status', 'not_started');
  end if;
  ev := coalesce(p_event_id, v_current);
  if ev < 1 or ev > v_current then
    return jsonb_build_object('status', 'bad_event', 'current_event', v_current);
  end if;
  select g.fpl_event_id, g.name, g.deadline_time, g.finished, g.data_checked, g.is_current
    into gw from public.fpl_gameweeks g where g.season_id = v_season and g.fpl_event_id = ev;

  select c.* into cached from private.fpl_live_picks_cache c
   where c.entry_id = p_entry_id and c.season_id = v_season and c.fpl_event_id = ev;

  if cached is null then
    who := coalesce(
      hdr ->> 'cf-connecting-ip',
      hdr ->> 'x-real-ip',
      nullif(trim(reverse(split_part(reverse(coalesce(hdr ->> 'x-forwarded-for', '')), ',', 1))), ''),
      'unknown');
    -- FPL Live's own budget (11 Oct 2026), separate from Rate My Team's, so a
    -- rush on one can't lock the other: 12 new teams a minute per visitor,
    -- 120 a minute across the site.
    delete from private.fpl_live_calls where called_at < now() - interval '2 minutes';
    if (select count(*) from private.fpl_live_calls
         where client = who and called_at > now() - interval '1 minute') >= 12 then
      return jsonb_build_object('status', 'busy');
    end if;
    if (select count(*) from private.fpl_live_calls where called_at > now() - interval '1 minute') >= 120 then
      return jsonb_build_object('status', 'busy');
    end if;
    insert into private.fpl_live_calls (client) values (who);

    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '3000');
    begin
      select h.status, h.content into st, body
        from extensions.http_get('https://fantasy.premierleague.com/api/entry/' || p_entry_id || '/') h;
    exception when others then
      return jsonb_build_object('status', 'unavailable', 'fpl_status', 0);
    end;
    if st = 404 then return jsonb_build_object('status', 'not_found'); end if;
    if st <> 200 then return jsonb_build_object('status', 'unavailable', 'fpl_status', st); end if;
    entry_json := body::jsonb;

    begin
      select h.status, h.content into st, body
        from extensions.http_get('https://fantasy.premierleague.com/api/entry/' || p_entry_id || '/event/' || ev || '/picks/') h;
    exception when others then
      return jsonb_build_object('status', 'unavailable', 'fpl_status', 0);
    end;
    if st = 404 then
      return jsonb_build_object('status', 'no_picks', 'event', ev, 'current_event', v_current,
        'entry', jsonb_build_object('id', p_entry_id, 'name', entry_json ->> 'name'));
    end if;
    if st <> 200 then return jsonb_build_object('status', 'unavailable', 'fpl_status', st); end if;
    picks_json := body::jsonb;

    insert into private.fpl_live_picks_cache (entry_id, season_id, fpl_event_id, fetched_at, entry, picks)
    values (p_entry_id, v_season, ev, now(),
      jsonb_build_object(
        'id', p_entry_id,
        'name', entry_json ->> 'name',
        'player_name', trim(coalesce(entry_json ->> 'player_first_name', '') || ' ' || coalesce(entry_json ->> 'player_last_name', ''))),
      jsonb_build_object(
        'active_chip', picks_json -> 'active_chip',
        'event_transfers_cost', coalesce((picks_json -> 'entry_history' ->> 'event_transfers_cost')::int, 0),
        'automatic_subs', coalesce((select jsonb_agg(jsonb_build_object('element_in', (s ->> 'element_in')::int, 'element_out', (s ->> 'element_out')::int))
                                    from jsonb_array_elements(picks_json -> 'automatic_subs') s), '[]'::jsonb),
        'picks', coalesce((select jsonb_agg(jsonb_build_object(
                     'element', (p ->> 'element')::int, 'position', (p ->> 'position')::int,
                     'multiplier', (p ->> 'multiplier')::int, 'is_captain', (p ->> 'is_captain')::boolean,
                     'is_vice_captain', (p ->> 'is_vice_captain')::boolean) order by (p ->> 'position')::int)
                   from jsonb_array_elements(picks_json -> 'picks') p), '[]'::jsonb)))
    on conflict (entry_id, season_id, fpl_event_id) do nothing;
    select c.* into cached from private.fpl_live_picks_cache c
     where c.entry_id = p_entry_id and c.season_id = v_season and c.fpl_event_id = ev;
  end if;

  select array_agg((p ->> 'element')::int) into elements from jsonb_array_elements(cached.picks -> 'picks') p;

  -- Deadline projections: the latest pre-deadline snapshot, preferring the
  -- model the site shows (leaguewide_v6).
  select s.model_version, s.snapshot_at into v_model, v_snapshot
  from public.fpl_projection_snapshots s
  where s.season_id = v_season and s.fpl_event_id = ev and s.snapshot_kind = 'pre_deadline'
  order by (s.model_version = 'leaguewide_v6') desc, s.snapshot_at desc
  limit 1;

  return jsonb_build_object(
    'status', 'ok',
    'entry', cached.entry,
    'event', jsonb_build_object('id', ev, 'name', gw.name, 'deadline', gw.deadline_time, 'finished', gw.finished,
                                'data_checked', gw.data_checked, 'is_current', gw.is_current, 'current_event', v_current),
    'picks', cached.picks,
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.fpl_player_id, 'web_name', p.web_name, 'slug', p.slug, 'team', p.fpl_team_id, 'type', p.element_type,
        'minutes', coalesce(le.minutes, 0), 'explain', coalesce(le.explain, '[]'::jsonb)))
      from public.fpl_players p
      left join public.fpl_live_elements le
        on le.season_id = v_season and le.fpl_event_id = ev and le.fpl_player_id = p.fpl_player_id
      where p.season_id = v_season and p.fpl_player_id = any(elements)), '[]'::jsonb),
    'teams', coalesce((select jsonb_agg(jsonb_build_object('id', t.fpl_team_id, 'short_name', t.short_name, 'name', t.name) order by t.fpl_team_id)
      from public.fpl_teams t where t.season_id = v_season), '[]'::jsonb),
    'fixtures', coalesce(
      (select jsonb_agg(jsonb_build_object(
          'id', lf.fpl_fixture_id, 'team_h', lf.team_h, 'team_a', lf.team_a, 'kickoff_time', lf.kickoff_time,
          'started', lf.started, 'finished_provisional', lf.finished_provisional, 'finished', lf.finished,
          'minutes', lf.minutes, 'team_h_score', lf.team_h_score, 'team_a_score', lf.team_a_score,
          'bps', lf.bps, 'bonus', lf.bonus) order by lf.kickoff_time, lf.fpl_fixture_id)
       from public.fpl_live_fixtures lf where lf.season_id = v_season and lf.fpl_event_id = ev),
      (select jsonb_agg(jsonb_build_object(
          'id', f.fpl_fixture_id, 'team_h', f.fpl_home_team_id, 'team_a', f.fpl_away_team_id, 'kickoff_time', f.kickoff_time,
          'started', coalesce(f.started, false), 'finished_provisional', coalesce(f.finished, false), 'finished', coalesce(f.finished, false),
          'minutes', 0, 'team_h_score', f.team_h_score, 'team_a_score', f.team_a_score,
          'bps', '[]'::jsonb, 'bonus', '[]'::jsonb) order by f.kickoff_time, f.fpl_fixture_id)
       from public.fpl_fixtures f where f.season_id = v_season and f.fpl_event_id = ev),
      '[]'::jsonb),
    'projections', coalesce((
      select jsonb_agg(jsonb_build_object('element', s.fpl_player_id, 'fixture', s.fixture_id, 'xp', round(s.expected_fpl_points, 2)))
      from public.fpl_projection_snapshots s
      where s.season_id = v_season and s.fpl_event_id = ev and s.snapshot_kind = 'pre_deadline'
        and s.model_version = v_model and s.snapshot_at = v_snapshot and s.fpl_player_id = any(elements)), '[]'::jsonb),
    'projection_model', v_model,
    'live_updated_at', (select max(lf.fetched_at) from public.fpl_live_fixtures lf where lf.season_id = v_season and lf.fpl_event_id = ev),
    'picks_fetched_at', cached.fetched_at
  );
end;
$function$
;
