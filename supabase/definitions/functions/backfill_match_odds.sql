-- Live definition exported from the database (function backfill_match_odds()).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.backfill_match_odds()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rows integer;
begin
  with resolved as (
    select r.raw_data, m.match_id
    from public.source_match_rows r
    join public.matches m
      on m.match_date = r.source_match_date
     and m.home_team_id = (
       select ta.team_id from public.team_aliases ta
       where ta.source_name = 'football-data.co.uk' and ta.raw_name = r.source_home_team limit 1
     )
     and m.away_team_id = (
       select ta.team_id from public.team_aliases ta
       where ta.source_name = 'football-data.co.uk' and ta.raw_name = r.source_away_team limit 1
     )
  ),
  unpivoted as (
    select match_id, '1x2' as market, bm as bookmaker, is_close,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'H')) as price_home,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'D')) as price_draw,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'A')) as price_away,
      null::numeric as line, null::numeric as price_over, null::numeric as price_under
    from resolved
    cross join (values ('B365'), ('BW'), ('IW'), ('PS'), ('WH'), ('VC'), ('Max'), ('Avg')) b(bm)
    cross join (values (false), (true)) c(is_close)

    union all

    select match_id, 'ou25', bm, is_close,
      null, null, null, 2.5,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || '>2.5')),
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || '<2.5'))
    from resolved
    cross join (values ('B365'), ('Max'), ('Avg'), ('P')) b(bm)
    cross join (values (false), (true)) c(is_close)

    union all

    select match_id, 'ah', bm, is_close,
      public.safe_numeric(raw_data->>(case when is_close then 'AHCh' else 'AHh' end)),
      null, null, null,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'AHH')),
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'AHA'))
    from resolved
    cross join (values ('B365'), ('Max'), ('Avg'), ('P')) b(bm)
    cross join (values (false), (true)) c(is_close)
  )
  insert into public.match_odds (
    match_id, source_name, market, bookmaker, is_closing,
    price_home, price_draw, price_away, line, price_over, price_under
  )
  select match_id, 'football-data.co.uk', market, bookmaker, is_close,
    price_home, price_draw, price_away,
    case when market = 'ah' then line when market = 'ou25' then 2.5 end,
    price_over, price_under
  from unpivoted
  where coalesce(price_home, price_over, price_under) is not null
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$
;
