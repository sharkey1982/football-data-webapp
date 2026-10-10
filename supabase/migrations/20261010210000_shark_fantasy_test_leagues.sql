-- ============================================================================
-- Shark Fantasy: test leagues an admin can drive from the page (10 Oct 2026).
-- Chris: "the start date while we're testing I need to be able to do as soon
-- as I want. I also need to play a sped up version."
--
-- A universe flagged is_test can be created and run by a signed-in admin
-- through one dispatcher, public.sf_test_rpc, which calls the same runner
-- functions the service role uses (create, state, bots, lock, commit). The
-- browser runs the engine, exactly as scripts/sf/run-round.ts does.
--
-- Guard rails:
--   * admins only (public.is_admin());
--   * test universes only, and never one that is public: the dispatcher works
--     out the universe from the arguments and refuses anything else, so the
--     weekly proto league and any public league stay service-role only;
--   * sf_runner_state includes the hidden attributes; through the dispatcher
--     an admin can therefore see them for a TEST universe only (the testing
--     trade-off, accepted: no real player plays a test league);
--   * every rule in the runner functions still applies (state machine, no
--     result written twice, immutability), and the deadline can only be
--     brought forward because a test universe is not public.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Fix (found by the test-league check before any second live league played):
-- fixture keys (s1|r1|c7-c8) were unique across the whole database, so two
-- leagues could collide, and sf_commit_round matched fixtures by key alone.
-- Keys are now unique within a season, and the commit matches within its season.
-- ---------------------------------------------------------------------------
alter table sf.fixtures drop constraint if exists fixtures_fixture_key_key;
alter table sf.fixtures add constraint sf_fixtures_season_key unique (season_id, fixture_key);

