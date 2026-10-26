-- Live definition exported from the database (function backfill_match_odds_for(p_competition_code text, p_season_label text)).
-- Do not edit here: change it with a migration; the next export will reflect it.

CREATE OR REPLACE FUNCTION public.backfill_match_odds_for(p_competition_code text, p_season_label text)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_rows integer;
begin
  if p_competition_code is null or p_season_label is null then
    raise exception 'backfill_match_odds_for: competition code and season label are required (use backfill_match_odds() for everything)';
  end if;
  with files as (
    select rf.raw_file_id from public.raw_match_files rf
     where rf.source_name = 'football-data.co.uk'
       and rf.competition_code = p_competition_code
       and rf.season_label = p_season_label
  ),
  resolved as (
    select r.raw_data, m.match_id
    from files f
    join public.source_match_rows r on r.raw_file_id = f.raw_file_id
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
    where not exists (select 1 from public.match_odds o
                      where o.match_id = m.match_id and o.source_name = 'football-data.co.uk')
      and r.raw_data ?| array[
        'B365H','B365CH','BWH','BWCH','IWH','IWCH','PSH','PSCH','WHH','WHCH','VCH','VCCH','MaxH','MaxCH','AvgH','AvgCH','BFEH','BFECH',
        'B365>2.5','B365C>2.5','Max>2.5','MaxC>2.5','Avg>2.5','AvgC>2.5','P>2.5','PC>2.5','BFE>2.5','BFEC>2.5',
        'B365<2.5','B365C<2.5','Max<2.5','MaxC<2.5','Avg<2.5','AvgC<2.5','P<2.5','PC<2.5','BFE<2.5','BFEC<2.5',
        'B365AHH','B365CAHH','MaxAHH','MaxCAHH','AvgAHH','AvgCAHH','PAHH','PCAHH','BFEAHH','BFECAHH',
        'B365AHA','B365CAHA','MaxAHA','MaxCAHA','AvgAHA','AvgCAHA','PAHA','PCAHA','BFEAHA','BFECAHA']
  ),
  unpivoted as (
    select match_id, '1x2' as market, bm as bookmaker, is_close,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'H')) as price_home,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'D')) as price_draw,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'A')) as price_away,
      null::numeric as line, null::numeric as price_over, null::numeric as price_under
    from resolved
    cross join (values ('B365'), ('BW'), ('IW'), ('PS'), ('WH'), ('VC'), ('Max'), ('Avg'), ('BFE')) b(bm)
    cross join (values (false), (true)) c(is_close)

    union all

    select match_id, 'ou25', bm, is_close,
      null, null, null, 2.5,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || '>2.5')),
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || '<2.5'))
    from resolved
    cross join (values ('B365'), ('Max'), ('Avg'), ('P'), ('BFE')) b(bm)
    cross join (values (false), (true)) c(is_close)

    union all

    -- Asian handicap: one shared line per file (AHh opening, AHCh closing),
    -- home price in price_home, away price in price_away.
    select match_id, 'ah', bm, is_close,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'AHH')),
      null,
      public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'AHA')),
      coalesce(public.safe_numeric(raw_data->>(case when is_close then 'AHCh' else 'AHh' end)), public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'AH'))),
      null, null
    from resolved
    cross join (values ('B365'), ('Max'), ('Avg'), ('P'), ('BFE')) b(bm)
    cross join (values (false), (true)) c(is_close)
  )
  insert into public.match_odds (
    match_id, source_name, market, bookmaker, is_closing,
    price_home, price_draw, price_away, line, price_over, price_under
  )
  select match_id, 'football-data.co.uk', market, bookmaker, is_close,
    price_home, price_draw, price_away, line, price_over, price_under
  from unpivoted
  where coalesce(price_home, price_away, price_over, price_under) is not null
  on conflict do nothing;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$function$
;
