-- Bookmaker odds stopped at 6 Sep 2026 (Premier League) because nothing
-- wrote new raw rows: source_match_rows was loaded once by the
-- backfill-football-raw edge function on 11 Sep, and backfill_match_odds()
-- had no caller. scripts/import-daily.ts now archives new raw rows and calls
-- backfill_match_odds() on every daily run (daily-import.yml).
--
-- That call goes through PostgREST, where statements time out after 8s. A
-- full pass took 47s (every raw row re-offered its quotes to the ON
-- CONFLICT check), so the function now skips matches that already have
-- football-data.co.uk odds. All markets for a match come from the same raw
-- row and are inserted together, so no partial sets are left behind. The
-- unique key (match_id, source_name, market, bookmaker, is_closing) is
-- unchanged and still guards against duplicates.
--
-- Backfill of the gap: the 2026/27 E0-EC files were re-archived on 26 Sep
-- 2026 by invoking backfill-football-raw with {"seasons":["2627"]}
-- (raw_match_files 191-195: 50/95/83/84/108 rows, matching the matches
-- table), then backfill_match_odds() below fills match_odds. Idempotent.

do $mig$
declare
  v_def text := pg_get_functiondef('public.backfill_match_odds()'::regprocedure);
  v_anchor constant text := E'\n  ),\n  unpivoted as (';
  v_new constant text := E'\n    -- only matches with no odds yet: keeps the daily call fast\n'
    || E'    where not exists (select 1 from public.match_odds o\n'
    || E'                      where o.match_id = m.match_id and o.source_name = \'football-data.co.uk\')\n  ),\n  unpivoted as (';
  v_n int;
begin
  if position('only matches with no odds yet' in v_def) > 0 then
    raise notice 'backfill_match_odds already incremental';
  else
    v_n := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    if v_n <> 1 then raise exception 'anchor matched % times, expected 1', v_n; end if;
    execute replace(v_def, v_anchor, v_new);
  end if;
end
$mig$;

select public.backfill_match_odds();
