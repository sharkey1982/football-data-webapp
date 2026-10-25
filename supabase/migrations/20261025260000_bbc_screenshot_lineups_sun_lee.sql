-- GW8 line-up from Chris's BBC screenshots (25 Oct 2026, 17:15, in play):
-- Sunderland v Leeds (78). Keeper at the TOP: the left of the image is the
-- team's right. All 22 starters match FPL's live minutes. Substitutions to
-- follow. Positions seen that differ from the main one go in as "also
-- plays", rank 2 (CM/DM pivot swaps and CB sides not added). Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Sunderland 4-2-3-1
    (78, 12, 529, 'GK', 'Roefs'), (78, 12, 534, 'RB', 'Hume'), (78, 12, 533, 'RCB', 'Mukiele'), (78, 12, 539, 'LCB', 'O''Nien'),
    (78, 12, 536, 'LB', 'Reinildo Mandava'), (78, 12, 544, 'DM', 'Xhaka'), (78, 12, 545, 'DM', 'Sadiki'), (78, 12, 548, 'RW', 'Rigg'),
    (78, 12, 542, 'AM', 'Le Fée'), (78, 12, 551, 'LW', 'Angulo'), (78, 12, 552, 'CF', 'Brobbey'),
    -- Leeds 3-4-2-1
    (78, 36, 385, 'GK', 'Trafford'), (78, 36, 332, 'RCB', 'Justin'), (78, 36, 327, 'CB', 'Bijol'), (78, 36, 334, 'LCB', 'Muharemović'),
    (78, 36, 330, 'RWB', 'Bogle'), (78, 36, 338, 'CM', 'Ampadu'), (78, 36, 345, 'CM', 'Tanaka'), (78, 36, 331, 'LWB', 'Gudmundsson'),
    (78, 36, 260, 'RW', 'Wilson'), (78, 36, 337, 'LW', 'Aaronson'), (78, 36, 346, 'CF', 'Calvert-Lewin')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (78, 12, '4-2-3-1'), (78, 36, '3-4-2-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, 2
  from (values
    (12, 533, 'RCB'),  -- Mukiele (main RB)
    (12, 539, 'LCB'),  -- O'Nien (main DEF)
    (12, 548, 'RW'),   -- Rigg (main MID)
    (36, 337, 'LW')    -- Aaronson (main MID)
  ) as v(team_id, fpl_player_id, role)
on conflict do nothing;
