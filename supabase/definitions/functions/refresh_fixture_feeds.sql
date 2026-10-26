-- Live definition exported from the database (function refresh_fixture_feeds()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_fixture_feeds()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare v_year int; v_skipped text[] := '{}'; v_run_id bigint; v_code text; v_url text; v_league_id bigint; v_season_id bigint; v_body text; v_json jsonb; v_seen int:=0; v_updated int:=0; v_count int; v_http_status int; v_predictions int;
begin
 insert into public.fixture_refresh_runs(competitions) values(array['E0','E1','E2','E3','UCL','UEL','UECL','D1']) returning refresh_run_id into v_run_id;
 -- Current season (docs/season-rollover.md); feed URLs carry its start year.
 v_season_id := public.current_season_id();
 select start_year into v_year from public.seasons where season_id = v_season_id;
 for v_code,v_url in select * from (values
 ('E0','https://fixturedownload.com/feed/json/epl-' || v_year),('E1','https://fixturedownload.com/feed/json/championship-' || v_year),('E2','https://fixturedownload.com/feed/json/efl-league-one-' || v_year),('E3','https://fixturedownload.com/feed/json/efl-league-two-' || v_year),('UCL','https://fixturedownload.com/feed/json/champions-league-' || v_year),('UEL','https://fixturedownload.com/feed/json/europa-league-' || v_year),('UECL','https://fixturedownload.com/feed/json/conference-league-' || v_year),('D1','https://fixturedownload.com/feed/json/bundesliga-' || v_year)) x(code,url)
 loop
  select league_id into v_league_id from public.leagues where code=v_code limit 1; if v_league_id is null then continue; end if;
  select status,content into v_http_status,v_body from extensions.http_get(v_url);
  -- Next season's feed only exists once its fixtures are published (UEFA:
  -- after the late-August draw). Until 1 October a 404 is skipped and noted
  -- on the run; after that it is an error again.
  if v_http_status=404 and current_date < make_date(v_year,10,1) then v_skipped:=v_skipped||v_code; continue; end if;
  if v_http_status<>200 then raise exception 'Feed % returned HTTP %',v_code,v_http_status; end if;
  v_json:=v_body::jsonb; v_count:=jsonb_array_length(v_json); v_seen:=v_seen+v_count;
  -- New season: no fixtures for this league yet, so insert the whole list
  -- once (the matcher below only updates existing rows).
  if not exists (select 1 from public.fixtures where league_id=v_league_id and season_id=v_season_id) then
   perform public.refresh_feed_nearest_date(v_code, v_url);
  end if;
  with src as (select elem->>'HomeTeam' home_raw,elem->>'AwayTeam' away_raw,(elem->>'DateUtc')::timestamptz ko,nullif(regexp_replace(coalesce(elem->>'RoundNumber',''),'[^0-9]','','g'),'')::int round_no from jsonb_array_elements(v_json) elem where elem ? 'DateUtc'),
  mapped as (select s.*,coalesce(ha.team_id,ht.team_id) home_id,coalesce(aa.team_id,at.team_id) away_id from src s left join public.team_aliases ha on ha.source_name='FixtureDownload' and ha.raw_name=s.home_raw left join public.teams ht on ht.canonical_name=s.home_raw left join public.team_aliases aa on aa.source_name='FixtureDownload' and aa.raw_name=s.away_raw left join public.teams at on at.canonical_name=s.away_raw),
  pending_changes as (
    select f.fixture_id, f.kickoff_date as old_date, (m.ko at time zone 'Europe/London')::date as new_date,
           f.kickoff_time as old_time, (case when (m.ko at time zone 'UTC')::time = '00:00' then null else (m.ko at time zone 'Europe/London')::time end) as new_time
    from mapped m
    join public.fixtures f on f.league_id=v_league_id and f.season_id=v_season_id and f.home_team_id=m.home_id and f.away_team_id=m.away_id
    where m.ko is not null and m.home_id is not null and m.away_id is not null
      and not exists (select 1 from public.fpl_fixtures ff where ff.canonical_fixture_id = f.fixture_id and ff.kickoff_time is not null) -- DQ-01: FPL's kick-off wins
      and (f.kickoff_date <> (m.ko at time zone 'Europe/London')::date or f.kickoff_time is distinct from (case when (m.ko at time zone 'UTC')::time = '00:00' then null else (m.ko at time zone 'Europe/London')::time end))
  )
  insert into public.fixture_changes(fixture_id, old_kickoff_date, new_kickoff_date, old_kickoff_time, new_kickoff_time)
  select fixture_id, old_date, new_date, old_time, new_time from pending_changes;

  with src as (select elem->>'HomeTeam' home_raw,elem->>'AwayTeam' away_raw,(elem->>'DateUtc')::timestamptz ko,nullif(regexp_replace(coalesce(elem->>'RoundNumber',''),'[^0-9]','','g'),'')::int round_no from jsonb_array_elements(v_json) elem where elem ? 'DateUtc'),
  mapped as (select s.*,coalesce(ha.team_id,ht.team_id) home_id,coalesce(aa.team_id,at.team_id) away_id from src s left join public.team_aliases ha on ha.source_name='FixtureDownload' and ha.raw_name=s.home_raw left join public.teams ht on ht.canonical_name=s.home_raw left join public.team_aliases aa on aa.source_name='FixtureDownload' and aa.raw_name=s.away_raw left join public.teams at on at.canonical_name=s.away_raw)
  update public.fixtures f set kickoff_date=(m.ko at time zone 'Europe/London')::date,kickoff_time=(case when (m.ko at time zone 'UTC')::time = '00:00' then null else (m.ko at time zone 'Europe/London')::time end),matchweek=coalesce(m.round_no,f.matchweek),status=case when m.ko<now() then 'played' else 'scheduled' end,source_name='FixtureDownload',source_file=v_url,updated_at=now() from mapped m where m.ko is not null and m.home_id is not null and m.away_id is not null and f.league_id=v_league_id and f.season_id=v_season_id and f.home_team_id=m.home_id and f.away_team_id=m.away_id
    and not exists (select 1 from public.fpl_fixtures ff where ff.canonical_fixture_id = f.fixture_id and ff.kickoff_time is not null); -- DQ-01
  get diagnostics v_count=row_count; v_updated:=v_updated+v_count;
  -- Reported score (display only until football-data confirms it).
  with src as (select elem->>'HomeTeam' home_raw, elem->>'AwayTeam' away_raw, (elem->>'DateUtc')::timestamptz ko,
                      nullif(elem->>'HomeTeamScore','')::int hg, nullif(elem->>'AwayTeamScore','')::int ag
               from jsonb_array_elements(v_json) elem where elem ? 'DateUtc'),
  mapped as (select s.*, coalesce(ha.team_id, ht.team_id) home_id, coalesce(aa.team_id, at.team_id) away_id
             from src s
             left join public.team_aliases ha on ha.source_name = 'FixtureDownload' and ha.raw_name = s.home_raw
             left join public.teams ht on ht.canonical_name = s.home_raw
             left join public.team_aliases aa on aa.source_name = 'FixtureDownload' and aa.raw_name = s.away_raw
             left join public.teams at on at.canonical_name = s.away_raw)
  update public.fixtures f set reported_home_goals = m.hg, reported_away_goals = m.ag,
    reported_at = now(), reported_source = 'FixtureDownload'
  from mapped m
  where m.ko < now() and m.hg is not null and m.ag is not null and m.home_id is not null and m.away_id is not null
    and f.league_id = v_league_id and f.season_id = v_season_id
    and f.home_team_id = m.home_id and f.away_team_id = m.away_id
    and abs(f.kickoff_date - (m.ko at time zone 'Europe/London')::date) <= 7
    and (f.reported_home_goals is distinct from m.hg or f.reported_away_goals is distinct from m.ag);
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
 begin perform public.refresh_feed_nearest_date('I1','https://fixturedownload.com/feed/json/serie-a-' || v_year);
 exception when others then raise warning 'I1 fixture refresh failed: %', sqlerrm; end;
 begin perform public.refresh_feed_nearest_date('F1','https://fixturedownload.com/feed/json/ligue-1-' || v_year);
 exception when others then raise warning 'F1 fixture refresh failed: %', sqlerrm; end;
 begin perform public.refresh_feed_nearest_date('SP1','https://fixturedownload.com/feed/json/la-liga-' || v_year);
 exception when others then raise warning 'SP1 fixture refresh failed: %', sqlerrm; end;
 perform public.sync_pl_kickoffs_from_fpl(); -- DQ-01 (2026-10-22): FPL kick-offs win for the PL
 perform public.reconcile_unreported_played_fixtures(); -- 2026-10-16: kicked-off is not played
 select public.backfill_fixture_predictions() into v_predictions;
 update public.fixture_refresh_runs set finished_at=now(),rows_seen=v_seen,rows_updated=v_updated,status='success',error_message=case when cardinality(v_skipped)>0 then 'Feeds not published yet (HTTP 404): '||array_to_string(v_skipped,', ') end where refresh_run_id=v_run_id;
exception when others then update public.fixture_refresh_runs set finished_at=now(),rows_seen=v_seen,rows_updated=v_updated,status='failed',error_message=sqlerrm where refresh_run_id=v_run_id; raise;
end;$function$
;
