-- GW7 Sunday line-ups from Chris's BBC screenshots (18 Oct 2026): Bournemouth
-- v Sunderland (61), Brighton v Crystal Palace (63), Leeds v Man Utd (66),
-- Nott'm Forest v Arsenal (69). Keeper at the TOP: the left of the image is
-- the team's right. 87 starters, all matching FPL's record of who started.
-- Sunderland's striker Tutierov (#57) has no FPL record, so he is left out
-- (FPL lists 10 Sunderland starters). Positions seen go in only as "also
-- plays", rank 2; no main position or rank changed (CM/DM pivot swaps not
-- added). Forest v Arsenal: both full substitution lists were visible, 8 subs,
-- checked against FPL minutes; the other sides showed no subs. Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (66, 36, 385, 'GK', 'Trafford'),
    (66, 36, 332, 'RCB', 'Justin'),
    (66, 36, 598, 'CB', 'Elvedi'),
    (66, 36, 334, 'LCB', 'Muharemovic'),
    (66, 36, 330, 'RWB', 'Bogle'),
    (66, 36, 338, 'CM', 'Ampadu'),
    (66, 36, 345, 'CM', 'Tanaka'),
    (66, 36, 331, 'LWB', 'Gudmundsson'),
    (66, 36, 335, 'RW', 'Stach'),
    (66, 36, 336, 'LW', 'Okafor'),
    (66, 36, 346, 'CF', 'Calvert-Lewin'),
    (66, 5, 412, 'GK', 'Lammens'),
    (66, 5, 420, 'RB', 'Yoro'),
    (66, 5, 418, 'RCB', 'Maguire'),
    (66, 5, 419, 'LCB', 'Martinez'),
    (66, 5, 417, 'LB', 'Diogo Dalot'),
    (66, 5, 162, 'DM', 'Andrey Santos'),
    (66, 5, 131, 'DM', 'Baleba'),
    (66, 5, 426, 'RW', 'Bruno Fernandes'),
    (66, 5, 43, 'AM', 'Tielemans'),
    (66, 5, 431, 'LW', 'Diallo'),
    (66, 5, 427, 'CF', 'Mbeumo'),
    (63, 25, 109, 'GK', 'Verbruggen'),
    (63, 25, 113, 'RB', 'Kadioglu'),
    (63, 25, 504, 'RCB', 'Vuskovic'),
    (63, 25, 116, 'LCB', 'Dunk'),
    (63, 25, 114, 'LB', 'Boscagli'),
    (63, 25, 124, 'DM', 'Gross'),
    (63, 25, 639, 'DM', 'Chema Andres'),
    (63, 25, 127, 'RW', 'Gomez'),
    (63, 25, 129, 'AM', 'Ayari'),
    (63, 25, 115, 'LW', 'De Cuyper'),
    (63, 25, 138, 'CF', 'Kostoulas'),
    (63, 2, 199, 'GK', 'Benitez'),
    (63, 2, 203, 'RCB', 'Canvot'),
    (63, 2, 202, 'CB', 'Richards'),
    (63, 2, 633, 'LCB', 'Ahanor'),
    (63, 2, 588, 'RWB', 'Khalaili'),
    (63, 2, 210, 'CM', 'Wharton'),
    (63, 2, 644, 'CM', 'Timber'),
    (63, 2, 204, 'LWB', 'Mitchell'),
    (63, 2, 214, 'RW', 'Kamada'),
    (63, 2, 211, 'LW', 'Pino'),
    (63, 2, 222, 'CF', 'Strand Larsen'),
    (61, 30, 57, 'GK', 'Petrovic'),
    (61, 30, 64, 'RB', 'Smith'),
    (61, 30, 60, 'RCB', 'Hill'),
    (61, 30, 566, 'LCB', 'Antonio Silva'),
    (61, 30, 61, 'LB', 'Truffert'),
    (61, 30, 73, 'DM', 'Adams'),
    (61, 30, 75, 'DM', 'Christie'),
    (61, 30, 67, 'RW', 'Rayan'),
    (61, 30, 71, 'AM', 'Cook'),
    (61, 30, 68, 'LW', 'Tavernier'),
    (61, 30, 79, 'CF', 'Evanilson'),
    (61, 12, 529, 'GK', 'Roefs'),
    (61, 12, 533, 'RB', 'Mukiele'),
    (61, 12, 501, 'RCB', 'Danso'),
    (61, 12, 535, 'LCB', 'Alderete'),
    (61, 12, 536, 'LB', 'Reinildo Mandava'),
    (61, 12, 544, 'DM', 'Xhaka'),
    (61, 12, 545, 'DM', 'Sadiki'),
    (61, 12, 534, 'RW', 'Hume'),
    (61, 12, 542, 'AM', 'Le Fee'),
    (61, 12, 548, 'LW', 'Rigg'),
    (69, 37, 467, 'GK', 'Sels'),
    (69, 37, 474, 'RCB', 'Jair Cunha'),
    (69, 37, 581, 'CB', 'Diomande'),
    (69, 37, 472, 'LCB', 'Murillo'),
    (69, 37, 201, 'RWB', 'Munoz'),
    (69, 37, 486, 'CM', 'McAtee'),
    (69, 37, 558, 'CM', 'Schlager'),
    (69, 37, 469, 'LWB', 'Williams'),
    (69, 37, 487, 'RW', 'Dominguez'),
    (69, 37, 483, 'LW', 'Ndoye'),
    (69, 37, 167, 'CF', 'Delap'),
    (69, 1, 1, 'GK', 'Raya'),
    (69, 1, 10, 'RB', 'White'),
    (69, 1, 31, 'RCB', 'Konsa'),
    (69, 1, 4, 'LCB', 'Gabriel Magalhaes'),
    (69, 1, 8, 'LB', 'Calafiori'),
    (69, 1, 13, 'DM', 'Rice'),
    (69, 1, 452, 'DM', 'Bruno Guimaraes'),
    (69, 1, 12, 'RW', 'Saka'),
    (69, 1, 15, 'AM', 'Odegaard'),
    (69, 1, 14, 'LW', 'Eze'),
    (69, 1, 26, 'CF', 'Havertz')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (66, 36, '3-4-2-1'), (66, 5, '4-2-3-1'), (63, 25, '4-2-3-1'), (63, 2, '3-4-2-1'), (61, 30, '4-2-3-1'), (61, 12, '4-2-3-1'), (69, 37, '3-4-2-1'), (69, 1, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

-- Positions seen that differ from each player's main one.
insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, 2
  from (values
    (5, 417, 'LB'),   -- Diogo Dalot (listed RB)
    (5, 162, 'DM'),   -- Andrey Santos (listed MID)
    (5, 131, 'DM'),   -- Baleba (listed MID)
    (5, 426, 'RW'),   -- Bruno Fernandes (listed AM)
    (5, 43, 'AM'),   -- Tielemans (listed DM)
    (5, 431, 'LW'),   -- Diallo (listed RW)
    (2, 203, 'RCB'),   -- Canvot (listed LCB)
    (2, 202, 'CB'),   -- Richards (listed RCB)
    (2, 633, 'LCB'),   -- Ahanor (listed DEF)
    (30, 71, 'AM'),   -- Cook (listed CM)
    (12, 535, 'LCB'),   -- Alderete (listed DEF)
    (12, 534, 'RW'),   -- Hume (listed RB)
    (12, 548, 'LW'),   -- Rigg (listed MID)
    (37, 487, 'RW')   -- Dominguez (listed MID)
  ) as v(team_id, fpl_player_id, role)
on conflict do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
select v.*, 'bbc_screenshot'
  from (values
    (69, 1, 10, 5, 66, 'White', 'Timber'),
    (69, 1, 452, 17, 66, 'Bruno Guimaraes', 'Merino'),
    (69, 1, 14, 16, 46, 'Eze', 'Madueke'),
    (69, 1, 26, 25, 66, 'Havertz', 'Gyokeres'),
    (69, 37, 474, 490, 85, 'Jair Cunha', 'Wood'),
    (69, 37, 486, 482, 85, 'McAtee', 'Hudson-Odoi'),
    (69, 37, 483, 493, 73, 'Ndoye', 'Kalimuendo'),
    (69, 37, 487, 488, 74, 'Dominguez', 'Sangare')
  ) as v(fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on)
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
select v.fixture_id, v.team_id, 'bbc_screenshot', v.complete
  from (values (66, 36, false), (66, 5, false), (63, 25, false), (63, 2, false), (61, 30, false), (61, 12, false), (69, 37, true), (69, 1, true)) as v(fixture_id, team_id, complete)
on conflict do nothing;
