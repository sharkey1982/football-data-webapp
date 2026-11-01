-- Liverpool v Arsenal (85), GW9, from Chris's BBC screenshots of the official
-- team sheets at 16:01, before the 16:30 kick-off. Keeper at the TOP: the left
-- of the image is the team's right. Safe to re-run.
insert into public.fixture_lineup_positions (fixture_id, team_id, fpl_player_id, tactical_role, name_source, source_name)
select v.fixture_id, v.team_id, v.fpl_player_id, v.role, v.name, 'bbc_screenshot'
  from (values
    -- Liverpool 4-2-3-1
    (85, 15, 350, 'GK', 'Alisson Becker'), (85, 15, 579, 'RB', 'Araujo'), (85, 15, 362, 'RCB', 'Jacquet'), (85, 15, 356, 'LCB', 'van Dijk'),
    (85, 15, 358, 'LB', 'Kerkez'), (85, 15, 372, 'DM', 'Mac Allister'), (85, 15, 375, 'DM', 'Nyoni'), (85, 15, 627, 'RW', 'Barcola'),
    (85, 15, 366, 'AM', 'Wirtz'), (85, 15, 367, 'LW', 'Gakpo'), (85, 15, 379, 'CF', 'Isak'),
    -- Arsenal 4-2-3-1
    (85, 1, 1, 'GK', 'Raya'), (85, 1, 5, 'RB', 'Timber'), (85, 1, 31, 'RCB', 'Konsa'), (85, 1, 4, 'LCB', 'Gabriel Magalhães'),
    (85, 1, 8, 'LB', 'Calafiori'), (85, 1, 13, 'DM', 'Rice'), (85, 1, 452, 'DM', 'Bruno Guimarães'), (85, 1, 16, 'RW', 'Madueke'),
    (85, 1, 15, 'AM', 'Ødegaard'), (85, 1, 557, 'LW', 'Tzolis'), (85, 1, 26, 'CF', 'Havertz')
  ) as v(fixture_id, team_id, fpl_player_id, role, name)
on conflict do nothing;

insert into public.team_match_tactics (fixture_id, team_id, season_id, formation, source_name, confidence)
select v.fixture_id, v.team_id, f.season_id, v.formation, 'bbc_screenshot', 1
  from (values (85, 15, '4-2-3-1'), (85, 1, '4-2-3-1')) as v(fixture_id, team_id, formation)
  join public.fixtures f on f.fixture_id = v.fixture_id
on conflict (fixture_id, team_id, source_name) do nothing;

-- Team news on X before kick-off (Chris, 31 Oct: "You need to make the time
-- sensitive posts yourself"). FPL players owned by 10%+: Szoboszlai (13.5%,
-- flagged 50%) is not in Liverpool's XI; the flagged Calafiori (47.8%) and
-- Rice (11.8%), both 75%, start for Arsenal. Every other 10%+ player starts.
-- Only before kick-off, and only if no team_news post exists for this game.
insert into public.social_post_candidates
  (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key, expires_at,
   validation_status, validation_errors, approval_status, approved_at, auto, hold_until, notified_at)
select 'team_news', t.post, t.post, to_jsonb(array[t.post]),
       jsonb_build_object('kind', 'team_news_bbc', 'fixture_id', 85, 'source', 'official team sheets (BBC)',
         'not_starting', jsonb_build_array(jsonb_build_object('player', 'Szoboszlai', 'own', 13.5, 'chance', 50)),
         'flagged_starting', jsonb_build_array(jsonb_build_object('player', 'Calafiori', 'own', 47.8, 'chance', 75),
                                               jsonb_build_object('player', 'Rice', 'own', 11.8, 'chance', 75))),
       now(), 'team_news:liv-ars:2026-11-01', timestamptz '2026-11-01 16:30:00+00',
       'passed', '[]', 'approved', now(), true, now(), now()
  from (select E'Liverpool v Arsenal team news for FPL managers:\n\nSzoboszlai (Liverpool, 13% owned, flagged 50%) is not in the starting XI.\n\nCalafiori (48% owned) and Rice (12%), both flagged 75%, start for Arsenal.\n\nKick-off 16:30.' post) t
 where now() < timestamptz '2026-11-01 16:28:00+00'
   and not exists (select 1 from public.social_post_candidates x where x.dedupe_key = 'team_news:liv-ars:2026-11-01');
