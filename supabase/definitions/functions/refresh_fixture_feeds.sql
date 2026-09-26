-- Live definition exported from the database (function refresh_fixture_feeds()).
-- Do not edit here: change it with a migration; the next export will reflect it.

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
           f.kickoff_time as old_time, (case when (m.ko at time zone 'UTC')::time = '00:00' then null else (m.ko at time zone 'Europe/London')::time end) as new_time
    from mapped m
    join public.fixtures f on f.league_id=v_league_id and f.season_id=v_season_id and f.home_team_id=m.home_id and f.away_team_id=m.away_id
    where m.ko is not null and m.home_id is not null and m.away_id is not null
      and (f.kickoff_date <> (m.ko at time zone 'Europe/London')::date or f.kickoff_time is distinct from (case when (m.ko at time zone 'UTC')::time = '00:00' then null else (m.ko at time zone 'Europe/London')::time end))
  )
  insert into public.fixture_changes(fixture_id, old_kickoff_date, new_kickoff_date, old_kickoff_time, new_kickoff_time)
  select fixture_id, old_date, new_date, old_time, new_time from pending_changes;

  with src as (select elem->>'HomeTeam' home_raw,elem->>'AwayTeam' away_raw,(elem->>'DateUtc')::timestamptz ko,nullif(regexp_replace(coalesce(elem->>'RoundNumber',''),'[^0-9]','','g'),'')::int round_no from jsonb_array_elements(v_json) elem where elem ? 'DateUtc'),
  mapped as (select s.*,coalesce(ha.team_id,ht.team_id) home_id,coalesce(aa.team_id,at.team_id) away_id from src s left join public.team_aliases ha on ha.source_name='FixtureDownload' and ha.raw_name=s.home_raw left join public.teams ht on ht.canonical_name=s.home_raw left join public.team_aliases aa on aa.source_name='FixtureDownload' and aa.raw_name=s.away_raw left join public.teams at on at.canonical_name=s.away_raw)
  update public.fixtures f set kickoff_date=(m.ko at time zone 'Europe/London')::date,kickoff_time=(case when (m.ko at time zone 'UTC')::time = '00:00' then null else (m.ko at time zone 'Europe/London')::time end),matchweek=coalesce(m.round_no,f.matchweek),status=case when m.ko<now() then 'played' else 'scheduled' end,source_name='FixtureDownload',source_file=v_url,updated_at=now() from mapped m where m.ko is not null and m.home_id is not null and m.away_id is not null and f.league_id=v_league_id and f.season_id=v_season_id and f.home_team_id=m.home_id and f.away_team_id=m.away_id;
  get diagnostics v_count=row_count; v_updated:=v_updated+v_count;
  -- UEFA competitions: the feed carries the result, and nothing else ingests
  -- these (2026-09-26). League phase only -- see migration
  -- 20260926190000_uefa_results_from_fixture_feed.
  if v_code in ('UCL','UEL','UECL') then
   with src as (select elem->>'HomeTeam' home_raw,elem->>'AwayTeam' away_raw,(elem->>'DateUtc')::timestamptz ko,nullif(regexp_replace(coalesce(elem->>'RoundNumber',''),'[^0-9]','','g'),'')::int round_no,nullif(elem->>'HomeTeamScore','')::int hg,nullif(elem->>'AwayTeamScore','')::int ag from jsonb_array_elements(v_json) elem where elem ? 'DateUtc'),
   mapped as (select s.*,coalesce(ha.team_id,ht.team_id) home_id,coalesce(aa.team_id,at.team_id) away_id from src s left join public.team_aliases ha on ha.source_name='FixtureDownload' and ha.raw_name=s.home_raw left join public.teams ht on ht.canonical_name=s.home_raw left join public.team_aliases aa on aa.source_name='FixtureDownload' and aa.raw_name=s.away_raw left join public.teams at on at.canonical_name=s.away_raw)
   insert into public.matches as mt(league_id,season_id,home_team_id,away_team_id,match_date,kickoff_time,full_time_home_goals,full_time_away_goals,full_time_result,round_number,source_name,source_file,updated_at)
   select v_league_id,v_season_id,m.home_id,m.away_id,(m.ko at time zone 'Europe/London')::date,(case when (m.ko at time zone 'UTC')::time = '00:00' then null else (m.ko at time zone 'Europe/London')::time end),m.hg,m.ag,case when m.hg>m.ag then 'H' when m.hg<m.ag then 'A' else 'D' end,m.round_no,'FixtureDownload',v_url,now()
   from mapped m
   where m.ko<now() and m.hg is not null and m.ag is not null and m.home_id is not null and m.away_id is not null and m.round_no between 1 and 8
   on conflict (league_id,season_id,match_date,home_team_id,away_team_id) do update
     set full_time_home_goals=excluded.full_time_home_goals,full_time_away_goals=excluded.full_time_away_goals,full_time_result=excluded.full_time_result,updated_at=now()
     where mt.source_name='FixtureDownload'
       and (mt.full_time_home_goals,mt.full_time_away_goals) is distinct from (excluded.full_time_home_goals,excluded.full_time_away_goals);
  end if;
 end loop;
 -- Scotland has its own matcher (repeat home fixtures); isolated so a
 -- Scottish feed problem can never fail the English/European refresh.
 begin perform public.refresh_scottish_premiership_fixtures();
 exception when others then raise warning 'SC0 fixture refresh failed: %', sqlerrm; end;
 -- Serie A, Ligue 1, La Liga use the nearest-date matcher too (the feed
 -- can list a pairing twice); each isolated like Scotland.
 begin perform public.refresh_feed_nearest_date('I1','https://fixturedownload.com/feed/json/serie-a-2026');
 exception when others then raise warning 'I1 fixture refresh failed: %', sqlerrm; end;
 begin perform public.refresh_feed_nearest_date('F1','https://fixturedownload.com/feed/json/ligue-1-2026');
 exception when others then raise warning 'F1 fixture refresh failed: %', sqlerrm; end;
 begin perform public.refresh_feed_nearest_date('SP1','https://fixturedownload.com/feed/json/la-liga-2026');
 exception when others then raise warning 'SP1 fixture refresh failed: %', sqlerrm; end;
 select public.backfill_fixture_predictions() into v_predictions;
 update public.fixture_refresh_runs set finished_at=now(),rows_seen=v_seen,rows_updated=v_updated,status='success' where refresh_run_id=v_run_id;
exception when others then update public.fixture_refresh_runs set finished_at=now(),rows_seen=v_seen,rows_updated=v_updated,status='failed',error_message=sqlerrm where refresh_run_id=v_run_id; raise;
end;$function$
;
