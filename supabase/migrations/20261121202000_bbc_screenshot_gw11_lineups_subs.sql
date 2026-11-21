-- GW11 line-ups and substitutions from Chris's BBC screenshots (21 Nov 2026,
-- 20:10 to 20:13), all played Sat 21 Nov:
--   Man City 1-1 Fulham (106), Aston Villa 0-0 Sunderland (100; Villa's list
--   only, no formation shown, so Villa gets substitutions but no positions),
--   Bournemouth 2-0 Nottingham Forest (99; Bournemouth only),
--   Chelsea v Leeds (102).
-- Keeper at the TOP: the left of the image is the team's right.
-- Every substitution checked against FPL live minutes; every starter
-- started in FPL (Villa's two rows cut off the screenshot, Suzuki and
-- Maatsen, are FPL starters with 90 minutes), so sub coverage is complete
-- for all seven sides. Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Man City 4-2-3-1
    (106, 18, 384, 'GK', 'Donnarumma'), (106, 18, 393, 'RB', 'Khusanov'), (106, 18, 390, 'RCB', 'Rúben Dias'), (106, 18, 388, 'LCB', 'Guéhi'),
    (106, 18, 387, 'LB', 'O''Reilly'), (106, 18, 481, 'DM', 'Anderson'), (106, 18, 616, 'DM', 'Bouaddi'), (106, 18, 237, 'RW', 'Ndiaye'),
    (106, 18, 398, 'AM', 'Foden'), (106, 18, 400, 'LW', 'Doku'), (106, 18, 411, 'CF', 'Haaland'),
    -- Fulham 4-3-3 (King central in the front three, Muniz on the left, as shown)
    (106, 32, 250, 'GK', 'Leno'), (106, 32, 256, 'RB', 'Tete'), (106, 32, 650, 'RCB', 'Affengruber'), (106, 32, 257, 'LCB', 'Bassey'),
    (106, 32, 269, 'LB', 'Sessegnon'), (106, 32, 265, 'CM', 'Berge'), (106, 32, 580, 'DM', 'Charles'), (106, 32, 261, 'CM', 'Iwobi'),
    (106, 32, 264, 'RW', 'Bobb'), (106, 32, 268, 'CF', 'King'), (106, 32, 271, 'LW', 'Rodrigo Muniz'),
    -- Sunderland 4-2-3-1
    (100, 12, 529, 'GK', 'Roefs'), (100, 12, 541, 'RB', 'Meunier'), (100, 12, 533, 'RCB', 'Mukiele'), (100, 12, 539, 'LCB', 'O''Nien'),
    (100, 12, 536, 'LB', 'Reinildo'), (100, 12, 613, 'DM', 'Ahoka'), (100, 12, 545, 'DM', 'Sadiki'), (100, 12, 534, 'RW', 'Hume'),
    (100, 12, 542, 'AM', 'Le Fée'), (100, 12, 549, 'LW', 'Talbi'), (100, 12, 553, 'CF', 'Isidor'),
    -- Bournemouth 4-2-3-1
    (99, 30, 57, 'GK', 'Petrović'), (99, 30, 64, 'RB', 'Smith'), (99, 30, 60, 'RCB', 'Hill'), (99, 30, 566, 'LCB', 'António Silva'),
    (99, 30, 61, 'LB', 'Truffert'), (99, 30, 73, 'DM', 'Adams'), (99, 30, 75, 'DM', 'Christie'), (99, 30, 67, 'RW', 'Rayan'),
    (99, 30, 70, 'AM', 'Kluivert'), (99, 30, 68, 'LW', 'Tavernier'), (99, 30, 79, 'CF', 'Evanilson'),
    -- Chelsea 4-2-3-1
    (102, 20, 28, 'GK', 'Martínez'), (102, 20, 151, 'RB', 'Acheampong'), (102, 20, 145, 'RCB', 'Fofana'), (102, 20, 149, 'LCB', 'Colwill'),
    (102, 20, 583, 'LB', 'Chavarría'), (102, 20, 161, 'DM', 'Lavia'), (102, 20, 159, 'DM', 'Caicedo'), (102, 20, 157, 'RW', 'Estêvão'),
    (102, 20, 154, 'AM', 'Palmer'), (102, 20, 40, 'LW', 'Rogers'), (102, 20, 170, 'CF', 'Emegha'),
    -- Leeds 3-4-2-1
    (102, 36, 385, 'GK', 'Trafford'), (102, 36, 332, 'RCB', 'Justin'), (102, 36, 598, 'CB', 'Elvedi'), (102, 36, 334, 'LCB', 'Muharemović'),
    (102, 36, 330, 'RWB', 'Bogle'), (102, 36, 338, 'CM', 'Ampadu'), (102, 36, 345, 'CM', 'Tanaka'), (102, 36, 331, 'LWB', 'Gudmundsson'),
    (102, 36, 339, 'RW', 'Longstaff'), (102, 36, 336, 'LW', 'Okafor'), (102, 36, 346, 'CF', 'Calvert-Lewin')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (106, 18, '4-2-3-1'), (106, 32, '4-3-3'), (100, 12, '4-2-3-1'), (99, 30, '4-2-3-1'),
               (102, 20, '4-2-3-1'), (102, 36, '3-4-2-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  -- Man City
  (106, 18, 398, 399, 70, 'Foden', 'Cherki', 'bbc_screenshot'),
  (106, 18, 387, 391, 78, 'O''Reilly', 'Gvardiol', 'bbc_screenshot'),
  (106, 18, 237, 628, 78, 'Ndiaye', 'Allan', 'bbc_screenshot'),
  (106, 18, 616, 155, 85, 'Bouaddi', 'E. Fernández', 'bbc_screenshot'),
  -- Fulham
  (106, 32, 261, 254, 70, 'Iwobi', 'A. Robinson', 'bbc_screenshot'),
  (106, 32, 268, 635, 70, 'King', 'Larsson', 'bbc_screenshot'),
  (106, 32, 264, 569, 77, 'Bobb', 'Gonzalo García', 'bbc_screenshot'),
  (106, 32, 269, 570, 83, 'Sessegnon', 'César Palacios', 'bbc_screenshot'),
  (106, 32, 271, 266, 83, 'Rodrigo Muniz', 'Cairney', 'bbc_screenshot'),
  -- Aston Villa
  (100, 10, 53, 45, 60, 'Manzambi', 'McGinn', 'bbc_screenshot'),
  (100, 10, 41, 631, 60, 'Buendía', 'Mbaye', 'bbc_screenshot'),
  (100, 10, 618, 46, 73, 'Goretzka', 'Barkley', 'bbc_screenshot'),
  (100, 10, 166, 582, 73, 'N. Jackson', 'Madjo', 'bbc_screenshot'),
  -- Sunderland
  (100, 12, 553, 551, 77, 'Isidor', 'N. Angulo', 'bbc_screenshot'),
  -- Bournemouth
  (99, 30, 75, 69, 69, 'Christie', 'A. Scott', 'bbc_screenshot'),
  (99, 30, 73, 71, 69, 'Adams', 'Cook', 'bbc_screenshot'),
  (99, 30, 70, 78, 69, 'Kluivert', 'Kroupi', 'bbc_screenshot'),
  (99, 30, 64, 62, 87, 'Smith', 'Diakité', 'bbc_screenshot'),
  (99, 30, 67, 72, 90, 'Rayan', 'Gannon-Doak', 'bbc_screenshot'),
  -- Chelsea
  (102, 20, 159, 101, 22, 'Caicedo', 'J. Henderson', 'bbc_screenshot'),
  (102, 20, 157, 156, 64, 'Estêvão', 'Pedro Neto', 'bbc_screenshot'),
  (102, 20, 170, 136, 64, 'Emegha', 'Welbeck', 'bbc_screenshot'),
  (102, 20, 583, 164, 73, 'Chavarría', 'Quenda', 'bbc_screenshot'),
  (102, 20, 151, 144, 73, 'Acheampong', 'Gusto', 'bbc_screenshot'),
  -- Leeds
  (102, 36, 336, 337, 73, 'Okafor', 'Aaronson', 'bbc_screenshot'),
  (102, 36, 345, 329, 86, 'Tanaka', 'Rodon', 'bbc_screenshot'),
  (102, 36, 330, 335, 86, 'Bogle', 'Stach', 'bbc_screenshot'),
  (102, 36, 331, 641, 91, 'Gudmundsson', 'Bard', 'bbc_screenshot'),
  (102, 36, 339, 260, 91, 'Longstaff', 'H. Wilson', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (106, 18, 'bbc_screenshot', true), (106, 32, 'bbc_screenshot', true), (100, 10, 'bbc_screenshot', true),
       (100, 12, 'bbc_screenshot', true), (99, 30, 'bbc_screenshot', true), (102, 20, 'bbc_screenshot', true), (102, 36, 'bbc_screenshot', true)
on conflict do nothing;
