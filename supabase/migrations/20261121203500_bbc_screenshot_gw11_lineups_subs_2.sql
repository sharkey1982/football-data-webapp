-- GW11 line-ups and substitutions, second batch of Chris's BBC screenshots
-- (21 Nov 2026, 20:14 to 20:16), all played Sat 21 Nov:
--   Tottenham v Ipswich (108), Newcastle v Arsenal (107),
--   Coventry v Crystal Palace (103; Coventry's formation, plus the part of
--   Palace's list that was shown: four subs, no positions).
-- Keeper at the TOP: the left of the image is the team's right.
-- Every substitution checked against FPL live minutes. Palace's sub
-- coverage is left unmarked: the top of their list was cut off and FPL
-- shows a fifth change (Khalaili off, Canvot on) not in the screenshot.
-- Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Tottenham 4-2-3-1
    (108, 14, 496, 'GK', 'Kinský'), (108, 14, 499, 'RB', 'Pedro Porro'), (108, 14, 112, 'RCB', 'van Hecke'), (108, 14, 498, 'LCB', 'Senesi'),
    (108, 14, 506, 'LB', 'Udogie'), (108, 14, 519, 'DM', 'Gallagher'), (108, 14, 525, 'DM', 'Mateus Fernandes'), (108, 14, 512, 'RW', 'Kudus'),
    (108, 14, 515, 'AM', 'Maddison'), (108, 14, 601, 'LW', 'Williams-Barnett'), (108, 14, 526, 'CF', 'Solanke'),
    -- Ipswich 4-2-3-1
    (108, 31, 300, 'GK', 'Walton'), (108, 31, 308, 'RB', 'Furlong'), (108, 31, 259, 'RCB', 'Diop'), (108, 31, 304, 'LCB', 'O''Shea'),
    (108, 31, 305, 'LB', 'Davis'), (108, 31, 619, 'DM', 'E. Palacios'), (108, 31, 267, 'DM', 'Lukić'), (108, 31, 592, 'RW', 'Ouattara'),
    (108, 31, 591, 'AM', 'Enciso'), (108, 31, 562, 'LW', 'Maeda'), (108, 31, 640, 'CF', 'Flemming'),
    -- Newcastle 4-2-3-1
    (107, 17, 567, 'GK', 'Horníček'), (107, 17, 593, 'RB', 'Dedić'), (107, 17, 445, 'RCB', 'Thiaw'), (107, 17, 448, 'LCB', 'Burn'),
    (107, 17, 449, 'LB', 'Hall'), (107, 17, 462, 'DM', 'Steur'), (107, 17, 459, 'DM', 'Miley'), (107, 17, 457, 'RW', 'Murphy'),
    (107, 17, 460, 'AM', 'Willock'), (107, 17, 453, 'LW', 'Barnes'), (107, 17, 465, 'CF', 'Osula'),
    -- Arsenal 4-2-3-1
    (107, 1, 1, 'GK', 'Raya'), (107, 1, 5, 'RB', 'Timber'), (107, 1, 31, 'RCB', 'Konsa'), (107, 1, 4, 'LCB', 'Gabriel'),
    (107, 1, 8, 'LB', 'Calafiori'), (107, 1, 452, 'DM', 'Bruno Guimarães'), (107, 1, 13, 'DM', 'Rice'), (107, 1, 16, 'RW', 'Madueke'),
    (107, 1, 15, 'AM', 'Ødegaard'), (107, 1, 14, 'LW', 'Eze'), (107, 1, 26, 'CF', 'Havertz'),
    -- Coventry 4-2-3-1
    (103, 48, 110, 'GK', 'Rushworth'), (103, 48, 175, 'RB', 'van Ewijk'), (103, 48, 173, 'RCB', 'Thomas'), (103, 48, 91, 'LCB', 'Pinnock'),
    (103, 48, 656, 'LB', 'Mfuni'), (103, 48, 188, 'DM', 'Torp'), (103, 48, 184, 'DM', 'Grimes'), (103, 48, 185, 'RW', 'Sakamoto'),
    (103, 48, 183, 'AM', 'Rudoni'), (103, 48, 655, 'LW', 'Gboho'), (103, 48, 492, 'CF', 'Awoniyi')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (108, 14, '4-2-3-1'), (108, 31, '4-2-3-1'), (107, 17, '4-2-3-1'), (107, 1, '4-2-3-1'),
               (103, 48, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

insert into public.fixture_lineup_substitutions (fixture_id, team_id, player_off_fpl_id, player_on_fpl_id, minute, name_off, name_on, source_name)
values
  -- Tottenham (Sávio came on and was later replaced)
  (108, 14, 601, 403, 64, 'Williams-Barnett', 'Sávio', 'bbc_screenshot'),
  (108, 14, 515, 520, 64, 'Maddison', 'Bergvall', 'bbc_screenshot'),
  (108, 14, 526, 401, 64, 'Solanke', 'Omar Marmoush', 'bbc_screenshot'),
  (108, 14, 506, 502, 79, 'Udogie', 'A. Robertson', 'bbc_screenshot'),
  (108, 14, 403, 522, 90, 'Sávio', 'A. Gray', 'bbc_screenshot'),
  -- Ipswich
  (108, 31, 619, 571, 56, 'E. Palacios', 'Florentino', 'bbc_screenshot'),
  (108, 31, 562, 313, 56, 'Maeda', 'J. Clarke', 'bbc_screenshot'),
  (108, 31, 592, 315, 56, 'Ouattara', 'Fatawu', 'bbc_screenshot'),
  (108, 31, 640, 316, 74, 'Flemming', 'Emersonn', 'bbc_screenshot'),
  (108, 31, 305, 306, 83, 'Davis', 'Greaves', 'bbc_screenshot'),
  -- Newcastle
  (107, 17, 593, 450, 46, 'Dedić', 'Livramento', 'bbc_screenshot'),
  (107, 17, 462, 456, 46, 'Steur', 'J. Ramsey', 'bbc_screenshot'),
  (107, 17, 457, 454, 46, 'Murphy', 'Elanga', 'bbc_screenshot'),
  (107, 17, 460, 464, 83, 'Willock', 'Wissa', 'bbc_screenshot'),
  (107, 17, 449, 447, 92, 'Hall', 'Botman', 'bbc_screenshot'),
  -- Arsenal
  (107, 1, 1, 2, 70, 'Raya', 'Kepa', 'bbc_screenshot'),
  (107, 1, 452, 7, 70, 'Bruno Guimarães', 'Lewis-Skelly', 'bbc_screenshot'),
  (107, 1, 14, 557, 70, 'Eze', 'Tzolis', 'bbc_screenshot'),
  (107, 1, 15, 17, 94, 'Ødegaard', 'Merino', 'bbc_screenshot'),
  (107, 1, 26, 25, 94, 'Havertz', 'Gyökeres', 'bbc_screenshot'),
  -- Coventry
  (103, 48, 492, 599, 46, 'Awoniyi', 'Cherif', 'bbc_screenshot'),
  (103, 48, 655, 194, 70, 'Gboho', 'Thomas-Asante', 'bbc_screenshot'),
  (103, 48, 184, 104, 71, 'Grimes', 'Onyeka', 'bbc_screenshot'),
  (103, 48, 188, 584, 71, 'Torp', 'Hamer', 'bbc_screenshot'),
  -- Crystal Palace (the four shown)
  (103, 2, 644, 213, 73, 'Q. Timber', 'Lerma', 'bbc_screenshot'),
  (103, 2, 211, 42, 79, 'Yéremy Pino', 'Guessand', 'bbc_screenshot'),
  (103, 2, 222, 224, 79, 'Strand Larsen', 'Nketiah', 'bbc_screenshot'),
  (103, 2, 241, 647, 89, 'McNeil', 'Osorio', 'bbc_screenshot')
on conflict do nothing;

insert into public.fixture_lineup_sub_coverage (fixture_id, team_id, source_name, complete)
values (108, 14, 'bbc_screenshot', true), (108, 31, 'bbc_screenshot', true), (107, 17, 'bbc_screenshot', true),
       (107, 1, 'bbc_screenshot', true), (103, 48, 'bbc_screenshot', true)
on conflict do nothing;
