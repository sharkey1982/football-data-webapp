-- ============================================================================
-- National League (EC): load and maintain the full 2026/27 fixture list.
--
-- Why EC had 36 fixtures against 108 results (2026-09-26):
--   EC fixtures only ever came from scripts/sync-fixtures.ts, which reads
--   football-data.co.uk/fixtures.csv. That file is a rolling window of the
--   coming few days (on 26 Sep it held 25-28 Sep only: 12 EC rows). The
--   script first ran on 17 Sep, so nothing before 15 Sep was ever inserted
--   and nothing beyond the next weekend ever could be. fixture_refresh_runs
--   shows every EC run seeing exactly 12 rows.
--
-- Source now used: footballwebpages.co.uk -- already this pipeline's cup
-- source (ingest-cup-data), same page layout. Its National League pages
-- list the whole season month by month. Checked before loading, on
-- 2026-09-26: 552 fixtures (24 teams x 23 home games), 552 distinct
-- home/away pairs, every team 23 home fixtures, and all 108 played rows
-- equal to our results archive (same teams, date and score) with none
-- missing either way.
--
-- 1. FootballWebPages aliases for the 14 EC club names that differ from our
--    canonical names (the other 10 match canonical names directly).
-- 2. refresh_national_league_fixtures(): matches source rows to fixtures on
--    (league, season, home, away) -- unique for a league season -- so a
--    moved fixture updates its row (logged to fixture_changes) instead of
--    inserting a second one; inserts missing fixtures; marks played /
--    postponed. Records each run in fixture_refresh_runs (competitions
--    {EC}); a failed run is recorded there, not raised, so the record
--    survives.
-- 3. Daily pg_cron job at 04:35 UTC (after refresh_fixture_feeds at 04:15;
--    the 05:15 cup ingest then refreshes predictions for new fixtures).
-- 4. Run once now, then refresh predictions for upcoming fixtures (the
--    kick-off guard in backfill_fixture_predictions still applies; played
--    fixtures are never predicted).
-- ============================================================================

-- 1. Aliases ----------------------------------------------------------------
insert into public.team_aliases (source_name, raw_name, team_id)
select 'FootballWebPages', v.raw_name, t.team_id
from (values
  ('AFC Fylde', 'Fylde'), ('Aldershot Town', 'Aldershot'), ('Boston United', 'Boston Utd'),
  ('Carlisle United', 'Carlisle'), ('FC Halifax Town', 'Halifax'), ('Forest Green Rovers', 'Forest Green'),
  ('Harrogate Town', 'Harrogate'), ('Hartlepool United', 'Hartlepool'), ('Kidderminster Harriers', 'Kidderminster'),
  ('Scunthorpe United', 'Scunthorpe'), ('Solihull Moors', 'Solihull'), ('Southend United', 'Southend'),
  ('Sutton United', 'Sutton'), ('Yeovil Town', 'Yeovil')
) v(raw_name, canonical_name)
join public.teams t on t.canonical_name = v.canonical_name
on conflict (source_name, raw_name) do nothing;

do $$ begin
  if (select count(*) from public.team_aliases where source_name = 'FootballWebPages'
        and raw_name in ('AFC Fylde','Aldershot Town','Boston United','Carlisle United','FC Halifax Town',
          'Forest Green Rovers','Harrogate Town','Hartlepool United','Kidderminster Harriers',
          'Scunthorpe United','Solihull Moors','Southend United','Sutton United','Yeovil Town')) <> 14 then
    raise exception 'expected 14 FootballWebPages EC aliases';
  end if;
end $$;

-- 2. Loader -----------------------------------------------------------------
create or replace function public.refresh_national_league_fixtures()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_catalog'
as $function$
declare
  v_base constant text := 'https://www.footballwebpages.co.uk/fixtures-results/national-league';
  v_league bigint; v_season bigint; v_run bigint;
  v_url text; v_status int; v_body text; v_months text[];
  v_seen int := 0; v_changed int := 0; v_inserted int := 0; v_n int;
  v_unmapped text[]; v_dup_pairs int; v_problem text;
