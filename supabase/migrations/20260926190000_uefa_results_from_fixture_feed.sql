-- UEFA competition results from the FixtureDownload feed (2026-09-26)
--
-- Problem: 18 Europa League fixtures (matchday 1, 16-17 Sept 2026) were
-- 'played' in public.fixtures with no row in public.matches.
--
-- Cause: nothing ingests UEFA results. refresh_fixture_feeds() reads the
-- FixtureDownload feeds for UCL/UEL/UECL but only updates fixture dates and
-- sets status='played' once kick-off has passed (by the clock, not from a
-- result). ingest-cup-data covers only the Carabao Cup and FA Cup. The 18
-- Champions League results in matches were a one-off manual backfill
-- (source_name 'verified_web', 11 Sept), so the Champions League only looked
-- covered; the Europa League matchday that followed had no path in at all.
--
-- The feed already carries the result (HomeTeamScore / AwayTeamScore). Checked
-- against the independent Champions League backfill: 17 of 18 feed results
-- matched and all 17 scores agree; the 18th (Man Utd 4-0 Sabah) didn't match
-- only because the feed's "Man Utd" had no FixtureDownload alias.
--
-- Fix:
--  1. team_aliases: FixtureDownload "Man Utd" -> Man United (team 5).
--  2. refresh_fixture_feeds(): for UCL, UEL and UECL, upsert matches from feed
--     rows that carry both scores. League phase only (rounds 1-8): knockout
--     ties can go to extra time and penalties, which these columns and
--     full_time_result don't represent, so those need a decision before
--     February rather than a silent guess. An existing row from another
--     source (e.g. verified_web) is never overwritten; a FixtureDownload row
--     is corrected if the feed's score changes.
--  3. check_model_integrity(): new check 'played_without_result' -- a fixture
--     'played' 3+ days after kick-off with no matches row FAILS. At the time
--     of writing the only such fixtures in any competition were these 18.
--     This also catches knockout results once the feed publishes them.
--
-- Backfill: run `select public.refresh_fixture_feeds();` (the command the
-- daily cron job refresh-football-fixtures-daily runs) once after this
-- migration; it writes the 18 Europa League matchday 1 results.

-- 1. Alias
insert into public.team_aliases (team_id, source_name, raw_name)
select 5, 'FixtureDownload', 'Man Utd'
where exists (select 1 from public.teams where team_id = 5 and canonical_name = 'Man United')
on conflict (source_name, raw_name) do nothing;

-- 2. refresh_fixture_feeds(): add the UEFA result upsert inside the feed loop
do $mig$
declare
  v_def text := pg_get_functiondef('public.refresh_fixture_feeds()'::regprocedure);
  v_anchor text := 'get diagnostics v_count=row_count; v_updated:=v_updated+v_count;';
  v_add text := $add$
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
  end if;$add$;
  v_n int;
begin
  if position('HomeTeamScore' in v_def) > 0 then raise notice 'refresh_fixture_feeds already reads HomeTeamScore -- skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then raise exception 'refresh_fixture_feeds anchor matched % times (expected 1)', v_n; end if;
  execute replace(v_def, v_anchor, v_anchor || v_add);
end
$mig$;

-- 3. check_model_integrity(): played fixtures must have a result
do $mig$
declare
  v_def text := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  v_anchor text := E'  union all\n  select \'cup_ingestion_current\'';
  v_add text := E'  union all\n'
    || E'  select \'played_without_result\', case when n = 0 then \'ok\' else \'failed\' end, n,\n'
    || E'    \'Fixtures PLAYED more than 3 days ago with no result in matches (no results feed for that competition, or a mapping gap): \' || coalesce(ids, \'\')\n'
    || E'  from (select count(*) n, string_agg(f.fixture_id::text, \', \' order by f.fixture_id) ids\n'
    || E'        from public.fixtures f\n'
    || E'        where f.status = \'played\' and f.kickoff_date < current_date - 3\n'
    || E'          and not exists (select 1 from public.matches m\n'
    || E'                          where m.league_id = f.league_id and m.season_id = f.season_id\n'
    || E'                            and m.home_team_id = f.home_team_id and m.away_team_id = f.away_team_id\n'
    || E'                            and m.match_date = f.kickoff_date)) x\n';
  v_n int;
begin
  if position('played_without_result' in v_def) > 0 then raise notice 'played_without_result already present -- skipped'; return; end if;
  v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
  if v_n <> 1 then raise exception 'check_model_integrity anchor matched % times (expected 1)', v_n; end if;
  execute replace(v_def, v_anchor, v_add || v_anchor);
end
$mig$;
