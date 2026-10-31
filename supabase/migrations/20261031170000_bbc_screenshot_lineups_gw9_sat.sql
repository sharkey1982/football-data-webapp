-- GW9 line-ups from Chris's BBC screenshots (31 Oct 2026, 15:07-15:10):
-- Chelsea v Man Utd (82, 12:30) and five 15:00 games: Bournemouth v Leeds (79),
-- Brentford v Nott'm Forest (81), Coventry v Sunderland (83), Hull v Ipswich (84),
-- Man City v Brighton (86). Keeper at the TOP: the left of the image is the
-- team's right. All 132 starters match FPL's live minutes (BBC's "A. Diallo"
-- is FPL's Amad, "Fernández" at Man City is FPL's Enzo). Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Chelsea 4-2-3-1
    (82, 20, 560, 'GK', 'Penders'), (82, 20, 151, 'RB', 'Acheampong'), (82, 20, 145, 'RCB', 'Fofana'), (82, 20, 149, 'LCB', 'Colwill'),
    (82, 20, 152, 'LB', 'Palestra'), (82, 20, 161, 'DM', 'Lavia'), (82, 20, 159, 'DM', 'Caicedo'), (82, 20, 157, 'RW', 'Estêvão'),
    (82, 20, 154, 'AM', 'Palmer'), (82, 20, 40, 'LW', 'Rogers'), (82, 20, 156, 'CF', 'Pedro Neto'),
    -- Man Utd 4-2-3-1
    (82, 5, 412, 'GK', 'Lammens'), (82, 5, 420, 'RB', 'Yoro'), (82, 5, 418, 'RCB', 'Maguire'), (82, 5, 419, 'LCB', 'Martínez'),
    (82, 5, 417, 'LB', 'Diogo Dalot'), (82, 5, 131, 'DM', 'Baleba'), (82, 5, 162, 'DM', 'Andrey Santos'), (82, 5, 431, 'RW', 'Diallo'),
    (82, 5, 426, 'AM', 'Bruno Fernandes'), (82, 5, 428, 'LW', 'Matheus Cunha'), (82, 5, 427, 'CF', 'Mbeumo'),
    -- Bournemouth 4-2-3-1
    (79, 30, 57, 'GK', 'Petrovic'), (79, 30, 64, 'RB', 'Smith'), (79, 30, 60, 'RCB', 'Hill'), (79, 30, 566, 'LCB', 'António Silva'),
    (79, 30, 61, 'LB', 'Truffert'), (79, 30, 73, 'DM', 'Adams'), (79, 30, 75, 'DM', 'Christie'), (79, 30, 67, 'RW', 'Rayan'),
    (79, 30, 70, 'AM', 'Kluivert'), (79, 30, 68, 'LW', 'Tavernier'), (79, 30, 79, 'CF', 'Evanilson'),
    -- Leeds 3-4-2-1
    (79, 36, 385, 'GK', 'Trafford'), (79, 36, 332, 'RCB', 'Justin'), (79, 36, 598, 'CB', 'Elvedi'), (79, 36, 334, 'LCB', 'Muharemovic'),
    (79, 36, 330, 'RWB', 'Bogle'), (79, 36, 338, 'CM', 'Ampadu'), (79, 36, 345, 'CM', 'Tanaka'), (79, 36, 331, 'LWB', 'Gudmundsson'),
    (79, 36, 260, 'RW', 'Wilson'), (79, 36, 343, 'LW', 'James'), (79, 36, 346, 'CF', 'Calvert-Lewin'),
    -- Brentford 4-3-3
    (81, 23, 82, 'GK', 'Kelleher'), (81, 23, 88, 'RB', 'Kayode'), (81, 23, 87, 'RCB', 'Ajer'), (81, 23, 85, 'LCB', 'van den Berg'),
    (81, 23, 86, 'LB', 'Lewis-Potter'), (81, 23, 565, 'CM', 'Sangaré'), (81, 23, 98, 'DM', 'Janelt'), (81, 23, 97, 'CM', 'Jensen'),
    (81, 23, 95, 'RW', 'Ouattara'), (81, 23, 106, 'CF', 'Igor Thiago'), (81, 23, 94, 'LW', 'Schade'),
    -- Nott'm Forest 3-4-2-1
    (81, 37, 467, 'GK', 'Sels'), (81, 37, 474, 'RCB', 'Jair Cunha'), (81, 37, 471, 'CB', 'Milenkovic'), (81, 37, 472, 'LCB', 'Murillo'),
    (81, 37, 473, 'RWB', 'Aina'), (81, 37, 486, 'CM', 'McAtee'), (81, 37, 558, 'CM', 'Schlager'), (81, 37, 469, 'LWB', 'Williams'),
    (81, 37, 480, 'RW', 'Gibbs-White'), (81, 37, 483, 'LW', 'Ndoye'), (81, 37, 167, 'CF', 'Delap'),
    -- Coventry 4-2-3-1
    (83, 48, 110, 'GK', 'Rushworth'), (83, 48, 175, 'RB', 'van Ewijk'), (83, 48, 656, 'RCB', 'Mfuni'), (83, 48, 91, 'LCB', 'Pinnock'),
    (83, 48, 176, 'LB', 'Dasilva'), (83, 48, 575, 'DM', 'Yirenkyi'), (83, 48, 188, 'DM', 'Torp'), (83, 48, 185, 'RW', 'Sakamoto'),
    (83, 48, 183, 'AM', 'Rudoni'), (83, 48, 655, 'LW', 'Gboho'), (83, 48, 492, 'CF', 'Awoniyi'),
    -- Sunderland 4-2-3-1
    (83, 12, 529, 'GK', 'Roefs'), (83, 12, 534, 'RB', 'Hume'), (83, 12, 539, 'RCB', 'O''Nien'), (83, 12, 535, 'LCB', 'Alderete'),
    (83, 12, 536, 'LB', 'Reinildo Mandava'), (83, 12, 545, 'DM', 'Sadiki'), (83, 12, 544, 'DM', 'Xhaka'), (83, 12, 548, 'RW', 'Rigg'),
    (83, 12, 542, 'AM', 'Le Fée'), (83, 12, 551, 'LW', 'Angulo'), (83, 12, 552, 'CF', 'Brobbey'),
    -- Hull 5-4-1
    (84, 8, 572, 'GK', 'Tzolakis'), (84, 8, 280, 'RWB', 'Coyle'), (84, 8, 279, 'RCB', 'Ajayi'), (84, 8, 277, 'CB', 'Egan'),
    (84, 8, 586, 'LCB', 'Mendy'), (84, 8, 282, 'LWB', 'Giles'), (84, 8, 286, 'RW', 'Belloumi'), (84, 8, 240, 'CM', 'Iroegbunam'),
    (84, 8, 290, 'CM', 'Slater'), (84, 8, 576, 'LW', 'Stroud'), (84, 8, 295, 'CF', 'McBurnie'),
    -- Ipswich 4-2-3-1
    (84, 31, 300, 'GK', 'Walton'), (84, 31, 592, 'RB', 'Ouattara'), (84, 31, 304, 'RCB', 'O''Shea'), (84, 31, 259, 'LCB', 'Diop'),
    (84, 31, 305, 'LB', 'Davis'), (84, 31, 571, 'DM', 'Florentino'), (84, 31, 619, 'DM', 'Palacios'), (84, 31, 315, 'RW', 'Abdul Fatawu'),
    (84, 31, 591, 'AM', 'Enciso'), (84, 31, 318, 'LW', 'Philogene'), (84, 31, 316, 'CF', 'Emersonn'),
    -- Man City 4-3-3
    (86, 18, 384, 'GK', 'Donnarumma'), (86, 18, 389, 'RB', 'Matheus Nunes'), (86, 18, 393, 'RCB', 'Khusanov'), (86, 18, 390, 'LCB', 'Rúben Dias'),
    (86, 18, 391, 'LB', 'Gvardiol'), (86, 18, 616, 'CM', 'Bouaddi'), (86, 18, 481, 'DM', 'Anderson'), (86, 18, 155, 'CM', 'Fernández'),
    (86, 18, 237, 'RW', 'Ndiaye'), (86, 18, 411, 'CF', 'Haaland'), (86, 18, 400, 'LW', 'Doku'),
    -- Brighton 4-2-3-1
    (86, 25, 109, 'GK', 'Verbruggen'), (86, 25, 119, 'RB', 'Costinha'), (86, 25, 504, 'RCB', 'Vuskovic'), (86, 25, 116, 'LCB', 'Dunk'),
    (86, 25, 114, 'LB', 'Boscagli'), (86, 25, 124, 'DM', 'Groß'), (86, 25, 639, 'DM', 'Chema Andrés'), (86, 25, 127, 'RW', 'Gómez'),
    (86, 25, 129, 'AM', 'Ayari'), (86, 25, 115, 'LW', 'De Cuyper'), (86, 25, 138, 'CF', 'Kostoulas')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values
    (82, 20, '4-2-3-1'), (82, 5, '4-2-3-1'), (79, 30, '4-2-3-1'), (79, 36, '3-4-2-1'),
    (81, 23, '4-3-3'), (81, 37, '3-4-2-1'), (83, 48, '4-2-3-1'), (83, 12, '4-2-3-1'),
    (84, 8, '5-4-1'), (84, 31, '4-2-3-1'), (86, 18, '4-3-3'), (86, 25, '4-2-3-1')
  ) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

-- Positions seen that are clearly outside the player's usual line go in as
-- "also plays", rank 2 (CM/DM pivot swaps and CB sides not added).
insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, 2
  from (values
    (23, 86, 'LB'),    -- Lewis-Potter (FPL midfielder) at left-back
    (20, 40, 'LW'),    -- Rogers (listed CF) on the left
    (20, 156, 'CF'),   -- Pedro Neto (listed RW) up front
    (31, 592, 'RB'),   -- Ouattara (listed RWB) in a back four
    (25, 115, 'LW')    -- De Cuyper (FPL defender) on the left wing
  ) as v(team_id, fpl_player_id, role)
on conflict do nothing;