begin
  select league_id into v_league from public.leagues where code = 'EC';
  select season_id into v_season from public.seasons where label = '2627';
  insert into public.fixture_refresh_runs (competitions) values (array['EC']) returning refresh_run_id into v_run;

  begin
    if v_league is null or v_season is null then raise exception 'EC league or 2026/27 season missing'; end if;

    drop table if exists _ec_src;
    create temp table _ec_src (url text, tr text) on commit drop;

    -- The base page is the current month; its dropdown names the others.
    select status, content into v_status, v_body from extensions.http_get(v_base);
    if v_status <> 200 then raise exception 'National League page returned HTTP %', v_status; end if;
    insert into _ec_src select v_base, t from regexp_split_to_table(v_body, '<tr') t where t ~ 'home-team"[^>]*data-export';
    select array_agg(distinct m[1]) into v_months
    from regexp_matches(v_body, '<option value="(january|february|march|april|may|june|july|august|september|october|november|december)"', 'g') m;
    if coalesce(array_length(v_months, 1), 0) < 6 then
      raise exception 'National League page lists % month(s); page layout may have changed', coalesce(array_length(v_months, 1), 0);
    end if;
    foreach v_url in array v_months loop
      v_url := v_base || '/' || v_url;
      select status, content into v_status, v_body from extensions.http_get(v_url);
      if v_status <> 200 then raise exception '% returned HTTP %', v_url, v_status; end if;
      insert into _ec_src select v_url, t from regexp_split_to_table(v_body, '<tr') t where t ~ 'home-team"[^>]*data-export';
    end loop;

    drop table if exists _ec;
    create temp table _ec on commit drop as
    with parsed as (
      select distinct on (src_id) * from (
        select url,
          substring(tr from 'data-href="[^"]*/(\d+)"')::bigint src_id,
          to_date(substring(tr from 'export-only">(\d{1,2}/\d{1,2}/\d{4})</td>'), 'DD/MM/YYYY') ko_date,
          lower(trim(substring(tr from '<td class="status"[^>]*>([^<]*)</td>'))) status_text,
          substring(tr from 'title="[^"]*"') ~* ' - postponed"' postponed,
          replace(replace(substring(tr from 'home-team"[^>]*data-export="([^"]+)"'), '&amp;', '&'), '&#39;', '''') home_raw,
          replace(replace(substring(tr from 'away-team"[^>]*data-export="([^"]+)"'), '&amp;', '&'), '&#39;', '''') away_raw,
          substring(tr from '<td class="score home-score">(\d+)</td>')::int hg,
          substring(tr from '<td class="score away-score">(\d+)</td>')::int ag
        from _ec_src) p
      where src_id is not null and ko_date is not null
      order by src_id, url
    )
    select p.*,
      coalesce(ha.team_id, ht.team_id) home_id, coalesce(aa.team_id, at.team_id) away_id,
      case when p.status_text ~ '^\d{1,2}(\.\d{2})?(am|pm)$' then
        make_time(
          (substring(p.status_text from '^(\d{1,2})')::int % 12) + case when p.status_text like '%pm' then 12 else 0 end,
          coalesce(substring(p.status_text from '^\d{1,2}\.(\d{2})')::int, 0), 0)
      end ko_time
    from parsed p
    left join public.team_aliases ha on ha.source_name = 'FootballWebPages' and ha.raw_name = p.home_raw
    left join public.teams ht on ht.canonical_name = p.home_raw
    left join public.team_aliases aa on aa.source_name = 'FootballWebPages' and aa.raw_name = p.away_raw
    left join public.teams at on at.canonical_name = p.away_raw;

    select count(*) into v_seen from _ec;
    if v_seen = 0 then raise exception 'no National League fixtures parsed; page layout may have changed'; end if;

    select array_agg(distinct n order by n) into v_unmapped from (
      select home_raw n from _ec where home_id is null union select away_raw from _ec where away_id is null) u;
    delete from _ec where home_id is null or away_id is null;

    -- A pairing listed twice cannot be matched safely: leave it alone and report.
    select count(*) into v_dup_pairs from (select 1 from _ec group by home_id, away_id having count(*) > 1) d;
    delete from _ec e where (e.home_id, e.away_id) in (select home_id, away_id from _ec group by 1, 2 having count(*) > 1);

    -- Kick-off changes. A blank source time (TBC, postponed, or FT on a
    -- played row) never wipes a known time.
    insert into public.fixture_changes (fixture_id, old_kickoff_date, new_kickoff_date, old_kickoff_time, new_kickoff_time)
    select f.fixture_id, f.kickoff_date, e.ko_date, f.kickoff_time, coalesce(e.ko_time, f.kickoff_time)
    from _ec e join public.fixtures f on f.league_id = v_league and f.season_id = v_season
      and f.home_team_id = e.home_id and f.away_team_id = e.away_id
    where f.kickoff_date <> e.ko_date or f.kickoff_time is distinct from coalesce(e.ko_time, f.kickoff_time);

    update public.fixtures f set
      kickoff_date = e.ko_date,
      kickoff_time = coalesce(e.ko_time, f.kickoff_time),
      status = case
        when e.hg is not null or f.status = 'played' then 'played'
        when e.postponed then 'postponed'
        else 'scheduled' end,
      updated_at = now()
    from _ec e
    where f.league_id = v_league and f.season_id = v_season
      and f.home_team_id = e.home_id and f.away_team_id = e.away_id
      and (f.kickoff_date <> e.ko_date
        or f.kickoff_time is distinct from coalesce(e.ko_time, f.kickoff_time)
        or f.status is distinct from case
             when e.hg is not null or f.status = 'played' then 'played'
             when e.postponed then 'postponed'
             else 'scheduled' end);
    get diagnostics v_changed = row_count;

    insert into public.fixtures (league_id, season_id, home_team_id, away_team_id, kickoff_date, kickoff_time,
                                 matchweek, status, source_name, source_file)
    select v_league, v_season, e.home_id, e.away_id, e.ko_date, e.ko_time, null,
      case when e.hg is not null or exists (
             select 1 from public.matches m where m.league_id = v_league and m.season_id = v_season
               and m.home_team_id = e.home_id and m.away_team_id = e.away_id and m.match_date = e.ko_date
               and m.full_time_home_goals is not null) then 'played'
           when e.postponed then 'postponed'
           else 'scheduled' end,
      'FootballWebPages', e.url
    from _ec e
    where not exists (select 1 from public.fixtures f where f.league_id = v_league and f.season_id = v_season
                        and f.home_team_id = e.home_id and f.away_team_id = e.away_id);
    get diagnostics v_inserted = row_count;

    v_problem := concat_ws('; ',
      case when v_unmapped is not null then 'unmapped club names (add team_aliases, source FootballWebPages): ' || array_to_string(v_unmapped, ', ') end,
      case when v_dup_pairs > 0 then v_dup_pairs || ' home/away pairing(s) listed more than once, left unchanged' end);

    update public.fixture_refresh_runs set finished_at = now(), rows_seen = v_seen,
      rows_updated = v_changed + v_inserted,
      status = case when v_problem = '' then 'success' else 'failed' end,
      error_message = nullif(v_problem, '')
    where refresh_run_id = v_run;

    return jsonb_build_object('status', case when v_problem = '' then 'success' else 'failed' end,
      'rows_seen', v_seen, 'updated', v_changed, 'inserted', v_inserted, 'problem', nullif(v_problem, ''));
  exception when others then
    -- Recorded rather than re-raised: a re-raise would roll back this record.
    update public.fixture_refresh_runs set finished_at = now(), status = 'failed', error_message = sqlerrm
    where refresh_run_id = v_run;
    raise warning 'EC fixture refresh failed: %', sqlerrm;
    return jsonb_build_object('status', 'failed', 'error', sqlerrm);
  end;
end;
$function$;

revoke all on function public.refresh_national_league_fixtures() from public, anon, authenticated;

comment on function public.refresh_national_league_fixtures() is
  'Loads and maintains the full National League (EC) 2026/27 fixture list from footballwebpages.co.uk (monthly pages). Matches on league, season, home and away team; logs kick-off changes to fixture_changes; inserts missing fixtures; records each run in fixture_refresh_runs.';

-- 3. Schedule ----------------------------------------------------------------
do $$ begin
  if exists (select 1 from cron.job where jobname = 'refresh-national-league-fixtures-daily') then
    perform cron.unschedule('refresh-national-league-fixtures-daily');
  end if;
  perform cron.schedule('refresh-national-league-fixtures-daily', '35 4 * * *',
                        'select public.refresh_national_league_fixtures();');
end $$;

-- 4. Load now ----------------------------------------------------------------
do $$
declare r jsonb; v_total int; v_played_unlinked int;
begin
  r := public.refresh_national_league_fixtures();
  if r->>'status' <> 'success' then raise exception 'EC fixture load failed: %', r; end if;
  select count(*) into v_total from public.fixtures f join public.leagues l using (league_id)
    join public.seasons s using (season_id) where l.code = 'EC' and s.label = '2627';
  if v_total <> 552 then raise exception 'expected 552 EC fixtures, found %', v_total; end if;
  -- every EC result must have its fixture (same teams and date), marked played
  select count(*) into v_played_unlinked from public.matches m join public.leagues l using (league_id)
    join public.seasons s using (season_id)
  where l.code = 'EC' and s.label = '2627' and not exists (
    select 1 from public.fixtures f where f.league_id = m.league_id and f.season_id = m.season_id
      and f.home_team_id = m.home_team_id and f.away_team_id = m.away_team_id
      and f.kickoff_date = m.match_date and f.status = 'played');
  if v_played_unlinked <> 0 then raise exception '% EC results without a played fixture', v_played_unlinked; end if;
end $$;

select public.backfill_fixture_predictions();
