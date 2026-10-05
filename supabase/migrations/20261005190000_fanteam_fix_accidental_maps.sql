-- Chris accidentally set two FanTeam players to "Not in FPL" on 5 Oct from
-- his phone (the old fix list saved on change, with no confirm step).
--   Savinho (Tottenham) is FPL's Sávio (fpl_code 510281): set that match.
--   Gabriel Slonina (Chelsea) is genuinely absent from FPL's list, but the
--   setting wasn't intended: remove it so he is back to automatic matching.
-- Only touches the rows if they are still exactly as set by mistake.
update public.fanteam_player_map
   set fpl_code = 510281, set_at = now()
 where name_key = 'savinho' and team_id = 14 and fpl_code is null;

delete from public.fanteam_player_map
 where name_key = 'gabriel slonina' and team_id = 20 and fpl_code is null;
