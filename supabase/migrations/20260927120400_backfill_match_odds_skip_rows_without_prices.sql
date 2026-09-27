-- ============================================================================
-- backfill_match_odds(): skip archived rows that carry no bookmaker prices
--
-- The history load archived ~42,700 more football-data.co.uk rows in
-- source_match_rows. About 13,800 of them (1993/94-1999/00, before the files
-- had odds) resolve to matches with no odds, so every call re-unpivoted them
-- for nothing: the call went from ~3s to ~6.5s, against the API's 8s
-- statement timeout -- and import-daily.ts calls it once per division every
-- morning. (The history importer's own call already hit that timeout.)
--
-- Fix: in the `resolved` CTE, also require the raw row to have at least one
-- of the keys the unpivot reads. Rows with prices are unaffected, so the
-- output is identical; only price-less rows are skipped.
-- Anchored replacement on the live body (the exported definition in
-- supabase/definitions is older than the live one); asserts one match.
-- ============================================================================

do $$
declare
  def text := pg_get_functiondef('public.backfill_match_odds()'::regprocedure);
  anchor text := E'where o.match_id = m.match_id and o.source_name = ''football-data.co.uk'')\n  ),';
  addition text := E'where o.match_id = m.match_id and o.source_name = ''football-data.co.uk'')\n'
    || E'      -- only rows carrying at least one price the unpivot reads (pre-2000/01\n'
    || E'      -- history rows have none; re-reading them every call cost ~5s)\n'
    || E'      and r.raw_data ?| array[\n'
    || E'        ''B365H'',''B365CH'',''BWH'',''BWCH'',''IWH'',''IWCH'',''PSH'',''PSCH'',''WHH'',''WHCH'',''VCH'',''VCCH'',''MaxH'',''MaxCH'',''AvgH'',''AvgCH'',\n'
    || E'        ''B365>2.5'',''B365C>2.5'',''Max>2.5'',''MaxC>2.5'',''Avg>2.5'',''AvgC>2.5'',''P>2.5'',''PC>2.5'',\n'
    || E'        ''B365<2.5'',''B365C<2.5'',''Max<2.5'',''MaxC<2.5'',''Avg<2.5'',''AvgC<2.5'',''P<2.5'',''PC<2.5'',\n'
    || E'        ''AHh'',''AHCh'',''B365AHH'',''B365CAHH'',''MaxAHH'',''MaxCAHH'',''AvgAHH'',''AvgCAHH'',''PAHH'',''PCAHH'',\n'
    || E'        ''B365AHA'',''B365CAHA'',''MaxAHA'',''MaxCAHA'',''AvgAHA'',''AvgCAHA'',''PAHA'',''PCAHA'']\n'
    || E'  ),';
  n int;
begin
  if position('only rows carrying at least one price' in def) > 0 then
    raise notice 'already applied';
    return;
  end if;
  n := (length(def) - length(replace(def, anchor, ''))) / length(anchor);
  if n <> 1 then
    raise exception 'anchor matched % times, expected 1', n;
  end if;
  execute replace(def, anchor, addition);
end $$;

-- Catalogue (after select public.meta_refresh_flow()).
update public.meta_flow_nodes set
  purpose = replace(purpose,
    'which keeps a run to about a second.',
    'and only archived rows carrying at least one of the price keys it reads (pre-2000/01 rows from the history load have none), which keeps a run to about 2.5 seconds against the API''s 8-second statement timeout.'),
  purpose_reviewed_at = now()
where node_key = 'function:backfill_match_odds()';
