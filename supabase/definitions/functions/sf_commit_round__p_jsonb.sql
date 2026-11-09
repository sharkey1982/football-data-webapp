-- Live definition exported from the database (function sf_commit_round(p jsonb)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.sf_commit_round(p jsonb)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$
;