create or replace function public.sf_commit_round(p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare s bigint := (p->>'season_id')::bigint; r int := (p->>'round')::int; rd sf.rounds%rowtype; ss sf.seasons%rowtype;
begin
  select * into ss from sf.seasons where id = s;
  select * into rd from sf.rounds where season_id = s and number = r for update;
  if not found then raise exception 'no such round'; end if;
  if rd.state = 'final' then
    insert into sf.sim_runs (job, season_id, round, status) values ('commit', s, r, 'noop');
    return 'noop';
  end if;
  if rd.state <> 'locked' then raise exception 'round % is %, not locked', r, rd.state; end if;
  if exists (select 1 from sf.fixtures where season_id = s and round = r and state = 'final') then raise exception 'a fixture of round % is already final', r; end if;
  if (select count(*) from sf.fixtures where season_id = s and round = r) <> jsonb_array_length(p->'results')
     or exists (select 1 from jsonb_array_elements(p->'results') x where not exists (
       select 1 from sf.fixtures f where f.season_id = s and f.round = r and f.fixture_key = x->>'fixture_key')) then
    raise exception 'the results do not match the fixtures of round %', r;
  end if;
  if not exists (select 1 from sf.engine_snapshots where season_id = s and after_round = r - 1) then raise exception 'no engine state after round %', r - 1; end if;

  insert into sf.match_results (fixture_id, home_goals, away_goals, xg_home, xg_away, shootout, seed, engine_version)
  select f.id, (x->>'home_goals')::int, (x->>'away_goals')::int, (x->>'xg_home')::numeric, (x->>'xg_away')::numeric,
    x->'shootout', x->>'seed', p->>'engine_version'
  from jsonb_array_elements(p->'results') x join sf.fixtures f on f.season_id = s and f.fixture_key = x->>'fixture_key';
  insert into sf.match_events (fixture_id, seq, minute, type, side, player_id, detail)
  select f.id, (ev->>'seq')::int, (ev->>'minute')::int, ev->>'type', ev->>'side', ev->>'playerId', ev->'detail'
  from jsonb_array_elements(p->'results') x join sf.fixtures f on f.season_id = s and f.fixture_key = x->>'fixture_key', jsonb_array_elements(x->'events') ev;
  insert into sf.player_match_stats (fixture_id, player_id, side, position, started, minutes, goals, assists, own_goals,
    pen_misses, pen_saves, saves, conceded, yellow, red, clean_sheet, injured, bonus, points)
  select f.id, st->>'playerId', st->>'side', st->>'position', (st->>'started')::boolean, (st->>'minutes')::int,
    (st->>'goals')::int, (st->>'assists')::int, (st->>'ownGoals')::int, (st->>'penMisses')::int, (st->>'penSaves')::int,
    (st->>'saves')::int, (st->>'conceded')::int, (st->>'yellow')::int, (st->>'red')::int, (st->>'cleanSheet')::boolean,
    (st->>'injured')::boolean, coalesce((st->>'bonus')::int, 0), (st->>'points')::int
  from jsonb_array_elements(p->'results') x join sf.fixtures f on f.season_id = s and f.fixture_key = x->>'fixture_key', jsonb_array_elements(x->'stats') st;
  update sf.fixtures set state = 'final' where season_id = s and round = r;

  -- scores: every frozen squad gets one, with its hits
  if exists (select 1 from sf.entry_round_snapshots sn join sf.entries e on e.id = sn.entry_id
             where e.season_id = s and sn.round = r
               and not exists (select 1 from jsonb_array_elements(p->'scores') x where (x->>'entry_id')::bigint = sn.entry_id)) then
    raise exception 'a frozen squad has no score';
  end if;
  insert into sf.entry_round_scores (entry_id, round, points, hits, total, captain_used, subs, rules_version, scoring_version)
  select sn.entry_id, r, (x->>'points')::int, sn.hits, (x->>'points')::int - sn.hits, x->>'captain_used', coalesce(x->'subs', '[]'),
    ss.rules_version, ss.scoring_version
  from jsonb_array_elements(p->'scores') x join sf.entry_round_snapshots sn on sn.entry_id = (x->>'entry_id')::bigint and sn.round = r;

  insert into sf.engine_snapshots (season_id, after_round, engine_version, state, state_hash)
  values (s, r, p->>'engine_version', p->'snapshot'->'state', p->'snapshot'->>'hash');
  update sf.player_status ps set available_from = (x->>'available_from')::int, updated_after_round = r
  from jsonb_array_elements(p->'status') x where ps.season_id = s and ps.player_id = x->>'player_id';
  if r < 10 then
    insert into sf.player_prices (season_id, player_id, from_round, price, reason, inputs)
    select s, x->>'player_id', r + 1, (x->>'price')::int, 'form', x->'inputs' from jsonb_array_elements(p->'prices') x;
  end if;
  insert into sf.fixtures (season_id, round, fixture_key, home_id, away_id, kind)
  select s, (x->>'round')::int, x->>'fixture_key', x->>'home_id', x->>'away_id', x->>'kind' from jsonb_array_elements(coalesce(p->'next_fixtures', '[]')) x;
  insert into sf.projections (season_id, round, player_id, made_after_round, x_points, p_start, x_minutes, x_goals, x_assists, p_clean_sheet)
  select s, (x->>'round')::int, x->>'player_id', r, (x->>'x_points')::numeric, (x->>'p_start')::numeric, (x->>'x_minutes')::numeric,
    (x->>'x_goals')::numeric, (x->>'x_assists')::numeric, (x->>'p_clean_sheet')::numeric
  from jsonb_array_elements(coalesce(p->'projections', '[]')) x
  on conflict (season_id, round, player_id) do update set made_after_round = excluded.made_after_round, x_points = excluded.x_points,
    p_start = excluded.p_start, x_minutes = excluded.x_minutes, x_goals = excluded.x_goals, x_assists = excluded.x_assists,
    p_clean_sheet = excluded.p_clean_sheet;

  update sf.rounds set state = 'final', finalised_at = now() where season_id = s and number = r;
  if r < 10 then
    update sf.rounds set state = 'open' where season_id = s and number = r + 1;
    if r = 9 then update sf.seasons set state = 'finals' where id = s; end if;
  else
    update sf.seasons set state = 'done', shield_winner = p->>'shield_winner' where id = s;
  end if;
  insert into sf.sim_runs (job, season_id, round, status, detail)
  values ('commit', s, r, 'ok', jsonb_build_object('results', jsonb_array_length(p->'results'), 'scores', jsonb_array_length(p->'scores')));
  return 'ok';
end $$;

-- ---------------------------------------------------------------------------
-- Test leagues.
-- ---------------------------------------------------------------------------
alter table sf.universes add column if not exists is_test boolean not null default false;
alter table sf.universes add constraint sf_universes_test_not_public check (not (is_test and is_public));
update sf.universes set is_test = true where id = 'test' and not is_test;

-- the season list shows which leagues are test leagues (column appended)
create or replace view public.sf_seasons with (security_invoker = true) as
select s.id season_id, s.universe_id, u.name universe, s.number, s.state, s.rules_version, s.scoring_version, s.shield_winner,
  (select min(r.number) from sf.rounds r where r.season_id = s.id and r.state <> 'final') current_round,
  (select r.number from sf.rounds r where r.season_id = s.id and r.state = 'open' order by r.number limit 1) open_round,
  u.is_test
from sf.seasons s join sf.universes u on u.id = s.universe_id;

create or replace function public.sf_test_rpc(p_fn text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare u text; t boolean; pub boolean; out jsonb;
begin
  if not public.is_admin() then raise exception 'admins only'; end if;
  u := case p_fn
    when 'sf_create_season' then p_args->'p'->'universe'->>'id'
    when 'sf_runner_state' then p_args->>'p_universe'
    when 'sf_ensure_bot' then sf.season_universe((p_args->>'p_season')::bigint)
    when 'sf_lock_round' then sf.season_universe((p_args->>'p_season')::bigint)
    when 'sf_commit_round' then sf.season_universe((p_args->'p'->>'season_id')::bigint)
    when 'sf_bot_save_team' then (select s.universe_id from sf.entries e join sf.seasons s on s.id = e.season_id where e.id = (p_args->>'p_entry')::bigint)
    else null end;
  if u is null then raise exception 'not allowed: %', p_fn; end if;
  select is_test, is_public into t, pub from sf.universes where id = u;
  if p_fn = 'sf_create_season' then
    if found and not t then raise exception 'universe % is not a test league', u; end if;
    if not found and u !~ '^t-[a-z0-9-]{1,40}$' then raise exception 'a new test league id starts t-'; end if;
  elsif not found or not t or pub then
    raise exception 'universe % is not a test league', u;
  end if;

  case p_fn
    when 'sf_create_season' then
      out := to_jsonb(public.sf_create_season(p_args->'p'));
      update sf.universes set is_test = true where id = u and not is_test;
    when 'sf_runner_state' then out := public.sf_runner_state(u);
    when 'sf_ensure_bot' then out := to_jsonb(public.sf_ensure_bot((p_args->>'p_season')::bigint, p_args->>'p_kind', p_args->>'p_key', p_args->>'p_name'));
    when 'sf_lock_round' then out := to_jsonb(public.sf_lock_round((p_args->>'p_season')::bigint, (p_args->>'p_round')::int, coalesce((p_args->>'p_force')::boolean, false)));
    when 'sf_commit_round' then out := to_jsonb(public.sf_commit_round(p_args->'p'));
    when 'sf_bot_save_team' then out := public.sf_bot_save_team((p_args->>'p_entry')::bigint, p_args->'p');
  end case;
  return out;
end $$;
revoke all on function public.sf_test_rpc(text, jsonb) from public, anon;
grant execute on function public.sf_test_rpc(text, jsonb) to authenticated;
