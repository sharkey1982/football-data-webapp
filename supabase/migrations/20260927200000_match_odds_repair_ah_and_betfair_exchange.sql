-- Odds repair (Modelling Programme design report, section 2, finding 1-3).
--
-- 1. Asian handicap rows were written with the handicap LINE in price_home
--    and the two prices in price_over / price_under; `line` was NULL on all
--    146,816 rows. Nothing read AH yet. Re-map in place: line <- price_home,
--    price_home <- price_over (home price), price_away <- price_under.
-- 2. Rows with no price at all (4,142, e.g. 2026/27 'P' rows: Pinnacle AH
--    columns no longer exist in the files, only the shared line) are deleted:
--    they carry a line but no odds.
-- 3. backfill_match_odds() writes AH correctly from now on and also reads the
--    Betfair exchange columns (BFE*, BFEC*), present from 2024/25. Pinnacle
--    1X2 columns stop in January 2026, so the exchange close becomes the
--    sharp benchmark. A one-off insert loads BFE for matches already on file
--    (the function itself only reads matches with no odds yet).
-- 4. match_odds_unique_quote duplicated the unique constraint's index
--    (103 MB) and idx_match_odds_match is a prefix of it (12 MB): dropped.
--
-- Bookmaker codes: 'PS' = Pinnacle 1X2; 'P' = Pinnacle O/U and AH (older
-- files); 'BFE' = Betfair exchange; 'Max'/'Avg' = market summaries.

update public.match_odds
set line = price_home,
    price_home = price_over,
    price_away = price_under,
    price_over = null,
    price_under = null
where market = 'ah' and line is null;

delete from public.match_odds
where market = 'ah' and price_home is null and price_away is null;

drop index if exists public.match_odds_unique_quote;
drop index if exists public.idx_match_odds_match;

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
    -- only matches with no odds yet: keeps the daily call fast
    where not exists (select 1 from public.match_odds o
                      where o.match_id = m.match_id and o.source_name = 'football-data.co.uk')
      -- only rows carrying at least one price the unpivot reads (pre-2000/01
      -- history rows have none; re-reading them every call cost ~5s)
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
      public.safe_numeric(raw_data->>(case when is_close then 'AHCh' else 'AHh' end)),
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
$function$;

-- One-off: Betfair exchange odds for matches already on file.
with resolved as (
  select r.raw_data, m.match_id
  from public.source_match_rows r
  join public.matches m
    on m.match_date = r.source_match_date
   and m.home_team_id = (select ta.team_id from public.team_aliases ta
                         where ta.source_name = 'football-data.co.uk' and ta.raw_name = r.source_home_team limit 1)
   and m.away_team_id = (select ta.team_id from public.team_aliases ta
                         where ta.source_name = 'football-data.co.uk' and ta.raw_name = r.source_away_team limit 1)
  where r.raw_data ?| array['BFEH','BFECH','BFE>2.5','BFEC>2.5','BFEAHH','BFECAHH']
),
unpivoted as (
  select match_id, '1x2' as market, is_close,
    public.safe_numeric(raw_data->>('BFE' || case when is_close then 'C' else '' end || 'H')) as price_home,
    public.safe_numeric(raw_data->>('BFE' || case when is_close then 'C' else '' end || 'D')) as price_draw,
    public.safe_numeric(raw_data->>('BFE' || case when is_close then 'C' else '' end || 'A')) as price_away,
    null::numeric as line, null::numeric as price_over, null::numeric as price_under
  from resolved cross join (values (false), (true)) c(is_close)
  union all
  select match_id, 'ou25', is_close, null, null, null, 2.5,
    public.safe_numeric(raw_data->>('BFE' || case when is_close then 'C' else '' end || '>2.5')),
    public.safe_numeric(raw_data->>('BFE' || case when is_close then 'C' else '' end || '<2.5'))
  from resolved cross join (values (false), (true)) c(is_close)
  union all
  select match_id, 'ah', is_close,
    public.safe_numeric(raw_data->>('BFE' || case when is_close then 'C' else '' end || 'AHH')),
    null,
    public.safe_numeric(raw_data->>('BFE' || case when is_close then 'C' else '' end || 'AHA')),
    public.safe_numeric(raw_data->>(case when is_close then 'AHCh' else 'AHh' end)),
    null, null
  from resolved cross join (values (false), (true)) c(is_close)
)
insert into public.match_odds (match_id, source_name, market, bookmaker, is_closing,
  price_home, price_draw, price_away, line, price_over, price_under)
select match_id, 'football-data.co.uk', market, 'BFE', is_close,
  price_home, price_draw, price_away, line, price_over, price_under
from unpivoted
where coalesce(price_home, price_away, price_over, price_under) is not null
on conflict do nothing;

-- Model Returns "best price" takes the highest price on file. Betfair
-- exchange prices are before commission and are not a bookmaker price, so
-- they stay out of the backtests (keeps every published return unchanged).
do $$
declare
  v_def text;
  v_anchor text := 'and o.market = p_market and (o.is_closing = p_closing or o.is_closing is null)';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_betting_bets';
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'get_betting_bets anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor, v_anchor || ' and o.bookmaker <> ''BFE''');
end $$;
