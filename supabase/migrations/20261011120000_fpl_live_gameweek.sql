-- ============================================================================
-- FPL Live (11 Oct 2026): live gameweek scores for any FPL team.
-- Scope: project doc claude/fpl-live-gameweek-scope-2026-10-11.md.
--
-- 1. public.fpl_live_elements / fpl_live_fixtures: the FPL live feed
--    (event/{gw}/live/) and fixtures feed for a gameweek, per player and per
--    fixture. Written by private.fpl_live_fetch_event(); public read.
-- 2. private.fpl_live_tick(), pg_cron every minute: fetches the gameweek only
--    while a match is about to start or in play (two FPL requests a minute),
--    then every 10 minutes until FPL confirms bonus. Otherwise it does nothing.
--    Never triggers a site build. Every fetch is logged in public.fpl_live_runs.
-- 3. private.refresh_fpl_live_event() now builds fpl_player_gameweeks from the
--    stored feed and, new, writes double-gameweek players: one row per fixture
--    from the feed's per-fixture `explain` (they were skipped before).
-- 4. public.fpl_live_entry(entry, event): what the /fpl/live page needs for one
--    team. The manager's picks are fetched from FPL once per gameweek and
--    cached (they can't change after the deadline); the same per-visitor
--    (12 a minute) and shared (120 a minute) limits as Rate My Team apply to
--    those fetches. Repeat calls make no FPL requests.
-- 5. Integrity: fpl_live_feed_fresh (failed if a match is in play and the
--    feed is more than 5 minutes old), fpl_live_runs_ok (warning if the last
--    fetch failed).
--
-- FPL refuses many cloud servers but accepts the database's own requests
-- (see 20260930090000_fpl_entry_fetch.sql), so all FPL calls stay here.
-- ============================================================================

-- 1. Tables --------------------------------------------------------------------

create table if not exists public.fpl_live_elements (
  season_id bigint not null references public.seasons (season_id),
  fpl_event_id integer not null,
  fpl_player_id integer not null,
  minutes integer not null default 0,
  total_points integer not null default 0,
  bps integer,
  stats jsonb not null default '{}'::jsonb,
  explain jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (season_id, fpl_event_id, fpl_player_id)
);
comment on table public.fpl_live_elements is
  'FPL live feed (event/{gw}/live/) per player and gameweek: FPL''s aggregate stats and its per-fixture points breakdown (explain). Updated every minute while matches are on (private.fpl_live_tick); rows only change when the figures do.';

create table if not exists public.fpl_live_fixtures (
  season_id bigint not null references public.seasons (season_id),
  fpl_fixture_id integer not null,
  fpl_event_id integer,
  kickoff_time timestamptz,
  team_h integer,
  team_a integer,
  started boolean not null default false,
  finished_provisional boolean not null default false,
  finished boolean not null default false,
  minutes integer not null default 0,
  team_h_score integer,
  team_a_score integer,
  bps jsonb not null default '[]'::jsonb,
  bonus jsonb not null default '[]'::jsonb,
  fetched_at timestamptz not null default now(),
  primary key (season_id, fpl_fixture_id)
);
create index if not exists fpl_live_fixtures_event on public.fpl_live_fixtures (season_id, fpl_event_id);
comment on table public.fpl_live_fixtures is
  'FPL fixtures feed per fixture during a gameweek: state (started, finished_provisional = full time, finished = bonus confirmed), clock, score, top-8 BPS and FPL bonus. Updated with fpl_live_elements.';

create table if not exists public.fpl_live_runs (
  run_id bigserial primary key,
  run_at timestamptz not null default now(),
  fpl_event_id integer,
  status text not null,
  live_http integer,
  fixtures_http integer,
  elements_changed integer,
  fixtures integer,
  duration_ms integer,
  error text
);
create index if not exists fpl_live_runs_run_at on public.fpl_live_runs (run_at desc);
comment on table public.fpl_live_runs is
  'One row per FPL live fetch (private.fpl_live_fetch_event): HTTP statuses, rows changed, time taken, error. Kept 7 days.';

alter table public.fpl_live_elements enable row level security;
alter table public.fpl_live_fixtures enable row level security;
alter table public.fpl_live_runs enable row level security;
drop policy if exists fpl_live_elements_read on public.fpl_live_elements;
create policy fpl_live_elements_read on public.fpl_live_elements for select to anon, authenticated using (true);
drop policy if exists fpl_live_fixtures_read on public.fpl_live_fixtures;
create policy fpl_live_fixtures_read on public.fpl_live_fixtures for select to anon, authenticated using (true);
drop policy if exists fpl_live_runs_read on public.fpl_live_runs;
create policy fpl_live_runs_read on public.fpl_live_runs for select to anon, authenticated using (true);
grant select on public.fpl_live_elements, public.fpl_live_fixtures, public.fpl_live_runs to anon, authenticated;

create table if not exists private.fpl_live_picks_cache (
  entry_id bigint not null,
  season_id bigint not null,
  fpl_event_id integer not null,
  fetched_at timestamptz not null default now(),
  entry jsonb not null,
  picks jsonb not null,
  primary key (entry_id, season_id, fpl_event_id)
);
revoke all on private.fpl_live_picks_cache from public, anon, authenticated;

-- 2. Fetch one gameweek ----------------------------------------------------------

create or replace function private.fpl_live_fetch_event(p_event_id integer, p_season_id bigint default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_season bigint := coalesce(p_season_id, public.fpl_current_season_id());
  t0 timestamptz := clock_timestamp();
  st_live int;
  st_fx int;
  body_live text;
  body_fx text;
  live jsonb;
  fx jsonb;
  n_el int := 0;
  n_fx int := 0;
begin
  if p_event_id is null or v_season is null then
    return jsonb_build_object('status', 'skipped', 'reason', 'no event or season');
  end if;
  begin
    perform extensions.http_set_curlopt('CURLOPT_TIMEOUT_MS', '15000');
    select status, content into st_fx, body_fx
      from extensions.http_get('https://fantasy.premierleague.com/api/fixtures/?event=' || p_event_id);
    select status, content into st_live, body_live
      from extensions.http_get('https://fantasy.premierleague.com/api/event/' || p_event_id || '/live/');
    if st_fx <> 200 or st_live <> 200 then
      insert into public.fpl_live_runs (fpl_event_id, status, live_http, fixtures_http, duration_ms, error)
      values (p_event_id, 'failed', st_live, st_fx, extract(milliseconds from clock_timestamp() - t0)::int, 'FPL returned a non-200 status');
      return jsonb_build_object('status', 'failed', 'event', p_event_id, 'live_http', st_live, 'fixtures_http', st_fx);
    end if;
    live := body_live::jsonb;
    fx := body_fx::jsonb;

    insert into public.fpl_live_elements as le
      (season_id, fpl_event_id, fpl_player_id, minutes, total_points, bps, stats, explain, updated_at)
    select v_season, p_event_id, (e ->> 'id')::int,
      coalesce((e -> 'stats' ->> 'minutes')::int, 0),
      coalesce((e -> 'stats' ->> 'total_points')::int, 0),
      (e -> 'stats' ->> 'bps')::int,
      coalesce(e -> 'stats', '{}'::jsonb),
      coalesce(e -> 'explain', '[]'::jsonb),
      now()
    from jsonb_array_elements(live -> 'elements') e
    on conflict (season_id, fpl_event_id, fpl_player_id) do update set
      minutes = excluded.minutes, total_points = excluded.total_points, bps = excluded.bps,
      stats = excluded.stats, explain = excluded.explain, updated_at = excluded.updated_at
    where (le.minutes, le.total_points, le.bps, le.stats, le.explain)
      is distinct from (excluded.minutes, excluded.total_points, excluded.bps, excluded.stats, excluded.explain);
    get diagnostics n_el = row_count;

    insert into public.fpl_live_fixtures as lf
      (season_id, fpl_fixture_id, fpl_event_id, kickoff_time, team_h, team_a, started, finished_provisional,
       finished, minutes, team_h_score, team_a_score, bps, bonus, fetched_at)
    select v_season, (f ->> 'id')::int, (f ->> 'event')::int, (f ->> 'kickoff_time')::timestamptz,
      (f ->> 'team_h')::int, (f ->> 'team_a')::int,
      coalesce((f ->> 'started')::boolean, false),
      coalesce((f ->> 'finished_provisional')::boolean, false),
      coalesce((f ->> 'finished')::boolean, false),
      coalesce((f ->> 'minutes')::int, 0),
      (f ->> 'team_h_score')::int, (f ->> 'team_a_score')::int,
      coalesce((select jsonb_agg(jsonb_build_object('element', q.el, 'value', q.val) order by q.val desc, q.el)
        from (select (v ->> 'element')::int el, (v ->> 'value')::int val
              from jsonb_array_elements(coalesce(f -> 'stats', '[]'::jsonb)) s,
                   lateral (select * from jsonb_array_elements(s -> 'h') union all select * from jsonb_array_elements(s -> 'a')) t(v)
              where s ->> 'identifier' = 'bps'
              order by (v ->> 'value')::int desc, (v ->> 'element')::int limit 8) q), '[]'::jsonb),
      coalesce((select jsonb_agg(jsonb_build_object('element', (v ->> 'element')::int, 'value', (v ->> 'value')::int)
                                 order by (v ->> 'value')::int desc, (v ->> 'element')::int)
        from jsonb_array_elements(coalesce(f -> 'stats', '[]'::jsonb)) s,
             lateral (select * from jsonb_array_elements(s -> 'h') union all select * from jsonb_array_elements(s -> 'a')) t(v)
        where s ->> 'identifier' = 'bonus'), '[]'::jsonb),
      now()
    from jsonb_array_elements(fx) f
    on conflict (season_id, fpl_fixture_id) do update set
      fpl_event_id = excluded.fpl_event_id, kickoff_time = excluded.kickoff_time, team_h = excluded.team_h,
      team_a = excluded.team_a, started = excluded.started, finished_provisional = excluded.finished_provisional,
      finished = excluded.finished, minutes = excluded.minutes, team_h_score = excluded.team_h_score,
      team_a_score = excluded.team_a_score, bps = excluded.bps, bonus = excluded.bonus, fetched_at = excluded.fetched_at;
    get diagnostics n_fx = row_count;

    delete from public.fpl_live_runs where run_at < now() - interval '7 days';
    insert into public.fpl_live_runs (fpl_event_id, status, live_http, fixtures_http, elements_changed, fixtures, duration_ms)
    values (p_event_id, 'success', st_live, st_fx, n_el, n_fx, extract(milliseconds from clock_timestamp() - t0)::int);
    return jsonb_build_object('status', 'success', 'event', p_event_id, 'elements_changed', n_el, 'fixtures', n_fx);
  exception when others then
    -- Logged, not raised: the cron job retries next minute.
    insert into public.fpl_live_runs (fpl_event_id, status, live_http, fixtures_http, duration_ms, error)
    values (p_event_id, 'failed', st_live, st_fx, extract(milliseconds from clock_timestamp() - t0)::int, left(sqlerrm, 500));
    return jsonb_build_object('status', 'failed', 'event', p_event_id, 'error', sqlerrm);
  end;
end;
$$;
revoke all on function private.fpl_live_fetch_event(integer, bigint) from public, anon, authenticated;

-- 3. The per-minute tick ---------------------------------------------------------

create or replace function private.fpl_live_tick()
returns jsonb
language plpgsql
set search_path = ''
set statement_timeout = '50s'
as $$
declare
  v_season bigint := public.fpl_current_season_id();
  ev int;
  res jsonb := '[]'::jsonb;
begin
  if not pg_try_advisory_xact_lock(hashtext('private.fpl_live_tick')) then
    return jsonb_build_object('status', 'skipped', 'reason', 'previous tick still running');
  end if;
  for ev in
    select distinct f.fpl_event_id
    from public.fpl_fixtures f
    left join public.fpl_live_fixtures lf
      on lf.season_id = f.season_id and lf.fpl_fixture_id = f.fpl_fixture_id
    where f.season_id = v_season
      and f.fpl_event_id is not null
      and coalesce(lf.kickoff_time, f.kickoff_time) <= now() + interval '5 minutes'
      and coalesce(lf.kickoff_time, f.kickoff_time) > now() - interval '2 days'
      and not coalesce(lf.finished, f.finished, false)
      -- Not started 3 hours after kick-off: postponed, stop asking.
      and not (coalesce(lf.kickoff_time, f.kickoff_time) < now() - interval '3 hours'
               and not coalesce(lf.started, f.started, false))
      and (
        -- About to start or in play: every minute.
        not coalesce(lf.finished_provisional, false)
        -- Full time, waiting for FPL to confirm bonus: every 10 minutes.
        or lf.fetched_at < now() - interval '10 minutes'
      )
  loop
    res := res || jsonb_build_array(private.fpl_live_fetch_event(ev, v_season));
  end loop;
  return jsonb_build_object('status', case when jsonb_array_length(res) = 0 then 'idle' else 'fetched' end, 'runs', res);
end;
$$;
revoke all on function private.fpl_live_tick() from public, anon, authenticated;

select cron.schedule('fpl-live-tick', '* * * * *', 'select private.fpl_live_tick();');

-- 4. refresh_fpl_live_event: from the stored feed, double gameweeks included -------

create or replace function private.fpl_explain_value(p_stats jsonb, p_identifier text, p_field text default 'value')
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(sum((s ->> p_field)::int), 0)::int
  from jsonb_array_elements(coalesce(p_stats, '[]'::jsonb)) s
  where s ->> 'identifier' = p_identifier;
$$;

CREATE OR REPLACE FUNCTION private.refresh_fpl_live_event(p_event_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  fetched jsonb;
  n_rows integer := 0;
  n_multi integer := 0;
  v_season bigint;
begin
  select s.season_id into v_season from public.seasons s
  where current_date >= make_date(s.start_year, 8, 1)
    and current_date <  make_date(s.end_year, 8, 1) limit 1;
  if v_season is null then
    raise exception 'No season row covers today (%); add one before refreshing', current_date;
  end if;

  fetched := private.fpl_live_fetch_event(p_event_id, v_season);
  if fetched ->> 'status' <> 'success' then
    raise exception 'FPL event % live fetch failed: %', p_event_id, fetched;
  end if;

  -- Players with exactly one fixture this gameweek: FPL's aggregate stats (as before).
  with single_fixture as (
    select p.fpl_player_id, min(f.fpl_fixture_id) as fixture_id
    from public.fpl_players p
    join public.fpl_fixtures f on f.fpl_event_id = p_event_id and f.season_id = v_season
      and (f.fpl_home_team_id = p.fpl_team_id or f.fpl_away_team_id = p.fpl_team_id)
    where p.season_id = v_season
    group by p.fpl_player_id
    having count(*) = 1
  )
  insert into public.fpl_player_gameweeks(
    fpl_player_id,fpl_event_id,fpl_fixture_id,opponent_fpl_team_id,was_home,kickoff_time,total_points,minutes,
    goals_scored,assists,clean_sheets,goals_conceded,own_goals,penalties_saved,penalties_missed,yellow_cards,
    red_cards,saves,bonus,bps,influence,creativity,threat,ict_index,expected_goals,expected_assists,
    expected_goal_involvements,expected_goals_conceded,value,selected,transfers_in,transfers_out,source_payload,updated_at,season_id
  )
  select le.fpl_player_id, p_event_id, f.fpl_fixture_id,
    case when f.fpl_home_team_id = p.fpl_team_id then f.fpl_away_team_id else f.fpl_home_team_id end,
    (f.fpl_home_team_id = p.fpl_team_id), f.kickoff_time,
    coalesce((s->>'total_points')::int,0), coalesce((s->>'minutes')::int,0), coalesce((s->>'goals_scored')::int,0),
    coalesce((s->>'assists')::int,0), coalesce((s->>'clean_sheets')::int,0), coalesce((s->>'goals_conceded')::int,0),
    coalesce((s->>'own_goals')::int,0), coalesce((s->>'penalties_saved')::int,0), coalesce((s->>'penalties_missed')::int,0),
    coalesce((s->>'yellow_cards')::int,0), coalesce((s->>'red_cards')::int,0), coalesce((s->>'saves')::int,0),
    coalesce((s->>'bonus')::int,0), coalesce((s->>'bps')::int,0), nullif(s->>'influence','')::numeric,
    nullif(s->>'creativity','')::numeric, nullif(s->>'threat','')::numeric, nullif(s->>'ict_index','')::numeric,
    nullif(s->>'expected_goals','')::numeric, nullif(s->>'expected_assists','')::numeric,
    nullif(s->>'expected_goal_involvements','')::numeric, nullif(s->>'expected_goals_conceded','')::numeric,
    null, null, null, null,
    jsonb_build_object('id', le.fpl_player_id, 'stats', le.stats, 'explain', le.explain), now(), v_season
  from public.fpl_live_elements le
  cross join lateral (select le.stats as s) x
  join public.fpl_players p on p.fpl_player_id = le.fpl_player_id and p.season_id = v_season
  join single_fixture sf on sf.fpl_player_id = p.fpl_player_id
  join public.fpl_fixtures f on f.fpl_fixture_id = sf.fixture_id and f.season_id = v_season
  where le.season_id = v_season and le.fpl_event_id = p_event_id
  on conflict (fpl_player_id,fpl_fixture_id,season_id) do update set
    fpl_event_id=excluded.fpl_event_id,opponent_fpl_team_id=excluded.opponent_fpl_team_id,was_home=excluded.was_home,
    kickoff_time=excluded.kickoff_time,total_points=excluded.total_points,minutes=excluded.minutes,goals_scored=excluded.goals_scored,
    assists=excluded.assists,clean_sheets=excluded.clean_sheets,goals_conceded=excluded.goals_conceded,own_goals=excluded.own_goals,
    penalties_saved=excluded.penalties_saved,penalties_missed=excluded.penalties_missed,yellow_cards=excluded.yellow_cards,
    red_cards=excluded.red_cards,saves=excluded.saves,bonus=excluded.bonus,bps=excluded.bps,influence=excluded.influence,
    creativity=excluded.creativity,threat=excluded.threat,ict_index=excluded.ict_index,expected_goals=excluded.expected_goals,
    expected_assists=excluded.expected_assists,expected_goal_involvements=excluded.expected_goal_involvements,
    expected_goals_conceded=excluded.expected_goals_conceded,source_payload=excluded.source_payload,updated_at=now();
  get diagnostics n_rows = row_count;

  -- Players with two or more fixtures (double gameweek): one row per fixture
  -- from FPL's per-fixture explain. BPS, ICT and expected stats are only
  -- published per gameweek, so they stay null on these rows.
  with multi as (
    select p.fpl_player_id, p.fpl_team_id
    from public.fpl_players p
    join public.fpl_fixtures f on f.fpl_event_id = p_event_id and f.season_id = v_season
      and (f.fpl_home_team_id = p.fpl_team_id or f.fpl_away_team_id = p.fpl_team_id)
    where p.season_id = v_season
    group by p.fpl_player_id, p.fpl_team_id
    having count(*) > 1
  ), per_fixture as (
    select m.fpl_player_id, m.fpl_team_id, f.fpl_fixture_id, f.fpl_home_team_id, f.fpl_away_team_id, f.kickoff_time,
      (select x -> 'stats' from jsonb_array_elements(coalesce(le.explain, '[]'::jsonb)) x
        where (x ->> 'fixture')::int = f.fpl_fixture_id limit 1) as st,
      le.explain
    from multi m
    join public.fpl_fixtures f on f.fpl_event_id = p_event_id and f.season_id = v_season
      and (f.fpl_home_team_id = m.fpl_team_id or f.fpl_away_team_id = m.fpl_team_id)
    left join public.fpl_live_elements le
      on le.season_id = v_season and le.fpl_event_id = p_event_id and le.fpl_player_id = m.fpl_player_id
  )
  insert into public.fpl_player_gameweeks(
    fpl_player_id,fpl_event_id,fpl_fixture_id,opponent_fpl_team_id,was_home,kickoff_time,total_points,minutes,
    goals_scored,assists,clean_sheets,goals_conceded,own_goals,penalties_saved,penalties_missed,yellow_cards,
    red_cards,saves,bonus,bps,source_payload,updated_at,season_id
  )
  select pf.fpl_player_id, p_event_id, pf.fpl_fixture_id,
    case when pf.fpl_home_team_id = pf.fpl_team_id then pf.fpl_away_team_id else pf.fpl_home_team_id end,
    (pf.fpl_home_team_id = pf.fpl_team_id), pf.kickoff_time,
    coalesce((select sum((s ->> 'points')::int) from jsonb_array_elements(coalesce(pf.st, '[]'::jsonb)) s), 0),
    private.fpl_explain_value(pf.st, 'minutes'), private.fpl_explain_value(pf.st, 'goals_scored'),
    private.fpl_explain_value(pf.st, 'assists'), private.fpl_explain_value(pf.st, 'clean_sheets'),
    private.fpl_explain_value(pf.st, 'goals_conceded'), private.fpl_explain_value(pf.st, 'own_goals'),
    private.fpl_explain_value(pf.st, 'penalties_saved'), private.fpl_explain_value(pf.st, 'penalties_missed'),
    private.fpl_explain_value(pf.st, 'yellow_cards'), private.fpl_explain_value(pf.st, 'red_cards'),
    private.fpl_explain_value(pf.st, 'saves'), private.fpl_explain_value(pf.st, 'bonus'),
    null,
    jsonb_build_object('id', pf.fpl_player_id, 'fixture', pf.fpl_fixture_id, 'explain_stats', coalesce(pf.st, '[]'::jsonb), 'double_gameweek', true),
    now(), v_season
  from per_fixture pf
  on conflict (fpl_player_id,fpl_fixture_id,season_id) do update set
    fpl_event_id=excluded.fpl_event_id,opponent_fpl_team_id=excluded.opponent_fpl_team_id,was_home=excluded.was_home,
    kickoff_time=excluded.kickoff_time,total_points=excluded.total_points,minutes=excluded.minutes,goals_scored=excluded.goals_scored,
    assists=excluded.assists,clean_sheets=excluded.clean_sheets,goals_conceded=excluded.goals_conceded,own_goals=excluded.own_goals,
    penalties_saved=excluded.penalties_saved,penalties_missed=excluded.penalties_missed,yellow_cards=excluded.yellow_cards,
    red_cards=excluded.red_cards,saves=excluded.saves,bonus=excluded.bonus,source_payload=excluded.source_payload,updated_at=now();
  get diagnostics n_multi = row_count;

  return jsonb_build_object('status','success','event',p_event_id,'rows',n_rows,'double_gameweek_rows',n_multi);
end;
$function$;

-- 5. The page's RPC -------------------------------------------------------------

create or replace function public.fpl_live_entry(p_entry_id bigint, p_event_id integer default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
set statement_timeout = '9s'
as $$
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
    delete from private.fpl_entry_clients where called_at < now() - interval '2 minutes';
    if (select count(*) from private.fpl_entry_clients
         where client = who and called_at > now() - interval '1 minute') >= 12 then
      return jsonb_build_object('status', 'busy');
    end if;
    delete from private.fpl_entry_calls where called_at < now() - interval '2 minutes';
    if (select count(*) from private.fpl_entry_calls where called_at > now() - interval '1 minute') >= 120 then
      return jsonb_build_object('status', 'busy');
    end if;
    insert into private.fpl_entry_clients (client) values (who);
    insert into private.fpl_entry_calls default values;

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
$$;
comment on function public.fpl_live_entry(bigint, integer) is
  'FPL Live page: one team''s picks for a gameweek (fetched from FPL once per team and gameweek, then cached) with the live feed, fixtures, team names and deadline projections for its players. Scoring is done in the page (src/lib/fplLiveScore.ts).';
revoke all on function public.fpl_live_entry(bigint, integer) from public;
grant execute on function public.fpl_live_entry(bigint, integer) to anon, authenticated, service_role;

-- 6. Integrity -------------------------------------------------------------------

do $$
declare
  def text := pg_get_functiondef('public.check_model_integrity'::regproc);
  anchor text := '  -- Catalogue (2026-09-26)';
  addition text := $add$  -- FPL Live (2026-10-11): while a Premier League match is in play the
  -- live feed must be under 5 minutes old; the last fetch should have worked.
  select 'fpl_live_feed_fresh',
    case when n = 0 then 'ok' else 'failed' end, n,
    'FPL fixtures in play (kicked off 10-100 minutes ago, not at full time) with the live feed more than 5 minutes old (private.fpl_live_tick, pg_cron every minute)'
  from (select count(*) n from public.fpl_fixtures f
        left join public.fpl_live_fixtures lf on lf.season_id = f.season_id and lf.fpl_fixture_id = f.fpl_fixture_id
        where f.season_id = public.fpl_current_season_id()
          and f.kickoff_time between now() - interval '100 minutes' and now() - interval '10 minutes'
          and not coalesce(lf.finished_provisional, false)
          and coalesce(lf.fetched_at, '-infinity'::timestamptz) < now() - interval '5 minutes') x
  union all
  select 'fpl_live_runs_ok',
    case when last_status is null or last_status = 'success' then 'ok' else 'warning' end,
    failed_24h,
    'Failed FPL live fetches in the last 24 hours (public.fpl_live_runs); warning when the most recent fetch failed'
  from (select (select status from public.fpl_live_runs order by run_at desc limit 1) last_status,
               (select count(*) from public.fpl_live_runs where status = 'failed' and run_at > now() - interval '24 hours') failed_24h) x
  union all
$add$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'check_model_integrity anchor not found exactly once';
  end if;
  execute replace(def, anchor, addition || anchor);
end $$;

-- 7. Load what has been played so far ---------------------------------------------

do $$
declare
  v_season bigint := public.fpl_current_season_id();
  v_current int;
  e int;
begin
  select max(fpl_event_id) into v_current from public.fpl_gameweeks where season_id = v_season and is_current;
  if v_current is null then return; end if;
  for e in 1 .. v_current loop
    perform private.fpl_live_fetch_event(e, v_season);
  end loop;
end $$;

-- 8. Catalogue -------------------------------------------------------------------

select public.meta_refresh_flow();

update public.meta_flow_nodes set layer = 'fantasy', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'FPL live feed per player and gameweek (event/{gw}/live/): minutes, points, BPS, FPL''s full stats and its per-fixture points breakdown. Feeds FPL Live (/fpl/live) and fpl_player_gameweeks.',
  refresh_note = 'private.fpl_live_fetch_event: pg_cron fpl-live-tick every minute while matches are on, and the 6-hourly fpl-live-current job.', purpose_reviewed_at = now()
where node_key = 'object:fpl_live_elements';

update public.meta_flow_nodes set layer = 'fantasy', status = 'current', is_public = true, ai_relevant = true,
  purpose = 'FPL fixtures feed per fixture: started / full time / bonus confirmed, match clock, score, top-8 BPS and FPL bonus. Drives live bonus and the match strip on FPL Live.',
  refresh_note = 'Written with fpl_live_elements by private.fpl_live_fetch_event.', purpose_reviewed_at = now()
where node_key = 'object:fpl_live_fixtures';

update public.meta_flow_nodes set layer = 'operations', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Log of FPL live fetches (status, HTTP codes, rows changed, time taken, error), kept 7 days. Read by the fpl_live_* integrity checks.',
  refresh_note = 'One row per private.fpl_live_fetch_event call.', purpose_reviewed_at = now()
where node_key = 'object:fpl_live_runs';

update public.meta_flow_nodes set layer = 'fantasy', status = 'current', is_public = true, ai_relevant = false,
  purpose = 'FPL Live page RPC: a team''s cached gameweek picks with the live feed, fixtures, team names and deadline projections for its players.',
  refresh_note = 'Called by /fpl/live every minute while matches are on; FPL is asked for the picks once per team and gameweek.', purpose_reviewed_at = now()
where node_key = 'function:fpl_live_entry(p_entry_id bigint, p_event_id integer)';

update public.meta_flow_nodes set purpose_reviewed_at = now()
where node_key = 'function:check_model_integrity()';
