-- GW11 Brentford v Everton (101, Mon 23 Nov 20:00): both XIs, formations and
-- substitutions from Chris's BBC screenshots (23:50). Every substitution
-- checked against FPL live minutes; FPL shows no other substitute
-- appearances, so coverage is complete. (Tarkowski sent off on 40 minutes.)
-- Keeper at the TOP: the left of the image is the team's right. Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select 101, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Brentford 4-2-3-1
    (23, 82, 'GK', 'Kelleher'), (23, 88, 'RB', 'Kayode'), (23, 87, 'RCB', 'Ajer'), (23, 85, 'LCB', 'van den Berg'),
    (23, 86, 'LB', 'Lewis-Potter'), (23, 102, 'DM', 'Yarmoliuk'), (23, 98, 'DM', 'Janelt'), (23, 95, 'RW', 'Ouattara'),
    (23, 96, 'AM', 'Damsgaard'), (23, 105, 'LW', 'Anthony'), (23, 108, 'CF', 'Wilson'),
    -- Everton 4-2-3-1
    (4, 226, 'GK', 'Pickford'), (4, 232, 'RB', 'O''Brien'), (4, 229, 'RCB', 'Tarkowski'), (4, 230, 'LCB', 'Branthwaite'),
    (4, 233, 'LB', 'Mykolenko'), (4, 244, 'DM', 'Armstrong'), (4, 239, 'DM', 'Garner'), (4, 246, 'RW', 'Röhl'),
    (4, 236, 'AM', 'Dewsbury-Hall'), (4, 242, 'LW', 'George'), (4, 249, 'CF', 'Barry')
  ) as v(team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select 101, v.team_id, f.season_id, '4-2-3-1', 'bbc_screenshot', 1
  from (values (23), (4)) as v(team_id) join public.fixtures f on f.fixture_id = 101
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  -- Brentford
  (101, 23, 95, 94, 66, 'Ouattara', 'Schade', 'bbc_screenshot'),
  (101, 23, 86, 620, 74, 'Lewis-Potter', 'Diouf', 'bbc_screenshot'),
  (101, 23, 102, 97, 74, 'Yarmoliuk', 'Jensen', 'bbc_screenshot'),
  (101, 23, 105, 100, 81, 'Anthony', 'Fábio Carvalho', 'bbc_screenshot'),
  (101, 23, 98, 565, 82, 'Janelt', 'Sangaré', 'bbc_screenshot'),
  -- Everton
  (101, 4, 242, 238, 46, 'George', 'Grealish', 'bbc_screenshot'),
  (101, 4, 236, 247, 69, 'Dewsbury-Hall', 'Hackney', 'bbc_screenshot'),
  (101, 4, 246, 231, 69, 'Röhl', 'Keane', 'bbc_screenshot'),
  (101, 4, 249, 209, 69, 'Barry', 'B. Johnson', 'bbc_screenshot'),
  (101, 4, 239, 21, 85, 'Garner', 'Nørgaard', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (101, 23, 'bbc_screenshot', true), (101, 4, 'bbc_screenshot', true)
on conflict do nothing;
