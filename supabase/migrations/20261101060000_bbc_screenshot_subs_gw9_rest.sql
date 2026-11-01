-- GW9 substitutions from Chris's BBC screenshots (1 Nov 2026, 04:03-04:05):
-- Aston Villa v Fulham (80), Tottenham v Crystal Palace (88), Man City v
-- Brighton (86), Hull v Ipswich (84), Coventry v Sunderland (83), Brentford v
-- Nott'm Forest (81). Every one checked against FPL live minutes (the player
-- going off played about the minute shown, the one coming on the rest). Every
-- side's full list of starters was visible, so coverage is complete (Man City
-- and Sunderland made four changes, Coventry three; Palace's Mateta was sent
-- off at 13'). Safe to re-run.
insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  -- Aston Villa v Fulham
  (80, 10, 618, 631, 66, 'Goretzka', 'Mbaye', 'bbc_screenshot'),
  (80, 10, 53, 54, 66, 'Manzambi', 'João Gomes', 'bbc_screenshot'),
  (80, 10, 52, 41, 66, 'Alysson', 'Buendía', 'bbc_screenshot'),
  (80, 10, 47, 46, 79, 'Kamara', 'Barkley', 'bbc_screenshot'),
  (80, 10, 45, 160, 87, 'McGinn', 'Garnacho', 'bbc_screenshot'),
  (80, 32, 261, 266, 75, 'Iwobi', 'Cairney', 'bbc_screenshot'),
  (80, 32, 268, 570, 79, 'King', 'César Palacios', 'bbc_screenshot'),
  (80, 32, 264, 256, 79, 'Bobb', 'Tete', 'bbc_screenshot'),
  (80, 32, 258, 635, 87, 'Castagne', 'Larsson', 'bbc_screenshot'),
  (80, 32, 569, 271, 87, 'Gonzalo García', 'Rodrigo Muniz', 'bbc_screenshot'),
  -- Tottenham v Crystal Palace
  (88, 14, 522, 499, 46, 'Gray', 'Pedro Porro', 'bbc_screenshot'),
  (88, 14, 526, 519, 66, 'Solanke', 'Gallagher', 'bbc_screenshot'),
  (88, 14, 502, 506, 77, 'Robertson', 'Udogie', 'bbc_screenshot'),
  (88, 14, 401, 521, 77, 'Omar Marmoush', 'Kulusevski', 'bbc_screenshot'),
  (88, 14, 514, 601, 88, 'Tel', 'Williams-Barnett', 'bbc_screenshot'),
  (88, 2, 207, 588, 60, 'Óscar Mingueza', 'Khalaili', 'bbc_screenshot'),
  (88, 2, 211, 224, 60, 'Yéremy Pino', 'Nketiah', 'bbc_screenshot'),
  (88, 2, 241, 647, 77, 'McNeil', 'Osorio', 'bbc_screenshot'),
  (88, 2, 214, 212, 88, 'Kamada', 'Hughes', 'bbc_screenshot'),
  (88, 2, 210, 213, 88, 'Wharton', 'Lerma', 'bbc_screenshot'),
  -- Man City v Brighton
  (86, 18, 616, 399, 55, 'Bouaddi', 'Cherki', 'bbc_screenshot'),
  (86, 18, 155, 387, 64, 'E. Fernández', 'O''Reilly', 'bbc_screenshot'),
  (86, 18, 391, 398, 79, 'Gvardiol', 'Foden', 'bbc_screenshot'),
  (86, 18, 237, 628, 79, 'Ndiaye', 'Allan', 'bbc_screenshot'),
  (86, 25, 114, 614, 64, 'Boscagli', 'Hadjam', 'bbc_screenshot'),
  (86, 25, 639, 130, 64, 'Chema Andrés', 'Wieffer', 'bbc_screenshot'),
  (86, 25, 115, 605, 72, 'De Cuyper', 'Yalcouyé', 'bbc_screenshot'),
  (86, 25, 138, 123, 72, 'Kostoulas', 'Hinshelwood', 'bbc_screenshot'),
  (86, 25, 127, 125, 84, 'Gómez', 'Rutter', 'bbc_screenshot'),
  -- Hull v Ipswich
  (84, 8, 277, 289, 46, 'Egan', 'Crooks', 'bbc_screenshot'),
  (84, 8, 576, 617, 60, 'Stroud', 'Cho', 'bbc_screenshot'),
  (84, 8, 280, 638, 77, 'Coyle', 'Norton-Cuffy', 'bbc_screenshot'),
  (84, 8, 240, 563, 77, 'Iroegbunam', 'Morita', 'bbc_screenshot'),
  (84, 8, 290, 340, 90, 'Slater', 'Gelhardt', 'bbc_screenshot'),
  (84, 31, 318, 313, 69, 'Philogene', 'Clarke', 'bbc_screenshot'),
  (84, 31, 571, 310, 70, 'Florentino', 'Matusiwa', 'bbc_screenshot'),
  (84, 31, 315, 562, 70, 'Fatawu', 'Maeda', 'bbc_screenshot'),
  (84, 31, 316, 640, 77, 'Emersonn', 'Flemming', 'bbc_screenshot'),
  (84, 31, 591, 320, 95, 'Enciso', 'Akpom', 'bbc_screenshot'),
  -- Coventry v Sunderland
  (83, 48, 655, 194, 72, 'Gboho', 'Thomas-Asante', 'bbc_screenshot'),
  (83, 48, 492, 599, 72, 'Awoniyi', 'Cherif', 'bbc_screenshot'),
  (83, 48, 188, 184, 83, 'Torp', 'Grimes', 'bbc_screenshot'),
  (83, 12, 551, 553, 57, 'Angulo', 'Isidor', 'bbc_screenshot'),
  (83, 12, 548, 549, 57, 'Rigg', 'Talbi', 'bbc_screenshot'),
  (83, 12, 534, 541, 75, 'Hume', 'Meunier', 'bbc_screenshot'),
  (83, 12, 545, 646, 75, 'Sadiki', 'M. Fofana', 'bbc_screenshot'),
  -- Brentford v Nott'm Forest
  (81, 23, 97, 96, 62, 'Jensen', 'Damsgaard', 'bbc_screenshot'),
  (81, 23, 565, 90, 62, 'Sangaré', 'Hickey', 'bbc_screenshot'),
  (81, 23, 95, 105, 72, 'D. Ouattara', 'Anthony', 'bbc_screenshot'),
  (81, 23, 94, 108, 84, 'Schade', 'C. Wilson', 'bbc_screenshot'),
  (81, 37, 558, 489, 46, 'Schlager', 'Yates', 'bbc_screenshot'),
  (81, 37, 473, 201, 46, 'Aina', 'Muñoz', 'bbc_screenshot'),
  (81, 37, 483, 493, 65, 'Ndoye', 'Kalimuendo', 'bbc_screenshot'),
  (81, 37, 167, 490, 65, 'Delap', 'Wood', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (80, 10, 'bbc_screenshot', true), (80, 32, 'bbc_screenshot', true),
       (88, 14, 'bbc_screenshot', true), (88, 2, 'bbc_screenshot', true),
       (86, 18, 'bbc_screenshot', true), (86, 25, 'bbc_screenshot', true),
       (84, 8, 'bbc_screenshot', true), (84, 31, 'bbc_screenshot', true),
       (83, 48, 'bbc_screenshot', true), (83, 12, 'bbc_screenshot', true),
       (81, 23, 'bbc_screenshot', true), (81, 37, 'bbc_screenshot', true)
on conflict do nothing;
