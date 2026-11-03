-- GW9 substitutions from Chris's BBC screenshots (3 Nov 2026, 07:19):
-- Newcastle v Everton (87). Checked against FPL live minutes. All starters of
-- both sides are visible, so coverage is complete (Newcastle five changes,
-- Everton three). Stoppage time is stored as 90+n. Safe to re-run.
insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  (87, 17, 405, 462, 64, 'González', 'Steur', 'bbc_screenshot'),
  (87, 17, 460, 464, 64, 'Willock', 'Wissa', 'bbc_screenshot'),
  (87, 17, 458, 456, 75, 'Joelinton', 'J. Ramsey', 'bbc_screenshot'),
  (87, 17, 454, 457, 76, 'Elanga', 'J. Murphy', 'bbc_screenshot'),
  (87, 17, 593, 461, 87, 'Dedic', 'Touré', 'bbc_screenshot'),
  (87, 4, 249, 209, 80, 'Barry', 'Johnson', 'bbc_screenshot'),
  (87, 4, 230, 231, 82, 'Branthwaite', 'Keane', 'bbc_screenshot'),
  (87, 4, 242, 247, 92, 'George', 'Hackney', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (87, 17, 'bbc_screenshot', true), (87, 4, 'bbc_screenshot', true)
on conflict do nothing;
