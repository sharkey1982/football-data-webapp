-- ============================================================================
-- Bookmaker odds for the 1993/94-2013/14 history load
--
-- scripts/history_backfill.py archives every football-data.co.uk row in
-- source_match_rows and then calls backfill_match_odds(), but that call hit
-- the API's statement timeout (the function scans every archived row), so
-- it is run here with a longer timeout. Insert-only on match_odds' natural
-- key; re-running adds nothing. Dry run: 128,796 rows for 27,796 matches,
-- all in seasons before 2014/15.
--
-- backfill_match_odds() resolves names through team_aliases, which maps
-- "Halifax" and "Chester" to the current clubs (FC Halifax Town, Chester
-- FC). The old clubs' matches (Halifax Town 2000/01-2001/02, Chester City
-- 2004/05-2008/09, the seasons with odds) are resolved separately below
-- with the same era rule as ERA_OVERRIDES in scripts/history_backfill.py,
-- and the same unpivot as backfill_match_odds().
-- ============================================================================

set statement_timeout = '15min';

select public.backfill_match_odds();

with ov(raw_name, last_year, slug) as (values ('Halifax', 2007, 'halifax-town'), ('Chester', 2009, 'chester-city')),
rows_ as (
  select r.raw_data, r.source_match_date, r.source_home_team, r.source_away_team,
         (1900 + substr(f.season_label, 1, 2)::int + case when substr(f.season_label, 1, 2)::int < 50 then 100 else 0 end) as start_year
  from public.source_match_rows r
  join public.raw_match_files f on f.raw_file_id = r.raw_file_id
  where f.source_name = 'football-data.co.uk' and f.competition_code in ('E0', 'E1', 'E2', 'E3')
    and (r.source_home_team in ('Halifax', 'Chester') or r.source_away_team in ('Halifax', 'Chester'))
),
resolved as (
  select r.raw_data, m.match_id
  from rows_ r
  left join ov oh on oh.raw_name = r.source_home_team and r.start_year <= oh.last_year
  left join public.teams th on th.slug = oh.slug
  left join ov oa on oa.raw_name = r.source_away_team and r.start_year <= oa.last_year
  left join public.teams ta on ta.slug = oa.slug
  join public.matches m
    on m.match_date = r.source_match_date
   and m.home_team_id = coalesce(th.team_id, (select a.team_id from public.team_aliases a where a.source_name = 'football-data.co.uk' and a.raw_name = r.source_home_team))
   and m.away_team_id = coalesce(ta.team_id, (select a.team_id from public.team_aliases a where a.source_name = 'football-data.co.uk' and a.raw_name = r.source_away_team))
  where r.start_year <= 2013 and (th.team_id is not null or ta.team_id is not null)
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
  select match_id, 'ou25', bm, is_close, null, null, null, 2.5,
    public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || '>2.5')),
    public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || '<2.5'))
  from resolved
  cross join (values ('B365'), ('Max'), ('Avg'), ('P')) b(bm)
  cross join (values (false), (true)) c(is_close)
  union all
  select match_id, 'ah', bm, is_close,
    public.safe_numeric(raw_data->>(case when is_close then 'AHCh' else 'AHh' end)), null, null, null,
    public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'AHH')),
    public.safe_numeric(raw_data->>(bm || case when is_close then 'C' else '' end || 'AHA'))
  from resolved
  cross join (values ('B365'), ('Max'), ('Avg'), ('P')) b(bm)
  cross join (values (false), (true)) c(is_close)
)
insert into public.match_odds (match_id, source_name, market, bookmaker, is_closing,
  price_home, price_draw, price_away, line, price_over, price_under)
select match_id, 'football-data.co.uk', market, bookmaker, is_close, price_home, price_draw, price_away,
  case when market = 'ah' then line when market = 'ou25' then 2.5 end, price_over, price_under
from unpivoted
where coalesce(price_home, price_over, price_under) is not null
on conflict do nothing;

reset statement_timeout;
