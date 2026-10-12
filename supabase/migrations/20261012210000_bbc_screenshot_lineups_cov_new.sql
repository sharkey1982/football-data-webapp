-- GW6 Coventry v Newcastle (fixture 54) from Chris's BBC screenshots
-- (12 Oct 2026). Keeper at the TOP: the left of the image is the team's
-- right. Per Chris (11 Oct), positions seen go in only as "also plays";
-- no player's main position or rank is changed. Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (54, 48, 110, 'GK', 'Rushworth'), (54, 48, 175, 'RB', 'van Ewijk'), (54, 48, 173, 'RCB', 'Thomas'), (54, 48, 91, 'LCB', 'Pinnock'),
    (54, 48, 176, 'LB', 'Dasilva'), (54, 48, 575, 'DM', 'Yirenkyi'), (54, 48, 184, 'DM', 'Grimes'), (54, 48, 194, 'RW', 'Thomas-Asante'),
    (54, 48, 183, 'AM', 'Rudoni'), (54, 48, 186, 'LW', 'Mason-Clark'), (54, 48, 599, 'CF', 'Cherif'),
    (54, 17, 567, 'GK', 'Hornicek'), (54, 17, 459, 'RB', 'Miley'), (54, 17, 445, 'RCB', 'Thiaw'), (54, 17, 447, 'LCB', 'Botman'),
    (54, 17, 449, 'LB', 'Hall'), (54, 17, 405, 'DM', 'Gonzalez'), (54, 17, 460, 'DM', 'Willock'), (54, 17, 457, 'RW', 'Murphy'),
    (54, 17, 464, 'AM', 'Wissa'), (54, 17, 453, 'LW', 'Barnes'), (54, 17, 634, 'CF', 'Fernandez-Pardo')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (54, 48, '4-2-3-1'), (54, 17, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

-- Positions seen that differ from each player's main one.
insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, 2
  from (values
    (48, 91, 'LCB'),    -- Pinnock (listed DEF)
    (48, 575, 'DM'),    -- Yirenkyi (listed MID)
    (48, 194, 'RW'),    -- Thomas-Asante (listed CF)
    (48, 183, 'AM'),    -- Rudoni (listed MID)
    (17, 459, 'RB'),    -- Miley (listed MID)
    (17, 457, 'RW')     -- Murphy (listed MID)
  ) as v(team_id, fpl_player_id, role)
on conflict do nothing;
