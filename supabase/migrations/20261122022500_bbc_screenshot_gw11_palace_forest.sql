-- GW11 formations from Chris's BBC screenshots (sent 22 Nov 2026, 02:18):
--   Crystal Palace at Coventry (103) and Nottingham Forest at Bournemouth (99).
-- Positions and formation only. Palace's four visible subs went in with
-- 20261121203500; Forest's list (with substitution times) wasn't shown,
-- so no Forest subs are recorded. Keeper at the TOP: the left of the
-- image is the team's right. All 22 starters match FPL GW11 starts.
-- Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Crystal Palace 4-2-3-1
    (103, 2, 198, 'GK', 'Henderson'), (103, 2, 588, 'RB', 'Khalaili'), (103, 2, 153, 'RCB', 'Disasi'), (103, 2, 202, 'LCB', 'Richards'),
    (103, 2, 204, 'LB', 'Mitchell'), (103, 2, 644, 'DM', 'Q. Timber'), (103, 2, 210, 'DM', 'Wharton'), (103, 2, 241, 'RW', 'McNeil'),
    (103, 2, 214, 'AM', 'Kamada'), (103, 2, 211, 'LW', 'Yéremy Pino'), (103, 2, 222, 'CF', 'Strand Larsen'),
    -- Nottingham Forest 3-4-2-1
    (99, 37, 467, 'GK', 'Sels'), (99, 37, 474, 'RCB', 'Jair Cunha'), (99, 37, 471, 'CB', 'Milenković'), (99, 37, 472, 'LCB', 'Murillo'),
    (99, 37, 201, 'RWB', 'Muñoz'), (99, 37, 486, 'CM', 'McAtee'), (99, 37, 489, 'CM', 'Yates'), (99, 37, 469, 'LWB', 'N. Williams'),
    (99, 37, 483, 'RW', 'Ndoye'), (99, 37, 480, 'LW', 'Gibbs-White'), (99, 37, 167, 'CF', 'Delap')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (103, 2, '4-2-3-1'), (99, 37, '3-4-2-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;
