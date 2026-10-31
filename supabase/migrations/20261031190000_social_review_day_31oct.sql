-- Review of the day, 31 Oct 2026 (Chris, 15:23: reference the City line-up
-- changes in a review of the day, "Did you get caught out…?"; 18:43: "You need
-- to make the time sensitive posts yourself"). A two-post thread on the
-- 15:00 games, figures from FPL live data at 17:05 (all games finished,
-- unchanged at 18:45). Approved here so the worker posts it on its next tick.
-- Safe to re-run: only if the key is unused and before it expires.
insert into public.social_post_candidates
  (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key, expires_at,
   validation_status, validation_errors, approval_status, approved_at, auto, hold_until, notified_at)
select 'lineup_vs_model',
       array_to_string(t.posts, E'\n\n'), array_to_string(t.posts, E'\n\n'), to_jsonb(t.posts),
       jsonb_build_object('kind', 'review_of_the_day', 'date', '2026-10-31', 'season_id', 13, 'gw', 9,
         'players', jsonb_build_object('Cherki', jsonb_build_object('own', 37.4, 'minutes', 35, 'points', 1),
                                       'Guehi', jsonb_build_object('own', 16.6, 'minutes', 0, 'points', 0),
                                       'Haaland', jsonb_build_object('own', 78.8, 'minutes', 90, 'points', 2),
                                       'Costinha', jsonb_build_object('start_probability', 0.02, 'minutes', 90, 'points', 8),
                                       'Palestra', jsonb_build_object('start_probability', 0.04, 'minutes', 73, 'points', 6)),
         'result', 'Man City 0-1 Brighton'),
       now(), 'review_of_the_day:2026-10-31', timestamptz '2026-10-31 23:00:00+00',
       'passed', '[]', 'approved', now(), true, now(), now()
  from (select array[
    E'Man City 0-1 Brighton.\n\nCherki (37% owned in FPL) started on the bench: 35 minutes, 1 point.\nGuéhi (17%) didn''t get on at all.\nHaaland (79%) managed 2.\n\nDid the City team sheet catch you out?',
    E'Line-ups our model didn''t see coming today:\n\nCostinha started for Brighton. We gave him a 2% chance. He played 90 minutes in a clean sheet at the Etihad: 8 points.\nPalestra started for Chelsea at 4%: 6 points.'
  ] posts) t
 where now() < timestamptz '2026-10-31 22:45:00+00'
   and not exists (select 1 from public.social_post_candidates x where x.dedupe_key = 'review_of_the_day:2026-10-31');
