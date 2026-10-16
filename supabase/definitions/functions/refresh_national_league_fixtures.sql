-- Live definition exported from the database (function refresh_national_league_fixtures()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_national_league_fixtures()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare
  v_base constant text := 'https://www.footballwebpages.co.uk/fixtures-results/national-league';
  v_league bigint; v_season bigint; v_run bigint;
  v_url text; v_status int; v_body text; v_months text[];
  v_seen int := 0; v_changed int := 0; v_inserted int := 0; v_n int;
  v_unmapped text[]; v_dup_pairs int; v_problem text; v_start int; v_out_of_season int := 0;
begin
  select league_id into v_league from public.leagues where code = 'EC';
  v_season := public.current_season_id();  -- docs/season-rollover.md
  select start_year into v_start from public.seasons where season_id = v_season;
  insert into public.fixture_refresh_runs (competitions) values (array['EC']) returning refresh_run_id into v_run;

  begin
    if v_league is null or v_season is null then raise exception 'EC league or current season missing'; end if;

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

    -- The page can list next season before 1 July (or last season after it):
    -- only rows dated inside the current season's 1 July - 30 June window count.
    delete from _ec where ko_date < make_date(v_start, 7, 1) or ko_date >= make_date(v_start + 1, 7, 1);
    get diagnostics v_out_of_season = row_count;

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

    -- Reported score (display only until football-data confirms it).
    update public.fixtures f set
      reported_home_goals = e.hg, reported_away_goals = e.ag,
      reported_at = now(), reported_source = 'FootballWebPages'
    from _ec e
    where f.league_id = v_league and f.season_id = v_season
      and f.home_team_id = e.home_id and f.away_team_id = e.away_id
      and e.hg is not null and e.ag is not null
      and (f.reported_home_goals is distinct from e.hg or f.reported_away_goals is distinct from e.ag);

    v_problem := concat_ws('; ',
      case when v_unmapped is not null then 'unmapped club names (add team_aliases, source FootballWebPages): ' || array_to_string(v_unmapped, ', ') end,
      case when v_dup_pairs > 0 then v_dup_pairs || ' home/away pairing(s) listed more than once, left unchanged' end);

    update public.fixture_refresh_runs set finished_at = now(), rows_seen = v_seen,
      rows_updated = v_changed + v_inserted,
      status = case when v_problem = '' then 'success' else 'failed' end,
      error_message = nullif(v_problem, '')
    where refresh_run_id = v_run;

    return jsonb_build_object('status', case when v_problem = '' then 'success' else 'failed' end,
      'rows_seen', v_seen, 'out_of_season', v_out_of_season, 'updated', v_changed, 'inserted', v_inserted, 'problem', nullif(v_problem, ''));
  exception when others then
    -- Recorded rather than re-raised: a re-raise would roll back this record.
    update public.fixture_refresh_runs set finished_at = now(), status = 'failed', error_message = sqlerrm
    where refresh_run_id = v_run;
    raise warning 'EC fixture refresh failed: %', sqlerrm;
    return jsonb_build_object('status', 'failed', 'error', sqlerrm);
  end;
end;
$function$
;
