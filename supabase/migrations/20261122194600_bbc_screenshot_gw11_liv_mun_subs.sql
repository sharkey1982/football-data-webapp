-- GW11 Liverpool v Man Utd (105): substitutions for both sides from Chris's
-- BBC screenshots (22 Nov 2026 19:45). All ten checked against FPL live
-- minutes; FPL shows no other substitute appearances, so coverage is
-- complete. (Yoro was sent off on 8 minutes; Maguire replaced Mbeumo on 22.)
-- Safe to re-run.
insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  -- Liverpool
  (105, 15, 372, 375, 72, 'Mac Allister', 'Nyoni', 'bbc_screenshot'),
  (105, 15, 627, 377, 72, 'Barcola', 'Víctor Muñoz', 'bbc_screenshot'),
  (105, 15, 369, 357, 78, 'Ngumoha', 'Frimpong', 'bbc_screenshot'),
  (105, 15, 579, 359, 85, 'Araujo', 'J. Gomez', 'bbc_screenshot'),
  (105, 15, 379, 381, 85, 'Isak', 'Koumas', 'bbc_screenshot'),
  -- Man Utd
  (105, 5, 427, 418, 22, 'Mbeumo', 'Maguire', 'bbc_screenshot'),
  (105, 5, 428, 440, 46, 'Matheus Cunha', 'Zirkzee', 'bbc_screenshot'),
  (105, 5, 43, 430, 65, 'Tielemans', 'Mount', 'bbc_screenshot'),
  (105, 5, 415, 422, 65, 'Dorgu', 'Mazraoui', 'bbc_screenshot'),
  (105, 5, 432, 162, 87, 'Mainoo', 'Andrey Santos', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (105, 15, 'bbc_screenshot', true), (105, 5, 'bbc_screenshot', true)
on conflict do nothing;
