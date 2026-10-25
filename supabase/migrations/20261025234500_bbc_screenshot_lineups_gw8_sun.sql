-- GW8 Sunday 14:00 team sheets from Chris's BBC screenshots, sent at 13:33,
-- before kick-off (25 Oct 2026): Crystal Palace v Newcastle (73), Hull v
-- Brentford (74), Liverpool v Brighton (76), Man Utd v Bournemouth (77).
-- Keeper at the TOP: the left of the image is the team's right. Starting XIs
-- and formations only; substitutions are added from a later screenshot.
-- Positions seen that differ from the main one go in as "also plays",
-- rank 2 (CM/DM pivot swaps and CB sides not added). Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Crystal Palace 3-4-2-1
    (73, 2, 199, 'GK', 'Benítez'), (73, 2, 202, 'RCB', 'Richards'), (73, 2, 153, 'CB', 'Disasi'), (73, 2, 203, 'LCB', 'Canvot'),
    (73, 2, 588, 'RWB', 'Khalaili'), (73, 2, 210, 'CM', 'Wharton'), (73, 2, 214, 'CM', 'Kamada'), (73, 2, 204, 'LWB', 'Mitchell'),
    (73, 2, 241, 'RW', 'McNeil'), (73, 2, 211, 'LW', 'Pino'), (73, 2, 223, 'CF', 'Mateta'),
    -- Newcastle 4-2-3-1
    (73, 17, 567, 'GK', 'Horníček'), (73, 17, 593, 'RB', 'Dedic'), (73, 17, 446, 'RCB', 'Schär'), (73, 17, 448, 'LCB', 'Burn'),
    (73, 17, 449, 'LB', 'Hall'), (73, 17, 405, 'DM', 'González'), (73, 17, 458, 'DM', 'Joelinton'), (73, 17, 457, 'RW', 'Murphy'),
    (73, 17, 460, 'AM', 'Willock'), (73, 17, 453, 'LW', 'Barnes'), (73, 17, 465, 'CF', 'Osula'),
    -- Hull 5-4-1
    (74, 8, 572, 'GK', 'Tzolakis'), (74, 8, 280, 'RWB', 'Coyle'), (74, 8, 279, 'RCB', 'Ajayi'), (74, 8, 277, 'CB', 'Egan'),
    (74, 8, 585, 'LCB', 'Herrington'), (74, 8, 282, 'LWB', 'Giles'), (74, 8, 286, 'RW', 'Belloumi'), (74, 8, 240, 'CM', 'Iroegbunam'),
    (74, 8, 290, 'CM', 'Slater'), (74, 8, 576, 'LW', 'Stroud'), (74, 8, 295, 'CF', 'McBurnie'),
    -- Brentford 4-2-3-1
    (74, 23, 82, 'GK', 'Kelleher'), (74, 23, 88, 'RB', 'Kayode'), (74, 23, 85, 'RCB', 'van den Berg'), (74, 23, 87, 'LCB', 'Ajer'),
    (74, 23, 90, 'LB', 'Hickey'), (74, 23, 97, 'DM', 'Jensen'), (74, 23, 565, 'DM', 'Sangaré'), (74, 23, 95, 'RW', 'Ouattara'),
    (74, 23, 94, 'AM', 'Schade'), (74, 23, 86, 'LW', 'Lewis-Potter'), (74, 23, 106, 'CF', 'Igor Thiago'),
    -- Liverpool 4-2-3-1
    (76, 15, 350, 'GK', 'Alisson Becker'), (76, 15, 579, 'RB', 'Araujo'), (76, 15, 362, 'RCB', 'Jacquet'), (76, 15, 356, 'LCB', 'van Dijk'),
    (76, 15, 358, 'LB', 'Kerkez'), (76, 15, 371, 'DM', 'Gravenberch'), (76, 15, 372, 'DM', 'Mac Allister'), (76, 15, 367, 'RW', 'Gakpo'),
    (76, 15, 366, 'AM', 'Wirtz'), (76, 15, 627, 'LW', 'Barcola'), (76, 15, 379, 'CF', 'Isak'),
    -- Brighton 4-2-3-1
    (76, 25, 109, 'GK', 'Verbruggen'), (76, 25, 113, 'RB', 'Kadioglu'), (76, 25, 504, 'RCB', 'Vuskovic'), (76, 25, 116, 'LCB', 'Dunk'),
    (76, 25, 114, 'LB', 'Boscagli'), (76, 25, 124, 'DM', 'Groß'), (76, 25, 639, 'DM', 'Chema Andrés'), (76, 25, 127, 'RW', 'Gómez'),
    (76, 25, 129, 'AM', 'Ayari'), (76, 25, 115, 'LW', 'De Cuyper'), (76, 25, 138, 'CF', 'Kostoulas'),
    -- Man Utd 4-2-3-1
    (77, 5, 412, 'GK', 'Lammens'), (77, 5, 417, 'RB', 'Diogo Dalot'), (77, 5, 420, 'RCB', 'Yoro'), (77, 5, 418, 'LCB', 'Maguire'),
    (77, 5, 421, 'LB', 'Heaven'), (77, 5, 162, 'DM', 'Andrey Santos'), (77, 5, 131, 'DM', 'Baleba'), (77, 5, 431, 'RW', 'Diallo'),
    (77, 5, 43, 'AM', 'Tielemans'), (77, 5, 430, 'LW', 'Mount'), (77, 5, 427, 'CF', 'Mbeumo'),
    -- Bournemouth 4-2-3-1
    (77, 30, 57, 'GK', 'Petrović'), (77, 30, 64, 'RB', 'Smith'), (77, 30, 60, 'RCB', 'Hill'), (77, 30, 566, 'LCB', 'António Silva'),
    (77, 30, 61, 'LB', 'Truffert'), (77, 30, 73, 'DM', 'Adams'), (77, 30, 71, 'DM', 'Cook'), (77, 30, 67, 'RW', 'Rayan'),
    (77, 30, 70, 'AM', 'Kluivert'), (77, 30, 68, 'LW', 'Tavernier'), (77, 30, 79, 'CF', 'Evanilson')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (73, 2, '3-4-2-1'), (73, 17, '4-2-3-1'), (74, 8, '5-4-1'), (74, 23, '4-2-3-1'),
               (76, 15, '4-2-3-1'), (76, 25, '4-2-3-1'), (77, 5, '4-2-3-1'), (77, 30, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, 2
  from (values
    (2, 214, 'CM'), (2, 241, 'RW'),                                   -- Kamada (main RW), McNeil (MID)
    (17, 446, 'RCB'), (17, 448, 'LCB'), (17, 458, 'DM'), (17, 457, 'RW'), (17, 460, 'AM'),   -- Schär, Burn (DEF), Joelinton, Murphy (MID), Willock (CM)
    (8, 280, 'RWB'), (8, 585, 'LCB'), (8, 286, 'RW'), (8, 240, 'CM'), (8, 576, 'LW'),       -- Coyle (RCB), Herrington (DEF), Belloumi (RWB), Iroegbunam (MID), Stroud (RW)
    (23, 85, 'RCB'), (23, 90, 'LB'), (23, 95, 'RW'), (23, 94, 'AM'), (23, 86, 'LW'),        -- van den Berg, Hickey (DEF), Ouattara (CM), Schade (LW), Lewis-Potter (LB)
    (25, 129, 'AM'),                                                  -- Ayari (DM)
    (5, 420, 'RCB'), (5, 421, 'LB'), (5, 162, 'DM'), (5, 131, 'DM'), (5, 43, 'AM'), (5, 430, 'LW'), (5, 427, 'CF')
                                                                      -- Yoro (RB), Heaven (DEF), Santos, Baleba (MID), Tielemans (DM), Mount (MID), Mbeumo (RW)
  ) as v(team_id, fpl_player_id, role)
on conflict do nothing;
