-- ============================================================================
-- Football League postponements and rearranged dates (31 Oct 2026).
--
-- Championship, League One and League Two fixtures come from FixtureDownload,
-- which has no postponement data and kept the original dates. Six games
-- postponed on 26 Sep and 3 Oct showed "Result to follow" for weeks:
--   Notts County v Blackpool (26 Sep), Peterborough v Notts County,
--   Barnsley v MK Dons, Walsall v Crawley (3 Oct): rearranged
--   (12 Jan, 15 Dec, 15 Dec, 15 Dec) on footballwebpages;
--   Mansfield v Leyton Orient (26 Sep), Bromley v Wycombe (3 Oct):
--   postponed, no new date. footballwebpages drops such a game from its
--   list until it is rearranged.
--
-- Now, as refresh_national_league_fixtures() already does for the National
-- League:
-- * public.refresh_efl_fixtures() reads footballwebpages' full season (the
--   current month page plus every month in its dropdown) for each division,
--   one request a second, and for a fixture with no result and no reported
--   score:
--     - moves the kick-off date/time to footballwebpages' (logged to
--       fixture_changes); a past game moved forward becomes 'scheduled';
--     - marks it 'postponed' when footballwebpages titles it "- Postponed" or
--       "- Abandoned" (abandoned rows never count as a result), or when a
--       past-dated game is missing from the whole season list. That last
--       rule is skipped for a division with an unmapped club name or more
--       than 20 missing games (a page or layout problem, not postponements).
--   An abandoned or postponed row listed beside the rearranged one is
--   dropped; any other pairing listed twice is left alone and reported.
--   Never inserts fixtures: FixtureDownload stays the fixture list, and the
--   fixture id (and slug) never changes.
-- * fixtures.schedule_source: 'FootballWebPages' once that job has changed a
--   fixture's date, time or status. refresh_fixture_feeds() then leaves
--   those three alone (it still refreshes matchweek and updated_at), so the
--   two feeds don't undo each other every morning.
-- * refresh_efl_reported_scores(): an abandoned row's score is ignored.
-- * pg_cron 04:50 UTC daily (after FixtureDownload 04:15, National League
--   04:35), recorded in fixture_refresh_runs.
-- Safe to re-run.
-- ============================================================================

create or replace function pg_temp.patch(p_sig text, p_old text, p_new text) returns void language plpgsql as $f$
declare d text; n integer;
begin
  d := pg_get_functiondef(p_sig::regprocedure);
  if position(p_new in d) > 0 then return; end if;
  n := (length(d) - length(replace(d, p_old, ''))) / length(p_old);
  if n <> 1 then raise exception 'patch: % anchor found % times: %', p_sig, n, left(p_old, 80); end if;
  execute replace(d, p_old, p_new);
end;
$f$;

-- ---------------------------------------------------------------- 1. column
alter table public.fixtures add column if not exists schedule_source text;
comment on column public.fixtures.schedule_source is
  'Null: kick-off date, time and status follow the fixture feed (FixtureDownload for E0-E3). ''FootballWebPages'': refresh_efl_fixtures() has rearranged or postponed this fixture, and refresh_fixture_feeds() no longer changes those three fields.';

-- ---------------------------------------------------------------- 2. FixtureDownload leaves rearranged fixtures alone
select pg_temp.patch('public.refresh_fixture_feeds()',
  $o$-- DQ-01: FPL's kick-off wins$o$,
  $n$-- DQ-01: FPL's kick-off wins
      and f.schedule_source is null -- rearranged/postponed by refresh_efl_fixtures (31 Oct 2026)$n$);
select pg_temp.patch('public.refresh_fixture_feeds()',
  $o$update public.fixtures f set kickoff_date=(m.ko at time zone 'Europe/London')::date,kickoff_time=(case when (m.ko at time zone 'UTC')::time = '00:00' then null else (m.ko at time zone 'Europe/London')::time end),matchweek=coalesce(m.round_no,f.matchweek),status=case when m.ko<now() then 'played' else 'scheduled' end,$o$,
  $n$update public.fixtures f set kickoff_date=case when f.schedule_source is not null then f.kickoff_date else (m.ko at time zone 'Europe/London')::date end,kickoff_time=case when f.schedule_source is not null then f.kickoff_time else (case when (m.ko at time zone 'UTC')::time = '00:00' then null else (m.ko at time zone 'Europe/London')::time end) end,matchweek=coalesce(m.round_no,f.matchweek),status=case when f.schedule_source is not null then f.status when m.ko<now() then 'played' else 'scheduled' end,$n$);

