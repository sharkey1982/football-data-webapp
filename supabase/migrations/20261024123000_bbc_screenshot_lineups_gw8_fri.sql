-- GW8 Friday line-up from Chris's BBC screenshots (24 Oct 2026): Ipswich v
-- Nott'm Forest (75). Keeper at the TOP: the left of the image is the team's
-- right. All 22 starters match FPL's minutes (each starter 59+ minutes, each
-- substitute the rest). Positions seen go in only as "also plays", rank 2; no
-- main position or rank changed (CM/DM pivot swaps not added). Both full
-- substitution lists were visible: 5 Ipswich subs, 3 Forest subs, checked
-- against FPL minutes. Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (75, 31, 300, 'GK', 'Walton'),
    (75, 31, 592, 'RB', 'Ouattara'),
    (75, 31, 259, 'RCB', 'Diop'),
    (75, 31, 304, 'LCB', 'O''Shea'),
    (75, 31, 305, 'LB', 'Davis'),
    (75, 31, 619, 'DM', 'Palacios'),
    (75, 31, 571, 'DM', 'Florentino'),
    (75, 31, 315, 'RW', 'Abdul Fatawu'),
    (75, 31, 591, 'AM', 'Enciso'),
    (75, 31, 318, 'LW', 'Philogene'),
    (75, 31, 316, 'CF', 'Emersonn'),
    (75, 37, 467, 'GK', 'Sels'),
    (75, 37, 474, 'RCB', 'Jair Cunha'),
    (75, 37, 471, 'CB', 'Milenkovic'),
    (75, 37, 472, 'LCB', 'Murillo'),
    (75, 37, 201, 'RWB', 'Munoz'),
    (75, 37, 486, 'CM', 'McAtee'),
    (75, 37, 558, 'CM', 'Schlager'),
    (75, 37, 469, 'LWB', 'Williams'),
    (75, 37, 480, 'RW', 'Gibbs-White'),
    (75, 37, 483, 'LW', 'Ndoye'),
    (75, 37, 167, 'CF', 'Delap')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (75, 31, '4-2-3-1'), (75, 37, '3-4-2-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

-- Positions seen that differ from each player's main one (the others were already recorded).
insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, 2
  from (values
    (31, 305, 'LB')   -- Davis (listed LWB)
  ) as v(team_id, fpl_player_id, role)
on conflict do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
select v.*, 'bbc_screenshot'
  from (values
    (75, 31, 316, 640, 60, 'Emersonn', 'Flemming'),
    (75, 31, 318, 313, 61, 'Philogene', 'Clarke'),
    (75, 31, 315, 562, 73, 'Abdul Fatawu', 'Maeda'),
    (75, 31, 571, 310, 85, 'Florentino', 'Matusiwa'),
    (75, 31, 591, 320, 86, 'Enciso', 'Akpom'),
    (75, 37, 483, 482, 69, 'Ndoye', 'Hudson-Odoi'),
    (75, 37, 469, 478, 84, 'Williams', 'Netz'),
    (75, 37, 167, 490, 94, 'Delap', 'Wood')
  ) as v(fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on)
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
select v.fixture_id, v.team_id, 'bbc_screenshot', v.complete
  from (values (75, 31, true), (75, 37, true)) as v(fixture_id, team_id, complete)
on conflict do nothing;
