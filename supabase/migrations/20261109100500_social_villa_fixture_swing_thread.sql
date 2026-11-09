-- International-break planning thread (Chris, 9 Nov 2026: replaces the
-- rejected week-ahead post #86; "I like the villa thread" with goals v xG
-- kept separate from assists v xA and no "luck").
-- Figures, read 9 Nov 2026 07:35:
--   model predicted goals (public.fixtures, season 13), Aston Villa GW11-15:
--   8.5 for, 5.7 against; GW6-10: 7.2 for, 8.1 against (biggest swing).
--   N.Jackson £7.1m, 30.1% owned, 44 pts GW6-10, 6 goals from 3.5 xG.
--   McGinn £5.4m, 3.4% owned, 2 goals from 3.2 xG, FPL corners order 1 and
--   penalties order 2, projected 19.1 pts GW11-15 (feed v6).
--   Liverpool GW11-15 net +2.3 (from -0.2); Spurs -0.5 (from -2.7);
--   Man City +3.4 (from +5.7) and Fulham -2.3 (from -0.3) get harder.
-- Goes at 11:00 UK today. Safe to re-run: only if the key is unused.
insert into public.social_post_candidates
  (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key, expires_at,
   validation_status, validation_errors, approval_status, approved_at, auto, hold_until, notified_at)
select 'fact', t.p1, t.p1, jsonb_build_array(t.p1, t.p2, t.p3),
       jsonb_build_object('kind', 'fixture_swing', 'season_id', 13, 'from_gw', 11, 'to_gw', 15, 'team', 'Aston Villa',
         'gf_next', 8.5, 'ga_next', 5.7, 'gf_prev', 7.2, 'ga_prev', 8.1),
       now(), 'fixture_swing:2026-11-09', timestamptz '2026-11-09 20:00:00+00',
       'passed', '[]', 'approved', now(), true, timestamptz '2026-11-09 11:00:00+00', now()
  from (select
    E'Planning transfers over the break? The fixture block that turns most in GW11-15 is Aston Villa''s: SUN (H), IPS (A), EVE (H), CRY (H), COV (A). We project 8.5 goals for and 5.7 against, after 7.2 and 8.1 in GW6-10.' p1,
    E'Jackson (£7.1m, 30% owned) has 44 pts in his last 5, with 6 goals from 3.5 xG: well above his chances.\n\nThe under-owned route in: McGinn, £5.4m, 3.4% owned. 2 goals from 3.2 xG, on corners and second on pens. We project 19.1 pts over GW11-15.' p2,
    E'Also turning your way: Liverpool (MUN, EVE, SUN, CHE, LEE) and Spurs. Getting harder: Man City and Fulham.' p3) t
 where not exists (select 1 from public.social_post_candidates x where x.dedupe_key = 'fixture_swing:2026-11-09');
