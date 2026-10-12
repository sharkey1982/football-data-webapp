-- GW5 line-ups from Chris's BBC screenshots (12 Oct 2026): the eight GW5
-- matches not yet recorded (41 Bournemouth v Liverpool and 46 Leeds v Crystal
-- Palace were done on 10 Oct), so GW5 is now complete. Keeper at the TOP: the
-- left of the image is the team's right. All 176 starters checked against
-- FPL's own record of who started (all matched). Positions seen go in only as
-- "also plays", rank 2; no main position or rank is changed. Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (42, 20, 28, 'GK', 'Martinez'),
    (42, 20, 145, 'RCB', 'Fofana'),
    (42, 20, 200, 'CB', 'Lacroix'),
    (42, 20, 149, 'LCB', 'Colwill'),
    (42, 20, 156, 'RWB', 'Pedro Neto'),
    (42, 20, 101, 'CM', 'Henderson'),
    (42, 20, 568, 'CM', 'Barco'),
    (42, 20, 583, 'LWB', 'Chavarria'),
    (42, 20, 154, 'RW', 'Palmer'),
    (42, 20, 40, 'LW', 'Rogers'),
    (42, 20, 136, 'CF', 'Welbeck'),
    (42, 23, 82, 'GK', 'Kelleher'),
    (42, 23, 88, 'RB', 'Kayode'),
    (42, 23, 93, 'RCB', 'Schuster'),
    (42, 23, 87, 'LCB', 'Ajer'),
    (42, 23, 86, 'LB', 'Lewis-Potter'),
    (42, 23, 102, 'DM', 'Yarmoliuk'),
    (42, 23, 98, 'DM', 'Janelt'),
    (42, 23, 105, 'RW', 'Anthony'),
    (42, 23, 96, 'AM', 'Damsgaard'),
    (42, 23, 94, 'LW', 'Schade'),
    (42, 23, 106, 'CF', 'Igor Thiago'),
    (43, 25, 109, 'GK', 'Verbruggen'),
    (43, 25, 113, 'RB', 'Kadioglu'),
    (43, 25, 504, 'RCB', 'Vuskovic'),
    (43, 25, 328, 'LCB', 'Struijk'),
    (43, 25, 114, 'LB', 'Boscagli'),
    (43, 25, 639, 'DM', 'Chema Andres'),
    (43, 25, 124, 'DM', 'Gross'),
    (43, 25, 127, 'RW', 'Gomez'),
    (43, 25, 129, 'AM', 'Ayari'),
    (43, 25, 115, 'LW', 'De Cuyper'),
    (43, 25, 138, 'CF', 'Kostoulas'),
    (43, 1, 1, 'GK', 'Raya'),
    (43, 1, 5, 'RB', 'Timber'),
    (43, 1, 31, 'RCB', 'Konsa'),
    (43, 1, 4, 'LCB', 'Gabriel Magalhaes'),
    (43, 1, 8, 'LB', 'Calafiori'),
    (43, 1, 13, 'DM', 'Rice'),
    (43, 1, 452, 'DM', 'Bruno Guimaraes'),
    (43, 1, 12, 'RW', 'Saka'),
    (43, 1, 15, 'AM', 'Odegaard'),
    (43, 1, 557, 'LW', 'Tzolis'),
    (43, 1, 26, 'CF', 'Havertz'),
    (44, 4, 226, 'GK', 'Pickford'),
    (44, 4, 649, 'RB', 'Maitland-Niles'),
    (44, 4, 229, 'RCB', 'Tarkowski'),
    (44, 4, 230, 'LCB', 'Branthwaite'),
    (44, 4, 233, 'LB', 'Mykolenko'),
    (44, 4, 244, 'DM', 'Armstrong'),
    (44, 4, 239, 'DM', 'Garner'),
    (44, 4, 209, 'RW', 'Johnson'),
    (44, 4, 236, 'AM', 'Dewsbury-Hall'),
    (44, 4, 238, 'LW', 'Grealish'),
    (44, 4, 249, 'CF', 'Barry'),
    (44, 31, 300, 'GK', 'Walton'),
    (44, 31, 592, 'RB', 'Ouattara'),
    (44, 31, 259, 'RCB', 'Diop'),
    (44, 31, 304, 'LCB', 'O''Shea'),
    (44, 31, 305, 'LB', 'Davis'),
    (44, 31, 267, 'DM', 'Lukic'),
    (44, 31, 619, 'DM', 'Palacios'),
    (44, 31, 315, 'RW', 'Abdul Fatawu'),
    (44, 31, 591, 'AM', 'Enciso'),
    (44, 31, 313, 'LW', 'Clarke'),
    (44, 31, 316, 'CF', 'Emersonn'),
    (45, 32, 250, 'GK', 'Leno'),
    (45, 32, 258, 'RB', 'Castagne'),
    (45, 32, 650, 'RCB', 'Affengruber'),
    (45, 32, 257, 'LCB', 'Bassey'),
    (45, 32, 254, 'LB', 'Robinson'),
    (45, 32, 265, 'DM', 'Berge'),
    (45, 32, 580, 'DM', 'Charles'),
    (45, 32, 264, 'RW', 'Bobb'),
    (45, 32, 268, 'AM', 'King'),
    (45, 32, 261, 'LW', 'Iwobi'),
    (45, 32, 569, 'CF', 'Garcia'),
    (45, 5, 412, 'GK', 'Lammens'),
    (45, 5, 417, 'RB', 'Diogo Dalot'),
    (45, 5, 418, 'RCB', 'Maguire'),
    (45, 5, 419, 'LCB', 'Martinez'),
    (45, 5, 423, 'LB', 'Shaw'),
    (45, 5, 432, 'DM', 'Mainoo'),
    (45, 5, 43, 'DM', 'Tielemans'),
    (45, 5, 427, 'RW', 'Mbeumo'),
    (45, 5, 426, 'AM', 'Bruno Fernandes'),
    (45, 5, 429, 'LW', 'Rashford'),
    (45, 5, 428, 'CF', 'Matheus Cunha'),
    (47, 18, 384, 'GK', 'Donnarumma'),
    (47, 18, 389, 'RB', 'Matheus Nunes'),
    (47, 18, 390, 'RCB', 'Ruben Dias'),
    (47, 18, 388, 'LCB', 'Guehi'),
    (47, 18, 391, 'LB', 'Gvardiol'),
    (47, 18, 155, 'DM', 'Fernandez'),
    (47, 18, 481, 'DM', 'Anderson'),
    (47, 18, 237, 'RW', 'Ndiaye'),
    (47, 18, 399, 'AM', 'Cherki'),
    (47, 18, 397, 'LW', 'Semenyo'),
    (47, 18, 411, 'CF', 'Haaland'),
    (47, 12, 529, 'GK', 'Roefs'),
    (47, 12, 533, 'RB', 'Mukiele'),
    (47, 12, 501, 'RCB', 'Danso'),
    (47, 12, 532, 'LCB', 'Ballard'),
    (47, 12, 612, 'LB', 'Methalie'),
    (47, 12, 544, 'DM', 'Xhaka'),
    (47, 12, 545, 'DM', 'Sadiki'),
    (47, 12, 541, 'RW', 'Meunier'),
    (47, 12, 542, 'AM', 'Le Fee'),
    (47, 12, 551, 'LW', 'Angulo'),
    (47, 12, 552, 'CF', 'Brobbey'),
    (48, 17, 567, 'GK', 'Hornicek'),
    (48, 17, 459, 'RB', 'Miley'),
    (48, 17, 445, 'RCB', 'Thiaw'),
    (48, 17, 447, 'LCB', 'Botman'),
    (48, 17, 449, 'LB', 'Hall'),
    (48, 17, 462, 'DM', 'Steur'),
    (48, 17, 460, 'DM', 'Willock'),
    (48, 17, 457, 'RW', 'Murphy'),
    (48, 17, 464, 'AM', 'Wissa'),
    (48, 17, 453, 'LW', 'Barnes'),
    (48, 17, 634, 'CF', 'Fernandez-Pardo'),
    (48, 8, 572, 'GK', 'Tzolakis'),
    (48, 8, 280, 'RWB', 'Coyle'),
    (48, 8, 279, 'RCB', 'Ajayi'),
    (48, 8, 277, 'CB', 'Egan'),
    (48, 8, 585, 'LCB', 'Herrington'),
    (48, 8, 282, 'LWB', 'Giles'),
    (48, 8, 286, 'RW', 'Belloumi'),
    (48, 8, 289, 'CM', 'Crooks'),
    (48, 8, 290, 'CM', 'Slater'),
    (48, 8, 642, 'LW', 'Thomas'),
    (48, 8, 295, 'CF', 'McBurnie'),
    (49, 37, 467, 'GK', 'Sels'),
    (49, 37, 474, 'RCB', 'Jair Cunha'),
    (49, 37, 581, 'CB', 'Diomande'),
    (49, 37, 472, 'LCB', 'Murillo'),
    (49, 37, 201, 'RWB', 'Munoz'),
    (49, 37, 486, 'CM', 'McAtee'),
    (49, 37, 558, 'CM', 'Schlager'),
    (49, 37, 469, 'LWB', 'Williams'),
    (49, 37, 480, 'RW', 'Gibbs-White'),
    (49, 37, 483, 'LW', 'Ndoye'),
    (49, 37, 167, 'CF', 'Delap'),
    (49, 48, 110, 'GK', 'Rushworth'),
    (49, 48, 656, 'RCB', 'Mfuni'),
    (49, 48, 173, 'CB', 'Thomas'),
    (49, 48, 91, 'LCB', 'Pinnock'),
    (49, 48, 575, 'RWB', 'Yirenkyi'),
    (49, 48, 104, 'CM', 'Onyeka'),
    (49, 48, 184, 'CM', 'Grimes'),
    (49, 48, 176, 'LWB', 'Dasilva'),
    (49, 48, 183, 'RW', 'Rudoni'),
    (49, 48, 186, 'LW', 'Mason-Clark'),
    (49, 48, 194, 'CF', 'Thomas-Asante'),
    (50, 14, 496, 'GK', 'Kinsky'),
    (50, 14, 499, 'RB', 'Porro'),
    (50, 14, 112, 'RCB', 'van Hecke'),
    (50, 14, 503, 'LCB', 'van de Ven'),
    (50, 14, 502, 'LB', 'Robertson'),
    (50, 14, 516, 'DM', 'Bentancur'),
    (50, 14, 455, 'DM', 'Tonali'),
    (50, 14, 403, 'RW', 'Savio'),
    (50, 14, 525, 'AM', 'Mateus Fernandes'),
    (50, 14, 401, 'LW', 'Omar Marmoush'),
    (50, 14, 526, 'CF', 'Solanke'),
    (50, 10, 597, 'GK', 'Suzuki'),
    (50, 10, 611, 'RB', 'Wan-Bissaka'),
    (50, 10, 37, 'RCB', 'Lindelof'),
    (50, 10, 33, 'LCB', 'Mings'),
    (50, 10, 596, 'LB', 'Ruggeri'),
    (50, 10, 47, 'DM', 'Kamara'),
    (50, 10, 54, 'DM', 'Joao Gomes'),
    (50, 10, 45, 'RW', 'McGinn'),
    (50, 10, 53, 'AM', 'Manzambi'),
    (50, 10, 41, 'LW', 'Buendia'),
    (50, 10, 166, 'CF', 'Jackson')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (42, 20, '3-4-2-1'), (42, 23, '4-2-3-1'), (43, 25, '4-2-3-1'), (43, 1, '4-2-3-1'), (44, 4, '4-2-3-1'), (44, 31, '4-2-3-1'), (45, 32, '4-2-3-1'), (45, 5, '4-2-3-1'), (47, 18, '4-2-3-1'), (47, 12, '4-2-3-1'), (48, 17, '4-2-3-1'), (48, 8, '5-4-1'), (49, 37, '3-4-2-1'), (49, 48, '3-4-2-1'), (50, 14, '4-2-3-1'), (50, 10, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

-- Positions seen that differ from each player's main one.
insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, 2
  from (values
    (20, 568, 'CM'),   -- Barco (listed MID)
    (31, 315, 'RW'),   -- Abdul Fatawu (listed RWB)
    (31, 313, 'LW'),   -- Clarke (listed MID)
    (18, 397, 'LW'),   -- Semenyo (listed RW)
    (12, 612, 'LB'),   -- Methalie (listed DEF)
    (8, 585, 'LCB'),   -- Herrington (listed DEF)
    (8, 286, 'RW'),   -- Belloumi (listed RWB)
    (17, 462, 'DM'),   -- Steur (listed MID)
    (48, 656, 'RCB'),   -- Mfuni (listed DEF)
    (48, 173, 'CB'),   -- Thomas (listed RCB)
    (48, 575, 'RWB'),   -- Yirenkyi (listed MID)
    (48, 183, 'RW'),   -- Rudoni (listed MID)
    (10, 53, 'AM'),   -- Manzambi (listed LW)
    (10, 41, 'LW'),   -- Buendia (listed AM)
    (14, 499, 'RB'),   -- Porro (listed DEF)
    (14, 525, 'AM'),   -- Mateus Fernandes (listed MID)
    (14, 401, 'LW')   -- Marmoush (listed CF)
  ) as v(team_id, fpl_player_id, role)
on conflict do nothing;
