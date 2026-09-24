-- Drops the four pre-key-change backups taken before fpl_players moved to a
-- composite (fpl_player_id, season_id) primary key (2026-09-19).
--
-- Verified before dropping (2026-09-24):
-- - private.refresh_fpl()'s ON CONFLICT (fpl_player_id, season_id) matches
--   the table's actual primary key -- they agree.
-- - The 6-hourly refresh cron (fpl-refresh-6-hourly) failed twice right at
--   the change (2026-09-19 18:17, 2026-09-20 00:17), both the same "no
--   unique or exclusion constraint matching ON CONFLICT" error -- the
--   function and the constraint were briefly out of step during the
--   migration itself. 15 consecutive clean runs since (2026-09-20 06:17 to
--   2026-09-24 00:17, 4 days), and fpl_players has zero duplicate
--   fpl_player_ids today.
-- - Every live table is at or above its backup's row count (players 667 vs
--   662, snapshots 7949 vs 4614, gameweeks 3216 vs 3211, availability
--   events 658 vs 658) -- no sign of anything lost.
drop table if exists public.backup_fpl_players_20260919;
drop table if exists public.backup_fpl_player_snapshots_20260919;
drop table if exists public.backup_fpl_player_gameweeks_20260919;
drop table if exists public.backup_player_availability_events_20260919;
