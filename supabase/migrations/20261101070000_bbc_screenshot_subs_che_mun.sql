-- GW9 substitutions from Chris's BBC screenshots (1 Nov 2026, 04:34):
-- Chelsea v Man Utd (82), the last of Saturday's eight. Checked against FPL
-- live minutes. Both full lists visible, so coverage is complete (Man Utd made
-- four changes; Martínez was sent off at 63'). Safe to re-run.
insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  (82, 20, 152, 583, 74, 'Palestra', 'Pep Chavarría', 'bbc_screenshot'),
  (82, 20, 159, 136, 87, 'Caicedo', 'Welbeck', 'bbc_screenshot'),
  (82, 20, 157, 144, 87, 'Estêvão', 'Gusto', 'bbc_screenshot'),
  (82, 20, 156, 568, 87, 'Pedro Neto', 'Barco', 'bbc_screenshot'),
  (82, 20, 154, 164, 97, 'Palmer', 'Geovany Quenda', 'bbc_screenshot'),
  (82, 5, 131, 432, 58, 'Baleba', 'Mainoo', 'bbc_screenshot'),
  (82, 5, 162, 421, 66, 'Andrey Santos', 'Heaven', 'bbc_screenshot'),
  (82, 5, 428, 430, 66, 'Matheus Cunha', 'Mount', 'bbc_screenshot'),
  (82, 5, 431, 440, 77, 'A. Diallo', 'Zirkzee', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (82, 20, 'bbc_screenshot', true), (82, 5, 'bbc_screenshot', true)
on conflict do nothing;
