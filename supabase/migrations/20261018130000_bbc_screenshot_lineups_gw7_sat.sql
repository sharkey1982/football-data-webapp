-- GW7 Saturday line-ups from Chris's BBC screenshots (18 Oct 2026): Brentford
-- v Liverpool (62), Everton v Chelsea (64), Fulham v Hull (65), Man City v
-- Ipswich (67), Newcastle v Aston Villa (68). Keeper at the TOP: the left of
-- the image is the team's right. All 110 starters checked against FPL's own
-- record of who started (all matched). Chelsea's formation is cut off in the
-- screenshot; the shape is 4-2-3-1. Positions seen go in only as "also plays",
-- rank 2; no main position or rank is changed (CM/DM swaps in a double pivot
-- are not added). Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (62, 23, 82, 'GK', 'Kelleher'),
    (62, 23, 88, 'RB', 'Kayode'),
    (62, 23, 85, 'RCB', 'van den Berg'),
    (62, 23, 87, 'LCB', 'Ajer'),
    (62, 23, 86, 'LB', 'Lewis-Potter'),
    (62, 23, 102, 'DM', 'Yarmoliuk'),
    (62, 23, 98, 'DM', 'Janelt'),
    (62, 23, 95, 'RW', 'Ouattara'),
    (62, 23, 97, 'AM', 'Jensen'),
    (62, 23, 105, 'LW', 'Anthony'),
    (62, 23, 106, 'CF', 'Igor Thiago'),
    (62, 15, 350, 'GK', 'Alisson Becker'),
    (62, 15, 579, 'RB', 'Araujo'),
    (62, 15, 362, 'RCB', 'Jacquet'),
    (62, 15, 356, 'LCB', 'van Dijk'),
    (62, 15, 358, 'LB', 'Kerkez'),
    (62, 15, 372, 'DM', 'Mac Allister'),
    (62, 15, 368, 'DM', 'Szoboszlai'),
    (62, 15, 377, 'RW', 'Munoz'),
    (62, 15, 366, 'AM', 'Wirtz'),
    (62, 15, 627, 'LW', 'Barcola'),
    (62, 15, 379, 'CF', 'Isak'),
    (64, 4, 226, 'GK', 'Pickford'),
    (64, 4, 649, 'RB', 'Maitland-Niles'),
    (64, 4, 229, 'RCB', 'Tarkowski'),
    (64, 4, 230, 'LCB', 'Branthwaite'),
    (64, 4, 233, 'LB', 'Mykolenko'),
    (64, 4, 244, 'DM', 'Armstrong'),
    (64, 4, 239, 'DM', 'Garner'),
    (64, 4, 246, 'RW', 'Rohl'),
    (64, 4, 236, 'AM', 'Dewsbury-Hall'),
    (64, 4, 238, 'LW', 'Grealish'),
    (64, 4, 249, 'CF', 'Barry'),
    (64, 20, 28, 'GK', 'Martinez'),
    (64, 20, 151, 'RB', 'Acheampong'),
    (64, 20, 200, 'RCB', 'Lacroix'),
    (64, 20, 149, 'LCB', 'Colwill'),
    (64, 20, 148, 'LB', 'Hato'),
    (64, 20, 159, 'DM', 'Caicedo'),
    (64, 20, 101, 'DM', 'Henderson'),
    (64, 20, 156, 'RW', 'Pedro Neto'),
    (64, 20, 154, 'AM', 'Palmer'),
    (64, 20, 40, 'LW', 'Rogers'),
    (64, 20, 165, 'CF', 'Joao Pedro'),
    (65, 32, 250, 'GK', 'Leno'),
    (65, 32, 258, 'RB', 'Castagne'),
    (65, 32, 650, 'RCB', 'Affengruber'),
    (65, 32, 257, 'LCB', 'Bassey'),
    (65, 32, 254, 'LB', 'Robinson'),
    (65, 32, 265, 'DM', 'Berge'),
    (65, 32, 580, 'DM', 'Charles'),
    (65, 32, 264, 'RW', 'Bobb'),
    (65, 32, 268, 'AM', 'King'),
    (65, 32, 261, 'LW', 'Iwobi'),
    (65, 32, 569, 'CF', 'Garcia'),
    (65, 8, 572, 'GK', 'Tzolakis'),
    (65, 8, 280, 'RWB', 'Coyle'),
    (65, 8, 279, 'RCB', 'Ajayi'),
    (65, 8, 277, 'CB', 'Egan'),
    (65, 8, 585, 'LCB', 'Herrington'),
    (65, 8, 638, 'LWB', 'Norton-Cuffy'),
    (65, 8, 286, 'RW', 'Belloumi'),
    (65, 8, 289, 'CM', 'Crooks'),
    (65, 8, 290, 'CM', 'Slater'),
    (65, 8, 642, 'LW', 'Thomas'),
    (65, 8, 295, 'CF', 'McBurnie'),
    (67, 18, 384, 'GK', 'Donnarumma'),
    (67, 18, 389, 'RB', 'Matheus Nunes'),
    (67, 18, 390, 'RCB', 'Ruben Dias'),
    (67, 18, 388, 'LCB', 'Guehi'),
    (67, 18, 387, 'LB', 'O''Reilly'),
    (67, 18, 406, 'DM', 'Kovacic'),
    (67, 18, 616, 'DM', 'Bouaddi'),
    (67, 18, 237, 'RW', 'Ndiaye'),
    (67, 18, 398, 'AM', 'Foden'),
    (67, 18, 400, 'LW', 'Doku'),
    (67, 18, 411, 'CF', 'Haaland'),
    (67, 31, 300, 'GK', 'Walton'),
    (67, 31, 304, 'RCB', 'O''Shea'),
    (67, 31, 259, 'CB', 'Diop'),
    (67, 31, 306, 'LCB', 'Greaves'),
    (67, 31, 592, 'RWB', 'Ouattara'),
    (67, 31, 571, 'CM', 'Florentino'),
    (67, 31, 619, 'CM', 'Palacios'),
    (67, 31, 305, 'LWB', 'Davis'),
    (67, 31, 562, 'RW', 'Maeda'),
    (67, 31, 591, 'LW', 'Enciso'),
    (67, 31, 316, 'CF', 'Emersonn'),
    (68, 17, 567, 'GK', 'Hornicek'),
    (68, 17, 459, 'RB', 'Miley'),
    (68, 17, 445, 'RCB', 'Thiaw'),
    (68, 17, 447, 'LCB', 'Botman'),
    (68, 17, 449, 'LB', 'Hall'),
    (68, 17, 458, 'DM', 'Joelinton'),
    (68, 17, 405, 'DM', 'Gonzalez'),
    (68, 17, 634, 'RW', 'Fernandez-Pardo'),
    (68, 17, 460, 'AM', 'Willock'),
    (68, 17, 453, 'LW', 'Barnes'),
    (68, 17, 464, 'CF', 'Wissa'),
    (68, 10, 597, 'GK', 'Suzuki'),
    (68, 10, 32, 'RB', 'Cash'),
    (68, 10, 37, 'RCB', 'Lindelof'),
    (68, 10, 33, 'LCB', 'Mings'),
    (68, 10, 611, 'LB', 'Wan-Bissaka'),
    (68, 10, 47, 'DM', 'Kamara'),
    (68, 10, 54, 'DM', 'Joao Gomes'),
    (68, 10, 52, 'RW', 'Alysson'),
    (68, 10, 53, 'AM', 'Manzambi'),
    (68, 10, 41, 'LW', 'Buendia'),
    (68, 10, 166, 'CF', 'Jackson')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (62, 23, '4-2-3-1'), (62, 15, '4-2-3-1'), (64, 4, '4-2-3-1'), (64, 20, '4-2-3-1'), (65, 32, '4-2-3-1'), (65, 8, '5-4-1'), (67, 18, '4-2-3-1'), (67, 31, '3-4-2-1'), (68, 17, '4-2-3-1'), (68, 10, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

-- Positions seen that differ from each player's main one.
insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, 2
  from (values
    (23, 85, 'RCB'),   -- van den Berg (listed DEF)
    (23, 97, 'AM'),   -- Jensen (listed CM)
    (23, 95, 'RW'),   -- Ouattara (listed CM)
    (23, 105, 'LW'),   -- Anthony (listed RW)
    (4, 246, 'RW'),   -- Rohl (listed MID)
    (20, 151, 'RB'),   -- Acheampong (listed LCB)
    (20, 200, 'RCB'),   -- Lacroix (listed CB)
    (20, 148, 'LB'),   -- Hato (listed LWB)
    (20, 156, 'RW'),   -- Pedro Neto (listed RWB)
    (20, 154, 'AM'),   -- Palmer (listed RW)
    (8, 638, 'LWB'),   -- Norton-Cuffy (listed DEF)
    (18, 616, 'DM'),   -- Bouaddi (listed MID)
    (18, 398, 'AM'),   -- Foden (listed RW)
    (31, 592, 'RWB'),   -- Ouattara (listed RB)
    (31, 591, 'LW'),   -- Enciso (listed RW)
    (17, 458, 'DM'),   -- Joelinton (listed MID)
    (17, 634, 'RW'),   -- Fernandez-Pardo (listed CF)
    (17, 460, 'AM'),   -- Willock (listed CM)
    (17, 464, 'CF'),   -- Wissa (listed AM)
    (10, 611, 'LB'),   -- Wan-Bissaka (listed RB)
    (10, 52, 'RW')   -- Alysson (listed MID)
  ) as v(team_id, fpl_player_id, role)
on conflict do nothing;
