-- Live definition exported from the database (function refresh_cup_decisions()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.refresh_cup_decisions()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare
  v_season bigint := public.current_season_id();
  v_run bigint; v_comp record; v_slug text; v_status int; v_body text; v_base text;
  v_pages int := 0; v_seen int := 0; v_joined int := 0; v_set int := 0; v_pens int := 0;
begin
  insert into public.fixture_refresh_runs (competitions) values (array['LC', 'FAC']) returning refresh_run_id into v_run;
  begin
    if v_season is null then raise exception 'current season missing'; end if;
    drop table if exists _cup_tr;
    create temp table _cup_tr (league_id bigint, comp text, slug text, tr text) on commit drop;

    for v_comp in select * from (values (6::bigint, 'efl-cup'), (7::bigint, 'fa-cup')) c(league_id, comp) loop
      v_base := 'https://www.footballwebpages.co.uk/fixtures-results/' || v_comp.comp;
      select status, content into v_status, v_body from extensions.http_get(v_base || '/third-round');
      if v_status <> 200 then raise exception '% returned HTTP %', v_base, v_status; end if;
      -- Round pages from the round dropdown (season options are digits, e.g. 2025-2026).
      for v_slug in select distinct m[1] from regexp_matches(v_body, '<option value="([a-z][a-z-]*)"', 'g') m
                     where m[1] ~ '(round|final)' loop
        select status, content into v_status, v_body from extensions.http_get(v_base || '/' || v_slug);
        if v_status <> 200 then raise exception '%/% returned HTTP %', v_base, v_slug, v_status; end if;
        v_pages := v_pages + 1;
        insert into _cup_tr select v_comp.league_id, v_comp.comp, v_slug, t from regexp_split_to_table(v_body, '<tr') t
         where t ~ 'id="match-\d+-(score|extra-info)-row"';
      end loop;
    end loop;

    drop table if exists _cup;
    create temp table _cup on commit drop as
    with score as (
      select league_id, comp, slug, substring(tr from 'id="match-(\d+)-score-row"') fwp_id,
        to_date(substring(tr from 'export-only">(\d{1,2}/\d{1,2}/\d{4})</td>'), 'DD/MM/YYYY') ko_date,
        trim(substring(tr from '<td class="status"[^>]*>([^<]*)</td>')) status,
        replace(replace(substring(tr from 'home-team"[^>]*data-export="([^"]+)"'), '&amp;', '&'), '&#39;', '''') home_raw,
        replace(replace(substring(tr from 'away-team"[^>]*data-export="([^"]+)"'), '&amp;', '&'), '&#39;', '''') away_raw,
        substring(tr from '<td class="score home-score">(\d+)</td>')::int hg,
        substring(tr from '<td class="score away-score">(\d+)</td>')::int ag
      from _cup_tr where tr ~ 'id="match-\d+-score-row"'),
    info as (
      select distinct on (fwp_id) fwp_id, txt from (
        select substring(tr from 'id="match-(\d+)-extra-info-row"') fwp_id,
          replace(replace(trim(regexp_replace(substring(tr from '<td colspan="4">(.*?)</td>'), '<[^>]+>', '', 'g')), '&amp;', '&'), '&#39;', '''') txt
        from _cup_tr where tr ~ 'id="match-\d+-extra-info-row"') i),
    parsed as (
      select distinct on (s.fwp_id) s.*, i.txt, regexp_match(i.txt, '^(.+) win (\d+)-(\d+) on penalties$') pen
      from score s left join info i using (fwp_id)
      where s.hg is not null and s.ag is not null and s.ko_date is not null)
    select p.*, coalesce(ha.team_id, ht.team_id) home_id, coalesce(aa.team_id, at.team_id) away_id
      from parsed p
      left join public.team_aliases ha on ha.source_name = 'FootballWebPages' and ha.raw_name = p.home_raw
      left join public.teams ht on ht.canonical_name = p.home_raw
      left join public.team_aliases aa on aa.source_name = 'FootballWebPages' and aa.raw_name = p.away_raw
      left join public.teams at on at.canonical_name = p.away_raw;

    select count(*) into v_seen from _cup;
    if v_pages > 0 and v_seen = 0 then raise exception 'no played cup rows parsed; page layout may have changed'; end if;

    drop table if exists _cup_set;
    create temp table _cup_set on commit drop as
    select distinct on (m.match_id) m.match_id,
      case when c.pen is not null then 'penalties'
           when c.comp = 'efl-cup' and c.slug ~ 'semi' then null
           when c.hg = c.ag then null
           when c.status ~* 'aet' then 'extra_time'
           else 'normal_time' end decided_by,
      case when c.pen is not null then (case when c.pen[1] = c.home_raw then m.home_team_id when c.pen[1] = c.away_raw then m.away_team_id end)
           when c.comp = 'efl-cup' and c.slug ~ 'semi' then null
           when c.hg > c.ag then m.home_team_id when c.ag > c.hg then m.away_team_id end winner_team_id,
      case when c.pen is null then null when c.pen[1] = c.home_raw then c.pen[2]::int when c.pen[1] = c.away_raw then c.pen[3]::int end home_pens,
      case when c.pen is null then null when c.pen[1] = c.home_raw then c.pen[3]::int when c.pen[1] = c.away_raw then c.pen[2]::int end away_pens
    from _cup c
    join public.matches m on m.league_id = c.league_id and m.season_id = v_season
     and m.home_team_id = c.home_id and m.away_team_id = c.away_id
     and abs(m.match_date - c.ko_date) <= 3
     and m.full_time_home_goals = c.hg and m.full_time_away_goals = c.ag;
    select count(*) into v_joined from _cup_set;

    -- A shoot-out line naming neither side would leave the winner unknown: skip it.
    delete from _cup_set where decided_by = 'penalties' and winner_team_id is null;
    select count(*) into v_pens from _cup_set where decided_by = 'penalties';

    update public.matches m set
      decided_by = s.decided_by, winner_team_id = s.winner_team_id,
      home_penalty_goals = s.home_pens, away_penalty_goals = s.away_pens, updated_at = now()
    from _cup_set s
    where m.match_id = s.match_id
      and (m.decided_by is distinct from s.decided_by or m.winner_team_id is distinct from s.winner_team_id
           or m.home_penalty_goals is distinct from s.home_pens or m.away_penalty_goals is distinct from s.away_pens);
    get diagnostics v_set = row_count;

    update public.fixture_refresh_runs set finished_at = now(), rows_seen = v_seen, rows_updated = v_set, status = 'success'
     where refresh_run_id = v_run;
    return jsonb_build_object('status', 'success', 'pages', v_pages, 'rows_seen', v_seen, 'ties_matched', v_joined,
                              'shootouts', v_pens, 'rows_updated', v_set);
  exception when others then
    -- Recorded rather than re-raised: a re-raise would roll back this record.
    update public.fixture_refresh_runs set finished_at = now(), status = 'failed', error_message = sqlerrm
     where refresh_run_id = v_run;
    raise warning 'cup decisions refresh failed: %', sqlerrm;
    return jsonb_build_object('status', 'failed', 'error', sqlerrm);
  end;
end;
$function$
;
