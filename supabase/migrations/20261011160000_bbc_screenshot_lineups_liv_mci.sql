-- GW6 Liverpool v Man City (fixture 58) from Chris's BBC screenshots
-- (11 Oct 2026). Keeper at the TOP: the left of the image is the team's
-- right. Koumas led the line with Isak and Ekitike out (an admin had
-- already ranked him ahead of Danns). Admin-set rows untouched; one-off
-- positions go in as "also plays". Safe to re-run.

insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    (58, 15, 350, 'GK', 'Alisson Becker'), (58, 15, 579, 'RB', 'Araujo'), (58, 15, 362, 'RCB', 'Jacquet'), (58, 15, 356, 'LCB', 'van Dijk'),
    (58, 15, 358, 'LB', 'Kerkez'), (58, 15, 371, 'DM', 'Gravenberch'), (58, 15, 372, 'DM', 'Mac Allister'), (58, 15, 627, 'RW', 'Barcola'),
    (58, 15, 366, 'AM', 'Wirtz'), (58, 15, 377, 'LW', 'Munoz'), (58, 15, 381, 'CF', 'Koumas'),
    (58, 18, 384, 'GK', 'Donnarumma'), (58, 18, 389, 'RB', 'Matheus Nunes'), (58, 18, 390, 'RCB', 'Ruben Dias'), (58, 18, 388, 'LCB', 'Guehi'),
    (58, 18, 387, 'LB', 'O''Reilly'), (58, 18, 481, 'DM', 'Anderson'), (58, 18, 155, 'DM', 'Fernandez'), (58, 18, 397, 'RW', 'Semenyo'),
    (58, 18, 399, 'AM', 'Cherki'), (58, 18, 237, 'LW', 'Ndiaye'), (58, 18, 411, 'CF', 'Haaland')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (58, 15, '4-2-3-1'), (58, 18, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

update public.team_player_tactical_defaults d
   set tactical_role = 'LB', source_name = 'bbc_screenshot', updated_at = now()
 where d.season_id = public.fpl_current_season_id() and d.team_id = 18 and d.fpl_player_id = 387   -- O'Reilly, a defender seeded in midfield
   and d.tactical_role = 'CM' and d.source_name is distinct from 'manual';

insert into public.team_player_other_positions (season_id, team_id, fpl_player_id, tactical_role, depth_rank)
select public.fpl_current_season_id(), v.team_id, v.fpl_player_id, v.role, v.rank
  from (values
    (15, 627, 'RW', 2),   -- Barcola
    (15, 377, 'LW', 2),   -- Munoz
    (18, 237, 'LW', 2)    -- Ndiaye (admin has him RW)
  ) as v(team_id, fpl_player_id, role, rank)
on conflict do nothing;

insert into public.model_change_log (changed_at, area, title, reason, detail, version_from, version_to, reference)
select '2026-10-11', 'data',
  'FPL: Liverpool v Man City line-ups from BBC screenshots',
  'Chris supplied BBC line-up screenshots for Liverpool v Man City.',
  '22 rows in fixture_lineup_positions, 2 formations, O''Reilly moved from midfield to left-back, 3 "also plays" added.',
  'leaguewide_v6', 'leaguewide_v6',
  'migration 20261011160000'
where not exists (select 1 from public.model_change_log where reference = 'migration 20261011160000');
