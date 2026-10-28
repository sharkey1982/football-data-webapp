-- Chris deleted the 28 Oct daily market thread (Venezia v Inter gap) on X.
-- Tomorrow's daily market post reviews "the thread we posted" yesterday,
-- found by dedupe_key daily_market:<yesterday>. Rename this one's key so it is
-- not reviewed, and note the deletion. Safe to re-run.
update public.social_post_candidates
   set dedupe_key = 'daily_market:2026-10-28:deleted-on-x',
       source_data = source_data || jsonb_build_object('deleted_on_x', true, 'deleted_on_x_at', '2026-10-28T16:42:00Z'),
       updated_at = now()
 where candidate_id = 40 and dedupe_key = 'daily_market:2026-10-28';
