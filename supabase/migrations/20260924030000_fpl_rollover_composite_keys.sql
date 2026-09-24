-- FPL rollover fix (OUTSTANDING.md): fpl_teams, fpl_gameweeks and fpl_fixtures
-- keyed on fpl_team_id/fpl_event_id/fpl_fixture_id alone. FPL reuses those ids
-- every season, so at the 2027/28 rollover refresh_fpl's upserts would DO
-- UPDATE this season's rows in place -- the exact corruption already fixed
-- for fpl_players. All three already had a season_id column and refresh_fpl
-- was already writing it; only the key (and the dependent FKs) needed widening.
-- fpl_player_gameweeks is included too: its own PK depends on fpl_fixture_id
-- alone, and it FKs to all three, so it has the identical exposure -- found
-- while making these composite, not in the original OUTSTANDING.md note.
--
-- Verified before changing (2026-09-24): all four tables held only season 13
-- (20, 38, 380, 3216 rows) -- no cross-season data to reconcile. Verified
-- after: refresh_fpl() and refresh_fpl_live_event() both ran clean against
-- live FPL data (20/667/38/380 and 667 rows); a same-team-id, different-season
-- insert (fpl_team_id=1 as both this season's Arsenal and a synthetic
-- other-season row) succeeded without conflict inside a rolled-back
-- transaction, proving the actual rollover scenario no longer corrupts.

-- 1. Backups (RLS on, no grants -- same convention as the fpl_players backups).
create table public.backup_fpl_teams_20260924 as table public.fpl_teams;
create table public.backup_fpl_gameweeks_20260924 as table public.fpl_gameweeks;
create table public.backup_fpl_fixtures_20260924 as table public.fpl_fixtures;
create table public.backup_fpl_player_gameweeks_20260924 as table public.fpl_player_gameweeks;
alter table public.backup_fpl_teams_20260924 enable row level security;
alter table public.backup_fpl_gameweeks_20260924 enable row level security;
alter table public.backup_fpl_fixtures_20260924 enable row level security;
alter table public.backup_fpl_player_gameweeks_20260924 enable row level security;

-- 2. Drop the FKs that depend on the single-column keys.
alter table public.fpl_fixtures drop constraint fpl_fixtures_fpl_away_team_id_fkey;
alter table public.fpl_fixtures drop constraint fpl_fixtures_fpl_home_team_id_fkey;
alter table public.fpl_fixtures drop constraint fpl_fixtures_fpl_event_id_fkey;
alter table public.fpl_players drop constraint fpl_players_fpl_team_id_fkey;
alter table public.fpl_player_gameweeks drop constraint fpl_player_gameweeks_fpl_event_id_fkey;
alter table public.fpl_player_gameweeks drop constraint fpl_player_gameweeks_fpl_fixture_id_fkey;
alter table public.fpl_player_gameweeks drop constraint fpl_player_gameweeks_opponent_fpl_team_id_fkey;

-- 3. Widen the primary keys.
alter table public.fpl_teams drop constraint fpl_teams_pkey;
alter table public.fpl_teams add primary key (fpl_team_id, season_id);
alter table public.fpl_gameweeks drop constraint fpl_gameweeks_pkey;
alter table public.fpl_gameweeks add primary key (fpl_event_id, season_id);
alter table public.fpl_fixtures drop constraint fpl_fixtures_pkey;
alter table public.fpl_fixtures add primary key (fpl_fixture_id, season_id);
alter table public.fpl_player_gameweeks drop constraint fpl_player_gameweeks_pkey;
alter table public.fpl_player_gameweeks add primary key (fpl_player_id, fpl_fixture_id, season_id);

-- 4. Recreate the FKs, composite, same as the fpl_players pattern.
alter table public.fpl_fixtures add constraint fpl_fixtures_fpl_home_team_season_fkey
  foreign key (fpl_home_team_id, season_id) references public.fpl_teams(fpl_team_id, season_id);
alter table public.fpl_fixtures add constraint fpl_fixtures_fpl_away_team_season_fkey
  foreign key (fpl_away_team_id, season_id) references public.fpl_teams(fpl_team_id, season_id);
alter table public.fpl_fixtures add constraint fpl_fixtures_fpl_event_season_fkey
  foreign key (fpl_event_id, season_id) references public.fpl_gameweeks(fpl_event_id, season_id);
alter table public.fpl_players add constraint fpl_players_fpl_team_season_fkey
  foreign key (fpl_team_id, season_id) references public.fpl_teams(fpl_team_id, season_id);
alter table public.fpl_player_gameweeks add constraint fpl_player_gameweeks_fpl_event_season_fkey
  foreign key (fpl_event_id, season_id) references public.fpl_gameweeks(fpl_event_id, season_id);
alter table public.fpl_player_gameweeks add constraint fpl_player_gameweeks_fpl_fixture_season_fkey
  foreign key (fpl_fixture_id, season_id) references public.fpl_fixtures(fpl_fixture_id, season_id);
alter table public.fpl_player_gameweeks add constraint fpl_player_gameweeks_opponent_team_season_fkey
  foreign key (opponent_fpl_team_id, season_id) references public.fpl_teams(fpl_team_id, season_id);

