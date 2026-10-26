-- Live definition exported from the database (function refresh_efl_reported_scores()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_efl_reported_scores()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare
  v_season bigint := public.current_season_id();
  v_today date := (now() at time zone 'Europe/London')::date;
  v_run bigint; v_div record; v_url text; v_status int; v_body text; v_urls text[];
  v_seen int := 0; v_scored int := 0; v_set int := 0; v_played int := 0; v_n int;
  v_unmapped text[]; v_problem text;
begin
  insert into public.fixture_refresh_runs (competitions) values (array['E1', 'E2', 'E3']) returning refresh_run_id into v_run;
  begin
    if v_season is null then raise exception 'current season missing'; end if;
    drop table if exists _efl_src;
    create temp table _efl_src (league_id bigint, url text, tr text) on commit drop;

    for v_div in select * from (values (2::bigint, 'championship'), (3::bigint, 'league-one'), (4::bigint, 'league-two')) d(league_id, slug) loop
      v_urls := array['https://www.footballwebpages.co.uk/fixtures-results/' || v_div.slug];
      if extract(day from v_today) <= 3 then
        v_urls := v_urls || ('https://www.footballwebpages.co.uk/fixtures-results/' || v_div.slug || '/'
                             || to_char(v_today - interval '1 month', 'fmmonth'));
      end if;
      foreach v_url in array v_urls loop
        select status, content into v_status, v_body from extensions.http_get(v_url);
        if v_status <> 200 then raise exception '% returned HTTP %', v_url, v_status; end if;
        insert into _efl_src select v_div.league_id, v_url, t from regexp_split_to_table(v_body, '<tr') t
         where t ~ 'home-team"[^>]*data-export';
      end loop;
    end loop;

    drop table if exists _efl;
    create temp table _efl on commit drop as
    with parsed as (
      select league_id, url,
        to_date(substring(tr from 'export-only">(\d{1,2}/\d{1,2}/\d{4})</td>'), 'DD/MM/YYYY') ko_date,
        replace(replace(substring(tr from 'home-team"[^>]*data-export="([^"]+)"'), '&amp;', '&'), '&#39;', '''') home_raw,
        replace(replace(substring(tr from 'away-team"[^>]*data-export="([^"]+)"'), '&amp;', '&'), '&#39;', '''') away_raw,
        substring(tr from '<td class="score home-score">(\d+)</td>')::int hg,
        substring(tr from '<td class="score away-score">(\d+)</td>')::int ag
      from _efl_src)
    select distinct p.*, coalesce(ha.team_id, ht.team_id) home_id, coalesce(aa.team_id, at.team_id) away_id
      from parsed p
      left join public.team_aliases ha on ha.source_name = 'FootballWebPages' and ha.raw_name = p.home_raw
      left join public.teams ht on ht.canonical_name = p.home_raw
      left join public.team_aliases aa on aa.source_name = 'FootballWebPages' and aa.raw_name = p.away_raw
      left join public.teams at on at.canonical_name = p.away_raw
     where p.ko_date is not null;

    select count(*), count(*) filter (where hg is not null and ag is not null) into v_seen, v_scored from _efl;
    if v_seen = 0 then raise exception 'no EFL rows parsed; page layout may have changed'; end if;
    select array_agg(distinct n order by n) into v_unmapped from (
      select home_raw n from _efl where home_id is null union select away_raw from _efl where away_id is null) u;

    -- Scores: past games only, no confirmed result, and only an empty score or our own.
    update public.fixtures f set
      reported_home_goals = e.hg, reported_away_goals = e.ag, reported_at = now(), reported_source = 'FootballWebPages',
      updated_at = now()
    from _efl e
    where f.league_id = e.league_id and f.season_id = v_season
      and f.home_team_id = e.home_id and f.away_team_id = e.away_id
      and e.hg is not null and e.ag is not null and e.ko_date <= v_today
      and abs(f.kickoff_date - e.ko_date) <= 3
      and (f.reported_source is null or f.reported_source = 'FootballWebPages')
      and (f.reported_home_goals is distinct from e.hg or f.reported_away_goals is distinct from e.ag)
      and not private.fixture_has_result(f.league_id, f.season_id, f.home_team_id, f.away_team_id, f.kickoff_date);
    get diagnostics v_set = row_count;

    -- A game with any reported score has been played.
    update public.fixtures f set status = 'played', updated_at = now()
    from _efl e
    where f.league_id = e.league_id and f.season_id = v_season
      and f.home_team_id = e.home_id and f.away_team_id = e.away_id
      and e.hg is not null and e.ag is not null and e.ko_date <= v_today
      and abs(f.kickoff_date - e.ko_date) <= 3 and f.status = 'scheduled';
    get diagnostics v_played = row_count;

    v_problem := case when v_unmapped is not null
                      then 'unmapped club names (add team_aliases, source FootballWebPages): ' || array_to_string(v_unmapped, ', ') end;
    update public.fixture_refresh_runs set finished_at = now(), rows_seen = v_seen, rows_updated = v_set + v_played,
      status = case when v_problem is null then 'success' else 'failed' end, error_message = v_problem
     where refresh_run_id = v_run;
    return jsonb_build_object('status', case when v_problem is null then 'success' else 'failed' end, 'rows_seen', v_seen,
                              'with_score', v_scored, 'scores_set', v_set, 'marked_played', v_played, 'problem', v_problem);
  exception when others then
    -- Recorded rather than re-raised: a re-raise would roll back this record.
    update public.fixture_refresh_runs set finished_at = now(), status = 'failed', error_message = sqlerrm
     where refresh_run_id = v_run;
    raise warning 'EFL reported scores refresh failed: %', sqlerrm;
    return jsonb_build_object('status', 'failed', 'error', sqlerrm);
  end;
end;
$function$
;
