-- Upcoming fixtures for the Bundesliga and Scottish Premiership (so UK
-- broadcast records for them can be matched). Applied live 25 Sep 2026;
-- this file records the resulting definitions.
--
-- One-off data load (already run, not repeated here): 2026/27 fixtures from
-- fixturedownload.com bundesliga-2026 (306) and scottish-premiership-2026
-- (198), plus FixtureDownload team_aliases for their club names. Played
-- counts matched the results already in matches (D1 36, SC0 42).
--
-- Scotland gets its own refresh: the same home fixture happens twice a
-- season (33 rounds + split), so refresh_fixture_feeds' pair-only match
-- would set both games to one date (it hit fixtures_natural_key_unique on
-- first try; that run rolled back). Each feed row is matched to the same
-- pairing's nearest-dated fixture within 60 days; unmatched feed rows (the
-- post-split rounds, once published) are inserted. It runs inside
-- refresh_fixture_feeds with its own exception block, so a Scottish feed
-- problem can never fail the English/European refresh.

CREATE OR REPLACE FUNCTION public.refresh_scottish_premiership_fixtures()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare
  v_url text := 'https://fixturedownload.com/feed/json/scottish-premiership-2026';
  v_league bigint; v_season bigint; v_status int; v_body text; v_changed int := 0; v_n int;
begin
  select league_id into v_league from public.leagues where code = 'SC0';
  select season_id into v_season from public.seasons where label = '2627';
  if v_league is null or v_season is null then return 0; end if;
  select status, content into v_status, v_body from extensions.http_get(v_url);
  if v_status <> 200 then raise exception 'SC0 feed returned HTTP %', v_status; end if;

  drop table if exists _sc0, _sc0_match;
  create temp table _sc0 on commit drop as
  select coalesce(ha.team_id, ht.team_id) home_id, coalesce(aa.team_id, at.team_id) away_id,
    (e->>'DateUtc')::timestamptz ko,
    nullif(regexp_replace(coalesce(e->>'RoundNumber',''),'[^0-9]','','g'),'')::int rnd
  from jsonb_array_elements(v_body::jsonb) e
  left join public.team_aliases ha on ha.source_name='FixtureDownload' and ha.raw_name=e->>'HomeTeam'
  left join public.teams ht on ht.canonical_name=e->>'HomeTeam'
  left join public.team_aliases aa on aa.source_name='FixtureDownload' and aa.raw_name=e->>'AwayTeam'
  left join public.teams at on at.canonical_name=e->>'AwayTeam'
  where e ? 'DateUtc';
  delete from _sc0 where home_id is null or away_id is null or ko is null;

  -- nearest existing fixture per feed row, each fixture used once
  create temp table _sc0_match on commit drop as
  select distinct on (f.fixture_id) f.fixture_id, s.ko, s.rnd
  from _sc0 s
  join public.fixtures f on f.league_id = v_league and f.season_id = v_season
    and f.home_team_id = s.home_id and f.away_team_id = s.away_id
    and abs(f.kickoff_date - (s.ko at time zone 'Europe/London')::date) <= 60
  order by f.fixture_id, abs(f.kickoff_date - (s.ko at time zone 'Europe/London')::date);

  update public.fixtures f set
    kickoff_date = (m.ko at time zone 'Europe/London')::date,
    kickoff_time = (m.ko at time zone 'Europe/London')::time,
    matchweek = coalesce(m.rnd, f.matchweek),
    status = case when m.ko < now() then 'played' else 'scheduled' end,
    updated_at = now()
  from _sc0_match m
  where f.fixture_id = m.fixture_id
    and (f.kickoff_date <> (m.ko at time zone 'Europe/London')::date
      or f.kickoff_time is distinct from (m.ko at time zone 'Europe/London')::time
      or f.status <> case when m.ko < now() then 'played' else 'scheduled' end);
  get diagnostics v_n = row_count; v_changed := v_changed + v_n;

  insert into public.fixtures (league_id, season_id, home_team_id, away_team_id, kickoff_date, kickoff_time, matchweek, status, source_name, source_file)
  select v_league, v_season, s.home_id, s.away_id, (s.ko at time zone 'Europe/London')::date, (s.ko at time zone 'Europe/London')::time, s.rnd,
    case when s.ko < now() then 'played' else 'scheduled' end, 'FixtureDownload', 'scottish-premiership-2026'
  from _sc0 s
  where not exists (
    select 1 from public.fixtures f where f.league_id = v_league and f.season_id = v_season
      and f.home_team_id = s.home_id and f.away_team_id = s.away_id
      and abs(f.kickoff_date - (s.ko at time zone 'Europe/London')::date) <= 60)
  on conflict (league_id, season_id, kickoff_date, home_team_id, away_team_id) do nothing;
  get diagnostics v_n = row_count; v_changed := v_changed + v_n;
  return v_changed;