-- 5. private.refresh_fpl(): widen the three ON CONFLICT targets to match.
do $do$
declare
  def text := pg_get_functiondef('private.refresh_fpl()'::regprocedure);
  olds text[] := array[
    'on conflict (fpl_team_id) do update set
    code=excluded.code',
    'on conflict (fpl_event_id) do update set
    name=excluded.name',
    'on conflict (fpl_fixture_id) do update set
    fpl_event_id=excluded.fpl_event_id'
  ];
  news text[] := array[
    'on conflict (fpl_team_id, season_id) do update set
    code=excluded.code',
    'on conflict (fpl_event_id, season_id) do update set
    name=excluded.name',
    'on conflict (fpl_fixture_id, season_id) do update set
    fpl_event_id=excluded.fpl_event_id'
  ];
  i int; n int;
begin
  if pg_get_functiondef('private.refresh_fpl()'::regprocedure) ilike '%on conflict (fpl_team_id, season_id)%' then return; end if;
  for i in 1 .. 3 loop
    n := (length(def) - length(replace(def, olds[i], ''))) / length(olds[i]);
    if n <> 1 then raise exception 'anchor % matched % times', i, n; end if;
    def := replace(def, olds[i], news[i]);
  end loop;
  execute def;
end $do$;

-- 6. private.refresh_fpl_live_event(): season-aware, to match
--    fpl_player_gameweeks' new composite key and avoid matching a stale
--    season's fixtures once fpl_fixtures holds more than one season.
CREATE OR REPLACE FUNCTION private.refresh_fpl_live_event(p_event_id integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
declare
  live_json jsonb;
  http_status integer;
  n_rows integer := 0;
  v_season bigint;
begin
  select s.season_id into v_season from public.seasons s
  where current_date >= make_date(s.start_year, 8, 1)
    and current_date <  make_date(s.end_year, 8, 1) limit 1;
  if v_season is null then
    raise exception 'No season row covers today (%); add one before refreshing', current_date;
  end if;

  select status, content::jsonb into http_status, live_json
  from extensions.http_get('https://fantasy.premierleague.com/api/event/' || p_event_id || '/live/');
  if http_status <> 200 then raise exception 'FPL event % live returned HTTP %', p_event_id, http_status; end if;

  with player_stats as (
    select (e->>'id')::int as player_id, e->'stats' as s, e as payload
    from jsonb_array_elements(live_json->'elements') e
  ), single_fixture as (
    select p.fpl_player_id, min(f.fpl_fixture_id) as fixture_id
    from public.fpl_players p
    join public.fpl_fixtures f on f.fpl_event_id=p_event_id and f.season_id=v_season
      and (f.fpl_home_team_id=p.fpl_team_id or f.fpl_away_team_id=p.fpl_team_id)
    where p.season_id=v_season
    group by p.fpl_player_id
    having count(*)=1
  )
  insert into public.fpl_player_gameweeks(
    fpl_player_id,fpl_event_id,fpl_fixture_id,opponent_fpl_team_id,was_home,kickoff_time,total_points,minutes,
    goals_scored,assists,clean_sheets,goals_conceded,own_goals,penalties_saved,penalties_missed,yellow_cards,
    red_cards,saves,bonus,bps,influence,creativity,threat,ict_index,expected_goals,expected_assists,
    expected_goal_involvements,expected_goals_conceded,value,selected,transfers_in,transfers_out,source_payload,updated_at,season_id
  )
  select ps.player_id,p_event_id,f.fpl_fixture_id,
    case when f.fpl_home_team_id=p.fpl_team_id then f.fpl_away_team_id else f.fpl_home_team_id end,
    (f.fpl_home_team_id=p.fpl_team_id),f.kickoff_time,
    coalesce((ps.s->>'total_points')::int,0),coalesce((ps.s->>'minutes')::int,0),coalesce((ps.s->>'goals_scored')::int,0),
    coalesce((ps.s->>'assists')::int,0),coalesce((ps.s->>'clean_sheets')::int,0),coalesce((ps.s->>'goals_conceded')::int,0),
    coalesce((ps.s->>'own_goals')::int,0),coalesce((ps.s->>'penalties_saved')::int,0),coalesce((ps.s->>'penalties_missed')::int,0),
    coalesce((ps.s->>'yellow_cards')::int,0),coalesce((ps.s->>'red_cards')::int,0),coalesce((ps.s->>'saves')::int,0),
    coalesce((ps.s->>'bonus')::int,0),coalesce((ps.s->>'bps')::int,0),nullif(ps.s->>'influence','')::numeric,
    nullif(ps.s->>'creativity','')::numeric,nullif(ps.s->>'threat','')::numeric,nullif(ps.s->>'ict_index','')::numeric,
    nullif(ps.s->>'expected_goals','')::numeric,nullif(ps.s->>'expected_assists','')::numeric,
    nullif(ps.s->>'expected_goal_involvements','')::numeric,nullif(ps.s->>'expected_goals_conceded','')::numeric,
    null,null,null,null,ps.payload,now(),v_season
  from player_stats ps
  join public.fpl_players p on p.fpl_player_id=ps.player_id and p.season_id=v_season
  join single_fixture sf on sf.fpl_player_id=p.fpl_player_id
  join public.fpl_fixtures f on f.fpl_fixture_id=sf.fixture_id and f.season_id=v_season
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
  return jsonb_build_object('status','success','event',p_event_id,'rows',n_rows);
end;
$function$;
