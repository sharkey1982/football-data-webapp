-- GW8 line-up from Chris's BBC screenshots (25 Oct 2026): Arsenal v Everton
-- (379), Saturday 24 Oct, 2-0. Keeper at the TOP: the left of the image is the
-- team's right. Both 4-2-3-1. All 22 starters match FPL's minutes (67-90) and
-- all 8 substitutes the rest. Positions seen that differ from the main one go
-- in as "also plays", rank 2 (Garner DM v main CM is a pivot swap: not added).
-- No main position changed. Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (379, 1, 1, 'GK', 'Raya'),
    (379, 1, 10, 'RB', 'White'),
    (379, 1, 31, 'RCB', 'Konsa'),
    (379, 1, 4, 'LCB', 'Gabriel'),
    (379, 1, 7, 'LB', 'Lewis-Skelly'),
    (379, 1, 13, 'DM', 'Rice'),
    (379, 1, 17, 'DM', 'Merino'),
    (379, 1, 16, 'RW', 'Madueke'),
    (379, 1, 15, 'AM', 'Ødegaard'),
    (379, 1, 14, 'LW', 'Eze'),
    (379, 1, 25, 'CF', 'Gyökeres'),
    (379, 4, 226, 'GK', 'Pickford'),
    (379, 4, 246, 'RB', 'Röhl'),
    (379, 4, 229, 'RCB', 'Tarkowski'),
    (379, 4, 232, 'LCB', 'O''Brien'),
    (379, 4, 233, 'LB', 'Mykolenko'),
    (379, 4, 244, 'DM', 'Armstrong'),
    (379, 4, 239, 'DM', 'Garner'),
    (379, 4, 209, 'RW', 'Johnson'),
    (379, 4, 236, 'AM', 'Dewsbury-Hall'),
    (379, 4, 242, 'LW', 'George'),
    (379, 4, 249, 'CF', 'Barry')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (379, 1, '4-2-3-1'), (379, 4, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, 2
  from (values
    (1, 7, 'LB'),     -- Lewis-Skelly (main DM)
    (1, 17, 'DM'),    -- Merino (main AM), in the double pivot with Rice
    (4, 246, 'RB'),   -- Röhl (main MID)
    (4, 232, 'LCB'),  -- O'Brien (main DEF)
    (4, 242, 'LW')    -- George (main RW)
  ) as v(team_id, fpl_player_id, role)
on conflict do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
select v.*, 'bbc_screenshot'
  from (values
    (379, 1, 7, 8, 68, 'Lewis-Skelly', 'Calafiori'),
    (379, 1, 17, 452, 68, 'Merino', 'Bruno Guimarães'),
    (379, 1, 25, 26, 68, 'Gyökeres', 'Havertz'),
    (379, 1, 13, 19, 80, 'Rice', 'Zubimendi'),
    (379, 1, 14, 20, 80, 'Eze', 'Dowman'),
    (379, 4, 209, 245, 72, 'Johnson', 'Dibling'),
    (379, 4, 233, 247, 74, 'Mykolenko', 'Hackney'),
    (379, 4, 236, 243, 86, 'Dewsbury-Hall', 'Alcaraz')
  ) as v(fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on)
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
select v.fixture_id, v.team_id, 'bbc_screenshot', v.complete
  from (values (379, 1, true), (379, 4, true)) as v(fixture_id, team_id, complete)
on conflict do nothing;
