-- P-04 (audit 22 Oct 2026): daily-import's backfill_match_odds() call hit the
-- API role's 8 s statement timeout (812k match_odds rows, 80k archived source
-- rows), so E0's odds step failed three days running; the odds only arrived
-- because the E1 step's global call happened to cover them.
--
-- backfill_match_odds_for(competition_code, season_label) does the same work
-- for one division-season's archived files only (E0 2026/27: ~40 ms, see
-- explain analyze in the PR). scripts/import-daily.ts calls it for the league
-- it just imported. The global backfill_match_odds() is unchanged (history
-- scripts use it).
-- Safe to re-run.

create or replace function public.backfill_match_odds_for(p_competition_code text, p_season_label text)
returns integer
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
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
$function$;
comment on function public.backfill_match_odds_for(text, text) is
  'backfill_match_odds() for one football-data.co.uk division-season''s archived files (raw_match_files competition_code + season_label). Called by scripts/import-daily.ts for the league just imported (P-04, 22 Oct 2026).';
revoke all on function public.backfill_match_odds_for(text, text) from public, anon, authenticated;
grant execute on function public.backfill_match_odds_for(text, text) to service_role;
