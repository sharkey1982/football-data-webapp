-- ============================================================================
-- get_country_league_summary(): cards per game only from matches with stats
--
-- Cards are NOT NULL in matches, so a row from a file without match stats
-- stores 0 yellow / 0 red. The function already skipped the all-seasons
-- ("/new/") files, but the European history load brought per-season files
-- without stats: 2016/17 Belgium, Greece, Netherlands, Portugal and Turkey
-- (306/240 rows each), which would have shown 0.00 yellows and 0.000 reds
-- per game on Country Insights for a comparable season. Same for England
-- before 2000/01 and a handful of single rows (e.g. awarded matches).
--
-- Fix: average cards only over rows that carry match stats (home_shots is
-- not null -- the marker docs/history-backfill.md uses; one Belgian row has
-- cards but no shots and is now left out). A league-season without stats now
-- returns null (the page shows a dash). Anchored replacement on the live
-- body; asserts the anchor matches exactly twice (yellows and reds).
-- ============================================================================

do $$
declare
  def text := pg_get_functiondef('public.get_country_league_summary()'::regprocedure);
  anchor text := $a$filter (where m.source_file not like '%/new/%')$a$;
  repl text := $r$filter (where m.source_file not like '%/new/%' and m.home_shots is not null)$r$;
  n int;
begin
  if position('m.home_shots is not null' in def) > 0 then
    raise notice 'already applied';
    return;
  end if;
  n := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
  if n <> 2 then raise exception 'anchor matched % times, expected 2', n; end if;
  execute replace(def, anchor, repl);
end $$;
