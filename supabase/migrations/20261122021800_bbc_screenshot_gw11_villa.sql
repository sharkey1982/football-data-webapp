-- GW11 Aston Villa 0-0 Sunderland (100): Villa's formation, from Chris's
-- BBC screenshot (sent 22 Nov 2026). Villa's substitutions and coverage
-- went in with 20261121202000. Keeper at the TOP: the left of the image
-- is the team's right. Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select 100, 10, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (597, 'GK', 'Suzuki'), (611, 'RB', 'Wan-Bissaka'), (630, 'RCB', 'Harwood-Bellis'), (34, 'LCB', 'Pau Torres'),
    (36, 'LB', 'Maatsen'), (618, 'DM', 'Goretzka'), (47, 'DM', 'Kamara'), (52, 'RW', 'Alysson'),
    (41, 'AM', 'Buendía'), (53, 'LW', 'Manzambi'), (166, 'CF', 'N. Jackson')
  ) as v(fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select 100, 10, f.season_id, '4-2-3-1', 'bbc_screenshot', 1
  from public.fixtures f where f.fixture_id = 100
on conflict (fixture_id, team_id, source_name) do nothing;
