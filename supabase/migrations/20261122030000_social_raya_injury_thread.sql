-- Raya injury thread (Chris, 22 Nov 2026 02:20: "raya was subbed off
-- injured yesterday ... people 1) need to find another keeper but also
-- 2) could use another slot for an arsenal player").
-- Figures, read from FPL 22 Nov 2026 02:30:
--   Raya £6.3m, 47.5% owned, status d, "Shoulder injury - 75% chance of
--   playing" (added 21 Nov 19:00 UTC); 69 minutes at Newcastle, Kepa on.
--   Verbruggen £4.7m 24.3%; Kinsky £4.4m 15.9%; Trafford £5.1m 56 pts.
--   Gabriel £8.1m 26.7%; Calafiori £5.9m 48.6%; Rice £7.5m 13.7%;
--   Ødegaard £6.7m 16.6%. Arsenal GW12-16: MCI (H), BRE (A), TOT (A),
--   BOU (H), MUN (H). GW12 deadline Fri 27 Nov 18:30 UK.
-- Goes at 08:30 UK today. FPL's own flag only: no claim beyond it.
-- Safe to re-run: only if the key is unused.
insert into public.social_post_candidates
  (post_type, text, generated_text, thread, source_data, snapshot_at, dedupe_key, expires_at,
   validation_status, validation_errors, approval_status, approved_at, auto, hold_until, notified_at)
select 'fact', t.p1, t.p1 || E'\n' || t.p2 || E'\n' || t.p3, jsonb_build_array(t.p1, t.p2, t.p3),
       jsonb_build_object('kind', 'injury_flag', 'season_id', 13, 'gw', 12, 'fpl_player_id', 1, 'player', 'Raya',
         'status', 'd', 'chance', 75, 'news', 'Shoulder injury - 75% chance of playing', 'own', 47.5, 'price', 6.3),
       now(), 'injury:raya:2026-11-22', timestamptz '2026-11-27 18:00:00+00',
       'passed', '[]', 'approved', now(), true, timestamptz '2026-11-22 08:30:00+00', now()
  from (select
    E'Raya (47.5% owned) came off after 69 minutes at Newcastle. FPL now has him at 75% with a shoulder injury.\n\nArsenal host Man City in GW12 (deadline Fri 27 Nov, 18:30). Two ways to play it 🧵' p1,
    E'1) Just swap the keeper. The most-owned options: Verbruggen £4.7m (24% owned) and Kinsky £4.4m. Trafford £5.1m has 56 pts, 5 fewer than Raya''s 61.\n\nAt 75% there''s a week of news to come, so no rush before the press conferences.' p2,
    E'2) Use the Arsenal slot. Raya out frees £6.3m and one of your three Arsenal places.\n\nCalafiori £5.9m (49%) and Gabriel £8.1m (27%) are already in most teams. The less-owned ways in: Rice £7.5m (14%) and Ødegaard £6.7m (17%).\n\nNext 5: MCI (H), BRE (A), TOT (A), BOU (H), MUN (H).' p3) t
 where not exists (select 1 from public.social_post_candidates x where x.dedupe_key = 'injury:raya:2026-11-22');
