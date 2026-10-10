-- First automatic FFS read (10 Oct 2026, after the GW6 deadline) filed this
-- weekend's line-ups under GW7: the script took the next deadline rather than
-- the first unfinished gameweek. Moves them to GW6. Safe to re-run.
update public.fpl_external_lineups set fpl_event_id = 6
 where source = 'fantasy_football_scout' and season_id = public.fpl_current_season_id() and fpl_event_id = 7
   and entered_at < '2026-10-10 12:00:00+00'
   and not exists (select 1 from public.fpl_external_lineups x where x.source = 'fantasy_football_scout' and x.season_id = public.fpl_current_season_id() and x.fpl_event_id = 6);
update public.fpl_external_lineup_runs set fpl_event_id = 6
 where source = 'fantasy_football_scout' and season_id = public.fpl_current_season_id() and fpl_event_id = 7
   and fetched_at < '2026-10-10 12:00:00+00';
