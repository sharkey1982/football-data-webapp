-- GW9 substitutions from Chris's BBC screenshots (1 Nov 2026, 04:02):
-- Bournemouth v Leeds (79). Each checked against FPL live minutes (the player
-- going off played about the minute shown, the one coming on the rest). Both
-- sides' full lists were visible, so coverage is complete. Safe to re-run.
insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  -- Bournemouth
  (79, 30, 75, 71, 68, 'Christie', 'Cook', 'bbc_screenshot'),
  (79, 30, 70, 78, 68, 'Kluivert', 'Kroupi', 'bbc_screenshot'),
  (79, 30, 79, 81, 76, 'Evanilson', 'Á. Rodríguez', 'bbc_screenshot'),
  (79, 30, 64, 62, 88, 'Smith', 'Diakité', 'bbc_screenshot'),
  (79, 30, 67, 77, 88, 'Rayan', 'Adli', 'bbc_screenshot'),
  -- Leeds
  (79, 36, 331, 339, 65, 'Gudmundsson', 'Longstaff', 'bbc_screenshot'),
  (79, 36, 345, 335, 65, 'Tanaka', 'Stach', 'bbc_screenshot'),
  (79, 36, 343, 347, 65, 'James', 'Nmecha', 'bbc_screenshot'),
  (79, 36, 332, 648, 84, 'Justin', 'Bahoya', 'bbc_screenshot'),
  (79, 36, 260, 337, 84, 'Wilson', 'Aaronson', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (79, 30, 'bbc_screenshot', true), (79, 36, 'bbc_screenshot', true)
on conflict do nothing;
