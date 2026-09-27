-- ============================================================================
-- check_model_integrity: warn when a split-format league reaches its split
-- without a league_season_formats row.
--
-- league_standings only separates regular season, groups and play-off ties
-- for league-seasons with a 'split' row, and each new season needs its own
-- row (formats change: Austria stops halving points from 2026/27, Belgium
-- has 18 clubs in 2026/27). Without one the season is ranked on total
-- points, as before this change. The check fires once some pair of clubs has
-- met more often than the league's last split row allows before its split,
-- i.e. when the split has started. Warning, not failure. Anchored edit of the
-- live definition; the anchor must match exactly once.
-- ============================================================================

do $do$
declare
  def text := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  anchor text := $a$  union all
  -- Catalogue (2026-09-26): every live, non-scratch object has a description,$a$;
begin
  if (length(def) - length(replace(def, anchor, ''))) / length(anchor) <> 1 then
    raise exception 'anchor not unique';
  end if;
  def := replace(def, anchor, $r$  union all
  -- Split formats (2026-09-27): league_standings needs a league_season_formats
  -- row for every split-format season; warn once a season is past its split
  -- without one.
  select 'split_formats_configured', case when n = 0 then 'ok' else 'warning' end, n,
    'League-seasons past their split with no league_season_formats row (ranked on total points): ' || coalesce(names, '')
  from (select count(*) n, string_agg(ls, ', ' order by ls) names from (
          select distinct l.code || ' ' || se.label ls
          from public.matches m
          join public.seasons se on se.season_id = m.season_id
          join public.leagues l on l.league_id = m.league_id
          join lateral (select f.regular_meetings from public.league_season_formats f
                        join public.seasons fs on fs.season_id = f.season_id
                        where f.league_id = m.league_id and f.format = 'split' and fs.start_year < se.start_year
                        order by fs.start_year desc limit 1) prev on true
          where m.league_id in (select f.league_id from public.league_season_formats f where f.format = 'split')
            and not exists (select 1 from public.league_season_formats f2
                            where f2.league_id = m.league_id and f2.season_id = m.season_id)
          group by l.code, se.label, least(m.home_team_id, m.away_team_id), greatest(m.home_team_id, m.away_team_id), prev.regular_meetings
          having count(*) > prev.regular_meetings) q) x
  union all
  -- Catalogue (2026-09-26): every live, non-scratch object has a description,$r$);
  execute def;
end $do$;