-- ---------------------------------------------------------------- 3. EFL scores: an abandoned row is not a result
select pg_temp.patch('public.refresh_efl_reported_scores()',
  $o$        substring(tr from '<td class="score home-score">(\d+)</td>')::int hg,
        substring(tr from '<td class="score away-score">(\d+)</td>')::int ag$o$,
  $n$        case when substring(tr from 'title="[^"]*"') ~* ' - abandoned"' then null
             else substring(tr from '<td class="score home-score">(\d+)</td>')::int end hg,
        case when substring(tr from 'title="[^"]*"') ~* ' - abandoned"' then null
             else substring(tr from '<td class="score away-score">(\d+)</td>')::int end ag$n$);

-- ---------------------------------------------------------------- 4. the refresh
create or replace function public.refresh_efl_fixtures()
returns jsonb language plpgsql security definer set search_path = public, extensions, pg_catalog as $$
declare
  v_season bigint := public.current_season_id();
  v_start int;
  v_today date := (now() at time zone 'Europe/London')::date;
  v_local timestamp := now() at time zone 'Europe/London';
  v_run bigint; v_div record; v_base text; v_url text; v_status int; v_body text; v_months text[];
  v_seen int := 0; v_changed int := 0; v_absent_set int := 0; v_unmatched int := 0; v_dup_pairs int := 0; v_n int;
  v_unmapped text[]; v_absent_skipped text[]; v_problem text;
