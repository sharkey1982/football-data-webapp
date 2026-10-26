-- Live definition exported from the database (function capture_upcoming_odds()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.capture_upcoming_odds()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_catalog'
AS $function$
declare
  v_run bigint;
  v_status int;
  v_body text;
  v_rows int := 0;
  v_matched int := 0;
  v_inserted int := 0;
  v_unmapped text[];
begin
  insert into public.pipeline_runs (job_name, started_at, status) values ('capture-upcoming-odds', now(), 'running') returning run_id into v_run;
  begin
    select status, content into v_status, v_body
    from extensions.http(('GET', 'https://www.football-data.co.uk/fixtures.csv',
      array[extensions.http_header('User-Agent', 'Mozilla/5.0 (compatible; fixtureshark-odds/1.0)')], null, null)::extensions.http_request);
    if v_status <> 200 then raise exception 'fixtures.csv returned HTTP %', v_status; end if;
    v_body := replace(v_body, chr(65279), '');

    drop table if exists _fx;
    create temp table _fx on commit drop as
    with lines as (select t.l, t.n from regexp_split_to_table(v_body, E'\r?\n') with ordinality t(l, n) where length(trim(t.l)) > 0),
    hdr as (select string_to_array(l, ',') h from lines where n = 1),
    rws as (select string_to_array(l, ',') r from lines where n > 1)
    select r, h, r[array_position(h, 'Div')] as div, r[array_position(h, 'HomeTeam')] as home_raw, r[array_position(h, 'AwayTeam')] as away_raw,
      to_date(r[array_position(h, 'Date')], 'DD/MM/YYYY') as d
    from rws, hdr;
    select count(*) into v_rows from _fx;
    if v_rows = 0 then raise exception 'fixtures.csv had no rows; format may have changed'; end if;

    drop table if exists _fxm;
    create temp table _fxm on commit drop as
    select x.*, f.fixture_id
    from (
      select fx.*, l.league_id, coalesce(ha.team_id, ht.team_id) home_id, coalesce(aa.team_id, at.team_id) away_id
      from _fx fx
      join public.leagues l on l.code = fx.div
      left join public.team_aliases ha on ha.source_name = 'football-data.co.uk' and ha.raw_name = fx.home_raw
      left join public.teams ht on ht.canonical_name = fx.home_raw
      left join public.team_aliases aa on aa.source_name = 'football-data.co.uk' and aa.raw_name = fx.away_raw
      left join public.teams at on at.canonical_name = fx.away_raw
    ) x
    left join lateral (
      select f.fixture_id from public.fixtures f
      where f.league_id = x.league_id and f.season_id = public.current_season_id()
        and f.home_team_id = x.home_id and f.away_team_id = x.away_id
        and f.kickoff_date between x.d - 3 and x.d + 3
      order by abs(f.kickoff_date - x.d) limit 1
    ) f on true;

    select array_agg(distinct n order by n) into v_unmapped from (
      select home_raw n from _fxm where home_id is null and exists (select 1 from public.fixtures f where f.league_id = _fxm.league_id)
      union select away_raw from _fxm where away_id is null and exists (select 1 from public.fixtures f where f.league_id = _fxm.league_id)) u;
    select count(*) into v_matched from _fxm where fixture_id is not null;

    with prices as (
      select m.fixture_id, b.bookmaker, b.market, b.is_closing,
        case when b.market = 'ah' then nullif(m.r[array_position(m.h, case when b.is_closing then 'AHCh' else 'AHh' end)], '')::numeric end as line,
        nullif(m.r[array_position(m.h, b.col_h)], '')::numeric ph, nullif(m.r[array_position(m.h, b.col_d)], '')::numeric pd,
        nullif(m.r[array_position(m.h, b.col_a)], '')::numeric pa,
        nullif(m.r[array_position(m.h, b.col_o)], '')::numeric po, nullif(m.r[array_position(m.h, b.col_u)], '')::numeric pu
      from _fxm m
      cross join (values
        ('Avg', '1x2', false, 'AvgH', 'AvgD', 'AvgA', null, null),
        ('Max', '1x2', false, 'MaxH', 'MaxD', 'MaxA', null, null),
        ('B365', '1x2', false, 'B365H', 'B365D', 'B365A', null, null),
        ('BFE', '1x2', false, 'BFEH', 'BFED', 'BFEA', null, null),
        ('Avg', '1x2', true, 'AvgCH', 'AvgCD', 'AvgCA', null, null),
        ('BFE', '1x2', true, 'BFECH', 'BFECD', 'BFECA', null, null),
        ('Avg', 'ou25', false, null, null, null, 'Avg>2.5', 'Avg<2.5'),
        ('BFE', 'ou25', false, null, null, null, 'BFE>2.5', 'BFE<2.5'),
        ('Avg', 'ah', false, 'AvgAHH', null, 'AvgAHA', null, null),
        ('Avg', 'ou25', true, null, null, null, 'AvgC>2.5', 'AvgC<2.5'),
        ('Avg', 'ah', true, 'AvgCAHH', null, 'AvgCAHA', null, null)
      ) b(bookmaker, market, is_closing, col_h, col_d, col_a, col_o, col_u)
      where m.fixture_id is not null
    )
    insert into public.fixture_odds_snapshots (fixture_id, bookmaker, market, is_closing, line, price_home, price_draw, price_away, price_over, price_under)
    select fixture_id, bookmaker, market, is_closing, line, ph, pd, pa, po, pu
    from prices
    where (market = '1x2' and ph > 1 and pd > 1 and pa > 1)
       or (market = 'ou25' and po > 1 and pu > 1)
       or (market = 'ah' and ph > 1 and pa > 1 and line is not null)
    on conflict do nothing;
    get diagnostics v_inserted = row_count;

    update public.pipeline_runs set finished_at = now(),
      status = case when v_unmapped is null then 'success' else 'failed' end,
      summary = jsonb_build_object('rows', v_rows, 'matched_fixtures', v_matched, 'new_prices', v_inserted)::text,
      error_message = case when v_unmapped is not null then 'unmapped club names (add team_aliases, source football-data.co.uk): ' || array_to_string(v_unmapped, ', ') end
    where run_id = v_run;
    return jsonb_build_object('rows', v_rows, 'matched_fixtures', v_matched, 'new_prices', v_inserted, 'unmapped', v_unmapped);
  exception when others then
    update public.pipeline_runs set finished_at = now(), status = 'failed', error_message = sqlerrm where run_id = v_run;
    raise warning 'capture_upcoming_odds failed: %', sqlerrm;
    return jsonb_build_object('status', 'failed', 'error', sqlerrm);
  end;
end;
$function$
;
