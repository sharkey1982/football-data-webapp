-- N.Jackson's record GW9 (Chris, 31 Oct 2026, 18:43: "You need to make the
-- time sensitive posts yourself"). 2,370,904 transfers in is FPL's own figure
-- (@OfficialFPL); the highest in our records (2021/22 on) was Ronaldo's
-- 2,104,464 in GW4 2021/22. GW9 from FPL live data at 21:58: 90 minutes, a
-- goal v Fulham, 9 points (bonus provisional); our model projected 5.1.
-- Today's 3-post cap is used, so it goes at 08:00 tomorrow. A check before
-- then holds it if his points change when bonus is confirmed.
-- Safe to re-run: only if the key is unused.
insert into public.social_post_candidates
  (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key, expires_at,
   validation_status, validation_errors, approval_status, approved_at, auto, hold_until, notified_at)
select 'lineup_vs_model', t.post, t.post, to_jsonb(array[t.post]),
       jsonb_build_object('kind', 'transfer_record', 'season_id', 13, 'gw', 9, 'player', 'N.Jackson',
         'transfers_in', 2370904, 'source', '@OfficialFPL', 'previous_high', jsonb_build_object('player', 'Ronaldo', 'transfers_in', 2104464, 'season', '2021/22', 'gw', 4),
         'minutes', 90, 'goals', 1, 'points', 9, 'projected', 5.1),
       now(), 'jackson_record:2026-10-31', timestamptz '2026-11-01 12:00:00+00',
       'passed', '[]', 'approved', now(), true, timestamptz '2026-11-01 08:00:00+00', now()
  from (select E'N.Jackson: 2,370,904 FPL transfers in for GW9, a record per @OfficialFPL. The highest in our records since 2021/22 was Ronaldo''s 2,104,464.\n\nHe repaid them: 90 minutes and a goal v Fulham, 9 points. Our model had him at 5.1.\n\nDid you jump on?' post) t
 where not exists (select 1 from public.social_post_candidates x where x.dedupe_key = 'jackson_record:2026-10-31');
