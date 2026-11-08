-- GW10 Man United v Aston Villa (96, Sun 8 Nov) line-ups and substitutions
-- from Chris's BBC screenshots (19:02 to 19:03). Keeper at the TOP: the left
-- of the image is the team's right. Every substitution checked against FPL
-- live minutes. All starters of both sides are visible, so sub coverage is
-- complete. Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Man United 4-2-3-1
    (96, 5, 412, 'GK', 'Lammens'), (96, 5, 422, 'RB', 'Mazraoui'), (96, 5, 420, 'RCB', 'Yoro'), (96, 5, 418, 'LCB', 'Maguire'),
    (96, 5, 417, 'LB', 'Diogo Dalot'), (96, 5, 43, 'DM', 'Tielemans'), (96, 5, 432, 'DM', 'Mainoo'), (96, 5, 431, 'RW', 'Diallo'),
    (96, 5, 426, 'AM', 'Bruno Fernandes'), (96, 5, 428, 'LW', 'Matheus Cunha'), (96, 5, 427, 'CF', 'Mbeumo'),
    -- Aston Villa 4-2-3-1
    (96, 10, 597, 'GK', 'Suzuki'), (96, 10, 630, 'RB', 'Harwood-Bellis'), (96, 10, 37, 'RCB', 'Lindelöf'), (96, 10, 34, 'LCB', 'Pau Torres'),
    (96, 10, 36, 'LB', 'Maatsen'), (96, 10, 47, 'DM', 'Kamara'), (96, 10, 618, 'DM', 'Goretzka'), (96, 10, 52, 'RW', 'Alysson'),
    (96, 10, 45, 'AM', 'McGinn'), (96, 10, 53, 'LW', 'Manzambi'), (96, 10, 166, 'CF', 'N. Jackson')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (96, 5, '4-2-3-1'), (96, 10, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  (96, 5, 418, 421, 46, 'Maguire', 'Heaven', 'bbc_screenshot'),
  (96, 5, 417, 415, 66, 'Diogo Dalot', 'Dorgu', 'bbc_screenshot'),
  (96, 5, 43, 430, 66, 'Tielemans', 'Mount', 'bbc_screenshot'),
  (96, 5, 431, 435, 66, 'Diallo', 'Lacey', 'bbc_screenshot'),
  (96, 5, 427, 440, 83, 'Mbeumo', 'Zirkzee', 'bbc_screenshot'),
  (96, 10, 45, 51, 71, 'McGinn', 'Hemmings', 'bbc_screenshot'),
  (96, 10, 52, 46, 71, 'Alysson', 'Barkley', 'bbc_screenshot'),
  (96, 10, 618, 631, 78, 'Goretzka', 'Mbaye', 'bbc_screenshot'),
  (96, 10, 53, 54, 78, 'Manzambi', 'João Gomes', 'bbc_screenshot'),
  (96, 10, 166, 582, 86, 'N. Jackson', 'Madjo', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (96, 5, 'bbc_screenshot', true), (96, 10, 'bbc_screenshot', true)
on conflict do nothing;
