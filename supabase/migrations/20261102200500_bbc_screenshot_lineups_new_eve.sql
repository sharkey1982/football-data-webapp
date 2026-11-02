-- Newcastle v Everton (87), GW9, from Chris's BBC screenshots of the official
-- team sheets at 20:01, just after the 20:00 kick-off (too late for a team
-- news post). Keeper at the TOP: the left of the image is the team's right.
-- Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Newcastle 4-2-3-1
    (87, 17, 567, 'GK', 'Horníček'), (87, 17, 593, 'RB', 'Dedic'), (87, 17, 446, 'RCB', 'Schär'), (87, 17, 448, 'LCB', 'Burn'),
    (87, 17, 449, 'LB', 'Hall'), (87, 17, 405, 'DM', 'González'), (87, 17, 458, 'DM', 'Joelinton'), (87, 17, 454, 'RW', 'Elanga'),
    (87, 17, 460, 'AM', 'Willock'), (87, 17, 453, 'LW', 'Barnes'), (87, 17, 465, 'CF', 'Osula'),
    -- Everton 4-2-3-1
    (87, 4, 226, 'GK', 'Pickford'), (87, 4, 232, 'RB', 'O''Brien'), (87, 4, 229, 'RCB', 'Tarkowski'), (87, 4, 230, 'LCB', 'Branthwaite'),
    (87, 4, 233, 'LB', 'Mykolenko'), (87, 4, 244, 'DM', 'Armstrong'), (87, 4, 239, 'DM', 'Garner'), (87, 4, 246, 'RW', 'Röhl'),
    (87, 4, 236, 'AM', 'Dewsbury-Hall'), (87, 4, 242, 'LW', 'George'), (87, 4, 249, 'CF', 'Barry')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (87, 17, '4-2-3-1'), (87, 4, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;
