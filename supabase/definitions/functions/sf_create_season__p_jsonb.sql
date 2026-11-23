-- Live definition exported from the database (function sf_create_season(p jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sf_create_season(p jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u text := p->'universe'->>'id'; s bigint; num int := (p->'season'->>'number')::int;
begin
  select id into s from sf.seasons where universe_id = u and number = num;
  if s is not null then return s; end if;   -- already created: safe to re-run
  insert into sf.universes (id, name, seed, engine_version)
  values (u, p->'universe'->>'name', p->'universe'->>'seed', p->'universe'->>'engine_version') on conflict (id) do nothing;
  insert into sf.worlds (universe_id, world) values (u, p->'world') on conflict (universe_id) do nothing;
  insert into sf.managers (universe_id, id, name, rotation, attack_lean, formations)
  select u, x->>'id', x->>'name', (x->>'rotation')::numeric, (x->>'attackLean')::numeric, array(select jsonb_array_elements_text(x->'formations'))
  from jsonb_array_elements(p->'managers') x on conflict do nothing;
  insert into sf.clubs (universe_id, id, name, short, manager_id, home_boost)
  select u, x->>'id', x->>'name', x->>'short', x->>'managerId', (x->>'homeBoost')::numeric
  from jsonb_array_elements(p->'clubs') x on conflict do nothing;
  insert into sf.players (universe_id, id, club_id, name, nationality, age, position, identity_category)
  select u, x->>'id', x->>'clubId', x->>'name', x->>'nationality', (x->>'age')::int, x->>'position', 'original'
  from jsonb_array_elements(p->'players') x on conflict do nothing;
  insert into sf.player_hidden (universe_id, player_id, season, attrs)
  select u, x->>'player_id', num, x->'attrs' from jsonb_array_elements(p->'hidden') x on conflict do nothing;

  insert into sf.seasons (universe_id, number, state, rules_version, scoring_version)
  values (u, num, 'live', p->'season'->>'rules_version', p->'season'->>'scoring_version') returning id into s;
  insert into sf.rounds (season_id, number, kind, deadline_at, kickoff_at, state)
  select s, (x->>'number')::int, x->>'kind', (x->>'deadline_at')::timestamptz, (x->>'kickoff_at')::timestamptz,
    case when (x->>'number')::int = 1 then 'open' else 'upcoming' end
  from jsonb_array_elements(p->'rounds') x;
  insert into sf.fixtures (season_id, round, fixture_key, home_id, away_id, kind)
  select s, (x->>'round')::int, x->>'fixture_key', x->>'home_id', x->>'away_id', x->>'kind' from jsonb_array_elements(p->'fixtures') x;
  insert into sf.scouting (season_id, player_id, attack, creativity, defence, keeping, discipline)
  select s, x->>'player_id', (x->>'attack')::int, (x->>'creativity')::int, (x->>'defence')::int, (x->>'keeping')::int, (x->>'discipline')::int
  from jsonb_array_elements(p->'scouting') x;
  insert into sf.player_status (season_id, player_id) select s, x->>'id' from jsonb_array_elements(p->'players') x;
  insert into sf.player_prices (season_id, player_id, from_round, price, reason, inputs)
  select s, x->>'player_id', 1, (x->>'price')::int, 'initial', x->'inputs' from jsonb_array_elements(p->'prices') x;
  insert into sf.season_players (season_id, player_id, start_price, expected_per_round)
  select s, x->>'player_id', (x->>'start_price')::int, (x->>'expected_per_round')::numeric from jsonb_array_elements(p->'season_players') x;
  insert into sf.projections (season_id, round, player_id, made_after_round, x_points, p_start, x_minutes, x_goals, x_assists, p_clean_sheet)
  select s, (x->>'round')::int, x->>'player_id', 0, (x->>'x_points')::numeric, (x->>'p_start')::numeric, (x->>'x_minutes')::numeric,
    (x->>'x_goals')::numeric, (x->>'x_assists')::numeric, (x->>'p_clean_sheet')::numeric
  from jsonb_array_elements(p->'projections') x;
  insert into sf.engine_snapshots (season_id, after_round, engine_version, state, state_hash)
  values (s, 0, p->'universe'->>'engine_version', p->'snapshot'->'state', p->'snapshot'->>'hash');
  insert into sf.leagues (season_id, name, kind) values (s, 'Everyone', 'public');
  insert into sf.sim_runs (job, season_id, round, status, detail) values ('create_season', s, 0, 'ok', jsonb_build_object('universe', u));
  return s;
end $function$
;
