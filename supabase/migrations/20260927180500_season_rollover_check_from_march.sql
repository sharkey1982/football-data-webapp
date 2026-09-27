-- season_rollover_ready: warn about a missing next-season row from 1 March,
-- not 1 May.
--
-- Norway, Sweden and Finland play calendar-year seasons stored under the
-- split season that starts that year (scripts/lib/footballDataCsv.ts), so
-- their 2027 results need the 2027/28 seasons row as soon as they kick off in
-- late March/April -- import-daily skips (and reports) rows for a label with no
-- seasons row. Anchored replacement on the check added by 20260927180400.

create or replace function pg_temp.anchored_replace(p_src text, p_anchor text, p_repl text, p_expect int default 1)
returns text language plpgsql as $f$
declare n int := (length(p_src) - length(replace(p_src, p_anchor, ''))) / length(p_anchor);
begin
  if n <> p_expect then raise exception 'anchor matched % time(s), expected %: %', n, p_expect, left(p_anchor, 80); end if;
  return replace(p_src, p_anchor, p_repl);
end $f$;

do $mig$
declare d text;
begin
  d := pg_get_functiondef('public.check_model_integrity()'::regprocedure);
  d := pg_temp.anchored_replace(d, 'current_date >= make_date(sr.sy + 1, 5, 1)', 'current_date >= make_date(sr.sy + 1, 3, 1)', 2);
  d := pg_temp.anchored_replace(d,
    'has no seasons row; add it before 1 July (docs/season-rollover.md).',
    'has no seasons row; add it now: the Norwegian, Swedish and Finnish seasons that start this spring are stored under it (docs/season-rollover.md).');
  d := pg_temp.anchored_replace(d, 'next season''''s row is not needed until 1 May', 'next season''''s row is not needed until 1 March');
  execute d;
end $mig$;
