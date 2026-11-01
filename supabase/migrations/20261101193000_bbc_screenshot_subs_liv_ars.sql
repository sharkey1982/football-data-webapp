-- GW9 substitutions from Chris's BBC screenshots (1 Nov 2026, 19:28):
-- Liverpool v Arsenal (85). Checked against FPL live minutes. Both full lists
-- visible, so coverage is complete (Arsenal made four changes). Safe to re-run.
insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  (85, 15, 375, 368, 59, 'Nyoni', 'Szoboszlai', 'bbc_screenshot'),
  (85, 15, 367, 369, 67, 'Gakpo', 'Ngumoha', 'bbc_screenshot'),
  (85, 15, 358, 364, 81, 'Kerkez', 'Tsimikas', 'bbc_screenshot'),
  (85, 15, 579, 377, 81, 'Araujo', 'Víctor Muñoz', 'bbc_screenshot'),
  (85, 15, 366, 381, 81, 'Wirtz', 'Koumas', 'bbc_screenshot'),
  (85, 1, 452, 7, 62, 'Bruno Guimarães', 'Lewis-Skelly', 'bbc_screenshot'),
  (85, 1, 557, 9, 84, 'Tzolis', 'Hincapié', 'bbc_screenshot'),
  (85, 1, 26, 25, 84, 'Havertz', 'Gyökeres', 'bbc_screenshot'),
  (85, 1, 15, 17, 88, 'Ødegaard', 'Mikel Merino', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (85, 15, 'bbc_screenshot', true), (85, 1, 'bbc_screenshot', true)
on conflict do nothing;
