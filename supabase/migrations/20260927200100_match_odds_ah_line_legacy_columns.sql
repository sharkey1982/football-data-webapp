-- 2003/04-2004/05 files give each bookmaker's own Asian handicap line
-- (e.g. B365AH) instead of the shared AHh column; 3,196 AH rows had no line.
-- Fill them from the raw rows and teach backfill_match_odds() the fallback.
update public.match_odds o
set line = public.safe_numeric(r.raw_data->>(o.bookmaker || 'AH'))
from public.matches m, public.source_match_rows r
where o.market = 'ah' and o.line is null and not o.is_closing
  and m.match_id = o.match_id
  and r.source_match_date = m.match_date
  and m.home_team_id = (select ta.team_id from public.team_aliases ta
                        where ta.source_name = 'football-data.co.uk' and ta.raw_name = r.source_home_team limit 1)
  and m.away_team_id = (select ta.team_id from public.team_aliases ta
                        where ta.source_name = 'football-data.co.uk' and ta.raw_name = r.source_away_team limit 1)
  and r.raw_data ? (o.bookmaker || 'AH');

do $$
declare
  v_def text;
  v_anchor text := 'public.safe_numeric(raw_data->>(case when is_close then ''AHCh'' else ''AHh'' end))';
begin
  select pg_get_functiondef('public.backfill_match_odds'::regproc) into v_def;
  if (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor) <> 1 then
    raise exception 'backfill_match_odds AH line anchor not found exactly once';
  end if;
  execute replace(v_def, v_anchor,
    'coalesce(' || v_anchor || ', public.safe_numeric(raw_data->>(bm || case when is_close then ''C'' else '''' end || ''AH'')))');
end $$;
