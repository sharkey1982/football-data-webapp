-- GW11 from Chris's BBC screenshots, 22 Nov 2026 16:28:
--   Hull v Brighton (104): substitutions for both sides (line-ups went in
--   with 20261122134500). All ten checked against FPL live minutes; FPL
--   shows no other substitute appearances, so coverage is complete.
--   Liverpool v Man Utd (105, 16:30): both starting XIs and formations,
--   before kick-off; substitutions follow after full time.
-- Keeper at the TOP: the left of the image is the team's right. Safe to re-run.
insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  -- Hull City
  (104, 8, 240, 589, 45, 'Iroegbunam', 'Gourna-Douath', 'bbc_screenshot'),
  (104, 8, 617, 642, 46, 'Cho', 'S. Thomas', 'bbc_screenshot'),
  (104, 8, 576, 282, 67, 'Stroud', 'Giles', 'bbc_screenshot'),
  (104, 8, 289, 574, 68, 'Crooks', 'Hjertø-Dahl', 'bbc_screenshot'),
  (104, 8, 280, 638, 84, 'Coyle', 'Norton-Cuffy', 'bbc_screenshot'),
  -- Brighton
  (104, 25, 114, 122, 67, 'Boscagli', 'Minteh', 'bbc_screenshot'),
  (104, 25, 129, 123, 67, 'Ayari', 'Hinshelwood', 'bbc_screenshot'),
  (104, 25, 125, 138, 67, 'Rutter', 'Kostoulas', 'bbc_screenshot'),
  (104, 25, 127, 113, 80, 'Gómez', 'Kadıoğlu', 'bbc_screenshot'),
  (104, 25, 639, 600, 94, 'Chema Andrés', 'Osman', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (104, 8, 'bbc_screenshot', true), (104, 25, 'bbc_screenshot', true)
on conflict do nothing;

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select 105, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Liverpool 4-2-3-1
    (15, 350, 'GK', 'Alisson'), (15, 579, 'RB', 'Araujo'), (15, 362, 'RCB', 'Jacquet'), (15, 356, 'LCB', 'Van Dijk'),
    (15, 358, 'LB', 'Kerkez'), (15, 368, 'DM', 'Szoboszlai'), (15, 372, 'DM', 'Mac Allister'), (15, 369, 'RW', 'Ngumoha'),
    (15, 366, 'AM', 'Wirtz'), (15, 627, 'LW', 'Barcola'), (15, 379, 'CF', 'Isak'),
    -- Man Utd 4-2-3-1
    (5, 412, 'GK', 'Lammens'), (5, 420, 'RB', 'Yoro'), (5, 416, 'RCB', 'De Ligt'), (5, 419, 'LCB', 'Martínez'),
    (5, 417, 'LB', 'Diogo Dalot'), (5, 43, 'DM', 'Tielemans'), (5, 432, 'DM', 'Mainoo'), (5, 415, 'RW', 'Dorgu'),
    (5, 426, 'AM', 'Bruno Fernandes'), (5, 428, 'LW', 'Matheus Cunha'), (5, 427, 'CF', 'Mbeumo')
  ) as v(team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select 105, v.team_id, f.season_id, '4-2-3-1', 'bbc_screenshot', 1
  from (values (15), (5)) as v(team_id) join public.fixtures f on f.fixture_id = 105
on conflict (fixture_id, team_id, source_name) do nothing;
