-- More GW10 line-ups and substitutions from Chris's BBC screenshots (8 Nov
-- 2026, 17:04 to 17:08): Nottingham Forest 3-1 Man City (97, Sat 7 Nov),
-- and from Sun 8 Nov Brighton 2-0 Brentford (90), Crystal Palace 1-3
-- Liverpool (91), Ipswich 1-2 Bournemouth (94) and Sunderland 1-0 Chelsea
-- (98). Chelsea's 4-3-2-1 has no pitch template; the pitch lays it out by
-- lines.
-- Keeper at the TOP: the left of the image is the team's right.
-- Forest and City substitutions checked against FPL live minutes. The four
-- Sunday games had no FPL minutes yet when this was written. All starters of
-- every side are visible (City's Anderson played 90 in FPL), so sub coverage
-- is complete. Brentford's Igor Thiago was sent off (23'). Stoppage time is
-- stored as 90+n. Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Nottingham Forest 3-4-2-1
    (97, 37, 467, 'GK', 'Sels'), (97, 37, 474, 'RCB', 'Jair Cunha'), (97, 37, 471, 'CB', 'Milenković'), (97, 37, 472, 'LCB', 'Murillo'),
    (97, 37, 201, 'RWB', 'Muñoz'), (97, 37, 558, 'CM', 'Schlager'), (97, 37, 489, 'CM', 'Yates'), (97, 37, 469, 'LWB', 'Williams'),
    (97, 37, 486, 'RW', 'McAtee'), (97, 37, 480, 'LW', 'Gibbs-White'), (97, 37, 167, 'CF', 'Delap'),
    -- Man City 4-2-3-1
    (97, 18, 384, 'GK', 'Donnarumma'), (97, 18, 393, 'RB', 'Khusanov'), (97, 18, 390, 'RCB', 'Rúben Dias'), (97, 18, 388, 'LCB', 'Guéhi'),
    (97, 18, 391, 'LB', 'Gvardiol'), (97, 18, 155, 'DM', 'E. Fernández'), (97, 18, 481, 'DM', 'Anderson'), (97, 18, 237, 'RW', 'Ndiaye'),
    (97, 18, 399, 'AM', 'Cherki'), (97, 18, 400, 'LW', 'Doku'), (97, 18, 411, 'CF', 'Haaland'),
    -- Brighton 4-2-3-1
    (90, 25, 109, 'GK', 'Verbruggen'), (90, 25, 119, 'RB', 'Costinha'), (90, 25, 504, 'RCB', 'Vušković'), (90, 25, 116, 'LCB', 'Dunk'),
    (90, 25, 114, 'LB', 'Boscagli'), (90, 25, 124, 'DM', 'Groß'), (90, 25, 639, 'DM', 'Chema Andrés'), (90, 25, 127, 'RW', 'Gómez'),
    (90, 25, 129, 'AM', 'Ayari'), (90, 25, 115, 'LW', 'De Cuyper'), (90, 25, 138, 'CF', 'Kostoulas'),
    -- Brentford 4-4-2
    (90, 23, 82, 'GK', 'Kelleher'), (90, 23, 88, 'RB', 'Kayode'), (90, 23, 87, 'RCB', 'Ajer'), (90, 23, 85, 'LCB', 'van den Berg'),
    (90, 23, 90, 'LB', 'Hickey'), (90, 23, 95, 'RM', 'Ouattara'), (90, 23, 565, 'CM', 'Sangaré'), (90, 23, 98, 'CM', 'Janelt'),
    (90, 23, 86, 'LM', 'Lewis-Potter'), (90, 23, 106, 'CF', 'Igor Thiago'), (90, 23, 94, 'CF', 'Schade')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (97, 37, '3-4-2-1'), (97, 18, '4-2-3-1'), (90, 25, '4-2-3-1'), (90, 23, '4-4-2')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  -- Nottingham Forest
  (97, 37, 201, 478, 65, 'Muñoz', 'Netz', 'bbc_screenshot'),
  (97, 37, 486, 483, 65, 'McAtee', 'Ndoye', 'bbc_screenshot'),
  (97, 37, 489, 488, 79, 'Yates', 'I. Sangaré', 'bbc_screenshot'),
  (97, 37, 167, 491, 87, 'Delap', 'Igor Jesus', 'bbc_screenshot'),
  -- Man City
  (97, 18, 391, 387, 46, 'Gvardiol', 'O''Reilly', 'bbc_screenshot'),
  (97, 18, 388, 389, 46, 'Guéhi', 'Matheus Nunes', 'bbc_screenshot'),
  (97, 18, 155, 398, 78, 'E. Fernández', 'Foden', 'bbc_screenshot'),
  -- Brighton
  (90, 25, 639, 130, 46, 'Chema Andrés', 'Wieffer', 'bbc_screenshot'),
  (90, 25, 129, 123, 78, 'Ayari', 'Hinshelwood', 'bbc_screenshot'),
  (90, 25, 115, 122, 82, 'De Cuyper', 'Minteh', 'bbc_screenshot'),
  (90, 25, 138, 125, 82, 'Kostoulas', 'Rutter', 'bbc_screenshot'),
  (90, 25, 127, 605, 93, 'Gómez', 'Yalcouyé', 'bbc_screenshot'),
  -- Brentford
  (90, 23, 90, 84, 46, 'Hickey', 'Collins', 'bbc_screenshot'),
  (90, 23, 95, 102, 46, 'Ouattara', 'Yarmoliuk', 'bbc_screenshot'),
  (90, 23, 86, 620, 59, 'Lewis-Potter', 'Diouf', 'bbc_screenshot'),
  (90, 23, 565, 97, 59, 'Sangaré', 'M. Jensen', 'bbc_screenshot'),
  (90, 23, 85, 108, 70, 'van den Berg', 'C. Wilson', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (97, 37, 'bbc_screenshot', true), (97, 18, 'bbc_screenshot', true),
       (90, 25, 'bbc_screenshot', true), (90, 23, 'bbc_screenshot', true)
on conflict do nothing;

-- Sunday's other two games (17:06 to 17:07 screenshots).
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Crystal Palace 3-4-2-1
    (91, 2, 198, 'GK', 'Henderson'), (91, 2, 202, 'RCB', 'Richards'), (91, 2, 153, 'CB', 'Disasi'), (91, 2, 213, 'LCB', 'Lerma'),
    (91, 2, 207, 'RWB', 'Mingueza'), (91, 2, 210, 'CM', 'Wharton'), (91, 2, 644, 'CM', 'Q. Timber'), (91, 2, 204, 'LWB', 'Mitchell'),
    (91, 2, 214, 'RW', 'Kamada'), (91, 2, 211, 'LW', 'Yéremy Pino'), (91, 2, 222, 'CF', 'Strand Larsen'),
    -- Liverpool 4-2-3-1
    (91, 15, 350, 'GK', 'Alisson'), (91, 15, 579, 'RB', 'Araujo'), (91, 15, 362, 'RCB', 'Jacquet'), (91, 15, 356, 'LCB', 'van Dijk'),
    (91, 15, 358, 'LB', 'Kerkez'), (91, 15, 368, 'DM', 'Szoboszlai'), (91, 15, 372, 'DM', 'Mac Allister'), (91, 15, 367, 'RW', 'Gakpo'),
    (91, 15, 366, 'AM', 'Wirtz'), (91, 15, 627, 'LW', 'Barcola'), (91, 15, 379, 'CF', 'Isak'),
    -- Ipswich 4-2-3-1
    (94, 31, 300, 'GK', 'Walton'), (94, 31, 592, 'RB', 'A. Ouattara'), (94, 31, 259, 'RCB', 'Diop'), (94, 31, 304, 'LCB', 'O''Shea'),
    (94, 31, 305, 'LB', 'Davis'), (94, 31, 619, 'DM', 'Palacios'), (94, 31, 571, 'DM', 'Florentino'), (94, 31, 562, 'RW', 'Maeda'),
    (94, 31, 591, 'AM', 'Enciso'), (94, 31, 318, 'LW', 'Philogene'), (94, 31, 316, 'CF', 'Emersonn'),
    -- Bournemouth 4-2-3-1
    (94, 30, 57, 'GK', 'Petrović'), (94, 30, 64, 'RB', 'Smith'), (94, 30, 60, 'RCB', 'Hill'), (94, 30, 566, 'LCB', 'António Silva'),
    (94, 30, 61, 'LB', 'Truffert'), (94, 30, 73, 'DM', 'Adams'), (94, 30, 75, 'DM', 'Christie'), (94, 30, 67, 'RW', 'Rayan'),
    (94, 30, 70, 'AM', 'Kluivert'), (94, 30, 68, 'LW', 'Tavernier'), (94, 30, 79, 'CF', 'Evanilson')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (91, 2, '3-4-2-1'), (91, 15, '4-2-3-1'), (94, 31, '4-2-3-1'), (94, 30, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  -- Crystal Palace
  (91, 2, 644, 647, 60, 'Q. Timber', 'Osorio', 'bbc_screenshot'),
  (91, 2, 222, 224, 72, 'Strand Larsen', 'Nketiah', 'bbc_screenshot'),
  (91, 2, 207, 588, 87, 'Mingueza', 'Khalaili', 'bbc_screenshot'),
  (91, 2, 211, 241, 87, 'Yéremy Pino', 'McNeil', 'bbc_screenshot'),
  -- Liverpool
  (91, 15, 368, 375, 69, 'Szoboszlai', 'Nyoni', 'bbc_screenshot'),
  (91, 15, 627, 377, 69, 'Barcola', 'Víctor Muñoz', 'bbc_screenshot'),
  (91, 15, 367, 369, 76, 'Gakpo', 'Ngumoha', 'bbc_screenshot'),
  (91, 15, 379, 381, 90, 'Isak', 'Koumas', 'bbc_screenshot'),
  (91, 15, 579, 359, 91, 'Araujo', 'J. Gomez', 'bbc_screenshot'),
  -- Ipswich
  (94, 31, 318, 313, 54, 'Philogene', 'Clarke', 'bbc_screenshot'),
  (94, 31, 316, 640, 54, 'Emersonn', 'Flemming', 'bbc_screenshot'),
  (94, 31, 562, 315, 65, 'Maeda', 'Fatawu', 'bbc_screenshot'),
  (94, 31, 571, 320, 85, 'Florentino', 'Akpom', 'bbc_screenshot'),
  -- Bournemouth
  (94, 30, 75, 71, 67, 'Christie', 'Cook', 'bbc_screenshot'),
  (94, 30, 70, 78, 68, 'Kluivert', 'Kroupi', 'bbc_screenshot'),
  (94, 30, 64, 62, 79, 'Smith', 'Diakité', 'bbc_screenshot'),
  (94, 30, 67, 77, 85, 'Rayan', 'Adli', 'bbc_screenshot'),
  (94, 30, 79, 81, 85, 'Evanilson', 'Á. Rodríguez', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (91, 2, 'bbc_screenshot', true), (91, 15, 'bbc_screenshot', true),
       (94, 31, 'bbc_screenshot', true), (94, 30, 'bbc_screenshot', true)
on conflict do nothing;

-- Sunderland v Chelsea (17:07 to 17:08 screenshots). Xhaka was replaced
-- in the 4th minute.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Sunderland 4-2-3-1
    (98, 12, 529, 'GK', 'Roefs'), (98, 12, 541, 'RB', 'Meunier'), (98, 12, 533, 'RCB', 'Mukiele'), (98, 12, 539, 'LCB', 'O''Nien'),
    (98, 12, 536, 'LB', 'Reinildo'), (98, 12, 544, 'DM', 'Xhaka'), (98, 12, 545, 'DM', 'Sadiki'), (98, 12, 534, 'RW', 'Hume'),
    (98, 12, 542, 'AM', 'Le Fée'), (98, 12, 549, 'LW', 'Talbi'), (98, 12, 552, 'CF', 'Brobbey'),
    -- Chelsea 4-3-2-1
    (98, 20, 560, 'GK', 'Penders'), (98, 20, 152, 'RB', 'Palestra'), (98, 20, 145, 'RCB', 'Fofana'), (98, 20, 149, 'LCB', 'Colwill'),
    (98, 20, 583, 'LB', 'Chavarría'), (98, 20, 159, 'CM', 'Caicedo'), (98, 20, 161, 'DM', 'Lavia'), (98, 20, 101, 'CM', 'Henderson'),
    (98, 20, 154, 'RW', 'Palmer'), (98, 20, 40, 'LW', 'Rogers'), (98, 20, 156, 'CF', 'Pedro Neto')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (98, 12, '4-2-3-1'), (98, 20, '4-3-2-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  -- Sunderland
  (98, 12, 544, 613, 4, 'Xhaka', 'Ahoka', 'bbc_screenshot'),
  (98, 12, 552, 553, 67, 'Brobbey', 'Isidor', 'bbc_screenshot'),
  (98, 12, 549, 551, 88, 'Talbi', 'N. Angulo', 'bbc_screenshot'),
  (98, 12, 542, 548, 88, 'Le Fée', 'Rigg', 'bbc_screenshot'),
  -- Chelsea
  (98, 20, 149, 157, 46, 'Colwill', 'Estêvão', 'bbc_screenshot'),
  (98, 20, 152, 144, 62, 'Palestra', 'Gusto', 'bbc_screenshot'),
  (98, 20, 156, 136, 62, 'Pedro Neto', 'Welbeck', 'bbc_screenshot'),
  (98, 20, 583, 164, 79, 'Chavarría', 'Quenda', 'bbc_screenshot'),
  (98, 20, 101, 170, 87, 'Henderson', 'Emegha', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (98, 12, 'bbc_screenshot', true), (98, 20, 'bbc_screenshot', true)
on conflict do nothing;
