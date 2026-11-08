-- GW10 line-ups and substitutions from Chris's BBC screenshots (8 Nov 2026,
-- 16:58 to 17:02), all three matches played on Sat 7 Nov:
--   Fulham 1-1 Newcastle (93), Arsenal 1-0 Hull (89), Leeds 1-0 Spurs (95).
-- Keeper at the TOP: the left of the image is the team's right.
-- Every substitution checked against FPL live minutes (each player off shows
-- one minute fewer in FPL). All starters of every side are visible, so sub
-- coverage is complete. Stoppage time is stored as 90+n. Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Fulham 4-2-3-1
    (93, 32, 250, 'GK', 'Leno'), (93, 32, 258, 'RB', 'Castagne'), (93, 32, 650, 'RCB', 'Affengruber'), (93, 32, 257, 'LCB', 'Bassey'),
    (93, 32, 254, 'LB', 'Robinson'), (93, 32, 265, 'DM', 'Berge'), (93, 32, 580, 'DM', 'Charles'), (93, 32, 264, 'RW', 'Bobb'),
    (93, 32, 268, 'AM', 'King'), (93, 32, 261, 'LW', 'Iwobi'), (93, 32, 569, 'CF', 'García'),
    -- Newcastle 4-2-3-1
    (93, 17, 567, 'GK', 'Horníček'), (93, 17, 593, 'RB', 'Dedić'), (93, 17, 445, 'RCB', 'Thiaw'), (93, 17, 448, 'LCB', 'Burn'),
    (93, 17, 449, 'LB', 'Hall'), (93, 17, 462, 'DM', 'Steur'), (93, 17, 405, 'DM', 'González'), (93, 17, 457, 'RW', 'J. Murphy'),
    (93, 17, 464, 'AM', 'Wissa'), (93, 17, 453, 'LW', 'Barnes'), (93, 17, 465, 'CF', 'Osula'),
    -- Arsenal 4-2-3-1
    (89, 1, 1, 'GK', 'Raya'), (89, 1, 5, 'RB', 'Timber'), (89, 1, 31, 'RCB', 'Konsa'), (89, 1, 4, 'LCB', 'Gabriel'),
    (89, 1, 8, 'LB', 'Calafiori'), (89, 1, 452, 'DM', 'Bruno Guimarães'), (89, 1, 13, 'DM', 'Rice'), (89, 1, 16, 'RW', 'Madueke'),
    (89, 1, 15, 'AM', 'Ødegaard'), (89, 1, 557, 'LW', 'Tzolis'), (89, 1, 26, 'CF', 'Havertz'),
    -- Hull 5-3-2
    (89, 8, 572, 'GK', 'Tzolakis'), (89, 8, 280, 'RWB', 'Coyle'), (89, 8, 279, 'RCB', 'Ajayi'), (89, 8, 277, 'CB', 'Egan'),
    (89, 8, 586, 'LCB', 'Mendy'), (89, 8, 576, 'LWB', 'Stroud'), (89, 8, 240, 'CM', 'Iroegbunam'), (89, 8, 589, 'CM', 'Gourna-Douath'),
    (89, 8, 290, 'CM', 'Slater'), (89, 8, 617, 'CF', 'Cho'), (89, 8, 295, 'CF', 'McBurnie'),
    -- Leeds 3-4-2-1
    (95, 36, 385, 'GK', 'Trafford'), (95, 36, 332, 'RCB', 'Justin'), (95, 36, 598, 'CB', 'Elvedi'), (95, 36, 334, 'LCB', 'Muharemović'),
    (95, 36, 330, 'RWB', 'Bogle'), (95, 36, 338, 'CM', 'Ampadu'), (95, 36, 345, 'CM', 'Tanaka'), (95, 36, 331, 'LWB', 'Gudmundsson'),
    (95, 36, 339, 'RW', 'Longstaff'), (95, 36, 347, 'LW', 'Nmecha'), (95, 36, 346, 'CF', 'Calvert-Lewin'),
    -- Spurs 4-3-3
    (95, 14, 496, 'GK', 'Kinský'), (95, 14, 499, 'RB', 'Pedro Porro'), (95, 14, 112, 'RCB', 'van Hecke'), (95, 14, 503, 'LCB', 'van de Ven'),
    (95, 14, 502, 'LB', 'Robertson'), (95, 14, 455, 'CM', 'Tonali'), (95, 14, 525, 'DM', 'Mateus Fernandes'), (95, 14, 522, 'CM', 'Gray'),
    (95, 14, 512, 'RW', 'Kudus'), (95, 14, 401, 'CF', 'Marmoush'), (95, 14, 514, 'LW', 'Tel')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (93, 32, '4-2-3-1'), (93, 17, '4-2-3-1'), (89, 1, '4-2-3-1'), (89, 8, '5-3-2'),
               (95, 36, '3-4-2-1'), (95, 14, '4-3-3')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  -- Fulham
  (93, 32, 569, 271, 65, 'García', 'Muniz', 'bbc_screenshot'),
  (93, 32, 268, 570, 72, 'King', 'César Palacios', 'bbc_screenshot'),
  (93, 32, 258, 256, 77, 'Castagne', 'Tete', 'bbc_screenshot'),
  (93, 32, 264, 269, 77, 'Bobb', 'Sessegnon', 'bbc_screenshot'),
  -- Newcastle
  (93, 17, 405, 459, 61, 'González', 'L. Miley', 'bbc_screenshot'),
  (93, 17, 464, 460, 61, 'Wissa', 'Willock', 'bbc_screenshot'),
  (93, 17, 462, 634, 74, 'Steur', 'Fernandez-Pardo', 'bbc_screenshot'),
  (93, 17, 445, 446, 85, 'Thiaw', 'Schär', 'bbc_screenshot'),
  (93, 17, 465, 454, 85, 'Osula', 'Elanga', 'bbc_screenshot'),
  -- Arsenal
  (89, 1, 13, 17, 63, 'Rice', 'Merino', 'bbc_screenshot'),
  (89, 1, 26, 25, 63, 'Havertz', 'Gyökeres', 'bbc_screenshot'),
  (89, 1, 8, 9, 69, 'Calafiori', 'Hincapié', 'bbc_screenshot'),
  (89, 1, 557, 14, 69, 'Tzolis', 'Eze', 'bbc_screenshot'),
  (89, 1, 452, 19, 89, 'Bruno Guimarães', 'Zubimendi', 'bbc_screenshot'),
  -- Hull
  (89, 8, 617, 340, 60, 'Cho', 'Gelhardt', 'bbc_screenshot'),
  (89, 8, 280, 638, 61, 'Coyle', 'Norton-Cuffy', 'bbc_screenshot'),
  (89, 8, 279, 585, 69, 'Ajayi', 'Herrington', 'bbc_screenshot'),
  (89, 8, 576, 282, 75, 'Stroud', 'Giles', 'bbc_screenshot'),
  (89, 8, 240, 645, 75, 'Iroegbunam', 'Mouzakitis', 'bbc_screenshot'),
  -- Leeds
  (95, 36, 331, 641, 46, 'Gudmundsson', 'Bard', 'bbc_screenshot'),
  (95, 36, 345, 260, 77, 'Tanaka', 'H. Wilson', 'bbc_screenshot'),
  (95, 36, 347, 336, 77, 'Nmecha', 'Okafor', 'bbc_screenshot'),
  (95, 36, 330, 329, 93, 'Bogle', 'Rodon', 'bbc_screenshot'),
  (95, 36, 339, 344, 93, 'Longstaff', 'Gruev', 'bbc_screenshot'),
  -- Spurs
  (95, 14, 514, 526, 43, 'Tel', 'Solanke', 'bbc_screenshot'),
  (95, 14, 499, 519, 65, 'Pedro Porro', 'Gallagher', 'bbc_screenshot'),
  (95, 14, 525, 516, 65, 'Mateus Fernandes', 'Bentancur', 'bbc_screenshot'),
  (95, 14, 401, 521, 65, 'Marmoush', 'Kulusevski', 'bbc_screenshot'),
  (95, 14, 512, 601, 83, 'Kudus', 'Williams-Barnett', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (93, 32, 'bbc_screenshot', true), (93, 17, 'bbc_screenshot', true), (89, 1, 'bbc_screenshot', true),
       (89, 8, 'bbc_screenshot', true), (95, 36, 'bbc_screenshot', true), (95, 14, 'bbc_screenshot', true)
on conflict do nothing;
