-- GW11 Hull v Brighton (104, Sun 22 Nov 14:00): both starting XIs and
-- formations from Chris's BBC screenshots at 13:42, before kick-off.
-- Substitutions follow once the game is over. Keeper at the TOP: the left
-- of the image is the team's right. Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select 104, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Hull City 4-2-3-1
    (8, 572, 'GK', 'Tzolakis'), (8, 280, 'RB', 'Coyle'), (8, 279, 'RCB', 'Ajayi'), (8, 586, 'LCB', 'Mendy'),
    (8, 576, 'LB', 'Stroud'), (8, 290, 'DM', 'Slater'), (8, 240, 'DM', 'Iroegbunam'), (8, 286, 'RW', 'Belloumi'),
    (8, 289, 'AM', 'Crooks'), (8, 617, 'LW', 'Cho'), (8, 295, 'CF', 'McBurnie'),
    -- Brighton 4-2-3-1
    (25, 109, 'GK', 'Verbruggen'), (25, 119, 'RB', 'Costinha'), (25, 504, 'RCB', 'Vušković'), (25, 116, 'LCB', 'Dunk'),
    (25, 114, 'LB', 'Boscagli'), (25, 124, 'DM', 'Groß'), (25, 639, 'DM', 'Chema Andrés'), (25, 127, 'RW', 'Gómez'),
    (25, 129, 'AM', 'Ayari'), (25, 115, 'LW', 'De Cuyper'), (25, 125, 'CF', 'Rutter')
  ) as v(team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select 104, v.team_id, f.season_id, '4-2-3-1', 'bbc_screenshot', 1
  from (values (8), (25)) as v(team_id) join public.fixtures f on f.fixture_id = 104
on conflict (fixture_id, team_id, source_name) do nothing;
