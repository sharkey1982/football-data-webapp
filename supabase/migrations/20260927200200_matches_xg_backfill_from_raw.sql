-- football-data.co.uk has carried match xG (HxG/AxG) for E0-E3 since
-- 2026/27, but the daily importer never mapped it: only 219 of 312 English
-- 2026/27 matches had xG (loaded by an earlier path before 12 Sep). The
-- importer now maps it (scripts/import-daily.ts); this fills the gaps from
-- the archived raw rows. Only NULLs are filled; nothing existing changes.
with raw as (
  select distinct on (m.match_id) m.match_id,
    public.safe_numeric(r.raw_data->>'HxG') as hxg,
    public.safe_numeric(r.raw_data->>'AxG') as axg
  from public.source_match_rows r
  join public.matches m
    on m.match_date = r.source_match_date
   and m.home_team_id = (select ta.team_id from public.team_aliases ta
                         where ta.source_name = 'football-data.co.uk' and ta.raw_name = r.source_home_team limit 1)
   and m.away_team_id = (select ta.team_id from public.team_aliases ta
                         where ta.source_name = 'football-data.co.uk' and ta.raw_name = r.source_away_team limit 1)
  where r.raw_data ? 'HxG' and coalesce(r.raw_data->>'HxG', '') <> ''
  order by m.match_id, r.source_match_row_id desc
)
update public.matches m
set home_xg = raw.hxg, away_xg = raw.axg
from raw
where m.match_id = raw.match_id and m.home_xg is null and raw.hxg is not null;