end;
$function$;
revoke all on function public.refresh_scottish_premiership_fixtures() from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_fixture_feeds()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare v_run_id bigint; v_code text; v_url text; v_league_id bigint; v_season_id bigint; v_body text; v_json jsonb; v_seen int:=0; v_updated int:=0; v_count int; v_http_status int; v_predictions int;
begin
 insert into public.fixture_refresh_runs(competitions) values(array['E0','E1','E2','E3','UCL','UEL','UECL','D1']) returning refresh_run_id into v_run_id;
 select season_id into v_season_id from public.seasons where label='2627' limit 1;
 for v_code,v_url in select * from (values
 ('E0','https://fixturedownload.com/feed/json/epl-2026'),('E1','https://fixturedownload.com/feed/json/championship-2026'),('E2','https://fixturedownload.com/feed/json/efl-league-one-2026'),('E3','https://fixturedownload.com/feed/json/efl-league-two-2026'),('UCL','https://fixturedownload.com/feed/json/champions-league-2026'),('UEL','https://fixturedownload.com/feed/json/europa-league-2026'),('UECL','https://fixturedownload.com/feed/json/conference-league-2026'),('D1','https://fixturedownload.com/feed/json/bundesliga-2026')) x(code,url)
 loop
  select league_id into v_league_id from public.leagues where code=v_code limit 1; if v_league_id is null then continue; end if;
  select status,content into v_http_status,v_body from extensions.http_get(v_url);
  if v_http_status<>200 then raise exception 'Feed % returned HTTP %',v_code,v_http_status; end if;
  v_json:=v_body::jsonb; v_count:=jsonb_array_length(v_json); v_seen:=v_seen+v_count;
  with src as (select elem->>'HomeTeam' home_raw,elem->>'AwayTeam' away_raw,(elem->>'DateUtc')::timestamptz ko,nullif(regexp_replace(coalesce(elem->>'RoundNumber',''),'[^0-9]','','g'),'')::int round_no from jsonb_array_elements(v_json) elem where elem ? 'DateUtc'),
  mapped as (select s.*,coalesce(ha.team_id,ht.team_id) home_id,coalesce(aa.team_id,at.team_id) away_id from src s left join public.team_aliases ha on ha.source_name='FixtureDownload' and ha.raw_name=s.home_raw left join public.teams ht on ht.canonical_name=s.home_raw left join public.team_aliases aa on aa.source_name='FixtureDownload' and aa.raw_name=s.away_raw left join public.teams at on at.canonical_name=s.away_raw),
  pending_changes as (
    select f.fixture_id, f.kickoff_date as old_date, (m.ko at time zone 'Europe/London')::date as new_date,
           f.kickoff_time as old_time, (m.ko at time zone 'Europe/London')::time as new_time
    from mapped m
    join public.fixtures f on f.league_id=v_league_id and f.season_id=v_season_id and f.home_team_id=m.home_id and f.away_team_id=m.away_id
    where m.ko is not null and m.home_id is not null and m.away_id is not null
      and (f.kickoff_date <> (m.ko at time zone 'Europe/London')::date or f.kickoff_time is distinct from (m.ko at time zone 'Europe/London')::time)
  )
  insert into public.fixture_changes(fixture_id, old_kickoff_date, new_kickoff_date, old_kickoff_time, new_kickoff_time)
  select fixture_id, old_date, new_date, old_time, new_time from pending_changes;

  with src as (select elem->>'HomeTeam' home_raw,elem->>'AwayTeam' away_raw,(elem->>'DateUtc')::timestamptz ko,nullif(regexp_replace(coalesce(elem->>'RoundNumber',''),'[^0-9]','','g'),'')::int round_no from jsonb_array_elements(v_json) elem where elem ? 'DateUtc'),
  mapped as (select s.*,coalesce(ha.team_id,ht.team_id) home_id,coalesce(aa.team_id,at.team_id) away_id from src s left join public.team_aliases ha on ha.source_name='FixtureDownload' and ha.raw_name=s.home_raw left join public.teams ht on ht.canonical_name=s.home_raw left join public.team_aliases aa on aa.source_name='FixtureDownload' and aa.raw_name=s.away_raw left join public.teams at on at.canonical_name=s.away_raw)
  update public.fixtures f set kickoff_date=(m.ko at time zone 'Europe/London')::date,kickoff_time=(m.ko at time zone 'Europe/London')::time,matchweek=coalesce(m.round_no,f.matchweek),status=case when m.ko<now() then 'played' else 'scheduled' end,source_name='FixtureDownload',source_file=v_url,updated_at=now() from mapped m where m.ko is not null and m.home_id is not null and m.away_id is not null and f.league_id=v_league_id and f.season_id=v_season_id and f.home_team_id=m.home_id and f.away_team_id=m.away_id;
  get diagnostics v_count=row_count; v_updated:=v_updated+v_count;
 end loop;
 -- Scotland has its own matcher (repeat home fixtures); isolated so a
 -- Scottish feed problem can never fail the English/European refresh.
 begin perform public.refresh_scottish_premiership_fixtures();
 exception when others then raise warning 'SC0 fixture refresh failed: %', sqlerrm; end;
 select public.backfill_fixture_predictions() into v_predictions;
 update public.fixture_refresh_runs set finished_at=now(),rows_seen=v_seen,rows_updated=v_updated,status='success' where refresh_run_id=v_run_id;
