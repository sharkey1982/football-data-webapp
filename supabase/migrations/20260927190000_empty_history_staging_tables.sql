-- ============================================================================
-- HOUSEKEEPING: empty the history staging tables (about 40 MB).
--
-- historic_source_rows (97,634 rows) and historic_source_rows_europe (75,724
-- rows) held the downloaded source files while the 1992/93-2013/14 English,
-- 2004/05-2013/14 National League and European history loads were checked.
-- Those loads are verified and signed off. The tables are kept (empty) so the
-- scripts' `stage` commands still work if a load ever needs re-running (the
-- source files are public and re-downloaded by `stage`).
-- ============================================================================
truncate table public.historic_source_rows;
truncate table public.historic_source_rows_europe;

update public.meta_flow_nodes
   set refresh_note = 'Scratch staging for the history backfill scripts (scripts/history_backfill*.py `stage`). Emptied 27 Sep 2026 after the loads were signed off; refilled only if a load is re-run.',
       purpose_reviewed_at = now()
 where node_key in ('object:historic_source_rows', 'object:historic_source_rows_europe');
