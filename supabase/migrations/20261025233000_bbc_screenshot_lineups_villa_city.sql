-- GW8 line-up from Chris's BBC screenshots (25 Oct 2026): Aston Villa v Man
-- City (380), Saturday 24 Oct. Keeper at the TOP: the left of the image is
-- the team's right. Both 4-2-3-1. All 22 starters match FPL's minutes and
-- all 8 substitutes the rest (City made two half-time changes). Positions
-- seen that differ from the main one go in as "also plays", rank 2 (CM/DM
-- pivot swaps and CB sides not added). Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (380, 10, 597, 'GK', 'Suzuki'),
    (380, 10, 32, 'RB', 'Cash'),
    (380, 10, 37, 'RCB', 'Lindelöf'),
    (380, 10, 34, 'LCB', 'Pau Torres'),
    (380, 10, 36, 'LB', 'Maatsen'),
    (380, 10, 47, 'DM', 'Kamara'),
    (380, 10, 54, 'DM', 'João Gomes'),
    (380, 10, 52, 'RW', 'Alysson'),
    (380, 10, 45, 'AM', 'McGinn'),
    (380, 10, 53, 'LW', 'Manzambi'),
    (380, 10, 166, 'CF', 'Jackson'),
    (380, 18, 384, 'GK', 'Donnarumma'),
    (380, 18, 393, 'RB', 'Khusanov'),
    (380, 18, 388, 'RCB', 'Guéhi'),
    (380, 18, 390, 'LCB', 'Rúben Dias'),
    (380, 18, 391, 'LB', 'Gvardiol'),
    (380, 18, 481, 'DM', 'Anderson'),
    (380, 18, 155, 'DM', 'Fernández'),
    (380, 18, 237, 'RW', 'Ndiaye'),
    (380, 18, 399, 'AM', 'Cherki'),
    (380, 18, 400, 'LW', 'Doku'),
    (380, 18, 411, 'CF', 'Haaland')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (380, 10, '4-2-3-1'), (380, 18, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, 2
  from (values
    (10, 45, 'AM'),    -- McGinn (main RW)
    (10, 52, 'RW'),    -- Alysson (main MID)
    (18, 393, 'RB')    -- Khusanov (main DEF)
  ) as v(team_id, fpl_player_id, role)
on conflict do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
select v.*, 'bbc_screenshot'
  from (values
    (380, 10, 52, 631, 59, 'Alysson', 'Mbaye'),
    (380, 10, 53, 41, 66, 'Manzambi', 'Buendía'),
    (380, 10, 45, 46, 66, 'McGinn', 'Barkley'),
    (380, 10, 54, 618, 82, 'João Gomes', 'Goretzka'),
    (380, 10, 166, 582, 82, 'Jackson', 'Madjo'),
    (380, 18, 388, 395, 46, 'Guéhi', 'Lewis'),
    (380, 18, 399, 398, 46, 'Cherki', 'Foden'),
    (380, 18, 237, 621, 69, 'Ndiaye', 'McAidoo')
  ) as v(fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on)
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
select v.fixture_id, v.team_id, 'bbc_screenshot', v.complete
  from (values (380, 10, true), (380, 18, true)) as v(fixture_id, team_id, complete)
on conflict do nothing;