exception when others then update public.fixture_refresh_runs set finished_at=now(),rows_seen=v_seen,rows_updated=v_updated,status='failed',error_message=sqlerrm where refresh_run_id=v_run_id; raise;
end;$function$;

-- Midnight-UTC placeholder: fixturedownload gives unscheduled matchdays a
-- 00:00Z kick-off (261 of 270 upcoming Bundesliga games at load), which
-- read as 01:00/00:00 UK time. No top-flight game here kicks off at
-- midnight UTC, so that time is stored as NULL (shown as TBC) -- in both
-- refresh functions, so the daily run doesn't log a phantom time change.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.refresh_fixture_feeds'::regproc);
  if position('''UTC'')::time = ''00:00''' in d) = 0 then
    d := replace(d, $a$(m.ko at time zone 'Europe/London')::time$a$,
      $a$(case when (m.ko at time zone 'UTC')::time = '00:00' then null else (m.ko at time zone 'Europe/London')::time end)$a$);
    execute d;
  end if;
  d := pg_get_functiondef('public.refresh_scottish_premiership_fixtures'::regproc);
  if position('''UTC'')::time = ''00:00''' in d) = 0 then
    d := replace(d, $a$(m.ko at time zone 'Europe/London')::time$a$,
      $a$(case when (m.ko at time zone 'UTC')::time = '00:00' then null else (m.ko at time zone 'Europe/London')::time end)$a$);
    d := replace(d, $a$(s.ko at time zone 'Europe/London')::time$a$,
      $a$(case when (s.ko at time zone 'UTC')::time = '00:00' then null else (s.ko at time zone 'Europe/London')::time end)$a$);
    execute d;
  end if;
end $$;
update public.fixtures f set kickoff_time = null, updated_at = now()
from public.leagues l where l.league_id = f.league_id and l.code = 'D1'
  and f.kickoff_time in ('00:00','01:00') and f.status = 'scheduled';

-- Scottish clubs added 25 Sep were given "X FC" display names; UK usage is
-- just "Aberdeen", "Motherwell" etc.
update public.teams set display_name = regexp_replace(display_name, ' FC$', '')
where country_id = 20 and display_name ~ ' FC$';
