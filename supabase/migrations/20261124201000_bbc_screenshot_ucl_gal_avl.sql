-- Champions League, Galatasaray v Aston Villa (2071, Tue 24 Nov): Villa's XI,
-- formation and substitutions from Chris's BBC screenshots (20:00). Villa
-- made all five substitutions, so coverage is complete. Galatasaray not
-- sent. Keeper at the TOP: the left of the image is the team's right.
-- Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select 2071, 10, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (597, 'GK', 'Suzuki'), (630, 'RB', 'Harwood-Bellis'), (37, 'RCB', 'Lindelöf'), (33, 'LCB', 'Mings'),
    (36, 'LB', 'Maatsen'), (47, 'DM', 'Kamara'), (54, 'DM', 'João Gomes'), (52, 'RW', 'Alysson'),
    (45, 'AM', 'McGinn'), (53, 'LW', 'Manzambi'), (166, 'CF', 'N. Jackson')
  ) as v(fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select 2071, 10, f.season_id, '4-2-3-1', 'bbc_screenshot', 1
  from public.fixtures f where f.fixture_id = 2071
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  (2071, 10, 54, 618, 66, 'João Gomes', 'Goretzka', 'bbc_screenshot'),
  (2071, 10, 52, 631, 66, 'Alysson', 'Mbaye', 'bbc_screenshot'),
  (2071, 10, 53, 51, 74, 'Manzambi', 'Hemmings', 'bbc_screenshot'),
  (2071, 10, 45, 46, 74, 'McGinn', 'Barkley', 'bbc_screenshot'),
  (2071, 10, 47, 41, 82, 'Kamara', 'Buendía', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (2071, 10, 'bbc_screenshot', true)
on conflict do nothing;
