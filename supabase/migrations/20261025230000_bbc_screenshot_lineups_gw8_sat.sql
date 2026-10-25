-- GW8 Saturday line-ups from Chris's BBC screenshots (25 Oct 2026):
-- Chelsea v Spurs (71) and Coventry v Fulham (72). Keeper at the TOP: the
-- left of the image is the team's right. All starters match FPL's minutes
-- and all substitutes the rest. Chelsea, Spurs and Fulham all 4-2-3-1.
-- Coventry: only the player list was sent (no pitch view, keeper cut off;
-- FPL minutes give Rushworth), so no formation or positions for them, only
-- their substitutions. Positions seen that differ from the main one go in as
-- "also plays", rank 2 (CM/DM pivot swaps and CB sides not added). Palmer was
-- sent off at 80'. Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (71, 20, 560, 'GK', 'Penders'),
    (71, 20, 151, 'RB', 'Acheampong'),
    (71, 20, 200, 'RCB', 'Lacroix'),
    (71, 20, 149, 'LCB', 'Colwill'),
    (71, 20, 148, 'LB', 'Hato'),
    (71, 20, 159, 'DM', 'Caicedo'),
    (71, 20, 101, 'DM', 'Henderson'),
    (71, 20, 156, 'RW', 'Pedro Neto'),
    (71, 20, 154, 'AM', 'Palmer'),
    (71, 20, 164, 'LW', 'Geovany Quenda'),
    (71, 20, 40, 'CF', 'Rogers'),
    (71, 14, 496, 'GK', 'Kinsky'),
    (71, 14, 522, 'RB', 'Gray'),
    (71, 14, 112, 'RCB', 'van Hecke'),
    (71, 14, 503, 'LCB', 'van de Ven'),
    (71, 14, 502, 'LB', 'Robertson'),
    (71, 14, 455, 'DM', 'Tonali'),
    (71, 14, 525, 'DM', 'Mateus Fernandes'),
    (71, 14, 512, 'RW', 'Kudus'),
    (71, 14, 515, 'AM', 'Maddison'),
    (71, 14, 514, 'LW', 'Tel'),
    (71, 14, 401, 'CF', 'Omar Marmoush'),
    (72, 32, 250, 'GK', 'Leno'),
    (72, 32, 258, 'RB', 'Castagne'),
    (72, 32, 650, 'RCB', 'Affengruber'),
    (72, 32, 257, 'LCB', 'Bassey'),
    (72, 32, 254, 'LB', 'Robinson'),
    (72, 32, 580, 'DM', 'Charles'),
    (72, 32, 635, 'DM', 'Larsson'),
    (72, 32, 264, 'RW', 'Bobb'),
    (72, 32, 268, 'AM', 'King'),
    (72, 32, 261, 'LW', 'Iwobi'),
    (72, 32, 569, 'CF', 'Gonzalo García')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (71, 20, '4-2-3-1'), (71, 14, '4-2-3-1'), (72, 32, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, 2
  from (values
    (20, 151, 'RB'),   -- Acheampong (main LCB)
    (20, 148, 'LB'),   -- Hato (main LWB)
    (20, 156, 'RW'),   -- Pedro Neto (main RWB)
    (20, 154, 'AM'),   -- Palmer (main RW)
    (20, 164, 'LW'),   -- Quenda (main MID)
    (20, 40, 'CF'),    -- Rogers (main LW)
    (14, 525, 'DM'),   -- Mateus Fernandes (main MID)
    (14, 515, 'AM'),   -- Maddison (main MID)
    (32, 635, 'DM')    -- Larsson (main MID)
  ) as v(team_id, fpl_player_id, role)
on conflict do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
select v.*, 'bbc_screenshot'
  from (values
    (71, 20, 148, 152, 65, 'Hato', 'Palestra'),
    (71, 20, 164, 157, 72, 'Geovany Quenda', 'Estêvão'),
    (71, 20, 156, 136, 88, 'Pedro Neto', 'Welbeck'),
    (71, 14, 515, 519, 51, 'Maddison', 'Gallagher'),
    (71, 14, 502, 499, 65, 'Robertson', 'Pedro Porro'),
    (71, 14, 401, 526, 65, 'Omar Marmoush', 'Solanke'),
    (71, 14, 514, 508, 89, 'Tel', 'Davies'),
    (71, 14, 512, 521, 89, 'Kudus', 'Kulusevski'),
    (72, 48, 173, 656, 60, 'Thomas', 'Mfuni'),
    (72, 48, 575, 104, 67, 'Yirenkyi', 'Onyeka'),
    (72, 48, 194, 186, 67, 'Thomas-Asante', 'Mason-Clark'),
    (72, 48, 599, 492, 67, 'Cherif', 'Awoniyi'),
    (72, 48, 185, 584, 86, 'Sakamoto', 'Hamer'),
    (72, 32, 635, 265, 63, 'Larsson', 'Berge'),
    (72, 32, 261, 570, 74, 'Iwobi', 'César Palacios'),
    (72, 32, 569, 271, 74, 'Gonzalo García', 'Rodrigo Muniz'),
    (72, 32, 268, 266, 81, 'King', 'Cairney'),
    (72, 32, 264, 256, 81, 'Bobb', 'Tete')
  ) as v(fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on)
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
select v.fixture_id, v.team_id, 'bbc_screenshot', v.complete
  from (values (71, 20, true), (71, 14, true), (72, 48, true), (72, 32, true)) as v(fixture_id, team_id, complete)
on conflict do nothing;
