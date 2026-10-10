-- Tactical roles seeded from Fantasy Football Scout had left and right
-- swapped (10 Oct 2026). Chris: "Their images show the goal keeper at the top
-- and left and right the other way around to our images." Read as if the
-- keeper were at the bottom, every left-sided role became right-sided:
-- Gvardiol, Shaw, Robertson and Mykolenko were right-backs, Dalot a left-back,
-- Rashford a right winger.
--
-- Flips L <-> R on every role still sourced from FFS (88 of 182 rows; the
-- rest are central). Rows an admin has set (source_name = 'manual') are left
-- as they are. Not safe to re-run (it would flip them back): the migration
-- workflow applies each file once.
update public.team_player_tactical_defaults
   set tactical_role = case
         when tactical_role like 'L%' then 'R' || substr(tactical_role, 2)
         when tactical_role like 'R%' then 'L' || substr(tactical_role, 2)
       end
 where season_id = public.fpl_current_season_id()
   and source_name = 'fantasy_football_scout'
   and tactical_role in ('LB', 'RB', 'LCB', 'RCB', 'LWB', 'RWB', 'LW', 'RW', 'LM', 'RM', 'LF', 'RF');

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
values ('2026-10-10', 'data',
  'FPL: Fantasy Football Scout tactical roles had left and right swapped',
  'FFS line-up graphics put the goalkeeper at the top, so their left is the team''s right; the 14 Sep seed read them the other way (Gvardiol, Shaw, Robertson at right-back).',
  'Flipped L/R on the 88 left/right roles still sourced from FFS in team_player_tactical_defaults; admin-set roles untouched. Affects pitch placement and which players compete for a place in the depth chart (left v right centre-back etc.).',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261010150000');
