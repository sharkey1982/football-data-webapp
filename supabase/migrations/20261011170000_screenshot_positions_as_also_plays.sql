-- Screenshot positions go in as second positions, not replacements
-- (11 Oct 2026). Chris: "Some of these players play in at least a couple
-- of positions - rather than changing their positions because of the
-- screenshots you should be updating their 2nd positions."
--
-- The earlier screenshot migrations replaced five players' main positions
-- with the one seen on the day. Put each main position back as it was and
-- record the position seen as "also plays" instead:
--   Justin (Leeds)       LCB, also RCB   -- was changed to RCB
--   Muharemovic (Leeds)  CB,  also LCB   -- was changed to LCB
--   Acheampong (Chelsea) LCB, also RCB   -- was changed to RCB
--   Mendy (Hull)         LW,  also LCB   -- was changed to LCB
--   O'Reilly (Man City)  CM,  also LB    -- was changed to LB
-- Players who only had a generic DEF/MID label keep the position they were
-- seen in (there was no main position to replace). Safe to re-run: each
-- update only touches the row while it still holds the screenshot value.

update public.team_player_tactical_defaults d
   set tactical_role = c.old_role, source_name = 'fantasy_football_scout', updated_at = now()
  from (values
    (36, 332, 'RCB', 'LCB'),   -- Justin
    (36, 334, 'LCB', 'CB'),    -- Muharemovic
    (20, 151, 'RCB', 'LCB'),   -- Acheampong
    (8,  586, 'LCB', 'LW'),    -- Mendy
    (18, 387, 'LB',  'CM')     -- O'Reilly
  ) as c(team_id, fpl_player_id, screenshot_role, old_role)
 where d.season_id = public.fpl_current_season_id()
   and d.team_id = c.team_id and d.fpl_player_id = c.fpl_player_id
   and d.tactical_role = c.screenshot_role and d.source_name = 'bbc_screenshot';

-- Rank in the second position: 1 where he has been the regular starter
-- there (Justin, Muharemovic, Mendy), otherwise 2.
insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, v.rank
  from (values
    (36, 332, 'RCB', 1),
    (36, 334, 'LCB', 1),
    (20, 151, 'RCB', 2),
    (8,  586, 'LCB', 1),
    (18, 387, 'LB',  2)
  ) as v(team_id, fpl_player_id, role, rank)
on conflict do nothing;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
select '2026-10-11', 'data',
  'FPL: positions seen in screenshots recorded as second positions, not replacements',
  'Chris: players often play a couple of positions; a screenshot should add a second position rather than change the main one.',
  'Restored the main position of Justin, Muharemovic, Acheampong, Mendy and O''Reilly and added the position seen as "also plays".',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261011170000'
where not exists (select 1 from public.model_change_log where reference = 'migration 20261011170000');
