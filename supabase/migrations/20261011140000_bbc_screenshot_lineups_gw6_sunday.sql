-- GW6 Sunday line-ups from Chris's BBC screenshots (11 Oct 2026):
-- Hull v Everton (fixture 56) and Crystal Palace v Nottingham Forest (55).
-- Read with the keeper at the TOP: the left of the image is the team's right.
-- Same handling as 20261010190000: positions into fixture_lineup_positions,
-- formations into team_match_tactics, and corrections to seeded roles
-- (never admin-set rows):
--   - generic DEF/MID rows seen starting in a set position get it, behind
--     the existing first choice (Keane LCB, Johnson RW, Aina RCB,
--     Diomande CB, Lerma CB, Gelhardt RW, Thomas LW);
--   - Mendy (a defender) was seeded at left wing; he played left centre-back;
--   - one-off moves become "also plays" (Branthwaite LB, Coyle RWB,
--     Ajayi RCB, Egan CB, Ndoye RW, Gibbs-White LW, Lerma CM).
-- Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (56, 8, 572, 'GK', 'Tzolakis'), (56, 8, 280, 'RWB', 'Coyle'), (56, 8, 279, 'RCB', 'Ajayi'), (56, 8, 277, 'CB', 'Egan'),
    (56, 8, 586, 'LCB', 'Mendy'), (56, 8, 282, 'LWB', 'Giles'), (56, 8, 340, 'RW', 'Gelhardt'), (56, 8, 289, 'CM', 'Crooks'),
    (56, 8, 290, 'CM', 'Slater'), (56, 8, 642, 'LW', 'Thomas'), (56, 8, 295, 'CF', 'McBurnie'),
    (56, 4, 226, 'GK', 'Pickford'), (56, 4, 649, 'RB', 'Maitland-Niles'), (56, 4, 229, 'RCB', 'Tarkowski'), (56, 4, 231, 'LCB', 'Keane'),
    (56, 4, 230, 'LB', 'Branthwaite'), (56, 4, 239, 'DM', 'Garner'), (56, 4, 244, 'DM', 'Armstrong'), (56, 4, 209, 'RW', 'Johnson'),
    (56, 4, 236, 'AM', 'Dewsbury-Hall'), (56, 4, 238, 'LW', 'Grealish'), (56, 4, 249, 'CF', 'Barry'),
    (55, 2, 199, 'GK', 'Benitez'), (55, 2, 202, 'RCB', 'Richards'), (55, 2, 213, 'CB', 'Lerma'), (55, 2, 203, 'LCB', 'Canvot'),
    (55, 2, 588, 'RWB', 'Khalaili'), (55, 2, 644, 'CM', 'Timber'), (55, 2, 210, 'CM', 'Wharton'), (55, 2, 204, 'LWB', 'Mitchell'),
    (55, 2, 214, 'RW', 'Kamada'), (55, 2, 211, 'LW', 'Pino'), (55, 2, 222, 'CF', 'Strand Larsen'),
    (55, 37, 467, 'GK', 'Sels'), (55, 37, 473, 'RCB', 'Aina'), (55, 37, 581, 'CB', 'Diomande'), (55, 37, 472, 'LCB', 'Murillo'),
    (55, 37, 201, 'RWB', 'Munoz'), (55, 37, 486, 'CM', 'McAtee'), (55, 37, 558, 'CM', 'Schlager'), (55, 37, 469, 'LWB', 'Williams'),
    (55, 37, 483, 'RW', 'Ndoye'), (55, 37, 480, 'LW', 'Gibbs-White'), (55, 37, 167, 'CF', 'Delap')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (56, 8, '5-4-1'), (56, 4, '4-2-3-1'), (55, 2, '3-4-2-1'), (55, 37, '3-4-2-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

update public.team_player_tactical_defaults d
   set tactical_role = c.new_role, depth_rank = c.new_rank,
       source_name = 'bbc_screenshot', depth_rank_source = 'bbc_screenshot', updated_at = now()
  from (values
    (4,  231, 'DEF', 3, 'LCB', 2),   -- Keane
    (4,  209, 'MID', 3, 'RW',  2),   -- Johnson
    (37, 473, 'DEF', 3, 'RCB', 2),   -- Aina
    (37, 581, 'DEF', 3, 'CB',  2),   -- Diomande
    (2,  213, 'MID', 3, 'CB',  2),   -- Lerma
    (8,  340, 'MID', 3, 'RW',  2),   -- Gelhardt
    (8,  642, 'MID', 3, 'LW',  2),   -- Thomas
    (8,  586, 'LW',  1, 'LCB', 1)    -- Mendy: a defender seeded at left wing
  ) as c(team_id, fpl_player_id, old_role, old_rank, new_role, new_rank)
 where d.season_id = public.fpl_current_season_id()
   and d.team_id = c.team_id and d.fpl_player_id = c.fpl_player_id
   and d.tactical_role = c.old_role and d.depth_rank = c.old_rank
   and d.source_name is distinct from 'manual';

insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, v.rank
  from (values
    (4, 230, 'LB', 2),    -- Branthwaite
    (8, 280, 'RWB', 2),   -- Coyle
    (8, 279, 'RCB', 2),   -- Ajayi
    (8, 277, 'CB', 2),    -- Egan
    (37, 483, 'RW', 2),   -- Ndoye
    (37, 480, 'LW', 1),   -- Gibbs-White
    (2, 213, 'CM', 3)     -- Lerma
  ) as v(team_id, fpl_player_id, role, rank)
on conflict do nothing;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
select '2026-10-11', 'data',
  'FPL: GW6 Sunday line-ups from BBC screenshots; seeded roles corrected',
  'Chris supplied BBC line-up screenshots for Hull v Everton and Crystal Palace v Nottingham Forest.',
  '44 rows in fixture_lineup_positions, 4 formations in team_match_tactics, 8 seeded roles corrected, 7 "also plays" positions added.',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261011140000'
where not exists (select 1 from public.model_change_log where reference = 'migration 20261011140000');