begin
  insert into public.fixture_refresh_runs (competitions) values (array['E1', 'E2', 'E3']) returning refresh_run_id into v_run;
  begin
    if v_season is null then raise exception 'current season missing'; end if;
    select start_year into v_start from public.seasons where season_id = v_season;

    drop table if exists _eflf_src;
    create temp table _eflf_src (league_id bigint, code text, url text, tr text) on commit drop;

    -- Whole season per division: the base page is the current month, its dropdown names the others.
    for v_div in select l.league_id, d.code, d.slug
                   from (values ('E1', 'championship'), ('E2', 'league-one'), ('E3', 'league-two')) d(code, slug)
                   join public.leagues l on l.code = d.code loop
      v_base := 'https://www.footballwebpages.co.uk/fixtures-results/' || v_div.slug;
      select status, content into v_status, v_body from extensions.http_get(v_base);
      if v_status <> 200 then raise exception '% returned HTTP %', v_base, v_status; end if;
      insert into _eflf_src select v_div.league_id, v_div.code, v_base, t
        from regexp_split_to_table(v_body, '<tr') t where t ~ 'home-team"[^>]*data-export';
      select array_agg(distinct m[1]) into v_months
        from regexp_matches(v_body, '<option value="(january|february|march|april|may|june|july|august|september|october|november|december)"', 'g') m;
      if coalesce(array_length(v_months, 1), 0) < 6 then
        raise exception '% lists % month(s); page layout may have changed', v_base, coalesce(array_length(v_months, 1), 0);
      end if;
      foreach v_url in array v_months loop
        perform pg_sleep(1);  -- one request a second (about 33 a run)
        v_url := v_base || '/' || v_url;
        select status, content into v_status, v_body from extensions.http_get(v_url);
        if v_status <> 200 then raise exception '% returned HTTP %', v_url, v_status; end if;
        insert into _eflf_src select v_div.league_id, v_div.code, v_url, t
          from regexp_split_to_table(v_body, '<tr') t where t ~ 'home-team"[^>]*data-export';
      end loop;
      perform pg_sleep(1);
    end loop;

    drop table if exists _eflf;
    create temp table _eflf on commit drop as
    with parsed as (
      select distinct on (src_id) * from (
        select league_id, code, url,
          substring(tr from 'data-href="[^"]*/(\d+)"')::bigint src_id,
          to_date(substring(tr from 'export-only">(\d{1,2}/\d{1,2}/\d{4})</td>'), 'DD/MM/YYYY') ko_date,
          lower(trim(substring(tr from '<td class="status"[^>]*>([^<]*)</td>'))) status_text,
          substring(tr from 'title="[^"]*"') ~* ' - (postponed|abandoned)"' postponed,
          substring(tr from 'title="[^"]*"') ~* ' - abandoned"' abandoned,
          replace(replace(substring(tr from 'home-team"[^>]*data-export="([^"]+)"'), '&amp;', '&'), '&#39;', '''') home_raw,
          replace(replace(substring(tr from 'away-team"[^>]*data-export="([^"]+)"'), '&amp;', '&'), '&#39;', '''') away_raw
        from _eflf_src) p
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

    select count(*) into v_seen from _eflf;
    if v_seen = 0 then raise exception 'no EFL fixtures parsed; page layout may have changed'; end if;

    -- Only the current season's 1 July - 30 June window.
    delete from _eflf where ko_date < make_date(v_start, 7, 1) or ko_date >= make_date(v_start + 1, 7, 1);

    select array_agg(distinct n order by n) into v_unmapped from (
      select code || ' ' || home_raw n from _eflf where home_id is null
      union select code || ' ' || away_raw from _eflf where away_id is null) u;
    delete from _eflf where home_id is null or away_id is null;

    -- Every pairing the source lists, for the "missing from the season" rule.
    drop table if exists _eflf_pairs;
    create temp table _eflf_pairs on commit drop as select distinct league_id, home_id, away_id from _eflf;

    -- A postponed/abandoned row listed beside its rearranged date: keep the new date.
    delete from _eflf e where e.postponed
      and exists (select 1 from _eflf x where x.league_id = e.league_id and x.home_id = e.home_id
                    and x.away_id = e.away_id and not x.postponed);
    -- Otherwise a pairing listed twice cannot be matched safely: leave it alone and report.
    select count(*) into v_dup_pairs from (select 1 from _eflf group by league_id, home_id, away_id having count(*) > 1) d;
    delete from _eflf e where (e.league_id, e.home_id, e.away_id) in
      (select league_id, home_id, away_id from _eflf group by 1, 2, 3 having count(*) > 1);

    select count(*) into v_unmatched from _eflf e
     where not exists (select 1 from public.fixtures f where f.league_id = e.league_id and f.season_id = v_season
                         and f.home_team_id = e.home_id and f.away_team_id = e.away_id);

    -- Target date, time and status for fixtures still waiting to be played.
    -- A blank source time (TBC, postponed) never wipes a known time.
    drop table if exists _eflf_t;
    create temp table _eflf_t on commit drop as
    select f.fixture_id, f.kickoff_date old_date, f.kickoff_time old_time, f.status old_status,
           e.ko_date new_date, coalesce(e.ko_time, f.kickoff_time) new_time,
           case when e.postponed then 'postponed'
                when e.ko_date + coalesce(e.ko_time, f.kickoff_time, time '15:00') <= v_local then 'played'  -- trigger: awaiting_result until a score
                else 'scheduled' end new_status
      from _eflf e
      join public.fixtures f on f.league_id = e.league_id and f.season_id = v_season
       and f.home_team_id = e.home_id and f.away_team_id = e.away_id
     where f.reported_home_goals is null
       and not private.fixture_has_result(f.league_id, f.season_id, f.home_team_id, f.away_team_id, f.kickoff_date)
       and (f.kickoff_date <> e.ko_date
            or f.kickoff_time is distinct from coalesce(e.ko_time, f.kickoff_time)
            or e.postponed is distinct from (f.status = 'postponed'));

    insert into public.fixture_changes (fixture_id, old_kickoff_date, new_kickoff_date, old_kickoff_time, new_kickoff_time)
    select fixture_id, old_date, new_date, old_time, new_time from _eflf_t
     where old_date <> new_date or old_time is distinct from new_time;

    update public.fixtures f set kickoff_date = t.new_date, kickoff_time = t.new_time, status = t.new_status,
           schedule_source = 'FootballWebPages', updated_at = now()
      from _eflf_t t where f.fixture_id = t.fixture_id;
    get diagnostics v_changed = row_count;

    -- Postponed with no new date: footballwebpages drops the game from its list.
    -- A past-dated fixture with no result or score, missing from the whole season.
    -- Skipped per division if a club name is unmapped or too many are missing.
    for v_div in select l.league_id, l.code from public.leagues l where l.code in ('E1', 'E2', 'E3') loop
      if exists (select 1 from unnest(coalesce(v_unmapped, '{}')) u where u like v_div.code || ' %') then
        v_absent_skipped := v_absent_skipped || (v_div.code || ' (unmapped club name)');
        continue;
      end if;
      select count(*) into v_n from public.fixtures f
       where f.league_id = v_div.league_id and f.season_id = v_season
         and not exists (select 1 from _eflf_pairs p where p.league_id = f.league_id
                           and p.home_id = f.home_team_id and p.away_id = f.away_team_id);
      if v_n > 20 then
        v_absent_skipped := v_absent_skipped || (v_div.code || ' (' || v_n || ' fixtures missing from the source)');
        continue;
      end if;
      update public.fixtures f set status = 'postponed', schedule_source = 'FootballWebPages', updated_at = now()
       where f.league_id = v_div.league_id and f.season_id = v_season
         and f.kickoff_date < v_today and f.status <> 'postponed'
         and f.reported_home_goals is null
         and not private.fixture_has_result(f.league_id, f.season_id, f.home_team_id, f.away_team_id, f.kickoff_date)
         and not exists (select 1 from _eflf_pairs p where p.league_id = f.league_id
                           and p.home_id = f.home_team_id and p.away_id = f.away_team_id);
      get diagnostics v_n = row_count;
      v_absent_set := v_absent_set + v_n;
    end loop;

    v_problem := concat_ws('; ',
      case when v_unmapped is not null then 'unmapped club names (add team_aliases, source FootballWebPages): ' || array_to_string(v_unmapped, ', ') end,
      case when v_dup_pairs > 0 then v_dup_pairs || ' home/away pairing(s) listed more than once, left unchanged' end,
      case when v_unmatched > 0 then v_unmatched || ' source fixture(s) with no FixtureDownload fixture' end,
      case when v_absent_skipped is not null then 'missing-game rule skipped: ' || array_to_string(v_absent_skipped, ', ') end);

    update public.fixture_refresh_runs set finished_at = now(), rows_seen = v_seen,
      rows_updated = v_changed + v_absent_set,
      status = case when v_problem = '' then 'success' else 'failed' end,
      error_message = nullif(v_problem, '')
    where refresh_run_id = v_run;

    return jsonb_build_object('status', case when v_problem = '' then 'success' else 'failed' end,
      'rows_seen', v_seen, 'updated', v_changed, 'postponed_missing', v_absent_set, 'problem', nullif(v_problem, ''));
  exception when others then
    -- Recorded rather than re-raised: a re-raise would roll back this record.
    update public.fixture_refresh_runs set finished_at = now(), status = 'failed', error_message = sqlerrm
     where refresh_run_id = v_run;
    raise warning 'EFL fixture refresh failed: %', sqlerrm;
    return jsonb_build_object('status', 'failed', 'error', sqlerrm);
  end;
end;
$$;

revoke all on function public.refresh_efl_fixtures() from public, anon, authenticated;

comment on function public.refresh_efl_fixtures() is
  'Championship, League One and League Two (E1-E3): rearranged kick-off dates/times and postponements from footballwebpages.co.uk''s full season (current month plus every month in its dropdown, one request a second). For fixtures with no result or reported score: moves date/time (logged to fixture_changes), marks postponed when titled "- Postponed"/"- Abandoned" or when a past-dated game is missing from the season list, and sets schedule_source = ''FootballWebPages'' so refresh_fixture_feeds() leaves them alone. Never inserts fixtures. Records each run in fixture_refresh_runs.';

-- ---------------------------------------------------------------- 5. schedule
do $$
begin
  if exists (select 1 from cron.job where jobname = 'refresh-efl-fixtures-daily') then
    perform cron.unschedule('refresh-efl-fixtures-daily');
  end if;
  perform cron.schedule('refresh-efl-fixtures-daily', '50 4 * * *', 'select public.refresh_efl_fixtures();');
end $$;

insert into public.job_registry (job_key, area, location, schedule, expected_interval, max_duration, run_log, run_key, upstream, active, outcome_is_check, notes)
values ('refresh-efl-fixtures-daily', 'football', 'supabase_cron', '50 4 * * *', '1 day', '00:15:00', 'pg_cron',
        '^refresh-efl-fixtures-daily$', 'Football League fixtures (footballwebpages)', true, false,
        'Championship, League One and League Two rearranged dates and postponements (FixtureDownload has none).')
on conflict (job_key) do nothing;

-- ---------------------------------------------------------------- 6. catalogue
select public.meta_refresh_flow();

update public.meta_flow_nodes set
  layer = 'pipeline', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Keeps Championship, League One and League Two (E1-E3) kick-off dates and postponements in line with footballwebpages.co.uk, which FixtureDownload (the fixture list) lacks. Reads the full season per division, and for fixtures with no result or reported score moves rearranged dates/times (logged to fixture_changes), marks postponed games (titled postponed/abandoned, or past-dated and missing from the season list), and sets fixtures.schedule_source so refresh_fixture_feeds() leaves them alone. Never inserts fixtures. Unmapped club names, a pairing listed twice or a source game with no fixture mark the run failed. Returns a JSON summary.',
  refresh_note = 'pg_cron job refresh-efl-fixtures-daily (50 4 * * *, 04:50 UTC). Records each run in fixture_refresh_runs (competitions {E1,E2,E3}); failures are recorded there rather than raised.',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_efl_fixtures()';

update public.meta_flow_nodes set
  layer = 'pipeline', status = 'current', is_public = false, ai_relevant = false,
  purpose = 'Championship, League One and League Two reported scores from footballwebpages.co.uk''s current month page (and last month''s in the first 3 days of a month): sets fixtures.reported_* (source FootballWebPages) for past games with a score and no confirmed result, and marks them played. Never overwrites a confirmed result or another source''s score; ignores abandoned rows; never moves dates (refresh_efl_fixtures does that). Display only until football-data confirms the result.',
  refresh_note = 'pg_cron job refresh-efl-reported-scores (20 6,17,22 * * *). Records each run in fixture_refresh_runs (competitions {E1,E2,E3}).',
  purpose_reviewed_at = now()
where node_key = 'function:refresh_efl_reported_scores()';

-- ---------------------------------------------------------------- 7. run it now
select public.refresh_efl_fixtures();
