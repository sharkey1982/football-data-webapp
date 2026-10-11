-- GW6 Saturday line-ups from Chris's BBC screenshots (11 Oct 2026):
-- Aston Villa v Brentford (52), Chelsea v Bournemouth (53), Sunderland v
-- Brighton (60), Ipswich v Fulham (57) and Man Utd v Spurs (59).
-- Keeper at the TOP: the left of the image is the team's right.
-- Same handling as 20261010190000 / 20261011140000. Rows an admin set are
-- never changed; where a line-up disagrees with one, the position goes in
-- as "also plays" instead (Schuster, Ajer, Colwill, Lewis-Potter, Rayan).
-- Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Aston Villa 4-2-3-1
    (52, 10, 597, 'GK', 'Suzuki'), (52, 10, 32, 'RB', 'Cash'), (52, 10, 37, 'RCB', 'Lindelof'), (52, 10, 33, 'LCB', 'Mings'),
    (52, 10, 596, 'LB', 'Ruggeri'), (52, 10, 47, 'DM', 'Kamara'), (52, 10, 54, 'DM', 'Joao Gomes'), (52, 10, 45, 'RW', 'McGinn'),
    (52, 10, 41, 'AM', 'Buendia'), (52, 10, 53, 'LW', 'Manzambi'), (52, 10, 166, 'CF', 'Jackson'),
    -- Brentford 4-2-3-1
    (52, 23, 82, 'GK', 'Kelleher'), (52, 23, 88, 'RB', 'Kayode'), (52, 23, 93, 'RCB', 'Schuster'), (52, 23, 87, 'LCB', 'Ajer'),
    (52, 23, 620, 'LB', 'Diouf'), (52, 23, 102, 'DM', 'Yarmoliuk'), (52, 23, 98, 'DM', 'Janelt'), (52, 23, 105, 'RW', 'Anthony'),
    (52, 23, 86, 'AM', 'Lewis-Potter'), (52, 23, 94, 'LW', 'Schade'), (52, 23, 106, 'CF', 'Igor Thiago'),
    -- Chelsea 3-4-2-1
    (53, 20, 28, 'GK', 'Martinez'), (53, 20, 151, 'RCB', 'Acheampong'), (53, 20, 200, 'CB', 'Lacroix'), (53, 20, 149, 'LCB', 'Colwill'),
    (53, 20, 156, 'RWB', 'Pedro Neto'), (53, 20, 101, 'CM', 'Henderson'), (53, 20, 159, 'CM', 'Caicedo'), (53, 20, 583, 'LWB', 'Chavarria'),
    (53, 20, 154, 'RW', 'Palmer'), (53, 20, 40, 'LW', 'Rogers'), (53, 20, 165, 'CF', 'Joao Pedro'),
    -- Bournemouth 4-2-3-1
    (53, 30, 57, 'GK', 'Petrovic'), (53, 30, 64, 'RB', 'Smith'), (53, 30, 60, 'RCB', 'Hill'), (53, 30, 566, 'LCB', 'Antonio Silva'),
    (53, 30, 61, 'LB', 'Truffert'), (53, 30, 73, 'DM', 'Adams'), (53, 30, 75, 'DM', 'Christie'), (53, 30, 74, 'RW', 'Brooks'),
    (53, 30, 67, 'AM', 'Rayan'), (53, 30, 68, 'LW', 'Tavernier'), (53, 30, 79, 'CF', 'Evanilson'),
    -- Sunderland 4-2-3-1
    (60, 12, 529, 'GK', 'Roefs'), (60, 12, 534, 'RB', 'Hume'), (60, 12, 533, 'RCB', 'Mukiele'), (60, 12, 501, 'LCB', 'Danso'),
    (60, 12, 536, 'LB', 'Reinildo'), (60, 12, 544, 'DM', 'Xhaka'), (60, 12, 545, 'DM', 'Sadiki'), (60, 12, 541, 'RW', 'Meunier'),
    (60, 12, 542, 'AM', 'Le Fee'), (60, 12, 551, 'LW', 'Angulo'), (60, 12, 553, 'CF', 'Isidor'),
    -- Brighton 4-2-3-1
    (60, 25, 109, 'GK', 'Verbruggen'), (60, 25, 113, 'RB', 'Kadioglu'), (60, 25, 504, 'RCB', 'Vuskovic'), (60, 25, 328, 'LCB', 'Struijk'),
    (60, 25, 114, 'LB', 'Boscagli'), (60, 25, 124, 'DM', 'Gross'), (60, 25, 639, 'DM', 'Chema Andres'), (60, 25, 127, 'RW', 'Gomez'),
    (60, 25, 129, 'AM', 'Ayari'), (60, 25, 115, 'LW', 'De Cuyper'), (60, 25, 138, 'CF', 'Kostoulas'),
    -- Fulham 4-2-3-1 (at Ipswich)
    (57, 32, 250, 'GK', 'Leno'), (57, 32, 256, 'RB', 'Tete'), (57, 32, 650, 'RCB', 'Affengruber'), (57, 32, 257, 'LCB', 'Bassey'),
    (57, 32, 269, 'LB', 'Sessegnon'), (57, 32, 265, 'DM', 'Berge'), (57, 32, 580, 'DM', 'Charles'), (57, 32, 264, 'RW', 'Bobb'),
    (57, 32, 268, 'AM', 'King'), (57, 32, 261, 'LW', 'Iwobi'), (57, 32, 569, 'CF', 'Garcia'),
    -- Spurs 4-2-3-1 (at Man Utd)
    (59, 14, 496, 'GK', 'Kinsky'), (59, 14, 522, 'RB', 'Gray'), (59, 14, 112, 'RCB', 'van Hecke'), (59, 14, 498, 'LCB', 'Senesi'),
    (59, 14, 506, 'LB', 'Udogie'), (59, 14, 520, 'DM', 'Bergvall'), (59, 14, 455, 'DM', 'Tonali'), (59, 14, 512, 'RW', 'Kudus'),
    (59, 14, 519, 'AM', 'Gallagher'), (59, 14, 403, 'LW', 'Savio'), (59, 14, 526, 'CF', 'Solanke'),
    -- Ipswich 4-2-3-1
    (57, 31, 300, 'GK', 'Walton'), (57, 31, 592, 'RB', 'Ouattara'), (57, 31, 259, 'RCB', 'Diop'), (57, 31, 304, 'LCB', 'O''Shea'),
    (57, 31, 305, 'LB', 'Davis'), (57, 31, 267, 'DM', 'Lukic'), (57, 31, 571, 'DM', 'Florentino'), (57, 31, 562, 'RW', 'Maeda'),
    (57, 31, 591, 'AM', 'Enciso'), (57, 31, 318, 'LW', 'Philogene'), (57, 31, 316, 'CF', 'Emersonn'),
    -- Man Utd 4-2-3-1
    (59, 5, 412, 'GK', 'Lammens'), (59, 5, 420, 'RB', 'Yoro'), (59, 5, 418, 'RCB', 'Maguire'), (59, 5, 419, 'LCB', 'Martinez'),
    (59, 5, 423, 'LB', 'Shaw'), (59, 5, 43, 'DM', 'Tielemans'), (59, 5, 432, 'DM', 'Mainoo'), (59, 5, 431, 'RW', 'Diallo'),
    (59, 5, 426, 'AM', 'Bruno Fernandes'), (59, 5, 428, 'LW', 'Matheus Cunha'), (59, 5, 427, 'CF', 'Mbeumo')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (52, 10, '4-2-3-1'), (52, 23, '4-2-3-1'), (53, 20, '3-4-2-1'), (53, 30, '4-2-3-1'),
               (60, 12, '4-2-3-1'), (60, 25, '4-2-3-1'), (57, 32, '4-2-3-1'), (59, 14, '4-2-3-1'),
               (57, 31, '4-2-3-1'), (59, 5, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

update public.team_player_tactical_defaults d
   set tactical_role = c.new_role, depth_rank = c.new_rank,
       source_name = 'bbc_screenshot', depth_rank_source = 'bbc_screenshot', updated_at = now()
  from (values
    (10, 596, 'DEF', 3, 'LB',  2),   -- Ruggeri
    (10, 54,  'MID', 3, 'DM',  2),   -- Joao Gomes
    (10, 53,  'MID', 3, 'LW',  2),   -- Manzambi
    (23, 620, 'DEF', 3, 'LB',  2),   -- Diouf
    (20, 151, 'LCB', 1, 'RCB', 1),   -- Acheampong: seeded on the wrong side
    (20, 101, 'MID', 3, 'CM',  2),   -- Henderson
    (20, 583, 'DEF', 2, 'LWB', 2),   -- Chavarria
    (30, 74,  'MID', 3, 'RW',  2),   -- Brooks
    (12, 534, 'DEF', 3, 'RB',  2),   -- Hume
    (25, 328, 'DEF', 3, 'LCB', 2),   -- Struijk
    (25, 639, 'MID', 3, 'DM',  2),   -- Chema Andres
    (32, 256, 'DEF', 3, 'RB',  2),   -- Tete
    (32, 269, 'DEF', 3, 'LB',  2),   -- Sessegnon
    (14, 498, 'DEF', 3, 'LCB', 2),   -- Senesi
    (14, 506, 'DEF', 3, 'LB',  2),   -- Udogie
    (14, 520, 'MID', 3, 'DM',  2),   -- Bergvall
    (14, 512, 'MID', 3, 'RW',  2),   -- Kudus
    (31, 592, 'DEF', 3, 'RB',  2),   -- Ouattara
    (31, 571, 'MID', 3, 'DM',  2),   -- Florentino
    (31, 318, 'MID', 3, 'LW',  2),   -- Philogene
    (31, 316, 'CF',  2, 'CF',  1),   -- Emersonn: started all six
    (31, 640, 'CF',  1, 'CF',  2),   -- Flemming: no starts in four fit matches
    (5,  420, 'DEF', 3, 'RB',  2),   -- Yoro
    (5,  431, 'MID', 3, 'RW',  2)    -- Amad Diallo
  ) as c(team_id, fpl_player_id, old_role, old_rank, new_role, new_rank)
 where d.season_id = public.fpl_current_season_id()
   and d.team_id = c.team_id and d.fpl_player_id = c.fpl_player_id
   and d.tactical_role = c.old_role and d.depth_rank = c.old_rank
   and d.source_name is distinct from 'manual';

insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, v.rank
  from (values
    (23, 93, 'RCB', 2),   -- Schuster (admin has him LCB)
    (23, 87, 'LCB', 2),   -- Ajer (admin has him RCB)
    (23, 86, 'AM', 2),    -- Lewis-Potter (admin has him LB)
    (20, 149, 'LCB', 2),  -- Colwill (admin has him CB)
    (31, 259, 'RCB', 2),  -- Diop
    (31, 304, 'LCB', 2),  -- O'Shea
    (31, 562, 'RW', 2),   -- Maeda
    (31, 591, 'AM', 2),   -- Enciso
    (5, 428, 'LW', 2),    -- Cunha
    (5, 427, 'CF', 2),    -- Mbeumo
    (30, 75, 'DM', 2),    -- Christie
    (30, 67, 'AM', 2),    -- Rayan (admin has him RW)
    (12, 533, 'RCB', 2),  -- Mukiele
    (12, 501, 'LCB', 2),  -- Danso
    (25, 129, 'AM', 2),   -- Ayari
    (14, 403, 'LW', 2)    -- Savio
  ) as v(team_id, fpl_player_id, role, rank)
on conflict do nothing;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
select '2026-10-11', 'data',
  'FPL: GW6 Saturday line-ups from BBC screenshots; seeded roles corrected',
  'Chris supplied BBC line-up screenshots for all five GW6 Saturday matches: Villa v Brentford, Chelsea v Bournemouth, Sunderland v Brighton, Ipswich v Fulham, Man Utd v Spurs.',
  '110 rows in fixture_lineup_positions, 10 formations, 24 seeded roles corrected, 16 "also plays" positions added (admin-set roles left as they are).',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261011150000'
where not exists (select 1 from public.model_change_log where reference = 'migration 20261011150000');
